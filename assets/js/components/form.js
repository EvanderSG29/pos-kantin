export function serializeForm(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
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
  const hiddenId = form.elements.namedItem("id");
  if (hiddenId) hiddenId.value = "";
}

