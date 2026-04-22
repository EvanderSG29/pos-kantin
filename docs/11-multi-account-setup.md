# 11. Setup Multi-Akun

Dokumen ini menjelaskan pembagian akun yang dipakai di proyek ini supaya Anda tidak bingung saat pindah antara GitHub dan Google.

## Pembagian akun

- GitHub repo owner:
  - `EvanderSG29`
  - `smidgidionevander@gmail.com`
- Google infra owner:
  - `ivanmarigib@gmail.com`
- Script Apps Script resmi:
  - `10R4EHwxFWyMfSVxmYDyIWF-sNaGbtFv9zxa7vviguI64qk8ZDjDYAKFB`
- Admin seed awal di data:
  - `ivanmarigib@gmail.com`
  - `smidgidionevander@gmail.com`

## Artinya dalam praktik

- Semua `git add`, `git commit`, `git push` tetap untuk repo GitHub Evander.
- Semua `clasp push`, deploy web app, dan pembuatan spreadsheet database harus memakai akun Ivan.
- Data awal akan membuat dua akun admin terpisah, satu untuk Ivan dan satu untuk Evander.

## Setup CLASP yang disarankan

1. Login profil Ivan:
   ```powershell
   clasp login -u ivan
   ```
2. Cek profil Ivan:
   ```powershell
   clasp -u ivan show-authorized-user
   ```
3. Masuk ke folder `apps-script`
4. Pastikan `.clasp.json` menunjuk script `10R4EH...`
5. Push source repo:
   ```powershell
   clasp -u ivan push
   ```

## Kenapa tidak bound script

Pendekatan yang dipakai adalah:

- standalone Apps Script
- script membuat spreadsheet baru sendiri

Alasannya:

- owner script dan owner spreadsheet tetap sama
- lebih mudah dikelola dari CLASP
- struktur backend modular repo tetap rapi

## Setelah source masuk

1. Buka Apps Script sebagai Ivan
2. Jalankan `setupApplicationSpreadsheet()`
3. Jalankan `setSeedAdminPin("290729")`
4. Deploy Web App sebagai Ivan
5. Share script dan spreadsheet ke Evander jika Evander perlu akses editor
