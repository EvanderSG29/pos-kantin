# 09. Checklist Pemula

## Repo dan Git

- [ ] Buat repo private `EvanderSG29/pos-kantin` di GitHub web
- [ ] Jalankan `git push -u origin main`
- [ ] Biasakan `git status`
- [ ] Biasakan commit kecil dan jelas

## Apps Script

- [ ] Login `clasp` untuk profil Ivan: `clasp login -u ivan`
- [ ] Masuk ke folder `apps-script`
- [ ] Pastikan `.clasp.json` menunjuk script `10R4EH...`
- [ ] Jangan `clasp pull` dari script target kosong
- [ ] Jalankan `clasp -u ivan push`
- [ ] Jalankan `setupApplicationSpreadsheet()`
- [ ] Jalankan `setUserPinByEmail(...)`
- [ ] Share script dan spreadsheet ke Evander bila perlu

## Frontend

- [ ] Isi `assets/js/config.js`
- [ ] Jika mau pakai API live, ubah `USE_MOCK_API` menjadi `false`
- [ ] Isi `API_BASE_URL` dengan URL Web App
- [ ] Test login admin
- [ ] Test login petugas

## Verifikasi dasar

- [ ] Health check berhasil
- [ ] User admin bisa buka `users.html`
- [ ] Petugas bisa input transaksi
- [ ] Simpanan bisa ditampilkan
- [ ] Laporan bisa memfilter transaksi
