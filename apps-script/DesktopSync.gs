function maxIsoTimestamp_(left, right) {
  return String(left || "") > String(right || "") ? String(left || "") : String(right || "");
}

function getRecordSyncTimestamp_(record) {
  return maxIsoTimestamp_(
    maxIsoTimestamp_(record.updated_at, record.created_at),
    record.deleted_at
  );
}

function isRecordUpdatedSince_(record, sinceValue) {
  if (!sinceValue) return true;
  return String(getRecordSyncTimestamp_(record)) > String(sinceValue);
}

function buildSheetCursor_(schemaKey) {
  return getSheetRecords_(schemaKey).reduce(function (cursor, record) {
    return maxIsoTimestamp_(cursor, getRecordSyncTimestamp_(record));
  }, "");
}

function syncPullAction_(payload, token) {
  requireSession_(token);

  var since = (payload && payload.since) || {};

  var users = getSheetRecords_("users")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.users);
    })
    .map(sanitizeUser_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  var buyers = getSheetRecords_("buyers")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.buyers);
    })
    .map(sanitizeBuyer_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  var savings = getSheetRecords_("savings")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.savings);
    })
    .map(sanitizeSaving_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  var suppliers = getSheetRecords_("suppliers")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.suppliers);
    })
    .map(sanitizeSupplier_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  var transactions = getSheetRecords_("transactions")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.transactions);
    })
    .map(sanitizeTransaction_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  var dailyFinance = getSheetRecords_("daily_finance")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.dailyFinance);
    })
    .map(sanitizeDailyFinance_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  var changeEntries = getSheetRecords_("change_entries")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.changeEntries);
    })
    .map(sanitizeChangeEntry_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  var supplierPayouts = getSheetRecords_("supplier_payouts")
    .filter(function (record) {
      return isRecordUpdatedSince_(record, since.supplierPayouts);
    })
    .map(sanitizeSupplierPayout_)
    .sort(function (left, right) {
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  return {
    users: users,
    buyers: buyers,
    savings: savings,
    suppliers: suppliers,
    transactions: transactions,
    dailyFinance: dailyFinance,
    changeEntries: changeEntries,
    supplierPayouts: supplierPayouts,
    cursors: {
      users: buildSheetCursor_("users"),
      buyers: buildSheetCursor_("buyers"),
      savings: buildSheetCursor_("savings"),
      suppliers: buildSheetCursor_("suppliers"),
      transactions: buildSheetCursor_("transactions"),
      dailyFinance: buildSheetCursor_("daily_finance"),
      changeEntries: buildSheetCursor_("change_entries"),
      supplierPayouts: buildSheetCursor_("supplier_payouts"),
    },
    serverTime: nowIso_(),
  };
}
