const crypto = require("node:crypto");
const { normalizeText, nowIso } = require("../common.cjs");

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createUsersRepo(db) {
  const selectById = db.prepare("SELECT * FROM users_cache WHERE id = ?");
  const selectByEmail = db.prepare("SELECT * FROM users_cache WHERE lower(email) = lower(?)");
  const selectOfflineAuthByEmail = db.prepare(`
    SELECT p.*, u.*
    FROM offline_auth_profiles p
    JOIN users_cache u ON u.id = p.user_id
    WHERE lower(p.email) = lower(?)
  `);
  const upsertUser = db.prepare(`
    INSERT INTO users_cache (
      id, full_name, nickname, email, role, status, class_group, notes, created_at, updated_at, last_synced_at
    ) VALUES (
      @id, @full_name, @nickname, @email, @role, @status, @class_group, @notes, @created_at, @updated_at, @last_synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      full_name = excluded.full_name,
      nickname = excluded.nickname,
      email = excluded.email,
      role = excluded.role,
      status = excluded.status,
      class_group = excluded.class_group,
      notes = excluded.notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at
  `);
  const upsertOfflineAuth = db.prepare(`
    INSERT INTO offline_auth_profiles (
      user_id, email, salt, verifier, seeded_at, updated_at
    ) VALUES (
      @user_id, @email, @salt, @verifier, @seeded_at, @updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      salt = excluded.salt,
      verifier = excluded.verifier,
      seeded_at = excluded.seeded_at,
      updated_at = excluded.updated_at
  `);
  const countOfflineCapableStmt = db.prepare("SELECT COUNT(*) AS total FROM offline_auth_profiles");

  function upsertFromCloud(users = []) {
    const syncedAt = nowIso();
    const tx = db.transaction((items) => {
      items.forEach((user) => {
        upsertUser.run({
          id: user.id,
          full_name: String(user.fullName || "").trim(),
          nickname: String(user.nickname || "").trim(),
          email: String(user.email || "").trim(),
          role: user.role === "admin" ? "admin" : "petugas",
          status: user.status === "nonaktif" ? "nonaktif" : "aktif",
          class_group: String(user.classGroup || "").trim(),
          notes: String(user.notes || "").trim(),
          created_at: user.createdAt || syncedAt,
          updated_at: user.updatedAt || syncedAt,
          last_synced_at: syncedAt,
        });
      });
    });

    tx(users);
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
      seeded_at: now,
      updated_at: now,
    });
  }

  function verifyOfflinePin(email, pin, deviceSecret) {
    const row = selectOfflineAuthByEmail.get(String(email || "").trim());
    if (!row) return null;

    const verifier = crypto.scryptSync(`${String(pin)}::${deviceSecret}`, row.salt, 64).toString("hex");
    if (verifier !== row.verifier) return null;

    return mapUserRow(row);
  }

  return {
    countOfflineCapableUsers() {
      return countOfflineCapableStmt.get()?.total ?? 0;
    },
    getByEmail(email) {
      return mapUserRow(selectByEmail.get(String(email || "").trim()));
    },
    getById(id) {
      return mapUserRow(selectById.get(String(id || "")));
    },
    seedOfflineAuthProfile,
    upsertFromCloud,
    verifyOfflinePin,
    normalizeEmail(value) {
      return normalizeText(value);
    },
  };
}

module.exports = {
  createUsersRepo,
};
