const { normalizeText, nowIso, toNumber } = require("../common.cjs");

function mapSavingRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    className: row.class_name,
    gender: row.gender,
    groupName: row.group_name,
    depositAmount: toNumber(row.deposit_amount, 0),
    changeBalance: toNumber(row.change_balance, 0),
    recordedAt: row.recorded_at,
    recordedByUserId: row.recorded_by_user_id,
    recordedByName: row.recorded_by_name,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSavingsRepo(db) {
  const selectById = db.prepare("SELECT * FROM savings WHERE id = ?");
  const listAllStmt = db.prepare("SELECT * FROM savings ORDER BY student_name COLLATE NOCASE ASC, recorded_at DESC");
  const saveStmt = db.prepare(`
    INSERT INTO savings (
      id, student_id, student_name, class_name, gender, group_name, deposit_amount,
      change_balance, recorded_at, recorded_by_user_id, recorded_by_name, notes,
      created_at, updated_at, last_synced_at
    ) VALUES (
      @id, @student_id, @student_name, @class_name, @gender, @group_name, @deposit_amount,
      @change_balance, @recorded_at, @recorded_by_user_id, @recorded_by_name, @notes,
      @created_at, @updated_at, @last_synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      student_id = excluded.student_id,
      student_name = excluded.student_name,
      class_name = excluded.class_name,
      gender = excluded.gender,
      group_name = excluded.group_name,
      deposit_amount = excluded.deposit_amount,
      change_balance = excluded.change_balance,
      recorded_at = excluded.recorded_at,
      recorded_by_user_id = excluded.recorded_by_user_id,
      recorded_by_name = excluded.recorded_by_name,
      notes = excluded.notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at
  `);

  function applyCloudRecord(saving) {
    const existing = selectById.get(String(saving.id || ""));
    const syncedAt = nowIso();
    const record = {
      id: saving.id,
      student_id: String(saving.studentId || "").trim(),
      student_name: String(saving.studentName || "").trim(),
      class_name: String(saving.className || "").trim(),
      gender: String(saving.gender || "").trim(),
      group_name: String(saving.groupName || "").trim(),
      deposit_amount: Math.max(toNumber(saving.depositAmount, 0), 0),
      change_balance: toNumber(saving.changeBalance, 0),
      recorded_at: saving.recordedAt || syncedAt.slice(0, 10),
      recorded_by_user_id: String(saving.recordedByUserId || "").trim(),
      recorded_by_name: String(saving.recordedByName || "").trim(),
      notes: String(saving.notes || "").trim(),
      created_at: saving.createdAt || existing?.created_at || syncedAt,
      updated_at: saving.updatedAt || syncedAt,
      last_synced_at: syncedAt,
    };

    saveStmt.run(record);
    return mapSavingRow(record);
  }

  return {
    applyCloudRecord,
    list(payload = {}) {
      let items = listAllStmt.all().map(mapSavingRow);
      const query = normalizeText(payload.query || payload.search || "");
      if (query) {
        items = items.filter((item) => [
          item.studentName,
          item.className,
          item.groupName,
          item.notes,
        ].some((part) => normalizeText(part).includes(query)));
      }
      return { items };
    },
    upsertFromCloud(savings = []) {
      const tx = db.transaction((items) => {
        items.forEach((saving) => applyCloudRecord(saving));
      });
      tx(savings);
    },
  };
}

module.exports = {
  createSavingsRepo,
};
