# 05. Schema Spreadsheet Baru

Spreadsheet lama di Drive dipakai sebagai referensi baca saja. Aplikasi v1 menulis ke spreadsheet baru yang lebih rapi.

## Model database yang dipakai

- Spreadsheet dibuat otomatis oleh `setupApplicationSpreadsheet()`
- Spreadsheet owner: `ivanmarigib@gmail.com`
- Spreadsheet tidak dibuat sebagai file bound-script
- Apps Script yang standalone akan menjadi pemilik alur backend dan pembuat spreadsheet baru
- Seed user awal akan membuat dua akun admin terpisah:
  - `ivanmarigib@gmail.com`
  - `smidgidionevander@gmail.com`

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

## Sheet `buyers`

Header:

- `id`
- `buyer_name`
- `class_or_category`
- `opening_balance`
- `current_balance`
- `status`
- `created_at`
- `updated_at`
- `last_imported_at`

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
- `sold_quantity`
- `cost_price`
- `unit_price`
- `gross_sales`
- `profit_amount`
- `commission_rate`
- `commission_base_type`
- `commission_amount`
- `supplier_net_amount`
- `payout_term_days`
- `payout_due_date`
- `supplier_payout_id`
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

## Sheet `daily_finance`

Header:

- `id`
- `finance_date`
- `gross_amount`
- `change_total`
- `net_amount`
- `notes`
- `created_by_user_id`
- `created_by_name`
- `created_at`
- `updated_at`
- `deleted_at`

## Sheet `change_entries`

Header:

- `id`
- `daily_finance_id`
- `finance_date`
- `buyer_id`
- `buyer_name_snapshot`
- `change_amount`
- `status`
- `settled_at`
- `settled_by_user_id`
- `settled_by_name`
- `notes`
- `created_by_user_id`
- `created_by_name`
- `created_at`
- `updated_at`
- `deleted_at`

## Sheet `suppliers`

Header:

- `id`
- `supplier_name`
- `contact_name`
- `contact_phone`
- `commission_rate`
- `commission_base_type`
- `payout_term_days`
- `notes`
- `is_active`
- `created_at`
- `updated_at`

## Sheet `supplier_payouts`

Header:

- `id`
- `supplier_id`
- `supplier_name_snapshot`
- `period_start`
- `period_end`
- `due_date`
- `transaction_count`
- `total_gross_sales`
- `total_profit`
- `total_commission`
- `total_supplier_net_amount`
- `status`
- `paid_at`
- `paid_by_user_id`
- `paid_by_name`
- `notes`
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

## Catatan tambahan

- Import CSV pembeli mengisi sheet `buyers` sebagai master aktif/nonaktif.
- Import CSV juga membuat atau memperbarui seed row di sheet `savings` dengan `student_id = buyers.id` dan `notes = IMPORT_CSV_SEED`.
- Nama pembeli di `change_entries` tetap menyimpan `buyer_name_snapshot` agar histori tidak berubah walaupun master pembeli diperbarui kemudian.
