# 06. Kontrak API

## Prinsip umum

- `doGet(e)` hanya untuk `action=health`
- `doPost(e)` untuk semua aksi aplikasi
- Semua response JSON berbentuk:

```json
{
  "success": true,
  "message": "Pesan singkat",
  "data": {}
}
```

## Bentuk request POST

```json
{
  "action": "saveTransaction",
  "token": "TOKEN_JIKA_PERLU",
  "payload": {}
}
```

## Action v1

- `login`
- `createTrustedDevice`
- `loginWithTrustedDevice`
- `revokeTrustedDevice`
- `requestPasswordResetOtp`
- `resetPasswordWithOtp`
- `logout`
- `getCurrentUser`
- `listUsers`
- `saveUser`
- `listBuyers`
- `importBuyers`
- `listTransactions`
- `saveTransaction`
- `deleteTransaction`
- `listSavings`
- `listDailyFinance`
- `getDailyFinanceDetail`
- `saveDailyFinance`
- `deleteDailyFinance`
- `listChangeEntries`
- `updateChangeEntryStatus`
- `dashboardSummary`
- `listSuppliers`
- `saveSupplier`
- `syncPull`
- `listSupplierPayouts`
- `settleSupplierPayout`

## Catatan auth

- Login baru memakai email + password minimal 8 karakter
- `login` menerima `payload.email`, `payload.password`, dan opsional `payload.rememberDevice`
- `payload.pin` masih diterima sementara untuk akun lama yang belum punya `password_hash`
- Password disimpan sebagai `password_hash`; PIN lama tetap di `pin_hash` sampai akun dimigrasikan
- Session cloud disimpan di sheet `sessions`
- Saved login perangkat disimpan sebagai token hash di sheet `trusted_devices`, berlaku 30 hari, dan token mentah hanya disimpan terenkripsi di SQLite lokal Electron
- OTP reset password dikirim lewat `MailApp.sendEmail` dari akun deployer Apps Script, bukan SMTP atau sandi aplikasi Gmail

## Catatan payload baru

- `importBuyers` menerima `payload.rows[]` hasil parsing CSV frontend
- `saveDailyFinance` menerima header harian dan `payload.changeEntries[]`
- `updateChangeEntryStatus` menerima `id` dan `status` dengan nilai `belum` atau `selesai`
- `listSuppliers` menerima `payload.includeInactive` untuk admin saat membuka master pemasok
- `saveSupplier` menerima `supplierName`, `contactName`, `contactPhone`, `commissionRate`, `commissionBaseType`, `payoutTermDays`, `notes`, dan `isActive`
- `saveTransaction` menghitung snapshot `commission_rate`, `commission_base_type`, dan `payout_term_days` dari master pemasok saat request diproses
- `settleSupplierPayout` menerima `supplierId`, `dueDate`, dan `notes?` lalu membuat audit row di sheet `supplier_payouts`
- `syncPull` menerima `payload.since` per scope sync desktop dan mengembalikan delta plus cursor terbaru untuk SQLite lokal Electron
- `saveUser` menerima `password?`; sync lokal boleh mengirim `passwordHash?` agar password mentah tidak masuk queue lokal
- `requestPasswordResetOtp` menerima `email`; response tetap generik
- `resetPasswordWithOtp` menerima `email`, `otp`, dan `password`
