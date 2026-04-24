const EventEmitter = require("node:events");
const {
  buildMissingGasConfigMessage,
  coerceSyncIntervalMs,
} = require("../config/default.cjs");

const RETRY_STEPS_MS = [10000, 30000, 60000, 300000, 900000];

function createSyncService({
  authService,
  buyersRepo,
  db,
  dailyFinanceRepo,
  gasClient,
  getConfig,
  networkService,
  savingsRepo,
  suppliersRepo,
  supplierPayoutsRepo,
  syncQueueRepo,
  transactionsRepo,
  usersRepo,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  const events = new EventEmitter();
  const getCursorStmt = db.prepare("SELECT cursor_value FROM sync_cursors WHERE scope = ?");
  const upsertCursorStmt = db.prepare(`
    INSERT INTO sync_cursors (scope, cursor_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(scope) DO UPDATE SET
      cursor_value = excluded.cursor_value,
      updated_at = excluded.updated_at
  `);

  let timer = null;
  let started = false;
  let stopNetworkSubscription = null;
  let isSyncing = false;
  const initialSettings = readSyncSettings();
  let status = {
    online: false,
    configured: false,
    autoSyncEnabled: initialSettings.autoSyncEnabled,
    syncIntervalMs: initialSettings.syncIntervalMs,
    isSyncing: false,
    pendingCount: syncQueueRepo.countPending(),
    lastSyncAt: "",
    lastError: "",
    nextRetryAt: syncQueueRepo.getNextRetryAt(),
    authRequired: false,
  };

  function readSyncSettings() {
    const config = getConfig();
    return {
      autoSyncEnabled: config.autoSyncEnabled === true,
      syncIntervalMs: coerceSyncIntervalMs(config.syncIntervalMs),
    };
  }

  function emit(nextStatus) {
    const syncSettings = readSyncSettings();
    status = {
      ...status,
      ...syncSettings,
      ...nextStatus,
      pendingCount: syncQueueRepo.countPending(),
      nextRetryAt: syncQueueRepo.getNextRetryAt(),
    };

    events.emit("status", { ...status });
  }

  function nextRetryAt(retryCount) {
    const delay = RETRY_STEPS_MS[Math.min(Math.max(retryCount - 1, 0), RETRY_STEPS_MS.length - 1)];
    return new Date(Date.now() + delay).toISOString();
  }

  function readCursors() {
    return [
      "users",
      "buyers",
      "savings",
      "suppliers",
      "transactions",
      "dailyFinance",
      "changeEntries",
      "supplierPayouts",
    ].reduce((result, scope) => {
      result[scope] = getCursorStmt.get(scope)?.cursor_value || "";
      return result;
    }, {});
  }

  function persistCursors(cursors = {}) {
    const updatedAt = new Date().toISOString();
    [
      "users",
      "buyers",
      "savings",
      "suppliers",
      "transactions",
      "dailyFinance",
      "changeEntries",
      "supplierPayouts",
    ].forEach((scope) => {
      if (cursors[scope] === undefined) return;
      upsertCursorStmt.run(scope, String(cursors[scope] || ""), updatedAt);
    });
  }

  async function replayQueue(cloudToken) {
    const rows = syncQueueRepo.listDue();
    for (const row of rows) {
      try {
        if (row.entity_type === "users" && row.operation === "upsert") {
          const response = await gasClient.request("saveUser", row.payload, cloudToken);
          usersRepo.applyCloudRecord(response.data, { force: true });
        } else if (row.entity_type === "transactions" && row.operation === "upsert") {
          const response = await gasClient.request("saveTransaction", row.payload, cloudToken);
          transactionsRepo.applyCloudRecord(response.data, { force: true });
        } else if (row.entity_type === "transactions" && row.operation === "delete") {
          const response = await gasClient.request("deleteTransaction", { id: row.entity_id }, cloudToken);
          transactionsRepo.applyCloudRecord(response.data, { force: true });
        } else if (row.entity_type === "suppliers" && row.operation === "upsert") {
          const response = await gasClient.request("saveSupplier", row.payload, cloudToken);
          suppliersRepo.applyCloudRecord(response.data, { force: true });
        } else if (row.entity_type === "daily_finance" && row.operation === "upsert") {
          const response = await gasClient.request("saveDailyFinance", row.payload, cloudToken);
          dailyFinanceRepo.applyCloudDetail(response.data);
        } else if (row.entity_type === "daily_finance" && row.operation === "delete") {
          const response = await gasClient.request("deleteDailyFinance", { id: row.entity_id }, cloudToken);
          dailyFinanceRepo.applyCloudFinanceRecord(response.data, { force: true });
        } else if (row.entity_type === "change_entries" && row.operation === "status") {
          const response = await gasClient.request("updateChangeEntryStatus", row.payload, cloudToken);
          dailyFinanceRepo.applyCloudChangeEntryRecord(response.data, { force: true });
        } else if (row.entity_type === "supplier_payouts" && row.operation === "settle") {
          const response = await gasClient.request("settleSupplierPayout", row.payload, cloudToken);
          const payout = response.data?.payout;
          if (payout) {
            supplierPayoutsRepo.applyCloudRecord(payout, { force: true });
            transactionsRepo.markTransactionsSettled(row.payload.transactionIds || [], payout.id, { pendingSync: false });
          }
        } else {
          throw new Error(`Queue item tidak didukung: ${row.entity_type}/${row.operation}`);
        }

        syncQueueRepo.markSuccess(row.id);
        emit({ lastError: "" });
      } catch (error) {
        const retryCount = Number(row.retry_count || 0) + 1;
        syncQueueRepo.markFailure(row.id, retryCount, nextRetryAt(retryCount), error.message || "Sinkronisasi queue gagal.");
        emit({ lastError: error.message || "Sinkronisasi queue gagal." });
      }
    }
  }

  async function pullCloud(cloudToken) {
    const response = await gasClient.request("syncPull", {
      since: readCursors(),
    }, cloudToken);

    usersRepo.upsertFromCloud(response.data.users || []);
    buyersRepo.upsertFromCloud(response.data.buyers || []);
    savingsRepo.upsertFromCloud(response.data.savings || []);
    (response.data.suppliers || []).forEach((supplier) => {
      suppliersRepo.applyCloudRecord(supplier);
    });
    (response.data.transactions || []).forEach((transaction) => {
      transactionsRepo.applyCloudRecord(transaction);
    });
    (response.data.dailyFinance || []).forEach((finance) => {
      dailyFinanceRepo.applyCloudFinanceRecord(finance);
    });
    (response.data.changeEntries || []).forEach((entry) => {
      dailyFinanceRepo.applyCloudChangeEntryRecord(entry);
    });
    supplierPayoutsRepo.upsertFromCloud(response.data.supplierPayouts || []);
    persistCursors(response.data.cursors || {});

    authService.refreshActiveSessionUser();
  }

  async function runSync(reason = "manual") {
    if (isSyncing) return { ...status };
    isSyncing = true;
    emit({ isSyncing: true });

    try {
      const network = await networkService.checkNow();
      emit({
        online: network.online,
        configured: network.configured,
      });

      const config = getConfig();
      if (config.configError) {
        emit({
          authRequired: false,
          lastError: config.configError,
        });
        return { ...status };
      }

      if (!network.configured) {
        emit({
          authRequired: false,
          lastError: buildMissingGasConfigMessage(config),
        });
        return { ...status };
      }

      if (!network.online) {
        emit({
          authRequired: false,
          lastError: network.lastError || "Aplikasi sedang offline.",
        });
        return { ...status };
      }

      const session = authService.getCurrentSession();
      const cloudToken = session?.cloudToken || "";
      if (!cloudToken) {
        emit({
          authRequired: true,
          lastError: "Login online diperlukan untuk sinkronisasi.",
        });
        return { ...status };
      }

      await replayQueue(cloudToken);
      await pullCloud(cloudToken);

      emit({
        authRequired: false,
        lastError: "",
        lastSyncAt: new Date().toISOString(),
      });

      return { ...status, reason };
    } finally {
      isSyncing = false;
      emit({ isSyncing: false });
    }
  }

  function clearAutoTimer() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
  }

  function scheduleAutoTimer() {
    clearAutoTimer();
    const syncSettings = readSyncSettings();
    emit(syncSettings);

    if (!started || !syncSettings.autoSyncEnabled) return;

    timer = setIntervalFn(() => {
      void runAutomaticSync("interval");
    }, syncSettings.syncIntervalMs);
  }

  async function runAutomaticSync(reason = "auto") {
    const syncSettings = readSyncSettings();
    if (!syncSettings.autoSyncEnabled) {
      emit(syncSettings);
      return { ...status, reason, skipped: true };
    }

    return runSync(reason);
  }

  async function applySettings({ runOnEnable = false } = {}) {
    const wasEnabled = status.autoSyncEnabled === true;
    const previousIntervalMs = status.syncIntervalMs;
    const syncSettings = readSyncSettings();

    emit(syncSettings);

    if (
      started
      && (
        !syncSettings.autoSyncEnabled
        || !wasEnabled
        || previousIntervalMs !== syncSettings.syncIntervalMs
      )
    ) {
      scheduleAutoTimer();
    }

    if (started && runOnEnable && syncSettings.autoSyncEnabled && !wasEnabled) {
      return runSync("auto-enabled");
    }

    return { ...status };
  }

  function stop() {
    clearAutoTimer();
    stopNetworkSubscription?.();
    stopNetworkSubscription = null;
    started = false;
  }

  return {
    getStatus() {
      const network = networkService.getStatus();
      const syncSettings = readSyncSettings();
      return {
        ...status,
        ...syncSettings,
        online: network.online,
        configured: network.configured,
      };
    },
    onStatusChange(listener) {
      events.on("status", listener);
      return () => events.off("status", listener);
    },
    async runNow(reason = "manual") {
      return runSync(reason);
    },
    async runAuto(reason = "auto") {
      return runAutomaticSync(reason);
    },
    async applySettings(options = {}) {
      return applySettings(options);
    },
    start() {
      if (started) return stop;
      started = true;

      stopNetworkSubscription = networkService.onStatusChange((network) => {
        emit({
          online: network.online,
          configured: network.configured,
        });

        if (network.online) {
          void runAutomaticSync("reconnect");
        }
      });

      scheduleAutoTimer();
      if (readSyncSettings().autoSyncEnabled) {
        void runSync("startup");
      }

      return stop;
    },
    stop,
  };
}

module.exports = {
  createSyncService,
};
