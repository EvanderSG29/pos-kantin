import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const windowStub = {
  location: {
    pathname: "/transaksi.html",
    search: "?txQ=roti&txPage=3",
    hash: "",
  },
  history: {
    state: null,
    replaceState(state, _unused, url) {
      this.state = state;
      const nextUrl = new URL(url, "https://example.test");
      windowStub.location.pathname = nextUrl.pathname;
      windowStub.location.search = nextUrl.search;
      windowStub.location.hash = nextUrl.hash;
    },
  },
  setTimeout,
  clearTimeout,
};

const context = vm.createContext({
  console,
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
});

const moduleCache = new Map();

async function loadModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath);
  }

  const source = await readFile(absolutePath, "utf8");
  const module = new vm.SourceTextModule(source, {
    context,
    identifier: absolutePath,
    initializeImportMeta(meta) {
      meta.url = pathToFileURL(absolutePath).href;
    },
  });

  moduleCache.set(absolutePath, module);

  await module.link(async (specifier, referencingModule) => {
    const resolved = path.resolve(path.dirname(referencingModule.identifier), specifier);
    return loadModule(resolved);
  });

  await module.evaluate();
  return module;
}

const utilsModule = await loadModule("./app/assets/js/utils.js");
const tableStateModule = await loadModule("./app/assets/js/components/table-state.js");

const { formatDate } = utilsModule.namespace;
const {
  buildClientPagination,
  buildPaginationSummary,
  createQueryStateStore,
} = tableStateModule.namespace;

{
  const formatted = formatDate("2026-04-20");
  const expected = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 3, 20)));

  assert.equal(formatted, expected);
}

{
  const paged = buildClientPagination(Array.from({ length: 23 }, (_, index) => index + 1), 3, 10);

  assert.deepEqual(paged.items, [21, 22, 23]);
  assert.equal(paged.pagination.page, 3);
  assert.equal(paged.pagination.totalPages, 3);
  assert.equal(paged.pagination.startItem, 21);
  assert.equal(paged.pagination.endItem, 23);
  assert.equal(buildPaginationSummary(paged.pagination), "Menampilkan 21-23 dari 23 data");
}

{
  const store = createQueryStateStore({
    q: { key: "txQ", defaultValue: "" },
    page: { key: "txPage", defaultValue: 1, type: "number", min: 1 },
  });

  const initialState = store.read();
  assert.equal(initialState.q, "roti");
  assert.equal(initialState.page, 3);

  const nextState = store.write({ q: "mie" }, { resetPage: true });

  assert.equal(nextState.q, "mie");
  assert.equal(nextState.page, 1);
  assert.equal(windowStub.location.search, "?txQ=mie");
}

console.log("ui-helper tests passed");
