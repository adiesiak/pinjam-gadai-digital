# Migrasi ke Project Convex Lain

Jika sistem tujuan tetap Convex, prosesnya lebih langsung karena struktur document ID tetap sama.

## Tahapan umum

1. Export dari project sumber:
   - Gunakan `convex export` untuk menghasilkan snapshot JSONL per tabel.
   - Simpan di paket migrasi.

2. Pisahkan data sensitif sesuai `sensitif/petunjuk-pisah-sensitif.md`.

3. Import ke project tujuan:
   - Buat ulang schema yang sesuai di project tujuan jika perlu.
   - Insert data per tabel dengan urutan yang benar: `users` dulu, lalu entitas yang merujuk ke `users`.
   - Jika _id Convex harus tetap sama, pastikan project tujuan mengizinkan atau Anda map ulang ID-nya.
   - Jika _id berubah, buat tabel pemetaan `convex_id_lama → convex_id_baru`.

4. Verifikasi:
   - Cek jumlah dokumen per tabel.
   - Cek relasi: `userId`, `loanId`, `danaId`, `pendanaId`, `nasabahUserId`, dll.
   - Cek data sensitif tersimpan dengan benar dan tidak tercecer.

5. Cutover:
   - Ganti `VITE_CONVEX_URL` atau konfigurasi project tujuan.
   - Lakukan verifikasi akhir di environment tujuan.

## Catatan

- Convex menggunakan document ID, bukan foreign key, jadi migrasi ke Convex lain tergantung apakah Anda ingin mempertahankan ID lama atau membuat ID baru.
- Jika Anda ingin ID baru, sediakan mekanisme relink karena banyak tabel merujuk satu sama lain.
- _storage perlu ditangani secara terpisah jika ada file. Saat ini _storage kosong, sehingga lebih mudah, tapi jika nanti ada file, Anda harus memindahkan dan mengunci reference-nya.
