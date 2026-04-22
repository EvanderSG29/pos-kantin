function sanitizeSupplier_(record) {
  return {
    id: record.id,
    supplierName: record.supplier_name,
    contactName: record.contact_name,
    contactPhone: record.contact_phone,
    notes: record.notes,
    isActive: String(record.is_active) !== "false",
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function listSuppliersAction_(token) {
  requireSession_(token);
  return getSheetRecords_("suppliers")
    .filter(function (record) {
      return String(record.is_active) !== "false";
    })
    .map(sanitizeSupplier_)
    .sort(function (left, right) {
      return left.supplierName.localeCompare(right.supplierName);
    });
}

