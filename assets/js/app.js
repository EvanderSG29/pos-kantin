import { logoutUser } from "./auth.js";
import { renderNavbar } from "./components/navbar.js";
import { renderSidebar } from "./components/sidebar.js";
import { showToast } from "./components/toast.js";
import { goTo } from "./router.js";
import { escapeHtml } from "./utils.js";

export function mountAppShell({ title, pageKey, session }) {
  const sidebar = document.querySelector("#sidebar");
  const topbar = document.querySelector("#topbar");

  if (sidebar) sidebar.innerHTML = renderSidebar({ currentPage: pageKey, user: session.user });
  if (topbar) topbar.innerHTML = renderNavbar({ title, user: session.user });

  const logoutButton = document.querySelector("#logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await logoutUser();
      showToast("Sesi berhasil diakhiri.", "success");
      goTo("login");
    });
  }
}

export function renderMetricCards(container, metrics) {
  container.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <p class="metric-card__label">${escapeHtml(metric.label)}</p>
          <p class="metric-card__value">${metric.value}</p>
          <p class="metric-card__note">${escapeHtml(metric.note ?? "")}</p>
        </article>
      `,
    )
    .join("");
}

