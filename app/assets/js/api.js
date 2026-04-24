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
    case "listUsers":
      return bridge.users.list({
        token,
        query: payload ?? {},
      });
    case "saveUser":
      return bridge.users.save({
        token,
        data: payload ?? {},
      });
    case "listBuyers":
      return bridge.buyers.list({
        token,
        query: payload ?? {},
      });
    case "listSavings":
      return bridge.savings.list({
        token,
        query: payload ?? {},
      });
    case "listDailyFinance":
      return bridge.finance.listDaily({
        token,
        query: payload ?? {},
      });
    case "getDailyFinanceDetail":
      return bridge.finance.getDailyDetail({
        token,
        id: payload.id,
      });
    case "saveDailyFinance":
      return bridge.finance.saveDaily({
        token,
        data: payload ?? {},
      });
    case "deleteDailyFinance":
      return bridge.finance.deleteDaily({
        token,
        id: payload.id,
      });
    case "listChangeEntries":
      return bridge.finance.listChangeEntries({
        token,
        query: payload ?? {},
      });
    case "updateChangeEntryStatus":
      return bridge.finance.updateChangeEntryStatus({
        token,
        id: payload.id,
        status: payload.status,
      });
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
    case "listSupplierPayouts":
      return bridge.supplierPayouts.list({ token });
    case "settleSupplierPayout":
      return bridge.supplierPayouts.settle({
        token,
        data: payload ?? {},
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
  listUsers(payload, token) {
    return request("listUsers", payload ?? {}, token);
  },
  saveUser(payload, token) {
    return request("saveUser", payload, token);
  },
  listBuyers(payload, token) {
    return request("listBuyers", payload ?? {}, token);
  },
  importBuyers() {
    return unsupported("importBuyers");
  },
  listSavings(payload, token) {
    return request("listSavings", payload ?? {}, token);
  },
  listDailyFinance(payload, token) {
    return request("listDailyFinance", payload ?? {}, token);
  },
  getDailyFinanceDetail(id, token) {
    return request("getDailyFinanceDetail", { id }, token);
  },
  saveDailyFinance(payload, token) {
    return request("saveDailyFinance", payload, token);
  },
  deleteDailyFinance(id, token) {
    return request("deleteDailyFinance", { id }, token);
  },
  listChangeEntries(payload, token) {
    return request("listChangeEntries", payload ?? {}, token);
  },
  updateChangeEntryStatus(id, status, token) {
    return request("updateChangeEntryStatus", { id, status }, token);
  },
  listSupplierPayouts(token) {
    return request("listSupplierPayouts", {}, token);
  },
  settleSupplierPayout(payload, token) {
    return request("settleSupplierPayout", payload, token);
  },
};
