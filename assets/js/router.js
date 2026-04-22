export const ROUTES = Object.freeze({
  home: "./index.html",
  login: "./login.html",
  admin: "./admin.html",
  petugas: "./petugas.html",
  transactions: "./transaksi.html",
  users: "./users.html",
  savings: "./simpanan.html",
  reports: "./laporan.html",
});

export function goTo(routeKeyOrPath) {
  const target = ROUTES[routeKeyOrPath] ?? routeKeyOrPath;
  window.location.href = target;
}

export function routeForRole(role) {
  return role === "admin" ? ROUTES.admin : ROUTES.petugas;
}
