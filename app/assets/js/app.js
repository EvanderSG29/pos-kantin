import { logoutUser, restoreSession } from "./auth.js";
import { api } from "./api.js";
import { renderNavbar } from "./components/navbar.js";
import { renderSidebar } from "./components/sidebar.js";
import { mountTopbarSyncStatus } from "./components/sync-status.js";
import { showToast } from "./components/toast.js";
import {
  attachShellRouter,
  getCurrentRoute,
  goTo,
  registerShellNavigation,
  resolveRoute,
  routeForRole,
} from "./router.js";
import { escapeHtml, isAbortError } from "./utils.js";

const METRIC_ACCENTS = ["primary", "success", "info", "warning", "danger", "secondary"];
const METRIC_ICONS = [
  "fa-receipt",
  "fa-wallet",
  "fa-boxes",
  "fa-users",
  "fa-chart-line",
  "fa-clipboard-list",
];

const DEFAULT_FAVICON_HREF = "./assets/favicon.svg";
const BUSY_FAVICON_FRAMES = [0, 90, 180, 270].map((rotation) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="#4e73df" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="8" />
      <path d="M32 16a16 16 0 0 1 14.78 9.88" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-width="8" transform="rotate(${rotation} 32 32)" />
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
});

const shellState = {
  session: null,
  currentRoute: null,
  currentModule: null,
  currentPageController: null,
  navigationController: null,
  navigationId: 0,
  templateCache: new Map(),
  chromeReady: false,
  topbarSyncCleanup: null,
};

const activeBusyTokens = new Map();

let faviconTimer = 0;
let faviconFrameIndex = 0;

function getMainLoadingOverlay() {
  return document.querySelector("#app-main-loading");
}

function getMainLoadingText() {
  return document.querySelector("#app-main-loading-text");
}

function getFaviconLink() {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = DEFAULT_FAVICON_HREF;
    document.head.append(link);
  }

  if (!link.dataset.idleHref) {
    link.dataset.idleHref = link.getAttribute("href") || DEFAULT_FAVICON_HREF;
  }

  return link;
}

function startFaviconAnimation() {
  const favicon = getFaviconLink();
  faviconFrameIndex = 0;
  favicon.href = BUSY_FAVICON_FRAMES[faviconFrameIndex];

  if (faviconTimer) return;

  faviconTimer = window.setInterval(() => {
    faviconFrameIndex = (faviconFrameIndex + 1) % BUSY_FAVICON_FRAMES.length;
    favicon.href = BUSY_FAVICON_FRAMES[faviconFrameIndex];
  }, 160);
}

function stopFaviconAnimation() {
  const favicon = getFaviconLink();
  window.clearInterval(faviconTimer);
  faviconTimer = 0;
  faviconFrameIndex = 0;
  favicon.href = favicon.dataset.idleHref || DEFAULT_FAVICON_HREF;
}

function syncBusyUi() {
  const overlay = getMainLoadingOverlay();
  const overlayText = getMainLoadingText();
  const pageMain = document.querySelector("#app-main");
  const isBusy = activeBusyTokens.size > 0;
  const busyMessages = [...activeBusyTokens.values()];
  const currentMessage = busyMessages[busyMessages.length - 1] || "Memuat konten...";

  if (pageMain) {
    pageMain.setAttribute("aria-busy", String(isBusy));
  }

  if (overlay) {
    overlay.hidden = !isBusy;
  }

  if (overlayText) {
    overlayText.textContent = currentMessage;
  }

  if (isBusy) {
    startFaviconAnimation();
  } else {
    stopFaviconAnimation();
  }
}

export function beginGlobalBusy(message = "Memuat konten...") {
  const token = Symbol("pos-busy");
  activeBusyTokens.set(token, message);
  syncBusyUi();

  return () => {
    if (!activeBusyTokens.delete(token)) return;
    syncBusyUi();
  };
}

function createPageBusyController(signal) {
  const releases = new Set();

  const clearAll = () => {
    releases.forEach((release) => release());
    releases.clear();
  };

  signal.addEventListener("abort", clearAll, { once: true });

  return (isBusy, message) => {
    if (!isBusy) return () => {};

    const releaseGlobalBusy = beginGlobalBusy(message);
    let released = false;

    const release = () => {
      if (released) return;
      released = true;
      releases.delete(release);
      releaseGlobalBusy();
    };

    releases.add(release);

    if (signal.aborted) {
      release();
    }

    return release;
  };
}

