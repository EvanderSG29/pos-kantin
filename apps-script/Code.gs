function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action !== "health") {
      return fail_("doGet hanya mendukung action=health.");
    }

    return ok_("POS Kantin API aktif.", {
      appName: CONFIG.APP_NAME,
      version: CONFIG.APP_VERSION,
      timestamp: nowIso_(),
      configuredSpreadsheet: Boolean(getSpreadsheetId_()),
    });
  } catch (error) {
    return fail_(error.message);
  }
}

function doPost(e) {
  try {
    var requestBody = parseRequestBody_(e);
    var action = requestBody.action;
    var token = requestBody.token || "";
    var payload = requestBody.payload || {};

    if (!action) {
      return fail_("Action wajib diisi.");
    }

    switch (action) {
      case "login":
        return ok_("Login berhasil.", loginAction_(payload));
      case "logout":
        return ok_("Logout berhasil.", logoutAction_(token));
      case "getCurrentUser":
        return ok_("Session valid.", getCurrentUserAction_(token));
      case "listUsers":
        return ok_("Daftar user berhasil diambil.", listUsersAction_(token));
      case "saveUser":
        return ok_("User berhasil disimpan.", saveUserAction_(payload, token));
      case "listBuyers":
        return ok_("Daftar pembeli berhasil diambil.", listBuyersAction_(payload, token));
      case "importBuyers":
        return ok_("Import CSV pembeli berhasil diproses.", importBuyersAction_(payload, token));
      case "listTransactions":
        return ok_("Daftar transaksi berhasil diambil.", listTransactionsAction_(payload, token));
      case "saveTransaction":
        return ok_("Transaksi berhasil disimpan.", saveTransactionAction_(payload, token));
      case "deleteTransaction":
        return ok_("Transaksi berhasil dihapus.", deleteTransactionAction_(payload, token));
      case "listSavings":
        return ok_("Data simpanan berhasil diambil.", listSavingsAction_(token));
      case "listDailyFinance":
        return ok_("Data keuangan harian berhasil diambil.", listDailyFinanceAction_(payload, token));
      case "getDailyFinanceDetail":
        return ok_("Detail keuangan harian berhasil diambil.", getDailyFinanceDetailAction_(payload, token));
      case "saveDailyFinance":
        return ok_("Data keuangan harian berhasil disimpan.", saveDailyFinanceAction_(payload, token));
      case "deleteDailyFinance":
        return ok_("Data keuangan harian berhasil dihapus.", deleteDailyFinanceAction_(payload, token));
      case "listChangeEntries":
        return ok_("Daftar buku kembalian berhasil diambil.", listChangeEntriesAction_(payload, token));
      case "updateChangeEntryStatus":
        return ok_("Status kembalian berhasil diperbarui.", updateChangeEntryStatusAction_(payload, token));
      case "dashboardSummary":
        return ok_("Ringkasan dashboard berhasil diambil.", dashboardSummaryAction_(token));
      case "listSuppliers":
        return ok_("Daftar pemasok berhasil diambil.", listSuppliersAction_(payload, token));
      case "saveSupplier":
        return ok_("Data pemasok berhasil disimpan.", saveSupplierAction_(payload, token));
      case "listSupplierPayouts":
        return ok_("Data pembayaran pemasok berhasil diambil.", listSupplierPayoutsAction_(token));
      case "settleSupplierPayout":
        return ok_("Pembayaran pemasok berhasil ditandai lunas.", settleSupplierPayoutAction_(payload, token));
      default:
        return fail_("Action tidak dikenal: " + action);
    }
  } catch (error) {
    return fail_(error.message);
  }
}
