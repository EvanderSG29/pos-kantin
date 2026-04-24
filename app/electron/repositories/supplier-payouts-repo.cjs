const { generateId, nowIso, toNumber, todayIsoDate } = require("../common.cjs");

function mapSupplierPayoutRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierNameSnapshot: row.supplier_name_snapshot,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueDate: row.due_date,
    transactionCount: Math.trunc(toNumber(row.transaction_count, 0)),
    totalGrossSales: toNumber(row.total_gross_sales, 0),
    totalProfit: toNumber(row.total_profit, 0),
    totalCommission: toNumber(row.total_commission, 0),
    totalSupplierNetAmount: toNumber(row.total_supplier_net_amount, 0),
    status: row.status || "paid",
    paidAt: row.paid_at || "",
    paidByUserId: row.paid_by_user_id || "",
    paidByName: row.paid_by_name || "",
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summarizeTermBuckets(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const key = String(Math.trunc(toNumber(item.payoutTermDays, 0)));
    const current = grouped.get(key) ?? {
      payoutTermDays: Math.trunc(toNumber(item.payoutTermDays, 0)),
      count: 0,
      totalSupplierNetAmount: 0,
    };
    current.count += 1;
    current.totalSupplierNetAmount += toNumber(item.totalSupplierNetAmount, 0);
    grouped.set(key, current);
  });

  return [...grouped.values()].sort((left, right) => left.payoutTermDays - right.payoutTermDays);
}

function buildSummary(outstanding, history, referenceDate = todayIsoDate()) {
  const dueItems = outstanding.filter((item) => item.dueDate && String(item.dueDate) <= String(referenceDate));
  const overdueItems = outstanding.filter((item) => item.dueStatus === "overdue");

  return {
    outstandingCount: outstanding.length,
    outstandingAmount: outstanding.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    dueCount: dueItems.length,
    dueAmount: dueItems.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    overdueCount: overdueItems.length,
    overdueAmount: overdueItems.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    settledCount: history.length,
    settledAmount: history.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    termBuckets: summarizeTermBuckets(outstanding),
  };
}

