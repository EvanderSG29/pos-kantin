# 03. Workflow CLASP

## Tujuan

CLASP dipakai sebagai jembatan antara source code lokal di folder `apps-script/` dan project Google Apps Script di cloud.

## Model akun resmi repo ini

- Git/GitHub: akun Evander
- CLASP / Apps Script / Spreadsheet: akun Ivan
- Script target resmi: `10R4EHwxFWyMfSVxmYDyIWF-sNaGbtFv9zxa7vviguI64qk8ZDjDYAKFB`

## Alur yang dipakai di repo ini

1. Masuk ke folder `apps-script`
2. Login profil CLASP khusus Ivan sekali:
   - `clasp login -u ivan`
3. Cek profil Ivan:
   - `clasp -u ivan show-authorized-user`
4. Pastikan file `.clasp.json` lokal menunjuk script `10R4EH...`
5. Jalankan semua perintah Apps Script dengan profil Ivan:
   - `clasp -u ivan push`

## Aturan penting saat pindah script

- Jangan jalankan `clasp pull` dari script target yang masih kosong sebelum source lokal dipush.
- Repo lokal ini adalah source of truth.
- Gunakan `clasp push` untuk mengisi script kosong `10R4EH...` dari source repo.
- Jika ingin lebih mudah di PowerShell, gunakan wrapper:
  - `.\clasp-ivan.ps1 push`

## File penting

- `.clasp.json`:
  - file lokal yang menunjuk `scriptId` aktif
  - tidak ikut di-commit
- `.clasp.example.json`:
  - template aman untuk repo, sudah memakai urutan ekstensi `.gs` lebih dulu agar tidak bentrok dengan `.js`
- `.claspignore`:
  - file yang tidak ikut di-push ke Apps Script
- `clasp-ivan.ps1`:
  - wrapper PowerShell kecil agar semua command CLASP repo ini otomatis memakai profil `ivan`

## Cek akun aktif

Gunakan:

```powershell
clasp -u ivan show-authorized-user
```

## Alur aman sebelum dan sesudah coding

Saat mulai:

```powershell
git pull origin main
cd apps-script
clasp -u ivan status
```

Saat selesai:

```powershell
cd apps-script
clasp -u ivan push
git add .
git commit -m "feat: update apps script"
git push
```
