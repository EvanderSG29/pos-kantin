import { APP_CONFIG } from "./config.js";
import { storage } from "./storage.js";
import { clone, createId, includesText, normalizeText, sha256Hex, toNumber } from "./utils.js";

const DEV_PIN_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";

function nowIso() {
  return new Date().toISOString();
}

function plusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function safeUser(user) {
  const { pinHash, ...rest } = user;
  return rest;
}

function seedMockState() {
  const createdAt = nowIso();
  return {
    users: [
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
      {
        id: "USR-NURFI",
        fullName: "Muhammad Nurfi Rasya",
        nickname: "Nurfi",
        email: "muhammadnurfirasya470@gmail.com",
        role: "petugas",
        status: "aktif",
        classGroup: "XI TJKT",
        notes: "Petugas referensi",
        pinHash: DEV_PIN_HASH,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "USR-QUEENZA",
        fullName: "Queenza Adilla Rahimah Fatmawati",
        nickname: "Queenza",
        email: "queenzaadilla3@gmail.com",
        role: "petugas",
        status: "aktif",
        classGroup: "X PMN",
        notes: "Petugas referensi",
        pinHash: DEV_PIN_HASH,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    suppliers: [
      { id: "SUP-KLATIF", supplierName: "Kang Latif", contactName: "", contactPhone: "", notes: "", isActive: true, createdAt, updatedAt: createdAt },
      { id: "SUP-UNI", supplierName: "Uni", contactName: "", contactPhone: "", notes: "", isActive: true, createdAt, updatedAt: createdAt },
      { id: "SUP-BUEVA", supplierName: "Bu Eva", contactName: "", contactPhone: "", notes: "", isActive: true, createdAt, updatedAt: createdAt },
    ],
    transactions: [
      {
        id: "TRX-001",
        transactionDate: "2026-02-23",
        inputByUserId: "USR-EVANDER",
        inputByName: "Evander Smid Gidion",
        supplierId: "SUP-KLATIF",
        supplierName: "Kang Latif",
        itemName: "Cirawang",
        unitName: "3 pcs (1 porsi)",
        quantity: 20,
        remainingQuantity: 2,
        unitPrice: 1000,
        totalValue: 20000,
        notes: "Contoh transaksi awal",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "TRX-002",
        transactionDate: "2026-02-23",
        inputByUserId: "USR-ARMAN",
        inputByName: "Arman Rifqi Hafuza",
        supplierId: "SUP-UNI",
        supplierName: "Uni",
        itemName: "Otak-otak",
        unitName: "1 pcs",
        quantity: 30,
        remainingQuantity: 3,
        unitPrice: 1000,
        totalValue: 30000,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "TRX-003",
        transactionDate: "2026-02-24",
        inputByUserId: "USR-NURFI",
        inputByName: "Muhammad Nurfi Rasya",
        supplierId: "SUP-UNI",
        supplierName: "Uni",
        itemName: "Burger",
        unitName: "1 pcs",
        quantity: 5,
        remainingQuantity: 0,
        unitPrice: 8000,
        totalValue: 40000,
        notes: "Contoh transaksi burger",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    savings: [
      {
        id: "SVG-001",
        studentId: "25-023",
        studentName: "Queenza Adilla Rahimah Fatmawati",
        className: "X",
        gender: "P",
        groupName: "C4",
        depositAmount: 3000,
        changeBalance: 3000,
        recordedAt: "2026-02-23",
        recordedByUserId: "USR-EVANDER",
        recordedByName: "Evander Smid Gidion",
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "SVG-002",
        studentId: "25-015",
        studentName: "Shania",
        className: "X",
        gender: "P",
        groupName: "C1",
        depositAmount: 500,
        changeBalance: 500,
        recordedAt: "2026-02-23",
        recordedByUserId: "USR-ARMAN",
        recordedByName: "Arman Rifqi Hafuza",
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    sessions: [],
  };
}

function loadMockState() {
  const existing = storage.getJson(APP_CONFIG.STORAGE_KEYS.mockDb);
  if (existing) return existing;

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

function ensureAdmin(user) {
  if (user.role !== "admin") {
    throw new Error("Aksi ini hanya untuk admin.");
  }
}

function sortTransactions(items) {
  return [...items].sort((left, right) => {
    const dateDelta = new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
    if (dateDelta !== 0) return dateDelta;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function filterTransactions(items, payload = {}) {
  return items.filter((item) => {
    const matchDate = payload.transactionDate ? item.transactionDate === payload.transactionDate : true;
    const matchStart = payload.startDate ? item.transactionDate >= payload.startDate : true;
    const matchEnd = payload.endDate ? item.transactionDate <= payload.endDate : true;
    const matchText = includesText(
      [item.itemName, item.supplierName, item.inputByName, item.notes],
      payload.query ?? payload.search ?? "",
    );
    return matchDate && matchStart && matchEnd && matchText;
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

    case "listSuppliers": {
      requireMockSession(state, token);
      return {
        success: true,
        message: "Daftar pemasok berhasil diambil.",
        data: state.suppliers.filter((item) => item.isActive !== false),
      };
    }

    case "listTransactions": {
      const { user } = requireMockSession(state, token);
      const baseItems = user.role === "admin"
        ? state.transactions
        : state.transactions.filter((item) => item.inputByUserId === user.id);
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

      const supplier = state.suppliers.find((item) => item.id === payload.supplierId);
      const supplierName = String(payload.supplierName || supplier?.supplierName || "").trim();
      const quantity = toNumber(payload.quantity, 0);
      const remainingQuantity = toNumber(payload.remainingQuantity, 0);
      const unitPrice = toNumber(payload.unitPrice, 0);

      if (!payload.transactionDate || !payload.itemName || !payload.unitName || !supplierName) {
        throw new Error("Tanggal, pemasok, makanan, dan satuan wajib diisi.");
      }

      const record = existing ?? {
        id: createId("TRX"),
        createdAt: now,
        inputByUserId: user.id,
        inputByName: user.fullName,
      };

      record.transactionDate = payload.transactionDate;
      record.supplierId = payload.supplierId || "";
      record.supplierName = supplierName;
      record.itemName = String(payload.itemName).trim();
      record.unitName = String(payload.unitName).trim();
      record.quantity = quantity;
      record.remainingQuantity = remainingQuantity;
      record.unitPrice = unitPrice;
      record.totalValue = quantity * unitPrice;
      record.notes = String(payload.notes ?? "").trim();
      record.updatedAt = now;

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
      const index = state.transactions.findIndex((item) => item.id === payload.id);
      if (index < 0) throw new Error("Transaksi tidak ditemukan.");
      if (user.role !== "admin" && state.transactions[index].inputByUserId !== user.id) {
        throw new Error("Transaksi ini bukan milik Anda.");
      }

      const [deleted] = state.transactions.splice(index, 1);
      saveMockState(state);
      return { success: true, message: "Transaksi dihapus.", data: clone(deleted) };
    }

    case "listSavings": {
      requireMockSession(state, token);
      return {
        success: true,
        message: "Data simpanan berhasil diambil.",
        data: [...state.savings].sort((left, right) => left.studentName.localeCompare(right.studentName)),
      };
    }

    case "dashboardSummary": {
      const { user } = requireMockSession(state, token);
      const scopedTransactions = user.role === "admin"
        ? state.transactions
        : state.transactions.filter((item) => item.inputByUserId === user.id);

      const totalValue = scopedTransactions.reduce((sum, item) => sum + toNumber(item.totalValue, 0), 0);
      const totalItems = scopedTransactions.reduce((sum, item) => sum + toNumber(item.quantity, 0), 0);
      const totalRemaining = scopedTransactions.reduce((sum, item) => sum + toNumber(item.remainingQuantity, 0), 0);
      const activeSuppliers = new Set(scopedTransactions.map((item) => item.supplierName)).size;

      return {
        success: true,
        message: "Ringkasan dashboard berhasil diambil.",
        data: {
          scope: user.role,
          transactionCount: scopedTransactions.length,
          totalValue,
          totalItems,
          totalRemaining,
          activeSuppliers,
          userCount: state.users.filter((item) => item.status === "aktif").length,
          savingsCount: state.savings.length,
          recentTransactions: sortTransactions(scopedTransactions).slice(0, 5),
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
        "Content-Type": "application/json",
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
  dashboardSummary(token) {
    return request("dashboardSummary", {}, token);
  },
  listSuppliers(token) {
    return request("listSuppliers", {}, token);
  },
};

