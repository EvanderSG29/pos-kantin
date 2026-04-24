import { api } from "../api.js";
import {
  clearForm,
  clearFormErrors,
  fillForm,
  serializeForm,
  setFieldError,
  setFormMode,
} from "../components/form.js";
import { confirmDialog } from "../components/modal.js";
import { buildPaginationSummary, createQueryStateStore, debounce } from "../components/table-state.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import {
  calculateTransactionMetrics,
  getCommissionBaseDescription,
  getCommissionBaseLabel,
  getDueStatus,
  toLocalIsoDate,
} from "../finance.js";
import { escapeHtml, formatCurrency, formatDate, toNumber } from "../utils.js";

const PAGE_SIZE = 10;

function getDueStatusBadge(statusCode) {
  switch (statusCode) {
    case "settled":
      return "success";
    case "overdue":
      return "danger";
    case "today":
      return "warning";
    default:
      return "info";
  }
}

function setTodayValue(input) {
  if (input) {
    input.value = toLocalIsoDate();
  }
}

function renderSupplierRules(supplier) {
  if (!supplier) {
    return `
      <div class="alert alert-light border mb-0">
        Pilih pemasok untuk melihat skema komisi dan termin pembayaran yang akan dipakai.
      </div>
    `;
  }

  return `
    <div class="pos-finance-meta-grid">
      <article class="pos-finance-meta-card">
        <div class="small text-uppercase text-muted mb-1">Skema komisi</div>
        <div class="font-weight-bold text-gray-800">${escapeHtml(getCommissionBaseLabel(supplier.commissionBaseType))}</div>
        <div class="small text-gray-600">${escapeHtml(getCommissionBaseDescription(supplier.commissionBaseType))}</div>
      </article>
      <article class="pos-finance-meta-card">
        <div class="small text-uppercase text-muted mb-1">Potongan</div>
        <div class="font-weight-bold text-gray-800">${escapeHtml(String(supplier.commissionRate))}%</div>
        <div class="small text-gray-600">Snapshot ini disalin ke transaksi saat disimpan.</div>
      </article>
      <article class="pos-finance-meta-card">
        <div class="small text-uppercase text-muted mb-1">Termin payout</div>
        <div class="font-weight-bold text-gray-800">${escapeHtml(String(supplier.payoutTermDays))} hari</div>
        <div class="small text-gray-600">Transaksi akan jatuh tempo sesuai master pemasok.</div>
      </article>
    </div>
  `;
}

function renderPreview({ supplier, values }) {
  if (!supplier) {
    return `
      <div class="border rounded bg-white px-4 py-5 text-center text-gray-500 pos-empty-state">
        <i class="fas fa-calculator fa-2x mb-3 text-gray-300"></i>
        <p class="mb-0">Pilih pemasok untuk memulai preview perhitungan.</p>
      </div>
    `;
  }

  const metrics = calculateTransactionMetrics({
    quantity: values.quantity,
    remainingQuantity: values.remainingQuantity,
    costPrice: values.costPrice,
    unitPrice: values.unitPrice,
    commissionRate: supplier.commissionRate,
    commissionBaseType: supplier.commissionBaseType,
    payoutTermDays: supplier.payoutTermDays,
    transactionDate: values.transactionDate,
  });
  const dueStatus = getDueStatus(metrics.payoutDueDate);

  return `
    <div class="pos-finance-preview-grid">
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Terjual</span>
        <strong>${escapeHtml(String(metrics.soldQuantity))}</strong>
        <div class="small text-gray-600">Dari ${escapeHtml(String(metrics.quantity))} titip, sisa ${escapeHtml(String(metrics.remainingQuantity))}</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Omzet</span>
        <strong>${escapeHtml(formatCurrency(metrics.grossSales))}</strong>
        <div class="small text-gray-600">Harga jual x jumlah terjual</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Laba</span>
        <strong>${escapeHtml(formatCurrency(metrics.profitAmount))}</strong>
        <div class="small text-gray-600">Harga jual dikurangi modal</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Hak kantin</span>
        <strong>${escapeHtml(formatCurrency(metrics.commissionAmount))}</strong>
        <div class="small text-gray-600">${escapeHtml(getCommissionBaseLabel(supplier.commissionBaseType))} ${escapeHtml(String(supplier.commissionRate))}%</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Hak pemasok</span>
        <strong>${escapeHtml(formatCurrency(metrics.supplierNetAmount))}</strong>
        <div class="small text-gray-600">Omzet dikurangi hak kantin</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Jatuh tempo</span>
        <strong>${escapeHtml(metrics.payoutDueDate ? formatDate(metrics.payoutDueDate) : "-")}</strong>
        <div class="small text-gray-600">${escapeHtml(dueStatus.label)}</div>
      </article>
    </div>
  `;
}

