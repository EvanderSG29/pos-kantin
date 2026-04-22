# 09. Checklist Pemula

## Repo dan Git

- [v] Buat repo private `EvanderSG29/pos-kantin` di GitHub web
- [v] Jalankan `git push -u origin main`
- [v] Biasakan `git status`
- [v] Biasakan commit kecil dan jelas

## Apps Script

- [v] Login `clasp` untuk profil Ivan: `clasp login -u ivan`
- [v] Masuk ke folder `apps-script`
- [v] Pastikan `.clasp.json` menunjuk script `10R4EH...`
- [v] Jangan `clasp pull` dari script target kosong
- [v] Jalankan `clasp -u ivan push`
- [v] Jalankan `setupApplicationSpreadsheetAndSeedPin()`
- [v] Jika perlu reset PIN seed, jalankan `seedDefaultAdminPin()`
- [v] Share script dan spreadsheet ke Evander bila perlu

## Frontend

- [v] Isi `assets/js/config.js`
- [v] Jika mau pakai API live, ubah `USE_MOCK_API` menjadi `false`
- [v] Isi `API_BASE_URL` dengan URL Web App
- [v] Test dulu secara lokal sebelum ke Netlify (sepertinya untuk pengembangan masih pakai "npx serve ." delum ke netlify)
- [v] Test login admin
- [ ] Test login petugas

## Verifikasi dasar

- [ ] Health check berhasil
- [ ] User admin bisa buka `users.html`
- [ ] Petugas bisa input transaksi
- [ ] Simpanan bisa ditampilkan
- [ ] Laporan bisa memfilter transaksi
