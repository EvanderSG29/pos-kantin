const { buildMissingGasConfigMessage } = require("../config/default.cjs");

function createGasClient({ getConfig, onDebugLog }) {
  const log = onDebugLog
    ? (level, message, details) => onDebugLog(level, `[GAS] ${message}`, details)
    : () => {};
  async function healthCheck() {
    const config = getConfig();
    if (config.configError) {
      log("error", "Config error", { error: config.configError });
      throw new Error(config.configError);
    }
    if (!config.gasWebAppUrl) {
      log("warn", "GAS URL not configured");
      throw new Error(buildMissingGasConfigMessage(config));
    }

    log("info", "Sending health check", { url: config.gasWebAppUrl });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(`${config.gasWebAppUrl}?action=health`, {
        method: "GET",
        signal: controller.signal,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        const preview = text.slice(0, 200).replace(/\n/g, " ");
        log("error", "Health check returned non-JSON", {
          status: response.status,
          contentType: response.headers.get("content-type"),
          preview,
          url: config.gasWebAppUrl,
        });
        throw new Error(`GAS returned HTML instead of JSON. Preview: ${preview}`);
      }

      if (!response.ok || data.success === false) {
        log("error", "Health check failed", { status: response.status, message: data.message });
        throw new Error(data.message || "Health check GAS gagal.");
      }
      log("success", "Health check successful", { version: data.data?.version });
      return data;
    } catch (error) {
      if (error.message.includes("GAS returned HTML")) {
        throw error;
      }
      log("error", "Health check error", { error: error.message, url: config.gasWebAppUrl });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(action, payload = {}, token = "") {
    const config = getConfig();
    if (config.configError) {
      log("error", "Config error in request", { action, error: config.configError });
      throw new Error(config.configError);
    }
    if (!config.gasWebAppUrl) {
      log("warn", "GAS URL not configured in request", { action });
      throw new Error(buildMissingGasConfigMessage(config));
    }

    log("info", `Sending request: ${action}`, { action });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(config.gasWebAppUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({ action, token, payload }),
        signal: controller.signal,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        const preview = text.slice(0, 200).replace(/\n/g, " ");
        log("error", `Request ${action} returned non-JSON`, {
          status: response.status,
          contentType: response.headers.get("content-type"),
          preview,
          url: config.gasWebAppUrl,
        });
        throw new Error(`GAS returned HTML instead of JSON. Preview: ${preview}`);
      }

      if (!response.ok || data.success === false) {
        log("error", `Request failed: ${action}`, { status: response.status, message: data.message });
        throw new Error(data.message || "Permintaan Apps Script gagal.");
      }

      log("success", `Request successful: ${action}`, { success: data.success });
      return data;
    } catch (error) {
      if (error.message.includes("GAS returned HTML")) {
        throw error;
      }
      log("error", `Request error: ${action}`, { error: error.message });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    healthCheck,
    request,
  };
}

module.exports = {
  createGasClient,
};