function cacheCurrentTemplate(route) {
  const template = document.querySelector("#page-template");
  if (!template || template.dataset.pageKey !== route.pageKey) return;

  shellState.templateCache.set(route.key, {
    html: template.innerHTML.trim(),
    title: template.dataset.pageTitle || route.title,
  });
}

async function loadRouteTemplate(route, { signal, preferInline = false } = {}) {
  if (preferInline) {
    cacheCurrentTemplate(route);
  }

  const cached = shellState.templateCache.get(route.key);
  if (cached) return cached;

  const response = await fetch(route.href, { signal });
  if (!response.ok) {
    throw new Error(`Gagal memuat halaman ${route.title}.`);
  }

  const html = await response.text();
  if (signal?.aborted) {
    throw new DOMException("Navigation aborted.", "AbortError");
  }

  const documentFragment = new DOMParser().parseFromString(html, "text/html");
  const template = documentFragment.querySelector("#page-template");
  if (!template) {
    throw new Error(`Template untuk ${route.title} tidak ditemukan.`);
  }

  const payload = {
    html: template.innerHTML.trim(),
    title: template.dataset.pageTitle || documentFragment.title || route.title,
  };

  shellState.templateCache.set(route.key, payload);
  return payload;
}

function closeUserMenu() {
  const toggle = document.querySelector("#userDropdownToggle");
  const menu = document.querySelector("#userDropdownMenu");
  if (!toggle || !menu) return;

  toggle.setAttribute("aria-expanded", "false");
  menu.hidden = true;
}

function setUserMenuOpen(isOpen) {
  const toggle = document.querySelector("#userDropdownToggle");
  const menu = document.querySelector("#userDropdownMenu");
  if (!toggle || !menu) return;

  toggle.setAttribute("aria-expanded", String(isOpen));
  menu.hidden = !isOpen;
}

function closeMobileSidebar() {
  document.body.classList.remove("pos-mobile-sidebar-open");
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767.98px)").matches;
}

function syncResponsiveShell() {
  if (!isMobileViewport()) {
    closeMobileSidebar();
  }
}

function syncToastTopbarOffset() {
  const root = document.documentElement;

  if (!document.body.classList.contains("pos-shell-page")) {
    root.style.removeProperty("--pos-toast-topbar-offset");
    return;
  }

  const topbar = document.querySelector("#app-topbar");
  const topbarHeight = Math.ceil(topbar?.getBoundingClientRect?.().height || 0);

  if (topbarHeight > 0) {
    root.style.setProperty("--pos-toast-topbar-offset", `${topbarHeight}px`);
    return;
  }

  root.style.removeProperty("--pos-toast-topbar-offset");
}

function syncShellLayout() {
  syncResponsiveShell();
  syncToastTopbarOffset();
}

function updateScrollButton() {
  const scrollButton = document.querySelector("#scroll-to-top");
  if (!scrollButton) return;

  scrollButton.hidden = window.scrollY < 160;
}

