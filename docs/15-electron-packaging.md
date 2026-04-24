# 15. Build Windows

## Build installer

Jalankan dari root repo:

```powershell
npm run dist:win
```

Build akan mengambil source runtime dari folder `app/`, bukan dari root repo.

Output build ada di folder:

```text
dist\
```

## Konfigurasi aktif

- app directory: `app`
- target: `nsis`
- installer per-user
- `allowToChangeInstallationDirectory: true`
- icon Windows: `build/icon.ico`

## Catatan signing

V1 build lokal boleh unsigned untuk testing internal.

Kalau nanti mau distribusi lebih luas, tambahkan:

- certificate signing Windows
- publisher name
- pipeline release terpisah dari workflow dev lokal
