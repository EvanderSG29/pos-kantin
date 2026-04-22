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

