function sanitizeTransaction_(record) {
  var payoutDueDate = record.payout_due_date || "";
  var isSettled = Boolean(record.supplier_payout_id);

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
    soldQuantity: toNumber_(record.sold_quantity),
    costPrice: toNumber_(record.cost_price),
    unitPrice: toNumber_(record.unit_price),
    grossSales: toNumber_(record.gross_sales, record.total_value),
    totalValue: toNumber_(record.total_value, record.gross_sales),
    profitAmount: toNumber_(record.profit_amount),
    commissionRate: toNumber_(record.commission_rate, 10),
    commissionBaseType: normalizeCommissionBaseType_(record.commission_base_type),
    commissionAmount: toNumber_(record.commission_amount),
    supplierNetAmount: toNumber_(record.supplier_net_amount),
    payoutTermDays: toNumber_(record.payout_term_days),
    payoutDueDate: payoutDueDate,
    supplierPayoutId: record.supplier_payout_id || "",
    dueStatus: isSettled ? "settled" : getDueStatusCode_(payoutDueDate),
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    deletedAt: record.deleted_at || "",
  };
}

function ensureTransactionAccess_(record, context) {
  if (!record || record.deleted_at) {
    throw new Error("Transaksi tidak ditemukan.");
  }

  if (context.user.role !== "admin" && String(record.input_by_user_id) !== String(context.user.id)) {
    throw new Error("Transaksi ini bukan milik Anda.");
  }
}

function ensureTransactionMutable_(record) {
  if (record && record.supplier_payout_id) {
    throw new Error("Transaksi yang sudah masuk payout pemasok tidak bisa diubah atau dihapus.");
  }
}

function buildTransactionListSummary_(items) {
  return {
    rowCount: items.length,
    totalGrossSales: items.reduce(function (sum, item) {
      return sum + toNumber_(item.grossSales, item.totalValue);
    }, 0),
    totalProfit: items.reduce(function (sum, item) {
      return sum + toNumber_(item.profitAmount);
    }, 0),
    totalCommission: items.reduce(function (sum, item) {
      return sum + toNumber_(item.commissionAmount);
    }, 0),
    totalSupplierNetAmount: items.reduce(function (sum, item) {
      return sum + toNumber_(item.supplierNetAmount);
    }, 0),
    unsettledSupplierNetAmount: items
      .filter(function (item) {
        return !item.supplierPayoutId;
      })
      .reduce(function (sum, item) {
        return sum + toNumber_(item.supplierNetAmount);
      }, 0),
    uniqueSupplierCount: new Set(items.map(function (item) {
      return item.supplierName;
    })).size,
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

  if (payload.supplierId) {
    items = items.filter(function (record) {
      return String(record.supplier_id) === String(payload.supplierId);
    });
  }

  if (payload.commissionBaseType) {
    items = items.filter(function (record) {
      return normalizeCommissionBaseType_(record.commission_base_type) === normalizeCommissionBaseType_(payload.commissionBaseType);
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

  var sanitizedItems = sortByDateDesc_(
    items.map(sanitizeTransaction_),
    "transactionDate"
  );
  var paged = paginateRecords_(sanitizedItems, payload);

  return {
    items: paged.items,
    pagination: paged.pagination,
    summary: payload.includeSummary ? buildTransactionListSummary_(sanitizedItems) : undefined,
  };
}

function saveTransactionAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin", "petugas"]);

  var now = nowIso_();
  var existing = payload.id ? getRecordById_("transactions", payload.id) : null;
  if (existing) {
    ensureTransactionAccess_(existing, context);
    ensureTransactionMutable_(existing);
  }

  if (!payload.supplierId) {
    throw new Error("Pemasok wajib dipilih dari master pemasok.");
  }

  var supplierRecord = getRecordById_("suppliers", payload.supplierId);
  if (!supplierRecord) {
    throw new Error("Pemasok tidak ditemukan.");
  }

  if (String(supplierRecord.is_active) === "false" && !existing) {
    throw new Error("Pemasok nonaktif tidak bisa dipakai untuk transaksi baru.");
  }

  if (!payload.transactionDate || !payload.itemName || !payload.unitName) {
    throw new Error("Tanggal, pemasok, makanan, dan satuan wajib diisi.");
  }

  var quantity = parseNonNegativeNumberStrict_(payload.quantity, "Jumlah titip");
  var remainingQuantity = parseNonNegativeNumberStrict_(payload.remainingQuantity, "Sisa");
  var unitPrice = parseNonNegativeNumberStrict_(payload.unitPrice, "Harga jual");
  var costPrice = parseNonNegativeNumberStrict_(payload.costPrice, "Harga modal");

  if (remainingQuantity > quantity) {
    throw new Error("Sisa tidak boleh lebih besar dari jumlah titip.");
  }

  var metrics = calculateTransactionMetrics_({
    quantity: quantity,
    remainingQuantity: remainingQuantity,
    unitPrice: unitPrice,
    costPrice: costPrice,
    commissionRate: supplierRecord.commission_rate,
    commissionBaseType: supplierRecord.commission_base_type,
    payoutTermDays: supplierRecord.payout_term_days,
    transactionDate: payload.transactionDate,
  });

  var record = existing || {
    id: generateId_("TRX"),
    created_at: now,
    input_by_user_id: context.user.id,
    input_by_name: context.user.full_name,
    supplier_payout_id: "",
    deleted_at: "",
  };

  record.transaction_date = payload.transactionDate;
  record.supplier_id = supplierRecord.id;
  record.supplier_name = supplierRecord.supplier_name;
  record.item_name = String(payload.itemName).trim();
  record.unit_name = String(payload.unitName).trim();
  record.quantity = metrics.quantity;
  record.remaining_quantity = metrics.remainingQuantity;
  record.sold_quantity = metrics.soldQuantity;
  record.cost_price = metrics.costPrice;
  record.unit_price = metrics.unitPrice;
  record.gross_sales = metrics.grossSales;
  record.profit_amount = metrics.profitAmount;
  record.commission_rate = metrics.commissionRate;
  record.commission_base_type = metrics.commissionBaseType;
  record.commission_amount = metrics.commissionAmount;
  record.supplier_net_amount = metrics.supplierNetAmount;
  record.payout_term_days = metrics.payoutTermDays;
  record.payout_due_date = metrics.payoutDueDate;
  record.total_value = metrics.totalValue;
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
  ensureTransactionAccess_(record, context);
  ensureTransactionMutable_(record);

  record.deleted_at = nowIso_();
  record.updated_at = record.deleted_at;
  saveSheetRecord_("transactions", withoutMeta_(record), record._rowNumber);

  return sanitizeTransaction_(record);
}
