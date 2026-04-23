import { renderMetricCards } from "../app.js";
import { api } from "../api.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { getCommissionBaseLabel } from "../finance.js";
import { escapeHtml, formatCurrency, formatDate, formatDateTime } from "../utils.js";

function normalizeCsvHeader(value = "") {
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "_");
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .map((cells) => cells.map((item) => String(item ?? "").trim()))
    .filter((cells) => cells.some((item) => item !== ""));
}

function parseCsvCurrency(rawValue) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) {
    return { error: "saldo_awal wajib diisi." };
  }

  const sanitized = normalized.replace(/[^0-9-]/g, "");
  if (!sanitized || sanitized === "-") {
    return { error: "saldo_awal harus berupa angka." };
  }

  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed)) {
    return { error: "saldo_awal harus berupa angka." };
  }

  if (parsed < 0) {
    return { error: "saldo_awal tidak boleh negatif." };
  }

  return { value: parsed };
}

function buildImportPreview(text) {
  const rows = parseCsvText(text);
  if (rows.length < 2) {
    return {
      headers: [],
      rows: [],
      previewRows: [],
      errors: ["File CSV kosong atau hanya berisi header."],
    };
  }

  const headerRow = rows[0].map(normalizeCsvHeader);
  const columnIndex = {
    buyerName: headerRow.findIndex((header) => header === "nama_pembeli"),
    classOrCategory: headerRow.findIndex((header) => [
      "kelas/kategori",
      "kelas_kategori",
      "kelas",
      "kategori",
    ].includes(header)),
    openingBalance: headerRow.findIndex((header) => header === "saldo_awal"),
  };

  const errors = [];

  if (columnIndex.buyerName < 0) errors.push("Header `nama_pembeli` tidak ditemukan.");
  if (columnIndex.classOrCategory < 0) errors.push("Header `kelas/kategori` tidak ditemukan.");
  if (columnIndex.openingBalance < 0) errors.push("Header `saldo_awal` tidak ditemukan.");

  if (errors.length) {
    return {
      headers: headerRow,
      rows: [],
      previewRows: [],
      errors,
    };
  }

  const normalizedRows = [];
  const seenKeys = new Set();

  rows.slice(1).forEach((cells, rowIndex) => {
    const displayRow = rowIndex + 2;
    const buyerName = String(cells[columnIndex.buyerName] ?? "").trim();
    const classOrCategory = String(cells[columnIndex.classOrCategory] ?? "").trim();
    const balanceResult = parseCsvCurrency(cells[columnIndex.openingBalance]);

    if (!buyerName) {
      errors.push(`Baris ${displayRow}: nama_pembeli wajib diisi.`);
      return;
    }

    if (!classOrCategory) {
      errors.push(`Baris ${displayRow}: kelas/kategori wajib diisi.`);
      return;
    }

    if (balanceResult.error) {
      errors.push(`Baris ${displayRow}: ${balanceResult.error}`);
      return;
    }

    const matchKey = `${buyerName.trim().toLowerCase()}||${classOrCategory.trim().toLowerCase()}`;
    if (seenKeys.has(matchKey)) {
      errors.push(`Baris ${displayRow}: kombinasi nama_pembeli dan kelas/kategori duplikat di file.`);
      return;
    }
    seenKeys.add(matchKey);

    normalizedRows.push({
      nama_pembeli: buyerName,
      "kelas/kategori": classOrCategory,
      saldo_awal: balanceResult.value,
    });
  });

  return {
    headers: headerRow,
    rows: normalizedRows,
    previewRows: normalizedRows.slice(0, 10),
    errors,
  };
}

function renderFinanceSummary(summary) {
  if (!summary?.latestDailyFinance) {
    return `
      <div class="border rounded bg-white px-4 py-5 text-center text-gray-500 pos-empty-state">
        <i class="fas fa-wallet fa-2x mb-3 text-gray-300"></i>
        <p class="mb-0">Belum ada catatan keuangan harian.</p>
      </div>
    `;
  }

  const latest = summary.latestDailyFinance;

  return `
    <div class="pos-inline-metrics">
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">Tanggal terbaru</span>
        <strong>${escapeHtml(formatDate(latest.financeDate))}</strong>
      </article>
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">Gross</span>
        <strong>${escapeHtml(formatCurrency(latest.grossAmount))}</strong>
      </article>
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">Kembalian</span>
        <strong>${escapeHtml(formatCurrency(latest.changeTotal))}</strong>
      </article>
      <article class="pos-inline-metric">
        <span class="text-muted small text-uppercase d-block mb-1">Net</span>
        <strong>${escapeHtml(formatCurrency(latest.netAmount))}</strong>
      </article>
    </div>
    <div class="alert alert-light border mb-0">
      <div class="small text-uppercase text-muted mb-1">Pending kembalian</div>
      <div class="font-weight-bold text-gray-800 mb-1">${escapeHtml(String(summary.pendingChangeCount))} pembeli</div>
      <div class="text-gray-700">${escapeHtml(formatCurrency(summary.pendingChangeAmount))}</div>
    </div>
  `;
}

