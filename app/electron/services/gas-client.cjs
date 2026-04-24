const { buildMissingGasConfigMessage } = require("../config/default.cjs");

function createGasClient({ getConfig }) {
  async function healthCheck() {
    const config = getConfig();
    if (config.configError) {
      throw new Error(config.configError);
    }
    if (!config.gasWebAppUrl) {
      throw new Error(buildMissingGasConfigMessage(config));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(`${config.gasWebAppUrl}?action=health`, {
        method: "GET",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.message || "Health check GAS gagal.");
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(action, payload = {}, token = "") {
    const config = getConfig();
    if (config.configError) {
      throw new Error(config.configError);
    }
    if (!config.gasWebAppUrl) {
      throw new Error(buildMissingGasConfigMessage(config));
    }

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

      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.message || "Permintaan Apps Script gagal.");
      }

      return data;
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
