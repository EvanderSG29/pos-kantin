import { escapeHtml, getInitials } from "../utils.js";

export function renderNavbar({ title, session }) {
  const { user } = session;
  const roleLabel = user.role === "admin" ? "Administrator" : "Petugas";
  const authBadgeClass = session.authMode === "offline" ? "warning" : "success";
  const authBadgeText = session.authMode === "offline" ? "Login offline" : "Login online";
  const initials = getInitials(user.nickname || user.fullName);

  return `
    <nav class="navbar navbar-expand navbar-light bg-white topbar shadow pos-topbar">
      <button id="sidebarToggleTop" class="btn border-0 pos-shell-toggle" type="button" aria-label="Toggle sidebar">
        <i class="fas fa-bars"></i>
      </button>

      <div class="d-flex flex-column min-w-0">
        <h1 id="topbar-page-title" class="h5 mb-0 text-gray-800">${escapeHtml(title)}</h1>
        <span class="small text-muted">${escapeHtml(roleLabel)} panel</span>
      </div>

      <ul class="navbar-nav ml-auto align-items-center">
        <li class="nav-item d-none d-lg-flex mr-3">
          <div id="topbar-sync-status"></div>
        </li>

        <li class="nav-item d-none d-sm-block mr-3">
          <span class="badge badge-pill badge-${authBadgeClass} px-3 py-2 shadow-sm">${escapeHtml(authBadgeText)}</span>
        </li>

        <li class="nav-item dropdown no-arrow pos-user-menu">
          <button
            type="button"
            class="nav-link border-0 bg-transparent dropdown-toggle d-flex align-items-center pos-user-toggle"
            id="userDropdownToggle"
            aria-expanded="false"
            aria-haspopup="menu"
            aria-controls="userDropdownMenu"
          >
            <span class="mr-2 d-none d-lg-inline text-gray-600 small text-right">
              <span class="d-block font-weight-bold">${escapeHtml(user.fullName)}</span>
              <span class="d-block">${escapeHtml(user.email)}</span>
            </span>
            <span class="pos-profile-badge" aria-hidden="true">${escapeHtml(initials)}</span>
          </button>

          <div class="dropdown-menu dropdown-menu-right shadow pos-user-dropdown" id="userDropdownMenu" hidden>
            <div class="dropdown-item-text">
              <div class="small text-gray-500 text-uppercase">${escapeHtml(roleLabel)}</div>
              <div class="font-weight-bold text-gray-800">${escapeHtml(user.nickname || user.fullName)}</div>
            </div>
            <div class="dropdown-divider"></div>
            <button type="button" id="logout-button" class="dropdown-item">
              <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-gray-400"></i>
              Keluar
            </button>
          </div>
        </li>
      </ul>
    </nav>
  `;
}
