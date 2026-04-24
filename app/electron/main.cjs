const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { createRuntimeConfigManager } = require("./config/default.cjs");
const { openDatabase } = require("./db/connection.cjs");
const { registerAppProtocol, registerAppScheme } = require("./protocol.cjs");
const { hashValue } = require("./common.cjs");
const { createBuyersRepo } = require("./repositories/buyers-repo.cjs");
const { createDailyFinanceRepo } = require("./repositories/daily-finance-repo.cjs");
const { createSavingsRepo } = require("./repositories/savings-repo.cjs");
const { createSupplierPayoutsRepo } = require("./repositories/supplier-payouts-repo.cjs");
const { createUsersRepo } = require("./repositories/users-repo.cjs");
const { createSuppliersRepo } = require("./repositories/suppliers-repo.cjs");
const { createTransactionsRepo } = require("./repositories/transactions-repo.cjs");
const { createSyncQueueRepo } = require("./repositories/sync-queue-repo.cjs");
const { createAuthService } = require("./services/auth-service.cjs");
const { createGasClient } = require("./services/gas-client.cjs");
const { createNetworkService } = require("./services/network-service.cjs");
const { createSyncService } = require("./services/sync-service.cjs");

registerAppScheme();

let mainWindow = null;
let debugWindow = null;
let closeSyncBridge = null;
let databaseHandle = null;
let networkService = null;
let syncService = null;

function createDebugWindow() {
  if (app.isPackaged) return;
  if (debugWindow && !debugWindow.isDestroyed()) return;

  debugWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "Debug Monitor - POS Kantin",
    webPreferences: {
      preload: path.join(__dirname, "preload-debug.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  debugWindow.on("closed", () => {
    debugWindow = null;
  });

  void debugWindow.loadURL("app://bundle/debug.html");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: "#f7f8fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL("app://bundle/login.html");
}

function sendSyncStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("sync:status", payload);
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send("sync:status", payload);
  }
}

function sendDebugLog(level, message, details = {}) {
  if (app.isPackaged) return;
  if (!debugWindow || debugWindow.isDestroyed()) return;
  debugWindow.webContents.send("debug:log", {
    timestamp: new Date().toISOString(),
    level,
    message,
    details,
  });
}

function ok(message, data) {
  return {
    success: true,
    message,
    data,
  };
}

function requireAdmin(session) {
  if (session.user.role !== "admin") {
    throw new Error("Aksi ini hanya untuk admin.");
  }
}

function buildUserSyncPayload(data, user) {
  const payload = {
    ...data,
    id: user.id,
  };
  if (payload.pin) {
    payload.pinHash = hashValue(payload.pin);
  }
  delete payload.pin;
  return payload;
}

function buildDailyFinanceSyncPayload(detail) {
  const finance = detail.finance;
  return {
    id: finance.id,
    financeDate: finance.financeDate,
    grossAmount: finance.grossAmount,
    changeTotal: finance.changeTotal,
    notes: finance.notes || "",
    changeEntries: detail.changeEntries
      .filter((entry) => !entry.deletedAt)
      .map((entry) => ({
        id: entry.id,
        buyerId: entry.buyerId,
        changeAmount: entry.changeAmount,
        notes: entry.notes || "",
      })),
  };
}

