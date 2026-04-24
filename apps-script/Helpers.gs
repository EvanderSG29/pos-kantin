function ok_(message, data) {
  return jsonResponse_({
    success: true,
    message: message,
    data: data === undefined ? null : data,
  });
}

function fail_(message, data) {
  return jsonResponse_({
    success: false,
    message: message,
    data: data === undefined ? null : data,
  });
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  return JSON.parse(e.postData.contents || "{}");
}

function nowIso_() {
  return new Date().toISOString();
}

function plusHoursIso_(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function toNumber_(value, fallback) {
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : (fallback || 0);
}

function parseNumberStrict_(value, fieldLabel) {
  if (value === "" || value === null || value === undefined) {
    throw new Error(fieldLabel + " wajib diisi.");
  }

  var parsed = Number(value);
  if (!isFinite(parsed)) {
    throw new Error(fieldLabel + " harus berupa angka.");
  }

  return parsed;
}

function parseNonNegativeNumberStrict_(value, fieldLabel) {
  var parsed = parseNumberStrict_(value, fieldLabel);
  if (parsed < 0) {
    throw new Error(fieldLabel + " tidak boleh negatif.");
  }
  return parsed;
}

function normalizeText_(value) {
  return String(value || "").trim().toLowerCase();
}

function generateId_(prefix) {
  return [prefix, Date.now(), Utilities.getUuid().slice(0, 8).toUpperCase()].join("-");
}

function hashValue_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ""),
    Utilities.Charset.UTF_8,
  );

  return digest
    .map(function (byte) {
      var v = byte < 0 ? byte + 256 : byte;
      return ("0" + v.toString(16)).slice(-2);
    })
    .join("");
}

function getSpreadsheetId_() {
  var scriptProperties = PropertiesService.getScriptProperties();
  return scriptProperties.getProperty(CONFIG.SPREADSHEET_ID_PROPERTY) || CONFIG.SPREADSHEET_ID;
}

function getSpreadsheet_() {
  var spreadsheetId = getSpreadsheetId_();
  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID belum dikonfigurasi. Jalankan setupApplicationSpreadsheet() atau setSpreadsheetId().");
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheetBySchema_(schemaKey) {
  var spreadsheet = getSpreadsheet_();
  var schema = CONFIG.SHEETS[schemaKey];
  if (!schema) {
    throw new Error("Schema sheet tidak dikenal: " + schemaKey);
  }

  var sheet = spreadsheet.getSheetByName(schema.name);
  if (!sheet) {
    throw new Error("Sheet tidak ditemukan: " + schema.name);
  }

  return sheet;
}

function normalizeCellValue_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function getSheetRecords_(schemaKey) {
  var sheet = getSheetBySchema_(schemaKey);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0];
  return values.slice(1).map(function (row, index) {
    var record = { _rowNumber: index + 2 };
    headers.forEach(function (header, columnIndex) {
      record[header] = normalizeCellValue_(row[columnIndex]);
    });
    return record;
  });
}

function saveSheetRecord_(schemaKey, record, rowNumber) {
  var sheet = getSheetBySchema_(schemaKey);
  var headers = CONFIG.SHEETS[schemaKey].headers;
  var values = headers.map(function (header) {
    return record[header] === undefined ? "" : record[header];
  });

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}

function getRecordById_(schemaKey, id) {
  return getSheetRecords_(schemaKey).find(function (record) {
    return String(record.id) === String(id);
  }) || null;
}

function ensureRole_(user, allowedRoles) {
  if (allowedRoles.indexOf(user.role) === -1) {
    throw new Error("Role user tidak diizinkan untuk aksi ini.");
  }
}

function withoutMeta_(record) {
  var clone = {};
  Object.keys(record).forEach(function (key) {
    if (key !== "_rowNumber") clone[key] = record[key];
  });
  return clone;
}

function sortByDateDesc_(items, fieldName) {
  return items.sort(function (left, right) {
    return new Date(right[fieldName]).getTime() - new Date(left[fieldName]).getTime();
  });
}

function sortByUpdatedAtDesc_(items, fieldName, fallbackField) {
  return items.sort(function (left, right) {
    var leftPrimary = new Date(left[fieldName]).getTime();
    var rightPrimary = new Date(right[fieldName]).getTime();
    if (rightPrimary !== leftPrimary) {
      return rightPrimary - leftPrimary;
    }

    return new Date(right[fallbackField]).getTime() - new Date(left[fallbackField]).getTime();
  });
}

