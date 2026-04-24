const { generateId, normalizeText, nowIso, paginateItems, toNumber } = require("../common.cjs");

function mapDailyFinanceRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    financeDate: row.finance_date,
    grossAmount: toNumber(row.gross_amount, 0),
    changeTotal: toNumber(row.change_total, 0),
    netAmount: toNumber(row.net_amount, 0),
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || "",
  };
}

function mapChangeEntryRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    dailyFinanceId: row.daily_finance_id,
    financeDate: row.finance_date,
    buyerId: row.buyer_id,
    buyerNameSnapshot: row.buyer_name_snapshot,
    changeAmount: toNumber(row.change_amount, 0),
    status: row.status || "belum",
    settledAt: row.settled_at || "",
    settledByUserId: row.settled_by_user_id || "",
    settledByName: row.settled_by_name || "",
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || "",
  };
}

function parseNonNegativeNumber(value, label) {
  if (value === "" || value === null || value === undefined) {
    throw new Error(`${label} wajib diisi.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} harus berupa angka.`);
  }
  if (parsed < 0) {
    throw new Error(`${label} tidak boleh negatif.`);
  }
  return parsed;
}

function ensureAllowedUser(sessionUser) {
  if (!["admin", "petugas"].includes(sessionUser.role)) {
    throw new Error("Role user tidak diizinkan untuk aksi ini.");
  }
}

