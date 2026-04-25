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
    authUpdatedAt: getUserAuthUpdatedAt_(record),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function getUserAuthUpdatedAt_(record) {
  return String((record && record.auth_updated_at) || "");
}

function getUserByEmail_(email) {
  return getSheetRecords_("users").find(function (record) {
    return normalizeText_(record.email) === normalizeText_(email);
  }) || null;
}

function getUserById_(userId) {
  return getRecordById_("users", userId);
}

function validatePassword_(password) {
  if (!password) {
    throw new Error("Password wajib diisi.");
  }

  if (String(password).length < CONFIG.PASSWORD_MIN_LENGTH) {
    throw new Error("Password minimal " + CONFIG.PASSWORD_MIN_LENGTH + " karakter.");
  }
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

function revokeUserSessions_(userId) {
  var sessions = getSheetRecords_("sessions");
  var now = nowIso_();
  sessions.forEach(function (record) {
    if (String(record.user_id) !== String(userId) || record.revoked_at) return;

    record.revoked_at = now;
    record.updated_at = now;
    saveSheetRecord_("sessions", withoutMeta_(record), record._rowNumber);
  });
}

function revokeTrustedDevicesForUser_(userId) {
  var devices = getSheetRecords_("trusted_devices");
  var now = nowIso_();
  devices.forEach(function (record) {
    if (String(record.user_id) !== String(userId) || record.revoked_at) return;

    record.revoked_at = now;
    record.updated_at = now;
    saveSheetRecord_("trusted_devices", withoutMeta_(record), record._rowNumber);
  });
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

function credentialMatchesUser_(user, password, legacyPin) {
  var cleanPassword = String(password || "").trim();
  var cleanPin = String(legacyPin || "").trim();
  var credential = cleanPassword || cleanPin;
  if (!credential) return false;

  if (cleanPassword && user.password_hash && user.password_hash === hashValue_(cleanPassword)) {
    return true;
  }

  return Boolean(user.pin_hash && user.pin_hash === hashValue_(credential));
}

function loginAction_(payload) {
  var email = String(payload.email || "").trim();
  var password = String(payload.password || "").trim();
  var legacyPin = String(payload.pin || "").trim();
  if (!email || (!password && !legacyPin)) {
    throw new Error("Email dan password wajib diisi.");
  }

  var user = getUserByEmail_(email);
  if (!user || user.status !== "aktif") {
    throw new Error("Email atau password tidak cocok.");
  }

  if (!user.password_hash && !user.pin_hash) {
    throw new Error("Password user belum diset. Admin perlu mengatur password awal.");
  }

  if (!credentialMatchesUser_(user, password, legacyPin)) {
    throw new Error("Email atau password tidak cocok.");
  }

  var session = createSession_(user.id);
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: sanitizeUser_(user),
  };
}

function createTrustedDeviceAction_(payload, token) {
  var context = requireSession_(token);
  var rawToken = Utilities.getUuid() + "-" + Utilities.getUuid();
  var now = nowIso_();
  var record = {
    id: generateId_("TDV"),
    user_id: context.user.id,
    token_hash: hashValue_(rawToken),
    device_label: String((payload && payload.deviceLabel) || "Perangkat POS Kantin").trim(),
    expires_at: plusDaysIso_(CONFIG.TRUSTED_DEVICE_TTL_DAYS),
    revoked_at: "",
    last_used_at: now,
    created_at: now,
    updated_at: now,
  };

  saveSheetRecord_("trusted_devices", record);
  return {
    token: rawToken,
    expiresAt: record.expires_at,
    user: sanitizeUser_(context.user),
  };
}

function loginWithTrustedDeviceAction_(payload) {
  var rawToken = String((payload && payload.trustedDeviceToken) || "").trim();
  if (!rawToken) {
    throw new Error("Token perangkat wajib diisi.");
  }

  var tokenHash = hashValue_(rawToken);
  var device = getSheetRecords_("trusted_devices").find(function (record) {
    return record.token_hash === tokenHash && !record.revoked_at;
  });

  if (!device || new Date(device.expires_at).getTime() < Date.now()) {
    throw new Error("Info login perangkat sudah tidak berlaku.");
  }

  var user = getUserById_(device.user_id);
  if (!user || user.status !== "aktif") {
    throw new Error("User perangkat tidak aktif.");
  }

  if (getUserAuthUpdatedAt_(user) && String(getUserAuthUpdatedAt_(user)) > String(device.created_at || "")) {
    device.revoked_at = nowIso_();
    device.updated_at = device.revoked_at;
    saveSheetRecord_("trusted_devices", withoutMeta_(device), device._rowNumber);
    throw new Error("Info login perangkat sudah tidak berlaku.");
  }

  device.last_used_at = nowIso_();
  device.updated_at = device.last_used_at;
  saveSheetRecord_("trusted_devices", withoutMeta_(device), device._rowNumber);

  var session = createSession_(user.id);
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    trustedDeviceExpiresAt: device.expires_at,
    user: sanitizeUser_(user),
  };
}

