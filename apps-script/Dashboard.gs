function dashboardSummaryAction_(token) {
  var context = requireSession_(token);
  var transactions = getSheetRecords_("transactions").filter(function (record) {
    return !record.deleted_at;
  });

  if (context.user.role !== "admin") {
    transactions = transactions.filter(function (record) {
      return String(record.input_by_user_id) === String(context.user.id);
    });
  }

  var totalValue = transactions.reduce(function (sum, record) {
    return sum + toNumber_(record.total_value);
  }, 0);
  var totalItems = transactions.reduce(function (sum, record) {
    return sum + toNumber_(record.quantity);
  }, 0);
  var totalRemaining = transactions.reduce(function (sum, record) {
    return sum + toNumber_(record.remaining_quantity);
  }, 0);
  var activeSuppliers = {};

  transactions.forEach(function (record) {
    activeSuppliers[record.supplier_name] = true;
  });

  return {
    scope: context.user.role,
    transactionCount: transactions.length,
    totalValue: totalValue,
    totalItems: totalItems,
    totalRemaining: totalRemaining,
    activeSuppliers: Object.keys(activeSuppliers).length,
    userCount: getSheetRecords_("users").filter(function (record) {
      return record.status === "aktif";
    }).length,
    savingsCount: getSheetRecords_("savings").length,
    recentTransactions: sortByDateDesc_(
      transactions.map(sanitizeTransaction_),
      "transactionDate",
    ).slice(0, 5),
  };
}

