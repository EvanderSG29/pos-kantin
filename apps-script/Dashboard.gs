function dashboardSummaryAction_(token) {
  var context = requireSession_(token);
  var today = todayIsoDate_();
  var transactions = getSheetRecords_("transactions").filter(function (record) {
    return !record.deleted_at;
  });
  var dailyFinance = getSheetRecords_("daily_finance").filter(function (record) {
    return !record.deleted_at;
  });
  var changeEntries = getSheetRecords_("change_entries").filter(function (record) {
    return !record.deleted_at;
  });

  if (context.user.role !== "admin") {
    transactions = transactions.filter(function (record) {
      return String(record.input_by_user_id) === String(context.user.id);
    });
    dailyFinance = dailyFinance.filter(function (record) {
      return String(record.created_by_user_id) === String(context.user.id);
    });
    changeEntries = changeEntries.filter(function (record) {
      return String(record.created_by_user_id) === String(context.user.id);
    });
  }

  var sanitizedTransactions = transactions.map(sanitizeTransaction_);
  var activeSuppliers = {};

  sanitizedTransactions.forEach(function (record) {
    activeSuppliers[record.supplierName] = true;
  });

  var totalGrossSales = sanitizedTransactions.reduce(function (sum, record) {
    return sum + toNumber_(record.grossSales, record.totalValue);
  }, 0);
  var totalProfit = sanitizedTransactions.reduce(function (sum, record) {
    return sum + toNumber_(record.profitAmount);
  }, 0);
  var totalCommission = sanitizedTransactions.reduce(function (sum, record) {
    return sum + toNumber_(record.commissionAmount);
  }, 0);
  var totalItems = sanitizedTransactions.reduce(function (sum, record) {
    return sum + toNumber_(record.quantity);
  }, 0);
  var totalRemaining = sanitizedTransactions.reduce(function (sum, record) {
    return sum + toNumber_(record.remainingQuantity);
  }, 0);
  var todayTransactions = sanitizedTransactions.filter(function (record) {
    return String(record.transactionDate) === String(today);
  });
  var pendingChangeEntries = changeEntries.filter(function (record) {
    return record.status !== "selesai";
  });
  var outstandingPayouts = context.user.role === "admin"
    ? buildOutstandingSupplierPayouts_(transactions, today)
    : [];
  var latestDailyFinanceRecord = sortByUpdatedAtDesc_(dailyFinance, "finance_date", "updated_at")[0];
  var duePayouts = outstandingPayouts.filter(function (item) {
    return item.dueDate && String(item.dueDate) <= String(today);
  });
  var overduePayouts = outstandingPayouts.filter(function (item) {
    return item.dueStatus === "overdue";
  });

  return {
    scope: context.user.role,
    transactionCount: sanitizedTransactions.length,
    totalValue: totalGrossSales,
    totalGrossSales: totalGrossSales,
    totalProfit: totalProfit,
    totalCommission: totalCommission,
    totalItems: totalItems,
    totalRemaining: totalRemaining,
    activeSuppliers: Object.keys(activeSuppliers).length,
    todayGrossSales: todayTransactions.reduce(function (sum, record) {
      return sum + toNumber_(record.grossSales, record.totalValue);
    }, 0),
    todayCommission: todayTransactions.reduce(function (sum, record) {
      return sum + toNumber_(record.commissionAmount);
    }, 0),
    todayTransactionCount: todayTransactions.length,
    outstandingSupplierDebtAmount: outstandingPayouts.reduce(function (sum, item) {
      return sum + toNumber_(item.totalSupplierNetAmount);
    }, 0),
    dueSupplierDebtAmount: duePayouts.reduce(function (sum, item) {
      return sum + toNumber_(item.totalSupplierNetAmount);
    }, 0),
    overdueSupplierPayoutCount: overduePayouts.length,
    overdueSupplierPayoutAmount: overduePayouts.reduce(function (sum, item) {
      return sum + toNumber_(item.totalSupplierNetAmount);
    }, 0),
    userCount: getSheetRecords_("users").filter(function (record) {
      return record.status === "aktif";
    }).length,
    activeBuyerCount: getSheetRecords_("buyers").filter(function (record) {
      return record.status === "aktif";
    }).length,
    savingsCount: getSheetRecords_("savings").length,
    pendingChangeCount: pendingChangeEntries.length,
    pendingChangeAmount: pendingChangeEntries.reduce(function (sum, record) {
      return sum + toNumber_(record.change_amount);
    }, 0),
    latestDailyFinance: latestDailyFinanceRecord ? sanitizeDailyFinance_(latestDailyFinanceRecord) : null,
    recentTransactions: sortByDateDesc_(sanitizedTransactions, "transactionDate").slice(0, 5),
    outstandingPayoutBuckets: summarizeTermBuckets_(outstandingPayouts),
  };
}
