import { escapeHtml } from "../utils.js";

export function renderDataTable({ columns, rows, emptyMessage = "Belum ada data." }) {
  if (!rows.length) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }

  const head = columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
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
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>${head}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