function bindChromeEvents() {
  if (shellState.chromeReady) return;

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("#userDropdownToggle");
    if (toggle) {
      event.preventDefault();
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";
      setUserMenuOpen(!isExpanded);
      return;
    }

    if (!event.target.closest(".pos-user-menu")) {
      closeUserMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeUserMenu();
      closeMobileSidebar();
    }
  });

  document.addEventListener("click", (event) => {
    const sidebarToggle = event.target.closest("#sidebarToggle, #sidebarToggleTop");
    if (!sidebarToggle) return;

    event.preventDefault();
    closeUserMenu();

    if (isMobileViewport()) {
      document.body.classList.toggle("pos-mobile-sidebar-open");
      return;
    }

    document.body.classList.toggle("pos-sidebar-collapsed");
  });

  document.addEventListener("click", (event) => {
    const logoutButton = event.target.closest("#logout-button");
    if (!logoutButton) return;

    event.preventDefault();
    void handleLogout();
  });

  document.addEventListener("click", (event) => {
    const saveLoginButton = event.target.closest("#save-login-button");
    if (!saveLoginButton) return;

    event.preventDefault();
    closeUserMenu();
    void handleSaveCurrentLogin();
  });

  document.addEventListener("click", (event) => {
    const removeSavedLoginButton = event.target.closest("#remove-saved-login-button");
    if (!removeSavedLoginButton) return;

    event.preventDefault();
    closeUserMenu();
    void handleRemoveSavedLogin();
  });

  document.addEventListener("click", (event) => {
    const scrollButton = event.target.closest("#scroll-to-top");
    if (!scrollButton) return;

    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("resize", syncShellLayout, { passive: true });
  window.addEventListener("scroll", updateScrollButton, { passive: true });

  shellState.chromeReady = true;
}

async function handleLogout() {
  const finishBusy = beginGlobalBusy("Mengakhiri sesi...");

  try {
    shellState.topbarSyncCleanup?.();
    shellState.topbarSyncCleanup = null;
    await logoutUser();
    await goTo("login", { replace: true, forceReload: true, trigger: "logout" });
  } finally {
    finishBusy();
  }
}

async function syncSavedLoginMenuState(session = shellState.session) {
  const saveButton = document.querySelector("#save-login-button");
  const removeButton = document.querySelector("#remove-saved-login-button");
  if (!saveButton || !removeButton || !session?.user) return;

  try {
    const response = await api.listSavedProfiles();
    const hasSavedProfile = (response.data.items || []).some((profile) => profile.userId === session.user.id);
    saveButton.hidden = hasSavedProfile;
    removeButton.hidden = !hasSavedProfile;
  } catch {
    saveButton.hidden = false;
    removeButton.hidden = true;
  }
}

async function handleSaveCurrentLogin() {
  if (!shellState.session?.user) return;
  const finishBusy = beginGlobalBusy("Menyimpan info login...");

  try {
    await api.saveCurrentLogin(shellState.session.token);
    await syncSavedLoginMenuState();
    showToast("Info login perangkat berhasil disimpan.", "success");
  } catch (error) {
    showToast(error.message || "Gagal menyimpan info login.", "error");
  } finally {
    finishBusy();
  }
}

async function handleRemoveSavedLogin() {
  if (!shellState.session?.user) return;
  const finishBusy = beginGlobalBusy("Menghapus info login...");

  try {
    await api.removeSavedProfile(shellState.session.user.id, shellState.session.token);
    await syncSavedLoginMenuState();
    showToast("Info login perangkat berhasil dihapus.", "success");
  } catch (error) {
    showToast(error.message || "Gagal menghapus info login.", "error");
  } finally {
    finishBusy();
  }
}

function renderShellChrome(session, route) {
  const sidebar = document.querySelector("#app-sidebar");
  const topbar = document.querySelector("#app-topbar");

  if (sidebar && !sidebar.innerHTML.trim()) {
    sidebar.innerHTML = renderSidebar({ currentPage: route.pageKey, user: session.user });
  }

  if (topbar && !topbar.innerHTML.trim()) {
    topbar.innerHTML = renderNavbar({ title: route.title, session });
  }

  if (!shellState.topbarSyncCleanup) {
    shellState.topbarSyncCleanup = mountTopbarSyncStatus(document.querySelector("#topbar-sync-status"));
  }

  bindChromeEvents();
  void syncSavedLoginMenuState(session);
  syncShellLayout();
  updateScrollButton();
}

function syncChromeState(route) {
  document.title = `${route.title} | POS Kantin`;
  document.querySelector("#topbar-page-title")?.replaceChildren(document.createTextNode(route.title));
  syncToastTopbarOffset();

  const availableKeys = new Set(
    [...document.querySelectorAll("[data-route-key]")].map((link) => link.dataset.routeKey),
  );
  const activeKey = availableKeys.has(route.pageKey)
    ? route.pageKey
    : route.pageKey === "petugas" && shellState.session?.user.role === "admin"
      ? "admin"
      : route.pageKey;

  document.querySelectorAll("[data-route-key]").forEach((link) => {
    const isActive = link.dataset.routeKey === activeKey;
    link.classList.toggle("active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");

    const listItem = link.closest(".nav-item");
    listItem?.classList.toggle("active", isActive);
  });

  closeUserMenu();
  closeMobileSidebar();
}

function abortCurrentPage() {
  shellState.navigationController?.abort();
  shellState.navigationController = null;

  shellState.currentPageController?.abort();
  shellState.currentPageController = null;

  const dispose = shellState.currentModule?.disposePage;
  if (typeof dispose === "function") {
    try {
      dispose();
    } catch (error) {
      // Ignore teardown errors from previous page instances.
    }
  }

  shellState.currentModule = null;
}

function renderRouteTemplate(templatePayload) {
  const pageSlot = document.querySelector("#app-page-slot");
  if (!pageSlot) {
    throw new Error("Slot halaman utama tidak ditemukan.");
  }

  pageSlot.innerHTML = templatePayload.html;
}

function updateHistory(route, historyMode) {
  const state = { routeKey: route.key };

  if (historyMode === "replace") {
    window.history.replaceState(state, "", route.path);
    return;
  }

  if (historyMode === "push") {
    window.history.pushState(state, "", route.path);
  }
}

async function navigateToRoute(route, options = {}) {
  if (!route?.isAppRoute) {
    return goTo(route?.href || "./login.html", {
      replace: options.history === "replace",
      forceReload: true,
    });
  }

  if (!shellState.session?.user) {
    return goTo("login", { replace: true, forceReload: true, trigger: "guard" });
  }

  if (route.roles?.length && !route.roles.includes(shellState.session.user.role)) {
    const fallbackRoute = resolveRoute(routeForRole(shellState.session.user.role));
    return navigateToRoute(fallbackRoute, {
      history: "replace",
      trigger: "guard",
    });
  }

  if (shellState.currentRoute?.key === route.key && options.trigger !== "popstate" && options.trigger !== "boot") {
    closeUserMenu();
    closeMobileSidebar();
    return;
  }

  const navigationId = shellState.navigationId + 1;
  shellState.navigationId = navigationId;

  abortCurrentPage();

  const navigationController = new AbortController();
  shellState.navigationController = navigationController;

  const finishNavigationBusy = beginGlobalBusy(
    options.trigger === "boot" ? "Menyiapkan halaman..." : "Memuat halaman...",
  );

  try {
    const templatePayload = await loadRouteTemplate(route, {
      signal: navigationController.signal,
      preferInline: Boolean(options.preferInline),
    });

    if (navigationController.signal.aborted || navigationId !== shellState.navigationId) return;

    renderShellChrome(shellState.session, route);
    syncChromeState(route);
    renderRouteTemplate(templatePayload);
    updateHistory(route, options.history);
    window.scrollTo({ top: 0, behavior: "auto" });

    const module = await import(route.modulePath);
    if (navigationController.signal.aborted || navigationId !== shellState.navigationId) return;

    const pageController = new AbortController();
    shellState.currentPageController = pageController;
    shellState.currentModule = module;
    shellState.currentRoute = route;

    const initPage = typeof module.initPage === "function" ? module.initPage : null;
    if (initPage) {
      await initPage({
        session: shellState.session,
        pageKey: route.pageKey,
        setPageBusy: createPageBusyController(pageController.signal),
        signal: pageController.signal,
      });
    }
  } catch (error) {
    if (isAbortError(error)) return;

    showToast(error.message || "Gagal memuat halaman.", "error");
  } finally {
    if (shellState.navigationController === navigationController) {
      shellState.navigationController = null;
    }

    finishNavigationBusy();
  }
}

async function bootAppShell() {
  const currentRoute = getCurrentRoute();
  const shellRoot = document.querySelector("#app-shell");

  if (!shellRoot || !currentRoute?.isAppRoute) return;

  getFaviconLink();
  registerShellNavigation(navigateToRoute);
  attachShellRouter();
  cacheCurrentTemplate(currentRoute);

  const finishSessionBusy = beginGlobalBusy("Memulihkan sesi...");

  try {
    shellState.session = await restoreSession();
  } finally {
    finishSessionBusy();
  }

  if (!shellState.session?.user) {
    await goTo("login", { replace: true, forceReload: true, trigger: "guard" });
    return;
  }

  renderShellChrome(shellState.session, currentRoute);

  await navigateToRoute(currentRoute, {
    history: "replace",
    trigger: "boot",
    preferInline: true,
  });
}

export function renderMetricCards(container, metrics) {
  if (!container) return;

  container.classList.add("row");
  container.innerHTML = metrics
    .map((metric, index) => {
      const accent = metric.accent ?? METRIC_ACCENTS[index % METRIC_ACCENTS.length];
      const icon = metric.icon ?? METRIC_ICONS[index % METRIC_ICONS.length];

      return `
        <div class="col-xl-3 col-md-6 mb-4">
          <article class="card border-left-${accent} shadow h-100 py-2 pos-metric-card">
            <div class="card-body">
              <div class="row no-gutters align-items-center">
                <div class="col mr-2">
                  <div class="text-xs font-weight-bold text-${accent} text-uppercase mb-1">${escapeHtml(metric.label)}</div>
                  <div class="h5 mb-1 font-weight-bold text-gray-800">${metric.value}</div>
                  <div class="small text-gray-500">${escapeHtml(metric.note ?? "")}</div>
                </div>
                <div class="col-auto">
                  <i class="fas ${icon} fa-2x text-gray-300"></i>
                </div>
              </div>
            </div>
          </article>
        </div>
      `;
    })
    .join("");
}

void bootAppShell();
