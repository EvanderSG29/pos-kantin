# POS Kantin

Monorepo untuk aplikasi POS Kantin desktop berbasis Electron dengan renderer HTML, CSS, dan JavaScript vanilla, database lokal SQLite, backend Google Apps Script, dan database pusat Google Sheets.

## Isi Repo

- Runtime desktop Electron untuk Windows
- Frontend multi-page yang dipakai ulang di renderer Electron
- Database lokal SQLite untuk mode offline-first
- Backend Apps Script modular untuk auth, users, transaksi, simpanan, dashboard, dan suppliers
- Dokumen setup yang dipecah menjadi file `.md` kecil berbahasa Indonesia
- Skill proyek untuk Codex di dalam repo dan siap dicopy ke skill global

## Struktur Utama

- `app/` runtime desktop yang berisi HTML renderer, `assets/`, `electron/`, dan test Electron
- `apps-script/` source Google Apps Script yang disinkronkan dengan CLASP
- `docs/` panduan kerja bertahap untuk setup, schema, deploy, dan workflow
- `skills/pos-kantin/` skill kanonis proyek untuk Codex

## Quick Start

1. Baca [docs/README.md](./docs/README.md)
2. Jalankan `npm install`
3. Ikuti [docs/13-electron-setup.md](./docs/13-electron-setup.md)
4. Ikuti [docs/03-clasp-workflow.md](./docs/03-clasp-workflow.md)
5. Siapkan spreadsheet baru sesuai [docs/05-spreadsheet-schema.md](./docs/05-spreadsheet-schema.md)
6. Jalankan `npm test`
7. Jalankan `npm run dev`

## Catatan Penting

- Repo ini sengaja hanya menyimpan placeholder config.
- Jangan commit URL Web App final, spreadsheet ID live, atau kredensial lain.
- `origin` sudah diarahkan ke `https://github.com/EvanderSG29/pos-kantin.git`, tetapi repository GitHub private tetap perlu dibuat manual lewat web GitHub sebelum push pertama.
