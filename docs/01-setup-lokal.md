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

## Langkah mulai kerja

1. Buka folder `C:\Projects\pos-kantin`
2. Jalankan `git status`
3. Jika repo GitHub private sudah dibuat lewat web GitHub, jalankan `git push -u origin main`
4. Masuk ke folder `apps-script`
5. Siapkan `.clasp.json` lokal dari `.clasp.example.json`
6. Jalankan `clasp push` setelah source Apps Script siap

## Catatan

- `gh` CLI belum terpasang, jadi pembuatan repo GitHub dilakukan lewat web GitHub.
- Source code hanya menyimpan placeholder config. URL Web App dan spreadsheet ID live tidak disimpan permanen di repo.

