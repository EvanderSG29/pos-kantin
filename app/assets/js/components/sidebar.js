import { ROUTES } from "../router.js";
import { escapeHtml } from "../utils.js";

function buildLinks(role) {
  const links = [
    {
      key: role === "admin" ? "admin" : "petugas",
      label: "Dashboard",
      href: role === "admin" ? ROUTES.admin : ROUTES.petugas,
      icon: "fa-tachometer-alt",
    },
    { key: "transactions", label: "Transaksi", href: ROUTES.transactions, icon: "fa-cash-register" },
  ];

  if (role === "admin") {
    links.push({ key: "suppliers", label: "Pemasok", href: ROUTES.suppliers, icon: "fa-truck-loading" });
  }

  return links;
}

export function renderSidebar({ currentPage, user }) {
  const dashboardHref = user.role === "admin" ? ROUTES.admin : ROUTES.petugas;
  const links = buildLinks(user.role)
    .map((link) => {
      const activeClass = currentPage === link.key ? "active" : "";

      return `
        <li class="nav-item ${activeClass}">
          <a class="nav-link ${activeClass}" href="${link.href}" data-route-key="${link.key}" aria-current="${currentPage === link.key ? "page" : "false"}">
            <i class="fas fa-fw ${link.icon}"></i>
            <span>${escapeHtml(link.label)}</span>
          </a>
        </li>
      `;
    })
    .join("");

  return `
    <ul class="navbar-nav bg-gradient-primary sidebar sidebar-dark" id="accordionSidebar">
      <li class="nav-item">
        <a class="sidebar-brand d-flex align-items-center pos-sidebar-brand" href="${dashboardHref}">
          <div class="sidebar-brand-text pos-sidebar-brand-text">POS Kantin</div>
        </a>
      </li>

      <li class="nav-item">
        <hr class="sidebar-divider my-0">
      </li>

      <li class="sidebar-heading">Desktop v1</li>

      ${links}
    </ul>
  `;
}
