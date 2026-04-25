const crypto = require("node:crypto");
const { generateId, normalizeText, nowIso } = require("../common.cjs");

function mapUserRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    fullName: row.full_name,
    nickname: row.nickname,
    email: row.email,
    role: row.role,
    status: row.status,
    classGroup: row.class_group,
    notes: row.notes,
    authUpdatedAt: row.auth_updated_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createUsersRepo(db) {
  const selectById = db.prepare("SELECT * FROM users_cache WHERE id = ?");
  const selectByEmail = db.prepare("SELECT * FROM users_cache WHERE lower(email) = lower(?)");
  const selectDuplicateEmail = db.prepare("SELECT * FROM users_cache WHERE lower(email) = lower(?) AND id != ?");
  const listAllStmt = db.prepare("SELECT * FROM users_cache ORDER BY full_name COLLATE NOCASE ASC");
  const selectOfflineAuthByEmail = db.prepare(`
    SELECT
      u.*,
      p.salt AS offline_auth_salt,
      p.verifier AS offline_auth_verifier,
      p.auth_updated_at AS offline_auth_updated_at
    FROM offline_auth_profiles p
    JOIN users_cache u ON u.id = p.user_id
    WHERE lower(p.email) = lower(?)
  `);
  const upsertUser = db.prepare(`
    INSERT INTO users_cache (
      id, full_name, nickname, email, role, status, class_group, notes, auth_updated_at, created_at, updated_at, last_synced_at, pending_sync
    ) VALUES (
      @id, @full_name, @nickname, @email, @role, @status, @class_group, @notes, @auth_updated_at, @created_at, @updated_at, @last_synced_at, @pending_sync
    )
    ON CONFLICT(id) DO UPDATE SET
      full_name = excluded.full_name,
      nickname = excluded.nickname,
      email = excluded.email,
      role = excluded.role,
      status = excluded.status,
      class_group = excluded.class_group,
      notes = excluded.notes,
      auth_updated_at = excluded.auth_updated_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at,
      pending_sync = excluded.pending_sync
  `);
  const upsertOfflineAuth = db.prepare(`
    INSERT INTO offline_auth_profiles (
      user_id, email, salt, verifier, auth_updated_at, seeded_at, updated_at
    ) VALUES (
      @user_id, @email, @salt, @verifier, @auth_updated_at, @seeded_at, @updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      salt = excluded.salt,
      verifier = excluded.verifier,
      auth_updated_at = excluded.auth_updated_at,
      seeded_at = excluded.seeded_at,
      updated_at = excluded.updated_at
  `);
  const countOfflineCapableStmt = db.prepare("SELECT COUNT(*) AS total FROM offline_auth_profiles");

  function applyCloudRecord(user, options = {}) {
    const existing = selectById.get(String(user.id || ""));
    if (existing?.pending_sync && !options.force) {
      return {
        skipped: true,
        user: mapUserRow(existing),
      };
    }

    const syncedAt = nowIso();
    const record = {
      id: user.id,
      full_name: String(user.fullName || "").trim(),
      nickname: String(user.nickname || "").trim(),
      email: String(user.email || "").trim(),
      role: user.role === "admin" ? "admin" : "petugas",
      status: user.status === "nonaktif" ? "nonaktif" : "aktif",
      class_group: String(user.classGroup || "").trim(),
      notes: String(user.notes || "").trim(),
      auth_updated_at: String(user.authUpdatedAt || existing?.auth_updated_at || "").trim(),
      created_at: user.createdAt || existing?.created_at || syncedAt,
      updated_at: user.updatedAt || syncedAt,
      last_synced_at: syncedAt,
      pending_sync: 0,
    };

    upsertUser.run(record);
    return {
      skipped: false,
      user: mapUserRow(record),
    };
  }

  function upsertFromCloud(users = []) {
    const tx = db.transaction((items) => {
      items.forEach((user) => {
        applyCloudRecord(user);
      });
    });

    tx(users);
  }

  function saveUser(payload, sessionUser) {
    if (sessionUser.role !== "admin") {
      throw new Error("Aksi ini hanya untuk admin.");
    }

    const now = nowIso();
    const existing = payload.id ? selectById.get(String(payload.id)) : null;
    const fullName = String(payload.fullName || "").trim();
    const nickname = String(payload.nickname || "").trim();
    const email = String(payload.email || "").trim();

    if (!fullName || !nickname || !email) {
      throw new Error("Nama lengkap, nama panggilan, dan email wajib diisi.");
    }

    const duplicate = selectDuplicateEmail.get(email, String(payload.id || ""));
    if (duplicate) {
      throw new Error("Email user sudah dipakai.");
    }

    const record = {
      id: existing?.id || payload.id || generateId("USR"),
      full_name: fullName,
      nickname,
      email,
      role: payload.role === "admin" ? "admin" : "petugas",
      status: payload.status === "nonaktif" ? "nonaktif" : "aktif",
      class_group: String(payload.classGroup || "").trim(),
      notes: String(payload.notes || "").trim(),
      auth_updated_at: payload.password || payload.pin ? now : existing?.auth_updated_at || "",
      created_at: existing?.created_at || now,
      updated_at: now,
      last_synced_at: existing?.last_synced_at || null,
      pending_sync: 1,
    };

    upsertUser.run(record);
    return mapUserRow(record);
  }

  function seedOfflineAuthProfile(user, pin, deviceSecret) {
    const now = nowIso();
    const salt = crypto.randomBytes(16).toString("hex");
    const verifier = crypto.scryptSync(`${String(pin)}::${deviceSecret}`, salt, 64).toString("hex");

    upsertOfflineAuth.run({
      user_id: user.id,
      email: user.email,
      salt,
      verifier,
      auth_updated_at: String(user.authUpdatedAt || "").trim(),
      seeded_at: now,
      updated_at: now,
    });
  }

  function verifyOfflinePassword(email, password, deviceSecret) {
    const row = selectOfflineAuthByEmail.get(String(email || "").trim());
    if (!row) return null;

    const verifier = crypto.scryptSync(`${String(password)}::${deviceSecret}`, row.offline_auth_salt, 64).toString("hex");
    if (verifier !== row.offline_auth_verifier) return null;

    const cachedAuthUpdatedAt = String(row.auth_updated_at || "");
    const verifierAuthUpdatedAt = String(row.offline_auth_updated_at || "");
    if (cachedAuthUpdatedAt && verifierAuthUpdatedAt && cachedAuthUpdatedAt !== verifierAuthUpdatedAt) {
      return null;
    }

    return mapUserRow(row);
  }

  return {
    countOfflineCapableUsers() {
      return countOfflineCapableStmt.get()?.total ?? 0;
    },
    applyCloudRecord,
    getByEmail(email) {
      return mapUserRow(selectByEmail.get(String(email || "").trim()));
    },
    getById(id) {
      return mapUserRow(selectById.get(String(id || "")));
    },
    list() {
      const items = listAllStmt.all().map(mapUserRow);
      return { items };
    },
    saveUser,
    seedOfflineAuthProfile,
    upsertFromCloud,
    verifyOfflinePassword,
    verifyOfflinePin: verifyOfflinePassword,
    normalizeEmail(value) {
      return normalizeText(value);
    },
  };
}

module.exports = {
  createUsersRepo,
};
