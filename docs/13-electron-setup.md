# 13. Setup Desktop Electron

## Prasyarat

- `node` dan `npm` aktif
- Repo lokal di `C:\Projects\pos-kantin`
- Web App Apps Script sudah dipublish

## Debug UI Overlay (Dev Mode Only)

Aplikasi dilengkapi dengan **Debug Error Overlay** yang otomatis aktif saat menjalankan `npm run dev` (Electron tidak dalam mode `app.isPackaged`). Overlay ini membantu mendeteksi error runtime, syntax, module load, dan resource load failure secara real-time.

### Fitur Debug Overlay

- **Toast singkat**: Muncul di pojok kanan atas saat error terjadi
- **Panel detail**: Berisi stack trace, file source, line/column, waktu, dan halaman aktif
- **Error deduplication**: Error berulang akan dihitung dan ditampilkan dengan counter
- **Max 20 error**: Hanya menyimpan 20 error terbaru
- **Copy & Clear**: Tombol untuk menyalin semua error atau menghapus history
- **Mode packaged tidak aktif**: Overlay tidak muncul di build installer

### Error yang Ditangkap

| Jenis Error | Keterangan |
|-------------|------------|
| `window.onerror` | JavaScript runtime errors |
| `unhandledrejection` | Promise rejection tidak tertangani |
| `console.error` | Pemanggilan console.error dengan argument apa pun |
| Resource load | Gagal memuat JS, CSS, atau image |

### Cara Menggunakan

Saat menjalankan dev server:

```powershell
npm run dev
```

Overlay akan otomatis muncul di pojok kanan bawah. Untuk test error:

```javascript
// Di DevTools Console
throw new Error("Test runtime error");
Promise.reject(new Error("Unhandled promise"));
console.error("Error message", { detail: "value" });
```

### Cara Kerja

1. Script `debug-overlay.js` dimuat sebelum semua module script di halaman
2. Error handler didaftarkan sejak awal dan dibuffer sampai `posDesktop.app.getInfo()` mengembalikan `debugUiEnabled: true`
3. Jika mode dev aktif (`app.isPackaged === false`), overlay dirender dan error buffer diflush
4. Di mode packaged, script berhenti tanpa menampilkan UI apa pun

**Catatan Keamanan**: Overlay menggunakan `textContent` (bukan `innerHTML`) untuk menampilkan error message dan stack trace, mencegah XSS injection.

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
  "autoSyncEnabled": false,
  "requestTimeoutMs": 15000,
  "sessionTtlHours": 8,
  "syncIntervalMs": 60000
}
```

`autoSyncEnabled` default-nya `false`. Aktifkan dari window Debug Monitor jika sync otomatis ingin berjalan berkala, lalu pilih interval umum seperti 30 detik, 1 menit, 5 menit, 15 menit, 1 jam, atau interval kustom 10 detik sampai 24 jam. Tombol `Sync Now` tetap bisa dipakai untuk sync manual walaupun auto sync mati.

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
- verifier password offline ditanam ke perangkat
- jika checkbox simpan info login aktif, token saved login perangkat disimpan terenkripsi selama 30 hari

Sesudah itu user yang sama bisa login offline di perangkat yang sama. Jika saved login aktif, user juga bisa masuk dengan memilih nama user tanpa mengetik password selama profil perangkat belum kedaluwarsa.

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

## Verifikasi Mode Packaged (Build Installer)

Saat aplikasi di-build menjadi installer Windows:

```powershell
npm run dist:win
```

Debug overlay **tidak akan muncul** karena `app.isPackaged === true` menyebabkan `debugUiEnabled: false`. Halaman tidak menampilkan detail teknis error ke user.

Untuk memastikan behavior ini bekerja dengan benar, cek response IPC `app:get-info`:

```javascript
// Di DevTools pada build installer
await posDesktop.app.getInfo()
// Output: { data: { ..., isPackaged: true, debugUiEnabled: false } }
```

Jika `debugUiEnabled` tetap `true` di build packaged, periksa kembali bahwa build script tidak mengoverride `app.isPackaged`.
