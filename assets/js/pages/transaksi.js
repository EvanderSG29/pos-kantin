import { api } from "../api.js";
import { confirmDialog } from "../components/modal.js";
import { clearForm, fillForm, serializeForm } from "../components/form.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import {
  calculateTransactionMetrics,
  getCommissionBaseDescription,
  getCommissionBaseLabel,
  getDueStatus,
  toLocalIsoDate,
} from "../finance.js";
import { escapeHtml, formatCurrency, formatDate, includesText, toNumber } from "../utils.js";

function getDueStatusBadge(statusCode) {
  switch (statusCode) {
    case "settled":
      return "success";
    case "overdue":
      return "danger";
    case "today":
      return "warning";
    default:
      return "info";
  }
}

function setTodayValue(input) {
  if (input) {
    input.value = toLocalIsoDate();
  }
}

function renderSupplierRules(supplier) {
  if (!supplier) {
    return `
      <div class="alert alert-light border mb-0">
        Pilih pemasok untuk melihat skema komisi dan termin pembayaran yang akan dipakai.
      </div>
    `;
  }

  return `
    <div class="pos-finance-meta-grid">
      <article class="pos-finance-meta-card">
        <div class="small text-uppercase text-muted mb-1">Skema komisi</div>
        <div class="font-weight-bold text-gray-800">${escapeHtml(getCommissionBaseLabel(supplier.commissionBaseType))}</div>
        <div class="small text-gray-600">${escapeHtml(getCommissionBaseDescription(supplier.commissionBaseType))}</div>
      </article>
      <article class="pos-finance-meta-card">
        <div class="small text-uppercase text-muted mb-1">Potongan</div>
        <div class="font-weight-bold text-gray-800">${escapeHtml(String(supplier.commissionRate))}%</div>
        <div class="small text-gray-600">Snapshot ini disalin ke transaksi saat disimpan.</div>
      </article>
      <article class="pos-finance-meta-card">
        <div class="small text-uppercase text-muted mb-1">Termin payout</div>
        <div class="font-weight-bold text-gray-800">${escapeHtml(String(supplier.payoutTermDays))} hari</div>
        <div class="small text-gray-600">Transaksi akan jatuh tempo sesuai master pemasok.</div>
      </article>
    </div>
  `;
}

function renderPreview({ supplier, values }) {
  if (!supplier) {
    return `
      <div class="border rounded bg-white px-4 py-5 text-center text-gray-500 pos-empty-state">
        <i class="fas fa-calculator fa-2x mb-3 text-gray-300"></i>
        <p class="mb-0">Pilih pemasok untuk memulai preview perhitungan.</p>
      </div>
    `;
  }

  const metrics = calculateTransactionMetrics({
    quantity: values.quantity,
    remainingQuantity: values.remainingQuantity,
    costPrice: values.costPrice,
    unitPrice: values.unitPrice,
    commissionRate: supplier.commissionRate,
    commissionBaseType: supplier.commissionBaseType,
    payoutTermDays: supplier.payoutTermDays,
    transactionDate: values.transactionDate,
  });
  const dueStatus = getDueStatus(metrics.payoutDueDate);

  return `
    <div class="pos-finance-preview-grid">
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Terjual</span>
        <strong>${escapeHtml(String(metrics.soldQuantity))}</strong>
        <div class="small text-gray-600">Dari ${escapeHtml(String(metrics.quantity))} titip, sisa ${escapeHtml(String(metrics.remainingQuantity))}</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Omzet</span>
        <strong>${escapeHtml(formatCurrency(metrics.grossSales))}</strong>
        <div class="small text-gray-600">Harga jual x jumlah terjual</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Laba</span>
        <strong>${escapeHtml(formatCurrency(metrics.profitAmount))}</strong>
        <div class="small text-gray-600">Harga jual dikurangi modal</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Hak kantin</span>
        <strong>${escapeHtml(formatCurrency(metrics.commissionAmount))}</strong>
        <div class="small text-gray-600">${escapeHtml(getCommissionBaseLabel(supplier.commissionBaseType))} ${escapeHtml(String(supplier.commissionRate))}%</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Hak pemasok</span>
        <strong>${escapeHtml(formatCurrency(metrics.supplierNetAmount))}</strong>
        <div class="small text-gray-600">Omzet dikurangi hak kantin</div>
      </article>
      <article class="pos-finance-preview-card">
        <span class="text-muted small text-uppercase d-block mb-1">Jatuh tempo</span>
        <strong>${escapeHtml(metrics.payoutDueDate ? formatDate(metrics.payoutDueDate) : "-")}</strong>
        <div class="small text-gray-600">${escapeHtml(dueStatus.label)}</div>
      </article>
    </div>
  `;
}

