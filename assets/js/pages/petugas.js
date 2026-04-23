import { renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, formatCurrency, formatDate } from "../utils.js";

export async function initPage({ session, setPageBusy, signal }) {
  const finishBusy = setPageBusy(true, "Memuat dashboard petugas...");

  try {
    const summary = await api.dashboardSummary(session.token);
    if (signal.aborted) return;

    const metrics = [
      { label: "Transaksi saya", value: String(summary.data.transactionCount), note: "Berdasarkan user login", accent: "primary", icon: "fa-receipt" },
      { label: "Total nilai", value: formatCurrency(summary.data.totalValue), note: "Akumulasi transaksi milik user", accent: "success", icon: "fa-wallet" },
      { label: "Total item", value: String(summary.data.totalItems), note: "Quantity total", accent: "info", icon: "fa-box-open" },
      { label: "Sisa stok", value: String(summary.data.totalRemaining), note: "Sisa item yang belum habis", accent: "warning", icon: "fa-boxes" },
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
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat dashboard petugas.", "error");
    }
  } finally {
    finishBusy();
  }
}
