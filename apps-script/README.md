# Apps Script POS Kantin

Folder ini berisi source backend Google Apps Script untuk API POS Kantin.

## File utama

- `Code.gs` routing `doGet` dan `doPost`
- `Config.gs` konstanta app, schema sheet, dan property key
- `Setup.gs` helper setup spreadsheet baru dan set PIN awal
- `DesktopSync.gs` delta pull untuk desktop Electron
- `Auth.gs` login, logout, validasi session
- `Users.gs`, `Buyers.gs`, `Transactions.gs`, `Savings.gs`, `Finance.gs`, `Suppliers.gs`, `Dashboard.gs`

## Setup lokal

1. Masuk ke folder ini.
2. Buat file `.clasp.json` lokal dari `.clasp.example.json`.
3. Untuk repo ini, target script resmi adalah:
   - `10R4EHwxFWyMfSVxmYDyIWF-sNaGbtFv9zxa7vviguI64qk8ZDjDYAKFB`
4. Login CLASP dengan profil Ivan:
   - `clasp login -u ivan`
5. Jalankan:
   - `clasp -u ivan push`
6. Di editor Apps Script milik Ivan, jalankan:
   - `setupApplicationSpreadsheetAndSeedPin()`
7. Jika perlu mengulang seed PIN default admin, jalankan:
   - `seedDefaultAdminPin()`
## Catatan penting

- Jangan commit `.clasp.json`.
- Spreadsheet ID live tidak disimpan di source. Gunakan `setSpreadsheetId()` atau `setupApplicationSpreadsheet()`.
- `doGet` hanya untuk `health`.
- Semua action aplikasi masuk lewat `doPost`.
- Import CSV pembeli dijalankan dari frontend admin dan diteruskan ke action `importBuyers`.
- GitHub tetap memakai akun Evander, tetapi Apps Script dan spreadsheet resmi dikelola oleh akun Ivan.
- Seed awal membuat dua admin terpisah, satu Ivan dan satu Evander. PIN tidak disimpan mentah di `pin_hash`.
- Untuk tombol `Run` di editor Apps Script, gunakan wrapper tanpa parameter agar tidak perlu mengedit source.
