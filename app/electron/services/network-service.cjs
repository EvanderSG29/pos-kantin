const { buildMissingGasConfigMessage } = require("../config/default.cjs");

function createNetworkService({ getConfig, gasClient, onDebugLog }) {
  const log = onDebugLog
    ? (level, message, details) => onDebugLog(level, `[Network] ${message}`, details)
    : () => {};
  const listeners = new Set();

  let timer = null;
  let status = {
    online: false,
    configured: false,
    lastCheckedAt: "",
    lastError: "",
  };

  function emit(nextStatus) {
    status = nextStatus;
    listeners.forEach((listener) => {
      listener({ ...status });
    });
  }

  async function checkNow() {
    const config = getConfig();
    const configured = Boolean(String(config.gasWebAppUrl || "").trim());
    const checkedAt = new Date().toISOString();

    log("info", "Checking network status...", { configured, url: config.gasWebAppUrl });

    if (config.configError) {
      log("error", "Config error", { error: config.configError });
      emit({
        online: false,
        configured: false,
        lastCheckedAt: checkedAt,
        lastError: config.configError,
      });
      return { ...status };
    }

    if (!configured) {
      log("warn", "GAS URL not configured");
      emit({
        online: false,
        configured: false,
        lastCheckedAt: checkedAt,
        lastError: buildMissingGasConfigMessage(config),
      });
      return { ...status };
    }

    try {
      log("info", "Sending health check...", { url: config.gasWebAppUrl });
      await gasClient.healthCheck();
      log("success", "Health check passed", { url: config.gasWebAppUrl });
      emit({
        online: true,
        configured: true,
        lastCheckedAt: checkedAt,
        lastError: "",
      });
    } catch (error) {
      log("error", "Health check failed", { error: error.message, url: config.gasWebAppUrl });
      emit({
        online: false,
        configured: true,
        lastCheckedAt: checkedAt,
        lastError: error.message || "Gagal menghubungi GAS.",
      });
    }

    return { ...status };
  }

  return {
    async checkNow() {
      return checkNow();
    },
    getStatus() {
      return { ...status };
    },
    onStatusChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (timer) return;
      const intervalMs = Math.max(Number(getConfig().networkProbeIntervalMs || 20000), 5000);
      void checkNow();
      timer = setInterval(() => {
        void checkNow();
      }, intervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = {
  createNetworkService,
};