function renderPayoutBuckets(buckets = []) {
  if (!buckets.length) {
    return `
      <div class="border rounded bg-white px-4 py-5 text-center text-gray-500 pos-empty-state">
        <i class="fas fa-file-invoice-dollar fa-2x mb-3 text-gray-300"></i>
        <p class="mb-0">Belum ada bucket payout aktif.</p>
      </div>
    `;
  }

  return `
    <div class="pos-payout-bucket-grid">
      ${buckets.map((bucket) => `
        <article class="pos-payout-bucket-card">
          <div class="small text-uppercase text-muted mb-1">Termin ${escapeHtml(String(bucket.payoutTermDays))} hari</div>
          <div class="h5 mb-1 font-weight-bold text-gray-800">${escapeHtml(String(bucket.count))} payout</div>
          <div class="text-gray-700">${escapeHtml(formatCurrency(bucket.totalSupplierNetAmount))}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderImportSummary(preview) {
  if (!preview) {
    return `
      <div class="alert alert-light border mb-0">
        Pilih file CSV untuk melihat preview sebelum import.
      </div>
    `;
  }

  if (preview.errors.length) {
    return `
      <div class="alert alert-warning mb-0">
        Preview menemukan ${escapeHtml(String(preview.errors.length))} masalah. Perbaiki file CSV sebelum import.
      </div>
    `;
  }

  return `
    <div class="alert alert-success mb-0">
      Preview valid. ${escapeHtml(String(preview.rows.length))} baris siap diimport.
    </div>
  `;
}

function renderImportErrors(preview) {
  if (!preview?.errors?.length) return "";

  return `
    <div class="alert alert-danger mb-0">
      <h6 class="font-weight-bold">Masalah CSV</h6>
      <ul class="mb-0 pl-3">
        ${preview.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderImportPreviewTable(preview) {
  if (!preview?.previewRows?.length) {
    return `
      <div class="border rounded bg-white px-4 py-5 text-center text-gray-500 pos-empty-state">
        <i class="fas fa-file-csv fa-2x mb-3 text-gray-300"></i>
        <p class="mb-0">Preview baris CSV akan muncul di sini.</p>
      </div>
    `;
  }

  return renderDataTable({
    columns: [
      { key: "nama_pembeli", label: "Nama pembeli", render: (row) => escapeHtml(row.nama_pembeli) },
      { key: "kelas/kategori", label: "Kelas / kategori", render: (row) => escapeHtml(row["kelas/kategori"]) },
      { key: "saldo_awal", label: "Saldo awal", render: (row) => escapeHtml(formatCurrency(row.saldo_awal)) },
    ],
    rows: preview.previewRows,
    emptyMessage: "Tidak ada preview CSV.",
  });
}

export async function initPage({ session, setPageBusy, signal }) {
  const summaryRoot = document.querySelector("#summary-cards");
  const recentTransactionsRoot = document.querySelector("#recent-transactions");
  const latestFinanceRoot = document.querySelector("#latest-finance-summary");
  const payoutBucketsRoot = document.querySelector("#payout-buckets");
  const importForm = document.querySelector("#buyer-import-form");
  const fileInput = document.querySelector("#buyer-import-file");
  const importButton = document.querySelector("#buyer-import-submit");
  const importResetButton = document.querySelector("#buyer-import-reset");
  const importSummaryRoot = document.querySelector("#buyer-import-summary");
  const importErrorsRoot = document.querySelector("#buyer-import-errors");
  const importPreviewRoot = document.querySelector("#buyer-import-preview");
  const importResultRoot = document.querySelector("#buyer-import-result");

  let importPreview = null;

  function renderImportState() {
    importSummaryRoot.innerHTML = renderImportSummary(importPreview);
    importErrorsRoot.innerHTML = renderImportErrors(importPreview);
    importPreviewRoot.innerHTML = renderImportPreviewTable(importPreview);
    importButton.disabled = !importPreview?.rows?.length || Boolean(importPreview.errors.length);
  }

  async function refreshDashboard(message = "Memuat dashboard admin...") {
    const finishBusy = setPageBusy(true, message);

    try {
      const summary = await api.dashboardSummary(session.token);
      if (signal.aborted) return;

      const metrics = [
        { label: "Omzet hari ini", value: formatCurrency(summary.data.todayGrossSales), note: `${summary.data.todayTransactionCount} transaksi`, accent: "primary", icon: "fa-cash-register" },
        { label: "Hak kantin", value: formatCurrency(summary.data.todayCommission), note: "Komisi transaksi hari ini", accent: "success", icon: "fa-percentage" },
        { label: "Utang jatuh tempo", value: formatCurrency(summary.data.dueSupplierDebtAmount), note: "Outstanding due hari ini atau lewat", accent: "warning", icon: "fa-file-invoice" },
        { label: "Payout overdue", value: String(summary.data.overdueSupplierPayoutCount), note: formatCurrency(summary.data.overdueSupplierPayoutAmount), accent: "danger", icon: "fa-exclamation-triangle" },
        { label: "Pembeli aktif", value: String(summary.data.activeBuyerCount), note: "Master pembeli aktif", accent: "info", icon: "fa-users" },
        { label: "Pending kembalian", value: String(summary.data.pendingChangeCount), note: formatCurrency(summary.data.pendingChangeAmount), accent: "secondary", icon: "fa-hand-holding-usd" },
      ];

      renderMetricCards(summaryRoot, metrics);
      latestFinanceRoot.innerHTML = renderFinanceSummary(summary.data);
      payoutBucketsRoot.innerHTML = renderPayoutBuckets(summary.data.outstandingPayoutBuckets ?? []);
      recentTransactionsRoot.innerHTML = renderDataTable({
        columns: [
          { key: "transactionDate", label: "Tanggal", render: (row) => escapeHtml(formatDate(row.transactionDate)) },
          { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
          { key: "itemName", label: "Makanan", render: (row) => escapeHtml(row.itemName) },
          { key: "commissionBaseType", label: "Skema", render: (row) => escapeHtml(getCommissionBaseLabel(row.commissionBaseType)) },
          { key: "grossSales", label: "Omzet", render: (row) => escapeHtml(formatCurrency(row.grossSales)) },
          { key: "commissionAmount", label: "Hak kantin", render: (row) => escapeHtml(formatCurrency(row.commissionAmount)) },
        ],
        rows: summary.data.recentTransactions,
        emptyMessage: "Belum ada transaksi terbaru.",
      });
    } finally {
      finishBusy();
    }
  }

  async function readImportFile(file) {
    if (!file) {
      importPreview = null;
      renderImportState();
      return;
    }

    const finishBusy = setPageBusy(true, "Membaca file CSV...");

    try {
      const rawText = await file.text();
      if (signal.aborted) return;

      importPreview = buildImportPreview(rawText);
      renderImportState();
    } finally {
      finishBusy();
    }
  }

  renderImportState();

  try {
    await refreshDashboard();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat dashboard admin.", "error");
    }
  }

  fileInput.addEventListener(
    "change",
    async () => {
      importResultRoot.innerHTML = "";
      try {
        await readImportFile(fileInput.files?.[0]);
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal membaca file CSV.", "error");
        }
      }
    },
    { signal },
  );

  importResetButton.addEventListener(
    "click",
    () => {
      fileInput.value = "";
      importPreview = null;
      importResultRoot.innerHTML = "";
      renderImportState();
    },
    { signal },
  );

  importForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      if (!importPreview?.rows?.length || importPreview.errors.length) {
        showToast("Perbaiki preview CSV sebelum import.", "error");
        return;
      }

      const finishBusy = setPageBusy(true, "Mengimport data pembeli dari CSV...");

      try {
        const response = await api.importBuyers(importPreview.rows, session.token);
        if (signal.aborted) return;

        importResultRoot.innerHTML = `
          <div class="alert alert-success mb-0">
            <div class="font-weight-bold mb-1">Import berhasil diproses</div>
            <div class="small text-muted mb-2">Waktu proses: ${escapeHtml(formatDateTime(response.data.lastImportedAt))}</div>
            <div class="d-flex flex-wrap gap-2">
              <span class="badge badge-success px-3 py-2">Insert ${escapeHtml(String(response.data.inserted))}</span>
              <span class="badge badge-info px-3 py-2">Update ${escapeHtml(String(response.data.updated))}</span>
              <span class="badge badge-warning px-3 py-2">Arsip ${escapeHtml(String(response.data.archived))}</span>
            </div>
          </div>
        `;

        await refreshDashboard("Memuat ulang ringkasan admin...");
        if (signal.aborted) return;

        showToast("Import CSV pembeli berhasil diproses.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal mengimport CSV pembeli.", "error");
        }
      } finally {
        finishBusy();
      }
    },
    { signal },
  );
}
