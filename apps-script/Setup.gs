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

function ensureSeedUsers_() {
  var createdUsers = [];

  CONFIG.SEED_ADMIN_USERS.forEach(function (seedUser) {
    if (getUserByEmail_(seedUser.email)) {
      return;
    }

    var now = nowIso_();
    var record = {
      id: generateId_("USR"),
      full_name: seedUser.fullName,
      nickname: seedUser.nickname,
      email: seedUser.email,
      role: seedUser.role || "admin",
      status: seedUser.status || "aktif",
      class_group: seedUser.classGroup || "",
      pin_hash: "",
      password_hash: "",
      auth_updated_at: "",
      notes: seedUser.notes || "Admin seed awal.",
      created_at: now,
      updated_at: now,
    };

    saveSheetRecord_("users", record);
    createdUsers.push(sanitizeUser_(record));
  });

  return createdUsers;
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

  var createdUsers = ensureSeedUsers_();

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
        commission_rate: 10,
        commission_base_type: "revenue",
        payout_term_days: 1,
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
    seedAdminEmails: CONFIG.SEED_ADMIN_USERS.map(function (seedUser) {
      return seedUser.email;
    }),
    createdUsers: createdUsers,
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
  user.auth_updated_at = nowIso_();
  user.updated_at = user.auth_updated_at;
  saveSheetRecord_("users", withoutMeta_(user), user._rowNumber);

  return sanitizeUser_(user);
}

function setUserPasswordByEmail(email, password) {
  if (!email || !password) {
    throw new Error("Email dan password wajib diisi.");
  }

  if (String(password).length < CONFIG.PASSWORD_MIN_LENGTH) {
    throw new Error("Password minimal " + CONFIG.PASSWORD_MIN_LENGTH + " karakter.");
  }

  var user = getUserByEmail_(email);
  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  user.password_hash = hashValue_(password);
  user.auth_updated_at = nowIso_();
  user.updated_at = user.auth_updated_at;
  saveSheetRecord_("users", withoutMeta_(user), user._rowNumber);

  return sanitizeUser_(user);
}

function setSeedAdminPin(pin) {
  if (!pin) {
    throw new Error("PIN wajib diisi.");
  }

  return CONFIG.SEED_ADMIN_USERS.map(function (seedUser) {
    return setUserPinByEmail(seedUser.email, pin);
  });
}

function setSeedAdminPassword(password) {
  if (!password) {
    throw new Error("Password wajib diisi.");
  }

  return CONFIG.SEED_ADMIN_USERS.map(function (seedUser) {
    return setUserPasswordByEmail(seedUser.email, password);
  });
}

function setupApplicationSpreadsheetAndSeedPin() {
  var setupResult = setupApplicationSpreadsheet();
  var seededUsers = setSeedAdminPin("290729");

  return {
    spreadsheetId: setupResult.spreadsheetId,
    spreadsheetUrl: setupResult.spreadsheetUrl,
    seedAdminEmails: setupResult.seedAdminEmails,
    seededUsers: seededUsers,
  };
}

function seedDefaultAdminPin() {
  return setSeedAdminPin("290729");
}

function setupApplicationSpreadsheetAndSeedPassword() {
  var setupResult = setupApplicationSpreadsheet();
  var seededUsers = setSeedAdminPassword("password290729");

  return {
    spreadsheetId: setupResult.spreadsheetId,
    spreadsheetUrl: setupResult.spreadsheetUrl,
    seedAdminEmails: setupResult.seedAdminEmails,
    seededUsers: seededUsers,
  };
}

function seedDefaultAdminPassword() {
  return setSeedAdminPassword("password290729");
}
