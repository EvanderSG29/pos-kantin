# 07. Struktur Frontend

Semua path di dokumen ini relatif ke folder `app/`.

## Root HTML

- `index.html`
- `login.html`
- `admin.html`
- `petugas.html`
- `transaksi.html`
- `pemasok.html`
- `pembayaran.html`
- `users.html`
- `simpanan.html`
- `laporan.html`
- `404.html`

## Halaman shell

- `admin.html`, `petugas.html`, `transaksi.html`, `pemasok.html`, `pembayaran.html`, `users.html`, `simpanan.html`, dan `laporan.html` memakai shell yang sama
- Markup konten tiap halaman disimpan di `<template id="page-template">`
- `sidebar` dan `topbar` dirender sekali oleh runtime shell

## Halaman standalone

- `login.html`
- `index.html`
- `404.html`

## CSS aktif

- `assets/vendor/sb-admin-2/css/sb-admin-2.min.css`
- `assets/vendor/sb-admin-2/vendor/fontawesome-free/css/all.min.css`
- `assets/css/sb-admin-custom.css`

## JS core

- `assets/js/config.js`
- `assets/js/api.js`
- `assets/js/auth.js`
- `assets/js/app.js` runtime shell, favicon loading, dan main-content loader
- `assets/js/router.js` manifest route, history API, dan intersepsi navigasi internal
- `assets/js/storage.js`
- `assets/js/guards.js`
- `assets/js/utils.js`
- `assets/js/finance.js` kalkulasi transaksi, komisi, due date, dan grouping payout

## JS pages

- `assets/js/pages/login.js`
- `assets/js/pages/admin.js`
- `assets/js/pages/petugas.js`
- `assets/js/pages/transaksi.js`
- `assets/js/pages/pemasok.js`
- `assets/js/pages/pembayaran.js`
- `assets/js/pages/users.js`
- `assets/js/pages/simpanan.js`
- `assets/js/pages/laporan.js`

## JS components

- `assets/js/components/navbar.js`
- `assets/js/components/sidebar.js`
- `assets/js/components/table.js`
- `assets/js/components/modal.js`
- `assets/js/components/toast.js`
- `assets/js/components/form.js`

## Aset kecil

- `assets/favicon.svg`

## Mode config

- Renderer desktop berjalan dalam `DESKTOP_MODE`.
- URL Web App live tidak lagi di-hardcode di source frontend, tetapi dibaca dari config lokal Electron.
