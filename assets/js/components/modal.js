function getModalRoot() {
  let root = document.querySelector("#modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.append(root);
  }
  root.classList.add("modal-root");
  return root;
}

export function confirmDialog({
  title = "Konfirmasi",
  message = "Lanjutkan aksi ini?",
  confirmText = "Ya",
  cancelText = "Batal",
} = {}) {
  const root = getModalRoot();
  root.dataset.open = "true";
  root.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <p class="text-soft">${message}</p>
      <div class="button-row">
        <button type="button" class="button button--primary" data-confirm="true">${confirmText}</button>
        <button type="button" class="button button--ghost" data-cancel="true">${cancelText}</button>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    const close = (value) => {
      root.dataset.open = "false";
      root.innerHTML = "";
      resolve(value);
    };

    root.querySelector("[data-confirm='true']").addEventListener("click", () => close(true));
    root.querySelector("[data-cancel='true']").addEventListener("click", () => close(false));
    root.addEventListener(
      "click",
      (event) => {
        if (event.target === root) close(false);
      },
      { once: true },
    );
  });
}

