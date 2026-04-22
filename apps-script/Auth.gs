function sanitizeUser_(record) {
  return {
    id: record.id,
    fullName: record.full_name,
    nickname: record.nickname,
    email: record.email,
    role: record.role,
    status: record.status,
    classGroup: record.class_group,
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function getUserByEmail_(email) {
  return getSheetRecords_("users").find(function (record) {
    return normalizeText_(record.email) === normalizeText_(email);
  }) || null;
}

function getUserById_(userId) {
  return getRecordById_("users", userId);
}

function createSession_(userId) {
  var token = Utilities.getUuid();
  var now = nowIso_();
  var sessionRecord = {
    id: generateId_("SES"),
    token_hash: hashValue_(token),
    user_id: userId,
    expires_at: plusHoursIso_(CONFIG.SESSION_TTL_HOURS),
    revoked_at: "",
    created_at: now,
    updated_at: now,
  };

  saveSheetRecord_("sessions", sessionRecord);
  return {
    token: token,
    expiresAt: sessionRecord.expires_at,
  };
}

function requireSession_(token) {
  if (!token) {
    throw new Error("Token wajib disertakan.");
  }

  var tokenHash = hashValue_(token);
  var sessionRecord = getSheetRecords_("sessions").find(function (record) {
    return record.token_hash === tokenHash && !record.revoked_at;
  });

  if (!sessionRecord) {
    throw new Error("Sesi tidak ditemukan.");
  }

  if (new Date(sessionRecord.expires_at).getTime() < Date.now()) {
    throw new Error("Sesi sudah kedaluwarsa.");
  }

  var user = getUserById_(sessionRecord.user_id);
  if (!user || user.status !== "aktif") {
    throw new Error("User sesi tidak aktif.");
  }

  return {
    session: sessionRecord,
    user: user,
  };
}

function loginAction_(payload) {
  var email = String(payload.email || "").trim();
  var pin = String(payload.pin || "").trim();
  if (!email || !pin) {
    throw new Error("Email dan PIN wajib diisi.");
  }

  var user = getUserByEmail_(email);
  if (!user || user.status !== "aktif") {
    throw new Error("Email atau PIN tidak cocok.");
  }

  if (!user.pin_hash) {
    throw new Error("PIN user belum diset. Jalankan setUserPinByEmail() saat setup awal.");
  }

  if (user.pin_hash !== hashValue_(pin)) {
    throw new Error("Email atau PIN tidak cocok.");
  }

  var session = createSession_(user.id);
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: sanitizeUser_(user),
  };
}

function logoutAction_(token) {
  var tokenHash = hashValue_(token);
  var sessions = getSheetRecords_("sessions");
  var current = sessions.find(function (record) {
    return record.token_hash === tokenHash && !record.revoked_at;
  });

  if (!current) {
    return null;
  }

  current.revoked_at = nowIso_();
  current.updated_at = current.revoked_at;
  saveSheetRecord_("sessions", withoutMeta_(current), current._rowNumber);
  return null;
}

function getCurrentUserAction_(token) {
  var context = requireSession_(token);
  return {
    user: sanitizeUser_(context.user),
    expiresAt: context.session.expires_at,
  };
}

