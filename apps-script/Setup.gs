function ensureSheetSchema_(spreadsheet, schema) {
  var sheet = spreadsheet.getSheetByName(schema.name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(schema.name);
  }

  var headerRange = sheet.getRange(1, 1, 1, schema.headers.length);
  headerRange.setValues([schema.headers]);
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
  return sheet;
}

function setupApplicationSpreadsheet() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var spreadsheetId = scriptProperties.getProperty(CONFIG.SPREADSHEET_ID_PROPERTY);
  var spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.create(CONFIG.DEFAULT_SPREADSHEET_TITLE);

  scriptProperties.setProperty(CONFIG.SPREADSHEET_ID_PROPERTY, spreadsheet.getId());

  Object.keys(CONFIG.SHEETS).forEach(function (schemaKey) {
    ensureSheetSchema_(spreadsheet, CONFIG.SHEETS[schemaKey]);
  });

  var defaultSheet = spreadsheet.getSheetByName("Sheet1");
  if (defaultSheet && !CONFIG.SHEETS[defaultSheet.getName()]) {
    spreadsheet.deleteSheet(defaultSheet);
  }

  if (!getUserByEmail_(CONFIG.DEFAULT_ADMIN_EMAIL)) {
    var now = nowIso_();
    saveSheetRecord_("users", {
      id: generateId_("USR"),
      full_name: "Evander Smid Gidion",
      nickname: "Evander",
      email: CONFIG.DEFAULT_ADMIN_EMAIL,
      role: "admin",
      status: "aktif",
      class_group: "XI PPLG",
      pin_hash: "",
      notes: "Admin seed awal. Set PIN lewat setUserPinByEmail().",
      created_at: now,
      updated_at: now,
    });
  }

  if (!getSheetRecords_("suppliers").length) {
    [
      "Kang Latif",
      "Uni",
      "Bu Eva",
    ].forEach(function (name) {
      var now = nowIso_();
      saveSheetRecord_("suppliers", {
        id: generateId_("SUP"),
        supplier_name: name,
        contact_name: "",
        contact_phone: "",
        notes: "Seed awal pemasok",
        is_active: "true",
        created_at: now,
        updated_at: now,
      });
    });
  }

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
  };
}

function setSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID wajib diisi.");
  }

  PropertiesService.getScriptProperties().setProperty(CONFIG.SPREADSHEET_ID_PROPERTY, spreadsheetId);
  return spreadsheetId;
}

function clearSpreadsheetId() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.SPREADSHEET_ID_PROPERTY);
}

function setUserPinByEmail(email, pin) {
  if (!email || !pin) {
    throw new Error("Email dan PIN wajib diisi.");
  }

  var user = getUserByEmail_(email);
  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  user.pin_hash = hashValue_(pin);
  user.updated_at = nowIso_();
  saveSheetRecord_("users", withoutMeta_(user), user._rowNumber);

  return sanitizeUser_(user);
}

