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

  return {
    users: users,
    suppliers: suppliers,
    transactions: transactions,
    cursors: {
      users: buildSheetCursor_("users"),
      suppliers: buildSheetCursor_("suppliers"),
      transactions: buildSheetCursor_("transactions"),
    },
    serverTime: nowIso_(),
  };
}
