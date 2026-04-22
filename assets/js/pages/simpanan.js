import { mountAppShell } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { requireAuth } from "../guards.js";
import { escapeHtml, formatCurrency, formatDate } from "../utils.js";

async function init() {
  const session = await requireAuth({ roles: ["petugas", "admin"] });
  if (!session) return;

  mountAppShell({ title: "Simpanan", pageKey: "savings", session });

  try {
    const response = await api.listSavings(session.token);
    document.querySelector("#savings-table").innerHTML = renderDataTable({
      columns: [
        { key: "studentId", label: "NIS", render: (row) => escapeHtml(row.studentId) },
        { key: "studentName", label: "Nama", render: (row) => escapeHtml(row.studentName) },
        { key: "className", label: "Kelas", render: (row) => escapeHtml(row.className) },
        { key: "groupName", label: "Kelompok", render: (row) => escapeHtml(row.groupName) },
        { key: "depositAmount", label: "Input", render: (row) => escapeHtml(formatCurrency(row.depositAmount)) },
        { key: "changeBalance", label: "Sisa", render: (row) => escapeHtml(formatCurrency(row.changeBalance)) },
        { key: "recordedAt", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.recordedAt)) },
      ],
      rows: response.data,
      emptyMessage: "Belum ada data simpanan.",
    });
  } catch (error) {
    showToast(error.message || "Gagal memuat data simpanan.", "error");
  }
}

init();

