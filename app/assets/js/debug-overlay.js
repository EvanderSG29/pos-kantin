/**
 * Debug Error Overlay for Electron Renderer (Dev Mode Only)
 *
 * Classic script (non-module) yang dimuat sebelum script module utama.
 * Hanya aktif saat debugUiEnabled === true (npm run dev / app tidak packaged).
 *
 * Fitur:
 * - Tangkap error runtime, syntax, unhandled promise rejection, console.error
 * - Deteksi kegagalan load resource (JS/CSS/image)
 * - Buffer error awal sampai mode debug diketahui
 * - Dedupe error berulang dengan counter
 * - Maksimal 20 error terbaru
 * - Panel detail dengan copy/clear
 * - Menggunakan textContent untuk keamanan
 */
(function () {
  "use strict";

  const MAX_ERRORS = 20;
  const ERROR_BUFFER = [];
  let debugUiEnabled = false;
  let overlayReady = false;
  let panelVisible = false;
  let errorIdCounter = 0;
  const errorRegistry = new Map();

  const STORAGE_KEY = "posDebugOverlayPanelVisible";

  function isPanelEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function setPanelEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    } catch {}
  }

  window.posDebugTogglePanel = function(enabled) {
    setPanelEnabled(enabled);
    if (enabled) {
      createOverlay();
      updateOverlay();
    } else {
      destroyOverlay();
    }
  };

  function generateId() {
    return ++errorIdCounter;
  }

  function getErrorSignature(error) {
    const parts = [
      error.message || "",
      error.source || "",
      error.lineno || "0",
      error.colno || "0",
      error.stack?.split("\n")[0] || "",
    ];
    return parts.join("|");
  }

  function normalizeErrorEvent(event, type) {
    const timestamp = new Date().toISOString();
    const page = typeof window !== "undefined" ? window.location?.pathname || "unknown" : "unknown";

    if (type === "error" && event instanceof ErrorEvent) {
      return {
        id: generateId(),
        type: "error",
        message: event.message || "Unknown error",
        source: event.filename || "",
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        stack: event.error?.stack || "",
        timestamp,
        page,
        count: 1,
      };
    }

    if (type === "unhandledrejection") {
      const reason = event.reason;
      const isError = reason instanceof Error;
      return {
        id: generateId(),
        type: "unhandledrejection",
        message: isError ? reason.message : String(reason),
        source: isError ? reason.fileName || "" : "",
        lineno: isError ? reason.lineNumber || 0 : 0,
        colno: isError ? reason.columnNumber || 0 : 0,
        stack: isError ? reason.stack || "" : "",
        timestamp,
        page,
        count: 1,
      };
    }

    if (type === "resource") {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase() || "unknown";
      const src = target?.src || target?.href || "";
      return {
        id: generateId(),
        type: "resource",
        message: `Failed to load ${tagName}: ${src}`,
        source: src,
        lineno: 0,
        colno: 0,
        stack: "",
        timestamp,
        page,
        count: 1,
      };
    }

    if (type === "console.error") {
      const args = event.args || [];
      const messages = args.map((arg) => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      });
      return {
        id: generateId(),
        type: "console.error",
        message: messages.join(" ") || "console.error called",
        source: "",
        lineno: 0,
        colno: 0,
        stack: "",
        timestamp,
        page,
        count: 1,
      };
    }

    return {
      id: generateId(),
      type: "unknown",
      message: String(event),
      source: "",
      lineno: 0,
      colno: 0,
      stack: "",
      timestamp,
      page,
      count: 1,
    };
  }

  function addError(normalizedError) {
    const signature = getErrorSignature(normalizedError);

    if (errorRegistry.has(signature)) {
      const existing = errorRegistry.get(signature);
      existing.count++;
      existing.timestamp = normalizedError.timestamp;
      updateOverlay();
      return;
    }

    errorRegistry.set(signature, normalizedError);

    while (errorRegistry.size > MAX_ERRORS) {
      let oldest = null;
      let oldestTime = Infinity;
      for (const [sig, err] of errorRegistry) {
        if (err.id < oldestTime) {
          oldestTime = err.id;
          oldest = sig;
        }
      }
      if (oldest) {
        errorRegistry.delete(oldest);
      }
    }

    updateOverlay();
    showToast(normalizedError);
  }

  function handleErrorEvent(event) {
    if (!debugUiEnabled) {
      ERROR_BUFFER.push({ event, type: "error" });
      return;
    }
    const normalized = normalizeErrorEvent(event, "error");
    addError(normalized);
  }

  function handleUnhandledRejection(event) {
    if (!debugUiEnabled) {
      ERROR_BUFFER.push({ event, type: "unhandledrejection" });
      return;
    }
    const normalized = normalizeErrorEvent(event, "unhandledrejection");
    addError(normalized);
  }

  function handleResourceError(event) {
    const target = event.target;
    if (!target || !["LINK", "SCRIPT", "IMG", "SOURCE", "VIDEO", "AUDIO"].includes(target.tagName)) {
      return;
    }
    if (!debugUiEnabled) {
      ERROR_BUFFER.push({ event, type: "resource" });
      return;
    }
    const normalized = normalizeErrorEvent(event, "resource");
    addError(normalized);
  }

  function handleConsoleError(...args) {
    if (!debugUiEnabled) {
      ERROR_BUFFER.push({ event: { args }, type: "console.error" });
      return;
    }
    const normalized = normalizeErrorEvent({ args }, "console.error");
    addError(normalized);
  }

  function injectStyles() {
    if (document.getElementById("pos-debug-overlay-styles")) return;

    const style = document.createElement("style");
    style.id = "pos-debug-overlay-styles";
    style.textContent = `
      .pos-debug-overlay-container {
        --dbg-bg: #1e1e2e;
        --dbg-text: #cdd6f4;
        --dbg-accent: #f38ba8;
        --dbg-secondary: #89b4fa;
        --dbg-border: #313244;
        --dbg-success: #a6e3a1;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 13px;
        line-height: 1.5;
      }
      .pos-debug-toast {
        position: fixed;
        top: 16px;
        right: 16px;
        background: var(--dbg-bg);
        color: var(--dbg-accent);
        border: 1px solid var(--dbg-accent);
        border-radius: 6px;
        padding: 12px 16px;
        max-width: 400px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        animation: posDebugSlideIn 0.2s ease;
      }
      .pos-debug-toast.pos-debug-toast-hiding {
        animation: posDebugSlideOut 0.2s ease forwards;
      }
      @keyframes posDebugSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes posDebugSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      .pos-debug-panel {
        position: fixed;
        bottom: 16px;
        right: 16px;
        width: 600px;
        max-width: calc(100vw - 32px);
        max-height: 50vh;
        background: var(--dbg-bg);
        color: var(--dbg-text);
        border: 1px solid var(--dbg-border);
        border-radius: 8px;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      }
      .pos-debug-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--dbg-border);
        background: rgba(0,0,0,0.2);
        border-radius: 8px 8px 0 0;
      }
      .pos-debug-panel-title {
        font-weight: 600;
        color: var(--dbg-accent);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pos-debug-panel-actions {
        display: flex;
        gap: 8px;
      }
      .pos-debug-btn {
        background: var(--dbg-border);
        color: var(--dbg-text);
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        transition: background 0.15s;
      }
      .pos-debug-btn:hover {
        background: var(--dbg-secondary);
        color: var(--dbg-bg);
      }
      .pos-debug-btn-primary {
        background: var(--dbg-secondary);
        color: var(--dbg-bg);
      }
      .pos-debug-btn-primary:hover {
        opacity: 0.9;
      }
      .pos-debug-panel-body {
        overflow-y: auto;
        padding: 12px;
        max-height: calc(50vh - 60px);
      }
      .pos-debug-error-item {
        padding: 10px 12px;
        margin-bottom: 8px;
        background: rgba(0,0,0,0.2);
        border-left: 3px solid var(--dbg-accent);
        border-radius: 0 4px 4px 0;
      }
      .pos-debug-error-item:last-child {
        margin-bottom: 0;
      }
      .pos-debug-error-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .pos-debug-error-type {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--dbg-accent);
        font-weight: 600;
      }
      .pos-debug-error-count {
        font-size: 11px;
        background: var(--dbg-accent);
        color: var(--dbg-bg);
        padding: 2px 8px;
        border-radius: 12px;
        font-weight: 600;
      }
      .pos-debug-error-count[pos-debug-count="1"] {
        display: none;
      }
      .pos-debug-error-message {
        font-weight: 500;
        margin-bottom: 4px;
        word-break: break-word;
      }
      .pos-debug-error-source {
        font-size: 11px;
        color: var(--dbg-secondary);
        margin-bottom: 4px;
      }
      .pos-debug-error-meta {
        font-size: 11px;
        color: #7f849c;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .pos-debug-error-stack {
        margin-top: 8px;
        padding: 8px;
        background: rgba(0,0,0,0.3);
        border-radius: 4px;
        font-size: 11px;
        color: #9399b2;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 150px;
        overflow-y: auto;
        display: none;
      }
      .pos-debug-error-stack[pos-debug-visible] {
        display: block;
      }
      .pos-debug-stack-toggle {
        font-size: 11px;
        color: var(--dbg-secondary);
        cursor: pointer;
        margin-top: 6px;
        display: inline-block;
      }
      .pos-debug-stack-toggle:hover {
        text-decoration: underline;
      }
      .pos-debug-empty {
        text-align: center;
        padding: 24px;
        color: #7f849c;
        font-style: italic;
      }
      .pos-debug-panel-collapsed {
        max-height: 48px;
      }
      .pos-debug-panel-collapsed .pos-debug-panel-body {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function createOverlay() {
    if (document.getElementById("pos-debug-overlay-container")) return;
    if (!isPanelEnabled()) return;

    injectStyles();

    const container = document.createElement("div");
    container.id = "pos-debug-overlay-container";
    container.className = "pos-debug-overlay-container";

    const panel = document.createElement("div");
    panel.id = "pos-debug-panel";
    panel.className = "pos-debug-panel";

    const header = document.createElement("div");
    header.className = "pos-debug-panel-header";

    const title = document.createElement("div");
    title.className = "pos-debug-panel-title";
    title.innerHTML = "⚠ Debug Errors";

    const actions = document.createElement("div");
    actions.className = "pos-debug-panel-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "pos-debug-btn";
    toggleBtn.textContent = "Collapse";
    toggleBtn.onclick = () => {
      panel.classList.toggle("pos-debug-panel-collapsed");
      toggleBtn.textContent = panel.classList.contains("pos-debug-panel-collapsed") ? "Expand" : "Collapse";
    };

    const clearBtn = document.createElement("button");
    clearBtn.className = "pos-debug-btn";
    clearBtn.textContent = "Clear";
    clearBtn.onclick = clearErrors;

    const copyBtn = document.createElement("button");
    copyBtn.className = "pos-debug-btn pos-debug-btn-primary";
    copyBtn.textContent = "Copy All";
    copyBtn.onclick = copyAllErrors;

    actions.appendChild(toggleBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(copyBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.id = "pos-debug-panel-body";
    body.className = "pos-debug-panel-body";

    panel.appendChild(header);
    panel.appendChild(body);
    container.appendChild(panel);
    document.body.appendChild(container);

    overlayReady = true;
    updateOverlay();
  }

  function updateOverlay() {
    if (!overlayReady) return;

    const body = document.getElementById("pos-debug-panel-body");
    if (!body) return;

    const errors = Array.from(errorRegistry.values()).sort((a, b) => b.id - a.id);

    if (errors.length === 0) {
      body.innerHTML = '<div class="pos-debug-empty">No errors captured</div>';
      return;
    }

    body.innerHTML = "";
    errors.forEach((error) => {
      const item = document.createElement("div");
      item.className = "pos-debug-error-item";

      const header = document.createElement("div");
      header.className = "pos-debug-error-header";

      const type = document.createElement("span");
      type.className = "pos-debug-error-type";
      type.textContent = error.type;

      const count = document.createElement("span");
      count.className = "pos-debug-error-count";
      count.setAttribute("pos-debug-count", error.count);
      count.textContent = error.count;

      header.appendChild(type);
      header.appendChild(count);

      const message = document.createElement("div");
      message.className = "pos-debug-error-message";
      message.textContent = error.message;

      item.appendChild(header);
      item.appendChild(message);

      if (error.source) {
        const source = document.createElement("div");
        source.className = "pos-debug-error-source";
        const lineInfo = error.lineno ? `:${error.lineno}${error.colno ? ":" + error.colno : ""}` : "";
        source.textContent = `${error.source}${lineInfo}`;
        item.appendChild(source);
      }

      const meta = document.createElement("div");
      meta.className = "pos-debug-error-meta";
      meta.innerHTML = `<span>${new Date(error.timestamp).toLocaleTimeString()}</span><span>${error.page}</span>`;
      item.appendChild(meta);

      if (error.stack) {
        const stack = document.createElement("pre");
        stack.className = "pos-debug-error-stack";
        stack.id = `pos-debug-stack-${error.id}`;
        stack.textContent = error.stack;

        const toggle = document.createElement("span");
        toggle.className = "pos-debug-stack-toggle";
        toggle.textContent = "Show stack trace";
        toggle.onclick = () => {
          const isVisible = stack.hasAttribute("pos-debug-visible");
          if (isVisible) {
            stack.removeAttribute("pos-debug-visible");
            toggle.textContent = "Show stack trace";
          } else {
            stack.setAttribute("pos-debug-visible", "");
            toggle.textContent = "Hide stack trace";
          }
        };

        item.appendChild(toggle);
        item.appendChild(stack);
      }

      body.appendChild(item);
    });
  }

  function showToast(error) {
    if (!isPanelEnabled()) return;
    const container = document.getElementById("pos-debug-overlay-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "pos-debug-toast";

    const type = document.createElement("strong");
    type.textContent = error.type.toUpperCase();

    const msg = document.createElement("div");
    msg.textContent = error.message.length > 80 ? error.message.slice(0, 80) + "..." : error.message;
    msg.style.marginTop = "4px";

    toast.appendChild(type);
    toast.appendChild(msg);
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("pos-debug-toast-hiding");
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  function clearErrors() {
    errorRegistry.clear();
    updateOverlay();
  }

  function copyAllErrors() {
    const errors = Array.from(errorRegistry.values()).sort((a, b) => b.id - a.id);
    if (errors.length === 0) return;

    const text = errors
      .map((err) => {
        const parts = [
          `[${err.type}] ${err.message}`,
          err.source ? `Source: ${err.source}:${err.lineno}:${err.colno}` : "",
          `Time: ${err.timestamp}`,
          `Page: ${err.page}`,
          err.count > 1 ? `Count: ${err.count}` : "",
          err.stack ? `Stack:\n${err.stack}` : "",
        ];
        return parts.filter(Boolean).join("\n");
      })
      .join("\n\n---\n\n");

    navigator.clipboard
      .writeText(text)
      .then(() => {
        const btn = document.querySelector(".pos-debug-btn-primary");
        if (btn) {
          const original = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = original), 1500);
        }
      })
      .catch(() => {
        console.error("Failed to copy errors to clipboard");
      });
  }

  function flushBuffer() {
    if (!debugUiEnabled) return;

    while (ERROR_BUFFER.length > 0) {
      const { event, type } = ERROR_BUFFER.shift();
      const normalized = normalizeErrorEvent(event, type);
      addError(normalized);
    }
  }

  function init() {
    window.addEventListener("error", handleErrorEvent);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleResourceError, true);

    const originalConsoleError = console.error;
    console.error = function (...args) {
      originalConsoleError.apply(console, args);
      handleConsoleError(...args);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", checkAndInitOverlay);
    } else {
      checkAndInitOverlay();
    }
  }

  function destroyOverlay() {
    const container = document.getElementById("pos-debug-overlay-container");
    if (container) {
      container.remove();
    }
    overlayReady = false;
  }

  function checkAndInitOverlay() {
    const checkPosDesktop = () => {
      if (typeof window.posDesktop === "undefined") {
        setTimeout(checkPosDesktop, 100);
        return;
      }

      if (window.posDesktop.debug?.onToggleOverlay) {
        window.posDesktop.debug.onToggleOverlay((enabled) => {
          window.posDebugTogglePanel?.(enabled);
        });
      }

      window.posDesktop.app
        .getInfo()
        .then((info) => {
          debugUiEnabled = info?.data?.debugUiEnabled === true;
          if (debugUiEnabled && isPanelEnabled()) {
            createOverlay();
            flushBuffer();
          }
        })
        .catch((err) => {
          console.error("Failed to get app info for debug overlay:", err);
        });
    };

    setTimeout(checkPosDesktop, 0);
  }

  init();
})();
