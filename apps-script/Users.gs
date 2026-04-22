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
    id: generateId_("USR"),
    created_at: now,
    pin_hash: "",
  };

  record.full_name = String(payload.fullName).trim();
  record.nickname = String(payload.nickname).trim();
  record.email = email;
  record.role = payload.role === "admin" ? "admin" : "petugas";
  record.status = payload.status === "nonaktif" ? "nonaktif" : "aktif";
  record.class_group = String(payload.classGroup || "").trim();
  record.notes = String(payload.notes || "").trim();
  record.updated_at = now;

  if (payload.pin) {
    record.pin_hash = hashValue_(payload.pin);
  }

  saveSheetRecord_("users", withoutMeta_(record), existing ? existing._rowNumber : null);
  return sanitizeUser_(record);
}

