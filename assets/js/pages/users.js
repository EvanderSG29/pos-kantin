import { mountAppShell } from "../app.js";
import { api } from "../api.js";
import { clearForm, fillForm, serializeForm } from "../components/form.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { requireAuth } from "../guards.js";
import { escapeHtml } from "../utils.js";

let session;
let users = [];

function renderUsers() {
  document.querySelector("#users-table").innerHTML = renderDataTable({
    columns: [
      { key: "fullName", label: "Nama", render: (row) => escapeHtml(row.fullName) },
      { key: "nickname", label: "Panggilan", render: (row) => escapeHtml(row.nickname) },
      { key: "classGroup", label: "Rombel", render: (row) => escapeHtml(row.classGroup || "-") },
      { key: "email", label: "Email", render: (row) => escapeHtml(row.email) },
      { key: "role", label: "Role", render: (row) => `<span class="pill pill--muted">${escapeHtml(row.role)}</span>` },
      { key: "status", label: "Status", render: (row) => `<span class="pill ${row.status === "aktif" ? "pill--success" : "pill--warning"}">${escapeHtml(row.status)}</span>` },
      {
        key: "actions",
        label: "Aksi",
        render: (row) => `<button type="button" class="button button--ghost" data-edit-id="${row.id}">Edit</button>`,
      },
    ],
    rows: users,
    emptyMessage: "Belum ada user.",
  });
}

async function refreshUsers() {
  const response = await api.listUsers(session.token);
  users = response.data;
  renderUsers();
}

async function init() {
  session = await requireAuth({ roles: ["admin"] });
  if (!session) return;

  mountAppShell({ title: "Users", pageKey: "users", session });

  try {
    await refreshUsers();
  } catch (error) {
    showToast(error.message || "Gagal memuat users.", "error");
  }

  const form = document.querySelector("#user-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = serializeForm(form);

    try {
      await api.saveUser(values, session.token);
      await refreshUsers();
      clearForm(form);
      showToast("User berhasil disimpan.", "success");
    } catch (error) {
      showToast(error.message || "Gagal menyimpan user.", "error");
    }
  });

  document.querySelector("#user-reset").addEventListener("click", () => clearForm(form));

  document.querySelector("#users-table").addEventListener("click", (event) => {
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
  });
}

init();