export async function initPage({ session, setPageBusy, signal }) {
  const form = document.querySelector("#transaction-form");
  const dateInput = document.querySelector("#transactionDate");
  const supplierSelect = document.querySelector("#supplierId");
  const rulesRoot = document.querySelector("#supplier-rules");
  const previewRoot = document.querySelector("#transaction-preview");
  const tableRoot = document.querySelector("#transaction-table");
  const dateFilterInput = document.querySelector("#filter-date");
  const searchFilterInput = document.querySelector("#filter-search");
  const resetButton = document.querySelector("#transaction-reset");

  let transactions = [];
  let suppliers = [];

  function getSelectedSupplier() {
    return suppliers.find((item) => item.id === supplierSelect.value) ?? null;
  }

  function renderSupplierOptions() {
    supplierSelect.innerHTML = `
      <option value="">Pilih pemasok</option>
      ${suppliers
        .filter((supplier) => supplier.isActive !== false)
        .map((supplier) => `
          <option value="${supplier.id}">
            ${escapeHtml(supplier.supplierName)} • ${escapeHtml(getCommissionBaseLabel(supplier.commissionBaseType))} ${escapeHtml(String(supplier.commissionRate))}% • ${escapeHtml(String(supplier.payoutTermDays))}h
          </option>
        `)
        .join("")}
    `;
  }

  function renderLivePreview() {
    const values = serializeForm(form);
    const supplier = getSelectedSupplier();
    rulesRoot.innerHTML = renderSupplierRules(supplier);
    previewRoot.innerHTML = renderPreview({
      supplier,
      values: {
        transactionDate: values.transactionDate,
        quantity: toNumber(values.quantity, 0),
        remainingQuantity: toNumber(values.remainingQuantity, 0),
        costPrice: toNumber(values.costPrice, 0),
        unitPrice: toNumber(values.unitPrice, 0),
      },
    });
  }

  function getFilteredTransactions() {
    const dateFilter = dateFilterInput.value;
    const searchFilter = searchFilterInput.value;

    return transactions.filter((item) => {
      const matchDate = dateFilter ? item.transactionDate === dateFilter : true;
      const matchText = includesText([item.itemName, item.supplierName, item.inputByName, item.notes], searchFilter);
      return matchDate && matchText;
    });
  }

  function renderTransactions() {
    tableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        { key: "itemName", label: "Makanan", render: (row) => escapeHtml(row.itemName) },
        { key: "soldQuantity", label: "Terjual", render: (row) => escapeHtml(String(row.soldQuantity)) },
        {
          key: "commissionBaseType",
          label: "Skema",
          render: (row) => `
            <div class="small font-weight-bold text-gray-800">${escapeHtml(getCommissionBaseLabel(row.commissionBaseType))}</div>
            <div class="text-muted">${escapeHtml(String(row.commissionRate))}%</div>
          `,
        },
        { key: "grossSales", label: "Omzet", render: (row) => escapeHtml(formatCurrency(row.grossSales)) },
        { key: "commissionAmount", label: "Hak kantin", render: (row) => escapeHtml(formatCurrency(row.commissionAmount)) },
        { key: "supplierNetAmount", label: "Hak pemasok", render: (row) => escapeHtml(formatCurrency(row.supplierNetAmount)) },
        {
          key: "payoutDueDate",
          label: "Payout",
          render: (row) => {
            const status = row.supplierPayoutId ? { code: "settled", label: "Sudah dibayar" } : getDueStatus(row.payoutDueDate);
            return `
              <div class="small font-weight-bold text-gray-800">${escapeHtml(formatDate(row.payoutDueDate))}</div>
              <span class="badge badge-${getDueStatusBadge(status.code)} text-uppercase">${escapeHtml(status.label)}</span>
            `;
          },
        },
        {
          key: "actions",
          label: "Aksi",
          render: (row) => row.supplierPayoutId
            ? `<span class="badge badge-success text-uppercase">Locked</span>`
            : `
              <div class="pos-table-actions">
                <button class="btn btn-outline-primary btn-sm" data-edit-id="${row.id}" type="button">Edit</button>
                <button class="btn btn-outline-danger btn-sm" data-delete-id="${row.id}" type="button">Hapus</button>
              </div>
            `,
        },
      ],
      rows: getFilteredTransactions(),
      emptyMessage: "Belum ada transaksi yang cocok dengan filter.",
    });
  }

  function setEditingTransaction(transaction) {
    fillForm(form, {
      id: transaction.id,
      transactionDate: transaction.transactionDate,
      supplierId: transaction.supplierId,
      itemName: transaction.itemName,
      unitName: transaction.unitName,
      quantity: transaction.quantity,
      remainingQuantity: transaction.remainingQuantity,
      costPrice: transaction.costPrice,
      unitPrice: transaction.unitPrice,
      notes: transaction.notes,
    });
    renderLivePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshData(message = "Memuat transaksi...") {
    const finishBusy = setPageBusy(true, message);

    try {
      const [supplierResponse, transactionResponse] = await Promise.all([
        api.listSuppliers({}, session.token),
        api.listTransactions({}, session.token),
      ]);

      if (signal.aborted) return;

      suppliers = supplierResponse.data;
      transactions = transactionResponse.data;
      renderSupplierOptions();
      renderLivePreview();
      renderTransactions();
    } finally {
      finishBusy();
    }
  }

  setTodayValue(dateInput);
  renderLivePreview();

  try {
    await refreshData("Memuat data transaksi...");
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat transaksi.", "error");
    }
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const values = serializeForm(form);
      const payload = {
        ...values,
        quantity: toNumber(values.quantity),
        remainingQuantity: toNumber(values.remainingQuantity),
        costPrice: toNumber(values.costPrice),
        unitPrice: toNumber(values.unitPrice),
      };

      const finishBusy = setPageBusy(true, "Menyimpan transaksi...");

      try {
        await api.saveTransaction(payload, session.token);
        if (signal.aborted) return;

        await refreshData("Memuat ulang transaksi...");
        if (signal.aborted) return;

        clearForm(form);
        setTodayValue(dateInput);
        renderLivePreview();
        showToast("Transaksi berhasil disimpan.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menyimpan transaksi.", "error");
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
      clearForm(form);
      setTodayValue(dateInput);
      renderLivePreview();
    },
    { signal },
  );

  ["input", "change"].forEach((eventName) => {
    form.addEventListener(eventName, renderLivePreview, { signal });
  });

  dateFilterInput.addEventListener("input", renderTransactions, { signal });
  searchFilterInput.addEventListener("input", renderTransactions, { signal });

  tableRoot.addEventListener(
    "click",
    async (event) => {
      const editId = event.target.dataset.editId;
      const deleteId = event.target.dataset.deleteId;

      if (editId) {
        const transaction = transactions.find((item) => item.id === editId);
        if (transaction) {
          setEditingTransaction(transaction);
        }
        return;
      }

      if (!deleteId) return;

      const confirmed = await confirmDialog({
        title: "Hapus transaksi",
        message: "Transaksi ini akan dihapus dari daftar aktif. Lanjutkan?",
        confirmText: "Hapus",
      });

      if (!confirmed || signal.aborted) return;

      const finishBusy = setPageBusy(true, "Menghapus transaksi...");

      try {
        await api.deleteTransaction(deleteId, session.token);
        if (signal.aborted) return;

        await refreshData("Memuat ulang transaksi...");
        if (signal.aborted) return;

        clearForm(form);
        setTodayValue(dateInput);
        renderLivePreview();
        showToast("Transaksi berhasil dihapus.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menghapus transaksi.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );
}
