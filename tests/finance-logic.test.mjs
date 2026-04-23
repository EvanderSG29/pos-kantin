import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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

const financeModule = await loadModule("./assets/js/finance.js");
const {
  calculateTransactionMetrics,
  COMMISSION_BASE_TYPES,
  groupOutstandingSupplierPayouts,
} = financeModule.namespace;

{
  const result = calculateTransactionMetrics({
    quantity: 10,
    remainingQuantity: 2,
    costPrice: 3000,
    unitPrice: 5000,
    commissionRate: 10,
    commissionBaseType: COMMISSION_BASE_TYPES.revenue,
    payoutTermDays: 3,
    transactionDate: "2026-04-20",
  });

  assert.equal(result.soldQuantity, 8);
  assert.equal(result.grossSales, 40000);
  assert.equal(result.profitAmount, 16000);
  assert.equal(result.commissionAmount, 4000);
  assert.equal(result.supplierNetAmount, 36000);
  assert.equal(result.payoutDueDate, "2026-04-23");
}

{
  const result = calculateTransactionMetrics({
    quantity: 10,
    remainingQuantity: 2,
    costPrice: 3000,
    unitPrice: 5000,
    commissionRate: 10,
    commissionBaseType: COMMISSION_BASE_TYPES.profit,
    payoutTermDays: 7,
    transactionDate: "2026-04-20",
  });

  assert.equal(result.profitAmount, 16000);
  assert.equal(result.commissionAmount, 1600);
  assert.equal(result.supplierNetAmount, 38400);
  assert.equal(result.payoutDueDate, "2026-04-27");
}

{
  const result = calculateTransactionMetrics({
    quantity: 6,
    remainingQuantity: 1,
    costPrice: 5000,
    unitPrice: 4000,
    commissionRate: 10,
    commissionBaseType: COMMISSION_BASE_TYPES.profit,
    payoutTermDays: 1,
    transactionDate: "2026-04-20",
  });

  assert.equal(result.profitAmount, 0);
  assert.equal(result.commissionAmount, 0);
  assert.equal(result.supplierNetAmount, 20000);
}

{
  const grouped = groupOutstandingSupplierPayouts([
    {
      id: "TRX-1",
      supplierId: "SUP-1",
      supplierName: "Uni",
      transactionDate: "2026-04-20",
      payoutDueDate: "2026-04-23",
      payoutTermDays: 3,
      grossSales: 30000,
      profitAmount: 10000,
      commissionAmount: 3000,
      supplierNetAmount: 27000,
    },
    {
      id: "TRX-2",
      supplierId: "SUP-1",
      supplierName: "Uni",
      transactionDate: "2026-04-21",
      payoutDueDate: "2026-04-23",
      payoutTermDays: 3,
      grossSales: 15000,
      profitAmount: 6000,
      commissionAmount: 1500,
      supplierNetAmount: 13500,
    },
    {
      id: "TRX-3",
      supplierId: "SUP-2",
      supplierName: "Kang Latif",
      transactionDate: "2026-04-21",
      payoutDueDate: "2026-04-24",
      payoutTermDays: 3,
      grossSales: 12000,
      profitAmount: 4000,
      commissionAmount: 1200,
      supplierNetAmount: 10800,
      supplierPayoutId: "PAY-001",
    },
  ], "2026-04-23");

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].transactionCount, 2);
  assert.equal(grouped[0].totalGrossSales, 45000);
  assert.equal(grouped[0].totalCommission, 4500);
  assert.equal(grouped[0].totalSupplierNetAmount, 40500);
  assert.equal(grouped[0].dueStatus, "today");
}

console.log("finance-logic tests passed");
