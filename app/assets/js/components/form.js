export function serializeForm(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function getPrimaryField(form, fieldName) {
  const field = form.elements.namedItem(fieldName);
  if (!field) return null;

  if (typeof field.length === "number" && field.length > 0 && !field.tagName) {
    return field[0] ?? null;
  }

  return field;
}

function removeFieldErrorFeedback(form, fieldName) {
  form.querySelectorAll(`[data-field-error-for="${fieldName}"]`).forEach((node) => node.remove());
}

export function clearFormErrors(form) {
  form.querySelectorAll(".is-invalid").forEach((field) => {
    field.classList.remove("is-invalid");
    field.removeAttribute("aria-invalid");
  });

  form.querySelectorAll("[data-field-error-for]").forEach((node) => node.remove());
}

export function setFieldError(form, fieldName, message) {
  const field = getPrimaryField(form, fieldName);
  if (!field) return;

  removeFieldErrorFeedback(form, fieldName);
  field.classList.add("is-invalid");
  field.setAttribute("aria-invalid", "true");

  const feedback = document.createElement("div");
  feedback.className = "invalid-feedback d-block";
  feedback.dataset.fieldErrorFor = fieldName;
  feedback.textContent = message;
  field.insertAdjacentElement("afterend", feedback);
}

export function setFormMode(root, mode = "create") {
  if (!root) return;

  root.dataset.formMode = mode;
  root.querySelectorAll("[data-form-mode-create], [data-form-mode-edit]").forEach((node) => {
    const nextText = mode === "edit"
      ? node.dataset.formModeEdit
      : node.dataset.formModeCreate;
    if (nextText !== undefined) {
      node.textContent = nextText;
    }
  });
}

export function fillForm(form, values = {}) {
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    field.value = value ?? "";
  });
}

export function clearForm(form) {
  form.reset();
  clearFormErrors(form);
  const hiddenId = form.elements.namedItem("id");
  if (hiddenId) hiddenId.value = "";
}
