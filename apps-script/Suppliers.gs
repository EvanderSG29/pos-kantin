function sanitizeSupplier_(record) {
  return {
    id: record.id,
    supplierName: record.supplier_name,
    contactName: record.contact_name,
    contactPhone: record.contact_phone,
    commissionRate: toNumber_(record.commission_rate, 10),
    commissionBaseType: normalizeCommissionBaseType_(record.commission_base_type),
    payoutTermDays: toNumber_(record.payout_term_days, 0),
    notes: record.notes,
    isActive: String(record.is_active) !== "false",
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function listSuppliersAction_(payload, token) {
  var context = requireSession_(token);
  var includeInactive = Boolean(payload && payload.includeInactive) && context.user.role === "admin";

  return getSheetRecords_("suppliers")
    .filter(function (record) {
      return includeInactive || String(record.is_active) !== "false";
    })
    .map(sanitizeSupplier_)
    .sort(function (left, right) {
      return left.supplierName.localeCompare(right.supplierName);
    });
}

function saveSupplierAction_(payload, token) {
  var context = requireSession_(token);
  ensureRole_(context.user, ["admin"]);

  var now = nowIso_();
  var existing = payload.id ? getRecordById_("suppliers", payload.id) : null;
  var supplierName = String(payload.supplierName || "").trim();
  var contactName = String(payload.contactName || "").trim();
  var contactPhone = String(payload.contactPhone || "").trim();
  var notes = String(payload.notes || "").trim();
  var commissionRate = parseNonNegativeNumberStrict_(payload.commissionRate, "Persentase potongan");
  var payoutTermDays = parseNonNegativeNumberStrict_(payload.payoutTermDays, "Termin pembayaran");
  var commissionBaseType = normalizeCommissionBaseType_(payload.commissionBaseType);
  var duplicate = getSheetRecords_("suppliers").find(function (record) {
    return normalizeText_(record.supplier_name) === normalizeText_(supplierName)
      && String(record.id) !== String(payload.id || "");
  });

  if (duplicate) {
    throw new Error("Nama pemasok sudah dipakai.");
  }

  if (!supplierName) {
    throw new Error("Nama pemasok wajib diisi.");
  }

  var record = existing || {
    id: payload.id || generateId_("SUP"),
    created_at: now,
  };

  record.supplier_name = supplierName;
  record.contact_name = contactName;
  record.contact_phone = contactPhone;
  record.commission_rate = commissionRate;
  record.commission_base_type = commissionBaseType;
  record.payout_term_days = payoutTermDays;
  record.notes = notes;
  record.is_active = payload.isActive === false || payload.isActive === "false" ? "false" : "true";
  record.updated_at = now;

  saveSheetRecord_("suppliers", withoutMeta_(record), existing ? existing._rowNumber : null);
  return sanitizeSupplier_(record);
}
