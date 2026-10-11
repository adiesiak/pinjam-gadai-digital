# Paket Migrasi Convex → Sistem Lain

Paket ini berisi struktur ekspor baku dan template konversi untuk memindahkan data produksi Convex (pinjaman + pendana + data nasabah terkait) ke sistem tujuan yang belum ditetapkan.

Saat ini paket dibuat **netral terhadap sistem tujuan**, dengan asumsi:

- Convex diakses via `convex export` (snapshots ZIP berisi JSONL per tabel + folder `_storage`).
- Volume data kecil (contoh: 73 dokumen total, storage kosong), sehingga migrasi bisa diselesaikan dengan cepat dan diverifikasi manual.
- Relasi Convex adalah document ID, bukan foreign key DB tradisional, sehingga proses relink ID adalah bagian tersulit.

## Struktur paket

```
 migration-convex/
   README.md
   export/
     _meta.json
     index.json
     schema-mapping.md
     tabel/
       users.jsonl
       nasabahProfil.jsonl
       kycProfil.jsonl
       kreditBarang.jsonl
       loans.jsonl
       fundings.jsonl
       deposits.jsonl
       withdrawals.jsonl
       penyediaDana.jsonl
   converters/
     _README.md
     to-postgres.sql
     to-mongo.json
     to-firebase.json
     to-convex.md
   sensitif/
     _README.md
     petunjuk-pisah-sensitif.md
   urutan-migrasi.md
   pertanyaan-sistem-tujuan.json
```

## Cara kerja paket ini

1. Jalankan `convex export` di environment sumber.
2. Ekstrak file JSONL per tabel ke `export/tabel/`.
3. Pisahkan data sensitif sesuai `sensitif/petunjuk-pisah-sensitif.md`.
4. Verifikasi jumlah dokumen dan relasi awal.
5. Pilih sistem tujuan.
6. Gunakan file konverter sesuai sistem tujuan.
7. Import ke sistem tujuan.
8. Verifikasi ulang.
9. Cutover.

## Perlu Anda isi ulang

Isi file tabel yang ada di paket ini adalah **contoh placeholder**. Setelah ekspor asli siap, ganti dengan dokumen asli yang terexport. Jangan publish paket ini ke tempat yang tidak dipercaya sebelum Anda yakin tidak ada payload sensitif yang tertinggal.

## Keamanan

- Data sensitif seperti NIK, nomor rekening, email, dan dokumen identitas harus ditangani terpisah.
- Jika sistem tujuan memerlukan data sensitif, pertimbangkan enkripsi pada waktu transit dan penyimpanan, serta kontrol akses ketat.
- Hindari menyatukan payload sensitif dengan data operasional dalam satu file kecuali sistem tujuan memerlukannya dan Anda punya mekanisme perlindungan yang sesuai.
