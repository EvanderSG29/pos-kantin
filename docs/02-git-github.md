# 02. Workflow Git dan GitHub

## Alur harian paling aman

1. `git status`
2. `git add .`
3. `git commit -m "feat: pesan yang jelas"`
4. `git push`

## Saat mulai kerja

1. `git pull origin main`
2. Cek apakah ada perubahan lokal yang belum rapi
3. Baru lanjut edit file

## Saat selesai 1 bagian kecil

- Commit kecil lebih aman daripada menunggu perubahan menumpuk
- Contoh pesan commit:
  - `feat: bootstrap frontend multi-page`
  - `feat: add apps script api actions`
  - `docs: add setup and migration guides`

## Repo private

- Repo target disarankan tetap `private`
- Buat repo `EvanderSG29/pos-kantin` lewat GitHub web
- Setelah repo dibuat:
  - `git push -u origin main`

## Aturan aman

- Jangan pakai `git reset --hard` untuk workflow harian
- Jangan commit `.clasp.json`, `.clasprc.json`, `.env`, URL live, atau secret lain
- Biasakan cek `git diff` sebelum commit besar

