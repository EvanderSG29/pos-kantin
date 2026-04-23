import { toNumber } from "./utils.js";

export const COMMISSION_BASE_TYPES = Object.freeze({
  profit: "profit",
  revenue: "revenue",
});

export function normalizeCommissionBaseType(value) {
  return value === COMMISSION_BASE_TYPES.profit
    ? COMMISSION_BASE_TYPES.profit
    : COMMISSION_BASE_TYPES.revenue;
}

export function getCommissionBaseLabel(value) {
  return normalizeCommissionBaseType(value) === COMMISSION_BASE_TYPES.profit
    ? "Bagi Hasil"
    : "Bagi Omzet";
}

export function getCommissionBaseDescription(value) {
  return normalizeCommissionBaseType(value) === COMMISSION_BASE_TYPES.profit
    ? "Potongan dihitung dari laba penjualan."
    : "Potongan dihitung dari omzet penjualan.";
}

export function toLocalIsoDate(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function parseIsoDateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function addDaysToIsoDate(value, days = 0) {
  const parts = parseIsoDateParts(value);
  if (!parts) return "";

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + Math.max(toNumber(days, 0), 0));
  return date.toISOString().slice(0, 10);
}

export function getDueStatus(dueDate, referenceDate = toLocalIsoDate()) {
  if (!dueDate) {
    return {
      code: "unknown",
      label: "Tanpa jatuh tempo",
    };
  }

  if (dueDate < referenceDate) {
    return {
      code: "overdue",
      label: "Terlambat",
    };
  }

  if (dueDate === referenceDate) {
    return {
      code: "today",
      label: "Jatuh tempo hari ini",
    };
  }

  return {
    code: "upcoming",
    label: "Belum jatuh tempo",
  };
}

export function calculateTransactionMetrics(input = {}) {
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
  const commissionBaseAmount = commissionBaseType === COMMISSION_BASE_TYPES.profit
    ? profitAmount
    : grossSales;
  const commissionAmount = Math.round(commissionBaseAmount * (commissionRate / 100));
  const supplierNetAmount = grossSales - commissionAmount;
  const payoutDueDate = input.transactionDate
    ? addDaysToIsoDate(input.transactionDate, payoutTermDays)
    : "";

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
    commissionBaseAmount,
    commissionAmount,
    supplierNetAmount,
    payoutTermDays,
    payoutDueDate,
  };
}

export function groupOutstandingSupplierPayouts(transactions = [], referenceDate = toLocalIsoDate()) {
  const grouped = new Map();

  transactions
    .filter((item) => !item.deletedAt && !item.supplierPayoutId)
    .forEach((item) => {
      const supplierId = item.supplierId || item.supplierName || "SUPPLIER-UNKNOWN";
      const dueDate = item.payoutDueDate || item.transactionDate || "";
      const key = `${supplierId}||${dueDate}`;
      const existing = grouped.get(key) ?? {
        groupKey: key,
        supplierId: item.supplierId || "",
        supplierName: item.supplierName || "Tanpa nama pemasok",
        supplierNameSnapshot: item.supplierName || "Tanpa nama pemasok",
        payoutTermDays: Math.max(toNumber(item.payoutTermDays, 0), 0),
        dueDate,
        transactionCount: 0,
        totalGrossSales: 0,
        totalProfit: 0,
        totalCommission: 0,
        totalSupplierNetAmount: 0,
        transactionIds: [],
        periodStart: item.transactionDate || "",
        periodEnd: item.transactionDate || "",
      };

      existing.transactionCount += 1;
      existing.totalGrossSales += Math.max(toNumber(item.grossSales, item.totalValue), 0);
      existing.totalProfit += Math.max(toNumber(item.profitAmount, 0), 0);
      existing.totalCommission += Math.max(toNumber(item.commissionAmount, 0), 0);
      existing.totalSupplierNetAmount += Math.max(toNumber(item.supplierNetAmount, 0), 0);
      existing.transactionIds.push(item.id);

      if (item.transactionDate && (!existing.periodStart || item.transactionDate < existing.periodStart)) {
        existing.periodStart = item.transactionDate;
      }
      if (item.transactionDate && (!existing.periodEnd || item.transactionDate > existing.periodEnd)) {
        existing.periodEnd = item.transactionDate;
      }

      grouped.set(key, existing);
    });

  return [...grouped.values()]
    .map((item) => {
      const dueStatus = getDueStatus(item.dueDate, referenceDate);
      return {
        ...item,
        dueStatus: dueStatus.code,
        dueStatusLabel: dueStatus.label,
      };
    })
    .sort((left, right) => {
      const dateDelta = String(left.dueDate || "").localeCompare(String(right.dueDate || ""));
      if (dateDelta !== 0) return dateDelta;
      return left.supplierName.localeCompare(right.supplierName);
    });
}

export function summarizePayoutBuckets(items = []) {
  const buckets = new Map();

  items.forEach((item) => {
    const days = Math.max(toNumber(item.payoutTermDays, 0), 0);
    const current = buckets.get(days) ?? {
      payoutTermDays: days,
      count: 0,
      totalSupplierNetAmount: 0,
    };

    current.count += 1;
    current.totalSupplierNetAmount += Math.max(toNumber(item.totalSupplierNetAmount, 0), 0);
    buckets.set(days, current);
  });

  return [...buckets.values()].sort((left, right) => left.payoutTermDays - right.payoutTermDays);
}
