const {
  calculateTransactionMetrics,
  generateId,
  getDueStatusCode,
  normalizeCommissionBaseType,
  normalizeText,
  nowIso,
  paginateItems,
  todayIsoDate,
  toNumber,
} = require("../common.cjs");

function mapTransactionRow(row) {
  if (!row) return null;

  const payoutDueDate = row.payout_due_date || "";
  const isSettled = Boolean(row.supplier_payout_id);

  return {
    id: row.id,
    transactionDate: row.transaction_date,
    inputByUserId: row.input_by_user_id,
    inputByName: row.input_by_name,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    itemName: row.item_name,
    unitName: row.unit_name,
    quantity: Math.trunc(toNumber(row.quantity, 0)),
    remainingQuantity: Math.trunc(toNumber(row.remaining_quantity, 0)),
    soldQuantity: Math.trunc(toNumber(row.sold_quantity, 0)),
    costPrice: toNumber(row.cost_price, 0),
    unitPrice: toNumber(row.unit_price, 0),
    grossSales: toNumber(row.gross_sales, row.total_value),
    totalValue: toNumber(row.total_value, row.gross_sales),
    profitAmount: toNumber(row.profit_amount, 0),
    commissionRate: toNumber(row.commission_rate, 10),
    commissionBaseType: normalizeCommissionBaseType(row.commission_base_type),
    commissionAmount: toNumber(row.commission_amount, 0),
    supplierNetAmount: toNumber(row.supplier_net_amount, 0),
    payoutTermDays: Math.trunc(toNumber(row.payout_term_days, 0)),
    payoutDueDate,
    supplierPayoutId: row.supplier_payout_id || "",
    dueStatus: isSettled ? "settled" : getDueStatusCode(payoutDueDate),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || "",
  };
}

function buildSummary(items = []) {
  return {
    rowCount: items.length,
    totalGrossSales: items.reduce((sum, item) => sum + toNumber(item.grossSales, item.totalValue), 0),
    totalProfit: items.reduce((sum, item) => sum + toNumber(item.profitAmount, 0), 0),
    totalCommission: items.reduce((sum, item) => sum + toNumber(item.commissionAmount, 0), 0),
    totalSupplierNetAmount: items.reduce((sum, item) => sum + toNumber(item.supplierNetAmount, 0), 0),
    unsettledSupplierNetAmount: items
      .filter((item) => !item.supplierPayoutId)
      .reduce((sum, item) => sum + toNumber(item.supplierNetAmount, 0), 0),
    uniqueSupplierCount: new Set(items.map((item) => item.supplierName)).size,
  };
}

function groupOutstandingSupplierPayouts(items = [], referenceDate = todayIsoDate()) {
  const grouped = new Map();

  items
    .filter((item) => !item.deletedAt && !item.supplierPayoutId)
    .forEach((item) => {
      const supplierId = item.supplierId || item.supplierName || "SUP-UNKNOWN";
      const dueDate = item.payoutDueDate || item.transactionDate || "";
      const key = `${supplierId}||${dueDate}`;
      const current = grouped.get(key) ?? {
        groupKey: key,
        supplierId: item.supplierId || "",
        supplierName: item.supplierName || "Tanpa pemasok",
        payoutTermDays: Math.max(Math.trunc(toNumber(item.payoutTermDays, 0)), 0),
        dueDate,
        transactionCount: 0,
        totalGrossSales: 0,
        totalProfit: 0,
        totalCommission: 0,
        totalSupplierNetAmount: 0,
        transactionIds: [],
      };

      current.transactionCount += 1;
      current.totalGrossSales += Math.max(toNumber(item.grossSales, item.totalValue), 0);
      current.totalProfit += Math.max(toNumber(item.profitAmount, 0), 0);
      current.totalCommission += Math.max(toNumber(item.commissionAmount, 0), 0);
      current.totalSupplierNetAmount += Math.max(toNumber(item.supplierNetAmount, 0), 0);
      current.transactionIds.push(item.id);

      grouped.set(key, current);
    });

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      dueStatus: getDueStatusCode(item.dueDate, referenceDate),
    }))
    .sort((left, right) => String(left.dueDate || "").localeCompare(String(right.dueDate || "")));
}

