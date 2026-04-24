import { clamp, toNumber } from "../utils.js";

function normalizeValue(definition, rawValue) {
  if (typeof definition.parse === "function") {
    return definition.parse(rawValue);
  }

  if (definition.type === "number") {
    const parsed = Math.trunc(toNumber(rawValue, definition.defaultValue ?? 0));
    const min = definition.min ?? Number.MIN_SAFE_INTEGER;
    const max = definition.max ?? Number.MAX_SAFE_INTEGER;
    return clamp(parsed, min, max);
  }

  return String(rawValue ?? "");
}

function shouldDeleteValue(value, definition) {
  if (value === undefined || value === null) return true;
  if (value === "") return true;
  return value === definition.defaultValue;
}

function serializeValue(value, definition) {
  if (typeof definition.serialize === "function") {
    return definition.serialize(value);
  }

  return String(value ?? "");
}

function buildUrl(params) {
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

export function debounce(fn, delay = 250) {
  let timerId = 0;

  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export function createQueryStateStore(definitions) {
  const entries = Object.entries(definitions);

  function read() {
    const params = new URLSearchParams(window.location.search);

    return entries.reduce((result, [fieldName, definition]) => {
      const rawValue = params.get(definition.key);
      if (rawValue === null) {
        result[fieldName] = definition.defaultValue;
        return result;
      }

      result[fieldName] = normalizeValue(definition, rawValue);
      return result;
    }, {});
  }

  function write(nextPartial = {}, options = {}) {
    const current = read();
    const nextState = {
      ...current,
      ...nextPartial,
    };

    if (options.resetPage && Object.prototype.hasOwnProperty.call(definitions, "page")) {
      nextState.page = definitions.page.defaultValue;
    }

    const params = new URLSearchParams(window.location.search);

    entries.forEach(([fieldName, definition]) => {
      const value = normalizeValue(definition, nextState[fieldName]);
      nextState[fieldName] = value;

      if (shouldDeleteValue(value, definition)) {
        params.delete(definition.key);
        return;
      }

      params.set(definition.key, serializeValue(value, definition));
    });

    window.history.replaceState(window.history.state, "", buildUrl(params));
    return nextState;
  }

  function reset() {
    const defaults = entries.reduce((result, [fieldName, definition]) => {
      result[fieldName] = definition.defaultValue;
      return result;
    }, {});

    return write(defaults);
  }

  return {
    read,
    write,
    reset,
  };
}

export function clampPage(page, totalPages) {
  const safeTotalPages = Math.max(Math.trunc(toNumber(totalPages, 1)), 1);
  return clamp(Math.trunc(toNumber(page, 1)), 1, safeTotalPages);
}

export function buildPaginationMeta(totalItems, page = 1, pageSize = 10, itemCount = 0) {
  const safePageSize = Math.max(Math.trunc(toNumber(pageSize, 10)), 1);
  const safeTotalItems = Math.max(Math.trunc(toNumber(totalItems, 0)), 0);
  const totalPages = Math.max(Math.ceil(safeTotalItems / safePageSize), 1);
  const safePage = clampPage(page, totalPages);
  const startItem = safeTotalItems ? ((safePage - 1) * safePageSize) + 1 : 0;
  const endItem = safeTotalItems ? Math.min(startItem + Math.max(itemCount - 1, 0), safeTotalItems) : 0;

  return {
    page: safePage,
    pageSize: safePageSize,
    totalItems: safeTotalItems,
    totalPages,
    itemCount: Math.max(itemCount, 0),
    startItem,
    endItem,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

export function buildClientPagination(items = [], page = 1, pageSize = 10) {
  const safePageSize = Math.max(Math.trunc(toNumber(pageSize, 10)), 1);
  const totalItems = items.length;
  const totalPages = Math.max(Math.ceil(totalItems / safePageSize), 1);
  const safePage = clampPage(page, totalPages);
  const offset = (safePage - 1) * safePageSize;
  const pagedItems = items.slice(offset, offset + safePageSize);

  return {
    items: pagedItems,
    pagination: buildPaginationMeta(totalItems, safePage, safePageSize, pagedItems.length),
  };
}

export function buildPaginationSummary(pagination) {
  if (!pagination) return "";
  if (!pagination.totalItems) return "Belum ada data.";
  return `Menampilkan ${pagination.startItem}-${pagination.endItem} dari ${pagination.totalItems} data`;
}
