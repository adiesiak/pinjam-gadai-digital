# Urutan Migrasi yang Aman

## 1. Persiapan

- Pastikan Anda memiliki akses ke Convex sumber.
- Tentukan sistem tujuan atau setidaknya kategori sistem tujuan.
- Catat versi aplikasi, environment, dan waktu migrasi.

## 2. Export

- Jalankan `convex export` di project sumber.
- Simpan hasil ekspor dalam lokasi yang aman.
- Verifikasi jumlah dokumen total dan jumlah per tabel.

## 3. Verifikasi awal

- Bandingkan jumlah dokumen di hasil ekspor dengan ekspektasi.
- Catat tabel yang ada dan tabel yang kosong.
- Catat referensi ID yang saling terhubung.

## 4. Pemisahan data sensitif

- Pisahkan data sensitif sesuai petunjuk sensitif/.
- Simpan file sensitif di tempat yang lebih terproteksi.

## 5. Pilih konverter

- Jika sistem tujuan terus Convex: gunakan `converters/to-convex.md`.
- Jika sistem tujuan SQL: gunakan `converters/to-postgres.sql` sebagai dasar.
- Jika sistem tujuan MongoDB: gunakan `converters/to-mongo.json`.
- Jika sistem tujuan Firebase: gunakan `converters/to-firebase.json`.

## 6. Persiapan skema tujuan

- Siapkan skema/struktur di sistem tujuan.
- Siapkan pemetaan ID jika perlu.

## 7. Import

- Import data berurutan agar relasi tidak terputus:
  - users dulu
  - nasabahProfil / penyedia dana
  - kycProfil
  - loans / kreditBarang
  - fundings
  - deposits / withdrawals
- Jika ID berubah, lakukan pemetaan ID lama → ID baru.

## 8. Verifikasi ulang

- Cek jumlah dokumen per tabel.
- Cek relasi antar tabel.
- Cek data sensitif tersimpan benar.
- Cek status, nominal, dan referensi utama.

## 9. Cutover

- Ubah konfigurasi aplikasi ke sistem tujuan (mis. `VITE_CONVEX_URL` bila memakai Convex lain).
- Uji beberapa alur penting di sistem tujuan.
- Jika ada masalah, siapkan rollback ke environment lama.

## 10. Dokumentasi

- Simpan catatan langkah yang dijalankan.
- Simpan kendala yang ditemui.
- Simpan pemetaan ID jika dibuat.
- Simpan keputusan terkait data sensitif.

## Catatan khusus Convex

- Convex menggunakan document ID, sehingga relasi antar document adalah hubungan berbasis _id.
- Jika sistem tujuan tidak pakai document ID, Anda harus menyimpan mapping _id lama → id baru.
- _id yang hilang atau tidak konsisten adalah sumber error migrasi terbanyak.
- _storage harus ditangani terpisah jika ada file.
