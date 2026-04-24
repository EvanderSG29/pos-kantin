function getBridge() {
  if (!window.posDesktop) {
    throw new Error("Bridge desktop Electron tidak tersedia. Jalankan aplikasi melalui Electron.");
  }

  return window.posDesktop;
}

function unsupported(action) {
  throw new Error(`Action "${action}" belum tersedia di desktop v1.`);
}

async function request(action, payload = {}, token = "") {
  const bridge = getBridge();

  switch (action) {
    case "health":
      return bridge.sync.getStatus();
    case "login":
      return bridge.auth.login({
        email: payload.email,
        pin: payload.pin,
      });
    case "logout":
      return bridge.auth.logout({ token });
    case "getCurrentUser":
      return bridge.auth.restore({ token });
    case "dashboardSummary":
      return bridge.dashboard.summary({ token });
    case "listSuppliers":
      return bridge.suppliers.list({
        token,
        query: payload ?? {},
      });
    case "saveSupplier":
      return bridge.suppliers.save({
        token,
        data: payload ?? {},
      });
    case "listTransactions":
      return bridge.transactions.list({
        token,
        query: payload ?? {},
      });
    case "saveTransaction":
      return bridge.transactions.save({
        token,
        data: payload ?? {},
      });
    case "deleteTransaction":
      return bridge.transactions.remove({
        token,
        id: payload.id,
      });
    default:
      return unsupported(action);
  }
}

export const api = {
  request,
  health() {
    return request("health");
  },
  login(email, pin) {
    return request("login", { email, pin });
  },
  logout(token) {
    return request("logout", {}, token);
  },
  getCurrentUser(token) {
    return request("getCurrentUser", {}, token);
  },
  dashboardSummary(token) {
    return request("dashboardSummary", {}, token);
  },
  listSuppliers(payload, token) {
    return request("listSuppliers", payload ?? {}, token);
  },
  saveSupplier(payload, token) {
    return request("saveSupplier", payload, token);
  },
  listTransactions(payload, token) {
    return request("listTransactions", payload ?? {}, token);
  },
  saveTransaction(payload, token) {
    return request("saveTransaction", payload, token);
  },
  deleteTransaction(id, token) {
    return request("deleteTransaction", { id }, token);
  },
  async getSyncStatus() {
    return getBridge().sync.getStatus();
  },
  async runSyncNow() {
    return getBridge().sync.runNow();
  },
  onSyncStatusChange(listener) {
    return getBridge().sync.onStatus(listener);
  },
  listUsers() {
    return unsupported("listUsers");
  },
  saveUser() {
    return unsupported("saveUser");
  },
  listBuyers() {
    return unsupported("listBuyers");
  },
  importBuyers() {
    return unsupported("importBuyers");
  },
  listSavings() {
    return unsupported("listSavings");
  },
  listDailyFinance() {
    return unsupported("listDailyFinance");
  },
  getDailyFinanceDetail() {
    return unsupported("getDailyFinanceDetail");
  },
  saveDailyFinance() {
    return unsupported("saveDailyFinance");
  },
  deleteDailyFinance() {
    return unsupported("deleteDailyFinance");
  },
  listChangeEntries() {
    return unsupported("listChangeEntries");
  },
  updateChangeEntryStatus() {
    return unsupported("updateChangeEntryStatus");
  },
  listSupplierPayouts() {
    return unsupported("listSupplierPayouts");
  },
  settleSupplierPayout() {
    return unsupported("settleSupplierPayout");
  },
};
