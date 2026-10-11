# Cara Menyalin Hasil Convex Export ke Paket Migrasi

Dokumen ini menjelaskan cara memindahkan hasil export dari Convex ke folder paket migrasi ini setelah Anda menjalankan `convex export`.

## 1. Siapkan hasil export

Biasanya hasil convex export berupa:

- file ZIP snapshot, **atau**
- folder hasil ekstraksi yang berisi JSONL per tabel dan folder `_storage` (jika ada berkas).

Cari terlebih dahulu struktur yang dihasilkan, misalnya:

- `snapshot.json`, `users.jsonl`, `loans.jsonl`, dst.
- atau `exported/` yang berisi folder tabel dan `_storage`.

Catat lokasi folder/reslt yang dihasilkan sebelum memulai salin.

## 2. Ekstrak jika masih ZIP

Jika hasilnya berupa ZIP:

- Ekstrak ke folder sementara, mis. `~/Downloads/convex-export-lalu/`.
- Pastikan isinya merupakan JSONL per tabel dan folder `_storage` kalau ada.

Jika Anda sudah punya folder hasil ekstraksi, lewatkan langkah ini.

## 3. Salin JSONL per tabel ke paket

Salin setiap file JSONL per tabel ke:

```
migration-convex/export/tabel/
```

Contoh:

- `users.jsonl`
- `nasabahProfil.jsonl`
- `kycProfil.jsonl`
- `kreditBarang.jsonl`
- `loans.jsonl`
- `fundings.jsonl`
- `deposits.jsonl`
- `withdrawals.jsonl`
- `penyediaDana.jsonl`

Jika ada tabel lain yang terexport, salin juga ke folder yang sama, atau catat tabel baru itu di `index.json`.

Jika ada tabel yang tidak relevan untuk migrasi pinjaman/pendana, Anda bisa tidak menyalinnya, tapi catat keputusan tersebut di catatan migrasi.

## 4. Tangani _storage jika ada

Jika hasil export berisi folder `_storage`:

- Salin isi `_storage` ke `migration-convex/export/_storage/` jika paket ini akan menyimpan snapshot lengkap.
- Jika _storage kosong saat ekspor, Anda bisa membuat folder kosong atau tidak membuat file apa pun, lalu catat status itu di `_meta.json`.

Penting: folder `_storage` bisa berisi berkas sensitif. Jika ada, pindahkan ke lokasi yang lebih terproteksi sesuai kebijakan Anda.

## 5. Update metadata

Setelah salin selesai, perbarui:

- `migration-convex/export/_meta.json`
  - `waktu_ekspor`
  - `waktu_ekspor_iso`
  - `volume_per_tabel`
- `migration-convex/export/index.json`
  - tambahkan tabel baru jika ada
  - catat tabel yang tidak disalin

## 6. Verifikasi jumlah dokumen

Hitung jumlah baris di setiap JSONL yang sudah disalin, lalu bandingkan dengan ekspektasi atau hitungan awal.

Cara kasar untuk menghitung baris JSONL:

```bash
# Linux/macOS
wc -l migration-convex/export/tabel/*.jsonl

# Windows PowerShell
Get-ChildItem migration-convex\export\tabel *.jsonl | ForEach-Object { 
  (Get-Content $_.FullName | Measure-Object -Line).Lines 
}
```

Catat hasilnya di catatan migrasi.

## 7. Pisahkan data sensitif

Jika Anda belum memisah data sensitif, lakukan sekarang:

- Salin atau buat file sensitif terpisah sesuai `sensitif/petunjuk-pisah-sensitif.md`.
- Simpan di lokasi yang lebih terproteksi.
- Catat mapping ID sensitif agar nanti bisa dipasang ulang di sistem tujuan.

## 8. Catat keputusan

Simpan catatan singkat:

- dari mana hasil export berasal,
- tabel apa yang disalin,
- tabel apa yang tidak disalin,
- apakah _storage ada atau kosong,
- apakah data sensitif dipisah,
- lokasi file hasil export asli yang disimpan.

Catatan ini membantu kalau migrasi nanti diperluas atau diperbaiki.

## 9. Keamanan

- Jangan simpan hasil export di folder yang mudah dicari atau diakses publik.
- Hindari membagikan folder migrasi sebelum Anda yakin tidak ada payload sensitif yang tertinggal.
- Jika hasil export sudah tidak dibutuhkan di tempat asal, pastikan Anda menghapus atau memindahkan salinannya sesuai kebijakan keamanan.