export async function initPage({ session, setPageBusy, signal }) {
  const formCard = document.querySelector("#transaction-form-card");
  const form = document.querySelector("#transaction-form");
  const dateInput = document.querySelector("#transactionDate");
  const supplierSelect = document.querySelector("#supplierId");
  const rulesRoot = document.querySelector("#supplier-rules");
  const previewRoot = document.querySelector("#transaction-preview");
  const tableRoot = document.querySelector("#transaction-table");
  const dateFilterInput = document.querySelector("#filter-date");
  const searchFilterInput = document.querySelector("#filter-search");
  const resetButton = document.querySelector("#transaction-reset");
  const filterResetButton = document.querySelector("#transaction-filter-reset");

  const queryStore = createQueryStateStore({
    date: { key: "txDate", defaultValue: "" },
    q: { key: "txQ", defaultValue: "" },
    page: { key: "txPage", defaultValue: 1, type: "number", min: 1 },
  });

  const pageState = {
    suppliers: [],
    rows: [],
    pagination: null,
    tableError: "",
    isTableLoading: false,
  };

  let tableQuery = queryStore.read();
  let currentTableRequestId = 0;

  function syncFilterInputs() {
    dateFilterInput.value = tableQuery.date;
    searchFilterInput.value = tableQuery.q;
  }

  function getSelectedSupplier() {
    return pageState.suppliers.find((item) => item.id === supplierSelect.value) ?? null;
  }

  function renderSupplierOptions() {
    supplierSelect.innerHTML = `
      <option value="">Pilih pemasok</option>
      ${pageState.suppliers
        .filter((supplier) => supplier.isActive !== false)
        .map((supplier) => `
          <option value="${supplier.id}">
            ${escapeHtml(supplier.supplierName)} • ${escapeHtml(getCommissionBaseLabel(supplier.commissionBaseType))} ${escapeHtml(String(supplier.commissionRate))}% • ${escapeHtml(String(supplier.payoutTermDays))}h
          </option>
        `)
        .join("")}
    `;
  }

  function renderLivePreview() {
    const values = serializeForm(form);
    const supplier = getSelectedSupplier();
    rulesRoot.innerHTML = renderSupplierRules(supplier);
    previewRoot.innerHTML = renderPreview({
      supplier,
      values: {
        transactionDate: values.transactionDate,
        quantity: toNumber(values.quantity, 0),
        remainingQuantity: toNumber(values.remainingQuantity, 0),
        costPrice: toNumber(values.costPrice, 0),
        unitPrice: toNumber(values.unitPrice, 0),
      },
    });
  }

  function setCreateMode() {
    setFormMode(formCard, "create");
  }

  function setEditMode() {
    setFormMode(formCard, "edit");
  }

  function resetFormState() {
    clearForm(form);
    setTodayValue(dateInput);
    setCreateMode();
    renderLivePreview();
  }

  function validateForm(values) {
    clearFormErrors(form);
    let hasError = false;

    if (!values.transactionDate) {
      setFieldError(form, "transactionDate", "Tanggal wajib diisi.");
      hasError = true;
    }

    if (!values.supplierId) {
      setFieldError(form, "supplierId", "Pemasok wajib dipilih.");
      hasError = true;
    }

    if (!String(values.itemName || "").trim()) {
      setFieldError(form, "itemName", "Nama barang wajib diisi.");
      hasError = true;
    }

    if (!String(values.unitName || "").trim()) {
      setFieldError(form, "unitName", "Satuan wajib diisi.");
      hasError = true;
    }

    [
      ["quantity", "Jumlah titip wajib diisi."],
      ["remainingQuantity", "Sisa wajib diisi."],
      ["costPrice", "Harga modal wajib diisi."],
      ["unitPrice", "Harga jual wajib diisi."],
    ].forEach(([fieldName, message]) => {
      if (String(values[fieldName] ?? "").trim() === "") {
        setFieldError(form, fieldName, message);
        hasError = true;
      }
    });

    const quantity = toNumber(values.quantity, -1);
    const remainingQuantity = toNumber(values.remainingQuantity, -1);
    if (quantity < 0) {
      setFieldError(form, "quantity", "Jumlah titip harus 0 atau lebih.");
      hasError = true;
    }

    if (remainingQuantity < 0) {
      setFieldError(form, "remainingQuantity", "Sisa harus 0 atau lebih.");
      hasError = true;
    }

    if (remainingQuantity > quantity && quantity >= 0) {
      setFieldError(form, "remainingQuantity", "Sisa tidak boleh lebih besar dari jumlah titip.");
      hasError = true;
    }

    ["costPrice", "unitPrice"].forEach((fieldName) => {
      if (toNumber(values[fieldName], -1) < 0) {
        setFieldError(form, fieldName, "Nilai tidak boleh negatif.");
        hasError = true;
      }
    });

    return !hasError;
  }

  function renderTransactions() {
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
          render: (row) => `
            <div class="font-weight-bold text-gray-800">${escapeHtml(row.itemName)}</div>
            <div class="small text-muted">${escapeHtml(row.unitName || "-")}</div>
          `,
        },
        {
          key: "soldQuantity",
          label: "Terjual",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(String(row.soldQuantity)),
        },
        {
          key: "commissionBaseType",
          label: "Skema",
          priority: "secondary",
          render: (row) => `
            <div class="small font-weight-bold text-gray-800">${escapeHtml(getCommissionBaseLabel(row.commissionBaseType))}</div>
            <div class="text-muted">${escapeHtml(String(row.commissionRate))}%</div>
          `,
        },
        {
          key: "grossSales",
          label: "Omzet",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(formatCurrency(row.grossSales)),
        },
        {
          key: "commissionAmount",
          label: "Hak kantin",
          align: "right",
          priority: "tertiary",
          render: (row) => escapeHtml(formatCurrency(row.commissionAmount)),
        },
        {
          key: "supplierNetAmount",
          label: "Hak pemasok",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(formatCurrency(row.supplierNetAmount)),
        },
        {
          key: "payoutDueDate",
          label: "Payout",
          align: "center",
          priority: "secondary",
          render: (row) => {
            const status = row.supplierPayoutId
              ? { code: "settled", label: "Sudah dibayar" }
              : getDueStatus(row.payoutDueDate);
            return `
              <div class="small font-weight-bold text-gray-800">${escapeHtml(formatDate(row.payoutDueDate))}</div>
              <span class="badge badge-${getDueStatusBadge(status.code)} text-uppercase">${escapeHtml(status.label)}</span>
            `;
          },
        },
        {
          key: "actions",
          label: "Aksi",
          align: "center",
          nowrap: true,
          render: (row) => row.supplierPayoutId
            ? `<span class="badge badge-success text-uppercase">Locked</span>`
            : `
              <div class="pos-table-actions justify-content-center">
                <button class="btn btn-outline-primary btn-sm" data-edit-id="${row.id}" type="button">Edit</button>
                <button class="btn btn-outline-danger btn-sm" data-delete-id="${row.id}" type="button">Hapus</button>
              </div>
            `,
        },
      ],
      rows: pageState.rows,
      loading: pageState.isTableLoading,
      errorMessage: pageState.tableError,
      pagination: pageState.pagination,
      summaryText: buildPaginationSummary(pageState.pagination),
      emptyMessage: "Belum ada transaksi yang cocok dengan filter.",
    });
  }

  function getTransactionsPayload() {
    return {
      transactionDate: tableQuery.date || undefined,
      query: tableQuery.q || undefined,
      page: tableQuery.page,
      pageSize: PAGE_SIZE,
    };
  }

  async function refreshTransactions({ showPageBusy = false, message = "Memuat transaksi..." } = {}) {
    const requestId = currentTableRequestId + 1;
    currentTableRequestId = requestId;
    const finishBusy = showPageBusy ? setPageBusy(true, message) : () => {};

    pageState.isTableLoading = true;
    renderTransactions();

    try {
      const response = await api.listTransactions(getTransactionsPayload(), session.token);
      if (signal.aborted || requestId !== currentTableRequestId) return;

      pageState.rows = response.data.items;
      pageState.pagination = response.data.pagination;
      pageState.tableError = "";

      if (pageState.pagination && pageState.pagination.page !== tableQuery.page) {
        tableQuery = queryStore.write({ page: pageState.pagination.page });
      }
    } catch (error) {
      if (!signal.aborted && requestId === currentTableRequestId) {
        pageState.tableError = error.message || "Gagal memuat transaksi.";
      }
    } finally {
      if (requestId === currentTableRequestId) {
        pageState.isTableLoading = false;
        renderTransactions();
      }
      finishBusy();
    }
  }

  async function loadReferenceData() {
    const finishBusy = setPageBusy(true, "Memuat data transaksi...");

    try {
      const supplierResponse = await api.listSuppliers({}, session.token);
      if (signal.aborted) return;

      pageState.suppliers = supplierResponse.data.items;
      renderSupplierOptions();
      renderLivePreview();
      await refreshTransactions();
    } finally {
      finishBusy();
    }
  }

  function setEditingTransaction(transaction) {
    fillForm(form, {
      id: transaction.id,
      transactionDate: transaction.transactionDate,
      supplierId: transaction.supplierId,
      itemName: transaction.itemName,
      unitName: transaction.unitName,
      quantity: transaction.quantity,
      remainingQuantity: transaction.remainingQuantity,
      costPrice: transaction.costPrice,
      unitPrice: transaction.unitPrice,
      notes: transaction.notes,
    });
    clearFormErrors(form);
    setEditMode();
    renderLivePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  syncFilterInputs();
  setCreateMode();
  setTodayValue(dateInput);
  renderLivePreview();
  renderTransactions();

  try {
    await loadReferenceData();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat transaksi.", "error");
    }
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const values = serializeForm(form);
      if (!validateForm(values)) return;

      const payload = {
        ...values,
        quantity: toNumber(values.quantity),
        remainingQuantity: toNumber(values.remainingQuantity),
        costPrice: toNumber(values.costPrice),
        unitPrice: toNumber(values.unitPrice),
      };

      const finishBusy = setPageBusy(true, values.id ? "Memperbarui transaksi..." : "Menyimpan transaksi...");

      try {
        await api.saveTransaction(payload, session.token);
        if (signal.aborted) return;

        resetFormState();
        await refreshTransactions();
        if (signal.aborted) return;

        showToast(values.id ? "Transaksi berhasil diperbarui." : "Transaksi berhasil disimpan.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menyimpan transaksi.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );

  resetButton.addEventListener(
    "click",
    () => {
      resetFormState();
    },
    { signal },
  );

  filterResetButton?.addEventListener(
    "click",
    async () => {
      tableQuery = queryStore.reset();
      syncFilterInputs();
      await refreshTransactions();
    },
    { signal },
  );

  ["input", "change"].forEach((eventName) => {
    form.addEventListener(eventName, renderLivePreview, { signal });
  });

  dateFilterInput.addEventListener(
    "change",
    async () => {
      tableQuery = queryStore.write({ date: dateFilterInput.value }, { resetPage: true });
      await refreshTransactions();
    },
    { signal },
  );

  searchFilterInput.addEventListener(
    "input",
    debounce(async () => {
      tableQuery = queryStore.write({ q: searchFilterInput.value.trim() }, { resetPage: true });
      await refreshTransactions();
    }),
    { signal },
  );

  tableRoot.addEventListener(
    "click",
    async (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (pageButton) {
        tableQuery = queryStore.write({ page: pageButton.dataset.paginationPage });
        await refreshTransactions();
        return;
      }

      const editButton = event.target.closest("[data-edit-id]");
      if (editButton) {
        const transaction = pageState.rows.find((item) => item.id === editButton.dataset.editId);
        if (transaction) {
          setEditingTransaction(transaction);
        }
        return;
      }

      const deleteButton = event.target.closest("[data-delete-id]");
      if (!deleteButton) return;

      const confirmed = await confirmDialog({
        title: "Hapus transaksi",
        message: "Transaksi ini akan dihapus dari daftar aktif. Lanjutkan?",
        confirmText: "Hapus",
      });

      if (!confirmed || signal.aborted) return;

      const finishBusy = setPageBusy(true, "Menghapus transaksi...");

      try {
        await api.deleteTransaction(deleteButton.dataset.deleteId, session.token);
        if (signal.aborted) return;

        await refreshTransactions();
        if (signal.aborted) return;

        if (form.elements.namedItem("id")?.value === deleteButton.dataset.deleteId) {
          resetFormState();
        }

        showToast("Transaksi berhasil dihapus.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menghapus transaksi.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );
}
