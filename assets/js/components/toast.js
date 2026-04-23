function getToastRoot() {
  let root = document.querySelector("#toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.append(root);
  }
  root.classList.add("toast-root", "pos-toast-root");
  return root;
}

const ALERT_BY_TYPE = {
  success: "alert-success",
  error: "alert-danger",
  warning: "alert-warning",
  info: "alert-info",
};

function dismissToast(toast) {
  if (!toast || toast.dataset.dismissed === "true") return;

  toast.dataset.dismissed = "true";
  toast.classList.remove("show");
  window.setTimeout(() => {
    toast.remove();
  }, 180);
}

export function showToast(message, type = "info", timeout = 2800) {
  const root = getToastRoot();
  const toast = document.createElement("div");
  toast.className = `alert ${ALERT_BY_TYPE[type] ?? ALERT_BY_TYPE.info} alert-dismissible fade show shadow-sm mb-3`;
  toast.setAttribute("role", "alert");

  const messageNode = document.createElement("span");
  messageNode.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "close";
  closeButton.setAttribute("aria-label", "Tutup");
  closeButton.innerHTML = '<span aria-hidden="true">&times;</span>';

  closeButton.addEventListener("click", () => dismissToast(toast));

  toast.append(messageNode, closeButton);
  root.append(toast);

  window.setTimeout(() => {
    dismissToast(toast);
  }, timeout);
}
