const { contextBridge, ipcRenderer } = require("electron");

function normalizeInvokeError(error) {
  const message = String(error?.message || error || "");
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "");

  return new Error(cleaned || "Terjadi kesalahan saat memanggil proses utama.");
}

function invoke(channel, payload = {}) {
  return ipcRenderer.invoke(channel, payload)
    .catch((error) => {
      throw normalizeInvokeError(error);
    });
}

contextBridge.exposeInMainWorld("posDebug", {
  onSyncStatus(callback) {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("sync:status", listener);
    return () => ipcRenderer.removeListener("sync:status", listener);
  },

  onDebugLog(callback) {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("debug:log", listener);
    return () => ipcRenderer.removeListener("debug:log", listener);
  },

  getInitialState() {
    return invoke("debug:get-initial-state");
  },

  setSyncSettings(payload) {
    return invoke("debug:set-sync-settings", payload);
  },

  toggleOverlay(enabled) {
    return invoke("debug:toggle-overlay", enabled);
  },
});
