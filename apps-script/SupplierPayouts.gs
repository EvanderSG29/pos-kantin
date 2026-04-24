function sanitizeSupplierPayout_(record) {
  return {
    id: record.id,
    supplierId: record.supplier_id,
    supplierNameSnapshot: record.supplier_name_snapshot,
    periodStart: record.period_start,
    periodEnd: record.period_end,
    dueDate: record.due_date,
    transactionCount: toNumber_(record.transaction_count),
    totalGrossSales: toNumber_(record.total_gross_sales),
    totalProfit: toNumber_(record.total_profit),
    totalCommission: toNumber_(record.total_commission),
    totalSupplierNetAmount: toNumber_(record.total_supplier_net_amount),
    status: record.status || "paid",
    paidAt: record.paid_at,
    paidByUserId: record.paid_by_user_id,
    paidByName: record.paid_by_name,
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function buildOutstandingSupplierPayouts_(transactionRecords, referenceDate) {
  var grouped = {};

  transactionRecords
    .filter(function (record) {
      return !record.deleted_at && !record.supplier_payout_id;
    })
    .forEach(function (record) {
      var supplierId = record.supplier_id || record.supplier_name || "SUPPLIER-UNKNOWN";
      var dueDate = record.payout_due_date || record.transaction_date || "";
      var key = [supplierId, dueDate].join("||");
      var current = grouped[key] || {
        groupKey: key,
        supplierId: record.supplier_id || "",
        supplierName: record.supplier_name || "Tanpa nama pemasok",
        supplierNameSnapshot: record.supplier_name || "Tanpa nama pemasok",
        payoutTermDays: toNumber_(record.payout_term_days),
        dueDate: dueDate,
        transactionCount: 0,
        totalGrossSales: 0,
        totalProfit: 0,
        totalCommission: 0,
        totalSupplierNetAmount: 0,
        periodStart: record.transaction_date || "",
        periodEnd: record.transaction_date || "",
        transactionIds: [],
      };

      current.transactionCount += 1;
      current.totalGrossSales += toNumber_(record.gross_sales, record.total_value);
      current.totalProfit += toNumber_(record.profit_amount);
      current.totalCommission += toNumber_(record.commission_amount);
      current.totalSupplierNetAmount += toNumber_(record.supplier_net_amount);
      current.transactionIds.push(record.id);

      if (record.transaction_date && (!current.periodStart || String(record.transaction_date) < String(current.periodStart))) {
        current.periodStart = record.transaction_date;
      }
      if (record.transaction_date && (!current.periodEnd || String(record.transaction_date) > String(current.periodEnd))) {
        current.periodEnd = record.transaction_date;
      }

      grouped[key] = current;
    });

  return Object.keys(grouped)
    .map(function (key) {
      var item = grouped[key];
      item.dueStatus = getDueStatusCode_(item.dueDate, referenceDate);
      return item;
    })
    .sort(function (left, right) {
      var dateCompare = String(left.dueDate).localeCompare(String(right.dueDate));
      if (dateCompare !== 0) return dateCompare;
      return left.supplierName.localeCompare(right.supplierName);
    });
}

function summarizeTermBuckets_(items) {
  var grouped = {};

  items.forEach(function (item) {
    var key = String(toNumber_(item.payoutTermDays));
    var current = grouped[key] || {
      payoutTermDays: toNumber_(item.payoutTermDays),
      count: 0,
      totalSupplierNetAmount: 0,
    };

    current.count += 1;
    current.totalSupplierNetAmount += toNumber_(item.totalSupplierNetAmount);
    grouped[key] = current;
  });

  return Object.keys(grouped)
    .map(function (key) {
      return grouped[key];
    })
    .sort(function (left, right) {
      return left.payoutTermDays - right.payoutTermDays;
    });
}

function buildSupplierPayoutSummary_(outstanding, history, referenceDate) {
  var baseDate = referenceDate || todayIsoDate_();
  var dueItems = outstanding.filter(function (item) {
    return item.dueDate && String(item.dueDate) <= String(baseDate);
  });
  var overdueItems = outstanding.filter(function (item) {
    return item.dueStatus === "overdue";
  });

  return {
    outstandingCount: outstanding.length,
    outstandingAmount: outstanding.reduce(function (sum, item) {
      return sum + toNumber_(item.totalSupplierNetAmount);
    }, 0),
    dueCount: dueItems.length,
    dueAmount: dueItems.reduce(function (sum, item) {
      return sum + toNumber_(item.totalSupplierNetAmount);
    }, 0),
    overdueCount: overdueItems.length,
    overdueAmount: overdueItems.reduce(function (sum, item) {
      return sum + toNumber_(item.totalSupplierNetAmount);
    }, 0),
    settledCount: history.length,
    settledAmount: history.reduce(function (sum, item) {
      return sum + toNumber_(item.totalSupplierNetAmount);
    }, 0),
    termBuckets: summarizeTermBuckets_(outstanding),
  };
}

function listSupplierPayoutsAction_(token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin"]);

  var transactions = getSheetRecords_("transactions").filter(function (record) {
    return !record.deleted_at;
  });
  var history = getSheetRecords_("supplier_payouts")
    .map(sanitizeSupplierPayout_)
    .sort(function (left, right) {
      var dueDateCompare = String(right.dueDate || "").localeCompare(String(left.dueDate || ""));
      if (dueDateCompare !== 0) return dueDateCompare;
      return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    });
  var outstanding = buildOutstandingSupplierPayouts_(transactions, todayIsoDate_());

  return {
    summary: buildSupplierPayoutSummary_(outstanding, history, todayIsoDate_()),
    outstanding: outstanding,
    history: history,
  };
}

function settleSupplierPayoutAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin"]);

  if (!payload.supplierId || !payload.dueDate) {
    throw new Error("Supplier dan jatuh tempo payout wajib diisi.");
  }

  var existingPayout = payload.id ? getRecordById_("supplier_payouts", payload.id) : null;
  if (existingPayout) {
    var settledIds = getSheetRecords_("transactions").filter(function (record) {
      return String(record.supplier_payout_id) === String(existingPayout.id);
    }).map(function (record) {
      return record.id;
    });

    return {
      payout: sanitizeSupplierPayout_(existingPayout),
      settledTransactionCount: toNumber_(existingPayout.transaction_count),
      transactionIds: settledIds,
    };
  }

  var now = nowIso_();
  var transactions = getSheetRecords_("transactions").filter(function (record) {
    return !record.deleted_at
      && !record.supplier_payout_id
      && String(record.supplier_id) === String(payload.supplierId)
      && String(record.payout_due_date) === String(payload.dueDate);
  });

  if (!transactions.length) {
    throw new Error("Tidak ada transaksi outstanding untuk payout ini.");
  }

  var outstanding = buildOutstandingSupplierPayouts_(transactions, todayIsoDate_());
  var grouped = outstanding[0];

  if (!grouped) {
    throw new Error("Gagal menyusun payout pemasok.");
  }

  var payoutRecord = {
    id: payload.id || generateId_("PAY"),
    supplier_id: grouped.supplierId,
    supplier_name_snapshot: grouped.supplierNameSnapshot,
    period_start: grouped.periodStart,
    period_end: grouped.periodEnd,
    due_date: grouped.dueDate,
    transaction_count: grouped.transactionCount,
    total_gross_sales: grouped.totalGrossSales,
    total_profit: grouped.totalProfit,
    total_commission: grouped.totalCommission,
    total_supplier_net_amount: grouped.totalSupplierNetAmount,
    status: "paid",
    paid_at: now,
    paid_by_user_id: context.user.id,
    paid_by_name: context.user.full_name,
    notes: String(payload.notes || "").trim(),
    created_at: now,
    updated_at: now,
  };

  saveSheetRecord_("supplier_payouts", payoutRecord);

  transactions.forEach(function (record) {
    record.supplier_payout_id = payoutRecord.id;
    record.updated_at = now;
    saveSheetRecord_("transactions", withoutMeta_(record), record._rowNumber);
  });

  return {
    payout: sanitizeSupplierPayout_(payoutRecord),
    settledTransactionCount: transactions.length,
    transactionIds: transactions.map(function (record) {
      return record.id;
    }),
  };
}