function createTransactionsRepo(db, suppliersRepo) {
  const selectById = db.prepare("SELECT * FROM transactions WHERE id = ?");
  const listStmt = db.prepare("SELECT * FROM transactions ORDER BY transaction_date DESC, updated_at DESC");
  const saveStmt = db.prepare(`
    INSERT INTO transactions (
      id, transaction_date, input_by_user_id, input_by_name, supplier_id, supplier_name, item_name, unit_name,
      quantity, remaining_quantity, sold_quantity, cost_price, unit_price, gross_sales, total_value, profit_amount,
      commission_rate, commission_base_type, commission_amount, supplier_net_amount, payout_term_days,
      payout_due_date, supplier_payout_id, notes, created_at, updated_at, deleted_at, last_synced_at, pending_sync
    ) VALUES (
      @id, @transaction_date, @input_by_user_id, @input_by_name, @supplier_id, @supplier_name, @item_name, @unit_name,
      @quantity, @remaining_quantity, @sold_quantity, @cost_price, @unit_price, @gross_sales, @total_value, @profit_amount,
      @commission_rate, @commission_base_type, @commission_amount, @supplier_net_amount, @payout_term_days,
      @payout_due_date, @supplier_payout_id, @notes, @created_at, @updated_at, @deleted_at, @last_synced_at, @pending_sync
    )
    ON CONFLICT(id) DO UPDATE SET
      transaction_date = excluded.transaction_date,
      input_by_user_id = excluded.input_by_user_id,
      input_by_name = excluded.input_by_name,
      supplier_id = excluded.supplier_id,
      supplier_name = excluded.supplier_name,
      item_name = excluded.item_name,
      unit_name = excluded.unit_name,
      quantity = excluded.quantity,
      remaining_quantity = excluded.remaining_quantity,
      sold_quantity = excluded.sold_quantity,
      cost_price = excluded.cost_price,
      unit_price = excluded.unit_price,
      gross_sales = excluded.gross_sales,
      total_value = excluded.total_value,
      profit_amount = excluded.profit_amount,
      commission_rate = excluded.commission_rate,
      commission_base_type = excluded.commission_base_type,
      commission_amount = excluded.commission_amount,
      supplier_net_amount = excluded.supplier_net_amount,
      payout_term_days = excluded.payout_term_days,
      payout_due_date = excluded.payout_due_date,
      supplier_payout_id = excluded.supplier_payout_id,
      notes = excluded.notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      last_synced_at = excluded.last_synced_at,
      pending_sync = excluded.pending_sync
  `);

  function assertSessionRole(sessionUser) {
    if (!["admin", "petugas"].includes(sessionUser.role)) {
      throw new Error("Role user tidak diizinkan untuk aksi ini.");
    }
  }

  function assertAccess(existing, sessionUser) {
    if (!existing || existing.deleted_at) {
      throw new Error("Transaksi tidak ditemukan.");
    }

    if (sessionUser.role !== "admin" && String(existing.input_by_user_id) !== String(sessionUser.id)) {
      throw new Error("Transaksi ini bukan milik Anda.");
    }
  }

  function assertMutable(existing) {
    if (existing?.supplier_payout_id) {
      throw new Error("Transaksi yang sudah masuk payout pemasok tidak bisa diubah atau dihapus.");
    }
  }

  function listVisibleRows(sessionUser) {
    return listStmt.all()
      .filter((row) => (sessionUser.role === "admin" ? true : String(row.input_by_user_id) === String(sessionUser.id)))
      .map(mapTransactionRow);
  }

  function saveTransaction(payload, sessionUser) {
    assertSessionRole(sessionUser);

    const now = nowIso();
    const existing = payload.id ? selectById.get(String(payload.id)) : null;
    if (existing) {
      assertAccess(existing, sessionUser);
      assertMutable(existing);
    }

    if (!payload.transactionDate || !payload.itemName || !payload.unitName) {
      throw new Error("Tanggal, pemasok, makanan, dan satuan wajib diisi.");
    }

    const supplier = suppliersRepo.getById(payload.supplierId);
    if (!supplier) {
      throw new Error("Pemasok tidak ditemukan.");
    }
    if (!supplier.isActive && !existing) {
      throw new Error("Pemasok nonaktif tidak bisa dipakai untuk transaksi baru.");
    }

    const quantity = Math.max(Math.trunc(toNumber(payload.quantity, 0)), 0);
    const remainingQuantity = Math.max(Math.trunc(toNumber(payload.remainingQuantity, 0)), 0);
    const unitPrice = Math.max(toNumber(payload.unitPrice, 0), 0);
    const costPrice = Math.max(toNumber(payload.costPrice, 0), 0);

    if (remainingQuantity > quantity) {
      throw new Error("Sisa tidak boleh lebih besar dari jumlah titip.");
    }

    const metrics = calculateTransactionMetrics({
      quantity,
      remainingQuantity,
      unitPrice,
      costPrice,
      commissionRate: supplier.commissionRate,
      commissionBaseType: supplier.commissionBaseType,
      payoutTermDays: supplier.payoutTermDays,
      transactionDate: payload.transactionDate,
    });

    const record = {
      id: existing?.id || payload.id || generateId("TRX"),
      transaction_date: payload.transactionDate,
      input_by_user_id: existing?.input_by_user_id || sessionUser.id,
      input_by_name: existing?.input_by_name || sessionUser.fullName,
      supplier_id: supplier.id,
      supplier_name: supplier.supplierName,
      item_name: String(payload.itemName || "").trim(),
      unit_name: String(payload.unitName || "").trim(),
      quantity: metrics.quantity,
      remaining_quantity: metrics.remainingQuantity,
      sold_quantity: metrics.soldQuantity,
      cost_price: metrics.costPrice,
      unit_price: metrics.unitPrice,
      gross_sales: metrics.grossSales,
      total_value: metrics.totalValue,
      profit_amount: metrics.profitAmount,
      commission_rate: metrics.commissionRate,
      commission_base_type: metrics.commissionBaseType,
      commission_amount: metrics.commissionAmount,
      supplier_net_amount: metrics.supplierNetAmount,
      payout_term_days: metrics.payoutTermDays,
      payout_due_date: metrics.payoutDueDate,
      supplier_payout_id: existing?.supplier_payout_id || "",
      notes: String(payload.notes || "").trim(),
      created_at: existing?.created_at || now,
      updated_at: now,
      deleted_at: "",
      last_synced_at: existing?.last_synced_at || null,
      pending_sync: 1,
    };

    saveStmt.run(record);
    return mapTransactionRow(record);
  }

  function deleteTransaction(id, sessionUser) {
    assertSessionRole(sessionUser);

    const existing = selectById.get(String(id || ""));
    assertAccess(existing, sessionUser);
    assertMutable(existing);

    const now = nowIso();
    const record = {
      ...existing,
      updated_at: now,
      deleted_at: now,
      pending_sync: 1,
    };

    saveStmt.run(record);
    return mapTransactionRow(record);
  }

  function applyCloudRecord(transaction, options = {}) {
    const existing = selectById.get(String(transaction.id || ""));
    if (existing?.pending_sync && !options.force) {
      return {
        skipped: true,
        transaction: mapTransactionRow(existing),
      };
    }

    const syncedAt = nowIso();
    const record = {
      id: transaction.id,
      transaction_date: transaction.transactionDate,
      input_by_user_id: transaction.inputByUserId,
      input_by_name: transaction.inputByName,
      supplier_id: transaction.supplierId,
      supplier_name: transaction.supplierName,
      item_name: transaction.itemName,
      unit_name: transaction.unitName,
      quantity: Math.trunc(toNumber(transaction.quantity, 0)),
      remaining_quantity: Math.trunc(toNumber(transaction.remainingQuantity, 0)),
      sold_quantity: Math.trunc(toNumber(transaction.soldQuantity, 0)),
      cost_price: toNumber(transaction.costPrice, 0),
      unit_price: toNumber(transaction.unitPrice, 0),
      gross_sales: toNumber(transaction.grossSales, transaction.totalValue),
      total_value: toNumber(transaction.totalValue, transaction.grossSales),
      profit_amount: toNumber(transaction.profitAmount, 0),
      commission_rate: toNumber(transaction.commissionRate, 10),
      commission_base_type: normalizeCommissionBaseType(transaction.commissionBaseType),
      commission_amount: toNumber(transaction.commissionAmount, 0),
      supplier_net_amount: toNumber(transaction.supplierNetAmount, 0),
      payout_term_days: Math.trunc(toNumber(transaction.payoutTermDays, 0)),
      payout_due_date: transaction.payoutDueDate || "",
      supplier_payout_id: transaction.supplierPayoutId || "",
      notes: String(transaction.notes || "").trim(),
      created_at: transaction.createdAt || existing?.created_at || syncedAt,
      updated_at: transaction.updatedAt || syncedAt,
      deleted_at: transaction.deletedAt || "",
      last_synced_at: syncedAt,
      pending_sync: 0,
    };

    saveStmt.run(record);
    return {
      skipped: false,
      transaction: mapTransactionRow(record),
    };
  }

  function listTransactions(payload = {}, sessionUser) {
    let items = listVisibleRows(sessionUser).filter((item) => !item.deletedAt);

    if (payload.transactionDate) {
      items = items.filter((item) => String(item.transactionDate) === String(payload.transactionDate));
    }
    if (payload.startDate) {
      items = items.filter((item) => String(item.transactionDate) >= String(payload.startDate));
    }
    if (payload.endDate) {
      items = items.filter((item) => String(item.transactionDate) <= String(payload.endDate));
    }
    if (payload.supplierId) {
      items = items.filter((item) => String(item.supplierId) === String(payload.supplierId));
    }
    if (payload.commissionBaseType) {
      items = items.filter((item) => item.commissionBaseType === normalizeCommissionBaseType(payload.commissionBaseType));
    }
    if (payload.query || payload.search) {
      const query = normalizeText(payload.query || payload.search);
      items = items.filter((item) => [
        item.itemName,
        item.supplierName,
        item.inputByName,
        item.notes,
      ].some((part) => normalizeText(part).includes(query)));
    }

    const paged = paginateItems(items, payload);

    return {
      items: paged.items,
      pagination: paged.pagination,
      summary: payload.includeSummary ? buildSummary(items) : undefined,
    };
  }

  function buildDashboardSummary(sessionUser, options = {}) {
    const allVisible = listVisibleRows(sessionUser).filter((item) => !item.deletedAt);
    const today = todayIsoDate();
    const recentTransactions = [...allVisible]
      .sort((left, right) => new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime())
      .slice(0, 5);
    const outstandingPayouts = groupOutstandingSupplierPayouts(allVisible, today);
    const duePayouts = outstandingPayouts.filter((item) => ["today", "overdue"].includes(item.dueStatus));
    const overduePayouts = outstandingPayouts.filter((item) => item.dueStatus === "overdue");
    const todayTransactions = allVisible.filter((item) => item.transactionDate === today);
    const totals = buildSummary(allVisible);

    return {
      scope: sessionUser.role,
      transactionCount: allVisible.length,
      totalValue: totals.totalGrossSales,
      totalGrossSales: totals.totalGrossSales,
      totalProfit: totals.totalProfit,
      totalCommission: totals.totalCommission,
      totalSupplierNetAmount: totals.totalSupplierNetAmount,
      totalItems: allVisible.reduce((sum, item) => sum + Math.max(item.quantity, 0), 0),
      totalRemaining: allVisible.reduce((sum, item) => sum + Math.max(item.remainingQuantity, 0), 0),
      activeSuppliers: options.activeSuppliers ?? 0,
      todayGrossSales: todayTransactions.reduce((sum, item) => sum + Math.max(item.grossSales, 0), 0),
      todayCommission: todayTransactions.reduce((sum, item) => sum + Math.max(item.commissionAmount, 0), 0),
      todayTransactionCount: todayTransactions.length,
      dueSupplierDebtAmount: duePayouts.reduce((sum, item) => sum + Math.max(item.totalSupplierNetAmount, 0), 0),
      overdueSupplierPayoutCount: overduePayouts.length,
      overdueSupplierPayoutAmount: overduePayouts.reduce((sum, item) => sum + Math.max(item.totalSupplierNetAmount, 0), 0),
      recentTransactions,
      outstandingPayoutBuckets: outstandingPayouts,
      pendingSyncCount: options.pendingSyncCount ?? 0,
      offlineCapableUsers: options.offlineCapableUsers ?? 0,
      lastSyncAt: options.lastSyncAt || "",
      lastSyncError: options.lastSyncError || "",
      syncOnline: Boolean(options.syncOnline),
    };
  }

  return {
    applyCloudRecord,
    buildDashboardSummary,
    deleteTransaction,
    getById(id) {
      return mapTransactionRow(selectById.get(String(id || "")));
    },
    listTransactions,
    saveTransaction,
  };
}

module.exports = {
  createTransactionsRepo,
};
