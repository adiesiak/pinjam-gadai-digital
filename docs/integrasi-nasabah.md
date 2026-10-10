# Integrasi Nasabah ↔ KYC ↔ Plafon ↔ Pengajuan

Catatan ini menjelaskan pemisahan **MASTER DATA NASABAH** dari **TRANSAKSI
PENGAJUAN PINJAMAN** pada PINDAI, apa yang sudah ada sebelumnya, apa yang
ditambahkan, dan batas-batasnya.

## Struktur (sebelum & sesudah)

**Sebelum** — sudah sebagian benar, tetapi transaksi masih membawa salinan KYC:

- `users` (akun/role, `plafonPinjaman`, `persenBunga`, `kodePeminjam`)
- `nasabahProfil` — master data diri (satu baris per akun)
- `kycProfil` — satu status KYC per **nasabah** (sudah `userId`, bukan `loanId`)
- `loans` — pengajuan dengan `userId` **plus salinan** NIK/WA/penghasilan +
  `dokKtpId`/`dokSelfieKtpId`/`dokSlipGajiId`
- Plafon hanya "maksimal" (`lib/plafon.plafonPeminjam`), belum ada
  terpakai/tersedia.

**Sesudah** — relasi master eksplisit, tanpa menghapus histori:

- `loans` mendapat kolom **opsional** (aditif, data lama tetap sah):
  - `nasabahUserId` — relasi `LoanApplication → Borrower/Nasabah`
  - `kycProfilId` + `kycStatusSaatPengajuan` — referensi & snapshot KYC saat
    pengajuan dikirim (bukan salinan dokumen)
  - `migrasiPada` — penanda baris lama yang dilekati relasi oleh migrasi
  - indeks baru `by_nasabah`
- `nasabahProfil.dibuatMigrasi` — penanda baris yang dibuat alat migrasi
  (agar dapat dibatalkan dengan aman)
- Salinan KTP/selfie/NIK lama **tetap disimpan** untuk audit; pengajuan baru
  mengikat ke `kycProfil` dan tidak menyalin ulang saat KYC sudah ada.

## Plafon master

`lib/plafon.ts` menambah `ringkasPlafon()` (pure) →

```
maksimal  = plafon efektif (override admin atau progresif)
terpakai  = Σ pokok pinjaman berstatus "didanai" (aktif/terutang)
tersedia  = maksimal − terpakai  (tidak pernah negatif)
```

- `nasabah.plafonRingkasSaya` — ringkasan milik nasabah yang masuk.
- `admin.daftarPlafonPeminjam` — tiap baris kini memuat `plafonTerpakai` &
  `plafonTersedia`.
- `loans.createLoanApplication` — **server** menolak pengajuan yang melebihi
  `tersedia`, dengan pesan yang menyebut maksimal/terpakai/tersedia.
- Pinjaman lunas melepas plafon; pengajuan yang belum cair tidak menahan.

## Detail admin

`convex/nasabah.ts`:

- `detailNasabah` (admin, TOTP): profil, KYC ringkas, plafon, profil risiko,
  hitungan pinjaman, **riwayat pengajuan kronologis** (#001, #002, …), dan
  riwayat pembayaran — semuanya dari database.
- `detailPengajuan` (admin, TOTP): nomor, nasabah, status KYC, nominal, tenor,
  biaya/dana bersih/kewajiban dari **snapshot** baris pinjaman, status,
  pendanaan, pencairan, pembayaran, keterlambatan.

`lib/risikoNasabah.ts` menilai nasabah secara **deterministik** dari riwayat
(lunas/tepat waktu menaikkan; ditolak/terlambat menurunkan). Skor hanya alat
bantu tampilan — tidak ada keputusan kredit otomatis.

UI: `components/admin/NasabahDetailDialog.tsx` (tombol **Profil nasabah** di
panel Plafon) dan bagian **Lihat Profil Nasabah** + detail pengajuan di
`LoanKycPanel.tsx`. Dokumen KYC tidak dimuat default: tombol **Lihat KYC**
memanggil `kyc.detailKycAdmin` (admin ber-TOTP) yang mengembalikan URL
bertanda tangan.

## Migrasi data lama

`convex/migrasiNasabah.ts`:

- `laporanMigrasiNasabah` (admin, dry-run) — jumlah pengguna tanpa profil,
  perkiraan perlu review manual, pinjaman tanpa relasi master/KYC, dan
  **kandidat duplikat** (dilaporkan, tidak digabung).
- `jalankanMigrasiNasabah` (admin) — idempoten & aditif: membuat `nasabahProfil`
  hanya bila belum ada dan identitas lengkap; melekati relasi master pada
  pengajuan yang belum punya. **Tidak** mengarang status KYC (paling tinggi
  `NOT_STARTED`), tidak menimpa baris yang sudah ada, tidak mengubah nilai
  finansial/status pinjaman. Mengembalikan `migrasiPada`.
- `batalkanMigrasiNasabah` (admin) — menghapus hanya baris berpenanda migrasi
  pada jalannya itu. Histori pinjaman tidak pernah dihapus.

## Batas

- Salinan KYC pada baris pinjaman **lama** sengaja tidak dihapus (audit &
  kompatibilitas). Pengajuan **baru** mengikat ke master.
- Migrasi diuji lewat convex-test (dry-run, jalan, idempoten, rollback); belum
  dijalankan pada data produksi.
- `detailPengajuan` belum dipakai sebagai layar admin penuh — ia tampil sebagai
  ringkasan master di dalam dialog review pengajuan.