function createDailyFinanceRepo(db, buyersRepo) {
  const selectFinanceById = db.prepare("SELECT * FROM daily_finance WHERE id = ?");
  const selectChangeById = db.prepare("SELECT * FROM change_entries WHERE id = ?");
  const listFinanceStmt = db.prepare("SELECT * FROM daily_finance ORDER BY finance_date DESC, updated_at DESC");
  const listChangeStmt = db.prepare("SELECT * FROM change_entries ORDER BY finance_date DESC, updated_at DESC");
  const listChangesByFinanceStmt = db.prepare("SELECT * FROM change_entries WHERE daily_finance_id = ? ORDER BY updated_at DESC");
  const saveFinanceStmt = db.prepare(`
    INSERT INTO daily_finance (
      id, finance_date, gross_amount, change_total, net_amount, notes,
      created_by_user_id, created_by_name, created_at, updated_at, deleted_at,
      last_synced_at, pending_sync
    ) VALUES (
      @id, @finance_date, @gross_amount, @change_total, @net_amount, @notes,
      @created_by_user_id, @created_by_name, @created_at, @updated_at, @deleted_at,
      @last_synced_at, @pending_sync
    )
    ON CONFLICT(id) DO UPDATE SET
      finance_date = excluded.finance_date,
      gross_amount = excluded.gross_amount,
      change_total = excluded.change_total,
      net_amount = excluded.net_amount,
      notes = excluded.notes,
      created_by_user_id = excluded.created_by_user_id,
      created_by_name = excluded.created_by_name,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      last_synced_at = excluded.last_synced_at,
      pending_sync = excluded.pending_sync
  `);
  const saveChangeStmt = db.prepare(`
    INSERT INTO change_entries (
      id, daily_finance_id, finance_date, buyer_id, buyer_name_snapshot, change_amount,
      status, settled_at, settled_by_user_id, settled_by_name, notes,
      created_by_user_id, created_by_name, created_at, updated_at, deleted_at,
      last_synced_at, pending_sync
    ) VALUES (
      @id, @daily_finance_id, @finance_date, @buyer_id, @buyer_name_snapshot, @change_amount,
      @status, @settled_at, @settled_by_user_id, @settled_by_name, @notes,
      @created_by_user_id, @created_by_name, @created_at, @updated_at, @deleted_at,
      @last_synced_at, @pending_sync
    )
    ON CONFLICT(id) DO UPDATE SET
      daily_finance_id = excluded.daily_finance_id,
      finance_date = excluded.finance_date,
      buyer_id = excluded.buyer_id,
      buyer_name_snapshot = excluded.buyer_name_snapshot,
      change_amount = excluded.change_amount,
      status = excluded.status,
      settled_at = excluded.settled_at,
      settled_by_user_id = excluded.settled_by_user_id,
      settled_by_name = excluded.settled_by_name,
      notes = excluded.notes,
      created_by_user_id = excluded.created_by_user_id,
      created_by_name = excluded.created_by_name,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      last_synced_at = excluded.last_synced_at,
      pending_sync = excluded.pending_sync
  `);

  function ensureFinanceAccess(row, sessionUser) {
    if (!row || row.deleted_at) {
      throw new Error("Data keuangan harian tidak ditemukan.");
    }
    if (sessionUser.role !== "admin" && String(row.created_by_user_id) !== String(sessionUser.id)) {
      throw new Error("Data keuangan harian ini bukan milik Anda.");
    }
  }

  function ensureChangeAccess(row, sessionUser) {
    if (!row || row.deleted_at) {
      throw new Error("Data kembalian tidak ditemukan.");
    }
    if (sessionUser.role !== "admin" && String(row.created_by_user_id) !== String(sessionUser.id)) {
      throw new Error("Data kembalian ini bukan milik Anda.");
    }
  }

  function getActiveChangeRowsByFinanceId(financeId) {
    return listChangesByFinanceStmt.all(String(financeId || ""))
      .filter((row) => !row.deleted_at);
  }

  function buildDailyFinanceSummary(row, relatedEntries) {
    const entries = relatedEntries.map((entry) => entry.id ? entry : mapChangeEntryRow(entry));
    const pendingChangeCount = entries.filter((entry) => entry.status !== "selesai").length;

    return {
      ...mapDailyFinanceRow(row),
      changeEntryCount: entries.length,
      pendingChangeCount,
      settledChangeCount: entries.length - pendingChangeCount,
    };
  }

  function normalizeIncomingChangeEntries(items, existingRows) {
    const existingById = new Map(existingRows.map((row) => [String(row.id), row]));
    const seenBuyerIds = new Set();

    return (items || []).map((item, index) => {
      const label = `Baris kembalian ${index + 1}`;
      const existing = item.id ? existingById.get(String(item.id)) : null;

      if (!item.buyerId) {
        throw new Error(`${label} wajib memilih pembeli.`);
      }
      if (seenBuyerIds.has(String(item.buyerId))) {
        throw new Error(`${label} duplikat pembeli dalam satu catatan harian.`);
      }
      seenBuyerIds.add(String(item.buyerId));

      const buyer = buyersRepo.getById(item.buyerId);
      if (!buyer) {
        throw new Error(`${label} merujuk pembeli yang tidak ditemukan.`);
      }
      if (buyer.status !== "aktif" && !(existing && String(existing.buyer_id) === String(item.buyerId))) {
        throw new Error(`${label} merujuk pembeli yang sudah nonaktif.`);
      }

      const changeAmount = parseNonNegativeNumber(item.changeAmount, `${label} nominal`);
      if (changeAmount <= 0) {
        throw new Error(`${label} nominal harus lebih dari 0.`);
      }

      return {
        id: item.id || generateId("CHG"),
        existing,
        buyer,
        changeAmount,
        notes: String(item.notes || "").trim(),
      };
    });
  }

  function buildDetail(financeId, sessionUser) {
    const finance = selectFinanceById.get(String(financeId || ""));
    ensureFinanceAccess(finance, sessionUser);
    const changeRows = getActiveChangeRowsByFinanceId(finance.id);
    const changeEntries = changeRows
      .map(mapChangeEntryRow)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));

    return {
      finance: buildDailyFinanceSummary(finance, changeEntries),
      changeEntries,
    };
  }

  function applyCloudFinanceRecord(finance, options = {}) {
    const existing = selectFinanceById.get(String(finance.id || ""));
    if (existing?.pending_sync && !options.force) {
      return {
        skipped: true,
        finance: mapDailyFinanceRow(existing),
      };
    }

    const syncedAt = nowIso();
    const record = {
      id: finance.id,
      finance_date: finance.financeDate,
      gross_amount: Math.max(toNumber(finance.grossAmount, 0), 0),
      change_total: Math.max(toNumber(finance.changeTotal, 0), 0),
      net_amount: toNumber(finance.netAmount, toNumber(finance.grossAmount, 0) - toNumber(finance.changeTotal, 0)),
      notes: String(finance.notes || "").trim(),
      created_by_user_id: String(finance.createdByUserId || "").trim(),
      created_by_name: String(finance.createdByName || "").trim(),
      created_at: finance.createdAt || existing?.created_at || syncedAt,
      updated_at: finance.updatedAt || syncedAt,
      deleted_at: finance.deletedAt || "",
      last_synced_at: syncedAt,
      pending_sync: 0,
    };

    saveFinanceStmt.run(record);
    if (record.deleted_at) {
      listChangesByFinanceStmt.all(record.id).forEach((entry) => {
        saveChangeStmt.run({
          ...entry,
          updated_at: record.updated_at,
          deleted_at: entry.deleted_at || record.deleted_at,
          last_synced_at: syncedAt,
          pending_sync: 0,
        });
      });
    }
    return {
      skipped: false,
      finance: mapDailyFinanceRow(record),
    };
  }

  function applyCloudChangeEntryRecord(entry, options = {}) {
    const existing = selectChangeById.get(String(entry.id || ""));
    if (existing?.pending_sync && !options.force) {
      return {
        skipped: true,
        changeEntry: mapChangeEntryRow(existing),
      };
    }

    const syncedAt = nowIso();
    const record = {
      id: entry.id,
      daily_finance_id: entry.dailyFinanceId,
      finance_date: entry.financeDate,
      buyer_id: entry.buyerId,
      buyer_name_snapshot: String(entry.buyerNameSnapshot || "").trim(),
      change_amount: Math.max(toNumber(entry.changeAmount, 0), 0),
      status: entry.status === "selesai" ? "selesai" : "belum",
      settled_at: entry.settledAt || "",
      settled_by_user_id: entry.settledByUserId || "",
      settled_by_name: entry.settledByName || "",
      notes: String(entry.notes || "").trim(),
      created_by_user_id: entry.createdByUserId || "",
      created_by_name: entry.createdByName || "",
      created_at: entry.createdAt || existing?.created_at || syncedAt,
      updated_at: entry.updatedAt || syncedAt,
      deleted_at: entry.deletedAt || "",
      last_synced_at: syncedAt,
      pending_sync: 0,
    };

    saveChangeStmt.run(record);
    return {
      skipped: false,
      changeEntry: mapChangeEntryRow(record),
    };
  }

  return {
    applyCloudChangeEntryRecord,
    applyCloudFinanceRecord,
    applyCloudDetail(detail = {}) {
      const finance = detail.finance ? applyCloudFinanceRecord(detail.finance, { force: true }).finance : null;
      const changeEntries = (detail.changeEntries || []).map((entry) => {
        return applyCloudChangeEntryRecord(entry, { force: true }).changeEntry;
      });
      if (finance) {
        const activeEntryIds = new Set(changeEntries.map((entry) => String(entry.id)));
        const syncedAt = nowIso();
        listChangesByFinanceStmt.all(finance.id).forEach((entry) => {
          if (activeEntryIds.has(String(entry.id)) || !entry.deleted_at) return;
          saveChangeStmt.run({
            ...entry,
            last_synced_at: syncedAt,
            pending_sync: 0,
          });
        });
      }
      return {
        finance,
        changeEntries,
      };
    },
    deleteDailyFinance(payload = {}, sessionUser) {
      ensureAllowedUser(sessionUser);
      const finance = selectFinanceById.get(String(payload.id || ""));
      ensureFinanceAccess(finance, sessionUser);

      const relatedRows = getActiveChangeRowsByFinanceId(finance.id);
      if (relatedRows.some((entry) => entry.status === "selesai")) {
        throw new Error("Catatan harian dengan kembalian selesai tidak bisa dihapus. Ubah statusnya dulu bila memang perlu.");
      }

      const now = nowIso();
      const tx = db.transaction(() => {
        saveFinanceStmt.run({
          ...finance,
          updated_at: now,
          deleted_at: now,
          pending_sync: 1,
        });

        relatedRows.forEach((entry) => {
          saveChangeStmt.run({
            ...entry,
            updated_at: now,
            deleted_at: now,
            pending_sync: 1,
          });
        });
      });

      tx();
      return mapDailyFinanceRow(selectFinanceById.get(finance.id));
    },
    getDailyFinanceDetail(payload = {}, sessionUser) {
      return buildDetail(payload.id, sessionUser);
    },
    listChangeEntries(payload = {}, sessionUser) {
      let items = listChangeStmt.all()
        .filter((row) => !row.deleted_at);

      if (sessionUser.role !== "admin") {
        items = items.filter((row) => String(row.created_by_user_id) === String(sessionUser.id));
      }
      if (payload.status) {
        items = items.filter((row) => normalizeText(row.status) === normalizeText(payload.status));
      }
      if (payload.financeDate) {
        items = items.filter((row) => String(row.finance_date) === String(payload.financeDate));
      }
      if (payload.query || payload.search) {
        const query = normalizeText(payload.query || payload.search);
        items = items.filter((row) => [
          row.buyer_name_snapshot,
          row.notes,
          row.created_by_name,
        ].some((part) => normalizeText(part).includes(query)));
      }

      const sorted = items
        .map(mapChangeEntryRow)
        .sort((left, right) => {
          if (left.status !== right.status) return left.status === "belum" ? -1 : 1;
          const dateDelta = String(right.financeDate).localeCompare(String(left.financeDate));
          if (dateDelta !== 0) return dateDelta;
          return String(right.updatedAt).localeCompare(String(left.updatedAt));
        });

      return paginateItems(sorted, payload);
    },
    listDailyFinance(payload = {}, sessionUser) {
      let items = listFinanceStmt.all()
        .filter((row) => !row.deleted_at);

      if (sessionUser.role !== "admin") {
        items = items.filter((row) => String(row.created_by_user_id) === String(sessionUser.id));
      }
      if (payload.financeDate) {
        items = items.filter((row) => String(row.finance_date) === String(payload.financeDate));
      }
      if (payload.startDate) {
        items = items.filter((row) => String(row.finance_date) >= String(payload.startDate));
      }
      if (payload.endDate) {
        items = items.filter((row) => String(row.finance_date) <= String(payload.endDate));
      }
      if (payload.query || payload.search) {
        const query = normalizeText(payload.query || payload.search);
        items = items.filter((row) => [
          row.notes,
          row.created_by_name,
        ].some((part) => normalizeText(part).includes(query)));
      }

      const summarized = items
        .sort((left, right) => {
          const dateDelta = String(right.finance_date).localeCompare(String(left.finance_date));
          if (dateDelta !== 0) return dateDelta;
          return String(right.updated_at).localeCompare(String(left.updated_at));
        })
        .map((row) => buildDailyFinanceSummary(row, getActiveChangeRowsByFinanceId(row.id)));

      return paginateItems(summarized, payload);
    },
    saveDailyFinance(payload = {}, sessionUser) {
      ensureAllowedUser(sessionUser);

      const now = nowIso();
      const existingFinance = payload.id ? selectFinanceById.get(String(payload.id)) : null;
      const existingEntries = existingFinance ? getActiveChangeRowsByFinanceId(existingFinance.id) : [];

      if (existingFinance) {
        ensureFinanceAccess(existingFinance, sessionUser);
      }
      if (!payload.financeDate) {
        throw new Error("Tanggal keuangan harian wajib diisi.");
      }

      const grossAmount = parseNonNegativeNumber(payload.grossAmount, "Total uang masuk");
      const changeTotal = parseNonNegativeNumber(payload.changeTotal, "Total uang kembalian");
      const normalizedEntries = normalizeIncomingChangeEntries(payload.changeEntries || [], existingEntries);
      const sumChangeEntries = normalizedEntries.reduce((sum, entry) => sum + entry.changeAmount, 0);

      if (changeTotal !== sumChangeEntries) {
        throw new Error("Total uang kembalian harus sama dengan jumlah rincian kembalian.");
      }
      if (changeTotal > grossAmount) {
        throw new Error("Total uang kembalian tidak boleh melebihi total uang masuk.");
      }

      const incomingIds = new Set(normalizedEntries.map((entry) => String(entry.id)));
      normalizedEntries.forEach((entry) => {
        if (
          entry.existing
          && entry.existing.status === "selesai"
          && (
            String(entry.existing.buyer_id) !== String(entry.buyer.id)
            || toNumber(entry.existing.change_amount, 0) !== entry.changeAmount
          )
        ) {
          throw new Error("Rincian kembalian yang sudah selesai tidak boleh diubah pembeli atau nominalnya.");
        }
      });

      existingEntries.forEach((entry) => {
        if (incomingIds.has(String(entry.id))) return;
        if (entry.status === "selesai") {
          throw new Error("Rincian kembalian yang sudah selesai tidak boleh dihapus dari catatan harian.");
        }
      });

      const financeRecord = {
        id: existingFinance?.id || payload.id || generateId("FIN"),
        finance_date: payload.financeDate,
        gross_amount: grossAmount,
        change_total: changeTotal,
        net_amount: grossAmount - changeTotal,
        notes: String(payload.notes || "").trim(),
        created_by_user_id: existingFinance?.created_by_user_id || sessionUser.id,
        created_by_name: existingFinance?.created_by_name || sessionUser.fullName,
        created_at: existingFinance?.created_at || now,
        updated_at: now,
        deleted_at: "",
        last_synced_at: existingFinance?.last_synced_at || null,
        pending_sync: 1,
      };

      const tx = db.transaction(() => {
        saveFinanceStmt.run(financeRecord);

        normalizedEntries.forEach((entry) => {
          saveChangeStmt.run({
            id: entry.id,
            daily_finance_id: financeRecord.id,
            finance_date: financeRecord.finance_date,
            buyer_id: entry.buyer.id,
            buyer_name_snapshot: entry.buyer.buyerName,
            change_amount: entry.changeAmount,
            status: entry.existing?.status || "belum",
            settled_at: entry.existing?.settled_at || "",
            settled_by_user_id: entry.existing?.settled_by_user_id || "",
            settled_by_name: entry.existing?.settled_by_name || "",
            notes: entry.notes,
            created_by_user_id: entry.existing?.created_by_user_id || sessionUser.id,
            created_by_name: entry.existing?.created_by_name || sessionUser.fullName,
            created_at: entry.existing?.created_at || now,
            updated_at: now,
            deleted_at: "",
            last_synced_at: entry.existing?.last_synced_at || null,
            pending_sync: 1,
          });
        });

        existingEntries.forEach((entry) => {
          if (incomingIds.has(String(entry.id))) return;
          saveChangeStmt.run({
            ...entry,
            updated_at: now,
            deleted_at: now,
            pending_sync: 1,
          });
        });
      });

      tx();
      return buildDetail(financeRecord.id, sessionUser);
    },
    updateChangeEntryStatus(payload = {}, sessionUser) {
      ensureAllowedUser(sessionUser);
      const entry = selectChangeById.get(String(payload.id || ""));
      ensureChangeAccess(entry, sessionUser);

      const nextStatus = payload.status === "selesai" ? "selesai" : payload.status === "belum" ? "belum" : "";
      if (!nextStatus) {
        throw new Error("Status kembalian hanya boleh 'belum' atau 'selesai'.");
      }

      const now = nowIso();
      const record = {
        ...entry,
        status: nextStatus,
        updated_at: now,
        settled_at: nextStatus === "selesai" ? now : "",
        settled_by_user_id: nextStatus === "selesai" ? sessionUser.id : "",
        settled_by_name: nextStatus === "selesai" ? sessionUser.fullName : "",
        pending_sync: 1,
      };

      saveChangeStmt.run(record);
      return mapChangeEntryRow(record);
    },
  };
}

module.exports = {
  createDailyFinanceRepo,
};
