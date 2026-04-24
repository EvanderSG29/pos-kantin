function sanitizeDailyFinance_(record) {
  return {
    id: record.id,
    financeDate: record.finance_date,
    grossAmount: toNumber_(record.gross_amount),
    changeTotal: toNumber_(record.change_total),
    netAmount: toNumber_(record.net_amount),
    notes: record.notes,
    createdByUserId: record.created_by_user_id,
    createdByName: record.created_by_name,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    deletedAt: record.deleted_at || "",
  };
}

function sanitizeChangeEntry_(record) {
  return {
    id: record.id,
    dailyFinanceId: record.daily_finance_id,
    financeDate: record.finance_date,
    buyerId: record.buyer_id,
    buyerNameSnapshot: record.buyer_name_snapshot,
    changeAmount: toNumber_(record.change_amount),
    status: record.status || "belum",
    settledAt: record.settled_at,
    settledByUserId: record.settled_by_user_id,
    settledByName: record.settled_by_name,
    notes: record.notes,
    createdByUserId: record.created_by_user_id,
    createdByName: record.created_by_name,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    deletedAt: record.deleted_at || "",
  };
}

function ensureFinanceAccess_(record, context) {
  if (!record || record.deleted_at) {
    throw new Error("Data keuangan harian tidak ditemukan.");
  }

  if (context.user.role !== "admin" && String(record.created_by_user_id) !== String(context.user.id)) {
    throw new Error("Data keuangan harian ini bukan milik Anda.");
  }
}

function ensureChangeEntryAccess_(record, context) {
  if (!record || record.deleted_at) {
    throw new Error("Data kembalian tidak ditemukan.");
  }

  if (context.user.role !== "admin" && String(record.created_by_user_id) !== String(context.user.id)) {
    throw new Error("Data kembalian ini bukan milik Anda.");
  }
}

function getChangeEntriesByFinanceId_(financeId) {
  return getSheetRecords_("change_entries").filter(function (record) {
    return !record.deleted_at && String(record.daily_finance_id) === String(financeId);
  });
}

function buildDailyFinanceSummary_(record, relatedEntries) {
  var pendingCount = relatedEntries.filter(function (entry) {
    return entry.status !== "selesai";
  }).length;

  return Object.assign({}, sanitizeDailyFinance_(record), {
    changeEntryCount: relatedEntries.length,
    pendingChangeCount: pendingCount,
    settledChangeCount: relatedEntries.length - pendingCount,
  });
}

