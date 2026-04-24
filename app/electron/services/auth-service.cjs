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
    ORDER BY last_seen_at DESC
    LIMIT 1
  `);
  const touchSessionStmt = db.prepare("UPDATE local_sessions SET last_seen_at = ?, user_snapshot_json = ?, cloud_token = ?, cloud_expires_at = ? WHERE session_token = ?");

  function readMeta(key) {
    return getMetaStmt.get(key)?.value ?? "";
  }

  function writeMeta(key, value) {
    upsertMetaStmt.run(key, String(value ?? ""), nowIso());
  }

  function getDeviceSecret() {
    const raw = readMeta(DEVICE_SECRET_META_KEY);
    if (raw) {
      if (raw.startsWith("enc:") && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(raw.slice(4), "base64"));
      }
      if (raw.startsWith("plain:")) {
        return raw.slice(6);
      }
      return raw;
    }

    const nextSecret = crypto.randomBytes(32).toString("base64");
    const storedValue = safeStorage.isEncryptionAvailable()
      ? `enc:${safeStorage.encryptString(nextSecret).toString("base64")}`
      : `plain:${nextSecret}`;

    writeMeta(DEVICE_SECRET_META_KEY, storedValue);
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
    };
  }

  function getCurrentSession(explicitToken = "") {
    const token = String(explicitToken || "").trim() || readMeta(SESSION_META_KEY);
    if (!token) return null;
    return materializeSession(selectSessionByTokenStmt.get(token));
  }

  async function login({ email, pin }) {
    const cleanEmail = String(email || "").trim();
    const cleanPin = String(pin || "").trim();

    if (!cleanEmail || !cleanPin) {
      throw new Error("Email dan PIN wajib diisi.");
    }

    try {
      const response = await gasClient.request("login", {
        email: cleanEmail,
        pin: cleanPin,
      });
      const user = response.data.user;

      usersRepo.upsertFromCloud([user]);
      usersRepo.seedOfflineAuthProfile(user, cleanPin, getDeviceSecret());

      return buildLocalSession(user, {
        authMode: "online",
        cloudToken: response.data.token,
        cloudExpiresAt: response.data.expiresAt || "",
      });
    } catch (error) {
      const offlineUser = usersRepo.verifyOfflinePin(cleanEmail, cleanPin, getDeviceSecret());
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
        }),
        active.cloudToken || null,
        active.cloudExpiresAt || null,
        active.token,
      );
      return latestUser;
    },
    seedOfflineAuthProfile(user, pin) {
      usersRepo.seedOfflineAuthProfile(user, pin, getDeviceSecret());
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
