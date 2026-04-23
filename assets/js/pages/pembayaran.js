import { renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { confirmDialog } from "../components/modal.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, formatCurrency, formatDate } from "../utils.js";

function getDueBadge(status) {
  switch (status) {
    case "overdue":
      return "danger";
    case "today":
      return "warning";
    default:
      return "info";
  }
}

function renderBucketGrid(buckets = []) {
  if (!buckets.length) {
    return `
      <div class="border rounded bg-white px-4 py-5 text-center text-gray-500 pos-empty-state">
        <i class="fas fa-layer-group fa-2x mb-3 text-gray-300"></i>
        <p class="mb-0">Belum ada bucket termin aktif.</p>
      </div>
    `;
  }

  return `
    <div class="pos-payout-bucket-grid">
      ${buckets.map((bucket) => `
        <article class="pos-payout-bucket-card">
          <div class="small text-uppercase text-muted mb-1">Termin ${escapeHtml(String(bucket.payoutTermDays))} hari</div>
          <div class="h5 mb-1 font-weight-bold text-gray-800">${escapeHtml(String(bucket.count))} payout</div>
          <div class="text-gray-700">${escapeHtml(formatCurrency(bucket.totalSupplierNetAmount))}</div>
        </article>
      `).join("")}
    </div>
  `;
}

export async function initPage({ session, setPageBusy, signal }) {
  const summaryRoot = document.querySelector("#payout-summary");
  const bucketRoot = document.querySelector("#payout-bucket-grid");
  const outstandingRoot = document.querySelector("#outstanding-payout-table");
  const historyRoot = document.querySelector("#payout-history-table");

  let outstanding = [];

  function renderTables(history = []) {
    outstandingRoot.innerHTML = renderDataTable({
      columns: [
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        { key: "periodStart", label: "Periode", render: (row) => `${escapeHtml(formatDate(row.periodStart))} - ${escapeHtml(formatDate(row.periodEnd))}` },
        { key: "transactionCount", label: "Transaksi", render: (row) => escapeHtml(String(row.transactionCount)) },
        { key: "totalGrossSales", label: "Omzet", render: (row) => escapeHtml(formatCurrency(row.totalGrossSales)) },
        { key: "totalCommission", label: "Hak kantin", render: (row) => escapeHtml(formatCurrency(row.totalCommission)) },
        { key: "totalSupplierNetAmount", label: "Hak pemasok", render: (row) => escapeHtml(formatCurrency(row.totalSupplierNetAmount)) },
        {
          key: "dueDate",
          label: "Jatuh tempo",
          render: (row) => `
            <div class="small font-weight-bold text-gray-800">${escapeHtml(formatDate(row.dueDate))}</div>
            <span class="badge badge-${getDueBadge(row.dueStatus)} text-uppercase">${escapeHtml(row.dueStatusLabel)}</span>
          `,
        },
        {
          key: "actions",
          label: "Aksi",
          render: (row) => `<button type="button" class="btn btn-primary btn-sm" data-settle-id="${row.groupKey}">Tandai lunas</button>`,
        },
      ],
      rows: outstanding,
      emptyMessage: "Belum ada payout outstanding.",
    });

    historyRoot.innerHTML = renderDataTable({
      columns: [
        { key: "supplierNameSnapshot", label: "Pemasok", render: (row) => escapeHtml(row.supplierNameSnapshot) },
        { key: "period", label: "Periode", render: (row) => `${escapeHtml(formatDate(row.periodStart))} - ${escapeHtml(formatDate(row.periodEnd))}` },
        { key: "dueDate", label: "Jatuh tempo", render: (row) => escapeHtml(formatDate(row.dueDate)) },
        { key: "totalSupplierNetAmount", label: "Dibayar", render: (row) => escapeHtml(formatCurrency(row.totalSupplierNetAmount)) },
        { key: "paidAt", label: "Dibayar pada", render: (row) => escapeHtml(formatDate(row.paidAt)) },
        { key: "paidByName", label: "Admin", render: (row) => escapeHtml(row.paidByName || "-") },
      ],
      rows: history,
      emptyMessage: "Belum ada riwayat payout.",
    });
  }

  async function refreshPage(message = "Memuat pembayaran pemasok...") {
    const finishBusy = setPageBusy(true, message);

    try {
      const response = await api.listSupplierPayouts(session.token);
      if (signal.aborted) return;

      outstanding = response.data.outstanding;
      renderMetricCards(summaryRoot, [
        { label: "Outstanding", value: String(response.data.summary.outstandingCount), note: formatCurrency(response.data.summary.outstandingAmount), accent: "primary", icon: "fa-file-invoice-dollar" },
        { label: "Jatuh tempo", value: String(response.data.summary.dueCount), note: formatCurrency(response.data.summary.dueAmount), accent: "warning", icon: "fa-calendar-day" },
        { label: "Overdue", value: String(response.data.summary.overdueCount), note: formatCurrency(response.data.summary.overdueAmount), accent: "danger", icon: "fa-exclamation-circle" },
        { label: "Sudah dibayar", value: String(response.data.summary.settledCount), note: formatCurrency(response.data.summary.settledAmount), accent: "success", icon: "fa-check-circle" },
      ]);
      bucketRoot.innerHTML = renderBucketGrid(response.data.summary.termBuckets ?? []);
      renderTables(response.data.history ?? []);
    } finally {
      finishBusy();
    }
  }

  try {
    await refreshPage();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat pembayaran pemasok.", "error");
    }
  }

  outstandingRoot.addEventListener(
    "click",
    async (event) => {
      const settleId = event.target.dataset.settleId;
      if (!settleId) return;

      const target = outstanding.find((item) => item.groupKey === settleId);
      if (!target) return;

      const confirmed = await confirmDialog({
        title: "Tandai payout lunas",
        message: `Payout ${target.supplierName} senilai ${formatCurrency(target.totalSupplierNetAmount)} akan ditandai lunas.`,
        confirmText: "Tandai lunas",
      });

      if (!confirmed || signal.aborted) return;

      const finishBusy = setPageBusy(true, "Menyimpan status payout...");

      try {
        await api.settleSupplierPayout({
          supplierId: target.supplierId,
          dueDate: target.dueDate,
        }, session.token);
        if (signal.aborted) return;

        await refreshPage("Memuat ulang pembayaran pemasok...");
        if (signal.aborted) return;

        showToast("Payout pemasok berhasil ditandai lunas.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menandai payout lunas.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );
}
