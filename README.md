# POS Kantin

Monorepo untuk aplikasi POS Kantin berbasis HTML, CSS, dan JavaScript vanilla dengan backend Google Apps Script dan database Google Sheets.

## Isi Repo

- Frontend multi-page siap deploy ke Netlify
- Backend Apps Script modular untuk auth, users, transaksi, simpanan, dashboard, dan suppliers
- Dokumen setup yang dipecah menjadi file `.md` kecil berbahasa Indonesia
- Skill proyek untuk Codex di dalam repo dan siap dicopy ke skill global

## Struktur Utama

- `assets/` frontend CSS, JS, dan aset visual
- `apps-script/` source Google Apps Script yang disinkronkan dengan CLASP
- `docs/` panduan kerja bertahap untuk setup, schema, deploy, dan workflow
- `skills/pos-kantin/` skill kanonis proyek untuk Codex

## Quick Start

1. Baca [docs/README.md](./docs/README.md)
2. Ikuti [docs/01-setup-lokal.md](./docs/01-setup-lokal.md)
3. Ikuti [docs/03-clasp-workflow.md](./docs/03-clasp-workflow.md)
4. Siapkan spreadsheet baru sesuai [docs/05-spreadsheet-schema.md](./docs/05-spreadsheet-schema.md)
5. Isi `assets/js/config.js` dan setup `apps-script/.clasp.json` lokal

## Catatan Penting

- Repo ini sengaja hanya menyimpan placeholder config.
- Jangan commit URL Web App final, spreadsheet ID live, atau kredensial lain.
- `origin` sudah diarahkan ke `https://github.com/EvanderSG29/pos-kantin.git`, tetapi repository GitHub private tetap perlu dibuat manual lewat web GitHub sebelum push pertama.

