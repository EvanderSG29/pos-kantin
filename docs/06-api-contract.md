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

- Login memakai email + PIN
- PIN disimpan sebagai `pin_hash`
- Session disimpan di sheet `sessions`
- Frontend menyimpan token di `localStorage`

## Catatan payload baru

- `importBuyers` menerima `payload.rows[]` hasil parsing CSV frontend
- `saveDailyFinance` menerima header harian dan `payload.changeEntries[]`
- `updateChangeEntryStatus` menerima `id` dan `status` dengan nilai `belum` atau `selesai`
- `listSuppliers` menerima `payload.includeInactive` untuk admin saat membuka master pemasok
- `saveSupplier` menerima `supplierName`, `contactName`, `contactPhone`, `commissionRate`, `commissionBaseType`, `payoutTermDays`, `notes`, dan `isActive`
- `saveTransaction` menghitung snapshot `commission_rate`, `commission_base_type`, dan `payout_term_days` dari master pemasok saat request diproses
- `settleSupplierPayout` menerima `supplierId`, `dueDate`, dan `notes?` lalu membuat audit row di sheet `supplier_payouts`
- `syncPull` menerima `payload.since` per scope sync desktop dan mengembalikan delta plus cursor terbaru untuk SQLite lokal Electron
