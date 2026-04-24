import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createSyncService } = require("../app/electron/services/sync-service.cjs");

function createHarness(options = {}) {
  const requests = [];
  const timers = [];
  const markedSuccess = [];
  const markedSettled = [];
  const networkListeners = new Set();
  let config = {
    autoSyncEnabled: false,
    syncIntervalMs: 60000,
    configError: "",
  };
  let networkStatus = {
    online: true,
    configured: true,
    lastError: "",
  };

  const service = createSyncService({
    authService: {
      getCurrentSession() {
        return { cloudToken: "cloud-token" };
      },
      refreshActiveSessionUser() {},
    },
    db: {
      prepare() {
        return {
          get() {
            return undefined;
          },
          run() {},
        };
      },
    },
    buyersRepo: {
      upsertFromCloud() {},
    },
    dailyFinanceRepo: {
      applyCloudChangeEntryRecord() {},
      applyCloudDetail() {},
      applyCloudFinanceRecord() {},
    },
    gasClient: {
      async request(action, payload, token) {
        requests.push({ action, payload, token });
        if (action === "saveUser") {
          return { data: { ...payload, fullName: payload.fullName || "User Sync" } };
        }
        if (action === "saveDailyFinance") {
          return {
            data: {
              finance: {
                id: payload.id,
                financeDate: payload.financeDate,
                grossAmount: payload.grossAmount,
                changeTotal: payload.changeTotal,
                netAmount: payload.grossAmount - payload.changeTotal,
                createdByUserId: "USR-1",
                createdByName: "Admin",
                createdAt: "2026-04-24T00:00:00.000Z",
                updatedAt: "2026-04-24T00:00:00.000Z",
              },
              changeEntries: payload.changeEntries || [],
            },
          };
        }
        if (action === "updateChangeEntryStatus") {
          return {
            data: {
              id: payload.id,
              dailyFinanceId: "FIN-1",
              financeDate: "2026-04-24",
              buyerId: "BYR-1",
              buyerNameSnapshot: "Ari",
              changeAmount: 5000,
              status: payload.status,
              createdByUserId: "USR-1",
              createdByName: "Admin",
              createdAt: "2026-04-24T00:00:00.000Z",
              updatedAt: "2026-04-24T00:00:00.000Z",
            },
          };
        }
        if (action === "settleSupplierPayout") {
          return {
            data: {
              payout: {
                id: payload.id,
                supplierId: payload.supplierId,
                supplierNameSnapshot: "Uni",
                periodStart: "2026-04-24",
                periodEnd: "2026-04-24",
                dueDate: payload.dueDate,
                transactionCount: 1,
                totalGrossSales: 10000,
                totalProfit: 3000,
                totalCommission: 1000,
                totalSupplierNetAmount: 9000,
                paidAt: "2026-04-24T00:00:00.000Z",
                paidByUserId: "USR-1",
                paidByName: "Admin",
                createdAt: "2026-04-24T00:00:00.000Z",
                updatedAt: "2026-04-24T00:00:00.000Z",
              },
            },
          };
        }
        return {
          data: {
            users: [],
            buyers: [],
            savings: [],
            suppliers: [],
            transactions: [],
            dailyFinance: [],
            changeEntries: [],
            supplierPayouts: [],
            cursors: {},
          },
        };
      },
    },
    getConfig() {
      return config;
    },
    networkService: {
      async checkNow() {
        return { ...networkStatus };
      },
      getStatus() {
        return { ...networkStatus };
      },
      onStatusChange(listener) {
        networkListeners.add(listener);
        return () => networkListeners.delete(listener);
      },
    },
    savingsRepo: {
      upsertFromCloud() {},
    },
    suppliersRepo: {
      applyCloudRecord() {},
    },
    supplierPayoutsRepo: {
      applyCloudRecord() {},
      upsertFromCloud() {},
    },
    syncQueueRepo: {
      countPending() {
        return options.dueRows?.length || 0;
      },
      getNextRetryAt() {
        return "";
      },
      listDue() {
        return options.dueRows || [];
      },
      markSuccess(id) {
        markedSuccess.push(id);
      },
      markFailure() {},
    },
    transactionsRepo: {
      applyCloudRecord() {},
      markTransactionsSettled(transactionIds, payoutId) {
        markedSettled.push({ transactionIds, payoutId });
      },
    },
    usersRepo: {
      applyCloudRecord() {},
      upsertFromCloud() {},
    },
    setIntervalFn(callback, intervalMs) {
      const handle = { callback, intervalMs, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearIntervalFn(handle) {
      handle.cleared = true;
    },
  });

  return {
    service,
    requests,
    markedSettled,
    markedSuccess,
    timers,
    setConfig(nextConfig) {
      config = {
        ...config,
        ...nextConfig,
      };
    },
    emitNetwork(nextStatus) {
      networkStatus = {
        ...networkStatus,
        ...nextStatus,
      };
      networkListeners.forEach((listener) => listener({ ...networkStatus }));
    },
  };
}

{
  const harness = createHarness();
  harness.service.start();

  assert.equal(harness.timers.length, 0);
  assert.equal(harness.requests.length, 0);

  await harness.service.runAuto("login");
  assert.equal(harness.requests.length, 0);

  harness.emitNetwork({ online: true });
  assert.equal(harness.requests.length, 0);

  await harness.service.runNow("manual");
  assert.deepEqual(harness.requests.map((request) => request.action), ["syncPull"]);

  harness.service.stop();
}

{
  const harness = createHarness({
    dueRows: [
      {
        id: 1,
        entity_type: "users",
        entity_id: "USR-1",
        operation: "upsert",
        payload: {
          id: "USR-1",
          fullName: "User Sync",
          nickname: "User",
          email: "user@example.test",
          role: "petugas",
          status: "aktif",
        },
        retry_count: 0,
      },
      {
        id: 2,
        entity_type: "daily_finance",
        entity_id: "FIN-1",
        operation: "upsert",
        payload: {
          id: "FIN-1",
          financeDate: "2026-04-24",
          grossAmount: 10000,
          changeTotal: 0,
          notes: "",
          changeEntries: [],
        },
        retry_count: 0,
      },
      {
        id: 3,
        entity_type: "change_entries",
        entity_id: "CHG-1",
        operation: "status",
        payload: {
          id: "CHG-1",
          status: "selesai",
        },
        retry_count: 0,
      },
      {
        id: 4,
        entity_type: "supplier_payouts",
        entity_id: "PAY-1",
        operation: "settle",
        payload: {
          id: "PAY-1",
          supplierId: "SUP-1",
          dueDate: "2026-04-24",
          transactionIds: ["TRX-1"],
        },
        retry_count: 0,
      },
    ],
  });

  await harness.service.runNow("manual");

  assert.deepEqual(harness.requests.map((request) => request.action), [
    "saveUser",
    "saveDailyFinance",
    "updateChangeEntryStatus",
    "settleSupplierPayout",
    "syncPull",
  ]);
  assert.deepEqual(harness.markedSuccess, [1, 2, 3, 4]);
  assert.deepEqual(harness.markedSettled, [
    {
      transactionIds: ["TRX-1"],
      payoutId: "PAY-1",
    },
  ]);
}

{
  const harness = createHarness();
  harness.service.start();

  harness.setConfig({
    autoSyncEnabled: true,
    syncIntervalMs: 30000,
  });
  await harness.service.applySettings({ runOnEnable: true });

  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].intervalMs, 30000);
  assert.deepEqual(harness.requests.map((request) => request.action), ["syncPull"]);

  harness.setConfig({ syncIntervalMs: 300000 });
  await harness.service.applySettings();

  assert.equal(harness.timers.length, 2);
  assert.equal(harness.timers[0].cleared, true);
  assert.equal(harness.timers[1].intervalMs, 300000);
  assert.deepEqual(harness.requests.map((request) => request.action), ["syncPull"]);

  harness.setConfig({ autoSyncEnabled: false });
  await harness.service.applySettings();

  assert.equal(harness.timers[1].cleared, true);
  assert.equal(harness.service.getStatus().autoSyncEnabled, false);

  harness.service.stop();
}

console.log("sync service tests passed");
