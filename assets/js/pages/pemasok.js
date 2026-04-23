import { api } from "../api.js";
import { clearForm, fillForm, serializeForm } from "../components/form.js";
import { renderDataTable } from "../components/table.js";
import { showToast } from "../components/toast.js";
import { getCommissionBaseLabel } from "../finance.js";
import { escapeHtml } from "../utils.js";

export async function initPage({ session, setPageBusy, signal }) {
  const form = document.querySelector("#supplier-form");
  const tableRoot = document.querySelector("#suppliers-table");
  const resetButton = document.querySelector("#supplier-reset");

  let suppliers = [];

  function renderSuppliers() {
    tableRoot.innerHTML = renderDataTable({
      columns: [
        { key: "supplierName", label: "Pemasok", render: (row) => escapeHtml(row.supplierName) },
        { key: "contactName", label: "Kontak", render: (row) => escapeHtml(row.contactName || "-") },
        {
          key: "commission",
          label: "Skema komisi",
          render: (row) => `
            <div class="small font-weight-bold text-gray-800">${escapeHtml(getCommissionBaseLabel(row.commissionBaseType))}</div>
            <div class="text-muted">${escapeHtml(String(row.commissionRate))}%</div>
          `,
        },
        {
          key: "payoutTermDays",
          label: "Termin",
          render: (row) => `${escapeHtml(String(row.payoutTermDays))} hari`,
        },
        {
          key: "status",
          label: "Status",
          render: (row) => `<span class="badge badge-${row.isActive ? "success" : "warning"} text-uppercase">${escapeHtml(row.isActive ? "aktif" : "nonaktif")}</span>`,
        },
        {
          key: "actions",
          label: "Aksi",
          render: (row) => `<button type="button" class="btn btn-outline-primary btn-sm" data-edit-id="${row.id}">Edit</button>`,
        },
      ],
      rows: suppliers,
      emptyMessage: "Belum ada pemasok.",
    });
  }

  async function refreshSuppliers(message = "Memuat data pemasok...") {
    const finishBusy = setPageBusy(true, message);

    try {
      const response = await api.listSuppliers({ includeInactive: true }, session.token);
      if (signal.aborted) return;

      suppliers = response.data;
      renderSuppliers();
    } finally {
      finishBusy();
    }
  }

  try {
    await refreshSuppliers();
  } catch (error) {
    if (!signal.aborted) {
      showToast(error.message || "Gagal memuat pemasok.", "error");
    }
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const values = serializeForm(form);
      const payload = {
        ...values,
        commissionRate: Number(values.commissionRate),
        payoutTermDays: Number(values.payoutTermDays),
        isActive: values.isActive === "true",
      };

      const finishBusy = setPageBusy(true, "Menyimpan pemasok...");

      try {
        await api.saveSupplier(payload, session.token);
        if (signal.aborted) return;

        await refreshSuppliers("Memuat ulang data pemasok...");
        if (signal.aborted) return;

        clearForm(form);
        fillForm(form, {
          commissionRate: 10,
          commissionBaseType: "revenue",
          payoutTermDays: 1,
          isActive: "true",
        });
        showToast("Pemasok berhasil disimpan.", "success");
      } catch (error) {
        if (!signal.aborted) {
          showToast(error.message || "Gagal menyimpan pemasok.", "error");
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
      fillForm(form, {
        commissionRate: 10,
        commissionBaseType: "revenue",
        payoutTermDays: 1,
        isActive: "true",
      });
    },
    { signal },
  );

  fillForm(form, {
    commissionRate: 10,
    commissionBaseType: "revenue",
    payoutTermDays: 1,
    isActive: "true",
  });

  tableRoot.addEventListener(
    "click",
    (event) => {
      const editId = event.target.dataset.editId;
      if (!editId) return;

      const supplier = suppliers.find((item) => item.id === editId);
      if (!supplier) return;

      fillForm(form, {
        id: supplier.id,
        supplierName: supplier.supplierName,
        contactName: supplier.contactName,
        contactPhone: supplier.contactPhone,
        commissionRate: supplier.commissionRate,
        commissionBaseType: supplier.commissionBaseType,
        payoutTermDays: supplier.payoutTermDays,
        isActive: supplier.isActive ? "true" : "false",
        notes: supplier.notes,
      });

      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    { signal },
  );
}
