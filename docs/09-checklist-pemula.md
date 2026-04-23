# 09. Checklist Pemula

Pakai format berikut untuk checklist manual di Markdown:

- `[ ]` berarti belum selesai
- `[x]` berarti sudah selesai

Contoh:

- `[x]` Login admin berhasil
- `[ ]` Test login petugas

## Repo dan Git

- [x] Buat repo private `EvanderSG29/pos-kantin` di GitHub web
- [x] Jalankan `git push -u origin main`
- [x] Biasakan `git status`
- [x] Biasakan commit kecil dan jelas

## Apps Script

- [x] Login `clasp` untuk profil Ivan: `clasp login -u ivan`
- [x] Masuk ke folder `apps-script`
- [x] Pastikan `.clasp.json` menunjuk script `10R4EH...`
- [x] Jangan `clasp pull` dari script target kosong
- [x] Jalankan `clasp -u ivan push`
- [x] Jalankan `setupApplicationSpreadsheetAndSeedPin()`
- [x] Jika perlu reset PIN seed, jalankan `seedDefaultAdminPin()`
- [x] Share script dan spreadsheet ke Evander bila perlu

## Frontend

- [x] Isi `assets/js/config.js`
- [x] Jika mau pakai API live, ubah `USE_MOCK_API` menjadi `false`
- [x] Isi `API_BASE_URL` dengan URL Web App
- [x] Test dulu secara lokal sebelum ke Netlify
- [x] Test login admin
- [ ] Test login petugas

## Verifikasi dasar

- [ ] Health check berhasil
- [ ] User admin bisa buka `users.html`
- [ ] Petugas bisa input transaksi
- [ ] Admin bisa preview CSV pembeli tanpa error
- [ ] Import CSV pembeli menghasilkan insert/update/arsip yang sesuai
- [ ] Halaman `simpanan.html` bisa menyimpan keuangan harian dengan gross, total kembalian, dan net yang cocok
- [ ] Buku kembalian bisa mengubah status `belum` menjadi `selesai`
- [ ] Tabel saldo pembeli menampilkan buyer aktif/nonaktif dari hasil import
- [ ] Laporan bisa memfilter transaksi
- [ ] Navigasi antar halaman app tidak membuat sidebar dan navbar flicker
- [ ] Spinner loading hanya muncul di area konten tengah saat load, save, atau delete
- [ ] Favicon berubah saat request aktif lalu kembali normal setelah selesai
- [ ] Sidebar tetap full-height dan bisa di-scroll sendiri saat konten halaman panjang
