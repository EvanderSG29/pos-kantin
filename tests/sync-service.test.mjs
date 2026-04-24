import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createSyncService } = require("../app/electron/services/sync-service.cjs");

function createHarness() {
  const requests = [];
  const timers = [];
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
    gasClient: {
      async request(action, payload, token) {
        requests.push({ action, payload, token });
        return {
          data: {
            users: [],
            suppliers: [],
            transactions: [],
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
    suppliersRepo: {
      applyCloudRecord() {},
    },
    syncQueueRepo: {
      countPending() {
        return 0;
      },
      getNextRetryAt() {
        return "";
      },
      listDue() {
        return [];
      },
      markSuccess() {},
      markFailure() {},
    },
    transactionsRepo: {
      applyCloudRecord() {},
    },
    usersRepo: {
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
