# 04. Setup Google Apps Script

## Target repo backend

Source backend ada di folder `apps-script/`.

## Model kepemilikan

- Owner GitHub: Evander
- Owner Apps Script: Ivan
- Owner Spreadsheet database: Ivan
- Admin aplikasi di data: Evander

## Langkah awal

1. Login profil CLASP Ivan jika belum:
   - `clasp login -u ivan`
2. Masuk ke `apps-script/`
3. Pastikan `.clasp.json` menunjuk script:
   - `10R4EHwxFWyMfSVxmYDyIWF-sNaGbtFv9zxa7vviguI64qk8ZDjDYAKFB`
4. Jangan jalankan `clasp pull` dari script ini karena target awalnya kosong
5. Jalankan:
   - `clasp -u ivan push`

## Setup spreadsheet baru

Setelah source berhasil dipush:

1. Buka editor Apps Script milik Ivan
2. Jalankan fungsi `setupApplicationSpreadsheet()`
3. Catat `spreadsheetUrl` yang dikembalikan
4. Jalankan:
   - `setUserPinByEmail("smidgidionevander@gmail.com", "PIN_BARU")`
5. Share Apps Script project dan spreadsheet ke Evander sebagai `Editor` jika Evander perlu akses browser

## Health check

Endpoint `doGet` hanya mendukung:

```text
...?action=health
```

Response harus berisi:

- `success`
- `message`
- `data`

## Deploy sebagai Web App

Setelah source berhasil dipush, buat deployment web app dari editor Apps Script:

1. Buka project Apps Script milik Ivan
2. Klik `Deploy > New deployment`
3. Pilih tipe `Web app`
4. Pilih eksekusi `as me` sebagai Ivan
5. Atur akses sesuai kebutuhan testing
6. Salin URL `/exec`

Untuk testing development, Anda juga bisa memakai `Deploy > Test deployments` yang menghasilkan URL `/dev`.

## Catatan deploy

- Source repo ini sudah siap untuk web app
- `clasp push` mengirim source, tetapi URL web app tetap mengikuti deployment `Web app` di editor Apps Script
- URL web app final tetap diisi manual ke `assets/js/config.js`
- Jangan commit URL final jika Anda ingin menjaga repo tetap netral
- Script owner dan spreadsheet owner sengaja sama-sama Ivan agar izin backend dan database tidak bercampur akun
