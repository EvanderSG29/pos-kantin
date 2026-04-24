const fs = require("node:fs");
const path = require("node:path");

const MIN_SYNC_INTERVAL_MS = 10000;
const MAX_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONFIG = Object.freeze({
  appName: "POS Kantin Desktop",
  gasWebAppUrl: "",
  autoSyncEnabled: false,
  requestTimeoutMs: 15000,
  sessionTtlHours: 8,
  syncIntervalMs: 60000,
  networkProbeIntervalMs: 20000,
});

function coerceSyncIntervalMs(value, fallback = DEFAULT_CONFIG.syncIntervalMs) {
  const numeric = Number(value);
  const fallbackNumeric = Number(fallback);
  const base = Number.isFinite(numeric) ? numeric : fallbackNumeric;
  const rounded = Math.round(Number.isFinite(base) ? base : DEFAULT_CONFIG.syncIntervalMs);
  return Math.min(Math.max(rounded, MIN_SYNC_INTERVAL_MS), MAX_SYNC_INTERVAL_MS);
}

function validateSyncIntervalMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Interval sync otomatis harus berupa angka.");
  }

  const rounded = Math.round(numeric);
  if (rounded < MIN_SYNC_INTERVAL_MS) {
    throw new Error("Interval sync otomatis minimal 10 detik.");
  }

  if (rounded > MAX_SYNC_INTERVAL_MS) {
    throw new Error("Interval sync otomatis maksimal 24 jam.");
  }

  return rounded;
}

function normalizeSyncSettings(settings = {}) {
  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(settings, "autoSyncEnabled")) {
    normalized.autoSyncEnabled = settings.autoSyncEnabled === true;
  }

  if (Object.prototype.hasOwnProperty.call(settings, "syncIntervalMs")) {
    normalized.syncIntervalMs = validateSyncIntervalMs(settings.syncIntervalMs);
  }

  return normalized;
}

function pickSyncSettings(config = {}) {
  return {
    autoSyncEnabled: config.autoSyncEnabled === true,
    syncIntervalMs: coerceSyncIntervalMs(config.syncIntervalMs),
    configPath: config.configPath || "",
  };
}

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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config harus berupa object JSON.");
      }

      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        autoSyncEnabled: parsed.autoSyncEnabled === true,
        syncIntervalMs: coerceSyncIntervalMs(parsed.syncIntervalMs),
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

  function updateSyncSettings(settings = {}) {
    const configPath = ensureConfigFile();
    let parsed = {};

    try {
      const raw = fs.readFileSync(configPath, "utf8");
      parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config harus berupa object JSON.");
      }
    } catch (error) {
      throw new Error(buildInvalidConfigMessage(configPath, error));
    }

    const nextConfig = {
      ...parsed,
      ...normalizeSyncSettings(settings),
    };

    fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    cachedConfig = null;
    return pickSyncSettings(loadConfig());
  }

  return {
    getConfig() {
      return cachedConfig ?? loadConfig();
    },
    getSyncSettings() {
      return pickSyncSettings(cachedConfig ?? loadConfig());
    },
    reloadConfig() {
      cachedConfig = null;
      return loadConfig();
    },
    updateSyncSettings,
    getConfigPath,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  MAX_SYNC_INTERVAL_MS,
  MIN_SYNC_INTERVAL_MS,
  buildInvalidConfigMessage,
  buildMissingGasConfigMessage,
  coerceSyncIntervalMs,
  createRuntimeConfigManager,
  normalizeSyncSettings,
  pickSyncSettings,
  validateSyncIntervalMs,
};
