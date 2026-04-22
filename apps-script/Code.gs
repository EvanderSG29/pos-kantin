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
      case "listTransactions":
        return ok_("Daftar transaksi berhasil diambil.", listTransactionsAction_(payload, token));
      case "saveTransaction":
        return ok_("Transaksi berhasil disimpan.", saveTransactionAction_(payload, token));
      case "deleteTransaction":
        return ok_("Transaksi berhasil dihapus.", deleteTransactionAction_(payload, token));
      case "listSavings":
        return ok_("Data simpanan berhasil diambil.", listSavingsAction_(token));
      case "dashboardSummary":
        return ok_("Ringkasan dashboard berhasil diambil.", dashboardSummaryAction_(token));
      case "listSuppliers":
        return ok_("Daftar pemasok berhasil diambil.", listSuppliersAction_(token));
      default:
        return fail_("Action tidak dikenal: " + action);
    }
  } catch (error) {
    return fail_(error.message);
  }
}

