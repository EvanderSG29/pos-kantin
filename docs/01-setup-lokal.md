# 01. Setup Lokal

## Folder kerja

- Repo lokal: `C:\Projects\pos-kantin`
- Branch utama: `main`
- Remote target: `https://github.com/EvanderSG29/pos-kantin.git`

## Tool yang sudah terdeteksi di mesin ini

- `git`
- `node`
- `npm`
- `clasp`

## Mode kerja utama sekarang

- Default development berjalan lewat Electron desktop.
- Renderer tetap multi-page HTML seperti repo lama.
- Database lokal aktif di `userData` aplikasi, bukan lagi langsung ke browser storage.

## Model akun yang dipakai

- GitHub repo owner: `EvanderSG29` / `smidgidionevander@gmail.com`
- Google infra owner: `ivanmarigib@gmail.com`
- Admin aplikasi di data `users`: `smidgidionevander@gmail.com`

## Langkah mulai kerja

1. Buka folder `C:\Projects\pos-kantin`
2. Jalankan `git status`
3. Jalankan `npm install`
4. Jalankan `npm run dev`
5. Login online sekali untuk menyiapkan cache offline perangkat
6. Jika repo GitHub private sudah dibuat lewat web GitHub, jalankan `git push -u origin main`
7. Masuk ke folder `apps-script`
8. Pastikan `.clasp.json` lokal menunjuk script `10R4EHwxFWyMfSVxmYDyIWF-sNaGbtFv9zxa7vviguI64qk8ZDjDYAKFB`
9. Gunakan profil CLASP `ivan` untuk semua perintah Apps Script
10. Jalankan `clasp push` setelah source Apps Script siap

## Catatan

- `gh` CLI belum terpasang, jadi pembuatan repo GitHub dilakukan lewat web GitHub.
- Source code hanya menyimpan placeholder config. URL Web App live disimpan di file config lokal Electron, bukan permanen di repo.
- Akun GitHub dan akun Google memang sengaja dipisah. Ini normal selama workflow repo dan CLASP dijaga konsisten.
- Asset Bootstrap dan SB Admin 2 tetap disimpan di `app/assets/vendor` dan dipakai ulang di renderer Electron.
