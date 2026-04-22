# 04. Setup Google Apps Script

## Target repo backend

Source backend ada di folder `apps-script/`.

## Langkah awal

1. Login `clasp` jika belum:
   - `clasp login`
2. Masuk ke `apps-script/`
3. Jalankan `clasp create --type standalone --title "POS Kantin API"`
4. Jalankan `clasp push`

## Setup spreadsheet baru

Setelah source berhasil dipush:

1. Buka editor Apps Script
2. Jalankan fungsi `setupApplicationSpreadsheet()`
3. Catat `spreadsheetUrl` yang dikembalikan
4. Jalankan:
   - `setUserPinByEmail("smidgidionevander@gmail.com", "PIN_BARU")`

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

1. Buka project Apps Script
2. Klik `Deploy > New deployment`
3. Pilih tipe `Web app`
4. Pilih eksekusi `as me`
5. Atur akses sesuai kebutuhan testing
6. Salin URL `/exec`

Untuk testing development, Anda juga bisa memakai `Deploy > Test deployments` yang menghasilkan URL `/dev`.

## Catatan deploy

- Source repo ini sudah siap untuk web app
- `clasp push` mengirim source, tetapi URL web app tetap mengikuti deployment `Web app` di editor Apps Script
- URL web app final tetap diisi manual ke `assets/js/config.js`
- Jangan commit URL final jika Anda ingin menjaga repo tetap netral
