import { ROUTES } from "../router.js";
import { escapeHtml } from "../utils.js";

function buildLinks(role) {
  const baseLinks = [
    { key: role === "admin" ? "admin" : "petugas", label: "Dashboard", href: role === "admin" ? ROUTES.admin : ROUTES.petugas },
    { key: "transactions", label: "Transaksi", href: ROUTES.transactions },
    { key: "savings", label: "Simpanan", href: ROUTES.savings },
    { key: "reports", label: "Laporan", href: ROUTES.reports },
  ];

  if (role === "admin") {
    baseLinks.splice(2, 0, { key: "users", label: "Users", href: ROUTES.users });
  }

  return baseLinks;
}

export function renderSidebar({ currentPage, user }) {
  const links = buildLinks(user.role)
    .map(
      (link) => `
        <a href="${link.href}" data-active="${String(currentPage === link.key)}">
          <span>${escapeHtml(link.label)}</span>
        </a>
      `,
    )
    .join("");

  return `
    <div class="sidebar">
      <div class="sidebar__brand">
        <p class="eyebrow">POS Kantin</p>
        <h2>${escapeHtml(user.role === "admin" ? "Kontrol admin" : "Ruang petugas")}</h2>
        <p>HTML + Apps Script + Google Sheets</p>
      </div>
      <nav class="sidebar__nav">${links}</nav>
      <p class="sidebar__footer">Versi repo awal untuk pengembangan dan deploy bertahap.</p>
    </div>
  `;
}

