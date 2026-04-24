import { escapeHtml } from "../utils.js";

function getColumnClassNames(column, type) {
  const classes = [];
  const className = type === "header" ? column.headerClassName : column.cellClassName;

  if (column.align) {
    classes.push(`pos-cell-${column.align}`);
  }

  if (column.priority) {
    classes.push(`pos-priority-${column.priority}`);
  }

  if (column.nowrap) {
    classes.push("text-nowrap");
  }

  if (className) {
    classes.push(className);
  }

  return classes.join(" ");
}

function renderTableMessage({
  icon,
  message,
  tone = "muted",
}) {
  return `
    <div class="border rounded bg-white px-4 py-5 text-center text-${tone} pos-empty-state">
      <i class="fas ${icon} fa-2x mb-3 text-gray-300"></i>
      <p class="mb-0">${escapeHtml(message)}</p>
    </div>
  `;
}

function buildVisiblePages(currentPage, totalPages) {
  const windowSize = 5;
  const start = Math.max(currentPage - 2, 1);
  const end = Math.min(start + windowSize - 1, totalPages);
  const normalizedStart = Math.max(end - windowSize + 1, 1);
  const pages = [];

  for (let page = normalizedStart; page <= end; page += 1) {
    pages.push(page);
  }

  return pages;
}

function renderPagination(pagination) {
  if (!pagination || pagination.totalPages <= 1) return "";

  const pages = buildVisiblePages(pagination.page, pagination.totalPages);

  return `
    <nav class="pos-pagination" aria-label="Navigasi halaman tabel">
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        data-pagination-page="${pagination.page - 1}"
        ${pagination.hasPrev ? "" : "disabled"}
      >
        Prev
      </button>
      ${pages.map((page) => `
        <button
          type="button"
          class="btn btn-sm ${page === pagination.page ? "btn-primary" : "btn-outline-secondary"}"
          data-pagination-page="${page}"
          aria-current="${page === pagination.page ? "page" : "false"}"
        >
          ${page}
        </button>
      `).join("")}
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        data-pagination-page="${pagination.page + 1}"
        ${pagination.hasNext ? "" : "disabled"}
      >
        Next
      </button>
    </nav>
  `;
}

export function renderDataTable({
  columns,
  rows,
  emptyMessage = "Belum ada data.",
  loading = false,
  errorMessage = "",
  summaryText = "",
  pagination = null,
}) {
  const head = columns
    .map((column) => {
      const classNames = getColumnClassNames(column, "header");
      const width = column.width ? ` style="width:${escapeHtml(column.width)}"` : "";
      return `<th scope="col" class="${classNames}"${width}>${escapeHtml(column.label)}</th>`;
    })
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const rawValue = typeof column.render === "function"
            ? column.render(row)
            : escapeHtml(row[column.key] ?? "-");
          return `<td class="${getColumnClassNames(column, "cell")}">${rawValue ?? "-"}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const content = rows.length
    ? `
      <div class="pos-data-table-frame ${loading ? "is-loading" : ""}">
        <div class="table-responsive pos-data-table-wrapper">
          <table class="table table-bordered table-hover align-middle mb-0 pos-data-table">
            <thead class="thead-light">
              <tr>${head}</tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${loading ? `
          <div class="pos-data-table-overlay" aria-live="polite" aria-busy="true">
            <div class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></div>
            <span>Memuat data...</span>
          </div>
        ` : ""}
      </div>
    `
    : loading
      ? renderTableMessage({
        icon: "fa-spinner fa-spin",
        message: "Memuat data...",
      })
      : errorMessage
        ? renderTableMessage({
          icon: "fa-exclamation-circle",
          message: errorMessage,
          tone: "danger",
        })
        : renderTableMessage({
          icon: "fa-inbox",
          message: emptyMessage,
        });

  return `
    <section class="pos-data-table-shell">
      ${errorMessage && rows.length ? `
        <div class="alert alert-danger d-flex align-items-center justify-content-between mb-3" role="alert">
          <span>${escapeHtml(errorMessage)}</span>
          <span class="small text-uppercase">Menampilkan data terakhir</span>
        </div>
      ` : ""}
      ${content}
      ${(summaryText || pagination) ? `
        <div class="pos-data-table-footer">
          <div class="small text-muted">${escapeHtml(summaryText || "")}</div>
          ${renderPagination(pagination)}
        </div>
      ` : ""}
    </section>
  `;
}
