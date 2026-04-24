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
import { escapeHtml } from "../utils.js";

const PAGE_SIZE = 10;

export async function initPage({ session, setPageBusy, signal }) {
  const formCard = document.querySelector("#user-form-card");
  const form = document.querySelector("#user-form");
  const tableRoot = document.querySelector("#users-table");
  const resetButton = document.querySelector("#user-reset");
  const statusFilterInput = document.querySelector("#user-filter-status");
  const searchFilterInput = document.querySelector("#user-filter-search");
  const filterResetButton = document.querySelector("#user-filter-reset");

  const queryStore = createQueryStateStore({
    status: { key: "usrStatus", defaultValue: "" },
    q: { key: "usrQ", defaultValue: "" },
    page: { key: "usrPage", defaultValue: 1, type: "number", min: 1 },
  });

  const pageState = {
    users: [],
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
    setCreateMode();
  }

  function validateForm(values) {
    clearFormErrors(form);
    let hasError = false;

    if (!String(values.fullName || "").trim()) {
      setFieldError(form, "fullName", "Nama lengkap wajib diisi.");
      hasError = true;
    }

    if (!String(values.nickname || "").trim()) {
      setFieldError(form, "nickname", "Nama panggilan wajib diisi.");
      hasError = true;
    }

    if (!String(values.email || "").trim()) {
      setFieldError(form, "email", "Email wajib diisi.");
      hasError = true;
    }

    return !hasError;
  }

  function getFilteredUsers() {
    const search = queryState.q.toLowerCase();

    return pageState.users.filter((user) => {
      const matchStatus = queryState.status ? user.status === queryState.status : true;
      const matchText = !search || [user.fullName, user.nickname, user.email, user.role]
        .some((part) => String(part || "").toLowerCase().includes(search));
      return matchStatus && matchText;
    });
  }

  function renderUsers() {
    const clientPagination = buildClientPagination(getFilteredUsers(), queryState.page, PAGE_SIZE);
    if (clientPagination.pagination.page !== queryState.page) {
      queryState = queryStore.write({ page: clientPagination.pagination.page });
    }

    tableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "fullName", label: "Nama", render: (row) => escapeHtml(row.fullName) },
        { key: "nickname", label: "Panggilan", priority: "secondary", render: (row) => escapeHtml(row.nickname) },
        { key: "classGroup", label: "Rombel", priority: "secondary", render: (row) => escapeHtml(row.classGroup || "-") },
        { key: "email", label: "Email", render: (row) => escapeHtml(row.email) },
        { key: "role", label: "Role", align: "center", render: (row) => `<span class="badge badge-light text-uppercase">${escapeHtml(row.role)}</span>` },
        {
          key: "status",
          label: "Status",
          align: "center",
          render: (row) => `<span class="badge badge-${row.status === "aktif" ? "success" : "warning"} text-uppercase">${escapeHtml(row.status)}</span>`,
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
      emptyMessage: "Belum ada user.",
    });
  }

  async function refreshUsers(message = "Memuat data user...") {
    const finishBusy = setPageBusy(true, message);
    pageState.isLoading = true;
    renderUsers();

    try {
      const response = await api.listUsers({}, session.token);
      if (signal.aborted) return;

      pageState.users = response.data.items;
      pageState.errorMessage = "";
    } catch (error) {
      if (!signal.aborted) {
        pageState.errorMessage = error.message || "Gagal memuat user.";
      }
    } finally {
      pageState.isLoading = false;
      renderUsers();
      finishBusy();
    }
  }

  syncFilterInputs();
  setCreateMode();
  renderUsers();

  try {
    await refreshUsers();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat users.", "error");
    }
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const values = serializeForm(form);
      if (!validateForm(values)) return;

      const finishBusy = setPageBusy(true, values.id ? "Memperbarui user..." : "Menyimpan user...");

      try {
        await api.saveUser(values, session.token);
        if (signal.aborted) return;

        resetFormState();
        await refreshUsers("Memuat ulang data user...");
        if (signal.aborted) return;

        showToast(values.id ? "User berhasil diperbarui." : "User berhasil disimpan.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menyimpan user.", "error");
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
      renderUsers();
    },
    { signal },
  );

  searchFilterInput.addEventListener(
    "input",
    debounce(() => {
      queryState = queryStore.write({ q: searchFilterInput.value.trim() }, { resetPage: true });
      renderUsers();
    }),
    { signal },
  );

  filterResetButton?.addEventListener(
    "click",
    () => {
      queryState = queryStore.reset();
      syncFilterInputs();
      renderUsers();
    },
    { signal },
  );

  tableRoot.addEventListener(
    "click",
    (event) => {
      const pageButton = event.target.closest("[data-pagination-page]");
      if (pageButton) {
        queryState = queryStore.write({ page: pageButton.dataset.paginationPage });
        renderUsers();
        return;
      }

      const editButton = event.target.closest("[data-edit-id]");
      if (!editButton) return;

      const user = pageState.users.find((item) => item.id === editButton.dataset.editId);
      if (!user) return;

      fillForm(form, {
        id: user.id,
        fullName: user.fullName,
        nickname: user.nickname,
        classGroup: user.classGroup,
        email: user.email,
        role: user.role,
        status: user.status,
        notes: user.notes,
        pin: "",
      });
      clearFormErrors(form);
      setEditMode();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    { signal },
  );
}
