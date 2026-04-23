var BUYER_IMPORT_SEED_NOTE = "IMPORT_CSV_SEED";

function sanitizeBuyer_(record) {
  return {
    id: record.id,
    buyerName: record.buyer_name,
    classOrCategory: record.class_or_category,
    openingBalance: toNumber_(record.opening_balance),
    currentBalance: toNumber_(record.current_balance),
    status: record.status || "aktif",
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    lastImportedAt: record.last_imported_at,
  };
}

function buildBuyerKey_(buyerName, classOrCategory) {
  return normalizeText_(buyerName) + "||" + normalizeText_(classOrCategory);
}

function getBuyerById_(buyerId) {
  return getRecordById_("buyers", buyerId);
}

function listBuyersAction_(payload, token) {
  requireSession_(token);

  var items = getSheetRecords_("buyers");
  var statusFilter = normalizeText_(payload.status || "");
  var query = normalizeText_(payload.query || payload.search || "");

  if (statusFilter) {
    items = items.filter(function (record) {
      return normalizeText_(record.status) === statusFilter;
    });
  }

  if (query) {
    items = items.filter(function (record) {
      return [
        record.buyer_name,
        record.class_or_category,
        record.status,
      ].some(function (part) {
        return normalizeText_(part).indexOf(query) !== -1;
      });
    });
  }

  return items
    .map(sanitizeBuyer_)
    .sort(function (left, right) {
      if (left.status !== right.status) {
        return left.status === "aktif" ? -1 : 1;
      }

      var nameDelta = left.buyerName.localeCompare(right.buyerName);
      if (nameDelta !== 0) return nameDelta;
      return left.classOrCategory.localeCompare(right.classOrCategory);
    });
}

function normalizeBuyerImportRow_(row, index) {
  var buyerName = String(
    row.nama_pembeli ||
    row.buyerName ||
    row.buyer_name ||
    row.name ||
    "",
  ).trim();
  var classOrCategory = String(
    row["kelas/kategori"] ||
    row.kelas ||
    row.kategori ||
    row.classOrCategory ||
    row.class_or_category ||
    "",
  ).trim();
  var rawBalance = row.saldo_awal;
  if (rawBalance === undefined) rawBalance = row.openingBalance;
  if (rawBalance === undefined) rawBalance = row.opening_balance;

  if (!buyerName) {
    throw new Error("Baris " + index + ": nama_pembeli wajib diisi.");
  }

  if (!classOrCategory) {
    throw new Error("Baris " + index + ": kelas/kategori wajib diisi.");
  }

  var openingBalance = parseNonNegativeNumberStrict_(rawBalance, "Baris " + index + " saldo_awal");

  return {
    buyerName: buyerName,
    classOrCategory: classOrCategory,
    openingBalance: openingBalance,
    matchKey: buildBuyerKey_(buyerName, classOrCategory),
  };
}

function validateBuyerImportRows_(rows) {
  if (!rows || !rows.length) {
    throw new Error("Data CSV kosong. Pastikan file berisi minimal satu baris pembeli.");
  }

  var seenKeys = {};

  return rows.map(function (row, index) {
    var normalized = normalizeBuyerImportRow_(row, index + 2);
    if (seenKeys[normalized.matchKey]) {
      throw new Error(
        "Baris " + (index + 2) + ": kombinasi nama_pembeli dan kelas/kategori duplikat di file CSV.",
      );
    }

    seenKeys[normalized.matchKey] = true;
    return normalized;
  });
}

function upsertBuyerSavingsSeed_(buyerRecord, context, importedAt) {
  var existingSeed = getSheetRecords_("savings").find(function (record) {
    return String(record.student_id) === String(buyerRecord.id) && record.notes === BUYER_IMPORT_SEED_NOTE;
  });
  var record = existingSeed || {
    id: generateId_("SVG"),
    created_at: importedAt,
  };

  record.student_id = buyerRecord.id;
  record.student_name = buyerRecord.buyer_name;
  record.class_name = buyerRecord.class_or_category;
  record.gender = "";
  record.group_name = "";
  record.deposit_amount = buyerRecord.opening_balance;
  record.change_balance = buyerRecord.current_balance;
  record.recorded_at = String(importedAt).slice(0, 10);
  record.recorded_by_user_id = context.user.id;
  record.recorded_by_name = context.user.full_name;
  record.notes = BUYER_IMPORT_SEED_NOTE;
  record.updated_at = importedAt;

  saveSheetRecord_("savings", withoutMeta_(record), existingSeed ? existingSeed._rowNumber : null);
}

function importBuyersAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin"]);

  var rows = validateBuyerImportRows_(payload.rows || []);
  var now = nowIso_();
  var existingBuyers = getSheetRecords_("buyers");
  var existingByKey = {};
  var importedKeys = {};
  var result = {
    inserted: 0,
    updated: 0,
    archived: 0,
    totalRows: rows.length,
    lastImportedAt: now,
  };

  existingBuyers.forEach(function (record) {
    existingByKey[buildBuyerKey_(record.buyer_name, record.class_or_category)] = record;
  });

  rows.forEach(function (row) {
    var existing = existingByKey[row.matchKey];
    var record = existing || {
      id: generateId_("BYR"),
      created_at: now,
    };

    record.buyer_name = row.buyerName;
    record.class_or_category = row.classOrCategory;
    record.opening_balance = row.openingBalance;
    record.current_balance = row.openingBalance;
    record.status = "aktif";
    record.updated_at = now;
    record.last_imported_at = now;

    saveSheetRecord_("buyers", withoutMeta_(record), existing ? existing._rowNumber : null);
    upsertBuyerSavingsSeed_(record, context, now);

    importedKeys[row.matchKey] = true;
    if (existing) {
      result.updated += 1;
    } else {
      result.inserted += 1;
    }
  });

  existingBuyers.forEach(function (record) {
    var matchKey = buildBuyerKey_(record.buyer_name, record.class_or_category);
    if (importedKeys[matchKey]) return;
    if (record.status === "nonaktif") return;

    record.status = "nonaktif";
    record.updated_at = now;
    saveSheetRecord_("buyers", withoutMeta_(record), record._rowNumber);
    result.archived += 1;
  });

  return result;
}
