import { renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { getCommissionBaseLabel, getDueStatus } from "../finance.js";
import { escapeHtml, formatCurrency, formatDate, includesText, toNumber } from "../utils.js";

export async function initPage({ session, setPageBusy, signal }) {
  const startInput = document.querySelector("#report-start");
  const endInput = document.querySelector("#report-end");
  const supplierInput = document.querySelector("#report-supplier");
  const commissionTypeInput = document.querySelector("#report-commission-type");
  const searchInput = document.querySelector("#report-search");
  const summaryRoot = document.querySelector("#report-summary");
  const tableRoot = document.querySelector("#report-table");

  let transactions = [];
  let suppliers = [];

  function renderSupplierOptions() {
    supplierInput.innerHTML = `
      <option value="">Semua pemasok</option>
      ${suppliers.map((supplier) => `<option value="${supplier.id}">${escapeHtml(supplier.supplierName)}</option>`).join("")}
    `;
  }

  function getFilteredRows() {
    const start = startInput.value;
    const end = endInput.value;
    const supplierId = supplierInput.value;
    const commissionBaseType = commissionTypeInput.value;
    const query = searchInput.value;

    return transactions.filter((item) => {
      const matchStart = start ? item.transactionDate >= start : true;
      const matchEnd = end ? item.transactionDate <= end : true;
      const matchSupplier = supplierId ? item.supplierId === supplierId : true;
      const matchCommission = commissionBaseType ? item.commissionBaseType === commissionBaseType : true;
      const matchText = includesText([item.supplierName, item.itemName, item.inputByName, item.notes], query);
      return matchStart && matchEnd && matchSupplier && matchCommission && matchText;
    });
  }

  function renderReport() {
    const rows = getFilteredRows();
    const totalGrossSales = rows.reduce((sum, item) => sum + toNumber(item.grossSales), 0);
    const totalProfit = rows.reduce((sum, item) => sum + toNumber(item.profitAmount), 0);
    const totalCommission = rows.reduce((sum, item) => sum + toNumber(item.commissionAmount), 0);
    const totalSupplierNetAmount = rows.reduce((sum, item) => sum + toNumber(item.supplierNetAmount), 0);
    const unsettledSupplierNetAmount = rows
      .filter((item) => !item.supplierPayoutId)
      .reduce((sum, item) => sum + toNumber(item.supplierNetAmount), 0);
    const uniqueSuppliers = new Set(rows.map((item) => item.supplierName)).size;

    renderMetricCards(summaryRoot, [
      { label: "Baris transaksi", value: String(rows.length), note: "Sesuai filter aktif", accent: "primary", icon: "fa-list" },
      { label: "Omzet", value: formatCurrency(totalGrossSales), note: "Total penjualan bersih", accent: "success", icon: "fa-wallet" },
      { label: "Laba", value: formatCurrency(totalProfit), note: "Dasar bagi hasil jika profit", accent: "info", icon: "fa-chart-line" },
      { label: "Hak kantin", value: formatCurrency(totalCommission), note: "Akumulasi komisi", accent: "warning", icon: "fa-percentage" },
      { label: "Hak pemasok", value: formatCurrency(totalSupplierNetAmount), note: `Belum dibayar ${formatCurrency(unsettledSupplierNetAmount)}`, accent: "danger", icon: "fa-file-invoice-dollar" },
      { label: "Pemasok unik", value: String(uniqueSuppliers), note: "Berdasarkan hasil filter", accent: "secondary", icon: "fa-truck-loading" },
    ]);

    tableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        { key: "itemName", label: "Makanan", render: (row) => escapeHtml(row.itemName) },
        { key: "commissionBaseType", label: "Skema", render: (row) => escapeHtml(getCommissionBaseLabel(row.commissionBaseType)) },
        { key: "soldQuantity", label: "Terjual", render: (row) => escapeHtml(String(row.soldQuantity)) },
        { key: "grossSales", label: "Omzet", render: (row) => escapeHtml(formatCurrency(row.grossSales)) },
        { key: "profitAmount", label: "Laba", render: (row) => escapeHtml(formatCurrency(row.profitAmount)) },
        { key: "commissionAmount", label: "Hak kantin", render: (row) => escapeHtml(formatCurrency(row.commissionAmount)) },
        { key: "supplierNetAmount", label: "Hak pemasok", render: (row) => escapeHtml(formatCurrency(row.supplierNetAmount)) },
        {
          key: "payout",
          label: "Status payout",
          render: (row) => {
            if (row.supplierPayoutId) {
              return `<span class="badge badge-success text-uppercase">Sudah dibayar</span>`;
            }

            const dueStatus = getDueStatus(row.payoutDueDate);
            return `
              <div class="small font-weight-bold text-gray-800">${escapeHtml(formatDate(row.payoutDueDate))}</div>
              <span class="badge badge-${dueStatus.code === "overdue" ? "danger" : dueStatus.code === "today" ? "warning" : "info"} text-uppercase">${escapeHtml(dueStatus.label)}</span>
            `;
          },
        },
      ],
      rows,
      emptyMessage: "Belum ada hasil untuk filter ini.",
    });
  }

  const finishBusy = setPageBusy(true, "Memuat laporan transaksi...");

  try {
    const [transactionResponse, supplierResponse] = await Promise.all([
      api.listTransactions({}, session.token),
      api.listSuppliers({}, session.token),
    ]);
    if (signal.aborted) return;

    transactions = transactionResponse.data;
    suppliers = supplierResponse.data;
    renderSupplierOptions();
    renderReport();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat laporan.", "error");
    }
  } finally {
    finishBusy();
  }

  [startInput, endInput, supplierInput, commissionTypeInput, searchInput].forEach((input) => {
    input.addEventListener("input", renderReport, { signal });
    input.addEventListener("change", renderReport, { signal });
  });
}
