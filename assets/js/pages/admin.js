import { mountAppShell, renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { requireAuth } from "../guards.js";
import { formatCurrency, formatDate, escapeHtml } from "../utils.js";

async function init() {
  const session = await requireAuth({ roles: ["admin"] });
  if (!session) return;

  mountAppShell({ title: "Dashboard Admin", pageKey: "admin", session });

  try {
    const summary = await api.dashboardSummary(session.token);
    const metrics = [
      { label: "Total transaksi", value: String(summary.data.transactionCount), note: "Semua row transaksi aktif" },
      { label: "Total nilai", value: formatCurrency(summary.data.totalValue), note: "Akumulasi quantity x harga" },
      { label: "Jumlah item", value: String(summary.data.totalItems), note: "Total quantity seluruh transaksi" },
      { label: "Sisa stok", value: String(summary.data.totalRemaining), note: "Akumulasi sisa per row" },
      { label: "Pemasok aktif", value: String(summary.data.activeSuppliers), note: "Berdasarkan transaksi aktif" },
      { label: "User aktif", value: String(summary.data.userCount), note: "Users dengan status aktif" },
    ];
    renderMetricCards(document.querySelector("#summary-cards"), metrics);

    document.querySelector("#recent-transactions").innerHTML = renderDataTable({
      columns: [
        { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
        { key: "inputByName", label: "Petugas", render: (row) => escapeHtml(row.inputByName) },
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        { key: "itemName", label: "Makanan", render: (row) => escapeHtml(row.itemName) },
        { key: "totalValue", label: "Nilai", render: (row) => escapeHtml(formatCurrency(row.totalValue)) },
      ],
      rows: summary.data.recentTransactions,
      emptyMessage: "Belum ada transaksi terbaru.",
    });
  } catch (error) {
    showToast(error.message || "Gagal memuat dashboard admin.", "error");
  }
}

init();

