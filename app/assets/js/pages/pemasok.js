import { api } from "../api.js";
import {
  clearForm,
  clearFormErrors,
  fillForm,
  serializeForm,
  setFieldError,
  setFormMode,
} from "../components/form.js";
import {
  buildClientPagination,
  buildPaginationSummary,
  createQueryStateStore,
  debounce,
} from "../components/table-state.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { getCommissionBaseLabel } from "../finance.js";
import { escapeHtml } from "../utils.js";

const PAGE_SIZE = 10;

export async function initPage({ session, setPageBusy, signal }) {
  const formCard = document.querySelector("#supplier-form-card");
  const form = document.querySelector("#supplier-form");
  const tableRoot = document.querySelector("#suppliers-table");
  const resetButton = document.querySelector("#supplier-reset");
  const statusFilterInput = document.querySelector("#supplier-filter-status");
  const searchFilterInput = document.querySelector("#supplier-filter-search");
  const filterResetButton = document.querySelector("#supplier-filter-reset");

  const queryStore = createQueryStateStore({
    status: { key: "supStatus", defaultValue: "" },
    q: { key: "supQ", defaultValue: "" },
    page: { key: "supPage", defaultValue: 1, type: "number", min: 1 },
  });

  const pageState = {
    suppliers: [],
    isLoading: false,
    errorMessage: "",
  };

  let queryState = queryStore.read();

  function setCreateMode() {
    setFormMode(formCard, "create");
  }

  function setEditMode() {
    setFormMode(formCard, "edit");
  }

  function syncFilterInputs() {
    statusFilterInput.value = queryState.status;
    searchFilterInput.value = queryState.q;
  }

  function resetFormState() {
    clearForm(form);
    fillForm(form, {
      commissionRate: 10,
      commissionBaseType: "revenue",
      payoutTermDays: 1,
      isActive: "true",
    });
    setCreateMode();
  }

  function validateForm(values) {
    clearFormErrors(form);
    let hasError = false;

    if (!String(values.supplierName || "").trim()) {
      setFieldError(form, "supplierName", "Nama pemasok wajib diisi.");
      hasError = true;
    }

    ["commissionRate", "payoutTermDays"].forEach((fieldName) => {
      if (String(values[fieldName] || "").trim() === "") {
        setFieldError(form, fieldName, "Field ini wajib diisi.");
        hasError = true;
      }
    });

    return !hasError;
  }

  function getFilteredSuppliers() {
    const search = queryState.q.toLowerCase();

    return pageState.suppliers.filter((supplier) => {
      const status = supplier.isActive ? "aktif" : "nonaktif";
      const matchStatus = queryState.status ? status === queryState.status : true;
      const matchText = !search || [
        supplier.supplierName,
        supplier.contactName,
        supplier.contactPhone,
        getCommissionBaseLabel(supplier.commissionBaseType),
      ].some((part) => String(part || "").toLowerCase().includes(search));
      return matchStatus && matchText;
    });
  }

  function renderSuppliers() {
    const clientPagination = buildClientPagination(getFilteredSuppliers(), queryState.page, PAGE_SIZE);
    if (clientPagination.pagination.page !== queryState.page) {
      queryState = queryStore.write({ page: clientPagination.pagination.page });
    }

    tableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        {
          key: "contactName",
          label: "Kontak",
          priority: "secondary",
          render: (row) => `
            <div>${escapeHtml(row.contactName || "-")}</div>
            <div class="small text-muted">${escapeHtml(row.contactPhone || "-")}</div>
          `,
        },
        {
          key: "commission",
          label: "Skema komisi",
          render: (row) => `
            <div class="small font-weight-bold text-gray-800">${escapeHtml(getCommissionBaseLabel(row.commissionBaseType))}</div>
            <div class="text-muted">${escapeHtml(String(row.commissionRate))}%</div>
          `,
        },
        {
          key: "payoutTermDays",
          label: "Termin",
          align: "center",
          priority: "secondary",
          render: (row) => `${escapeHtml(String(row.payoutTermDays))} hari`,
        },
        {
          key: "status",
          label: "Status",
          align: "center",
          render: (row) => `<span class="badge badge-${row.isActive ? "success" : "warning"} text-uppercase">${escapeHtml(row.isActive ? "aktif" : "nonaktif")}</span>`,
        },
        {
          key: "actions",
          label: "Aksi",
          align: "center",
          nowrap: true,
          render: (row) => `<button type="button" class="btn btn-outline-primary btn-sm" data-edit-id="${row.id}">Edit</button>`,
        },
      ],
      rows: clientPagination.items,
      loading: pageState.isLoading,
      errorMessage: pageState.errorMessage,
      pagination: clientPagination.pagination,
      summaryText: buildPaginationSummary(clientPagination.pagination),
      emptyMessage: "Belum ada pemasok.",
    });
  }

  async function refreshSuppliers(message = "Memuat data pemasok...") {
    const finishBusy = setPageBusy(true, message);
    pageState.isLoading = true;
    renderSuppliers();

    try {
      const response = await api.listSuppliers({ includeInactive: true }, session.token);
      if (signal.aborted) return;

      pageState.suppliers = response.data.items;
      pageState.errorMessage = "";
    } catch (error) {
      if (!signal.aborted) {
        pageState.errorMessage = error.message || "Gagal memuat pemasok.";
      }
    } finally {
      pageState.isLoading = false;
      renderSuppliers();
      finishBusy();
    }
  }

  syncFilterInputs();
  resetFormState();
  renderSuppliers();

  try {
    await refreshSuppliers();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat pemasok.", "error");
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
        commissionRate: Number(values.commissionRate),
        payoutTermDays: Number(values.payoutTermDays),
        isActive: values.isActive === "true",
      };

      const finishBusy = setPageBusy(true, values.id ? "Memperbarui pemasok..." : "Menyimpan pemasok...");

      try {
        await api.saveSupplier(payload, session.token);
        if (signal.aborted) return;

        resetFormState();
        await refreshSuppliers("Memuat ulang data pemasok...");
        if (signal.aborted) return;

        showToast(values.id ? "Pemasok berhasil diperbarui." : "Pemasok berhasil disimpan.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menyimpan pemasok.", "error");
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

  statusFilterInput.addEventListener(
    "change",
    () => {
      queryState = queryStore.write({ status: statusFilterInput.value }, { resetPage: true });
      renderSuppliers();
    },
    { signal },
  );

  searchFilterInput.addEventListener(
    "input",
    debounce(() => {
      queryState = queryStore.write({ q: searchFilterInput.value.trim() }, { resetPage: true });
      renderSuppliers();
    }),
    { signal },
  );

  filterResetButton?.addEventListener(
    "click",
    () => {
      queryState = queryStore.reset();
      syncFilterInputs();
      renderSuppliers();
    },
    { signal },
  );

  tableRoot.addEventListener(
    "click",
    (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (pageButton) {
        queryState = queryStore.write({ page: pageButton.dataset.paginationPage });
        renderSuppliers();
        return;
      }

      const editButton = event.target.closest("[data-edit-id]");
      if (!editButton) return;

      const supplier = pageState.suppliers.find((item) => item.id === editButton.dataset.editId);
      if (!supplier) return;

      fillForm(form, {
        id: supplier.id,
        supplierName: supplier.supplierName,
        contactName: supplier.contactName,
        contactPhone: supplier.contactPhone,
        commissionRate: supplier.commissionRate,
        commissionBaseType: supplier.commissionBaseType,
        payoutTermDays: supplier.payoutTermDays,
        isActive: supplier.isActive ? "true" : "false",
        notes: supplier.notes,
      });
      clearFormErrors(form);
      setEditMode();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    { signal },
  );
}
