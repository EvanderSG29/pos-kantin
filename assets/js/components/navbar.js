import { escapeHtml } from "../utils.js";

export function renderNavbar({ title, user }) {
  return `
    <div class="topbar">
      <div class="topbar__meta">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(user.role === "admin" ? "Admin panel" : "Panel petugas")}</p>
      </div>
      <div class="topbar__actions">
        <div class="user-badge">
          <span>${escapeHtml(user.fullName)}</span>
          <span>${escapeHtml(user.email)}</span>
        </div>
        <button type="button" id="logout-button" class="button button--ghost">Keluar</button>
      </div>
    </div>
  `;
}

