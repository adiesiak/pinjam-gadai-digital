# Schema Mapping untuk Migrasi Convex

File ini membantu Anda memetakan kolom penting dan menandai data sensitif sebelum migrasi.

## users

- `nama` → nama tampilan pengguna
- `email` → **sensitif**, perlu perlindungan
- `role` → peran sistem
- `plafonPinjaman` → info plafon jika ada
- `persenBunga` → info bunga khusus jika ada
- `kodePeminjam` → kode pseudonim
- `dibuatAdminPada` → historis akun

## nasabahProfil

- `userId` → relasi ke users
- `namaLengkap` → **sensitif**
- `nik` → **sensitif**, wajib dijaga
- `nomorWhatsApp` → **sensitif**
- `alamat` → sensitif bila ada
- `pekerjaan` → sensitif bila ada
- `penghasilanBulanan` → sensitif bila ada
- `namaBank` → sensitif bila ada
- `nomorRekening` → **sensitif**, wajib dijaga
- `fotoKtpId` → referensi storage, bukan isi file

## kycProfil

- `userId` → relasi ke users
- `status` → status KYC
- `namaLengkap`, `nik`, `nomorWhatsApp`, `alamat`, `penghasilanBulanan`, `namaBank`, `nomorRekening` → sensitif jika ada
- `keputusanCatatan` → sensitif bila ada

## loans

- `userId` / `nasabahUserId` → relasi ke users/nasabah
- `nomorReferensi` → referensi manusiawi
- `status` → status pinjaman
- `pokokPinjaman` → pokok yang disetujui
- `pokokDiajukan` → pokok pengajuan
- `tenorHari` / `tenorBulan` → tenor
- `didanaiPada` → waktu pencairan
- `lunasPada` → waktu pelunasan
- `pendanaId` → referensi penyedia dana
- `namaLengkap`, `nik`, `nomorWhatsApp`, `namaBank`, `nomorRekening` → sensitif jika ada

## kreditBarang

- `userId` → relasi ke users
- `nomorReferensi` → referensi manusiawi
- `status` → status kredit barang
- `namaLengkap`, `nik`, `nomorRekening`, `nomorWhatsApp` → sensitif jika ada
- `namaBarang`, `kategori`, `merchant` → data transaksi jual beli barang

## fundings

- `loanId` → relasi ke pinjaman
- `danaId` → relasi ke penyedia dana
- `jumlahAlokasi` → nominal alokasi
- `imbalHasil` → imbal hasil
- `status` → status alokasi
- `potonganAdmin`, `imbalHasilNet` → catatan pembagian jika ada
- `diselesaikanPada` → waktu penyelesaian

## deposits

- `userId` → relasi
- `jumlah` → nominal
- `namaBank`, `nomorRekening` → **sensitif**
- `status` → status deposit
- `nomorReferensi` → referensi

## withdrawals

- `danaId` → relasi
- `jumlah` → nominal
- `namaBank`, `nomorRekening` → **sensitif**
- `status` → status penarikan
- `nomorReferensi` → referensi

## penyediaDana

- `email` → sensitif jika ada
- informasi lain yang relevan untuk penyedia dana

## Catatan relasi

- Convex menggunakan `_id` document-based.
- Saat migrasi ke SQL atau basis data lain, Anda harus menyimpan pemetaan `_id lama → id baru` agar relasi tidak terputus.
- Relasi yang berulang seperti `userId`, `nasabahUserId`, `loanId`, `danaId`, `pendanaId` harus ditelusuri satu per satu.
