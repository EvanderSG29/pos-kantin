function sanitizeTransaction_(record) {
  return {
    id: record.id,
    transactionDate: record.transaction_date,
    inputByUserId: record.input_by_user_id,
    inputByName: record.input_by_name,
    supplierId: record.supplier_id,
    supplierName: record.supplier_name,
    itemName: record.item_name,
    unitName: record.unit_name,
    quantity: toNumber_(record.quantity),
    remainingQuantity: toNumber_(record.remaining_quantity),
    unitPrice: toNumber_(record.unit_price),
    totalValue: toNumber_(record.total_value),
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function listTransactionsAction_(payload, token) {
  var context = requireSession_(token);
  var items = getSheetRecords_("transactions").filter(function (record) {
    return !record.deleted_at;
  });

  if (context.user.role !== "admin") {
    items = items.filter(function (record) {
      return String(record.input_by_user_id) === String(context.user.id);
    });
  }

  if (payload.transactionDate) {
    items = items.filter(function (record) {
      return String(record.transaction_date) === String(payload.transactionDate);
    });
  }

  if (payload.startDate) {
    items = items.filter(function (record) {
      return String(record.transaction_date) >= String(payload.startDate);
    });
  }

  if (payload.endDate) {
    items = items.filter(function (record) {
      return String(record.transaction_date) <= String(payload.endDate);
    });
  }

  if (payload.query || payload.search) {
    var query = normalizeText_(payload.query || payload.search);
    items = items.filter(function (record) {
      return [
        record.item_name,
        record.supplier_name,
        record.input_by_name,
        record.notes,
      ].some(function (part) {
        return normalizeText_(part).indexOf(query) !== -1;
      });
    });
  }

  return sortByDateDesc_(
    items.map(sanitizeTransaction_),
    "transactionDate",
  );
}

function saveTransactionAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin", "petugas"]);

  var now = nowIso_();
  var existing = payload.id ? getRecordById_("transactions", payload.id) : null;
  if (existing && context.user.role !== "admin" && String(existing.input_by_user_id) !== String(context.user.id)) {
    throw new Error("Transaksi ini bukan milik Anda.");
  }

  var supplierRecord = payload.supplierId ? getRecordById_("suppliers", payload.supplierId) : null;
  var supplierName = String(payload.supplierName || (supplierRecord ? supplierRecord.supplier_name : "") || "").trim();
  if (!payload.transactionDate || !payload.itemName || !payload.unitName || !supplierName) {
    throw new Error("Tanggal, pemasok, makanan, dan satuan wajib diisi.");
  }

  var quantity = toNumber_(payload.quantity, 0);
  var remainingQuantity = toNumber_(payload.remainingQuantity, 0);
  var unitPrice = toNumber_(payload.unitPrice, 0);

  var record = existing || {
    id: generateId_("TRX"),
    created_at: now,
    input_by_user_id: context.user.id,
    input_by_name: context.user.full_name,
    deleted_at: "",
  };

  record.transaction_date = payload.transactionDate;
  record.supplier_id = payload.supplierId || "";
  record.supplier_name = supplierName;
  record.item_name = String(payload.itemName).trim();
  record.unit_name = String(payload.unitName).trim();
  record.quantity = quantity;
  record.remaining_quantity = remainingQuantity;
  record.unit_price = unitPrice;
  record.total_value = quantity * unitPrice;
  record.notes = String(payload.notes || "").trim();
  record.updated_at = now;
  record.deleted_at = "";

  saveSheetRecord_("transactions", withoutMeta_(record), existing ? existing._rowNumber : null);
  return sanitizeTransaction_(record);
}

function deleteTransactionAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin", "petugas"]);

  var record = getRecordById_("transactions", payload.id);
  if (!record || record.deleted_at) {
    throw new Error("Transaksi tidak ditemukan.");
  }

  if (context.user.role !== "admin" && String(record.input_by_user_id) !== String(context.user.id)) {
    throw new Error("Transaksi ini bukan milik Anda.");
  }

  record.deleted_at = nowIso_();
  record.updated_at = record.deleted_at;
  saveSheetRecord_("transactions", withoutMeta_(record), record._rowNumber);

  return sanitizeTransaction_(record);
}

