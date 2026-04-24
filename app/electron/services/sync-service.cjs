const EventEmitter = require("node:events");
const { buildMissingGasConfigMessage } = require("../config/default.cjs");

const RETRY_STEPS_MS = [10000, 30000, 60000, 300000, 900000];

function createSyncService({
  authService,
  db,
  gasClient,
  getConfig,
  networkService,
  suppliersRepo,
  syncQueueRepo,
  transactionsRepo,
  usersRepo,
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
  let isSyncing = false;
  let status = {
    online: false,
    configured: false,
    isSyncing: false,
    pendingCount: syncQueueRepo.countPending(),
    lastSyncAt: "",
    lastError: "",
    nextRetryAt: syncQueueRepo.getNextRetryAt(),
    authRequired: false,
  };

  function emit(nextStatus) {
    status = {
      ...status,
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
    return {
      users: getCursorStmt.get("users")?.cursor_value || "",
      suppliers: getCursorStmt.get("suppliers")?.cursor_value || "",
      transactions: getCursorStmt.get("transactions")?.cursor_value || "",
    };
  }

  function persistCursors(cursors = {}) {
    const updatedAt = new Date().toISOString();
    ["users", "suppliers", "transactions"].forEach((scope) => {
      if (cursors[scope] === undefined) return;
      upsertCursorStmt.run(scope, String(cursors[scope] || ""), updatedAt);
    });
  }

  async function replayQueue(cloudToken) {
    const rows = syncQueueRepo.listDue();
    for (const row of rows) {
      try {
        if (row.entity_type === "transactions" && row.operation === "upsert") {
          const response = await gasClient.request("saveTransaction", row.payload, cloudToken);
          transactionsRepo.applyCloudRecord(response.data, { force: true });
        } else if (row.entity_type === "transactions" && row.operation === "delete") {
          const response = await gasClient.request("deleteTransaction", { id: row.entity_id }, cloudToken);
          transactionsRepo.applyCloudRecord(response.data, { force: true });
        } else if (row.entity_type === "suppliers" && row.operation === "upsert") {
          const response = await gasClient.request("saveSupplier", row.payload, cloudToken);
          suppliersRepo.applyCloudRecord(response.data, { force: true });
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
    (response.data.suppliers || []).forEach((supplier) => {
      suppliersRepo.applyCloudRecord(supplier);
    });
    (response.data.transactions || []).forEach((transaction) => {
      transactionsRepo.applyCloudRecord(transaction);
    });
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

      if (!network.configured) {
        const config = getConfig();
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

  return {
    getStatus() {
      const network = networkService.getStatus();
      return {
        ...status,
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
    start() {
      if (timer) return;

      const stopNetworkSubscription = networkService.onStatusChange((network) => {
        emit({
          online: network.online,
          configured: network.configured,
        });

        if (network.online) {
          void runSync("reconnect");
        }
      });

      timer = setInterval(() => {
        void runSync("interval");
      }, Math.max(Number(getConfig().syncIntervalMs || 60000), 10000));

      void runSync("startup");

      return () => {
        stopNetworkSubscription();
        clearInterval(timer);
        timer = null;
      };
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = {
  createSyncService,
};
