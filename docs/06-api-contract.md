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
- `listTransactions`
- `saveTransaction`
- `deleteTransaction`
- `listSavings`
- `dashboardSummary`
- `listSuppliers`

## Catatan auth

- Login memakai email + PIN
- PIN disimpan sebagai `pin_hash`
- Session disimpan di sheet `sessions`
- Frontend menyimpan token di `localStorage`

