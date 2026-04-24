import { renderMetricCards } from "../app.js";
import { api } from "../api.js";
import {
  buildClientPagination,
  buildPaginationSummary,
  createQueryStateStore,
  debounce,
} from "../components/table-state.js";
import { confirmDialog } from "../components/modal.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, formatCurrency, formatDate } from "../utils.js";

const PAGE_SIZE = 10;

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
  const outstandingStatusInput = document.querySelector("#outstanding-filter-status");
  const outstandingSearchInput = document.querySelector("#outstanding-filter-search");
  const outstandingResetButton = document.querySelector("#outstanding-filter-reset");
  const historySearchInput = document.querySelector("#history-filter-search");
  const historyResetButton = document.querySelector("#history-filter-reset");

  const outstandingQueryStore = createQueryStateStore({
    status: { key: "outStatus", defaultValue: "" },
    q: { key: "outQ", defaultValue: "" },
    page: { key: "outPage", defaultValue: 1, type: "number", min: 1 },
  });
  const historyQueryStore = createQueryStateStore({
    q: { key: "histQ", defaultValue: "" },
    page: { key: "histPage", defaultValue: 1, type: "number", min: 1 },
  });

  const pageState = {
    summary: null,
    termBuckets: [],
    outstanding: [],
    history: [],
    isLoading: false,
    errorMessage: "",
  };

  let outstandingQuery = outstandingQueryStore.read();
  let historyQuery = historyQueryStore.read();

  function syncFilterInputs() {
    outstandingStatusInput.value = outstandingQuery.status;
    outstandingSearchInput.value = outstandingQuery.q;
    historySearchInput.value = historyQuery.q;
  }

  function getFilteredOutstanding() {
    const search = outstandingQuery.q.toLowerCase();

    return pageState.outstanding.filter((item) => {
      const matchStatus = outstandingQuery.status ? item.dueStatus === outstandingQuery.status : true;
      const matchText = !search || [
        item.supplierName,
        item.supplierNameSnapshot,
        item.dueDate,
        item.periodStart,
        item.periodEnd,
      ].some((part) => String(part || "").toLowerCase().includes(search));
      return matchStatus && matchText;
    });
  }

  function getFilteredHistory() {
    const search = historyQuery.q.toLowerCase();

    return pageState.history.filter((item) => {
      return !search || [
        item.supplierNameSnapshot,
        item.paidByName,
        item.notes,
        item.dueDate,
      ].some((part) => String(part || "").toLowerCase().includes(search));
    });
  }

  function renderSummary() {
    const summary = pageState.summary ?? {
      outstandingCount: 0,
      outstandingAmount: 0,
      dueCount: 0,
      dueAmount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      settledCount: 0,
      settledAmount: 0,
    };

    renderMetricCards(summaryRoot, [
      { label: "Outstanding", value: String(summary.outstandingCount), note: formatCurrency(summary.outstandingAmount), accent: "primary", icon: "fa-file-invoice-dollar" },
      { label: "Jatuh tempo", value: String(summary.dueCount), note: formatCurrency(summary.dueAmount), accent: "warning", icon: "fa-calendar-day" },
      { label: "Overdue", value: String(summary.overdueCount), note: formatCurrency(summary.overdueAmount), accent: "danger", icon: "fa-exclamation-circle" },
      { label: "Sudah dibayar", value: String(summary.settledCount), note: formatCurrency(summary.settledAmount), accent: "success", icon: "fa-check-circle" },
    ]);

    bucketRoot.innerHTML = renderBucketGrid(pageState.termBuckets);
  }

  function renderTables() {
    const outstandingPagination = buildClientPagination(getFilteredOutstanding(), outstandingQuery.page, PAGE_SIZE);
    if (outstandingPagination.pagination.page !== outstandingQuery.page) {
      outstandingQuery = outstandingQueryStore.write({ page: outstandingPagination.pagination.page });
    }

    const historyPagination = buildClientPagination(getFilteredHistory(), historyQuery.page, PAGE_SIZE);
    if (historyPagination.pagination.page !== historyQuery.page) {
      historyQuery = historyQueryStore.write({ page: historyPagination.pagination.page });
    }

    outstandingRoot.innerHTML = renderDataTable({
      columns: [
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        {
          key: "periodStart",
          label: "Periode",
          priority: "secondary",
          render: (row) => `${escapeHtml(formatDate(row.periodStart))} - ${escapeHtml(formatDate(row.periodEnd))}`,
        },
        { key: "transactionCount", label: "Transaksi", align: "right", priority: "secondary", render: (row) => escapeHtml(String(row.transactionCount)) },
        { key: "totalGrossSales", label: "Omzet", align: "right", render: (row) => escapeHtml(formatCurrency(row.totalGrossSales)) },
        { key: "totalCommission", label: "Hak kantin", align: "right", priority: "secondary", render: (row) => escapeHtml(formatCurrency(row.totalCommission)) },
        { key: "totalSupplierNetAmount", label: "Hak pemasok", align: "right", render: (row) => escapeHtml(formatCurrency(row.totalSupplierNetAmount)) },
        {
          key: "dueDate",
          label: "Jatuh tempo",
          align: "center",
          render: (row) => `
            <div class="small font-weight-bold text-gray-800">${escapeHtml(formatDate(row.dueDate))}</div>
            <span class="badge badge-${getDueBadge(row.dueStatus)} text-uppercase">${escapeHtml(row.dueStatusLabel)}</span>
          `,
        },
        {
          key: "actions",
          label: "Aksi",
          align: "center",
          nowrap: true,
          render: (row) => `<button type="button" class="btn btn-primary btn-sm" data-settle-id="${row.groupKey}">Tandai lunas</button>`,
        },
      ],
      rows: outstandingPagination.items,
      loading: pageState.isLoading,
      errorMessage: pageState.errorMessage,
      pagination: outstandingPagination.pagination,
      summaryText: buildPaginationSummary(outstandingPagination.pagination),
      emptyMessage: "Belum ada payout outstanding.",
    });

    historyRoot.innerHTML = renderDataTable({
      columns: [
        { key: "supplierNameSnapshot", label: "Pemasok", render: (row) => escapeHtml(row.supplierNameSnapshot) },
        { key: "period", label: "Periode", priority: "secondary", render: (row) => `${escapeHtml(formatDate(row.periodStart))} - ${escapeHtml(formatDate(row.periodEnd))}` },
        { key: "dueDate", label: "Jatuh tempo", priority: "secondary", render: (row) => escapeHtml(formatDate(row.dueDate)) },
        { key: "totalSupplierNetAmount", label: "Dibayar", align: "right", render: (row) => escapeHtml(formatCurrency(row.totalSupplierNetAmount)) },
        { key: "paidAt", label: "Dibayar pada", priority: "secondary", render: (row) => escapeHtml(formatDate(row.paidAt)) },
        { key: "paidByName", label: "Admin", priority: "secondary", render: (row) => escapeHtml(row.paidByName || "-") },
      ],
      rows: historyPagination.items,
      loading: pageState.isLoading,
      errorMessage: pageState.errorMessage,
      pagination: historyPagination.pagination,
      summaryText: buildPaginationSummary(historyPagination.pagination),
      emptyMessage: "Belum ada riwayat payout.",
    });
  }

  async function refreshPage(message = "Memuat pembayaran pemasok...") {
    const finishBusy = setPageBusy(true, message);
    pageState.isLoading = true;
    renderSummary();
    renderTables();

    try {
      const response = await api.listSupplierPayouts(session.token);
      if (signal.aborted) return;

      pageState.summary = response.data.summary;
      pageState.termBuckets = response.data.summary.termBuckets ?? [];
      pageState.outstanding = response.data.outstanding ?? [];
      pageState.history = response.data.history ?? [];
      pageState.errorMessage = "";
    } catch (error) {
      if (!signal.aborted) {
        pageState.errorMessage = error.message || "Gagal memuat pembayaran pemasok.";
      }
    } finally {
      pageState.isLoading = false;
      renderSummary();
      renderTables();
      finishBusy();
    }
  }

  syncFilterInputs();
  renderSummary();
  renderTables();

  try {
    await refreshPage();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat pembayaran pemasok.", "error");
    }
  }

  outstandingStatusInput.addEventListener(
    "change",
    () => {
      outstandingQuery = outstandingQueryStore.write({ status: outstandingStatusInput.value }, { resetPage: true });
      renderTables();
    },
    { signal },
  );

  outstandingSearchInput.addEventListener(
    "input",
    debounce(() => {
      outstandingQuery = outstandingQueryStore.write({ q: outstandingSearchInput.value.trim() }, { resetPage: true });
      renderTables();
    }),
    { signal },
  );

  outstandingResetButton?.addEventListener(
    "click",
    () => {
      outstandingQuery = outstandingQueryStore.reset();
      syncFilterInputs();
      renderTables();
    },
    { signal },
  );

  historySearchInput.addEventListener(
    "input",
    debounce(() => {
      historyQuery = historyQueryStore.write({ q: historySearchInput.value.trim() }, { resetPage: true });
      renderTables();
    }),
    { signal },
  );

  historyResetButton?.addEventListener(
    "click",
    () => {
      historyQuery = historyQueryStore.reset();
      syncFilterInputs();
      renderTables();
    },
    { signal },
  );

  outstandingRoot.addEventListener(
    "click",
    async (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (pageButton) {
        outstandingQuery = outstandingQueryStore.write({ page: pageButton.dataset.paginationPage });
        renderTables();
        return;
      }

      const settleButton = event.target.closest("[data-settle-id]");
      if (!settleButton) return;

      const target = pageState.outstanding.find((item) => item.groupKey === settleButton.dataset.settleId);
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

  historyRoot.addEventListener(
    "click",
    (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (!pageButton) return;

      historyQuery = historyQueryStore.write({ page: pageButton.dataset.paginationPage });
      renderTables();
    },
    { signal },
  );
}
