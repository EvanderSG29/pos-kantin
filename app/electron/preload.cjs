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

let overlayToggleCallback = null;

ipcRenderer.on("debug:toggle-overlay", (_event, enabled) => {
  if (typeof overlayToggleCallback === "function") {
    overlayToggleCallback(enabled);
  }
});

contextBridge.exposeInMainWorld("posDesktop", {
  debug: {
    onToggleOverlay(callback) {
      overlayToggleCallback = callback;
      return () => {
        overlayToggleCallback = null;
      };
    },
  },
  app: {
    getInfo() {
      return invoke("app:get-info");
    },
  },
  auth: {
    login(payload) {
      return invoke("auth:login", payload);
    },
    logout(payload) {
      return invoke("auth:logout", payload);
    },
    restore(payload) {
      return invoke("auth:restore", payload);
    },
  },
  dashboard: {
    summary(payload) {
      return invoke("dashboard:summary", payload);
    },
  },
  suppliers: {
    list(payload) {
      return invoke("suppliers:list", payload);
    },
    save(payload) {
      return invoke("suppliers:save", payload);
    },
  },
  sync: {
    getStatus() {
      return invoke("sync:get-status");
    },
    onStatus(callback) {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("sync:status", listener);
      return () => ipcRenderer.removeListener("sync:status", listener);
    },
    runNow() {
      return invoke("sync:run-now");
    },
  },
  transactions: {
    list(payload) {
      return invoke("transactions:list", payload);
    },
    remove(payload) {
      return invoke("transactions:remove", payload);
    },
    save(payload) {
      return invoke("transactions:save", payload);
    },
  },
});