function sortDailyFinanceRecords_(items) {
  return items.sort(function (left, right) {
    var dateDelta = new Date(right.finance_date).getTime() - new Date(left.finance_date).getTime();
    if (dateDelta !== 0) return dateDelta;
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

function listDailyFinanceAction_(payload, token) {
  var context = requireSession_(token);
  var items = getSheetRecords_("daily_finance").filter(function (record) {
    return !record.deleted_at;
  });
  var query = normalizeText_(payload.query || payload.search || "");

  if (context.user.role !== "admin") {
    items = items.filter(function (record) {
      return String(record.created_by_user_id) === String(context.user.id);
    });
  }

  if (payload.financeDate) {
    items = items.filter(function (record) {
      return String(record.finance_date) === String(payload.financeDate);
    });
  }

  if (payload.startDate) {
    items = items.filter(function (record) {
      return String(record.finance_date) >= String(payload.startDate);
    });
  }

  if (payload.endDate) {
    items = items.filter(function (record) {
      return String(record.finance_date) <= String(payload.endDate);
    });
  }

  if (query) {
    items = items.filter(function (record) {
      return [
        record.notes,
        record.created_by_name,
      ].some(function (part) {
        return normalizeText_(part).indexOf(query) !== -1;
      });
    });
  }

  var allEntries = getSheetRecords_("change_entries").filter(function (record) {
    return !record.deleted_at;
  });

  var summarizedItems = sortDailyFinanceRecords_(items)
    .map(function (record) {
      var relatedEntries = allEntries.filter(function (entry) {
        return String(entry.daily_finance_id) === String(record.id);
      }).map(sanitizeChangeEntry_);
      return buildDailyFinanceSummary_(record, relatedEntries);
    });
  var paged = paginateRecords_(summarizedItems, payload);

  return {
    items: paged.items,
    pagination: paged.pagination,
  };
}

function getDailyFinanceDetailAction_(payload, token) {
  var context = requireSession_(token);
  var record = getRecordById_("daily_finance", payload.id);
  ensureFinanceAccess_(record, context);

  return {
    finance: buildDailyFinanceSummary_(
      record,
      getChangeEntriesByFinanceId_(record.id).map(sanitizeChangeEntry_),
    ),
    changeEntries: sortByDateDesc_(
      getChangeEntriesByFinanceId_(record.id).map(sanitizeChangeEntry_),
      "updatedAt",
    ),
  };
}

function normalizeIncomingChangeEntries_(items, existingEntries) {
  var existingById = {};
  var seenBuyerIds = {};

  existingEntries.forEach(function (entry) {
    existingById[String(entry.id)] = entry;
  });

  return (items || []).map(function (item, index) {
    var label = "Baris kembalian " + (index + 1);
    var existing = item.id ? existingById[String(item.id)] : null;

    if (!item.buyerId) {
      throw new Error(label + " wajib memilih pembeli.");
    }

    if (seenBuyerIds[String(item.buyerId)]) {
      throw new Error(label + " duplikat pembeli dalam satu catatan harian.");
    }
    seenBuyerIds[String(item.buyerId)] = true;

    var buyer = getBuyerById_(item.buyerId);
    if (!buyer) {
      throw new Error(label + " merujuk pembeli yang tidak ditemukan.");
    }
    if (buyer.status !== "aktif" && !(existing && String(existing.buyer_id) === String(item.buyerId))) {
      throw new Error(label + " merujuk pembeli yang sudah nonaktif.");
    }

    var changeAmount = parseNonNegativeNumberStrict_(item.changeAmount, label + " nominal");
    if (changeAmount <= 0) {
      throw new Error(label + " nominal harus lebih dari 0.");
    }

    return {
      id: item.id || "",
      existing: existing,
      buyer: buyer,
      changeAmount: changeAmount,
      notes: String(item.notes || "").trim(),
    };
  });
}

function saveDailyFinanceAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin", "petugas"]);

  var now = nowIso_();
  var existingFinance = payload.id ? getRecordById_("daily_finance", payload.id) : null;
  var existingEntries = existingFinance ? getChangeEntriesByFinanceId_(existingFinance.id) : [];

  if (existingFinance) {
    ensureFinanceAccess_(existingFinance, context);
  }

  if (!payload.financeDate) {
    throw new Error("Tanggal keuangan harian wajib diisi.");
  }

  var grossAmount = parseNonNegativeNumberStrict_(payload.grossAmount, "Total uang masuk");
  var changeTotal = parseNonNegativeNumberStrict_(payload.changeTotal, "Total uang kembalian");
  var normalizedEntries = normalizeIncomingChangeEntries_(payload.changeEntries, existingEntries);
  var sumChangeEntries = normalizedEntries.reduce(function (sum, entry) {
    return sum + entry.changeAmount;
  }, 0);

  if (changeTotal !== sumChangeEntries) {
    throw new Error("Total uang kembalian harus sama dengan jumlah rincian kembalian.");
  }

  if (changeTotal > grossAmount) {
    throw new Error("Total uang kembalian tidak boleh melebihi total uang masuk.");
  }

  var incomingIds = {};
  normalizedEntries.forEach(function (entry) {
    if (entry.id) {
      incomingIds[String(entry.id)] = true;
    }
    if (
      entry.existing &&
      entry.existing.status === "selesai" &&
      (
        String(entry.existing.buyer_id) !== String(entry.buyer.id) ||
        toNumber_(entry.existing.change_amount) !== entry.changeAmount
      )
    ) {
      throw new Error("Rincian kembalian yang sudah selesai tidak boleh diubah pembeli atau nominalnya.");
    }
  });

  existingEntries.forEach(function (entry) {
    if (incomingIds[String(entry.id)]) return;
    if (entry.status === "selesai") {
      throw new Error("Rincian kembalian yang sudah selesai tidak boleh dihapus dari catatan harian.");
    }
  });

  var financeRecord = existingFinance || {
    id: payload.id || generateId_("FIN"),
    created_at: now,
    created_by_user_id: context.user.id,
    created_by_name: context.user.full_name,
    deleted_at: "",
  };

  financeRecord.finance_date = payload.financeDate;
  financeRecord.gross_amount = grossAmount;
  financeRecord.change_total = changeTotal;
  financeRecord.net_amount = grossAmount - changeTotal;
  financeRecord.notes = String(payload.notes || "").trim();
  financeRecord.updated_at = now;
  financeRecord.deleted_at = "";

  saveSheetRecord_("daily_finance", withoutMeta_(financeRecord), existingFinance ? existingFinance._rowNumber : null);

  normalizedEntries.forEach(function (entry) {
    var record = entry.existing || {
      id: entry.id || generateId_("CHG"),
      created_at: now,
      created_by_user_id: context.user.id,
      created_by_name: context.user.full_name,
      status: "belum",
      settled_at: "",
      settled_by_user_id: "",
      settled_by_name: "",
      deleted_at: "",
    };

    record.daily_finance_id = financeRecord.id;
    record.finance_date = payload.financeDate;
    record.buyer_id = entry.buyer.id;
    record.buyer_name_snapshot = entry.buyer.buyer_name;
    record.change_amount = entry.changeAmount;
    record.notes = entry.notes;
    record.updated_at = now;
    record.deleted_at = "";

    saveSheetRecord_("change_entries", withoutMeta_(record), entry.existing ? entry.existing._rowNumber : null);
  });

  existingEntries.forEach(function (entry) {
    if (incomingIds[String(entry.id)]) return;
    entry.deleted_at = now;
    entry.updated_at = now;
    saveSheetRecord_("change_entries", withoutMeta_(entry), entry._rowNumber);
  });

  return getDailyFinanceDetailAction_({ id: financeRecord.id }, token);
}

function deleteDailyFinanceAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin", "petugas"]);

  var record = getRecordById_("daily_finance", payload.id);
  ensureFinanceAccess_(record, context);

  var relatedEntries = getChangeEntriesByFinanceId_(record.id);
  if (relatedEntries.some(function (entry) { return entry.status === "selesai"; })) {
    throw new Error("Catatan harian dengan kembalian selesai tidak bisa dihapus. Ubah statusnya dulu bila memang perlu.");
  }

  var now = nowIso_();
  record.deleted_at = now;
  record.updated_at = now;
  saveSheetRecord_("daily_finance", withoutMeta_(record), record._rowNumber);

  relatedEntries.forEach(function (entry) {
    entry.deleted_at = now;
    entry.updated_at = now;
    saveSheetRecord_("change_entries", withoutMeta_(entry), entry._rowNumber);
  });

  return sanitizeDailyFinance_(record);
}

function listChangeEntriesAction_(payload, token) {
  var context = requireSession_(token);
  var items = getSheetRecords_("change_entries").filter(function (record) {
    return !record.deleted_at;
  });
  var query = normalizeText_(payload.query || payload.search || "");

  if (context.user.role !== "admin") {
    items = items.filter(function (record) {
      return String(record.created_by_user_id) === String(context.user.id);
    });
  }

  if (payload.status) {
    items = items.filter(function (record) {
      return normalizeText_(record.status) === normalizeText_(payload.status);
    });
  }

  if (payload.financeDate) {
    items = items.filter(function (record) {
      return String(record.finance_date) === String(payload.financeDate);
    });
  }

  if (query) {
    items = items.filter(function (record) {
      return [
        record.buyer_name_snapshot,
        record.notes,
        record.created_by_name,
      ].some(function (part) {
        return normalizeText_(part).indexOf(query) !== -1;
      });
    });
  }

  var sortedItems = items
    .map(sanitizeChangeEntry_)
    .sort(function (left, right) {
      if (left.status !== right.status) {
        return left.status === "belum" ? -1 : 1;
      }

      var dateDelta = new Date(right.financeDate).getTime() - new Date(left.financeDate).getTime();
      if (dateDelta !== 0) return dateDelta;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  var paged = paginateRecords_(sortedItems, payload);

  return {
    items: paged.items,
    pagination: paged.pagination,
  };
}

function updateChangeEntryStatusAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin", "petugas"]);

  var record = getRecordById_("change_entries", payload.id);
  ensureChangeEntryAccess_(record, context);

  var nextStatus = payload.status === "selesai" ? "selesai" : payload.status === "belum" ? "belum" : "";
  if (!nextStatus) {
    throw new Error("Status kembalian hanya boleh 'belum' atau 'selesai'.");
  }

  record.status = nextStatus;
  record.updated_at = nowIso_();

  if (nextStatus === "selesai") {
    record.settled_at = record.updated_at;
    record.settled_by_user_id = context.user.id;
    record.settled_by_name = context.user.full_name;
  } else {
    record.settled_at = "";
    record.settled_by_user_id = "";
    record.settled_by_name = "";
  }

  saveSheetRecord_("change_entries", withoutMeta_(record), record._rowNumber);
  return sanitizeChangeEntry_(record);
}
