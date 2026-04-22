# Apps Script POS Kantin

Folder ini berisi source backend Google Apps Script untuk API POS Kantin.

## File utama

- `Code.gs` routing `doGet` dan `doPost`
- `Config.gs` konstanta app, schema sheet, dan property key
- `Setup.gs` helper setup spreadsheet baru dan set PIN awal
- `Auth.gs` login, logout, validasi session
- `Users.gs`, `Transactions.gs`, `Savings.gs`, `Suppliers.gs`, `Dashboard.gs`

## Setup lokal

1. Masuk ke folder ini.
2. Buat file `.clasp.json` lokal dari `.clasp.example.json`.
3. Isi `scriptId` hasil `clasp create` atau `clasp clone`.
4. Jalankan `clasp push`.
5. Di editor Apps Script, jalankan `setupApplicationSpreadsheet()` sekali.
6. Lalu jalankan `setUserPinByEmail("smidgidionevander@gmail.com", "PIN_BARU")`.

## Catatan penting

- Jangan commit `.clasp.json`.
- Spreadsheet ID live tidak disimpan di source. Gunakan `setSpreadsheetId()` atau `setupApplicationSpreadsheet()`.
- `doGet` hanya untuk `health`.
- Semua action aplikasi masuk lewat `doPost`.
