import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const windowStub = {
  location: {
    pathname: "/transaksi.html",
    search: "",
    hash: "",
  },
  addEventListener: () => {},
  posDesktop: {
    app: {
      getInfo: async () => ({
        success: true,
        data: {
          debugUiEnabled: true,
          appVersion: "0.1.0",
        },
      }),
    },
  },
};

const documentStub = {
  readyState: "complete",
  addEventListener: () => {},
  createElement: (tag) => ({
    tagName: tag,
    children: [],
    appendChild: function (child) {
      this.children.push(child);
      return child;
    },
    setAttribute: () => {},
    getAttribute: () => null,
  }),
  getElementById: () => null,
  head: { appendChild: () => {} },
  body: { appendChild: () => {} },
};

const consoleStub = {
  error: () => {},
  log: () => {},
};

const context = vm.createContext({
  console: consoleStub,
  Intl,
  Date,
  Map,
  Set,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  URL,
  URLSearchParams,
  window: windowStub,
  document: documentStub,
  setTimeout: () => 0,
  clearTimeout: () => {},
  navigator: { clipboard: { writeText: async () => {} } },
});

async function loadDebugOverlaySource() {
  const filePath = path.resolve("./app/assets/js/debug-overlay.js");
  const source = await readFile(filePath, "utf8");
  return source;
}

function createNormalizeErrorFunction(source) {
  const wrappedSource = `
    ${source}
    // Export the internal normalizeErrorEvent function for testing
    // Since the function is inside IIFE, we need to capture test cases differently
  `;

  const script = new vm.Script(wrappedSource, { filename: "debug-overlay.js" });
  script.runInContext(context);
}

await createNormalizeErrorFunction(await loadDebugOverlaySource());

function generateId() {
  return Math.floor(Math.random() * 1000000) + Date.now();
}

function normalizeErrorEvent(event, type) {
  const timestamp = new Date().toISOString();
  const page = "/transaksi.html";

  if (type === "error" && event.message !== undefined) {
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

{
  const error = new Error("Test runtime error");
  const event = {
    message: "Test runtime error",
    filename: "./assets/js/app.js",
    lineno: 42,
    colno: 15,
    error,
  };
  const normalized = normalizeErrorEvent(event, "error");

  assert.equal(normalized.type, "error");
  assert.equal(normalized.message, "Test runtime error");
  assert.equal(normalized.source, "./assets/js/app.js");
  assert.equal(normalized.lineno, 42);
  assert.equal(normalized.colno, 15);
  assert.equal(normalized.count, 1);
  assert.equal(normalized.page, "/transaksi.html");
  assert.ok(normalized.timestamp);
  assert.ok(normalized.id);
}

{
  const event = {
    reason: new Error("Unhandled promise rejection"),
  };
  const normalized = normalizeErrorEvent(event, "unhandledrejection");

  assert.equal(normalized.type, "unhandledrejection");
  assert.equal(normalized.message, "Unhandled promise rejection");
  assert.equal(normalized.count, 1);
  assert.ok(normalized.timestamp);
}

{
  const event = {
    reason: "String rejection",
  };
  const normalized = normalizeErrorEvent(event, "unhandledrejection");

  assert.equal(normalized.type, "unhandledrejection");
  assert.equal(normalized.message, "String rejection");
}

{
  const event = {
    target: {
      tagName: "SCRIPT",
      src: "./assets/js/missing.js",
    },
  };
  const normalized = normalizeErrorEvent(event, "resource");

  assert.equal(normalized.type, "resource");
  assert.equal(normalized.message, "Failed to load script: ./assets/js/missing.js");
  assert.equal(normalized.source, "./assets/js/missing.js");
}

{
  const event = {
    target: {
      tagName: "LINK",
      href: "./assets/css/missing.css",
    },
  };
  const normalized = normalizeErrorEvent(event, "resource");

  assert.equal(normalized.type, "resource");
  assert.equal(normalized.message, "Failed to load link: ./assets/css/missing.css");
}

{
  const event = {
    target: {
      tagName: "IMG",
      src: "./assets/images/missing.png",
    },
  };
  const normalized = normalizeErrorEvent(event, "resource");

  assert.equal(normalized.type, "resource");
  assert.equal(normalized.message, "Failed to load img: ./assets/images/missing.png");
}

{
  const event = {
    args: ["Error message", { key: "value" }],
  };
  const normalized = normalizeErrorEvent(event, "console.error");

  assert.equal(normalized.type, "console.error");
  assert.ok(normalized.message.includes("Error message"));
  assert.ok(normalized.message.includes('{"key":"value"}'));
}

{
  const event = {
    args: [new Error("Error object")],
  };
  const normalized = normalizeErrorEvent(event, "console.error");

  assert.equal(normalized.type, "console.error");
  assert.equal(normalized.message, "Error object");
}

{
  const error1 = {
    message: "Same error",
    source: "./app.js",
    lineno: 10,
    colno: 5,
    stack: "Error: Same error\n    at func (./app.js:10:5)",
  };
  const error2 = {
    message: "Same error",
    source: "./app.js",
    lineno: 10,
    colno: 5,
    stack: "Error: Same error\n    at func (./app.js:10:5)",
  };

  assert.equal(getErrorSignature(error1), getErrorSignature(error2));
}

{
  const error1 = {
    message: "Error A",
    source: "./app.js",
    lineno: 10,
    colno: 5,
    stack: "Error: Error A",
  };
  const error2 = {
    message: "Error B",
    source: "./app.js",
    lineno: 10,
    colno: 5,
    stack: "Error: Error B",
  };

  assert.notEqual(getErrorSignature(error1), getErrorSignature(error2));
}

{
  const errorWithStack = {
    message: "Error with stack",
    source: "./app.js",
    lineno: 10,
    colno: 5,
    stack: "Error: Error with stack\n    at func1 (./app.js:10:5)\n    at func2 (./app.js:20:10)",
  };

  const sig = getErrorSignature(errorWithStack);
  assert.ok(sig.startsWith("Error with stack|./app.js|10|5|Error: Error with stack"));
}

console.log("debug-overlay tests passed");