app.whenReady().then(() => {
  registerAppProtocol(path.resolve(__dirname, ".."));

  const runtimeConfig = createRuntimeConfigManager(app);
  databaseHandle = openDatabase(app);

  const usersRepo = createUsersRepo(databaseHandle.db);
  const buyersRepo = createBuyersRepo(databaseHandle.db);
  const savingsRepo = createSavingsRepo(databaseHandle.db);
  const suppliersRepo = createSuppliersRepo(databaseHandle.db);
  const transactionsRepo = createTransactionsRepo(databaseHandle.db, suppliersRepo);
  const dailyFinanceRepo = createDailyFinanceRepo(databaseHandle.db, buyersRepo);
  const supplierPayoutsRepo = createSupplierPayoutsRepo(databaseHandle.db, transactionsRepo);
  const syncQueueRepo = createSyncQueueRepo(databaseHandle.db);

  const gasClient = createGasClient({
    getConfig: () => runtimeConfig.getConfig(),
    onDebugLog: sendDebugLog,
  });

  const authService = createAuthService({
    db: databaseHandle.db,
    gasClient,
    getConfig: () => runtimeConfig.getConfig(),
    usersRepo,
  });

  networkService = createNetworkService({
    gasClient,
    getConfig: () => runtimeConfig.getConfig(),
    onDebugLog: sendDebugLog,
  });

  syncService = createSyncService({
    authService,
    db: databaseHandle.db,
    gasClient,
    getConfig: () => runtimeConfig.getConfig(),
    networkService,
    buyersRepo,
    dailyFinanceRepo,
    savingsRepo,
    suppliersRepo,
    supplierPayoutsRepo,
    syncQueueRepo,
    transactionsRepo,
    usersRepo,
  });

  ipcMain.handle("app:get-info", () => ok("Info aplikasi tersedia.", {
    appVersion: app.getVersion(),
    configPath: runtimeConfig.getConfigPath(),
    dbPath: databaseHandle.dbPath,
    isPackaged: app.isPackaged,
    debugUiEnabled: !app.isPackaged,
  }));

  ipcMain.handle("auth:login", async (_event, payload) => {
    const session = await authService.login(payload || {});
    void syncService.runAuto("login");
    return ok("Login berhasil.", session);
  });

  ipcMain.handle("auth:restore", (_event, payload) => {
    const session = authService.getCurrentSession(payload?.token || "");
    if (!session) {
      return ok("Sesi tidak ditemukan.", null);
    }
    return ok("Sesi aktif ditemukan.", session);
  });

  ipcMain.handle("auth:logout", async (_event, payload) => {
    await authService.logout(payload?.token || "");
    return ok("Logout berhasil.", null);
  });

  ipcMain.handle("dashboard:summary", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    return ok("Ringkasan dashboard berhasil diambil.", transactionsRepo.buildDashboardSummary(session.user, {
      activeSuppliers: suppliersRepo.countActive(),
      offlineCapableUsers: usersRepo.countOfflineCapableUsers(),
      pendingSyncCount: syncQueueRepo.countPending(),
      lastSyncAt: syncService.getStatus().lastSyncAt,
      lastSyncError: syncService.getStatus().lastError,
      syncOnline: syncService.getStatus().online,
    }));
  });

  ipcMain.handle("users:list", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    requireAdmin(session);
    return ok("Daftar user berhasil diambil.", usersRepo.list(payload?.query || {}));
  });

  ipcMain.handle("users:save", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const data = payload?.data || {};
    const user = usersRepo.saveUser(data, session.user);
    if (data.pin) {
      authService.seedOfflineAuthProfile(user, data.pin);
    }
    syncQueueRepo.enqueueChange({
      entityType: "users",
      entityId: user.id,
      operation: "upsert",
      payload: buildUserSyncPayload(data, user),
    });
    sendSyncStatus(syncService.getStatus());
    authService.refreshActiveSessionUser();
    return ok("User berhasil disimpan.", user);
  });

  ipcMain.handle("buyers:list", (_event, payload) => {
    authService.requireSession(payload?.token || "");
    return ok("Daftar pembeli berhasil diambil.", buyersRepo.list(payload?.query || {}));
  });

  ipcMain.handle("savings:list", (_event, payload) => {
    authService.requireSession(payload?.token || "");
    return ok("Data simpanan berhasil diambil.", savingsRepo.list(payload?.query || {}));
  });

  ipcMain.handle("suppliers:list", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const query = {
      ...(payload?.query || {}),
      includeInactive: session.user.role === "admin" && Boolean(payload?.query?.includeInactive),
    };
    return ok("Daftar pemasok berhasil diambil.", suppliersRepo.list(query));
  });

  ipcMain.handle("suppliers:save", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const supplier = suppliersRepo.saveSupplier(payload?.data || {}, session.user);
    syncQueueRepo.enqueueChange({
      entityType: "suppliers",
      entityId: supplier.id,
      operation: "upsert",
      payload: payload?.data ? { ...payload.data, id: supplier.id } : { id: supplier.id },
    });
    sendSyncStatus(syncService.getStatus());
    return ok("Data pemasok berhasil disimpan.", supplier);
  });

  ipcMain.handle("transactions:list", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    return ok("Daftar transaksi berhasil diambil.", transactionsRepo.listTransactions(payload?.query || {}, session.user));
  });

  ipcMain.handle("transactions:save", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const transaction = transactionsRepo.saveTransaction(payload?.data || {}, session.user);
    syncQueueRepo.enqueueChange({
      entityType: "transactions",
      entityId: transaction.id,
      operation: "upsert",
      payload: {
        ...payload.data,
        id: transaction.id,
      },
    });
    sendSyncStatus(syncService.getStatus());
    return ok("Transaksi berhasil disimpan.", transaction);
  });

  ipcMain.handle("transactions:remove", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const transaction = transactionsRepo.deleteTransaction(payload?.id || "", session.user);
    syncQueueRepo.enqueueChange({
      entityType: "transactions",
      entityId: transaction.id,
      operation: "delete",
      payload: {
        id: transaction.id,
      },
    });
    sendSyncStatus(syncService.getStatus());
    return ok("Transaksi berhasil dihapus.", transaction);
  });

  ipcMain.handle("finance:list-daily", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    return ok("Data keuangan harian berhasil diambil.", dailyFinanceRepo.listDailyFinance(payload?.query || {}, session.user));
  });

  ipcMain.handle("finance:get-daily-detail", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    return ok("Detail keuangan harian berhasil diambil.", dailyFinanceRepo.getDailyFinanceDetail({ id: payload?.id || "" }, session.user));
  });

  ipcMain.handle("finance:save-daily", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const detail = dailyFinanceRepo.saveDailyFinance(payload?.data || {}, session.user);
    syncQueueRepo.enqueueChange({
      entityType: "daily_finance",
      entityId: detail.finance.id,
      operation: "upsert",
      payload: buildDailyFinanceSyncPayload(detail),
    });
    sendSyncStatus(syncService.getStatus());
    return ok("Data keuangan harian berhasil disimpan.", detail);
  });

  ipcMain.handle("finance:delete-daily", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const finance = dailyFinanceRepo.deleteDailyFinance({ id: payload?.id || "" }, session.user);
    syncQueueRepo.enqueueChange({
      entityType: "daily_finance",
      entityId: finance.id,
      operation: "delete",
      payload: { id: finance.id },
    });
    sendSyncStatus(syncService.getStatus());
    return ok("Data keuangan harian berhasil dihapus.", finance);
  });

  ipcMain.handle("finance:list-change-entries", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    return ok("Daftar buku kembalian berhasil diambil.", dailyFinanceRepo.listChangeEntries(payload?.query || {}, session.user));
  });

  ipcMain.handle("finance:update-change-entry-status", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const changeEntry = dailyFinanceRepo.updateChangeEntryStatus({
      id: payload?.id || "",
      status: payload?.status || "",
    }, session.user);
    syncQueueRepo.enqueueChange({
      entityType: "change_entries",
      entityId: changeEntry.id,
      operation: "status",
      payload: {
        id: changeEntry.id,
        status: changeEntry.status,
      },
    });
    sendSyncStatus(syncService.getStatus());
    return ok("Status kembalian berhasil diperbarui.", changeEntry);
  });

  ipcMain.handle("supplier-payouts:list", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    return ok("Data pembayaran pemasok berhasil diambil.", supplierPayoutsRepo.listSupplierPayouts(session.user));
  });

  ipcMain.handle("supplier-payouts:settle", (_event, payload) => {
    const session = authService.requireSession(payload?.token || "");
    const result = supplierPayoutsRepo.settleSupplierPayout(payload?.data || {}, session.user);
    syncQueueRepo.enqueueChange({
      entityType: "supplier_payouts",
      entityId: result.payout.id,
      operation: "settle",
      payload: {
        id: result.payout.id,
        supplierId: result.payout.supplierId,
        dueDate: result.payout.dueDate,
        notes: result.payout.notes || "",
        transactionIds: result.transactionIds,
      },
    });
    sendSyncStatus(syncService.getStatus());
    return ok("Pembayaran pemasok berhasil ditandai lunas.", result);
  });

  ipcMain.handle("sync:get-status", () => ok("Status sinkronisasi berhasil diambil.", syncService.getStatus()));
  ipcMain.handle("sync:run-now", async () => ok("Sinkronisasi manual dijalankan.", await syncService.runNow("manual")));

  ipcMain.handle("debug:get-initial-state", () => ok("State awal debug.", {
    network: networkService.getStatus(),
    sync: syncService.getStatus(),
    syncSettings: runtimeConfig.getSyncSettings(),
  }));

  ipcMain.handle("debug:set-sync-settings", async (_event, payload) => {
    const syncSettings = runtimeConfig.updateSyncSettings(payload || {});
    const sync = await syncService.applySettings({ runOnEnable: true });
    return ok("Pengaturan sync otomatis disimpan.", {
      syncSettings,
      sync,
    });
  });

  ipcMain.handle("debug:open-window", () => {
    createDebugWindow();
    return ok("Debug window opened.");
  });

  ipcMain.handle("debug:toggle-overlay", (_event, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return ok("Main window not available.");
    }
    mainWindow.webContents.send("debug:toggle-overlay", enabled);
    return ok(`Overlay ${enabled ? "enabled" : "disabled"}.`);
  });

  networkService.start();
  closeSyncBridge = syncService.start() || null;
  syncService.onStatusChange((payload) => {
    sendSyncStatus(payload);
  });

  createWindow();

  if (!app.isPackaged) {
    const { globalShortcut } = require("electron");
    globalShortcut.register("CommandOrControl+Shift+D", () => {
      createDebugWindow();
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeSyncBridge?.();
  closeSyncBridge = null;
  syncService?.stop();
  networkService?.stop();
  databaseHandle?.db?.close();
});
