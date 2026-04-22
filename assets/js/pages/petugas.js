import { mountAppShell, renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { requireAuth } from "../guards.js";
import { formatCurrency, formatDate, escapeHtml } from "../utils.js";

async function init() {
  const session = await requireAuth({ roles: ["petugas", "admin"] });
  if (!session) return;

  mountAppShell({ title: "Dashboard Petugas", pageKey: "petugas", session });

  try {
    const summary = await api.dashboardSummary(session.token);
    const metrics = [
      { label: "Transaksi saya", value: String(summary.data.transactionCount), note: "Berdasarkan user login" },
      { label: "Total nilai", value: formatCurrency(summary.data.totalValue), note: "Akumulasi transaksi milik user" },
      { label: "Total item", value: String(summary.data.totalItems), note: "Quantity total" },
      { label: "Sisa stok", value: String(summary.data.totalRemaining), note: "Sisa item yang belum habis" },
    ];
    renderMetricCards(document.querySelector("#summary-cards"), metrics);

    document.querySelector("#my-transactions").innerHTML = renderDataTable({
      columns: [
        { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        { key: "itemName", label: "Makanan", render: (row) => escapeHtml(row.itemName) },
        { key: "quantity", label: "Jumlah", render: (row) => escapeHtml(String(row.quantity)) },
        { key: "totalValue", label: "Nilai", render: (row) => escapeHtml(formatCurrency(row.totalValue)) },
      ],
      rows: summary.data.recentTransactions,
      emptyMessage: "Belum ada transaksi untuk user ini.",
    });
  } catch (error) {
    showToast(error.message || "Gagal memuat dashboard petugas.", "error");
  }
}

init();

