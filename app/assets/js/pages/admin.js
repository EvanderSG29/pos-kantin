import { renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { mountSyncStatusPanel } from "../components/sync-status.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, formatCurrency, formatDate } from "../utils.js";

function renderSupplierSnapshot(summary) {
  return `
    <div class="pos-inline-metrics">
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">Pemasok aktif</span>
        <strong>${escapeHtml(String(summary.activeSuppliers || 0))}</strong>
      </article>
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">User offline-ready</span>
        <strong>${escapeHtml(String(summary.offlineCapableUsers || 0))}</strong>
      </article>
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">Utang due</span>
        <strong>${escapeHtml(formatCurrency(summary.dueSupplierDebtAmount || 0))}</strong>
      </article>
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">Payout overdue</span>
        <strong>${escapeHtml(String(summary.overdueSupplierPayoutCount || 0))}</strong>
      </article>
    </div>
    <div class="alert alert-light border mb-0">
      Desktop v1 hanya memindahkan modul inti. Users, simpanan, pembayaran pemasok, dan laporan tetap ditahan di luar scope rilis ini.
    </div>
  `;
}

export async function initPage({ session, setPageBusy, signal }) {
  const summaryRoot = document.querySelector("#summary-cards");
  const supplierSnapshotRoot = document.querySelector("#supplier-snapshot");
  const recentTransactionsRoot = document.querySelector("#recent-transactions");
  const syncPanelRoot = document.querySelector("#sync-status-panel");
  const cleanupSyncPanel = mountSyncStatusPanel(syncPanelRoot);

  signal.addEventListener("abort", cleanupSyncPanel, { once: true });

  const finishBusy = setPageBusy(true, "Memuat dashboard admin...");

  try {
    const summary = await api.dashboardSummary(session.token);
    if (signal.aborted) return;

    const metrics = [
      { label: "Omzet hari ini", value: formatCurrency(summary.data.todayGrossSales), note: `${summary.data.todayTransactionCount} transaksi`, accent: "primary", icon: "fa-cash-register" },
      { label: "Hak kantin", value: formatCurrency(summary.data.todayCommission), note: "Dari transaksi lokal", accent: "success", icon: "fa-wallet" },
      { label: "Queue sinkron", value: String(summary.data.pendingSyncCount), note: summary.data.syncOnline ? "Siap dikirim ke cloud" : "Akan dikirim saat online", accent: "warning", icon: "fa-sync-alt" },
      { label: "Total transaksi", value: String(summary.data.transactionCount), note: "Tersimpan di SQLite lokal", accent: "info", icon: "fa-receipt" },
    ];

    renderMetricCards(summaryRoot, metrics);
    supplierSnapshotRoot.innerHTML = renderSupplierSnapshot(summary.data);
    recentTransactionsRoot.innerHTML = renderDataTable({
      columns: [
        { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        { key: "itemName", label: "Barang", render: (row) => escapeHtml(row.itemName) },
        { key: "grossSales", label: "Omzet", align: "right", render: (row) => escapeHtml(formatCurrency(row.grossSales)) },
        { key: "commissionAmount", label: "Hak kantin", align: "right", render: (row) => escapeHtml(formatCurrency(row.commissionAmount)) },
      ],
      rows: summary.data.recentTransactions,
      emptyMessage: "Belum ada transaksi yang tersimpan.",
    });
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat dashboard admin.", "error");
    }
  } finally {
    finishBusy();
  }
}