function normalizePage_(value, fallback) {
  return Math.max(Math.floor(toNumber_(value, fallback || 1)), 1);
}

function normalizePageSize_(value, fallback) {
  return Math.max(Math.floor(toNumber_(value, fallback || 10)), 1);
}

function buildPagination_(totalItems, page, pageSize, itemCount) {
  var safeTotalItems = Math.max(Math.floor(toNumber_(totalItems, 0)), 0);
  var safePageSize = normalizePageSize_(pageSize, 10);
  var totalPages = Math.max(Math.ceil(safeTotalItems / safePageSize), 1);
  var safePage = Math.min(normalizePage_(page, 1), totalPages);
  var safeItemCount = Math.max(Math.floor(toNumber_(itemCount, 0)), 0);
  var startItem = safeTotalItems ? ((safePage - 1) * safePageSize) + 1 : 0;
  var endItem = safeTotalItems ? Math.min(startItem + safeItemCount - 1, safeTotalItems) : 0;

  return {
    page: safePage,
    pageSize: safePageSize,
    totalItems: safeTotalItems,
    totalPages: totalPages,
    itemCount: safeItemCount,
    startItem: startItem,
    endItem: endItem,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

function paginateRecords_(items, payload) {
  var pageSize = normalizePageSize_(payload && payload.pageSize, 10);
  var totalPages = Math.max(Math.ceil(items.length / pageSize), 1);
  var page = Math.min(normalizePage_(payload && payload.page, 1), totalPages);
  var offset = (page - 1) * pageSize;
  var pagedItems = items.slice(offset, offset + pageSize);

  return {
    items: pagedItems,
    pagination: buildPagination_(items.length, page, pageSize, pagedItems.length),
  };
}

function todayIsoDate_() {
  return Utilities.formatDate(new Date(), CONFIG.DEFAULT_TIMEZONE, "yyyy-MM-dd");
}

function addDaysToIsoDate_(value, days) {
  if (!value) return "";

  var parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return "";

  var date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  date.setUTCDate(date.getUTCDate() + Math.max(toNumber_(days), 0));
  return date.toISOString().slice(0, 10);
}

function normalizeCommissionBaseType_(value) {
  return String(value) === "profit" ? "profit" : "revenue";
}

function getDueStatusCode_(dueDate, referenceDate) {
  var baseDate = referenceDate || todayIsoDate_();
  if (!dueDate) return "unknown";
  if (String(dueDate) < String(baseDate)) return "overdue";
  if (String(dueDate) === String(baseDate)) return "today";
  return "upcoming";
}

function calculateTransactionMetrics_(input) {
  var quantity = Math.max(toNumber_(input.quantity), 0);
  var remainingQuantity = Math.max(toNumber_(input.remainingQuantity), 0);
  var unitPrice = Math.max(toNumber_(input.unitPrice), 0);
  var costPrice = Math.max(toNumber_(input.costPrice), 0);
  var commissionRate = Math.max(toNumber_(input.commissionRate, 10), 0);
  var payoutTermDays = Math.max(toNumber_(input.payoutTermDays), 0);
  var commissionBaseType = normalizeCommissionBaseType_(input.commissionBaseType);
  var soldQuantity = Math.max(quantity - remainingQuantity, 0);
  var grossSales = soldQuantity * unitPrice;
  var profitAmount = Math.max((unitPrice - costPrice) * soldQuantity, 0);
  var commissionBaseAmount = commissionBaseType === "profit" ? profitAmount : grossSales;
  var commissionAmount = Math.round(commissionBaseAmount * (commissionRate / 100));
  var payoutDueDate = input.transactionDate
    ? addDaysToIsoDate_(input.transactionDate, payoutTermDays)
    : "";

  return {
    quantity: quantity,
    remainingQuantity: remainingQuantity,
    soldQuantity: soldQuantity,
    costPrice: costPrice,
    unitPrice: unitPrice,
    grossSales: grossSales,
    totalValue: grossSales,
    profitAmount: profitAmount,
    commissionRate: commissionRate,
    commissionBaseType: commissionBaseType,
    commissionAmount: commissionAmount,
    supplierNetAmount: grossSales - commissionAmount,
    payoutTermDays: payoutTermDays,
    payoutDueDate: payoutDueDate,
  };
}
