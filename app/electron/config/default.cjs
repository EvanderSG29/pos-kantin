const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CONFIG = Object.freeze({
  appName: "POS Kantin Desktop",
  gasWebAppUrl: "",
  requestTimeoutMs: 15000,
  sessionTtlHours: 8,
  syncIntervalMs: 60000,
  networkProbeIntervalMs: 20000,
});

function buildMissingGasConfigMessage(configOrPath = {}) {
  const configPath = typeof configOrPath === "string"
    ? configOrPath
    : String(configOrPath.configPath || "").trim();

  if (!configPath) {
    return "GAS Web App URL belum dikonfigurasi. Isi field gasWebAppUrl di file config.local.json.";
  }

  return `GAS Web App URL belum dikonfigurasi. Isi field gasWebAppUrl di ${configPath}.`;
}

function buildInvalidConfigMessage(configPath, error) {
  const reason = String(error?.message || error || "Format JSON tidak valid.");
  if (!configPath) {
    return `Config lokal tidak valid: ${reason}`;
  }

  return `Config lokal tidak valid di ${configPath}: ${reason}`;
}

function createRuntimeConfigManager(electronApp) {
  let cachedConfig = null;
  let cachedPath = "";

  function getConfigPath() {
    if (cachedPath) return cachedPath;
    cachedPath = path.join(electronApp.getPath("userData"), "config.local.json");
    return cachedPath;
  }

  function ensureConfigFile() {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) return configPath;

    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
    return configPath;
  }

  function loadConfig() {
    const configPath = ensureConfigFile();
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw);
      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        configPath,
        isConfigured: Boolean(String(parsed.gasWebAppUrl || "").trim()),
        configError: "",
      };
    } catch (error) {
      cachedConfig = {
        ...DEFAULT_CONFIG,
        configPath,
        isConfigured: false,
        configError: buildInvalidConfigMessage(configPath, error),
      };
    }

    return cachedConfig;
  }

  return {
    getConfig() {
      return cachedConfig ?? loadConfig();
    },
    reloadConfig() {
      cachedConfig = null;
      return loadConfig();
    },
    getConfigPath,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  buildInvalidConfigMessage,
  buildMissingGasConfigMessage,
  createRuntimeConfigManager,
};
