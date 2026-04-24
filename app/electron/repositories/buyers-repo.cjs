const { normalizeText, nowIso, toNumber } = require("../common.cjs");

function mapBuyerRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    buyerName: row.buyer_name,
    classOrCategory: row.class_or_category,
    openingBalance: toNumber(row.opening_balance, 0),
    currentBalance: toNumber(row.current_balance, 0),
    status: row.status || "aktif",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastImportedAt: row.last_imported_at || "",
  };
}

function createBuyersRepo(db) {
  const selectById = db.prepare("SELECT * FROM buyers WHERE id = ?");
  const listAllStmt = db.prepare("SELECT * FROM buyers ORDER BY status ASC, buyer_name COLLATE NOCASE ASC, class_or_category COLLATE NOCASE ASC");
  const saveStmt = db.prepare(`
    INSERT INTO buyers (
      id, buyer_name, class_or_category, opening_balance, current_balance, status,
      created_at, updated_at, last_imported_at, last_synced_at
    ) VALUES (
      @id, @buyer_name, @class_or_category, @opening_balance, @current_balance, @status,
      @created_at, @updated_at, @last_imported_at, @last_synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      buyer_name = excluded.buyer_name,
      class_or_category = excluded.class_or_category,
      opening_balance = excluded.opening_balance,
      current_balance = excluded.current_balance,
      status = excluded.status,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_imported_at = excluded.last_imported_at,
      last_synced_at = excluded.last_synced_at
  `);

  function applyCloudRecord(buyer) {
    const existing = selectById.get(String(buyer.id || ""));
    const syncedAt = nowIso();
    const record = {
      id: buyer.id,
      buyer_name: String(buyer.buyerName || "").trim(),
      class_or_category: String(buyer.classOrCategory || "").trim(),
      opening_balance: Math.max(toNumber(buyer.openingBalance, 0), 0),
      current_balance: Math.max(toNumber(buyer.currentBalance, buyer.openingBalance), 0),
      status: buyer.status === "nonaktif" ? "nonaktif" : "aktif",
      created_at: buyer.createdAt || existing?.created_at || syncedAt,
      updated_at: buyer.updatedAt || syncedAt,
      last_imported_at: buyer.lastImportedAt || existing?.last_imported_at || "",
      last_synced_at: syncedAt,
    };

    saveStmt.run(record);
    return mapBuyerRow(record);
  }

  return {
    applyCloudRecord,
    getById(id) {
      return mapBuyerRow(selectById.get(String(id || "")));
    },
    list(payload = {}) {
      let items = listAllStmt.all().map(mapBuyerRow);
      const status = normalizeText(payload.status || "");
      const query = normalizeText(payload.query || payload.search || "");

      if (status) {
        items = items.filter((item) => normalizeText(item.status) === status);
      }

      if (query) {
        items = items.filter((item) => [
          item.buyerName,
          item.classOrCategory,
          item.status,
        ].some((part) => normalizeText(part).includes(query)));
      }

      items.sort((left, right) => {
        if (left.status !== right.status) return left.status === "aktif" ? -1 : 1;
        const nameDelta = left.buyerName.localeCompare(right.buyerName);
        if (nameDelta !== 0) return nameDelta;
        return left.classOrCategory.localeCompare(right.classOrCategory);
      });

      return { items };
    },
    upsertFromCloud(buyers = []) {
      const tx = db.transaction((items) => {
        items.forEach((buyer) => applyCloudRecord(buyer));
      });
      tx(buyers);
    },
  };
}

module.exports = {
  createBuyersRepo,
};
