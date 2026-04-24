const assert = require("node:assert/strict");
const { mkdtemp, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");

const electron = require("electron");
const Database = require("better-sqlite3");
const { createUsersRepo } = require("../electron/repositories/users-repo.cjs");
const { createSuppliersRepo } = require("../electron/repositories/suppliers-repo.cjs");
const { createTransactionsRepo } = require("../electron/repositories/transactions-repo.cjs");
const { createSyncQueueRepo } = require("../electron/repositories/sync-queue-repo.cjs");
const { createAuthService } = require("../electron/services/auth-service.cjs");

async function createTestDb() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "pos-kantin-electron-"));
  const db = new Database(path.join(tempDir, "test.sqlite"));

  const migrationOne = await readFile(path.join(__dirname, "../electron/db/migrations/001_init.sql"), "utf8");
  const migrationTwo = await readFile(path.join(__dirname, "../electron/db/migrations/002_indexes.sql"), "utf8");
  db.exec(migrationOne);
  db.exec(migrationTwo);

  return db;
}

async function main() {
  assert.ok(electron.app, "Test Electron harus dijalankan lewat runtime Electron, bukan mode Node.");

  const db = await createTestDb();
  const usersRepo = createUsersRepo(db);
  const suppliersRepo = createSuppliersRepo(db);
  const transactionsRepo = createTransactionsRepo(db, suppliersRepo);
  const syncQueueRepo = createSyncQueueRepo(db);

  const admin = {
    id: "USR-ADMIN",
    fullName: "Evander Admin",
    role: "admin",
  };

  const petugas = {
    id: "USR-PETUGAS",
    fullName: "Nadia Petugas",
    role: "petugas",
  };

  {
    const supplier = suppliersRepo.saveSupplier({
      supplierName: "Bakso Pak Danu",
      contactName: "Pak Danu",
      contactPhone: "08123",
      commissionRate: 10,
      commissionBaseType: "revenue",
      payoutTermDays: 2,
      isActive: true,
      notes: "Tes lokal",
    }, admin);

    assert.equal(supplier.supplierName, "Bakso Pak Danu");
    assert.equal(suppliersRepo.list({ includeInactive: true }).items.length, 1);
  }

  let savedTransaction = null;

  {
    const supplier = suppliersRepo.list({ includeInactive: true }).items[0];
    savedTransaction = transactionsRepo.saveTransaction({
      transactionDate: "2026-04-24",
      supplierId: supplier.id,
      itemName: "Bakso jumbo",
      unitName: "mangkok",
      quantity: 12,
      remainingQuantity: 3,
      costPrice: 5000,
      unitPrice: 8000,
      notes: "Shift pagi",
    }, petugas);

    assert.equal(savedTransaction.soldQuantity, 9);
    assert.equal(savedTransaction.grossSales, 72000);
    assert.equal(savedTransaction.commissionAmount, 7200);
  }

  {
    const forPetugas = transactionsRepo.listTransactions({}, petugas);
    const forAdmin = transactionsRepo.listTransactions({}, admin);

    assert.equal(forPetugas.items.length, 1);
    assert.equal(forAdmin.items.length, 1);
    assert.equal(forPetugas.items[0].inputByUserId, petugas.id);
  }

  {
    const skipped = transactionsRepo.applyCloudRecord({
      ...savedTransaction,
      itemName: "Nama dari cloud",
    });

    assert.equal(skipped.skipped, true);
  }

  {
    syncQueueRepo.enqueueChange({
      entityType: "transactions",
      entityId: savedTransaction.id,
      operation: "upsert",
      payload: { id: savedTransaction.id, itemName: "Versi 1" },
    });
    syncQueueRepo.enqueueChange({
      entityType: "transactions",
      entityId: savedTransaction.id,
      operation: "upsert",
      payload: { id: savedTransaction.id, itemName: "Versi 2" },
    });

    const dueRows = syncQueueRepo.listDue(new Date().toISOString());
    assert.equal(dueRows.length, 1);
    assert.equal(dueRows[0].payload.itemName, "Versi 2");
  }

  {
    const deleted = transactionsRepo.deleteTransaction(savedTransaction.id, petugas);
    assert.ok(deleted.deletedAt);
  }

  {
    const cloudUser = {
      id: "USR-OFFLINE-AUTH",
      fullName: "Raka Offline",
      nickname: "Raka",
      email: "raka@example.test",
      role: "petugas",
      status: "aktif",
      classGroup: "XI",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    let shouldFailLogin = false;
    const authService = createAuthService({
      db,
      gasClient: {
        async request(action) {
          assert.equal(action, "login");
          if (shouldFailLogin) {
            throw new Error("GAS offline");
          }

          return {
            data: {
              user: cloudUser,
              token: "cloud-token-reusable",
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
          };
        },
      },
      getConfig() {
        return { sessionTtlHours: 8 };
      },
      usersRepo,
    });

    const onlineSession = await authService.login({
      email: cloudUser.email,
      pin: "123456",
    });
    assert.equal(onlineSession.authMode, "online");
    assert.equal(usersRepo.countOfflineCapableUsers(), 1);

    shouldFailLogin = true;
    const offlineSession = await authService.login({
      email: cloudUser.email,
      pin: "123456",
    });
    assert.equal(offlineSession.authMode, "offline");
    assert.equal(offlineSession.cloudToken, "cloud-token-reusable");

    const restoredOfflineSession = authService.getCurrentSession(offlineSession.token);
    assert.equal(restoredOfflineSession.authMode, "offline");
    assert.equal(restoredOfflineSession.cloudToken, "cloud-token-reusable");

    authService.refreshActiveSessionUser();
    assert.equal(authService.getCurrentSession(offlineSession.token).authMode, "offline");
  }

  db.close();
  console.log("electron-offline tests passed");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
