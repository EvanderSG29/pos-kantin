# 10. Konteks untuk Codex

## Tujuan proyek

Membangun aplikasi POS Kantin berbasis HTML, CSS, dan JavaScript vanilla yang mudah dideploy ke Netlify, menggunakan Google Apps Script sebagai backend, Google Sheets sebagai database, dan GitHub sebagai version control.

## Aturan penting

- Jangan commit `.clasp.json`
- Jangan commit URL Web App final, spreadsheet ID live, atau secret lain
- Semua write data harus lewat Apps Script
- Spreadsheet lama hanya untuk referensi baca
- Gunakan schema sheet baru yang sudah dinormalisasi
- `doGet` hanya untuk `health`
- `doPost` untuk semua action aplikasi
- GitHub account dan Google infra account memang dipisah

## Role

- Admin seed awal: Ivan dan Evander
- Petugas: data user dari sheet `users`

## Model akun

- GitHub owner: Evander
- CLASP / Apps Script / Spreadsheet owner: Ivan
- App admin login: Evander

## Referensi skill

Skill proyek ada di:

- `skills/pos-kantin/SKILL.md`
- `skills/pos-kantin/references/`

Versi global Codex akan dicopy ke:

- `C:\Users\smidg\.codex\skills\pos-kantin\`
