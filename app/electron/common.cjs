const crypto = require("node:crypto");

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function generateId(prefix = "ID") {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function todayIsoDate(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function addDaysToIsoDate(value, days = 0) {
  const parts = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return "";

  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  date.setUTCDate(date.getUTCDate() + Math.max(toNumber(days, 0), 0));
  return date.toISOString().slice(0, 10);
}

function normalizeCommissionBaseType(value) {
  return String(value) === "profit" ? "profit" : "revenue";
}

function getDueStatusCode(dueDate, referenceDate = todayIsoDate()) {
  if (!dueDate) return "unknown";
  if (String(dueDate) < String(referenceDate)) return "overdue";
  if (String(dueDate) === String(referenceDate)) return "today";
  return "upcoming";
}

function calculateTransactionMetrics(input = {}) {
  const quantity = Math.max(toNumber(input.quantity, 0), 0);
  const remainingQuantity = Math.max(toNumber(input.remainingQuantity, 0), 0);
  const unitPrice = Math.max(toNumber(input.unitPrice, 0), 0);
  const costPrice = Math.max(toNumber(input.costPrice, 0), 0);
  const commissionRate = Math.max(toNumber(input.commissionRate, 10), 0);
  const payoutTermDays = Math.max(toNumber(input.payoutTermDays, 0), 0);
  const commissionBaseType = normalizeCommissionBaseType(input.commissionBaseType);
  const soldQuantity = Math.max(quantity - remainingQuantity, 0);
  const grossSales = soldQuantity * unitPrice;
  const profitAmount = Math.max((unitPrice - costPrice) * soldQuantity, 0);
  const commissionBaseAmount = commissionBaseType === "profit" ? profitAmount : grossSales;
  const commissionAmount = Math.round(commissionBaseAmount * (commissionRate / 100));

  return {
    quantity,
    remainingQuantity,
    soldQuantity,
    unitPrice,
    costPrice,
    grossSales,
    totalValue: grossSales,
    profitAmount,
    commissionRate,
    commissionBaseType,
    commissionAmount,
    supplierNetAmount: grossSales - commissionAmount,
    payoutTermDays,
    payoutDueDate: input.transactionDate ? addDaysToIsoDate(input.transactionDate, payoutTermDays) : "",
  };
}

function buildPagination(totalItems, page = 1, pageSize = 10, itemCount = 0) {
  const safePageSize = Math.max(Math.trunc(toNumber(pageSize, 10)), 1);
  const safeTotalItems = Math.max(Math.trunc(toNumber(totalItems, 0)), 0);
  const totalPages = Math.max(Math.ceil(safeTotalItems / safePageSize), 1);
  const safePage = Math.min(Math.max(Math.trunc(toNumber(page, 1)), 1), totalPages);
  const safeItemCount = Math.max(Math.trunc(toNumber(itemCount, 0)), 0);
  const startItem = safeTotalItems ? ((safePage - 1) * safePageSize) + 1 : 0;
  const endItem = safeTotalItems ? Math.min(startItem + safeItemCount - 1, safeTotalItems) : 0;

  return {
    page: safePage,
    pageSize: safePageSize,
    totalItems: safeTotalItems,
    totalPages,
    itemCount: safeItemCount,
    startItem,
    endItem,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

function paginateItems(items, payload = {}) {
  const pageSize = Math.max(Math.trunc(toNumber(payload.pageSize, 10)), 1);
  const totalPages = Math.max(Math.ceil(items.length / pageSize), 1);
  const page = Math.min(Math.max(Math.trunc(toNumber(payload.page, 1)), 1), totalPages);
  const offset = (page - 1) * pageSize;
  const pagedItems = items.slice(offset, offset + pageSize);

  return {
    items: pagedItems,
    pagination: buildPagination(items.length, page, pageSize, pagedItems.length),
  };
}

module.exports = {
  addDaysToIsoDate,
  buildPagination,
  calculateTransactionMetrics,
  generateId,
  getDueStatusCode,
  normalizeCommissionBaseType,
  normalizeText,
  nowIso,
  paginateItems,
  todayIsoDate,
  toNumber,
};
