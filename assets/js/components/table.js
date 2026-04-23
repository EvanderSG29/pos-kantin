import { escapeHtml } from "../utils.js";

export function renderDataTable({ columns, rows, emptyMessage = "Belum ada data." }) {
  if (!rows.length) {
    return `
      <div class="border rounded bg-white px-4 py-5 text-center text-gray-500 pos-empty-state">
        <i class="fas fa-inbox fa-2x mb-3 text-gray-300"></i>
        <p class="mb-0">${escapeHtml(emptyMessage)}</p>
      </div>
    `;
  }

  const head = columns
    .map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`)
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const rawValue = typeof column.render === "function" ? column.render(row) : row[column.key];
          return `<td>${rawValue ?? "-"}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="table-responsive">
      <table class="table table-bordered table-hover align-middle mb-0">
        <thead class="thead-light">
          <tr>${head}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}
