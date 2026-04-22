import { mountAppShell } from "../app.js";
import { api } from "../api.js";
import { confirmDialog } from "../components/modal.js";
import { clearForm, fillForm, serializeForm } from "../components/form.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { requireAuth } from "../guards.js";
import { formatCurrency, formatDate, escapeHtml, includesText, toNumber } from "../utils.js";

let session;
let transactions = [];
let suppliers = [];

function renderSupplierOptions() {
  const select = document.querySelector("#supplierId");
  select.innerHTML = `
    <option value="">Pilih pemasok</option>
    ${suppliers
      .map((supplier) => `<option value="${supplier.id}">${escapeHtml(supplier.supplierName)}</option>`)
      .join("")}
  `;
}

function getFilteredTransactions() {
  const dateFilter = document.querySelector("#filter-date").value;
  const searchFilter = document.querySelector("#filter-search").value;

  return transactions.filter((item) => {
    const matchDate = dateFilter ? item.transactionDate === dateFilter : true;
    const matchText = includesText([item.itemName, item.supplierName, item.inputByName, item.notes], searchFilter);
    return matchDate && matchText;
  });
}

function renderTransactions() {
  const tableRoot = document.querySelector("#transaction-table");
  const rows = getFilteredTransactions();

  tableRoot.innerHTML = renderDataTable({
    columns: [
      { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
      { key: "inputByName", label: "Petugas", render: (row) => escapeHtml(row.inputByName) },
      { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
      { key: "itemName", label: "Makanan", render: (row) => escapeHtml(row.itemName) },
      { key: "quantity", label: "Jumlah", render: (row) => escapeHtml(String(row.quantity)) },
      { key: "remainingQuantity", label: "Sisa", render: (row) => escapeHtml(String(row.remainingQuantity)) },
      { key: "totalValue", label: "Nilai", render: (row) => escapeHtml(formatCurrency(row.totalValue)) },
      {
        key: "actions",
        label: "Aksi",
        render: (row) => `
          <div class="table-actions">
            <button class="button button--ghost" data-edit-id="${row.id}" type="button">Edit</button>
            <button class="button button--danger" data-delete-id="${row.id}" type="button">Hapus</button>
          </div>
        `,
      },
    ],
    rows,
    emptyMessage: "Belum ada transaksi yang cocok dengan filter.",
  });
}

function setEditingTransaction(transaction) {
  const form = document.querySelector("#transaction-form");
  fillForm(form, {
    id: transaction.id,
    transactionDate: transaction.transactionDate,
    supplierId: transaction.supplierId,
    supplierName: transaction.supplierId ? "" : transaction.supplierName,
    itemName: transaction.itemName,
    unitName: transaction.unitName,
    quantity: transaction.quantity,
    remainingQuantity: transaction.remainingQuantity,
    unitPrice: transaction.unitPrice,
    notes: transaction.notes,
  });
}

async function refreshData() {
  const [supplierResponse, transactionResponse] = await Promise.all([
    api.listSuppliers(session.token),
    api.listTransactions({}, session.token),
  ]);
  suppliers = supplierResponse.data;
  transactions = transactionResponse.data;
  renderSupplierOptions();
  renderTransactions();
}

async function init() {
  session = await requireAuth({ roles: ["petugas", "admin"] });
  if (!session) return;

  mountAppShell({ title: "Transaksi", pageKey: "transactions", session });
  document.querySelector("#transactionDate").value = new Date().toISOString().slice(0, 10);

  try {
    await refreshData();
  } catch (error) {
    showToast(error.message || "Gagal memuat transaksi.", "error");
  }

  const form = document.querySelector("#transaction-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = serializeForm(form);
    const payload = {
      ...values,
      quantity: toNumber(values.quantity),
      remainingQuantity: toNumber(values.remainingQuantity),
      unitPrice: toNumber(values.unitPrice),
    };

    try {
      await api.saveTransaction(payload, session.token);
      await refreshData();
      clearForm(form);
      document.querySelector("#transactionDate").value = new Date().toISOString().slice(0, 10);
      showToast("Transaksi berhasil disimpan.", "success");
    } catch (error) {
      showToast(error.message || "Gagal menyimpan transaksi.", "error");
    }
  });

  document.querySelector("#transaction-reset").addEventListener("click", () => {
    clearForm(form);
    document.querySelector("#transactionDate").value = new Date().toISOString().slice(0, 10);
  });

  document.querySelector("#filter-date").addEventListener("input", renderTransactions);
  document.querySelector("#filter-search").addEventListener("input", renderTransactions);

  document.querySelector("#transaction-table").addEventListener("click", async (event) => {
    const editId = event.target.dataset.editId;
    const deleteId = event.target.dataset.deleteId;

    if (editId) {
      const transaction = transactions.find((item) => item.id === editId);
      if (transaction) setEditingTransaction(transaction);
    }

    if (deleteId) {
      const confirmed = await confirmDialog({
        title: "Hapus transaksi",
        message: "Transaksi ini akan dihapus dari daftar aktif. Lanjutkan?",
        confirmText: "Hapus",
      });
      if (!confirmed) return;

      try {
        await api.deleteTransaction(deleteId, session.token);
        await refreshData();
        showToast("Transaksi berhasil dihapus.", "success");
      } catch (error) {
        showToast(error.message || "Gagal menghapus transaksi.", "error");
      }
    }
  });
}

init();

