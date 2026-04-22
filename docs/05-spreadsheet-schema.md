# 05. Schema Spreadsheet Baru

Spreadsheet lama di Drive dipakai sebagai referensi baca saja. Aplikasi v1 menulis ke spreadsheet baru yang lebih rapi.

## Model database yang dipakai

- Spreadsheet dibuat otomatis oleh `setupApplicationSpreadsheet()`
- Spreadsheet owner: `ivanmarigib@gmail.com`
- Spreadsheet tidak dibuat sebagai file bound-script
- Apps Script yang standalone akan menjadi pemilik alur backend dan pembuat spreadsheet baru

## Sheet `users`

Header:

- `id`
- `full_name`
- `nickname`
- `email`
- `role`
- `status`
- `class_group`
- `pin_hash`
- `notes`
- `created_at`
- `updated_at`

## Sheet `transactions`

Header:

- `id`
- `transaction_date`
- `input_by_user_id`
- `input_by_name`
- `supplier_id`
- `supplier_name`
- `item_name`
- `unit_name`
- `quantity`
- `remaining_quantity`
- `unit_price`
- `total_value`
- `notes`
- `created_at`
- `updated_at`
- `deleted_at`

## Sheet `savings`

Header:

- `id`
- `student_id`
- `student_name`
- `class_name`
- `gender`
- `group_name`
- `deposit_amount`
- `change_balance`
- `recorded_at`
- `recorded_by_user_id`
- `recorded_by_name`
- `notes`
- `created_at`
- `updated_at`

## Sheet `suppliers`

Header:

- `id`
- `supplier_name`
- `contact_name`
- `contact_phone`
- `notes`
- `is_active`
- `created_at`
- `updated_at`

## Sheet `sessions`

Header:

- `id`
- `token_hash`
- `user_id`
- `expires_at`
- `revoked_at`
- `created_at`
- `updated_at`
