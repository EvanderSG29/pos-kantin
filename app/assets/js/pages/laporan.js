import { renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { buildPaginationSummary, createQueryStateStore, debounce } from "../components/table-state.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { getCommissionBaseLabel, getDueStatus } from "../finance.js";
import { escapeHtml, formatCurrency, formatDate } from "../utils.js";

const PAGE_SIZE = 10;

export async function initPage({ session, setPageBusy, signal }) {
  const startInput = document.querySelector("#report-start");
  const endInput = document.querySelector("#report-end");
  const supplierInput = document.querySelector("#report-supplier");
  const commissionTypeInput = document.querySelector("#report-commission-type");
  const searchInput = document.querySelector("#report-search");
  const resetFilterButton = document.querySelector("#report-filter-reset");
  const summaryRoot = document.querySelector("#report-summary");
  const tableRoot = document.querySelector("#report-table");

  const queryStore = createQueryStateStore({
    start: { key: "repStart", defaultValue: "" },
    end: { key: "repEnd", defaultValue: "" },
    supplierId: { key: "repSupplier", defaultValue: "" },
    commissionType: { key: "repType", defaultValue: "" },
    q: { key: "repQ", defaultValue: "" },
    page: { key: "repPage", defaultValue: 1, type: "number", min: 1 },
  });

  const pageState = {
    suppliers: [],
    rows: [],
    pagination: null,
    summary: null,
    tableError: "",
    isTableLoading: false,
  };

  let queryState = queryStore.read();
  let currentRequestId = 0;

  function syncFilterInputs() {
    startInput.value = queryState.start;
    endInput.value = queryState.end;
    supplierInput.value = queryState.supplierId;
    commissionTypeInput.value = queryState.commissionType;
    searchInput.value = queryState.q;
  }

  function renderSupplierOptions() {
    supplierInput.innerHTML = `
      <option value="">Semua pemasok</option>
      ${pageState.suppliers.map((supplier) => `
        <option value="${supplier.id}">${escapeHtml(supplier.supplierName)}</option>
      `).join("")}
    `;
    supplierInput.value = queryState.supplierId;
  }

  function renderSummaryCards() {
    const summary = pageState.summary ?? {
      rowCount: 0,
      totalGrossSales: 0,
      totalProfit: 0,
      totalCommission: 0,
      totalSupplierNetAmount: 0,
      unsettledSupplierNetAmount: 0,
      uniqueSupplierCount: 0,
    };

    renderMetricCards(summaryRoot, [
      { label: "Baris transaksi", value: String(summary.rowCount), note: "Sesuai filter aktif", accent: "primary", icon: "fa-list" },
      { label: "Omzet", value: formatCurrency(summary.totalGrossSales), note: "Total penjualan bersih", accent: "success", icon: "fa-wallet" },
      { label: "Laba", value: formatCurrency(summary.totalProfit), note: "Dasar bagi hasil jika profit", accent: "info", icon: "fa-chart-line" },
      { label: "Hak kantin", value: formatCurrency(summary.totalCommission), note: "Akumulasi komisi", accent: "warning", icon: "fa-percentage" },
      { label: "Hak pemasok", value: formatCurrency(summary.totalSupplierNetAmount), note: `Belum dibayar ${formatCurrency(summary.unsettledSupplierNetAmount)}`, accent: "danger", icon: "fa-file-invoice-dollar" },
      { label: "Pemasok unik", value: String(summary.uniqueSupplierCount), note: "Berdasarkan hasil filter", accent: "secondary", icon: "fa-truck-loading" },
    ]);
  }

  function renderReportTable() {
    tableRoot.innerHTML = renderDataTable({
      columns: [
        {
          key: "transactionDate",
          label: "Tanggal",
          nowrap: true,
          render: (row) => escapeHtml(formatDate(row.transactionDate)),
        },
        {
          key: "supplierName",
          label: "Pemasok",
          render: (row) => escapeHtml(row.supplierName),
        },
        {
          key: "itemName",
          label: "Makanan",
          render: (row) => escapeHtml(row.itemName),
        },
        {
          key: "commissionBaseType",
          label: "Skema",
          priority: "secondary",
          render: (row) => escapeHtml(getCommissionBaseLabel(row.commissionBaseType)),
        },
        {
          key: "soldQuantity",
          label: "Terjual",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(String(row.soldQuantity)),
        },
        {
          key: "grossSales",
          label: "Omzet",
          align: "right",
          render: (row) => escapeHtml(formatCurrency(row.grossSales)),
        },
        {
          key: "profitAmount",
          label: "Laba",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(formatCurrency(row.profitAmount)),
        },
        {
          key: "commissionAmount",
          label: "Hak kantin",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(formatCurrency(row.commissionAmount)),
        },
        {
          key: "supplierNetAmount",
          label: "Hak pemasok",
          align: "right",
          render: (row) => escapeHtml(formatCurrency(row.supplierNetAmount)),
        },
        {
          key: "payout",
          label: "Status payout",
          align: "center",
          priority: "secondary",
          render: (row) => {
            if (row.supplierPayoutId) {
              return `<span class="badge badge-success text-uppercase">Sudah dibayar</span>`;
            }

            const dueStatus = getDueStatus(row.payoutDueDate);
            return `
              <div class="small font-weight-bold text-gray-800">${escapeHtml(formatDate(row.payoutDueDate))}</div>
              <span class="badge badge-${dueStatus.code === "overdue" ? "danger" : dueStatus.code === "today" ? "warning" : "info"} text-uppercase">${escapeHtml(dueStatus.label)}</span>
            `;
          },
        },
      ],
      rows: pageState.rows,
      loading: pageState.isTableLoading,
      errorMessage: pageState.tableError,
      pagination: pageState.pagination,
      summaryText: buildPaginationSummary(pageState.pagination),
      emptyMessage: "Belum ada hasil untuk filter ini.",
    });
  }

  function getReportPayload() {
    return {
      startDate: queryState.start || undefined,
      endDate: queryState.end || undefined,
      supplierId: queryState.supplierId || undefined,
      commissionBaseType: queryState.commissionType || undefined,
      query: queryState.q || undefined,
      includeSummary: true,
      page: queryState.page,
      pageSize: PAGE_SIZE,
    };
  }

  async function refreshReport({ showBusy = false, message = "Memuat laporan transaksi..." } = {}) {
    const requestId = currentRequestId + 1;
    currentRequestId = requestId;
    const finishBusy = showBusy ? setPageBusy(true, message) : () => {};

    pageState.isTableLoading = true;
    renderReportTable();

    try {
      const response = await api.listTransactions(getReportPayload(), session.token);
      if (signal.aborted || requestId !== currentRequestId) return;

      pageState.rows = response.data.items;
      pageState.pagination = response.data.pagination;
      pageState.summary = response.data.summary ?? null;
      pageState.tableError = "";

      if (pageState.pagination && pageState.pagination.page !== queryState.page) {
        queryState = queryStore.write({ page: pageState.pagination.page });
      }
    } catch (error) {
      if (!signal.aborted && requestId === currentRequestId) {
        pageState.tableError = error.message || "Gagal memuat laporan.";
      }
    } finally {
      if (requestId === currentRequestId) {
        pageState.isTableLoading = false;
        renderSummaryCards();
        renderReportTable();
      }
      finishBusy();
    }
  }

  async function loadInitialData() {
    const finishBusy = setPageBusy(true, "Memuat laporan transaksi...");

    try {
      const supplierResponse = await api.listSuppliers({}, session.token);
      if (signal.aborted) return;

      pageState.suppliers = supplierResponse.data.items;
      renderSupplierOptions();
      renderSummaryCards();
      renderReportTable();
      await refreshReport();
    } finally {
      finishBusy();
    }
  }

  syncFilterInputs();
  renderSummaryCards();
  renderReportTable();

  try {
    await loadInitialData();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat laporan.", "error");
    }
  }

  startInput.addEventListener(
    "change",
    async () => {
      queryState = queryStore.write({ start: startInput.value }, { resetPage: true });
      await refreshReport();
    },
    { signal },
  );

  endInput.addEventListener(
    "change",
    async () => {
      queryState = queryStore.write({ end: endInput.value }, { resetPage: true });
      await refreshReport();
    },
    { signal },
  );

  supplierInput.addEventListener(
    "change",
    async () => {
      queryState = queryStore.write({ supplierId: supplierInput.value }, { resetPage: true });
      await refreshReport();
    },
    { signal },
  );

  commissionTypeInput.addEventListener(
    "change",
    async () => {
      queryState = queryStore.write({ commissionType: commissionTypeInput.value }, { resetPage: true });
      await refreshReport();
    },
    { signal },
  );

  searchInput.addEventListener(
    "input",
    debounce(async () => {
      queryState = queryStore.write({ q: searchInput.value.trim() }, { resetPage: true });
      await refreshReport();
    }),
    { signal },
  );

  resetFilterButton?.addEventListener(
    "click",
    async () => {
      queryState = queryStore.reset();
      syncFilterInputs();
      await refreshReport();
    },
    { signal },
  );

  tableRoot.addEventListener(
    "click",
    async (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (!pageButton) return;

      queryState = queryStore.write({ page: pageButton.dataset.paginationPage });
      await refreshReport();
    },
    { signal },
  );
}
