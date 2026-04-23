import { APP_CONFIG } from "./config.js";
import {
  calculateTransactionMetrics,
  COMMISSION_BASE_TYPES,
  groupOutstandingSupplierPayouts,
  normalizeCommissionBaseType,
  summarizePayoutBuckets,
  toLocalIsoDate,
} from "./finance.js";
import { storage } from "./storage.js";
import { clone, createId, includesText, normalizeText, sha256Hex, toNumber } from "./utils.js";

const DEV_PIN_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
const BUYER_IMPORT_SEED_NOTE = "IMPORT_CSV_SEED";

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return toLocalIsoDate();
}


function shiftLocalDate(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

function plusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function safeUser(user) {
  const { pinHash, ...rest } = user;
  return rest;
}

function normalizeBuyerKey(buyerName, classOrCategory) {
  return `${normalizeText(buyerName)}||${normalizeText(classOrCategory)}`;
}

function sortTransactions(items) {
  return [...items].sort((left, right) => {
    const dateDelta = new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
    if (dateDelta !== 0) return dateDelta;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortDailyFinance(items) {
  return [...items].sort((left, right) => {
    const dateDelta = new Date(right.financeDate).getTime() - new Date(left.financeDate).getTime();
    if (dateDelta !== 0) return dateDelta;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortChangeEntries(items) {
  return [...items].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "belum" ? -1 : 1;
    }

    const dateDelta = new Date(right.financeDate).getTime() - new Date(left.financeDate).getTime();
    if (dateDelta !== 0) return dateDelta;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortBuyers(items) {
  return [...items].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "aktif" ? -1 : 1;
    }

    const nameDelta = left.buyerName.localeCompare(right.buyerName);
    if (nameDelta !== 0) return nameDelta;
    return left.classOrCategory.localeCompare(right.classOrCategory);
  });
}

function ensureAdmin(user) {
  if (user.role !== "admin") {
    throw new Error("Aksi ini hanya untuk admin.");
  }
}

function assertNonNegativeNumber(value, label) {
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

function buildSavingsSeed(state, buyer, sessionUser, timestamp) {
  const existing = state.savings.find(
    (item) => item.studentId === buyer.id && item.notes === BUYER_IMPORT_SEED_NOTE,
  );

  const record = existing ?? {
    id: createId("SVG"),
    createdAt: timestamp,
  };

  record.studentId = buyer.id;
  record.studentName = buyer.buyerName;
  record.className = buyer.classOrCategory;
  record.gender = "";
  record.groupName = "";
  record.depositAmount = buyer.openingBalance;
  record.changeBalance = buyer.currentBalance;
  record.recordedAt = timestamp.slice(0, 10);
  record.recordedByUserId = sessionUser.id;
  record.recordedByName = sessionUser.fullName;
  record.notes = BUYER_IMPORT_SEED_NOTE;
  record.updatedAt = timestamp;

  if (!existing) {
    state.savings.push(record);
  }
}

function computeDailyFinanceSummary(record, changeEntries) {
  const pendingChangeCount = changeEntries.filter((entry) => entry.status !== "selesai").length;

  return {
    ...clone(record),
    changeEntryCount: changeEntries.length,
    pendingChangeCount,
    settledChangeCount: changeEntries.length - pendingChangeCount,
  };
}

function filterTransactions(items, payload = {}) {
  return items.filter((item) => {
    const matchDate = payload.transactionDate ? item.transactionDate === payload.transactionDate : true;
    const matchStart = payload.startDate ? item.transactionDate >= payload.startDate : true;
    const matchEnd = payload.endDate ? item.transactionDate <= payload.endDate : true;
    const matchSupplier = payload.supplierId ? item.supplierId === payload.supplierId : true;
    const matchCommissionBaseType = payload.commissionBaseType
      ? normalizeCommissionBaseType(item.commissionBaseType) === normalizeCommissionBaseType(payload.commissionBaseType)
      : true;
    const matchText = includesText(
      [item.itemName, item.supplierName, item.inputByName, item.notes],
      payload.query ?? payload.search ?? "",
    );
    return matchDate && matchStart && matchEnd && matchSupplier && matchCommissionBaseType && matchText;
  });
}

function filterBuyers(items, payload = {}) {
  return sortBuyers(items.filter((item) => {
    const matchStatus = payload.status ? normalizeText(item.status) === normalizeText(payload.status) : true;
    const matchText = includesText([item.buyerName, item.classOrCategory, item.status], payload.query ?? payload.search ?? "");
    return matchStatus && matchText;
  }));
}

function filterDailyFinance(state, user, payload = {}) {
  const scopedFinance = user.role === "admin"
    ? state.dailyFinance
    : state.dailyFinance.filter((item) => item.createdByUserId === user.id);

  const filtered = scopedFinance.filter((item) => {
    const matchDeleted = !item.deletedAt;
    const matchDate = payload.financeDate ? item.financeDate === payload.financeDate : true;
    const matchStart = payload.startDate ? item.financeDate >= payload.startDate : true;
    const matchEnd = payload.endDate ? item.financeDate <= payload.endDate : true;
    const matchText = includesText([item.notes, item.createdByName], payload.query ?? payload.search ?? "");
    return matchDeleted && matchDate && matchStart && matchEnd && matchText;
  });

  return sortDailyFinance(filtered).map((item) => {
    const relatedEntries = state.changeEntries.filter(
      (entry) => !entry.deletedAt && entry.dailyFinanceId === item.id,
    );
    return computeDailyFinanceSummary(item, relatedEntries);
  });
}

function filterChangeEntries(state, user, payload = {}) {
  const scopedEntries = user.role === "admin"
    ? state.changeEntries
    : state.changeEntries.filter((item) => item.createdByUserId === user.id);

  const filtered = scopedEntries.filter((item) => {
    const matchDeleted = !item.deletedAt;
    const matchStatus = payload.status ? normalizeText(item.status) === normalizeText(payload.status) : true;
    const matchDate = payload.financeDate ? item.financeDate === payload.financeDate : true;
    const matchText = includesText(
      [item.buyerNameSnapshot, item.notes, item.createdByName],
      payload.query ?? payload.search ?? "",
    );
    return matchDeleted && matchStatus && matchDate && matchText;
  });

  return sortChangeEntries(filtered);
}

function sortSupplierPayoutHistory(items) {
  return [...items].sort((left, right) => {
    const dueDelta = String(right.dueDate || "").localeCompare(String(left.dueDate || ""));
    if (dueDelta !== 0) return dueDelta;
    return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  });
}

function normalizeSupplierRecord(record) {
  return {
    ...record,
    commissionRate: Math.max(toNumber(record.commissionRate, 10), 0),
    commissionBaseType: normalizeCommissionBaseType(record.commissionBaseType),
    payoutTermDays: Math.max(toNumber(record.payoutTermDays, 0), 0),
    isActive: record.isActive !== false,
  };
}

function getSupplierById(state, supplierId) {
  return state.suppliers.find((item) => item.id === supplierId) ?? null;
}

function buildTransactionRecord({ existing, payload, user, supplier, timestamp }) {
  if (!payload.transactionDate || !payload.itemName || !payload.unitName || !supplier?.supplierName) {
    throw new Error("Tanggal, pemasok, makanan, dan satuan wajib diisi.");
  }

  const quantity = assertNonNegativeNumber(payload.quantity, "Jumlah titip");
  const remainingQuantity = assertNonNegativeNumber(payload.remainingQuantity, "Sisa");
  const unitPrice = assertNonNegativeNumber(payload.unitPrice, "Harga jual");
  const costPrice = assertNonNegativeNumber(payload.costPrice, "Harga modal");

  if (remainingQuantity > quantity) {
    throw new Error("Sisa tidak boleh lebih besar dari jumlah titip.");
  }

  const metrics = calculateTransactionMetrics({
    quantity,
    remainingQuantity,
    unitPrice,
    costPrice,
    commissionRate: supplier.commissionRate,
    commissionBaseType: supplier.commissionBaseType,
    payoutTermDays: supplier.payoutTermDays,
    transactionDate: payload.transactionDate,
  });

  const record = existing ?? {
    id: createId("TRX"),
    createdAt: timestamp,
    inputByUserId: user.id,
    inputByName: user.fullName,
    supplierPayoutId: "",
  };

  Object.assign(record, {
    transactionDate: payload.transactionDate,
    supplierId: supplier.id,
    supplierName: supplier.supplierName,
    itemName: String(payload.itemName ?? "").trim(),
    unitName: String(payload.unitName ?? "").trim(),
    quantity: metrics.quantity,
    remainingQuantity: metrics.remainingQuantity,
    soldQuantity: metrics.soldQuantity,
    costPrice: metrics.costPrice,
    unitPrice: metrics.unitPrice,
    grossSales: metrics.grossSales,
    totalValue: metrics.totalValue,
    profitAmount: metrics.profitAmount,
    commissionRate: metrics.commissionRate,
    commissionBaseType: metrics.commissionBaseType,
    commissionAmount: metrics.commissionAmount,
    supplierNetAmount: metrics.supplierNetAmount,
    payoutTermDays: metrics.payoutTermDays,
    payoutDueDate: metrics.payoutDueDate,
    notes: String(payload.notes ?? "").trim(),
    updatedAt: timestamp,
  });

  return record;
}

function buildSupplierPayoutSummary(outstanding, history, referenceDate = todayIso()) {
  const dueItems = outstanding.filter((item) => item.dueDate && item.dueDate <= referenceDate);
  const overdueItems = outstanding.filter((item) => item.dueStatus === "overdue");

  return {
    outstandingCount: outstanding.length,
    outstandingAmount: outstanding.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    dueCount: dueItems.length,
    dueAmount: dueItems.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    overdueCount: overdueItems.length,
    overdueAmount: overdueItems.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    settledCount: history.length,
    settledAmount: history.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
    termBuckets: summarizePayoutBuckets(outstanding),
  };
}

function ensureTransactionCanMutate(item) {
  if (item?.supplierPayoutId) {
    throw new Error("Transaksi yang sudah masuk payout pemasok tidak bisa diubah atau dihapus.");
  }
}

function seedMockState() {
  const createdAt = nowIso();

  const users = [
    {
      id: "USR-EVANDER",
      fullName: "Evander Smid Gidion",
      nickname: "Evander",
      email: "smidgidionevander@gmail.com",
      role: "admin",
      status: "aktif",
      classGroup: "XI PPLG",
      notes: "Admin utama",
      pinHash: DEV_PIN_HASH,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "USR-ARMAN",
      fullName: "Arman Rifqi Hafuza",
      nickname: "Arman",
      email: "armanrifqi839@gmail.com",
      role: "petugas",
      status: "aktif",
      classGroup: "XI PPLG",
      notes: "Petugas referensi",
      pinHash: DEV_PIN_HASH,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const buyers = [
    {
      id: "BYR-QUEENZA",
      buyerName: "Queenza Adilla Rahimah Fatmawati",
      classOrCategory: "X C4",
      openingBalance: 3000,
      currentBalance: 3000,
      status: "aktif",
      createdAt,
      updatedAt: createdAt,
      lastImportedAt: createdAt,
    },
    {
      id: "BYR-SHANIA",
      buyerName: "Shania",
      classOrCategory: "X C1",
      openingBalance: 500,
      currentBalance: 500,
      status: "aktif",
      createdAt,
      updatedAt: createdAt,
      lastImportedAt: createdAt,
    },
    {
      id: "BYR-LAMA",
      buyerName: "Data Lama",
      classOrCategory: "Arsip",
      openingBalance: 0,
      currentBalance: 0,
      status: "nonaktif",
      createdAt,
      updatedAt: createdAt,
      lastImportedAt: createdAt,
    },
  ];

  const savings = buyers.map((buyer, index) => ({
    id: `SVG-00${index + 1}`,
    studentId: buyer.id,
    studentName: buyer.buyerName,
    className: buyer.classOrCategory,
    gender: "",
    groupName: "",
    depositAmount: buyer.openingBalance,
    changeBalance: buyer.currentBalance,
    recordedAt: "2026-02-23",
    recordedByUserId: users[0].id,
    recordedByName: users[0].fullName,
    notes: BUYER_IMPORT_SEED_NOTE,
    createdAt,
    updatedAt: createdAt,
  }));

  const suppliers = [
    normalizeSupplierRecord({
      id: "SUP-KLATIF",
      supplierName: "Kang Latif",
      contactName: "Latif",
      contactPhone: "0812-1111-1111",
      commissionRate: 10,
      commissionBaseType: COMMISSION_BASE_TYPES.revenue,
      payoutTermDays: 3,
      notes: "Skema bagi omzet 10%.",
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    }),
    normalizeSupplierRecord({
      id: "SUP-UNI",
      supplierName: "Uni",
      contactName: "Uni",
      contactPhone: "0812-2222-2222",
      commissionRate: 10,
      commissionBaseType: COMMISSION_BASE_TYPES.profit,
      payoutTermDays: 7,
      notes: "Skema bagi hasil 10%.",
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    }),
    normalizeSupplierRecord({
      id: "SUP-BUEVA",
      supplierName: "Bu Eva",
      contactName: "Eva",
      contactPhone: "0812-3333-3333",
      commissionRate: 20,
      commissionBaseType: COMMISSION_BASE_TYPES.revenue,
      payoutTermDays: 14,
      notes: "Contoh pemasok legacy 20%.",
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    }),
    normalizeSupplierRecord({
      id: "SUP-PARIE",
      supplierName: "Pak Arie",
      contactName: "Arie",
      contactPhone: "",
      commissionRate: 10,
      commissionBaseType: COMMISSION_BASE_TYPES.revenue,
      payoutTermDays: 1,
      notes: "Pemasok nonaktif untuk uji master data.",
      isActive: false,
      createdAt,
      updatedAt: createdAt,
    }),
  ];

  const transactions = [
    buildTransactionRecord({
      payload: {
        transactionDate: shiftLocalDate(-10),
        supplierId: "SUP-KLATIF",
        itemName: "Cirawang",
        unitName: "3 pcs (1 porsi)",
        quantity: 20,
        remainingQuantity: 4,
        costPrice: 600,
        unitPrice: 1000,
        notes: "Contoh transaksi yang sudah dibayar.",
      },
      user: users[0],
      supplier: suppliers[0],
      timestamp: createdAt,
    }),
    buildTransactionRecord({
      payload: {
        transactionDate: shiftLocalDate(-4),
        supplierId: "SUP-KLATIF",
        itemName: "Cilung Keju",
        unitName: "1 pcs",
        quantity: 24,
        remainingQuantity: 5,
        costPrice: 800,
        unitPrice: 1500,
        notes: "Jatuh tempo kemarin.",
      },
      user: users[1],
      supplier: suppliers[0],
      timestamp: createdAt,
    }),
    buildTransactionRecord({
      payload: {
        transactionDate: shiftLocalDate(-5),
        supplierId: "SUP-UNI",
        itemName: "Burger",
        unitName: "1 pcs",
        quantity: 12,
        remainingQuantity: 2,
        costPrice: 6000,
        unitPrice: 8000,
        notes: "Skema profit 10%.",
      },
      user: users[1],
      supplier: suppliers[1],
      timestamp: createdAt,
    }),
    buildTransactionRecord({
      payload: {
        transactionDate: todayIso(),
        supplierId: "SUP-BUEVA",
        itemName: "Roti Bakar",
        unitName: "1 pcs",
        quantity: 10,
        remainingQuantity: 1,
        costPrice: 3500,
        unitPrice: 5000,
        notes: "Contoh transaksi hari ini.",
      },
      user: users[0],
      supplier: suppliers[2],
      timestamp: createdAt,
    }),
  ];

  transactions[0].id = "TRX-001";
  transactions[0].supplierPayoutId = "PAY-001";
  transactions[1].id = "TRX-002";
  transactions[2].id = "TRX-003";
  transactions[3].id = "TRX-004";

  const dailyFinance = [
    {
      id: "FIN-001",
      financeDate: shiftLocalDate(-1),
      grossAmount: 125000,
      changeTotal: 3500,
      netAmount: 121500,
      notes: "Ada dua kembalian belum lunas.",
      createdByUserId: users[0].id,
      createdByName: users[0].fullName,
      createdAt,
      updatedAt: createdAt,
      deletedAt: "",
    },
    {
      id: "FIN-002",
      financeDate: todayIso(),
      grossAmount: 86000,
      changeTotal: 2000,
      netAmount: 84000,
      notes: "Catatan petugas siang.",
      createdByUserId: users[1].id,
      createdByName: users[1].fullName,
      createdAt,
      updatedAt: createdAt,
      deletedAt: "",
    },
  ];

  const changeEntries = [
    {
      id: "CHG-001",
      dailyFinanceId: "FIN-001",
      financeDate: shiftLocalDate(-1),
      buyerId: "BYR-QUEENZA",
      buyerNameSnapshot: "Queenza Adilla Rahimah Fatmawati",
      changeAmount: 3000,
      status: "belum",
      settledAt: "",
      settledByUserId: "",
      settledByName: "",
      notes: "Belum diambil pulang sekolah.",
      createdByUserId: users[0].id,
      createdByName: users[0].fullName,
      createdAt,
      updatedAt: createdAt,
      deletedAt: "",
    },
    {
      id: "CHG-002",
      dailyFinanceId: "FIN-001",
      financeDate: shiftLocalDate(-1),
      buyerId: "BYR-SHANIA",
      buyerNameSnapshot: "Shania",
      changeAmount: 500,
      status: "selesai",
      settledAt: createdAt,
      settledByUserId: users[0].id,
      settledByName: users[0].fullName,
      notes: "Sudah diambil.",
      createdByUserId: users[0].id,
      createdByName: users[0].fullName,
      createdAt,
      updatedAt: createdAt,
      deletedAt: "",
    },
    {
      id: "CHG-003",
      dailyFinanceId: "FIN-002",
      financeDate: todayIso(),
      buyerId: "BYR-SHANIA",
      buyerNameSnapshot: "Shania",
      changeAmount: 2000,
      status: "belum",
      settledAt: "",
      settledByUserId: "",
      settledByName: "",
      notes: "",
      createdByUserId: users[1].id,
      createdByName: users[1].fullName,
      createdAt,
      updatedAt: createdAt,
      deletedAt: "",
    },
  ];

  const supplierPayouts = [
    {
      id: "PAY-001",
      supplierId: "SUP-KLATIF",
      supplierNameSnapshot: "Kang Latif",
      periodStart: transactions[0].transactionDate,
      periodEnd: transactions[0].transactionDate,
      dueDate: transactions[0].payoutDueDate,
      transactionCount: 1,
      totalGrossSales: transactions[0].grossSales,
      totalProfit: transactions[0].profitAmount,
      totalCommission: transactions[0].commissionAmount,
      totalSupplierNetAmount: transactions[0].supplierNetAmount,
      status: "paid",
      paidAt: shiftLocalDate(-6),
      paidByUserId: users[0].id,
      paidByName: users[0].fullName,
      notes: "Contoh payout lunas.",
      createdAt,
      updatedAt: createdAt,
    },
  ];

  return {
    users,
    suppliers,
    transactions,
    supplierPayouts,
    savings,
    buyers,
    dailyFinance,
    changeEntries,
    sessions: [],
  };
}

function normalizeMockState(state) {
  const nextState = clone(state);

  nextState.suppliers = (nextState.suppliers ?? []).map((item) => normalizeSupplierRecord(item));
  nextState.transactions = (nextState.transactions ?? []).map((item) => {
    const supplier = getSupplierById(nextState, item.supplierId) ?? normalizeSupplierRecord({
      id: item.supplierId || "",
      supplierName: item.supplierName || "Tanpa nama pemasok",
      commissionRate: item.commissionRate ?? 10,
      commissionBaseType: item.commissionBaseType,
      payoutTermDays: item.payoutTermDays ?? 0,
      isActive: true,
    });
    const metrics = calculateTransactionMetrics({
      quantity: item.quantity,
      remainingQuantity: item.remainingQuantity,
      unitPrice: item.unitPrice,
      costPrice: item.costPrice ?? 0,
      commissionRate: item.commissionRate ?? supplier.commissionRate,
      commissionBaseType: item.commissionBaseType ?? supplier.commissionBaseType,
      payoutTermDays: item.payoutTermDays ?? supplier.payoutTermDays,
      transactionDate: item.transactionDate,
    });

    return {
      ...item,
      supplierId: item.supplierId || supplier.id,
      supplierName: item.supplierName || supplier.supplierName,
      soldQuantity: item.soldQuantity ?? metrics.soldQuantity,
      costPrice: item.costPrice ?? metrics.costPrice,
      grossSales: item.grossSales ?? metrics.grossSales,
      totalValue: item.totalValue ?? metrics.totalValue,
      profitAmount: item.profitAmount ?? metrics.profitAmount,
      commissionRate: item.commissionRate ?? metrics.commissionRate,
      commissionBaseType: normalizeCommissionBaseType(item.commissionBaseType ?? metrics.commissionBaseType),
      commissionAmount: item.commissionAmount ?? metrics.commissionAmount,
      supplierNetAmount: item.supplierNetAmount ?? metrics.supplierNetAmount,
      payoutTermDays: item.payoutTermDays ?? metrics.payoutTermDays,
      payoutDueDate: item.payoutDueDate ?? metrics.payoutDueDate,
      supplierPayoutId: item.supplierPayoutId ?? "",
      deletedAt: item.deletedAt ?? "",
    };
  });
  nextState.supplierPayouts = sortSupplierPayoutHistory(nextState.supplierPayouts ?? []);
  nextState.sessions = nextState.sessions ?? [];
  return nextState;
}

function loadMockState() {
  const existing = storage.getJson(APP_CONFIG.STORAGE_KEYS.mockDb);
  if (existing) {
    const normalized = normalizeMockState(existing);
    storage.setJson(APP_CONFIG.STORAGE_KEYS.mockDb, normalized);
    return normalized;
  }

  const seeded = seedMockState();
  storage.setJson(APP_CONFIG.STORAGE_KEYS.mockDb, seeded);
  return seeded;
}

function saveMockState(state) {
  storage.setJson(APP_CONFIG.STORAGE_KEYS.mockDb, state);
}

function requireMockSession(state, token) {
  const session = state.sessions.find((item) => item.token === token && !item.revokedAt);
  if (!session) throw new Error("Sesi tidak ditemukan.");
  if (new Date(session.expiresAt).getTime() < Date.now()) throw new Error("Sesi sudah kedaluwarsa.");

  const user = state.users.find((item) => item.id === session.userId);
  if (!user || user.status !== "aktif") throw new Error("User sesi tidak aktif.");

  return { session, user };
}

function getBuyerById(state, buyerId) {
  return state.buyers.find((item) => item.id === buyerId) ?? null;
}

function getDailyFinanceById(state, id) {
  return state.dailyFinance.find((item) => item.id === id && !item.deletedAt) ?? null;
}

function getChangeEntriesByFinanceId(state, financeId) {
  return state.changeEntries.filter((item) => !item.deletedAt && item.dailyFinanceId === financeId);
}

function ensureDailyFinanceAccess(record, user) {
  if (!record) throw new Error("Data keuangan harian tidak ditemukan.");
  if (user.role !== "admin" && record.createdByUserId !== user.id) {
    throw new Error("Data keuangan harian ini bukan milik Anda.");
  }
}

function ensureChangeEntryAccess(record, user) {
  if (!record || record.deletedAt) throw new Error("Data kembalian tidak ditemukan.");
  if (user.role !== "admin" && record.createdByUserId !== user.id) {
    throw new Error("Data kembalian ini bukan milik Anda.");
  }
}

function normalizeImportedBuyerRows(rows) {
  if (!rows?.length) {
    throw new Error("Data CSV kosong. Pastikan file berisi minimal satu baris pembeli.");
  }

  const seenKeys = new Set();

  return rows.map((row, index) => {
    const rowLabel = `Baris ${index + 2}`;
    const buyerName = String(
      row.nama_pembeli ?? row.buyerName ?? row.buyer_name ?? row.name ?? "",
    ).trim();
    const classOrCategory = String(
      row["kelas/kategori"] ?? row.kelas ?? row.kategori ?? row.classOrCategory ?? row.class_or_category ?? "",
    ).trim();
    const rawOpeningBalance = row.saldo_awal ?? row.openingBalance ?? row.opening_balance;

    if (!buyerName) {
      throw new Error(`${rowLabel}: nama_pembeli wajib diisi.`);
    }

    if (!classOrCategory) {
      throw new Error(`${rowLabel}: kelas/kategori wajib diisi.`);
    }

    const openingBalance = assertNonNegativeNumber(rawOpeningBalance, `${rowLabel} saldo_awal`);
    const matchKey = normalizeBuyerKey(buyerName, classOrCategory);

    if (seenKeys.has(matchKey)) {
      throw new Error(`${rowLabel}: kombinasi nama_pembeli dan kelas/kategori duplikat di file CSV.`);
    }
    seenKeys.add(matchKey);

    return {
      buyerName,
      classOrCategory,
      openingBalance,
      matchKey,
    };
  });
}

function normalizeChangeEntriesPayload(state, incomingItems, existingEntries = []) {
  const existingById = new Map(existingEntries.map((item) => [item.id, item]));
  const seenBuyerIds = new Set();

  return (incomingItems ?? []).map((item, index) => {
    const rowLabel = `Baris kembalian ${index + 1}`;
    const existing = item.id ? existingById.get(item.id) : null;
    if (item.id && !existing) {
      throw new Error(`${rowLabel} tidak ditemukan di catatan lama.`);
    }

    if (!item.buyerId) {
      throw new Error(`${rowLabel} wajib memilih pembeli.`);
    }

    if (seenBuyerIds.has(item.buyerId)) {
      throw new Error(`${rowLabel} duplikat pembeli dalam satu catatan.`);
    }
    seenBuyerIds.add(item.buyerId);

    const buyer = getBuyerById(state, item.buyerId);
    if (!buyer) {
      throw new Error(`${rowLabel} merujuk pembeli yang tidak ditemukan.`);
    }
    if (buyer.status !== "aktif" && !(existing && existing.buyerId === item.buyerId)) {
      throw new Error(`${rowLabel} merujuk pembeli yang sudah nonaktif.`);
    }

    const changeAmount = assertNonNegativeNumber(item.changeAmount, `${rowLabel} nominal`);
    if (changeAmount <= 0) {
      throw new Error(`${rowLabel} nominal harus lebih dari 0.`);
    }

    return {
      id: item.id ?? "",
      existing,
      buyer,
      changeAmount,
      notes: String(item.notes ?? "").trim(),
    };
  });
}

async function mockRequest(action, payload = {}, token = "") {
  const state = loadMockState();

  switch (action) {
    case "login": {
      const email = normalizeText(payload.email);
      const pinHash = await sha256Hex(String(payload.pin ?? ""));
      const user = state.users.find(
        (item) => normalizeText(item.email) === email && item.pinHash === pinHash && item.status === "aktif",
      );
      if (!user) {
        throw new Error("Email atau PIN tidak cocok.");
      }

      const session = {
        token: createId("TKN"),
        userId: user.id,
        expiresAt: plusHours(8),
        createdAt: nowIso(),
      };
      state.sessions.push(session);
      saveMockState(state);
      return {
        success: true,
        message: "Login berhasil.",
        data: { token: session.token, expiresAt: session.expiresAt, user: safeUser(user), useMockApi: true },
      };
    }

    case "logout": {
      const activeSession = state.sessions.find((item) => item.token === token && !item.revokedAt);
      if (activeSession) activeSession.revokedAt = nowIso();
      saveMockState(state);
      return { success: true, message: "Logout berhasil.", data: null };
    }

    case "getCurrentUser": {
      const { session, user } = requireMockSession(state, token);
      return {
        success: true,
        message: "Session valid.",
        data: { user: safeUser(user), expiresAt: session.expiresAt, useMockApi: true },
      };
    }

    case "listUsers": {
      const { user } = requireMockSession(state, token);
      ensureAdmin(user);
      return {
        success: true,
        message: "Daftar user berhasil diambil.",
        data: state.users.map((item) => safeUser(item)).sort((left, right) => left.fullName.localeCompare(right.fullName)),
      };
    }

    case "saveUser": {
      const { user } = requireMockSession(state, token);
      ensureAdmin(user);

      const now = nowIso();
      const existing = payload.id ? state.users.find((item) => item.id === payload.id) : null;
      const email = String(payload.email ?? "").trim();
      const duplicate = state.users.find(
        (item) => normalizeText(item.email) === normalizeText(email) && item.id !== payload.id,
      );
      if (duplicate) throw new Error("Email user sudah dipakai.");

      const record = existing ?? {
        id: createId("USR"),
        createdAt: now,
        pinHash: DEV_PIN_HASH,
      };

      record.fullName = String(payload.fullName ?? "").trim();
      record.nickname = String(payload.nickname ?? "").trim();
      record.email = email;
      record.role = payload.role === "admin" ? "admin" : "petugas";
      record.status = payload.status === "nonaktif" ? "nonaktif" : "aktif";
      record.classGroup = String(payload.classGroup ?? "").trim();
      record.notes = String(payload.notes ?? "").trim();
      record.updatedAt = now;

      if (payload.pin) {
        record.pinHash = await sha256Hex(payload.pin);
      }

      if (!record.fullName || !record.nickname || !record.email) {
        throw new Error("Nama, panggilan, dan email wajib diisi.");
      }

      if (!existing) state.users.push(record);
      saveMockState(state);

      return {
        success: true,
        message: "User berhasil disimpan.",
        data: safeUser(record),
      };
    }

    case "listBuyers": {
      requireMockSession(state, token);
      return {
        success: true,
        message: "Daftar pembeli berhasil diambil.",
        data: filterBuyers(state.buyers, payload),
      };
    }

    case "importBuyers": {
      const { user } = requireMockSession(state, token);
      ensureAdmin(user);

      const rows = normalizeImportedBuyerRows(payload.rows);
      const now = nowIso();
      const existingByKey = new Map(state.buyers.map((item) => [normalizeBuyerKey(item.buyerName, item.classOrCategory), item]));
      const importedKeys = new Set();
      const result = {
        inserted: 0,
        updated: 0,
        archived: 0,
        totalRows: rows.length,
        lastImportedAt: now,
      };

      rows.forEach((row) => {
        const existing = existingByKey.get(row.matchKey);
        const buyer = existing ?? {
          id: createId("BYR"),
          createdAt: now,
        };

        buyer.buyerName = row.buyerName;
        buyer.classOrCategory = row.classOrCategory;
        buyer.openingBalance = row.openingBalance;
        buyer.currentBalance = row.openingBalance;
        buyer.status = "aktif";
        buyer.updatedAt = now;
        buyer.lastImportedAt = now;

        if (!existing) {
          state.buyers.push(buyer);
          result.inserted += 1;
        } else {
          result.updated += 1;
        }

        buildSavingsSeed(state, buyer, user, now);
        importedKeys.add(row.matchKey);
      });

      state.buyers.forEach((buyer) => {
        const matchKey = normalizeBuyerKey(buyer.buyerName, buyer.classOrCategory);
        if (importedKeys.has(matchKey)) return;
        if (buyer.status === "nonaktif") return;
        buyer.status = "nonaktif";
        buyer.updatedAt = now;
        result.archived += 1;
      });

      saveMockState(state);
      return {
        success: true,
        message: "Import CSV pembeli berhasil diproses.",
        data: result,
      };
    }

    case "listSuppliers": {
      const { user } = requireMockSession(state, token);
      const includeInactive = Boolean(payload.includeInactive) && user.role === "admin";
      return {
        success: true,
        message: "Daftar pemasok berhasil diambil.",
        data: state.suppliers
          .filter((item) => includeInactive || item.isActive !== false)
          .map((item) => normalizeSupplierRecord(item))
          .sort((left, right) => left.supplierName.localeCompare(right.supplierName)),
      };
    }

    case "saveSupplier": {
      const { user } = requireMockSession(state, token);
      ensureAdmin(user);

      const now = nowIso();
      const existing = payload.id ? state.suppliers.find((item) => item.id === payload.id) : null;
      const supplierName = String(payload.supplierName ?? "").trim();
      if (!supplierName) {
        throw new Error("Nama pemasok wajib diisi.");
      }

      const duplicate = state.suppliers.find(
        (item) => normalizeText(item.supplierName) === normalizeText(supplierName) && item.id !== payload.id,
      );
      if (duplicate) {
        throw new Error("Nama pemasok sudah dipakai.");
      }

      const record = existing ?? {
        id: createId("SUP"),
        createdAt: now,
      };

      Object.assign(record, normalizeSupplierRecord({
        ...record,
        supplierName,
        contactName: String(payload.contactName ?? "").trim(),
        contactPhone: String(payload.contactPhone ?? "").trim(),
        commissionRate: assertNonNegativeNumber(payload.commissionRate, "Persentase potongan"),
        commissionBaseType: payload.commissionBaseType,
        payoutTermDays: assertNonNegativeNumber(payload.payoutTermDays, "Termin pembayaran"),
        notes: String(payload.notes ?? "").trim(),
        isActive: payload.isActive === false || payload.isActive === "false" ? false : true,
        updatedAt: now,
      }));

      if (!existing) {
        state.suppliers.push(record);
      }

      saveMockState(state);
      return {
        success: true,
        message: "Data pemasok berhasil disimpan.",
        data: clone(record),
      };
    }

    case "listTransactions": {
      const { user } = requireMockSession(state, token);
      const baseItems = user.role === "admin"
        ? state.transactions.filter((item) => !item.deletedAt)
        : state.transactions.filter((item) => !item.deletedAt && item.inputByUserId === user.id);
      return {
        success: true,
        message: "Daftar transaksi berhasil diambil.",
        data: sortTransactions(filterTransactions(baseItems, payload)),
      };
    }

    case "saveTransaction": {
      const { user } = requireMockSession(state, token);
      const now = nowIso();
      const existing = payload.id ? state.transactions.find((item) => item.id === payload.id) : null;
      if (existing && user.role !== "admin" && existing.inputByUserId !== user.id) {
        throw new Error("Transaksi ini bukan milik Anda.");
      }
      ensureTransactionCanMutate(existing);

      const supplier = getSupplierById(state, payload.supplierId);
      if (!supplier) {
        throw new Error("Pemasok tidak ditemukan.");
      }
      if (supplier.isActive === false && !existing) {
        throw new Error("Pemasok nonaktif tidak bisa dipakai untuk transaksi baru.");
      }

      const record = buildTransactionRecord({
        existing,
        payload,
        user,
        supplier,
        timestamp: now,
      });
      record.deletedAt = "";

      if (!existing) state.transactions.push(record);
      saveMockState(state);

      return {
        success: true,
        message: "Transaksi berhasil disimpan.",
        data: clone(record),
      };
    }

    case "deleteTransaction": {
      const { user } = requireMockSession(state, token);
      const record = state.transactions.find((item) => item.id === payload.id);
      if (!record || record.deletedAt) throw new Error("Transaksi tidak ditemukan.");
      if (user.role !== "admin" && record.inputByUserId !== user.id) {
        throw new Error("Transaksi ini bukan milik Anda.");
      }
      ensureTransactionCanMutate(record);

      record.deletedAt = nowIso();
      record.updatedAt = record.deletedAt;
      saveMockState(state);
      return { success: true, message: "Transaksi dihapus.", data: clone(record) };
    }

    case "listSavings": {
      requireMockSession(state, token);
      return {
        success: true,
        message: "Data simpanan berhasil diambil.",
        data: [...state.savings].sort((left, right) => left.studentName.localeCompare(right.studentName)),
      };
    }

    case "listDailyFinance": {
      const { user } = requireMockSession(state, token);
      return {
        success: true,
        message: "Data keuangan harian berhasil diambil.",
        data: filterDailyFinance(state, user, payload),
      };
    }

    case "getDailyFinanceDetail": {
      const { user } = requireMockSession(state, token);
      const finance = getDailyFinanceById(state, payload.id);
      ensureDailyFinanceAccess(finance, user);

      const changeEntries = sortChangeEntries(getChangeEntriesByFinanceId(state, finance.id));
      return {
        success: true,
        message: "Detail keuangan harian berhasil diambil.",
        data: {
          finance: computeDailyFinanceSummary(finance, changeEntries),
          changeEntries: clone(changeEntries),
        },
      };
    }

    case "saveDailyFinance": {
      const { user } = requireMockSession(state, token);
      const now = nowIso();
      const existingFinance = payload.id ? getDailyFinanceById(state, payload.id) : null;
      if (existingFinance) {
        ensureDailyFinanceAccess(existingFinance, user);
      }

      if (!payload.financeDate) {
        throw new Error("Tanggal keuangan harian wajib diisi.");
      }

      const grossAmount = assertNonNegativeNumber(payload.grossAmount, "Total uang masuk");
      const changeTotal = assertNonNegativeNumber(payload.changeTotal, "Total uang kembalian");
      const existingEntries = existingFinance ? getChangeEntriesByFinanceId(state, existingFinance.id) : [];
      const normalizedEntries = normalizeChangeEntriesPayload(state, payload.changeEntries, existingEntries);
      const sumChangeEntries = normalizedEntries.reduce((sum, item) => sum + item.changeAmount, 0);

      if (changeTotal !== sumChangeEntries) {
        throw new Error("Total uang kembalian harus sama dengan jumlah rincian kembalian.");
      }

      if (changeTotal > grossAmount) {
        throw new Error("Total uang kembalian tidak boleh melebihi total uang masuk.");
      }

      const incomingIds = new Set(normalizedEntries.filter((item) => item.id).map((item) => item.id));

      normalizedEntries.forEach((item) => {
        if (!item.existing || item.existing.status !== "selesai") return;
        if (item.existing.buyerId !== item.buyer.id || Number(item.existing.changeAmount) !== item.changeAmount) {
          throw new Error("Rincian kembalian yang sudah selesai tidak boleh diubah pembeli atau nominalnya.");
        }
      });

      existingEntries.forEach((entry) => {
        if (incomingIds.has(entry.id)) return;
        if (entry.status === "selesai") {
          throw new Error("Rincian kembalian yang sudah selesai tidak boleh dihapus dari catatan harian.");
        }
      });

      const finance = existingFinance ?? {
        id: createId("FIN"),
        createdAt: now,
        createdByUserId: user.id,
        createdByName: user.fullName,
        deletedAt: "",
      };

      finance.financeDate = payload.financeDate;
      finance.grossAmount = grossAmount;
      finance.changeTotal = changeTotal;
      finance.netAmount = grossAmount - changeTotal;
      finance.notes = String(payload.notes ?? "").trim();
      finance.updatedAt = now;
      finance.deletedAt = "";

      if (!existingFinance) {
        state.dailyFinance.push(finance);
      }

      normalizedEntries.forEach((item) => {
        const record = item.existing ?? {
          id: createId("CHG"),
          createdAt: now,
          createdByUserId: user.id,
          createdByName: user.fullName,
          status: "belum",
          settledAt: "",
          settledByUserId: "",
          settledByName: "",
          deletedAt: "",
        };

        record.dailyFinanceId = finance.id;
        record.financeDate = payload.financeDate;
        record.buyerId = item.buyer.id;
        record.buyerNameSnapshot = item.buyer.buyerName;
        record.changeAmount = item.changeAmount;
        record.notes = item.notes;
        record.updatedAt = now;
        record.deletedAt = "";

        if (!item.existing) {
          state.changeEntries.push(record);
        }
      });

      existingEntries.forEach((entry) => {
        if (incomingIds.has(entry.id)) return;
        entry.deletedAt = now;
        entry.updatedAt = now;
      });

      saveMockState(state);
      const changeEntries = sortChangeEntries(getChangeEntriesByFinanceId(state, finance.id));

      return {
        success: true,
        message: "Data keuangan harian berhasil disimpan.",
        data: {
          finance: computeDailyFinanceSummary(finance, changeEntries),
          changeEntries: clone(changeEntries),
        },
      };
    }

    case "deleteDailyFinance": {
      const { user } = requireMockSession(state, token);
      const finance = getDailyFinanceById(state, payload.id);
      ensureDailyFinanceAccess(finance, user);

      const changeEntries = getChangeEntriesByFinanceId(state, finance.id);
      if (changeEntries.some((item) => item.status === "selesai")) {
        throw new Error("Catatan harian dengan kembalian selesai tidak bisa dihapus. Ubah statusnya dulu bila memang perlu.");
      }

      const now = nowIso();
      finance.deletedAt = now;
      finance.updatedAt = now;
      changeEntries.forEach((item) => {
        item.deletedAt = now;
        item.updatedAt = now;
      });

      saveMockState(state);
      return {
        success: true,
        message: "Data keuangan harian berhasil dihapus.",
        data: clone(finance),
      };
    }

    case "listChangeEntries": {
      const { user } = requireMockSession(state, token);
      return {
        success: true,
        message: "Daftar buku kembalian berhasil diambil.",
        data: filterChangeEntries(state, user, payload),
      };
    }

    case "updateChangeEntryStatus": {
      const { user } = requireMockSession(state, token);
      const entry = state.changeEntries.find((item) => item.id === payload.id);
      ensureChangeEntryAccess(entry, user);

      if (!["belum", "selesai"].includes(payload.status)) {
        throw new Error("Status kembalian hanya boleh 'belum' atau 'selesai'.");
      }

      entry.status = payload.status;
      entry.updatedAt = nowIso();

      if (payload.status === "selesai") {
        entry.settledAt = entry.updatedAt;
        entry.settledByUserId = user.id;
        entry.settledByName = user.fullName;
      } else {
        entry.settledAt = "";
        entry.settledByUserId = "";
        entry.settledByName = "";
      }

      saveMockState(state);
      return {
        success: true,
        message: "Status kembalian berhasil diperbarui.",
        data: clone(entry),
      };
    }

    case "listSupplierPayouts": {
      const { user } = requireMockSession(state, token);
      ensureAdmin(user);

      const outstanding = groupOutstandingSupplierPayouts(state.transactions, todayIso());
      const history = sortSupplierPayoutHistory(state.supplierPayouts ?? []);

      return {
        success: true,
        message: "Data pembayaran pemasok berhasil diambil.",
        data: {
          summary: buildSupplierPayoutSummary(outstanding, history, todayIso()),
          outstanding,
          history: history.slice(0, 20),
        },
      };
    }

    case "settleSupplierPayout": {
      const { user } = requireMockSession(state, token);
      ensureAdmin(user);

      if (!payload.supplierId || !payload.dueDate) {
        throw new Error("Supplier dan jatuh tempo payout wajib diisi.");
      }

      const now = nowIso();
      const transactionsToSettle = state.transactions.filter((item) => (
        !item.deletedAt
        && !item.supplierPayoutId
        && item.supplierId === payload.supplierId
        && item.payoutDueDate === payload.dueDate
      ));

      if (!transactionsToSettle.length) {
        throw new Error("Tidak ada transaksi outstanding untuk payout ini.");
      }

      const grouped = groupOutstandingSupplierPayouts(transactionsToSettle, todayIso())[0];
      if (!grouped) {
        throw new Error("Gagal menyusun payout pemasok.");
      }

      const payoutRecord = {
        id: createId("PAY"),
        supplierId: grouped.supplierId,
        supplierNameSnapshot: grouped.supplierNameSnapshot,
        periodStart: grouped.periodStart,
        periodEnd: grouped.periodEnd,
        dueDate: grouped.dueDate,
        transactionCount: grouped.transactionCount,
        totalGrossSales: grouped.totalGrossSales,
        totalProfit: grouped.totalProfit,
        totalCommission: grouped.totalCommission,
        totalSupplierNetAmount: grouped.totalSupplierNetAmount,
        status: "paid",
        paidAt: now,
        paidByUserId: user.id,
        paidByName: user.fullName,
        notes: String(payload.notes ?? "").trim(),
        createdAt: now,
        updatedAt: now,
      };

      transactionsToSettle.forEach((item) => {
        item.supplierPayoutId = payoutRecord.id;
        item.updatedAt = now;
      });

      state.supplierPayouts = state.supplierPayouts ?? [];
      state.supplierPayouts.push(payoutRecord);
      saveMockState(state);

      return {
        success: true,
        message: "Pembayaran pemasok berhasil ditandai lunas.",
        data: {
          payout: clone(payoutRecord),
          settledTransactionCount: transactionsToSettle.length,
        },
      };
    }

    case "dashboardSummary": {
      const { user } = requireMockSession(state, token);
      const scopedTransactions = user.role === "admin"
        ? state.transactions.filter((item) => !item.deletedAt)
        : state.transactions.filter((item) => !item.deletedAt && item.inputByUserId === user.id);
      const scopedFinance = user.role === "admin"
        ? state.dailyFinance.filter((item) => !item.deletedAt)
        : state.dailyFinance.filter((item) => !item.deletedAt && item.createdByUserId === user.id);
      const scopedChangeEntries = user.role === "admin"
        ? state.changeEntries.filter((item) => !item.deletedAt)
        : state.changeEntries.filter((item) => !item.deletedAt && item.createdByUserId === user.id);

      const totalValue = scopedTransactions.reduce((sum, item) => sum + toNumber(item.totalValue, 0), 0);
      const totalProfit = scopedTransactions.reduce((sum, item) => sum + toNumber(item.profitAmount, 0), 0);
      const totalCommission = scopedTransactions.reduce((sum, item) => sum + toNumber(item.commissionAmount, 0), 0);
      const totalItems = scopedTransactions.reduce((sum, item) => sum + toNumber(item.quantity, 0), 0);
      const totalRemaining = scopedTransactions.reduce((sum, item) => sum + toNumber(item.remainingQuantity, 0), 0);
      const activeSuppliers = new Set(scopedTransactions.map((item) => item.supplierName)).size;
      const pendingChangeEntries = scopedChangeEntries.filter((item) => item.status !== "selesai");
      const latestDailyFinance = sortDailyFinance(scopedFinance)[0] ?? null;
      const todayTransactions = scopedTransactions.filter((item) => item.transactionDate === todayIso());
      const outstandingPayouts = user.role === "admin"
        ? groupOutstandingSupplierPayouts(scopedTransactions, todayIso())
        : [];
      const duePayouts = outstandingPayouts.filter((item) => item.dueDate && item.dueDate <= todayIso());
      const overduePayouts = outstandingPayouts.filter((item) => item.dueStatus === "overdue");

      return {
        success: true,
        message: "Ringkasan dashboard berhasil diambil.",
        data: {
          scope: user.role,
          transactionCount: scopedTransactions.length,
          totalValue,
          totalGrossSales: totalValue,
          totalProfit,
          totalCommission,
          totalItems,
          totalRemaining,
          activeSuppliers,
          todayGrossSales: todayTransactions.reduce((sum, item) => sum + toNumber(item.grossSales, item.totalValue), 0),
          todayCommission: todayTransactions.reduce((sum, item) => sum + toNumber(item.commissionAmount, 0), 0),
          todayTransactionCount: todayTransactions.length,
          outstandingSupplierDebtAmount: outstandingPayouts.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
          dueSupplierDebtAmount: duePayouts.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
          overdueSupplierPayoutCount: overduePayouts.length,
          overdueSupplierPayoutAmount: overduePayouts.reduce((sum, item) => sum + toNumber(item.totalSupplierNetAmount, 0), 0),
          userCount: state.users.filter((item) => item.status === "aktif").length,
          activeBuyerCount: state.buyers.filter((item) => item.status === "aktif").length,
          savingsCount: state.savings.length,
          pendingChangeCount: pendingChangeEntries.length,
          pendingChangeAmount: pendingChangeEntries.reduce((sum, item) => sum + toNumber(item.changeAmount, 0), 0),
          latestDailyFinance: latestDailyFinance ? clone(latestDailyFinance) : null,
          recentTransactions: sortTransactions(scopedTransactions).slice(0, 5),
          outstandingPayoutBuckets: summarizePayoutBuckets(outstandingPayouts),
        },
      };
    }

    default:
      throw new Error(`Action "${action}" belum didukung.`);
  }
}

async function realRequest(action, payload = {}, token = "") {
  if (action === "health") {
    if (!APP_CONFIG.API_BASE_URL) throw new Error("API_BASE_URL belum diisi.");
    const response = await fetch(`${APP_CONFIG.API_BASE_URL}?action=health`);
    return response.json();
  }

  if (!APP_CONFIG.API_BASE_URL) {
    throw new Error("API_BASE_URL belum diisi.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), APP_CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(APP_CONFIG.API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({ action, token, payload }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Permintaan API gagal.");
    }
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function request(action, payload = {}, token = "") {
  const handler = APP_CONFIG.USE_MOCK_API ? mockRequest : realRequest;
  return handler(action, payload, token);
}

export const api = {
  request,
  health() {
    return request("health");
  },
  login(email, pin) {
    return request("login", { email, pin });
  },
  logout(token) {
    return request("logout", {}, token);
  },
  getCurrentUser(token) {
    return request("getCurrentUser", {}, token);
  },
  listUsers(token) {
    return request("listUsers", {}, token);
  },
  saveUser(payload, token) {
    return request("saveUser", payload, token);
  },
  listBuyers(payload, token) {
    return request("listBuyers", payload, token);
  },
  importBuyers(rows, token) {
    return request("importBuyers", { rows }, token);
  },
  listTransactions(payload, token) {
    return request("listTransactions", payload, token);
  },
  saveTransaction(payload, token) {
    return request("saveTransaction", payload, token);
  },
  deleteTransaction(id, token) {
    return request("deleteTransaction", { id }, token);
  },
  listSavings(token) {
    return request("listSavings", {}, token);
  },
  listDailyFinance(payload, token) {
    return request("listDailyFinance", payload, token);
  },
  getDailyFinanceDetail(id, token) {
    return request("getDailyFinanceDetail", { id }, token);
  },
  saveDailyFinance(payload, token) {
    return request("saveDailyFinance", payload, token);
  },
  deleteDailyFinance(id, token) {
    return request("deleteDailyFinance", { id }, token);
  },
  listChangeEntries(payload, token) {
    return request("listChangeEntries", payload, token);
  },
  updateChangeEntryStatus(id, status, token) {
    return request("updateChangeEntryStatus", { id, status }, token);
  },
  dashboardSummary(token) {
    return request("dashboardSummary", {}, token);
  },
  listSuppliers(payload, token) {
    if (typeof payload === "string" && token === undefined) {
      return request("listSuppliers", {}, payload);
    }
    return request("listSuppliers", payload ?? {}, token);
  },
  saveSupplier(payload, token) {
    return request("saveSupplier", payload, token);
  },
  listSupplierPayouts(token) {
    return request("listSupplierPayouts", {}, token);
  },
  settleSupplierPayout(payload, token) {
    return request("settleSupplierPayout", payload, token);
  },
};
