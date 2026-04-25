const crypto = require("node:crypto");
const { safeStorage } = require("electron");
const { generateId, nowIso } = require("../common.cjs");

function createAuthService({ db, gasClient, usersRepo, getConfig }) {
  const SESSION_META_KEY = "active_session_token";
  const DEVICE_SECRET_META_KEY = "device_secret";
  const SESSION_TTL_HOURS = Math.max(Number(getConfig().sessionTtlHours || 8), 1);

  const getMetaStmt = db.prepare("SELECT value FROM app_meta WHERE key = ?");
  const upsertMetaStmt = db.prepare(`
    INSERT INTO app_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  const revokeSessionStmt = db.prepare("UPDATE local_sessions SET revoked_at = ?, last_seen_at = ? WHERE session_token = ? AND revoked_at IS NULL");
  const revokeActiveSessionsStmt = db.prepare("UPDATE local_sessions SET revoked_at = ?, last_seen_at = ? WHERE revoked_at IS NULL");
  const insertSessionStmt = db.prepare(`
    INSERT INTO local_sessions (
      id, user_id, session_token, cloud_token, cloud_expires_at, user_snapshot_json,
      created_at, expires_at, last_seen_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);
  const selectSessionByTokenStmt = db.prepare("SELECT * FROM local_sessions WHERE session_token = ?");
  const selectReusableCloudSessionStmt = db.prepare(`
    SELECT cloud_token, cloud_expires_at
    FROM local_sessions
    WHERE user_id = ?
      AND cloud_token IS NOT NULL
      AND cloud_expires_at IS NOT NULL
      AND cloud_expires_at > ?
    ORDER BY last_seen_at DESC, created_at DESC, id DESC
    LIMIT 1
  `);
  const touchSessionStmt = db.prepare("UPDATE local_sessions SET last_seen_at = ?, user_snapshot_json = ?, cloud_token = ?, cloud_expires_at = ? WHERE session_token = ?");
  const listSavedProfilesStmt = db.prepare(`
    SELECT *
    FROM saved_login_profiles
    WHERE expires_at > ?
    ORDER BY
      CASE WHEN last_used_at = '' THEN created_at ELSE last_used_at END DESC,
      full_name COLLATE NOCASE ASC
  `);
  const selectSavedProfileStmt = db.prepare("SELECT * FROM saved_login_profiles WHERE user_id = ? AND expires_at > ?");
  const upsertSavedProfileStmt = db.prepare(`
    INSERT INTO saved_login_profiles (
      user_id, email, full_name, nickname, role, status, class_group, auth_updated_at,
      trusted_device_token_enc, expires_at, created_at, updated_at, last_used_at
    ) VALUES (
      @user_id, @email, @full_name, @nickname, @role, @status, @class_group, @auth_updated_at,
      @trusted_device_token_enc, @expires_at, @created_at, @updated_at, @last_used_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      full_name = excluded.full_name,
      nickname = excluded.nickname,
      role = excluded.role,
      status = excluded.status,
      class_group = excluded.class_group,
      auth_updated_at = excluded.auth_updated_at,
      trusted_device_token_enc = excluded.trusted_device_token_enc,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at,
      last_used_at = excluded.last_used_at
  `);
  const touchSavedProfileStmt = db.prepare("UPDATE saved_login_profiles SET last_used_at = ?, updated_at = ? WHERE user_id = ?");
  const deleteSavedProfileStmt = db.prepare("DELETE FROM saved_login_profiles WHERE user_id = ?");
  const deleteSavedProfilesByEmailStmt = db.prepare("DELETE FROM saved_login_profiles WHERE lower(email) = lower(?)");

  function readMeta(key) {
    return getMetaStmt.get(key)?.value ?? "";
  }

  function writeMeta(key, value) {
    upsertMetaStmt.run(key, String(value ?? ""), nowIso());
  }

  function encryptSecret(value) {
    const cleanValue = String(value || "");
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(cleanValue).toString("base64")}`;
    }
    return `plain:${cleanValue}`;
  }

  function decryptSecret(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (raw.startsWith("enc:")) {
      return safeStorage.decryptString(Buffer.from(raw.slice(4), "base64"));
    }
    if (raw.startsWith("plain:")) {
      return raw.slice(6);
    }
    return raw;
  }

  function getDeviceSecret() {
    const raw = readMeta(DEVICE_SECRET_META_KEY);
    if (raw) return decryptSecret(raw);

    const nextSecret = crypto.randomBytes(32).toString("base64");
    writeMeta(DEVICE_SECRET_META_KEY, encryptSecret(nextSecret));
    return nextSecret;
  }

  function buildLocalSession(user, options = {}) {
    const now = nowIso();
    const sessionToken = crypto.randomUUID();
    const expiresAt = options.expiresAt || new Date(Date.now() + (SESSION_TTL_HOURS * 60 * 60 * 1000)).toISOString();
    const session = {
      id: generateId("LSE"),
      token: sessionToken,
      user,
      expiresAt,
      cloudToken: options.cloudToken || "",
      cloudExpiresAt: options.cloudExpiresAt || "",
      authMode: options.authMode || "online",
      savedLoginExpiresAt: options.savedLoginExpiresAt || "",
    };

    db.transaction(() => {
      revokeActiveSessionsStmt.run(now, now);
      insertSessionStmt.run(
        session.id,
        user.id,
        sessionToken,
        session.cloudToken || null,
        session.cloudExpiresAt || null,
        JSON.stringify({
          ...user,
          authMode: session.authMode,
          savedLoginExpiresAt: session.savedLoginExpiresAt,
        }),
        now,
        session.expiresAt,
        now,
      );
      writeMeta(SESSION_META_KEY, sessionToken);
    })();

    return session;
  }

  function parseSessionSnapshot(row) {
    try {
      return JSON.parse(row?.user_snapshot_json || "{}");
    } catch {
      return {};
    }
  }

  function getStoredAuthMode(snapshot = {}) {
    return snapshot.authMode === "offline" ? "offline" : "online";
  }

  function materializeSession(row) {
    if (!row || row.revoked_at) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      revokeSessionStmt.run(nowIso(), nowIso(), row.session_token);
      if (readMeta(SESSION_META_KEY) === row.session_token) {
        writeMeta(SESSION_META_KEY, "");
      }
      return null;
    }

    const storedSnapshot = parseSessionSnapshot(row);
    const authMode = getStoredAuthMode(storedSnapshot);
    const cachedUser = usersRepo.getById(row.user_id);
    const snapshot = cachedUser || storedSnapshot;
    if (!snapshot?.id || snapshot.status !== "aktif") {
      revokeSessionStmt.run(nowIso(), nowIso(), row.session_token);
      if (readMeta(SESSION_META_KEY) === row.session_token) {
        writeMeta(SESSION_META_KEY, "");
      }
      return null;
    }

    const nextLastSeenAt = nowIso();
    touchSessionStmt.run(
      nextLastSeenAt,
      JSON.stringify({
        ...snapshot,
        authMode,
        savedLoginExpiresAt: storedSnapshot.savedLoginExpiresAt || "",
      }),
      row.cloud_token || null,
      row.cloud_expires_at || null,
      row.session_token,
    );

    return {
      token: row.session_token,
      user: snapshot,
      expiresAt: row.expires_at,
      cloudToken: row.cloud_token || "",
      cloudExpiresAt: row.cloud_expires_at || "",
      authMode,
      savedLoginExpiresAt: storedSnapshot.savedLoginExpiresAt || "",
    };
  }

  function getCurrentSession(explicitToken = "") {
    const token = String(explicitToken || "").trim() || readMeta(SESSION_META_KEY);
    if (!token) return null;
    return materializeSession(selectSessionByTokenStmt.get(token));
  }

  function mapSavedProfileRow(row) {
    if (!row) return null;
    const latestUser = usersRepo.getById(row.user_id);
    const user = latestUser || {
      id: row.user_id,
      fullName: row.full_name,
      nickname: row.nickname,
      email: row.email,
      role: row.role,
      status: row.status,
      classGroup: row.class_group,
      authUpdatedAt: row.auth_updated_at,
    };

    if (!user?.id || user.status !== "aktif") return null;

    return {
      userId: user.id,
      fullName: user.fullName,
      nickname: user.nickname,
      email: user.email,
      role: user.role,
      status: user.status,
      classGroup: user.classGroup || "",
      authUpdatedAt: user.authUpdatedAt || row.auth_updated_at || "",
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at || "",
    };
  }

  function saveTrustedProfile(user, trustedDeviceToken, expiresAt) {
    const now = nowIso();
    upsertSavedProfileStmt.run({
      user_id: user.id,
      email: user.email,
      full_name: user.fullName,
      nickname: user.nickname || "",
      role: user.role,
      status: user.status,
      class_group: user.classGroup || "",
      auth_updated_at: user.authUpdatedAt || "",
      trusted_device_token_enc: encryptSecret(trustedDeviceToken),
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
      last_used_at: now,
    });
    return mapSavedProfileRow(selectSavedProfileStmt.get(user.id, nowIso()));
  }

  async function createTrustedDevice(cloudToken, user) {
    if (!cloudToken) {
      throw new Error("Login online diperlukan untuk menyimpan info login perangkat ini.");
    }

    const response = await gasClient.request("createTrustedDevice", {
      deviceLabel: "POS Kantin Desktop",
    }, cloudToken);
    return saveTrustedProfile(user, response.data.token, response.data.expiresAt);
  }

  function assertSavedProfileValid(row) {
    if (!row) {
      throw new Error("Info login tersimpan tidak ditemukan.");
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      deleteSavedProfileStmt.run(row.user_id);
      throw new Error("Info login tersimpan sudah kedaluwarsa.");
    }

    const latestUser = usersRepo.getById(row.user_id);
    if (!latestUser || latestUser.status !== "aktif") {
      deleteSavedProfileStmt.run(row.user_id);
      throw new Error("User tersimpan tidak aktif.");
    }

    const latestAuthUpdatedAt = String(latestUser.authUpdatedAt || "");
    const savedAuthUpdatedAt = String(row.auth_updated_at || "");
    if (latestAuthUpdatedAt && savedAuthUpdatedAt && latestAuthUpdatedAt !== savedAuthUpdatedAt) {
      deleteSavedProfileStmt.run(row.user_id);
      throw new Error("Info login tersimpan sudah tidak berlaku. Login ulang dengan password.");
    }

    return latestUser;
  }

  async function login({ email, password, pin, rememberDevice } = {}) {
    const cleanEmail = String(email || "").trim();
    const cleanPassword = String(password || pin || "").trim();

    if (!cleanEmail || !cleanPassword) {
      throw new Error("Email dan password wajib diisi.");
    }

    let response = null;
    try {
      response = await gasClient.request("login", {
        email: cleanEmail,
        password: password === undefined ? undefined : cleanPassword,
        pin: pin === undefined ? undefined : cleanPassword,
      });
    } catch (error) {
      const offlineUser = usersRepo.verifyOfflinePassword(cleanEmail, cleanPassword, getDeviceSecret());
      if (!offlineUser) {
        throw error;
      }

      if (offlineUser.status !== "aktif") {
        throw new Error("User tidak aktif untuk login offline.");
      }

      const reusableCloudSession = selectReusableCloudSessionStmt.get(offlineUser.id, nowIso());
      return buildLocalSession(offlineUser, {
        authMode: "offline",
        cloudToken: reusableCloudSession?.cloud_token || "",
        cloudExpiresAt: reusableCloudSession?.cloud_expires_at || "",
      });
    }

    const user = response.data.user;
    usersRepo.upsertFromCloud([user]);
    usersRepo.seedOfflineAuthProfile(user, cleanPassword, getDeviceSecret());

    let savedProfile = null;
    if (rememberDevice) {
      savedProfile = await createTrustedDevice(response.data.token, user);
    }

    return buildLocalSession(user, {
      authMode: "online",
      cloudToken: response.data.token,
      cloudExpiresAt: response.data.expiresAt || "",
      savedLoginExpiresAt: savedProfile?.expiresAt || "",
    });
  }

  async function loginSavedProfile({ userId } = {}) {
    const row = selectSavedProfileStmt.get(String(userId || "").trim(), nowIso());
    const localUser = assertSavedProfileValid(row);
    const trustedDeviceToken = decryptSecret(row.trusted_device_token_enc);

    try {
      const response = await gasClient.request("loginWithTrustedDevice", {
        trustedDeviceToken,
      });
      const user = response.data.user;
      usersRepo.upsertFromCloud([user]);
      saveTrustedProfile(user, trustedDeviceToken, response.data.trustedDeviceExpiresAt || row.expires_at);

      return buildLocalSession(user, {
        authMode: "online",
        cloudToken: response.data.token,
        cloudExpiresAt: response.data.expiresAt || "",
        savedLoginExpiresAt: response.data.trustedDeviceExpiresAt || row.expires_at,
      });
    } catch (error) {
      const reusableCloudSession = selectReusableCloudSessionStmt.get(localUser.id, nowIso());
      touchSavedProfileStmt.run(nowIso(), nowIso(), localUser.id);
      return buildLocalSession(localUser, {
        authMode: "offline",
        cloudToken: reusableCloudSession?.cloud_token || "",
        cloudExpiresAt: reusableCloudSession?.cloud_expires_at || "",
        savedLoginExpiresAt: row.expires_at,
      });
    }
  }

  async function saveCurrentLogin(token) {
    const session = getCurrentSession(token);
    if (!session?.user) {
      throw new Error("Sesi tidak ditemukan.");
    }
    if (!session.cloudToken) {
      throw new Error("Login online diperlukan untuk menyimpan info login perangkat ini.");
    }

    return createTrustedDevice(session.cloudToken, session.user);
  }

  async function removeSavedProfile({ userId } = {}, token = "") {
    const cleanUserId = String(userId || "").trim();
    const row = selectSavedProfileStmt.get(cleanUserId, "0000-00-00T00:00:00.000Z");
    const session = getCurrentSession(token);

    if (row && session?.cloudToken) {
      try {
        await gasClient.request("revokeTrustedDevice", {
          trustedDeviceToken: decryptSecret(row.trusted_device_token_enc),
        }, session.cloudToken);
      } catch {
        // Local removal should still succeed when the app is offline.
      }
    }

    deleteSavedProfileStmt.run(cleanUserId);
    return null;
  }

  async function requestPasswordResetOtp(payload = {}) {
    return gasClient.request("requestPasswordResetOtp", {
      email: payload.email,
    });
  }

  async function resetPasswordWithOtp(payload = {}) {
    const response = await gasClient.request("resetPasswordWithOtp", {
      email: payload.email,
      otp: payload.otp,
      password: payload.password,
    });

    if (payload.email) {
      deleteSavedProfilesByEmailStmt.run(String(payload.email).trim());
    }
    if (response.data?.id) {
      usersRepo.applyCloudRecord(response.data, { force: true });
    }

    return response;
  }

  async function refreshSessionAuthMode(token = "") {
    const session = getCurrentSession(token);
    if (!session?.user || !session.cloudToken) {
      return session;
    }

    try {
      const response = await gasClient.request("getCurrentUser", {}, session.cloudToken);
      const user = response.data?.user || session.user;
      usersRepo.upsertFromCloud([user]);

      touchSessionStmt.run(
        nowIso(),
        JSON.stringify({
          ...user,
          authMode: "online",
          savedLoginExpiresAt: session.savedLoginExpiresAt || "",
        }),
        session.cloudToken || null,
        response.data?.expiresAt || session.cloudExpiresAt || null,
        session.token,
      );
    } catch {
      return getCurrentSession(token);
    }

    return getCurrentSession(token);
  }

  return {
    getActiveCloudToken() {
      return getCurrentSession()?.cloudToken || "";
    },
    getConfigSummary() {
      const config = getConfig();
      return {
        configPath: config.configPath,
        isConfigured: Boolean(config.isConfigured),
      };
    },
    getCurrentSession,
    listSavedProfiles() {
      return {
        items: listSavedProfilesStmt.all(nowIso())
          .map(mapSavedProfileRow)
          .filter(Boolean),
      };
    },
    async logout(token) {
      const session = getCurrentSession(token);
      if (!session) {
        writeMeta(SESSION_META_KEY, "");
        return null;
      }

      revokeSessionStmt.run(nowIso(), nowIso(), session.token);
      writeMeta(SESSION_META_KEY, "");
      return null;
    },
    login,
    loginSavedProfile,
    saveCurrentLogin,
    removeSavedProfile,
    requestPasswordResetOtp,
    resetPasswordWithOtp,
    refreshSessionAuthMode,
    refreshActiveSessionUser() {
      const active = getCurrentSession();
      if (!active) return null;
      const latestUser = usersRepo.getById(active.user.id);
      if (!latestUser) return null;

      touchSessionStmt.run(
        nowIso(),
        JSON.stringify({
          ...latestUser,
          authMode: active.authMode,
          savedLoginExpiresAt: active.savedLoginExpiresAt || "",
        }),
        active.cloudToken || null,
        active.cloudExpiresAt || null,
        active.token,
      );
      return latestUser;
    },
    seedOfflineAuthProfile(user, password) {
      usersRepo.seedOfflineAuthProfile(user, password, getDeviceSecret());
    },
    requireSession(token) {
      const session = getCurrentSession(token);
      if (!session?.user) {
        throw new Error("Sesi tidak ditemukan.");
      }
      return session;
    },
  };
}

module.exports = {
  createAuthService,
};
