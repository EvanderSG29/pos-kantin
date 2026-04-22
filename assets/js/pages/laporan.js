import { mountAppShell, renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { requireAuth } from "../guards.js";
import { escapeHtml, formatCurrency, formatDate, includesText, toNumber } from "../utils.js";

let session;
let transactions = [];

function getFilteredRows() {
  const start = document.querySelector("#report-start").value;
  const end = document.querySelector("#report-end").value;
  const query = document.querySelector("#report-search").value;

  return transactions.filter((item) => {
    const matchStart = start ? item.transactionDate >= start : true;
    const matchEnd = end ? item.transactionDate <= end : true;
    const matchText = includesText([item.supplierName, item.itemName, item.inputByName, item.notes], query);
    return matchStart && matchEnd && matchText;
  });
}

function renderReport() {
  const rows = getFilteredRows();
  const totalValue = rows.reduce((sum, item) => sum + toNumber(item.totalValue), 0);
  const totalQuantity = rows.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const totalRemaining = rows.reduce((sum, item) => sum + toNumber(item.remainingQuantity), 0);
  const uniqueSuppliers = new Set(rows.map((item) => item.supplierName)).size;

  renderMetricCards(document.querySelector("#report-summary"), [
    { label: "Baris transaksi", value: String(rows.length), note: "Sesuai filter aktif" },
    { label: "Nilai total", value: formatCurrency(totalValue), note: "Quantity x harga" },
    { label: "Jumlah item", value: String(totalQuantity), note: "Akumulasi quantity" },
    { label: "Sisa stok", value: String(totalRemaining), note: "Akumulasi remaining quantity" },
    { label: "Pemasok unik", value: String(uniqueSuppliers), note: "Berdasarkan hasil filter" },
  ]);

  document.querySelector("#report-table").innerHTML = renderDataTable({
    columns: [
      { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
      { key: "inputByName", label: "Petugas", render: (row) => escapeHtml(row.inputByName) },
      { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
      { key: "itemName", label: "Makanan", render: (row) => escapeHtml(row.itemName) },
      { key: "quantity", label: "Jumlah", render: (row) => escapeHtml(String(row.quantity)) },
      { key: "totalValue", label: "Nilai", render: (row) => escapeHtml(formatCurrency(row.totalValue)) },
    ],
    rows,
    emptyMessage: "Belum ada hasil untuk filter ini.",
  });
}

async function init() {
  session = await requireAuth({ roles: ["petugas", "admin"] });
  if (!session) return;

  mountAppShell({ title: "Laporan", pageKey: "reports", session });

  try {
    const response = await api.listTransactions({}, session.token);
    transactions = response.data;
    renderReport();
  } catch (error) {
    showToast(error.message || "Gagal memuat laporan.", "error");
  }

  document.querySelector("#report-start").addEventListener("input", renderReport);
  document.querySelector("#report-end").addEventListener("input", renderReport);
  document.querySelector("#report-search").addEventListener("input", renderReport);
}

init();

