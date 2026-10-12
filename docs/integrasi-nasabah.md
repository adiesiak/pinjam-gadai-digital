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

## Dua penyederhanaan alur (permintaan pemilik produk)

**1. Form pengajuan pinjaman memakai ulang KYC terverifikasi.** Saat status KYC
nasabah `VERIFIED`, bagian **Data diri dan dokumen (wajib)** (NIK, foto KTP,
selfie, bukti penghasilan) TIDAK ditanyakan lagi: formulir menampilkan badge
hijau ("Identitas & KYC Terverifikasi. Data disimpan aman") beserta ringkasan
yang dipakai pengajuan (nama, NIK bertopeng, nomor WA), lalu menuntun ke
parameter pengajuan saja — nominal, tenor, tujuan, rekening, tanda tangan.

- Sumber nilainya `lib/kyc.identitasPengajuanDariKyc` (MURNI): mengembalikan
  identitas lengkap hanya bila isian & ketiga berkas ada, dan `null` bila belum
  lengkap — saat itu formulir menampilkan bagian data diri seperti biasa, jadi
  tidak pernah ada isian yang hilang tanpa jejak.
- Bentuk isiannya diperiksa dengan `validateKycInput` yang sama dengan server,
  sehingga tidak ada isian yang lolos server tetapi ditolak UI (dan sebaliknya).
- Berkasnya TIDAK diunggah ulang: id berkas dari baris `kycProfil` dipakai apa
  adanya, dan server tetap memeriksa berkasnya lewat `periksaBerkasIdentitasStorage`.
- `kyc.kycSaya.isian.penghasilanBulanan` ditambahkan sebagai angka MENTAH
  (aditif) — teks `penghasilan` yang terformat tetap ada untuk dibaca manusia,
  sedangkan formulir tidak boleh menghitung uang dari teks berformat.
- Gadai & kredit barang tidak diubah pada langkah ini: kedua produk itu tidak
  meminta unggahan dokumen, isian identitasnya cukup ditulis sekali di
  formulirnya sendiri.

**2. Review pengajuan di dashboard admin jadi tiga kotak ringkas.**
`components/admin/RingkasanEksekutifPengajuan.tsx` (presentasional, diuji di
`RingkasanEksekutifPengajuan.render.test.tsx`) merangkum:

1. **Metrik pengajuan** — nominal pokok, tenor, potongan di muka, bunga, total
   pelunasan, bank & nomor rekening tujuan. Angkanya dari
   `lib/rincianAliranDana.rincianPinjamanNyata` (mesin uang yang sama dengan
   ledger), bukan rumus di JSX.
2. **Profil nasabah** — nama, nomor WhatsApp, status KYC dan skor integritas
   dari master (`nasabah.detailNasabah`), plus tombol kecil **Lihat Lampiran
   Foto KTP/Selfie** yang membuka MODAL (bukan gambar yang memenuhi layar).
3. **Aksi admin** — Setujui Pengajuan / Tolak / Kirim Notifikasi WA, memakai
   aturan transisi yang sama dengan server (`lib/statusPinjaman`).

Rincian panjang (data diri tersimpan, KYC & dokumen, koordinat, kontrak, aliran
dana) tidak dihapus — hanya ditutup di accordion "Rincian lengkap & lampiran
pengajuan", dan pembaruan status penyelesaian ("Tandai dana tersalurkan",
"Tandai lunas") tetap di footer yang menempel.

## Batas

- Salinan KYC pada baris pinjaman **lama** sengaja tidak dihapus (audit &
  kompatibilitas). Pengajuan **baru** mengikat ke master.
- Migrasi diuji lewat convex-test (dry-run, jalan, idempoten, rollback); belum
  dijalankan pada data produksi.
- `detailPengajuan` belum dipakai sebagai layar admin penuh — ia tampil sebagai
  ringkasan master di dalam dialog review pengajuan.
- Kotak ringkas review TIDAK mengubah data apa pun: ia membaca (`detailNasabah`,
  `admin.dokumenKycUrls`, `rincianPinjamanNyata`) dan menyerahkan keputusan ke
  mutation yang sudah ada.
