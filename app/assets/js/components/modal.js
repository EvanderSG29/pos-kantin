import { escapeHtml } from "../utils.js";

let modalSequence = 0;

function getModalRoot() {
  let root = document.querySelector("#modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.append(root);
  }
  return root;
}

export function confirmDialog({
  title = "Konfirmasi",
  message = "Lanjutkan aksi ini?",
  confirmText = "Ya",
  cancelText = "Batal",
} = {}) {
  const root = getModalRoot();
  const modalId = `confirm-modal-${modalSequence += 1}`;
  const titleId = `${modalId}-title`;
  const messageId = `${modalId}-message`;

  root.insertAdjacentHTML(
    "beforeend",
    `
      <div class="pos-modal-backdrop" id="${modalId}" role="presentation">
        <div class="pos-modal-dialog card shadow" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${messageId}">
          <div class="card-body p-0">
            <div class="pos-modal-header">
              <h5 id="${titleId}" class="modal-title mb-0">${escapeHtml(title)}</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Tutup">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div class="pos-modal-body">
              <p id="${messageId}" class="mb-0 text-gray-700">${escapeHtml(message)}</p>
            </div>
            <div class="pos-modal-footer">
              <button type="button" class="btn btn-secondary" data-dismiss="modal">${escapeHtml(cancelText)}</button>
              <button type="button" class="btn btn-primary" data-confirm="true">${escapeHtml(confirmText)}</button>
            </div>
          </div>
        </div>
      </div>
    `,
  );

  const modal = root.querySelector(`#${modalId}`);
  const confirmButton = modal.querySelector("[data-confirm='true']");
  const dismissButtons = modal.querySelectorAll("[data-dismiss='modal']");

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", handleKeydown);
      modal.classList.remove("is-visible");

      window.setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 120);
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        cleanup(false);
      }
    };

    document.addEventListener("keydown", handleKeydown);

    confirmButton.addEventListener("click", () => cleanup(true));
    dismissButtons.forEach((button) => {
      button.addEventListener("click", () => cleanup(false));
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        cleanup(false);
      }
    });

    window.requestAnimationFrame(() => {
      modal.classList.add("is-visible");
      confirmButton.focus();
    });
  });
}
