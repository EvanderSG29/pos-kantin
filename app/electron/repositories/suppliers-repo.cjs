const { generateId, normalizeCommissionBaseType, normalizeText, nowIso, paginateItems, toNumber } = require("../common.cjs");

function mapSupplierRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    supplierName: row.supplier_name,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    commissionRate: toNumber(row.commission_rate, 10),
    commissionBaseType: normalizeCommissionBaseType(row.commission_base_type),
    payoutTermDays: Math.max(Math.trunc(toNumber(row.payout_term_days, 0)), 0),
    notes: row.notes,
    isActive: Number(row.is_active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSuppliersRepo(db) {
  const selectById = db.prepare("SELECT * FROM suppliers WHERE id = ?");
  const selectByName = db.prepare("SELECT * FROM suppliers WHERE lower(trim(supplier_name)) = lower(trim(?)) AND id != ?");
  const listAllStmt = db.prepare("SELECT * FROM suppliers ORDER BY supplier_name COLLATE NOCASE ASC");
  const saveStmt = db.prepare(`
    INSERT INTO suppliers (
      id, supplier_name, contact_name, contact_phone, commission_rate, commission_base_type,
      payout_term_days, notes, is_active, created_at, updated_at, last_synced_at, pending_sync
    ) VALUES (
      @id, @supplier_name, @contact_name, @contact_phone, @commission_rate, @commission_base_type,
      @payout_term_days, @notes, @is_active, @created_at, @updated_at, @last_synced_at, @pending_sync
    )
    ON CONFLICT(id) DO UPDATE SET
      supplier_name = excluded.supplier_name,
      contact_name = excluded.contact_name,
      contact_phone = excluded.contact_phone,
      commission_rate = excluded.commission_rate,
      commission_base_type = excluded.commission_base_type,
      payout_term_days = excluded.payout_term_days,
      notes = excluded.notes,
      is_active = excluded.is_active,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at,
      pending_sync = excluded.pending_sync
  `);

  function listRows() {
    return listAllStmt.all();
  }

  function saveSupplier(payload, sessionUser) {
    if (sessionUser.role !== "admin") {
      throw new Error("Aksi ini hanya untuk admin.");
    }

    const now = nowIso();
    const existing = payload.id ? selectById.get(String(payload.id)) : null;
    const supplierName = String(payload.supplierName || "").trim();

    if (!supplierName) {
      throw new Error("Nama pemasok wajib diisi.");
    }

    const duplicate = selectByName.get(supplierName, String(payload.id || ""));
    if (duplicate) {
      throw new Error("Nama pemasok sudah dipakai.");
    }

    const record = {
      id: existing?.id || payload.id || generateId("SUP"),
      supplier_name: supplierName,
      contact_name: String(payload.contactName || "").trim(),
      contact_phone: String(payload.contactPhone || "").trim(),
      commission_rate: Math.max(toNumber(payload.commissionRate, 0), 0),
      commission_base_type: normalizeCommissionBaseType(payload.commissionBaseType),
      payout_term_days: Math.max(Math.trunc(toNumber(payload.payoutTermDays, 0)), 0),
      notes: String(payload.notes || "").trim(),
      is_active: payload.isActive === false || payload.isActive === "false" ? 0 : 1,
      created_at: existing?.created_at || now,
      updated_at: now,
      last_synced_at: existing?.last_synced_at || null,
      pending_sync: 1,
    };

    saveStmt.run(record);
    return mapSupplierRow(record);
  }

  function applyCloudRecord(supplier, options = {}) {
    const existing = selectById.get(String(supplier.id || ""));
    if (existing?.pending_sync && !options.force) {
      return {
        skipped: true,
        supplier: mapSupplierRow(existing),
      };
    }

    const syncedAt = nowIso();
    const record = {
      id: supplier.id,
      supplier_name: String(supplier.supplierName || "").trim(),
      contact_name: String(supplier.contactName || "").trim(),
      contact_phone: String(supplier.contactPhone || "").trim(),
      commission_rate: Math.max(toNumber(supplier.commissionRate, 0), 0),
      commission_base_type: normalizeCommissionBaseType(supplier.commissionBaseType),
      payout_term_days: Math.max(Math.trunc(toNumber(supplier.payoutTermDays, 0)), 0),
      notes: String(supplier.notes || "").trim(),
      is_active: supplier.isActive === false ? 0 : 1,
      created_at: supplier.createdAt || existing?.created_at || syncedAt,
      updated_at: supplier.updatedAt || syncedAt,
      last_synced_at: syncedAt,
      pending_sync: 0,
    };

    saveStmt.run(record);
    return {
      skipped: false,
      supplier: mapSupplierRow(record),
    };
  }

  return {
    applyCloudRecord,
    countActive() {
      return listRows().filter((row) => Number(row.is_active) === 1).length;
    },
    getById(id) {
      return mapSupplierRow(selectById.get(String(id || "")));
    },
    list(payload = {}) {
      const includeInactive = Boolean(payload.includeInactive);
      const items = listRows()
        .filter((row) => includeInactive || Number(row.is_active) === 1)
        .map(mapSupplierRow);

      if (!payload.page && !payload.pageSize) {
        return {
          items,
          pagination: {
            page: 1,
            pageSize: Math.max(items.length, 1),
            totalItems: items.length,
            totalPages: 1,
            itemCount: items.length,
            startItem: items.length ? 1 : 0,
            endItem: items.length,
            hasPrev: false,
            hasNext: false,
          },
        };
      }

      return paginateItems(items, payload);
    },
    listAllVisible(includeInactive = true) {
      return listRows()
        .filter((row) => includeInactive || Number(row.is_active) === 1)
        .map(mapSupplierRow);
    },
    saveSupplier,
  };
}

module.exports = {
  createSuppliersRepo,
};
