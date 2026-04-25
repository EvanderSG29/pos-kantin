# 08. Catatan Migrasi dari Spreadsheet Lama

## Sumber referensi Drive

- `Salinan dari 0. CATATAN KEUANGAN KANTIN`
- `Salinan dari CATATAN Petugas KANTIN`
- `Salinan Catatan simpanan Uang`

## Temuan utama

- Ada sheet tersembunyi
- Ada struktur multi-baris untuk 1 hari / 1 pemasok
- Ada nilai `#REF!`
- Ada data user yang emailnya belum lengkap
- Ada transaksi yang menuliskan beberapa petugas dalam satu sel

## Keputusan migrasi v1

- Jangan tulis langsung ke spreadsheet lama
- Gunakan spreadsheet baru dengan schema yang sudah dinormalisasi
- Transaksi baru wajib 1 baris = 1 item
- `input_by_user_id` dan `input_by_name` wajib 1 petugas per baris

## Mapping kasar

- `Nama User` lama -> sheet `users`
- daftar nama + saldo tahun ajaran baru -> sheet `buyers`
- `Input Jualan` lama -> sheet `transactions`
- `Sheet1` simpanan lama -> sheet `savings`
- Nama pemasok lama -> sheet `suppliers`

## Seed manual yang disarankan

1. Jalankan `setupApplicationSpreadsheet()`
2. Isi password admin dengan `setUserPasswordByEmail(...)`
3. Tambahkan user petugas aktif satu per satu
4. Tambahkan pemasok utama
5. Import CSV pembeli untuk membuat master `buyers` dan seed `savings`
6. Baru input transaksi dan keuangan harian dari aplikasi

## Catatan import CSV

- CSV diparsing di frontend admin lalu dikirim sebagai payload JSON ke Apps Script
- Header wajib: `nama_pembeli`, `kelas/kategori`, `saldo_awal`
- Import berjalan sebagai upsert berdasarkan kombinasi nama + kelas/kategori
- Pembeli lama yang tidak ada di file terbaru diarsipkan menjadi `nonaktif`, bukan dihapus
