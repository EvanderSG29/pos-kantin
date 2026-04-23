import { api } from "../api.js";
import { clearForm, fillForm, serializeForm } from "../components/form.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../utils.js";

export async function initPage({ session, setPageBusy, signal }) {
  const form = document.querySelector("#user-form");
  const tableRoot = document.querySelector("#users-table");
  const resetButton = document.querySelector("#user-reset");

  let users = [];

  function renderUsers() {
    tableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "fullName", label: "Nama", render: (row) => escapeHtml(row.fullName) },
        { key: "nickname", label: "Panggilan", render: (row) => escapeHtml(row.nickname) },
        { key: "classGroup", label: "Rombel", render: (row) => escapeHtml(row.classGroup || "-") },
        { key: "email", label: "Email", render: (row) => escapeHtml(row.email) },
        { key: "role", label: "Role", render: (row) => `<span class="badge badge-light text-uppercase">${escapeHtml(row.role)}</span>` },
        {
          key: "status",
          label: "Status",
          render: (row) => `<span class="badge badge-${row.status === "aktif" ? "success" : "warning"} text-uppercase">${escapeHtml(row.status)}</span>`,
        },
        {
          key: "actions",
          label: "Aksi",
          render: (row) => `<button type="button" class="btn btn-outline-primary btn-sm" data-edit-id="${row.id}">Edit</button>`,
        },
      ],
      rows: users,
      emptyMessage: "Belum ada user.",
    });
  }

  async function refreshUsers(message = "Memuat data user...") {
    const finishBusy = setPageBusy(true, message);

    try {
      const response = await api.listUsers(session.token);
      if (signal.aborted) return;

      users = response.data;
      renderUsers();
    } finally {
      finishBusy();
    }
  }

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

      const finishBusy = setPageBusy(true, "Menyimpan user...");

      try {
        await api.saveUser(serializeForm(form), session.token);
        if (signal.aborted) return;

        await refreshUsers("Memuat ulang data user...");
        if (signal.aborted) return;

        clearForm(form);
        showToast("User berhasil disimpan.", "success");
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

  resetButton.addEventListener("click", () => clearForm(form), { signal });

  tableRoot.addEventListener(
    "click",
    (event) => {
      const editId = event.target.dataset.editId;
      if (!editId) return;

      const user = users.find((item) => item.id === editId);
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

      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    { signal },
  );
}
