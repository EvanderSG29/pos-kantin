# 14. Sinkronisasi Desktop ke Google Sheets

## Trigger sync

- tombol `Sync Now` untuk sync manual
- startup app, login online berhasil, reconnect jaringan, dan interval berkala hanya berjalan jika `autoSyncEnabled: true`

Auto sync default-nya mati. Pengaturan ini disimpan di `config.local.json` dan bisa diubah dari window Debug Monitor. Interval memakai `syncIntervalMs` dengan batas minimal 10 detik dan maksimal 24 jam.

## Queue lokal

Setiap mutasi lokal masuk tabel `sync_queue` dengan kombinasi unik:

- `entity_type`
- `entity_id`

Jika record yang sama diubah lagi sebelum sync sukses, payload queue akan diganti dengan versi terbaru.

## Retry

Backoff yang dipakai:

1. `10s`
2. `30s`
3. `60s`
4. `5m`
5. `15m`

Setelah itu retry tetap capped di `15m`.

## Pull cloud

Action `syncPull` mengembalikan:

- `users` non-sensitif
- `suppliers`
- `transactions` termasuk tombstone `deletedAt`
- `cursors`

Cursor lokal disimpan di tabel `sync_cursors`.

## Aturan konflik

- `suppliers` cloud menimpa cache lokal jika row tidak punya perubahan pending.
- `transactions` yang masih `pending_sync=1` tidak ditimpa pull cloud biasa.
- Respons sukses dari `saveTransaction`, `deleteTransaction`, dan `saveSupplier` selalu menimpa row lokal agar bentuk akhirnya konsisten dengan GAS.
