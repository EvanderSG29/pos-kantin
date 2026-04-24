const ROUTE_MANIFEST_MAP = Object.freeze({
  home: {
    key: "home",
    path: "/index.html",
    aliases: ["/"],
    href: "./index.html",
    title: "Mengarahkan ke Login",
    isAppRoute: false,
  },
  login: {
    key: "login",
    path: "/login.html",
    aliases: ["/login"],
    href: "./login.html",
    title: "Login",
    isAppRoute: false,
  },
  admin: {
    key: "admin",
    pageKey: "admin",
    path: "/admin.html",
    aliases: ["/admin"],
    href: "./admin.html",
    title: "Dashboard Admin",
    roles: ["admin"],
    modulePath: "./pages/admin.js",
    isAppRoute: true,
  },
  petugas: {
    key: "petugas",
    pageKey: "petugas",
    path: "/petugas.html",
    aliases: ["/petugas"],
    href: "./petugas.html",
    title: "Dashboard Petugas",
    roles: ["petugas", "admin"],
    modulePath: "./pages/petugas.js",
    isAppRoute: true,
  },
  transactions: {
    key: "transactions",
    pageKey: "transactions",
    path: "/transaksi.html",
    aliases: ["/transaksi"],
    href: "./transaksi.html",
    title: "Transaksi",
    roles: ["petugas", "admin"],
    modulePath: "./pages/transaksi.js",
    isAppRoute: true,
  },
  users: {
    key: "users",
    pageKey: "users",
    path: "/users.html",
    aliases: ["/users"],
    href: "./users.html",
    title: "Users",
    roles: ["admin"],
    modulePath: "./pages/desktop-unavailable.js",
    isAppRoute: true,
  },
  suppliers: {
    key: "suppliers",
    pageKey: "suppliers",
    path: "/pemasok.html",
    aliases: ["/pemasok"],
    href: "./pemasok.html",
    title: "Pemasok",
    roles: ["admin"],
    modulePath: "./pages/pemasok.js",
    isAppRoute: true,
  },
  supplierPayouts: {
    key: "supplierPayouts",
    pageKey: "supplierPayouts",
    path: "/pembayaran.html",
    aliases: ["/pembayaran"],
    href: "./pembayaran.html",
    title: "Pembayaran Pemasok",
    roles: ["admin"],
    modulePath: "./pages/desktop-unavailable.js",
    isAppRoute: true,
  },
  savings: {
    key: "savings",
    pageKey: "savings",
    path: "/simpanan.html",
    aliases: ["/simpanan"],
    href: "./simpanan.html",
    title: "Simpanan",
    roles: ["petugas", "admin"],
    modulePath: "./pages/desktop-unavailable.js",
    isAppRoute: true,
  },
  reports: {
    key: "reports",
    pageKey: "reports",
    path: "/laporan.html",
    aliases: ["/laporan"],
    href: "./laporan.html",
    title: "Laporan",
    roles: ["petugas", "admin"],
    modulePath: "./pages/desktop-unavailable.js",
    isAppRoute: true,
  },
  notFound: {
    key: "notFound",
    path: "/404.html",
    aliases: ["/404"],
    href: "./404.html",
    title: "404",
    isAppRoute: false,
  },
});

const ROUTE_LIST = Object.freeze(Object.values(ROUTE_MANIFEST_MAP));

export const ROUTES = Object.freeze(
  ROUTE_LIST.reduce((result, route) => {
    result[route.key] = route.href;
    return result;
  }, {}),
);

export const ROUTE_MANIFEST = ROUTE_MANIFEST_MAP;

let shellNavigate = null;
let routerCleanup = null;

function normalizePathname(pathname = "/") {
  if (pathname === "/") return ROUTE_MANIFEST_MAP.home.path;

  const normalized = pathname.replace(/\/+$/, "");
  return normalized || ROUTE_MANIFEST_MAP.home.path;
}

function findRouteByPath(pathname) {
  const normalized = normalizePathname(pathname);
  return (
    ROUTE_LIST.find((route) => {
      if (route.path === normalized) return true;
      return Array.isArray(route.aliases) && route.aliases.includes(normalized);
    }) ?? null
  );
}

function buildNavigationTarget(routeKeyOrPath) {
  if (!routeKeyOrPath) return null;

  if (typeof routeKeyOrPath === "string" && ROUTE_MANIFEST_MAP[routeKeyOrPath]) {
    return ROUTE_MANIFEST_MAP[routeKeyOrPath];
  }

  try {
    const url = new URL(String(routeKeyOrPath), window.location.href);
    const route = findRouteByPath(url.pathname);

    if (route) return route;

    return {
      key: null,
      path: normalizePathname(url.pathname),
      href: `${url.pathname}${url.search}${url.hash}`,
      isAppRoute: false,
    };
  } catch (error) {
    return null;
  }
}

function shouldHandleAnchorClick(event, anchor) {
  if (!anchor) return false;
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return false;

  return true;
}

function fullReload(targetHref, { replace = false } = {}) {
  if (replace) {
    window.location.replace(targetHref);
  } else {
    window.location.assign(targetHref);
  }

  return Promise.resolve();
}

export function resolveRoute(routeKeyOrPath) {
  return buildNavigationTarget(routeKeyOrPath);
}

export function getCurrentRoute() {
  return findRouteByPath(window.location.pathname);
}

export function routeForRole(role) {
  return role === "admin" ? ROUTES.admin : ROUTES.petugas;
}

export function registerShellNavigation(handler) {
  shellNavigate = handler;
}

export function clearShellNavigation() {
  shellNavigate = null;
}

export function attachShellRouter() {
  if (routerCleanup) return routerCleanup;

  const onDocumentClick = (event) => {
    const anchor = event.target.closest("a[href]");
    if (!shouldHandleAnchorClick(event, anchor)) return;

    const target = buildNavigationTarget(anchor.href);
    if (!target?.isAppRoute || typeof shellNavigate !== "function") return;

    event.preventDefault();
    void shellNavigate(target, { history: "push", trigger: "link" });
  };

  const onPopState = () => {
    const currentRoute = getCurrentRoute();
    if (currentRoute?.isAppRoute && typeof shellNavigate === "function") {
      void shellNavigate(currentRoute, { history: "none", trigger: "popstate" });
      return;
    }

    void fullReload(window.location.href, { replace: true });
  };

  document.addEventListener("click", onDocumentClick);
  window.addEventListener("popstate", onPopState);

  routerCleanup = () => {
    document.removeEventListener("click", onDocumentClick);
    window.removeEventListener("popstate", onPopState);
    routerCleanup = null;
    clearShellNavigation();
  };

  return routerCleanup;
}

export async function goTo(routeKeyOrPath, options = {}) {
  const target = buildNavigationTarget(routeKeyOrPath);
  const replace = Boolean(options.replace);

  if (target?.isAppRoute && typeof shellNavigate === "function" && !options.forceReload) {
    return shellNavigate(target, {
      history: replace ? "replace" : "push",
      trigger: options.trigger ?? "programmatic",
    });
  }

  const href = target?.href ?? String(routeKeyOrPath);
  return fullReload(href, { replace });
}
