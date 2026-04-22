function sanitizeSaving_(record) {
  return {
    id: record.id,
    studentId: record.student_id,
    studentName: record.student_name,
    className: record.class_name,
    gender: record.gender,
    groupName: record.group_name,
    depositAmount: toNumber_(record.deposit_amount),
    changeBalance: toNumber_(record.change_balance),
    recordedAt: record.recorded_at,
    recordedByUserId: record.recorded_by_user_id,
    recordedByName: record.recorded_by_name,
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function listSavingsAction_(token) {
  requireSession_(token);
  return getSheetRecords_("savings")
    .map(sanitizeSaving_)
    .sort(function (left, right) {
      return left.studentName.localeCompare(right.studentName);
    });
}

