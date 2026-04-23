import { api } from "../api.js";
import { confirmDialog } from "../components/modal.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { createId, escapeHtml, formatCurrency, formatDate, formatDateTime, includesText, toNumber } from "../utils.js";

function setTodayValue(input) {
  if (input && !input.value) {
    input.value = new Date().toISOString().slice(0, 10);
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
  const changeFilterStatusInput = document.querySelector("#change-filter-status");
  const changeFilterDateInput = document.querySelector("#change-filter-date");
  const changeFilterSearchInput = document.querySelector("#change-filter-search");
  const buyerFilterStatusInput = document.querySelector("#buyer-filter-status");
  const buyerFilterSearchInput = document.querySelector("#buyer-filter-search");

  const dailyFinanceTableRoot = document.querySelector("#daily-finance-table");
  const changeBookTableRoot = document.querySelector("#change-book-table");
  const buyersBalanceTableRoot = document.querySelector("#buyers-balance-table");

  const pageState = {
    buyers: [],
    dailyFinance: [],
    changeEntries: [],
    editorEntries: [createEmptyEditorEntry()],
  };

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

  function resetForm() {
    form.reset();
    formIdInput.value = "";
    pageState.editorEntries = [createEmptyEditorEntry()];
    setTodayValue(financeDateInput);
    renderEditor();
  }

  function applyDailyFinanceFilters() {
    return pageState.dailyFinance.filter((item) => {
      const matchDate = financeFilterDateInput.value ? item.financeDate === financeFilterDateInput.value : true;
      const matchText = includesText([item.notes, item.createdByName], financeFilterSearchInput.value);
      return matchDate && matchText;
    });
  }

  function applyChangeFilters() {
    return pageState.changeEntries.filter((item) => {
      const matchStatus = changeFilterStatusInput.value ? item.status === changeFilterStatusInput.value : true;
      const matchDate = changeFilterDateInput.value ? item.financeDate === changeFilterDateInput.value : true;
      const matchText = includesText([item.buyerNameSnapshot, item.notes, item.createdByName], changeFilterSearchInput.value);
      return matchStatus && matchDate && matchText;
    });
  }

  function applyBuyerFilters() {
    return pageState.buyers.filter((item) => {
      const matchStatus = buyerFilterStatusInput.value ? item.status === buyerFilterStatusInput.value : true;
      const matchText = includesText([item.buyerName, item.classOrCategory, item.status], buyerFilterSearchInput.value);
      return matchStatus && matchText;
    });
  }

  function renderDailyFinanceTable() {
    dailyFinanceTableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "financeDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.financeDate)) },
        { key: "createdByName", label: "Petugas", render: (row) => escapeHtml(row.createdByName) },
        { key: "grossAmount", label: "Gross", render: (row) => escapeHtml(formatCurrency(row.grossAmount)) },
        { key: "changeTotal", label: "Kembalian", render: (row) => escapeHtml(formatCurrency(row.changeTotal)) },
        { key: "netAmount", label: "Net", render: (row) => escapeHtml(formatCurrency(row.netAmount)) },
        {
          key: "pendingChangeCount",
          label: "Status",
          render: (row) => `${buildStatusBadge(row.pendingChangeCount > 0 ? "belum" : "selesai")} <div class="small text-muted mt-1">${escapeHtml(`${row.pendingChangeCount}/${row.changeEntryCount} pending`)}</div>`,
        },
        {
          key: "actions",
          label: "Aksi",
          render: (row) => `
            <div class="pos-table-actions">
              <button type="button" class="btn btn-outline-primary btn-sm" data-edit-finance-id="${row.id}">Edit</button>
              <button type="button" class="btn btn-outline-danger btn-sm" data-delete-finance-id="${row.id}">Hapus</button>
            </div>
          `,
        },
      ],
      rows: applyDailyFinanceFilters(),
      emptyMessage: "Belum ada catatan keuangan harian.",
    });
  }

  function renderChangeBookTable() {
    changeBookTableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "financeDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.financeDate)) },
        { key: "buyerNameSnapshot", label: "Pembeli", render: (row) => escapeHtml(row.buyerNameSnapshot) },
        { key: "changeAmount", label: "Nominal", render: (row) => escapeHtml(formatCurrency(row.changeAmount)) },
        { key: "status", label: "Status", render: (row) => buildStatusBadge(row.status) },
        {
          key: "settledAt",
          label: "Penyelesaian",
          render: (row) => row.settledAt
            ? `${escapeHtml(formatDateTime(row.settledAt))}<div class="small text-muted">${escapeHtml(row.settledByName || "-")}</div>`
            : `<span class="text-muted">Belum selesai</span>`,
        },
        { key: "createdByName", label: "Petugas", render: (row) => escapeHtml(row.createdByName) },
        { key: "notes", label: "Catatan", render: (row) => escapeHtml(row.notes || "-") },
        {
          key: "actions",
          label: "Aksi",
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
      rows: applyChangeFilters(),
      emptyMessage: "Belum ada data buku kembalian.",
    });
  }

  function renderBuyerBalanceTable() {
    buyersBalanceTableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "buyerName", label: "Nama pembeli", render: (row) => escapeHtml(row.buyerName) },
        { key: "classOrCategory", label: "Kelas / kategori", render: (row) => escapeHtml(row.classOrCategory) },
        { key: "openingBalance", label: "Saldo awal", render: (row) => escapeHtml(formatCurrency(row.openingBalance)) },
        { key: "currentBalance", label: "Saldo saat ini", render: (row) => escapeHtml(formatCurrency(row.currentBalance)) },
        { key: "status", label: "Status", render: (row) => buildStatusBadge(row.status) },
        { key: "lastImportedAt", label: "Import terakhir", render: (row) => escapeHtml(row.lastImportedAt ? formatDateTime(row.lastImportedAt) : "-") },
      ],
      rows: applyBuyerFilters(),
      emptyMessage: "Belum ada master pembeli.",
    });
  }

  function renderAllTables() {
    renderDailyFinanceTable();
    renderChangeBookTable();
    renderBuyerBalanceTable();
  }

  async function refreshCollections(message = "Memuat data keuangan...") {
    const finishBusy = setPageBusy(true, message);

    try {
      const [buyersResponse, financeResponse, changeEntriesResponse] = await Promise.all([
        api.listBuyers({}, session.token),
        api.listDailyFinance({}, session.token),
        api.listChangeEntries({}, session.token),
      ]);

      if (signal.aborted) return;

      pageState.buyers = buyersResponse.data;
      pageState.dailyFinance = financeResponse.data;
      pageState.changeEntries = changeEntriesResponse.data;
      renderAllTables();
      renderEditor();
    } finally {
      finishBusy();
    }
  }

  async function loadFinanceDetail(financeId, { scroll = true } = {}) {
    const finishBusy = setPageBusy(true, "Memuat detail keuangan harian...");

    try {
      const response = await api.getDailyFinanceDetail(financeId, session.token);
      if (signal.aborted) return;

      const { finance, changeEntries } = response.data;
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

  resetForm();

  try {
    await refreshCollections("Memuat data keuangan harian...");
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
      resetForm();
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

      const finishBusy = setPageBusy(true, "Menyimpan keuangan harian...");

      try {
        await api.saveDailyFinance(payload, session.token);
        if (signal.aborted) return;

        await refreshCollections("Memuat ulang data keuangan...");
        if (signal.aborted) return;

        resetForm();
        showToast("Data keuangan harian berhasil disimpan.", "success");
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

  dailyFinanceTableRoot.addEventListener(
    "click",
    async (event) => {
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

        await refreshCollections("Memuat ulang data keuangan...");
        if (signal.aborted) return;

        if (formIdInput.value === deleteButton.dataset.deleteFinanceId) {
          resetForm();
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

        await refreshCollections("Memuat ulang buku kembalian...");
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

  [
    financeFilterDateInput,
    financeFilterSearchInput,
    changeFilterStatusInput,
    changeFilterDateInput,
    changeFilterSearchInput,
    buyerFilterStatusInput,
    buyerFilterSearchInput,
  ].forEach((input) => {
    input.addEventListener("input", renderAllTables, { signal });
    input.addEventListener("change", renderAllTables, { signal });
  });
}
