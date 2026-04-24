# 04. Setup Google Apps Script

## Target repo backend

Source backend ada di folder `apps-script/`.

## Model kepemilikan

- Owner GitHub: Evander
- Owner Apps Script: Ivan
- Owner Spreadsheet database: Ivan
- Admin seed awal di data: Ivan dan Evander

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
2. Jalankan fungsi tanpa parameter:
   - `setupApplicationSpreadsheetAndSeedPin()`
3. Catat `spreadsheetUrl` yang dikembalikan
4. Jika nanti ingin mengulang seed PIN admin default, jalankan:
   - `seedDefaultAdminPin()`
5. Share Apps Script project dan spreadsheet ke Evander sebagai `Editor` jika Evander perlu akses browser

Jika ingin set manual satu per satu, boleh juga:

- `setUserPinByEmail("ivanmarigib@gmail.com", "290729")`
- `setUserPinByEmail("smidgidionevander@gmail.com", "290729")`

Catatan:

- Di editor Apps Script, tombol `Run` paling aman untuk fungsi yang **tanpa parameter**.
- Karena itu repo ini sekarang menyediakan wrapper `setupApplicationSpreadsheetAndSeedPin()` dan `seedDefaultAdminPin()`.

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
- URL web app final untuk desktop diisi ke file config lokal Electron yang dijelaskan di `docs/13-electron-setup.md`
- Jangan commit URL final jika Anda ingin menjaga repo tetap netral
- Script owner dan spreadsheet owner sengaja sama-sama Ivan agar izin backend dan database tidak bercampur akun
- Frontend repo ini mengirim body POST sebagai `text/plain` agar browser tidak mengirim preflight `OPTIONS` ke Apps Script web app
- Jika browser menampilkan `Failed to fetch` padahal URL `/exec?action=health` terbuka, biasanya penyebabnya adalah request lama masih memakai `Content-Type: application/json` atau bundle frontend belum ter-refresh
