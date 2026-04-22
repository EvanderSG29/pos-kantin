function getToastRoot() {
  let root = document.querySelector("#toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.append(root);
  }
  root.classList.add("toast-root");
  return root;
}

export function showToast(message, type = "info", timeout = 2800) {
  const root = getToastRoot();
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  root.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, timeout);
}

