# 14. Sinkronisasi Desktop ke Google Sheets

## Trigger sync

- startup app
- login online berhasil
- reconnect jaringan
- interval 60 detik
- tombol `Sync Now`

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
