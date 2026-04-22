# 03. Workflow CLASP

## Tujuan

CLASP dipakai sebagai jembatan antara source code lokal di folder `apps-script/` dan project Google Apps Script di cloud.

## Alur yang dipakai di repo ini

1. Masuk ke folder `apps-script`
2. Buat project Apps Script standalone:
   - `clasp create --type standalone --title "POS Kantin API"`
3. Atau clone project yang sudah ada:
   - `clasp clone SCRIPT_ID_ANDA`
4. Pastikan file `.clasp.json` lokal terbentuk
5. Jalankan `clasp push`

## File penting

- `.clasp.json`:
  - file lokal yang menunjuk `scriptId`
  - tidak ikut di-commit
- `.clasp.example.json`:
  - template aman untuk repo
- `.claspignore`:
  - file yang tidak ikut di-push ke Apps Script

## Cek akun aktif

Gunakan:

```powershell
clasp show-authorized-user
```

## Alur aman sebelum dan sesudah coding

Saat mulai:

```powershell
git pull origin main
clasp pull
```

Saat selesai:

```powershell
clasp push
git add .
git commit -m "feat: update apps script"
git push
```

