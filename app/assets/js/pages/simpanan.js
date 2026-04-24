import { api } from "../api.js";
import {
  clearForm,
  clearFormErrors,
  setFieldError,
  setFormMode,
} from "../components/form.js";
import { confirmDialog } from "../components/modal.js";
import {
  buildClientPagination,
  buildPaginationSummary,
  createQueryStateStore,
  debounce,
} from "../components/table-state.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { toLocalIsoDate } from "../finance.js";
import { createId, escapeHtml, formatCurrency, formatDate, formatDateTime, toNumber } from "../utils.js";

const PAGE_SIZE = 10;

function setTodayValue(input) {
  if (input) {
    input.value = toLocalIsoDate();
  }
}

function createEmptyEditorEntry() {
  return {
    clientId: createId("ROW"),
    id: "",
    buyerId: "",
    changeAmount: "",
    notes: "",
    status: "belum",
  };
}

function buildStatusBadge(status) {
  const badgeClass = status === "selesai" ? "success" : "warning";
  return `<span class="badge badge-${badgeClass} text-uppercase">${escapeHtml(status)}</span>`;
}

export async function initPage({ session, setPageBusy, signal }) {
  const formCard = document.querySelector("#daily-finance-form-card");
  const form = document.querySelector("#daily-finance-form");
  const formIdInput = form.elements.namedItem("id");
  const financeDateInput = form.elements.namedItem("financeDate");
  const grossAmountInput = form.elements.namedItem("grossAmount");
  const changeTotalInput = form.elements.namedItem("changeTotal");
  const netAmountInput = form.elements.namedItem("netAmount");
  const notesInput = form.elements.namedItem("notes");
  const financeBalanceNote = document.querySelector("#finance-balance-note");
  const changeEntryEditor = document.querySelector("#change-entry-editor");
  const addChangeEntryButton = document.querySelector("#add-change-entry");
  const resetButton = document.querySelector("#daily-finance-reset");

  const financeFilterDateInput = document.querySelector("#finance-filter-date");
  const financeFilterSearchInput = document.querySelector("#finance-filter-search");
  const financeFilterResetButton = document.querySelector("#finance-filter-reset");
  const changeFilterStatusInput = document.querySelector("#change-filter-status");
  const changeFilterDateInput = document.querySelector("#change-filter-date");
  const changeFilterSearchInput = document.querySelector("#change-filter-search");
  const changeFilterResetButton = document.querySelector("#change-filter-reset");
  const buyerFilterStatusInput = document.querySelector("#buyer-filter-status");
  const buyerFilterSearchInput = document.querySelector("#buyer-filter-search");
  const buyerFilterResetButton = document.querySelector("#buyer-filter-reset");

  const dailyFinanceTableRoot = document.querySelector("#daily-finance-table");
  const changeBookTableRoot = document.querySelector("#change-book-table");
  const buyersBalanceTableRoot = document.querySelector("#buyers-balance-table");

  const financeQueryStore = createQueryStateStore({
    date: { key: "finDate", defaultValue: "" },
    q: { key: "finQ", defaultValue: "" },
    page: { key: "finPage", defaultValue: 1, type: "number", min: 1 },
  });
  const changeQueryStore = createQueryStateStore({
    status: { key: "chgStatus", defaultValue: "" },
    date: { key: "chgDate", defaultValue: "" },
    q: { key: "chgQ", defaultValue: "" },
    page: { key: "chgPage", defaultValue: 1, type: "number", min: 1 },
  });
  const buyerQueryStore = createQueryStateStore({
    status: { key: "buyStatus", defaultValue: "" },
    q: { key: "buyQ", defaultValue: "" },
    page: { key: "buyPage", defaultValue: 1, type: "number", min: 1 },
  });

  const pageState = {
    buyers: [],
    dailyFinanceRows: [],
    changeRows: [],
    dailyFinancePagination: null,
    changePagination: null,
    buyersError: "",
    dailyFinanceError: "",
    changeError: "",
    isBuyersLoading: false,
    isDailyFinanceLoading: false,
    isChangeLoading: false,
    editorEntries: [createEmptyEditorEntry()],
  };

  let financeQuery = financeQueryStore.read();
  let changeQuery = changeQueryStore.read();
  let buyerQuery = buyerQueryStore.read();
  let financeRequestId = 0;
  let changeRequestId = 0;
  let buyersRequestId = 0;

  function setCreateMode() {
    setFormMode(formCard, "create");
  }

  function setEditMode() {
    setFormMode(formCard, "edit");
  }

  function syncFilterInputs() {
    financeFilterDateInput.value = financeQuery.date;
    financeFilterSearchInput.value = financeQuery.q;
    changeFilterStatusInput.value = changeQuery.status;
    changeFilterDateInput.value = changeQuery.date;
    changeFilterSearchInput.value = changeQuery.q;
    buyerFilterStatusInput.value = buyerQuery.status;
    buyerFilterSearchInput.value = buyerQuery.q;
  }

  function getBuyerOptions() {
    const referencedBuyerIds = new Set(
      pageState.editorEntries
        .map((item) => item.buyerId)
        .filter(Boolean),
    );

    return [...pageState.buyers]
      .filter((buyer) => buyer.status === "aktif" || referencedBuyerIds.has(buyer.id))
      .sort((left, right) => left.buyerName.localeCompare(right.buyerName));
  }

  function syncFinanceDerivedFields() {
    const grossAmount = toNumber(grossAmountInput.value, 0);
    const changeTotal = toNumber(changeTotalInput.value, 0);
    const detailTotal = pageState.editorEntries.reduce((sum, item) => sum + toNumber(item.changeAmount, 0), 0);
    const netAmount = grossAmount - changeTotal;

    netAmountInput.value = Number.isFinite(netAmount) ? String(netAmount) : "0";

    const diff = changeTotal - detailTotal;
    const hasMismatch = diff !== 0;

    financeBalanceNote.classList.toggle("text-danger", hasMismatch);
    financeBalanceNote.classList.toggle("font-weight-bold", hasMismatch);
    financeBalanceNote.textContent = `Rincian kembalian ${formatCurrency(detailTotal)}. Selisih dengan total manual: ${formatCurrency(diff)}.`;
  }

  function renderEditor() {
    const buyerOptions = getBuyerOptions();

    changeEntryEditor.innerHTML = `
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-0 pos-finance-entry-table">
          <thead class="thead-light">
            <tr>
              <th>Pembeli</th>
              <th>Nominal</th>
              <th>Status</th>
              <th>Catatan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${pageState.editorEntries.map((entry, index) => {
              const isLocked = entry.status === "selesai";
              return `
                <tr data-entry-index="${index}">
                  <td>
                    <input type="hidden" data-field="id" value="${escapeHtml(entry.id || "")}">
                    <select class="custom-select" data-field="buyerId" ${isLocked ? "disabled" : ""}>
                      <option value="">Pilih pembeli</option>
                      ${buyerOptions.map((buyer) => `
                        <option value="${buyer.id}" ${entry.buyerId === buyer.id ? "selected" : ""}>
                          ${escapeHtml(`${buyer.buyerName} (${buyer.classOrCategory})${buyer.status === "nonaktif" ? " - nonaktif" : ""}`)}
                        </option>
                      `).join("")}
                    </select>
                  </td>
                  <td>
                    <input class="form-control" type="number" min="0" step="500" data-field="changeAmount" value="${escapeHtml(String(entry.changeAmount ?? ""))}" ${isLocked ? "disabled" : ""}>
                  </td>
                  <td>${buildStatusBadge(entry.status || "belum")}</td>
                  <td>
                    <input class="form-control" type="text" data-field="notes" value="${escapeHtml(entry.notes || "")}" placeholder="Catatan singkat">
                  </td>
                  <td>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-action="remove-entry" ${isLocked ? "disabled" : ""}>Hapus</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <small class="form-text text-muted mt-2">Setiap pembeli hanya boleh muncul sekali dalam satu catatan harian. Status selesai dikelola dari tabel buku kembalian.</small>
    `;

    syncFinanceDerivedFields();
  }

  function resetFormState() {
    clearForm(form);
    formIdInput.value = "";
    pageState.editorEntries = [createEmptyEditorEntry()];
    setTodayValue(financeDateInput);
    clearFormErrors(form);
    setCreateMode();
    renderEditor();
  }

  function getDailyFinancePayload() {
    return {
      financeDate: financeQuery.date || undefined,
      query: financeQuery.q || undefined,
      page: financeQuery.page,
      pageSize: PAGE_SIZE,
    };
  }

  function getChangePayload() {
    return {
      status: changeQuery.status || undefined,
      financeDate: changeQuery.date || undefined,
      query: changeQuery.q || undefined,
      page: changeQuery.page,
      pageSize: PAGE_SIZE,
    };
  }

  function getFilteredBuyerRows() {
    return pageState.buyers.filter((item) => {
      const matchStatus = buyerQuery.status ? item.status === buyerQuery.status : true;
      const search = buyerQuery.q.toLowerCase();
      const matchText = !search || [item.buyerName, item.classOrCategory, item.status]
        .some((part) => String(part || "").toLowerCase().includes(search));
      return matchStatus && matchText;
    });
  }

  function renderDailyFinanceTable() {
    dailyFinanceTableRoot.innerHTML = renderDataTable({
      columns: [
        {
          key: "financeDate",
          label: "Tanggal",
          nowrap: true,
          render: (row) => escapeHtml(formatDate(row.financeDate)),
        },
        {
          key: "createdByName",
          label: "Petugas",
          render: (row) => escapeHtml(row.createdByName),
        },
        {
          key: "grossAmount",
          label: "Gross",
          align: "right",
          render: (row) => escapeHtml(formatCurrency(row.grossAmount)),
        },
        {
          key: "changeTotal",
          label: "Kembalian",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(formatCurrency(row.changeTotal)),
        },
        {
          key: "netAmount",
          label: "Net",
          align: "right",
          render: (row) => escapeHtml(formatCurrency(row.netAmount)),
        },
        {
          key: "pendingChangeCount",
          label: "Status",
          align: "center",
          priority: "secondary",
          render: (row) => `
            ${buildStatusBadge(row.pendingChangeCount > 0 ? "belum" : "selesai")}
            <div class="small text-muted mt-1">${escapeHtml(`${row.pendingChangeCount}/${row.changeEntryCount} pending`)}</div>
          `,
        },
        {
          key: "actions",
          label: "Aksi",
          align: "center",
          nowrap: true,
          render: (row) => `
            <div class="pos-table-actions justify-content-center">
              <button type="button" class="btn btn-outline-primary btn-sm" data-edit-finance-id="${row.id}">Edit</button>
              <button type="button" class="btn btn-outline-danger btn-sm" data-delete-finance-id="${row.id}">Hapus</button>
            </div>
          `,
        },
      ],
      rows: pageState.dailyFinanceRows,
      loading: pageState.isDailyFinanceLoading,
      errorMessage: pageState.dailyFinanceError,
      pagination: pageState.dailyFinancePagination,
      summaryText: buildPaginationSummary(pageState.dailyFinancePagination),
      emptyMessage: "Belum ada catatan keuangan harian.",
    });
  }

  function renderChangeBookTable() {
    changeBookTableRoot.innerHTML = renderDataTable({
      columns: [
        {
          key: "financeDate",
          label: "Tanggal",
          nowrap: true,
          render: (row) => escapeHtml(formatDate(row.financeDate)),
        },
        {
          key: "buyerNameSnapshot",
          label: "Pembeli",
          render: (row) => escapeHtml(row.buyerNameSnapshot),
        },
        {
          key: "changeAmount",
          label: "Nominal",
          align: "right",
          render: (row) => escapeHtml(formatCurrency(row.changeAmount)),
        },
        {
          key: "status",
          label: "Status",
          align: "center",
          render: (row) => buildStatusBadge(row.status),
        },
        {
          key: "settledAt",
          label: "Penyelesaian",
          priority: "secondary",
          render: (row) => row.settledAt
            ? `${escapeHtml(formatDateTime(row.settledAt))}<div class="small text-muted">${escapeHtml(row.settledByName || "-")}</div>`
            : `<span class="text-muted">Belum selesai</span>`,
        },
        {
          key: "createdByName",
          label: "Petugas",
          priority: "secondary",
          render: (row) => escapeHtml(row.createdByName),
        },
        {
          key: "notes",
          label: "Catatan",
          priority: "tertiary",
          render: (row) => escapeHtml(row.notes || "-"),
        },
        {
          key: "actions",
          label: "Aksi",
          align: "center",
          nowrap: true,
          render: (row) => `
            <button
              type="button"
              class="btn btn-sm ${row.status === "selesai" ? "btn-outline-warning" : "btn-outline-success"}"
              data-toggle-change-status-id="${row.id}"
              data-next-status="${row.status === "selesai" ? "belum" : "selesai"}"
            >
              ${escapeHtml(row.status === "selesai" ? "Batalkan selesai" : "Tandai selesai")}
            </button>
          `,
        },
      ],
      rows: pageState.changeRows,
      loading: pageState.isChangeLoading,
      errorMessage: pageState.changeError,
      pagination: pageState.changePagination,
      summaryText: buildPaginationSummary(pageState.changePagination),
      emptyMessage: "Belum ada data buku kembalian.",
    });
  }

  function renderBuyerBalanceTable() {
    const clientPagination = buildClientPagination(getFilteredBuyerRows(), buyerQuery.page, PAGE_SIZE);

    if (clientPagination.pagination.page !== buyerQuery.page) {
      buyerQuery = buyerQueryStore.write({ page: clientPagination.pagination.page });
    }

    buyersBalanceTableRoot.innerHTML = renderDataTable({
      columns: [
        {
          key: "buyerName",
          label: "Nama pembeli",
          render: (row) => escapeHtml(row.buyerName),
        },
        {
          key: "classOrCategory",
          label: "Kelas / kategori",
          render: (row) => escapeHtml(row.classOrCategory),
        },
        {
          key: "openingBalance",
          label: "Saldo awal",
          align: "right",
          priority: "secondary",
          render: (row) => escapeHtml(formatCurrency(row.openingBalance)),
        },
        {
          key: "currentBalance",
          label: "Saldo saat ini",
          align: "right",
          render: (row) => escapeHtml(formatCurrency(row.currentBalance)),
        },
        {
          key: "status",
          label: "Status",
          align: "center",
          render: (row) => buildStatusBadge(row.status),
        },
        {
          key: "lastImportedAt",
          label: "Import terakhir",
          priority: "secondary",
          render: (row) => escapeHtml(row.lastImportedAt ? formatDateTime(row.lastImportedAt) : "-"),
        },
      ],
      rows: clientPagination.items,
      loading: pageState.isBuyersLoading,
      errorMessage: pageState.buyersError,
      pagination: clientPagination.pagination,
      summaryText: buildPaginationSummary(clientPagination.pagination),
      emptyMessage: "Belum ada master pembeli.",
    });
  }

  async function refreshBuyers() {
    const requestId = buyersRequestId + 1;
    buyersRequestId = requestId;
    pageState.isBuyersLoading = true;
    renderBuyerBalanceTable();

    try {
      const response = await api.listBuyers({}, session.token);
      if (signal.aborted || requestId !== buyersRequestId) return;

      pageState.buyers = response.data.items;
      pageState.buyersError = "";
      renderEditor();
    } catch (error) {
      if (!signal.aborted && requestId === buyersRequestId) {
        pageState.buyersError = error.message || "Gagal memuat master pembeli.";
      }
    } finally {
      if (requestId === buyersRequestId) {
        pageState.isBuyersLoading = false;
        renderBuyerBalanceTable();
      }
    }
  }

  async function refreshDailyFinance() {
    const requestId = financeRequestId + 1;
    financeRequestId = requestId;
    pageState.isDailyFinanceLoading = true;
    renderDailyFinanceTable();

    try {
      const response = await api.listDailyFinance(getDailyFinancePayload(), session.token);
      if (signal.aborted || requestId !== financeRequestId) return;

      pageState.dailyFinanceRows = response.data.items;
      pageState.dailyFinancePagination = response.data.pagination;
      pageState.dailyFinanceError = "";

      if (pageState.dailyFinancePagination.page !== financeQuery.page) {
        financeQuery = financeQueryStore.write({ page: pageState.dailyFinancePagination.page });
      }
    } catch (error) {
      if (!signal.aborted && requestId === financeRequestId) {
        pageState.dailyFinanceError = error.message || "Gagal memuat keuangan harian.";
      }
    } finally {
      if (requestId === financeRequestId) {
        pageState.isDailyFinanceLoading = false;
        renderDailyFinanceTable();
      }
    }
  }

  async function refreshChangeEntries() {
    const requestId = changeRequestId + 1;
    changeRequestId = requestId;
    pageState.isChangeLoading = true;
    renderChangeBookTable();

    try {
      const response = await api.listChangeEntries(getChangePayload(), session.token);
      if (signal.aborted || requestId !== changeRequestId) return;

      pageState.changeRows = response.data.items;
      pageState.changePagination = response.data.pagination;
      pageState.changeError = "";

      if (pageState.changePagination.page !== changeQuery.page) {
        changeQuery = changeQueryStore.write({ page: pageState.changePagination.page });
      }
    } catch (error) {
      if (!signal.aborted && requestId === changeRequestId) {
        pageState.changeError = error.message || "Gagal memuat buku kembalian.";
      }
    } finally {
      if (requestId === changeRequestId) {
        pageState.isChangeLoading = false;
        renderChangeBookTable();
      }
    }
  }

  async function loadFinanceDetail(financeId, { scroll = true } = {}) {
    const finishBusy = setPageBusy(true, "Memuat detail keuangan harian...");

    try {
      const response = await api.getDailyFinanceDetail(financeId, session.token);
      if (signal.aborted) return;

      const finance = response.data.finance;
      const changeEntries = response.data.changeEntries;

      formIdInput.value = finance.id;
      financeDateInput.value = finance.financeDate;
      grossAmountInput.value = String(finance.grossAmount);
      changeTotalInput.value = String(finance.changeTotal);
      netAmountInput.value = String(finance.netAmount);
      notesInput.value = finance.notes || "";
      pageState.editorEntries = changeEntries.length
        ? changeEntries.map((item) => ({
          clientId: createId("ROW"),
          id: item.id,
          buyerId: item.buyerId,
          changeAmount: String(item.changeAmount),
          notes: item.notes || "",
          status: item.status,
        }))
        : [createEmptyEditorEntry()];

      clearFormErrors(form);
      setEditMode();
      renderEditor();

      if (scroll) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      finishBusy();
    }
  }

  function collectEditorEntries() {
    const activeRows = pageState.editorEntries.filter((item) => {
      return item.buyerId || String(item.changeAmount ?? "").trim() || String(item.notes ?? "").trim();
    });

    if (!activeRows.length && toNumber(changeTotalInput.value, 0) > 0) {
      throw new Error("Total kembalian diisi, tetapi rincian per pembeli masih kosong.");
    }

    return activeRows.map((item, index) => {
      if (!item.buyerId) {
        throw new Error(`Baris kembalian ${index + 1} wajib memilih pembeli.`);
      }

      if (String(item.changeAmount ?? "").trim() === "") {
        throw new Error(`Baris kembalian ${index + 1} wajib mengisi nominal.`);
      }

      return {
        id: item.id || undefined,
        buyerId: item.buyerId,
        changeAmount: toNumber(item.changeAmount, 0),
        notes: item.notes || "",
      };
    });
  }

  function validateFinanceForm() {
    clearFormErrors(form);
    let hasError = false;

    if (!financeDateInput.value) {
      setFieldError(form, "financeDate", "Tanggal wajib diisi.");
      hasError = true;
    }

    if (String(grossAmountInput.value).trim() === "") {
      setFieldError(form, "grossAmount", "Total uang masuk wajib diisi.");
      hasError = true;
    }

    if (String(changeTotalInput.value).trim() === "") {
      setFieldError(form, "changeTotal", "Total uang kembalian wajib diisi.");
      hasError = true;
    }

    if (toNumber(grossAmountInput.value, -1) < 0) {
      setFieldError(form, "grossAmount", "Total uang masuk tidak boleh negatif.");
      hasError = true;
    }

    if (toNumber(changeTotalInput.value, -1) < 0) {
      setFieldError(form, "changeTotal", "Total uang kembalian tidak boleh negatif.");
      hasError = true;
    }

    return !hasError;
  }

  syncFilterInputs();
  setCreateMode();
  resetFormState();
  renderDailyFinanceTable();
  renderChangeBookTable();
  renderBuyerBalanceTable();

  try {
    const finishBusy = setPageBusy(true, "Memuat data keuangan harian...");
    try {
      await Promise.all([
        refreshBuyers(),
        refreshDailyFinance(),
        refreshChangeEntries(),
      ]);
    } finally {
      finishBusy();
    }
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat data keuangan.", "error");
    }
  }

  [grossAmountInput, changeTotalInput].forEach((input) => {
    input.addEventListener("input", syncFinanceDerivedFields, { signal });
  });

  addChangeEntryButton.addEventListener(
    "click",
    () => {
      pageState.editorEntries.push(createEmptyEditorEntry());
      renderEditor();
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

  changeEntryEditor.addEventListener(
    "input",
    (event) => {
      const row = event.target.closest("[data-entry-index]");
      if (!row) return;

      const entry = pageState.editorEntries[Number(row.dataset.entryIndex)];
      if (!entry) return;

      if (event.target.dataset.field === "changeAmount") {
        entry.changeAmount = event.target.value;
      }

      if (event.target.dataset.field === "notes") {
        entry.notes = event.target.value;
      }

      syncFinanceDerivedFields();
    },
    { signal },
  );

  changeEntryEditor.addEventListener(
    "change",
    (event) => {
      const row = event.target.closest("[data-entry-index]");
      if (!row) return;

      const entry = pageState.editorEntries[Number(row.dataset.entryIndex)];
      if (!entry) return;

      if (event.target.dataset.field === "buyerId") {
        entry.buyerId = event.target.value;
      }

      syncFinanceDerivedFields();
    },
    { signal },
  );

  changeEntryEditor.addEventListener(
    "click",
    (event) => {
      const removeButton = event.target.closest("[data-action='remove-entry']");
      if (!removeButton) return;

      const row = removeButton.closest("[data-entry-index]");
      const entryIndex = Number(row?.dataset.entryIndex ?? -1);
      if (entryIndex < 0) return;

      pageState.editorEntries.splice(entryIndex, 1);
      if (!pageState.editorEntries.length) {
        pageState.editorEntries = [createEmptyEditorEntry()];
      }
      renderEditor();
    },
    { signal },
  );

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      if (!validateFinanceForm()) return;

      let payload;
      try {
        payload = {
          id: formIdInput.value || undefined,
          financeDate: financeDateInput.value,
          grossAmount: toNumber(grossAmountInput.value, 0),
          changeTotal: toNumber(changeTotalInput.value, 0),
          notes: notesInput.value,
          changeEntries: collectEditorEntries(),
        };
      } catch (error) {
        showToast(error.message, "error");
        return;
      }

      const finishBusy = setPageBusy(true, payload.id ? "Memperbarui keuangan harian..." : "Menyimpan keuangan harian...");

      try {
        await api.saveDailyFinance(payload, session.token);
        if (signal.aborted) return;

        resetFormState();
        await Promise.all([
          refreshDailyFinance(),
          refreshChangeEntries(),
        ]);
        if (signal.aborted) return;

        showToast(payload.id ? "Data keuangan harian berhasil diperbarui." : "Data keuangan harian berhasil disimpan.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menyimpan keuangan harian.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );

  financeFilterDateInput.addEventListener(
    "change",
    async () => {
      financeQuery = financeQueryStore.write({ date: financeFilterDateInput.value }, { resetPage: true });
      await refreshDailyFinance();
    },
    { signal },
  );

  financeFilterSearchInput.addEventListener(
    "input",
    debounce(async () => {
      financeQuery = financeQueryStore.write({ q: financeFilterSearchInput.value.trim() }, { resetPage: true });
      await refreshDailyFinance();
    }),
    { signal },
  );

  financeFilterResetButton?.addEventListener(
    "click",
    async () => {
      financeQuery = financeQueryStore.reset();
      syncFilterInputs();
      await refreshDailyFinance();
    },
    { signal },
  );

  changeFilterStatusInput.addEventListener(
    "change",
    async () => {
      changeQuery = changeQueryStore.write({ status: changeFilterStatusInput.value }, { resetPage: true });
      await refreshChangeEntries();
    },
    { signal },
  );

  changeFilterDateInput.addEventListener(
    "change",
    async () => {
      changeQuery = changeQueryStore.write({ date: changeFilterDateInput.value }, { resetPage: true });
      await refreshChangeEntries();
    },
    { signal },
  );

  changeFilterSearchInput.addEventListener(
    "input",
    debounce(async () => {
      changeQuery = changeQueryStore.write({ q: changeFilterSearchInput.value.trim() }, { resetPage: true });
      await refreshChangeEntries();
    }),
    { signal },
  );

  changeFilterResetButton?.addEventListener(
    "click",
    async () => {
      changeQuery = changeQueryStore.reset();
      syncFilterInputs();
      await refreshChangeEntries();
    },
    { signal },
  );

  buyerFilterStatusInput.addEventListener(
    "change",
    () => {
      buyerQuery = buyerQueryStore.write({ status: buyerFilterStatusInput.value }, { resetPage: true });
      renderBuyerBalanceTable();
    },
    { signal },
  );

  buyerFilterSearchInput.addEventListener(
    "input",
    debounce(() => {
      buyerQuery = buyerQueryStore.write({ q: buyerFilterSearchInput.value.trim() }, { resetPage: true });
      renderBuyerBalanceTable();
    }),
    { signal },
  );

  buyerFilterResetButton?.addEventListener(
    "click",
    () => {
      buyerQuery = buyerQueryStore.reset();
      syncFilterInputs();
      renderBuyerBalanceTable();
    },
    { signal },
  );

  dailyFinanceTableRoot.addEventListener(
    "click",
    async (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (pageButton) {
        financeQuery = financeQueryStore.write({ page: pageButton.dataset.paginationPage });
        await refreshDailyFinance();
        return;
      }

      const editButton = event.target.closest("[data-edit-finance-id]");
      if (editButton) {
        try {
          await loadFinanceDetail(editButton.dataset.editFinanceId);
        } catch (error) {
          if (!signal.aborted) {
            showToast(error.message || "Gagal memuat detail keuangan harian.", "error");
          }
        }
        return;
      }

      const deleteButton = event.target.closest("[data-delete-finance-id]");
      if (!deleteButton) return;

      const confirmed = await confirmDialog({
        title: "Hapus catatan keuangan",
        message: "Catatan harian ini akan dihapus secara soft delete. Lanjutkan?",
        confirmText: "Hapus",
      });

      if (!confirmed || signal.aborted) return;

      const finishBusy = setPageBusy(true, "Menghapus catatan keuangan...");

      try {
        await api.deleteDailyFinance(deleteButton.dataset.deleteFinanceId, session.token);
        if (signal.aborted) return;

        await Promise.all([
          refreshDailyFinance(),
          refreshChangeEntries(),
        ]);
        if (signal.aborted) return;

        if (formIdInput.value === deleteButton.dataset.deleteFinanceId) {
          resetFormState();
        }

        showToast("Catatan keuangan harian berhasil dihapus.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menghapus catatan keuangan.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );

  changeBookTableRoot.addEventListener(
    "click",
    async (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (pageButton) {
        changeQuery = changeQueryStore.write({ page: pageButton.dataset.paginationPage });
        await refreshChangeEntries();
        return;
      }

      const button = event.target.closest("[data-toggle-change-status-id]");
      if (!button) return;

      const finishBusy = setPageBusy(true, "Memperbarui status kembalian...");

      try {
        await api.updateChangeEntryStatus(
          button.dataset.toggleChangeStatusId,
          button.dataset.nextStatus,
          session.token,
        );
        if (signal.aborted) return;

        await Promise.all([
          refreshDailyFinance(),
          refreshChangeEntries(),
        ]);
        if (signal.aborted) return;

        if (formIdInput.value) {
          await loadFinanceDetail(formIdInput.value, { scroll: false });
        }

        showToast("Status kembalian berhasil diperbarui.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal memperbarui status kembalian.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );

  buyersBalanceTableRoot.addEventListener(
    "click",
    (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (!pageButton) return;

      buyerQuery = buyerQueryStore.write({ page: pageButton.dataset.paginationPage });
      renderBuyerBalanceTable();
    },
    { signal },
  );
}
