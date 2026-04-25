function listUsersAction_(token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin"]);

  return getSheetRecords_("users")
    .map(sanitizeUser_)
    .sort(function (left, right) {
      return left.fullName.localeCompare(right.fullName);
    });
}

function saveUserAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin"]);

  var now = nowIso_();
  var email = String(payload.email || "").trim();
  var existing = payload.id ? getRecordById_("users", payload.id) : null;
  var duplicate = getSheetRecords_("users").find(function (record) {
    return normalizeText_(record.email) === normalizeText_(email) && String(record.id) !== String(payload.id || "");
  });

  if (duplicate) {
    throw new Error("Email user sudah dipakai.");
  }

  if (!payload.fullName || !payload.nickname || !email) {
    throw new Error("Nama lengkap, nama panggilan, dan email wajib diisi.");
  }

  var record = existing || {
    id: payload.id || generateId_("USR"),
    created_at: now,
    pin_hash: "",
    password_hash: "",
    auth_updated_at: "",
  };

  record.full_name = String(payload.fullName).trim();
  record.nickname = String(payload.nickname).trim();
  record.email = email;
  record.role = payload.role === "admin" ? "admin" : "petugas";
  record.status = payload.status === "nonaktif" ? "nonaktif" : "aktif";
  record.class_group = String(payload.classGroup || "").trim();
  record.notes = String(payload.notes || "").trim();
  record.updated_at = now;

  var authChanged = false;
  if (payload.password) {
    if (String(payload.password).length < CONFIG.PASSWORD_MIN_LENGTH) {
      throw new Error("Password minimal " + CONFIG.PASSWORD_MIN_LENGTH + " karakter.");
    }

    record.password_hash = hashValue_(payload.password);
    record.pin_hash = "";
    record.auth_updated_at = now;
    authChanged = true;
  } else if (payload.passwordHash) {
    record.password_hash = String(payload.passwordHash).trim();
    record.pin_hash = "";
    record.auth_updated_at = now;
    authChanged = true;
  } else if (payload.pin) {
    record.pin_hash = hashValue_(payload.pin);
    record.auth_updated_at = now;
    authChanged = true;
  } else if (payload.pinHash) {
    record.pin_hash = String(payload.pinHash).trim();
    record.auth_updated_at = now;
    authChanged = true;
  }

  saveSheetRecord_("users", withoutMeta_(record), existing ? existing._rowNumber : null);
  if (authChanged) {
    revokeUserSessions_(record.id);
    revokeTrustedDevicesForUser_(record.id);
  }
  return sanitizeUser_(record);
}
