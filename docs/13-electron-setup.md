# 13. Setup Desktop Electron

## Prasyarat

- `node` dan `npm` aktif
- Repo lokal di `C:\Projects\pos-kantin`
- Web App Apps Script sudah dipublish

## Install dependency

Jalankan dari root repo:

```powershell
npm install
```

Perintah ini akan:

- memasang dependency tooling di root repo
- memasang dependency runtime di `app/node_modules`
- menjalankan `electron-builder install-app-deps` agar modul native `better-sqlite3` siap untuk Electron

## Konfigurasi lokal

Saat app pertama kali dibuka, Electron akan membuat file:

```text
%APPDATA%\pos-kantin-desktop\config.local.json
```

Isi minimal yang perlu dicek:

```json
{
  "gasWebAppUrl": "URL_WEB_APP_APPS_SCRIPT",
  "requestTimeoutMs": 15000,
  "sessionTtlHours": 8,
  "syncIntervalMs": 60000
}
```

Jangan commit file konfigurasi lokal ini.

Contoh path di mesin Windows ini:

```text
C:\Users\smidg\AppData\Roaming\pos-kantin-desktop\config.local.json
```

## Menjalankan test

Jalankan dari root repo:

```powershell
npm test
```

`npm test` sekarang dibagi dua:

- `test:node` untuk logic renderer murni
- `test:electron` untuk integrasi SQLite native lewat runtime Electron

## Menjalankan app

```powershell
npm run dev
```

Saat app pertama kali login online:

- sesi lokal dibuat di SQLite
- user cache diperbarui
- verifier PIN offline ditanam ke perangkat

Sesudah itu user yang sama bisa login offline di perangkat yang sama.

## Troubleshooting ABI native module

Kalau muncul error `NODE_MODULE_VERSION` saat `npm run dev`:

1. Jalankan:

```powershell
npm run rebuild:electron
```

2. Jika repo berasal dari struktur lama dan error masih sama, lakukan reinstall bersih satu kali:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force app\\node_modules
npm install
```

Script `npm run dev` dan `npm run test:electron` juga sudah membersihkan `ELECTRON_RUN_AS_NODE` otomatis jika variabel itu aktif di environment Windows.