function revokeTrustedDeviceAction_(payload, token) {
  var context = requireSession_(token);
  var rawToken = String((payload && payload.trustedDeviceToken) || "").trim();
  if (!rawToken) {
    throw new Error("Token perangkat wajib diisi.");
  }

  var tokenHash = hashValue_(rawToken);
  var device = getSheetRecords_("trusted_devices").find(function (record) {
    return record.token_hash === tokenHash && !record.revoked_at;
  });

  if (!device) return null;
  if (String(device.user_id) !== String(context.user.id) && context.user.role !== "admin") {
    throw new Error("Perangkat ini bukan milik user login.");
  }

  device.revoked_at = nowIso_();
  device.updated_at = device.revoked_at;
  saveSheetRecord_("trusted_devices", withoutMeta_(device), device._rowNumber);
  return null;
}

function hashOtp_(email, otp) {
  return hashValue_(normalizeText_(email) + "::" + String(otp || "").trim());
}

function buildOtpEmailBody_(otp) {
  return [
    "Kode OTP reset password POS Kantin:",
    "",
    otp,
    "",
    "Kode berlaku " + CONFIG.PASSWORD_RESET_OTP_TTL_MINUTES + " menit.",
    "Jika Anda tidak meminta reset password, abaikan email ini.",
  ].join("\n");
}

function requestPasswordResetOtpAction_(payload) {
  var email = String((payload && payload.email) || "").trim();
  if (!email) {
    throw new Error("Email wajib diisi.");
  }

  var user = getUserByEmail_(email);
  if (!user || user.status !== "aktif") {
    return { sent: false };
  }

  var latestOtp = getSheetRecords_("password_reset_otps")
    .filter(function (record) {
      return normalizeText_(record.email) === normalizeText_(email);
    })
    .sort(function (left, right) {
      return String(right.created_at).localeCompare(String(left.created_at));
    })[0];

  if (latestOtp) {
    var ageMs = Date.now() - new Date(latestOtp.created_at).getTime();
    var cooldownMs = CONFIG.PASSWORD_RESET_OTP_COOLDOWN_SECONDS * 1000;
    if (ageMs >= 0 && ageMs < cooldownMs) {
      return {
        sent: false,
        cooldownSeconds: Math.ceil((cooldownMs - ageMs) / 1000),
      };
    }
  }

  var otp = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  var now = nowIso_();
  saveSheetRecord_("password_reset_otps", {
    id: generateId_("OTP"),
    user_id: user.id,
    email: user.email,
    otp_hash: hashOtp_(user.email, otp),
    expires_at: plusMinutesIso_(CONFIG.PASSWORD_RESET_OTP_TTL_MINUTES),
    attempt_count: 0,
    used_at: "",
    created_at: now,
    updated_at: now,
  });

  MailApp.sendEmail({
    to: user.email,
    subject: "Kode OTP Reset Password POS Kantin",
    body: buildOtpEmailBody_(otp),
    name: "POS Kantin",
  });

  return { sent: true };
}

function resetPasswordWithOtpAction_(payload) {
  var email = String((payload && payload.email) || "").trim();
  var otp = String((payload && payload.otp) || "").trim();
  var password = String((payload && payload.password) || "");
  if (!email || !otp) {
    throw new Error("Email dan OTP wajib diisi.");
  }

  validatePassword_(password);

  var user = getUserByEmail_(email);
  if (!user || user.status !== "aktif") {
    throw new Error("Kode OTP tidak valid atau sudah kedaluwarsa.");
  }

  var otpRecord = getSheetRecords_("password_reset_otps")
    .filter(function (record) {
      return normalizeText_(record.email) === normalizeText_(email) && !record.used_at;
    })
    .sort(function (left, right) {
      return String(right.created_at).localeCompare(String(left.created_at));
    })[0];

  if (!otpRecord || new Date(otpRecord.expires_at).getTime() < Date.now()) {
    throw new Error("Kode OTP tidak valid atau sudah kedaluwarsa.");
  }

  var attempts = Math.max(toNumber_(otpRecord.attempt_count, 0), 0);
  if (attempts >= CONFIG.PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
    throw new Error("Kode OTP sudah terlalu sering dicoba. Minta kode baru.");
  }

  if (otpRecord.otp_hash !== hashOtp_(email, otp)) {
    otpRecord.attempt_count = attempts + 1;
    otpRecord.updated_at = nowIso_();
    saveSheetRecord_("password_reset_otps", withoutMeta_(otpRecord), otpRecord._rowNumber);
    throw new Error("Kode OTP tidak valid atau sudah kedaluwarsa.");
  }

  var now = nowIso_();
  otpRecord.used_at = now;
  otpRecord.updated_at = now;
  saveSheetRecord_("password_reset_otps", withoutMeta_(otpRecord), otpRecord._rowNumber);

  user.password_hash = hashValue_(password);
  user.pin_hash = "";
  user.auth_updated_at = now;
  user.updated_at = now;
  saveSheetRecord_("users", withoutMeta_(user), user._rowNumber);

  revokeUserSessions_(user.id);
  revokeTrustedDevicesForUser_(user.id);

  return sanitizeUser_(user);
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
