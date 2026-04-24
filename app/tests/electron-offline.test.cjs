const assert = require("node:assert/strict");
const { mkdtemp, readdir, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");

const electron = require("electron");
const Database = require("better-sqlite3");
const { createBuyersRepo } = require("../electron/repositories/buyers-repo.cjs");
const { createDailyFinanceRepo } = require("../electron/repositories/daily-finance-repo.cjs");
const { createSavingsRepo } = require("../electron/repositories/savings-repo.cjs");
const { createSupplierPayoutsRepo } = require("../electron/repositories/supplier-payouts-repo.cjs");
const { createUsersRepo } = require("../electron/repositories/users-repo.cjs");
const { createSuppliersRepo } = require("../electron/repositories/suppliers-repo.cjs");
const { createTransactionsRepo } = require("../electron/repositories/transactions-repo.cjs");
const { createSyncQueueRepo } = require("../electron/repositories/sync-queue-repo.cjs");
const { createAuthService } = require("../electron/services/auth-service.cjs");

async function createTestDb() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "pos-kantin-electron-"));
  const db = new Database(path.join(tempDir, "test.sqlite"));

  const migrationsDir = path.join(__dirname, "../electron/db/migrations");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const file of migrationFiles) {
    db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }

  return db;
}

async function main() {
  assert.ok(electron.app, "Test Electron harus dijalankan lewat runtime Electron, bukan mode Node.");

  const db = await createTestDb();
  const usersRepo = createUsersRepo(db);
  const buyersRepo = createBuyersRepo(db);
  const savingsRepo = createSavingsRepo(db);
  const suppliersRepo = createSuppliersRepo(db);
  const transactionsRepo = createTransactionsRepo(db, suppliersRepo);
  const dailyFinanceRepo = createDailyFinanceRepo(db, buyersRepo);
  const supplierPayoutsRepo = createSupplierPayoutsRepo(db, transactionsRepo);
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
    const localUser = usersRepo.saveUser({
      fullName: "Ari Kasir",
      nickname: "Ari",
      email: "ari@example.test",
      role: "petugas",
      status: "aktif",
      classGroup: "XI",
      notes: "Tes CRUD user",
    }, admin);

    assert.equal(localUser.email, "ari@example.test");
    assert.equal(usersRepo.list().items.some((item) => item.id === localUser.id), true);
  }

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
  let payoutTransaction = null;

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

    payoutTransaction = transactionsRepo.saveTransaction({
      transactionDate: "2026-04-25",
      supplierId: supplier.id,
      itemName: "Es teh",
      unitName: "gelas",
      quantity: 10,
      remainingQuantity: 0,
      costPrice: 2000,
      unitPrice: 3000,
      notes: "Untuk payout",
    }, petugas);
  }

  {
    const forPetugas = transactionsRepo.listTransactions({}, petugas);
    const forAdmin = transactionsRepo.listTransactions({}, admin);

    assert.equal(forPetugas.items.length, 2);
    assert.equal(forAdmin.items.length, 2);
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
    const buyer = buyersRepo.applyCloudRecord({
      id: "BYR-1",
      buyerName: "Bima",
      classOrCategory: "XI PPLG",
      openingBalance: 15000,
      currentBalance: 15000,
      status: "aktif",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
      lastImportedAt: "2026-04-24T00:00:00.000Z",
    });
    savingsRepo.applyCloudRecord({
      id: "SVG-1",
      studentId: buyer.id,
      studentName: buyer.buyerName,
      className: buyer.classOrCategory,
      gender: "",
      groupName: "",
      depositAmount: 15000,
      changeBalance: 15000,
      recordedAt: "2026-04-24",
      recordedByUserId: admin.id,
      recordedByName: admin.fullName,
      notes: "IMPORT_CSV_SEED",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    });

    assert.equal(buyersRepo.list().items.length, 1);
    assert.equal(savingsRepo.list().items[0].studentName, "Bima");

    const detail = dailyFinanceRepo.saveDailyFinance({
      financeDate: "2026-04-24",
      grossAmount: 20000,
      changeTotal: 5000,
      notes: "Shift siang",
      changeEntries: [
        {
          buyerId: buyer.id,
          changeAmount: 5000,
          notes: "Kembalian Bima",
        },
      ],
    }, petugas);

    assert.equal(detail.finance.netAmount, 15000);
    assert.equal(detail.changeEntries.length, 1);
    assert.equal(dailyFinanceRepo.listDailyFinance({}, petugas).items.length, 1);

    const changed = dailyFinanceRepo.updateChangeEntryStatus({
      id: detail.changeEntries[0].id,
      status: "selesai",
    }, petugas);
    assert.equal(changed.status, "selesai");
    assert.throws(
      () => dailyFinanceRepo.deleteDailyFinance({ id: detail.finance.id }, petugas),
      /kembalian selesai/,
    );

    dailyFinanceRepo.updateChangeEntryStatus({
      id: detail.changeEntries[0].id,
      status: "belum",
    }, petugas);
    const deletedFinance = dailyFinanceRepo.deleteDailyFinance({ id: detail.finance.id }, petugas);
    assert.ok(deletedFinance.deletedAt);
  }

  {
    const payoutBefore = supplierPayoutsRepo.listSupplierPayouts(admin);
    assert.equal(payoutBefore.outstanding.some((item) => item.transactionIds.includes(payoutTransaction.id)), true);

    const target = payoutBefore.outstanding.find((item) => item.transactionIds.includes(payoutTransaction.id));
    const settled = supplierPayoutsRepo.settleSupplierPayout({
      supplierId: target.supplierId,
      dueDate: target.dueDate,
      notes: "Dibayar tunai",
    }, admin);

    assert.equal(settled.settledTransactionCount, 1);
    assert.equal(supplierPayoutsRepo.listSupplierPayouts(admin).history.length, 1);
    assert.throws(
      () => transactionsRepo.deleteTransaction(payoutTransaction.id, petugas),
      /payout pemasok/,
    );
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
