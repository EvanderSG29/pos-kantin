# 12. Arsitektur Electron Offline-First

## Gambaran singkat

- Renderer tetap memakai HTML multi-page + Bootstrap yang sudah ada.
- Runtime desktop dipisah ke folder `app/` agar dependency native Electron tidak bercampur dengan tooling root.
- `app/electron/main.cjs` memegang window, IPC, SQLite, auth lokal, dan sync engine.
- `app://bundle/...` dipakai sebagai protokol renderer agar asset relatif tetap jalan tanpa `file://`.
- Semua CRUD utama masuk ke SQLite dulu, lalu masuk `sync_queue` untuk dikirim ke GAS.

## Komponen utama

- `app/electron/db/` untuk koneksi SQLite, migrasi, dan file database di `userData`.
- `app/electron/repositories/` untuk akses tabel `users_cache`, `suppliers`, `transactions`, dan `sync_queue`.
- `app/electron/services/auth-service.cjs` untuk login online, login offline, dan sesi aktif lokal.
- `app/electron/services/sync-service.cjs` untuk replay queue, pull perubahan cloud, dan status sync.
- `app/assets/` untuk renderer HTML, CSS, JS, dan asset visual yang dipaketkan ke desktop app.
- `apps-script/DesktopSync.gs` untuk action `syncPull`.

## Alur data

1. User login online sekali lewat GAS.
2. Profil user non-sensitif disimpan ke `users_cache`.
3. Verifier PIN lokal dibuat di `offline_auth_profiles`.
4. Saat transaksi atau pemasok disimpan, data langsung masuk SQLite.
5. Mutasi yang sama masuk ke `sync_queue`.
6. Saat online, queue dikirim ke GAS lalu `syncPull` menarik perubahan terbaru dari Spreadsheet.

## Batas v1 desktop

- Aktif: login, dashboard admin/petugas, transaksi, pemasok, status sync.
- Ditahan: users, simpanan, pembayaran pemasok, laporan.
- Halaman yang ditahan tetap punya route, tetapi renderer akan menampilkan placeholder desktop v1.