function createSupplierPayoutsRepo(db, transactionsRepo) {
  const selectById = db.prepare("SELECT * FROM supplier_payouts WHERE id = ?");
  const listAllStmt = db.prepare("SELECT * FROM supplier_payouts ORDER BY due_date DESC, updated_at DESC");
  const saveStmt = db.prepare(`
    INSERT INTO supplier_payouts (
      id, supplier_id, supplier_name_snapshot, period_start, period_end, due_date,
      transaction_count, total_gross_sales, total_profit, total_commission,
      total_supplier_net_amount, status, paid_at, paid_by_user_id, paid_by_name,
      notes, created_at, updated_at, last_synced_at, pending_sync
    ) VALUES (
      @id, @supplier_id, @supplier_name_snapshot, @period_start, @period_end, @due_date,
      @transaction_count, @total_gross_sales, @total_profit, @total_commission,
      @total_supplier_net_amount, @status, @paid_at, @paid_by_user_id, @paid_by_name,
      @notes, @created_at, @updated_at, @last_synced_at, @pending_sync
    )
    ON CONFLICT(id) DO UPDATE SET
      supplier_id = excluded.supplier_id,
      supplier_name_snapshot = excluded.supplier_name_snapshot,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      due_date = excluded.due_date,
      transaction_count = excluded.transaction_count,
      total_gross_sales = excluded.total_gross_sales,
      total_profit = excluded.total_profit,
      total_commission = excluded.total_commission,
      total_supplier_net_amount = excluded.total_supplier_net_amount,
      status = excluded.status,
      paid_at = excluded.paid_at,
      paid_by_user_id = excluded.paid_by_user_id,
      paid_by_name = excluded.paid_by_name,
      notes = excluded.notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at,
      pending_sync = excluded.pending_sync
  `);

  function applyCloudRecord(payout, options = {}) {
    const existing = selectById.get(String(payout.id || ""));
    if (existing?.pending_sync && !options.force) {
      return {
        skipped: true,
        payout: mapSupplierPayoutRow(existing),
      };
    }

    const syncedAt = nowIso();
    const record = {
      id: payout.id,
      supplier_id: payout.supplierId,
      supplier_name_snapshot: String(payout.supplierNameSnapshot || "").trim(),
      period_start: payout.periodStart || "",
      period_end: payout.periodEnd || "",
      due_date: payout.dueDate || "",
      transaction_count: Math.trunc(toNumber(payout.transactionCount, 0)),
      total_gross_sales: toNumber(payout.totalGrossSales, 0),
      total_profit: toNumber(payout.totalProfit, 0),
      total_commission: toNumber(payout.totalCommission, 0),
      total_supplier_net_amount: toNumber(payout.totalSupplierNetAmount, 0),
      status: payout.status || "paid",
      paid_at: payout.paidAt || "",
      paid_by_user_id: payout.paidByUserId || "",
      paid_by_name: payout.paidByName || "",
      notes: String(payout.notes || "").trim(),
      created_at: payout.createdAt || existing?.created_at || syncedAt,
      updated_at: payout.updatedAt || syncedAt,
      last_synced_at: syncedAt,
      pending_sync: 0,
    };

    saveStmt.run(record);
    return {
      skipped: false,
      payout: mapSupplierPayoutRow(record),
    };
  }

  function listHistory() {
    return listAllStmt.all()
      .map(mapSupplierPayoutRow)
      .sort((left, right) => {
        const dueDelta = String(right.dueDate || "").localeCompare(String(left.dueDate || ""));
        if (dueDelta !== 0) return dueDelta;
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      });
  }

  return {
    applyCloudRecord,
    listSupplierPayouts(sessionUser) {
      if (sessionUser.role !== "admin") {
        throw new Error("Aksi ini hanya untuk admin.");
      }

      const outstanding = transactionsRepo.groupOutstandingSupplierPayouts(todayIsoDate());
      const history = listHistory();

      return {
        summary: buildSummary(outstanding, history, todayIsoDate()),
        outstanding,
        history,
      };
    },
    settleSupplierPayout(payload = {}, sessionUser) {
      if (sessionUser.role !== "admin") {
        throw new Error("Aksi ini hanya untuk admin.");
      }
      if (!payload.supplierId || !payload.dueDate) {
        throw new Error("Supplier dan jatuh tempo payout wajib diisi.");
      }

      const outstanding = transactionsRepo.groupOutstandingSupplierPayouts(todayIsoDate());
      const target = outstanding.find((item) => {
        return String(item.supplierId) === String(payload.supplierId)
          && String(item.dueDate) === String(payload.dueDate);
      });

      if (!target) {
        throw new Error("Tidak ada transaksi outstanding untuk payout ini.");
      }

      const now = nowIso();
      const record = {
        id: payload.id || generateId("PAY"),
        supplier_id: target.supplierId,
        supplier_name_snapshot: target.supplierNameSnapshot,
        period_start: target.periodStart,
        period_end: target.periodEnd,
        due_date: target.dueDate,
        transaction_count: target.transactionCount,
        total_gross_sales: target.totalGrossSales,
        total_profit: target.totalProfit,
        total_commission: target.totalCommission,
        total_supplier_net_amount: target.totalSupplierNetAmount,
        status: "paid",
        paid_at: now,
        paid_by_user_id: sessionUser.id,
        paid_by_name: sessionUser.fullName,
        notes: String(payload.notes || "").trim(),
        created_at: now,
        updated_at: now,
        last_synced_at: null,
        pending_sync: 1,
      };

      const tx = db.transaction(() => {
        saveStmt.run(record);
        transactionsRepo.markTransactionsSettled(target.transactionIds, record.id, { pendingSync: false });
      });

      tx();
      return {
        payout: mapSupplierPayoutRow(record),
        settledTransactionCount: target.transactionIds.length,
        transactionIds: target.transactionIds,
      };
    },
    upsertFromCloud(payouts = []) {
      const tx = db.transaction((items) => {
        items.forEach((payout) => applyCloudRecord(payout));
      });
      tx(payouts);
    },
  };
}

module.exports = {
  createSupplierPayoutsRepo,
};
