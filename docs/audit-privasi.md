# Audit Perlindungan Data Pribadi PINDAI

> Status: **audit teknis internal**, bukan penilaian kepatuhan hukum.
> Dokumen ini mencatat apa yang benar-benar dilakukan kode, apa risikonya, dan apa
> yang harus diputuskan pihak hukum/kepatuhan. **Jangan** dipakai sebagai bukti
> atau pernyataan bahwa PINDAI sudah patuh UU PDP No. 27/2022 atau aturan lain.

- Cakupan: seluruh alur data pribadi di `src/convex` (server) dan `src/pages` +
  `src/components` (tampilan) — dari pengumpulan sampai penghapusan.
- Metode: pembacaan kode statis (skema Convex, gerbang peran, query/mutation,
  teks pemberitahuan, cron retensi, jalur ekspor). Tidak ada pengujian runtime
  terhadap data produksi, tidak ada audit konfigurasi Convex, tidak ada review
  kontrak pihak ketiga.
- Tanggal: 9 Oktober 2026.

> **Tindak lanjut 4 November 2026:** R-01 sudah dibatasi ke koordinat tingkat
> wilayah untuk non-admin; R-02 sudah ditutup dengan penyamaran nama di server;
> R-03 diperbaiki sebagian — akses baca dokumen KYC kini tercatat di audit dan
> tautan berumur 10 menit, tetapi tanda air masih overlay tampilan; R-04 sudah
> ditutup dengan halaman `/privasi`; R-05 diselesaikan dengan model lokasi wajib
> yang dijelaskan jujur (bukan opt-in), bukan dengan tombol cabut yang bisa
> ditimpa heartbeat; R-06 sudah dibatasi per pemilik alokasi. Temuan awal tetap
> disimpan di bawah sebagai catatan audit.

---

## 1. Inventarisasi pemrosesan data pribadi

Semua data disimpan di Convex (`src/convex/schema.ts`). Lokasi penyimpanan =
deployment Convex (di luar Indonesia — lihat `docs/aplikasi-native.md`), berkas
gambar di Convex storage.

| # | Data pribadi | Tabel / sumber | Tujuan pemrosesan | Dasar (klaim kode) | Pihak penerima | Retensi |
|---|---|---|---|---|---|---|
| 1 | Nama lengkap | `users.name`, `nasabahProfil.namaLengkap`, `loans/pawns/kreditBarang.namaLengkap` | Pencatatan pengajuan, identifikasi di kontrak & ledger | Pelaksanaan perjanjian + persetujuan S&K | Admin; ruang penyedia dana (`dana`/`pengamat`) | Ikut baris pinjaman; tanpa batas |
| 2 | **NIK 16 digit** | `nasabahProfil.nik`, `loans.nik` | Verifikasi identitas (KYC) | Persetujuan S&K (`persetujuanSyarat`) | **Admin saja** (`admin.dokumenKycUrls`) | Tanpa batas; ikut terhapus saat hapus akun |
| 3 | Nomor WhatsApp | `nasabahProfil.nomorWhatsApp`, `loans.nomorWhatsApp`, `waLogs.nomorTujuan` | Pengingat jatuh tempo, peringatan | Pelaksanaan perjanjian | Admin; gateway WA pihak ketiga | Tanpa batas |
| 4 | Alamat, pekerjaan, penghasilan | `nasabahProfil.alamat/pekerjaan/penghasilanBulanan`, `loans.penghasilanBulanan` | Penilaian kelayakan | Persetujuan S&K | Admin saja | Tanpa batas |
| 5 | Bank / nomor rekening | `nasabahProfil.namaBank/nomorRekening` | Pencairan & pembayaran | Pelaksanaan perjanjian | Admin saja | Tanpa batas |
| 6 | Foto KTP, selfie + KTP, slip gaji, tanda tangan | `nasabahProfil.fotoKtpId`, `loans.dokKtpId/dokSelfieKtpId/dokSlipGajiId`, `_storage` | Verifikasi identitas | Persetujuan S&K | Admin ber-watermark; **tidak** ke ruang penyedia dana | Tanpa batas (hanya terhapus saat hapus akun) |
| 7 | Foto barang jaminan | `pawns.fotoBarangId` | Penilaian jaminan | Pelaksanaan perjanjian | Ruang penyedia dana boleh membuka (`berkasPengajuan`) | Tanpa batas |
| 8 | **Lokasi GPS presisi + waktu + akurasi** | `lokasiJejak`, `lokasiStatus`, `loans.lokasiAjukan`, `lokasiPeringatan` | Gerbang "lokasi wajib" untuk aksi finansial; peninjauan | Gerbang produk (bukan opt-in, lihat R-05) | Admin **dan ruang penyedia dana termasuk sesi kode akses bersama** | 90 hari / 400 hari (pinjaman berjalan) — `crons.ts` |
| 9 | Perangkat & kredensial perangkat | `perangkat.token` (+`lokasiStatus.sumber`) | Heartbeat lokasi di luar WebView | Gerbang produk | Admin | Tanpa batas (terhapus saat hapus akun) |
| 10 | Email | `users.email`, `authAccounts` | Login OTP | Pelaksanaan perjanjian | Admin | Tanpa batas |
| 11 | Log pesan keluar | `waLogs.isiPesan/nomorTujuan/respon` | Diagnosa pengiriman | Kepentingan sah operasional | Admin | Tanpa batas |
| 12 | Jejak audit | `auditLog` (aktor, aksi, target, detail) | Akuntabilitas tindakan admin/tulis | Kepentingan sah / kewajiban internal | Admin | Tanpa batas |
| 13 | Persetujuan tracking | `trackingConsents` | Bukti persetujuan | Persetujuan | Admin | Terhapus saat hapus akun |

Catatan inventaris:

- **Tidak ada** analitik pihak ketiga, cookie pemasaran, atau pelacakan iklan di
  kode. Satu-satunya panggilan eksternal dari peramban adalah tile peta
  (`PetaLokasiPeminjam.tsx` → OSM/CartoCDN) dan gambar KYC dari Convex storage.
- Data identitas (NIK, rekening, WA, alamat) **tidak pernah** diserialkan ke
  ruang penyedia dana: barisnya dibentuk lewat whitelist di
  `src/convex/penyediaDana.ts` (lihat komentar modul, baris 1–30) dan dokumen
  identitas hanya dibuka `admin.dokumenKycUrls`.

---

## 2. Yang sudah baik (jangan diubah tanpa alasan)

1. **Gerbang di server, bukan hanya UI.** `requirePengamat`, `requireBerkasPemohon`,
   dan `requireAdminSession` menolak tamu/anonim/peran salah di sisi Convex
   (`src/convex/penyediaDana.ts`, `src/convex/adminAuthz.ts`).
2. **Dokumen identitas tidak pernah masuk ruang penyedia dana.** `berkasPengajuan`
   hanya mengembalikan foto barang jaminan; KTP/selfie/slip dibatasi admin dan
   ditampilkan lewat `WatermarkedDoc`.
3. **Retensi lokasi berjalan otomatis.** `crons.ts` → `tracking.bersihkanLokasiLama`
   (90 hari, 400 hari bila menempel pinjaman berjalan), bekerja per batch dari
   baris tertua dan berhenti lebih awal bila semuanya ditahan.
4. **Validasi unggahan di server.** `berkasIdentitas.ts` memeriksa metadata
   `_storage` dan (lewat action) magic bytes, bukan hanya di form.
5. **Kredensial tidak disimpan mentah** (sebagian): `aksesBersama.kodeHash`,
   token "ingat perangkat" (`security.ts`) di-hash, dan percobaan kode dibatasi
   + diblokir sementara.
6. **Audit tindakan tulis/admin** termasuk jumlah baris turunan yang dihapus
   (`auditLog.rincianHapus`) — cukup untuk mempertanggungjawabkan penghapusan.
7. **Hapus akun membereskan turunan**: kredensial auth, sesi, MFA, consent,
   status & jejak lokasi, perangkat, data diri, dan **foto KTP di storage**
   (`src/convex/hapusAkunTurunan.ts`).
8. **Anti-SSRF pada gateway WhatsApp** (endpoint wajib HTTPS, hostname publik) dan
   pemeriksaan gambar tidak dapat dilewati dari klien.

---

## 3. Daftar risiko

Tingkat = dampak terhadap subjek data × kemudahan terjadi, tanpa memperhitungkan
kecanggihan penyerang. **R-01…R-03 wajib ditutup sebelum skala produksi.**

### R-01 — Lokasi presisi peminjam dibagikan ke pihak luar & sesi anonim · **Tinggi**

**Bukti.** `penyediaDana.titikPeminjam` (dan `daftarPengajuan` per baris) hanya
dijaga `requirePengamat`, lalu mengembalikan `posisi { lat, lng, akurasi, waktu }`
apa adanya; `PetaLokasiPeminjam.tsx` menggambar koordinat persis dengan tooltip
nama + nomor referensi. `requirePengamat` juga menerima peran `pengamat`, yaitu
**sesi tamu yang dibuat dengan satu kode akses bersama** dan tidak dapat
ditelusuri ke orang tertentu.

**Dampak.** Koordinat rumah/tempat kerja peminjam terlihat oleh setiap pemegang
kode bersama dan setiap akun penyedia dana, untuk **semua** pengajuan — bukan
hanya yang ia danai. Ini pengungkapan lokasi individu yang sedang berutang.

**Kontradiksi dasar pemrosesan.** Syarat & Ketentuan Pasal "Data Pribadi &
Lokasi" (`src/pages/SyaratKetentuan.tsx`) menyatakan: *"Titik lokasi hanya tampil
untuk keperluan peninjauan internal."* Ruang penyedia dana bukan peninjauan
internal, jadi pemberitahuan yang berlaku sekarang **tidak** mencakup pemrosesan
yang benar-benar terjadi.

**Perbaikan.** Lihat T-01, T-02.

### R-02 — Penyamaran nama hanya di peramban; payload server memuat nama lengkap · **Tinggi**

**Bukti.** `daftarPengajuan` mengisi `namaLengkap: loan.namaLengkap` dan
`titikPeminjam` mengisi `namaLengkap: l.namaLengkap`. Penyamaran dilakukan di
React (`samarkanNama`/`namaRuangan`, mis. `PenyediaDana.tsx` prop `namaTampil`).

**Dampak.** Siapa pun yang punya peran `dana` atau `pengamat` dapat membaca
respons query apa adanya (devtools, pesan WebSocket Convex, atau memanggil
`api.penyediaDana.daftarPengajuan` sendiri) dan memperoleh **nama lengkap semua
peminjam**. Penyamaran di UI memberikan rasa aman yang tidak nyata.
`docs/analisa-proyek.md` sudah memuat prinsip "Zero Fake Data" — menyamarkan di
klien melanggar semangat prinsip itu.

**Perbaikan.** Lihat T-02.

### R-03 — Akses dokumen identitas tidak tercatat, dan tanda air tidak menempel pada berkas · **Tinggi**

**Bukti.** `admin.dokumenKycUrls` (`src/convex/admin.ts:714`) adalah `query` yang
memeriksa `requireAdmin` lalu **tidak menulis entri audit apa pun**. Komentar di
`berkasPengajuan` mengklaim berkas identitas "tercatat"
(`src/convex/penyediaDana.ts:842`) — klaim itu tidak sesuai kode. `WatermarkedDoc`
hanya overlay CSS: URL bertanda tangan Convex mengembalikan gambar **asli**, jadi
tanda air hilang begitu berkas diunduh/dibuka di tab baru.

**Dampak.** Tidak ada jejak siapa membuka KTP/selfie siapa dan kapan; tanda air
tidak melindungi berkas jika URL bocor (URL bertanda tangan juga hidup di riwayat
peramban, cache, dan log proxy). Tanpa jejak, penelusuran insiden hampir tidak
mungkin.

**Perbaikan.** Lihat T-03.

### R-04 — Tidak ada pemberitahuan privasi; S&K saja dan sebagian tidak akurat · **Sedang–tinggi**

**Bukti.** Rute di `src/main.tsx` hanya memuat `/syarat-ketentuan` — tidak ada
`/privasi`. `docs/aplikasi-native.md` sendiri mencantumkan "Kebijakan privasi &
syarat layanan tayang di URL publik" sebagai **item checklist yang belum
dicentang**. Pasal Data Pribadi hanya menyebut *apa yang diminta diunggah*, tanpa
tujuan per data, dasar pemrosesan, daftar penerima, masa simpan, hak subjek data,
atau kontak privasi. Pernyataan lokasi juga bertentangan dengan R-01.

**Perbaikan.** Lihat T-04.

### R-05 — Consent lokasi dicatat otomatis, sedangkan UI menjanjikan opt-in & pencabutan · **Sedang–tinggi**

**Bukti.** Komentar `tracking.pushTitik`: *"Persetujuan pemantauan kini tercatat
otomatis (bukan lagi opt-in)."* `simpanTitik` (`src/convex/lokasi.ts`) **mengaktifkan
ulang** baris `trackingConsents` setiap kali ada titik baru (`aktif: true`,
`disetujuiPada: now`) — jadi tombol "Nonaktifkan" di `LocationConsentCard`
(`src/pages/dashboard/notice-views.tsx:133`) ditimpa oleh heartbeat berikutnya,
sementara kartu itu menyatakan *"opt-in, dapat dicabut"* dan *"Belum aktif.
Aktifkan jika Anda bersedia…"*.

**Dampak.** Persetujuan tidak "diberikan secara bebas": pemrosesan lokasi
berjalan walau pengguna menolak, dan penolakan tidak bertahan. Karena
`requireLokasiSegar` memblokir aksi finansial tanpa titik segar, pengguna juga
diarahkan menyetujui agar bisa bertransaksi — perlu penilaian apakah pemberitahuan
dan mekanisme saat ini cukup untuk syarat persetujuan.

**Perbaikan.** Lihat T-05.

### R-06 — Ruang penyedia dana tidak dibatasi "kebutuhan untuk tahu" per akun · **Sedang**

**Bukti.** `daftarPengajuan` mengambil 100 baris terbaru dari **seluruh** `loans`,
`pawns`, dan `kreditBarang` tanpa menyaring "hanya pengajuan yang saya danai".

**Dampak.** Akun penyedia dana yang baru dibuat langsung melihat data pribadi
(nama lengkap, tujuan pinjaman, barang jaminan, lokasi) seluruh nasabah, termasuk
yang tidak pernah ia danai. Minimalisasi data seharusnya berarti: penyedia dana
hanya melihat apa yang ia danai — dan bahkan itu tidak otomatis membenarkan
pembagian identitas/lokasi.

**Perbaikan.** Lihat T-06.

### R-07 — Token perangkat lokasi disimpan tanpa hash · **Sedang**

**Bukti.** `perangkat.token` disimpan apa adanya dan diindeks `by_token`
(`src/convex/schema.ts:605`); `lokasi.heartbeatNative` mencari perangkat dari token
itu dan menulis titik lokasi sebagai sumber "aplikasi" — tanpa sesi pengguna.
Bandingkan dengan `aksesBersama.kodeHash` dan token "ingat perangkat" di
`security.ts` yang di-hash.

**Dampak.** Kebocoran basis data (backup, snapshot, akses admin) memberi penyerang
kredensial yang dapat dipakai menyuntik titik lokasi palsu untuk akun korban —
dan titik "dari aplikasi" justru bernilai lebih tinggi karena memenuhi kebijakan
`wajibAplikasiNative`. Perlu dicatat: status token ini juga **tidak** dijelaskan
di kebijakan privasi mana pun.

### R-08 — Tidak ada prosedur & jejak insiden data · **Sedang**

**Bukti.** Kata "insiden", "breach", atau "kebocoran data" tidak muncul di `src`
maupun `docs`. `auditLog` hanya mencatat tindakan tulis/admin; **tidak ada
pencatatan akses baca** atas query ruang penyedia dana maupun pembukaan KTP (R-03).

**Dampak.** Tidak ada cara mendeteksi, membatasi, atau melaporkan pelanggaran data
pribadi secara terukur (termasuk tenggat pemberitahuan di UU PDP), dan tidak ada
bukti siapa melihat apa bila terjadi penyalahgunaan.

### R-09 — Retensi hanya ada untuk jejak lokasi · **Sedang**

**Bukti.** Satu-satunya cron retensi adalah `retensi-lokasi-jejak`. Tidak ada
retensi untuk: `waLogs` (nomor + **isi pesan**), `auditLog`, dokumen KTP/selfie/
slip (hanya hilang saat akun dihapus), `nasabahProfil`, atau `loans`.

**Dampak.** Data pribadi tersimpan tanpa batas waktu yang ditetapkan; bertentangan
dengan prinsip pembatasan penyimpanan dan menyulitkan penjelasan retensi di
pemberitahuan privasi.

### R-10 — Hak subjek data belum ada jalur mandiri · **Sedang**

**Bukti.** Tidak ada ekspor data pribadi mandiri (akses/portabilitas). Pengguna
hanya punya `tracking.riwayatSaya` (riwayat lokasi sendiri). Penghapusan hanya
lewat admin (`admin.hapusNasabah`, `duplikatNasabah.gabungNasabah` memanggil
`hapusTurunanAkun`) — tidak ada tombol "hapus akun/data saya".

**Catatan.** `riwayatSaya` **tidak** difilter `isAnonymous` (berbeda dari
`peringatanSaya`, `plafonSaya`, `bungaSaya`), sehingga sesi tamu yang belum
mengirim titik menerima array kosong — bukan kebocoran, tetapi tidak konsisten
dengan gerbang modul lain.

### R-11 — Snapshot backup admin berisi data pribadi mentah tanpa pengamanan berkas · **Sedang**

**Bukti.** `system.snapshotData` (`src/convex/system.ts:421`) mengumpulkan **semua**
baris `loans`, `pawns`, `users`, `waLogs`, `lokasiJejak`, `auditLog`, plus daftar
dokumen dan **URL bertanda tangan**-nya; `BackupPanel` mengunduhnya sebagai `.json`
ke perangkat admin. Unduhan tercatat (`system.catatBackup`) — bagus.

**Dampak.** Satu berkas teks berisi seluruh riwayat lokasi dan log pesan seluruh
nasabah, disimpan di laptop/unduhan tanpa enkripsi atau kontrol akses lanjutan.
Selain itu, teks di panel menyatakan snapshot memuat *"seluruh baris pengguna
(data dirinya) apa adanya"*, padahal `nasabahProfil` (NIK, alamat, rekening) dan
foto KTP **tidak** ikut — jadi pemulihan dari snapshot menghasilkan basis data
tanpa KYC/rekening. Ini masalah ketepatan dokumentasi + integritas pemulihan,
bukan hanya privasi.

### R-12 — Transfer ke pihak ketiga & lintas negara · **Rendah–sedang**

**Bukti.** Tile peta dari `openstreetmap.org`/`cartocdn.com` menerima *viewport*
peta yang sedang dilihat (di sekitar lokasi peminjam) beserta alamat IP penonton.
Gateway WhatsApp generik mengirim nomor + isi pesan ke penyedia yang dipilih admin.
Deployment Convex berada di luar Indonesia (dicatat di `docs/aplikasi-native.md`).

**Dampak.** Ini transfer data ke pihak ketiga dan lintas negara yang perlu
disebutkan dan diberi dasar, bukan hanya dipasang sebagai fitur.

### R-13 — Tidak ada enkripsi tingkat field · **Rendah**

**Bukti.** NIK, nomor rekening, dan koordinat disimpan sebagai kolom biasa
(`nasabahProfil`, `lokasiJejak`). Perlindungan yang ada: TLS saat transit +
enkripsi at-rest bawaan platform Convex. Tidak ada enkripsi kolom atau
tokenisasi NIK.

### R-14 — Sesi kode akses bersama tidak dapat ditelusuri ke orang · **Rendah–sedang**

**Bukti.** Satu `aksesBersama.kodeHash` global melayani banyak sesi tamu
(`requirePengamat` memakai `aksesBersamaVersi`); pencabutan hanya menaikkan versi
untuk menghentikan **semua** pemakai, tanpa daftar siapa saja yang pernah memakainya.
`auditLog.aktorLabel` bergantung pada label akun, yang justru tidak ada untuk sesi
anonim.

---

## 4. Perbaikan teknis yang diusulkan

| # | Perbaikan | Berkas utama | Menutup |
|---|---|---|---|
| **T-01** | Batasi lokasi presisi di ruang penyedia dana: hilangkan `posisi` dari `titikPeminjam`/`daftarPengajuan`, atau turunkan resolusinya (bulatkan ke grid ±1–2 km) + tampilkan hanya "ada/tidak ada titik" dan jarak bila memang perlu. Peta live presisi hanya untuk admin. | `src/convex/penyediaDana.ts`, `src/components/penyediaDana/PetaLokasiPeminjam.tsx` | R-01 |
| **T-02** | Pindahkan penyamaran ke **server**: kirim `namaSamar` yang sudah disamarkan (atau kirim nama hanya saat pengaju = pemilik akun), dan berhenti mengirim `namaLengkap` ke peran `pengamat`/`dana`. Hapus `namaTampil` opsional di komponen; uji bahwa payload tidak memuat nama lengkap. | `src/convex/penyediaDana.ts`, komponen `src/components/penyediaDana/*`, `src/pages/PenyediaDana.tsx` | R-02, R-06 |
| **T-03** | Catat setiap pembukaan dokumen identitas: ubah `dokumenKycUrls` menjadi mutation/action yang menulis `auditLog` (aktor, `loanId`, jenis berkas), dan simpan URL bertanda tangan berumur pendek bila Convex mendukungnya. Sinkronkan komentar klaim "tercatat". | `src/convex/admin.ts`, `src/components/admin/LoanKycPanel.tsx` | R-03, R-08 |
| **T-04** | Tambah halaman `/privasi` (publik, ditautkan dari landing, auth, dashboard, dan form pengajuan) yang memuat: jenis data, tujuan, dasar, penerima (termasuk penyedia dana & gateway WA), retensi, transfer lintas negara, hak subjek data + kontak, dan versi/riwayat perubahan. Perbaiki Pasal Data Pribadi di S&K agar cocok dengan perilaku kode (khusus pernyataan lokasi). | `src/pages/SyaratKetentuan.tsx`, halaman baru + rute di `src/main.tsx`, `src/pages/Landing.tsx` | R-01, R-04, R-12 |
| **T-05** | Jadikan consent lokasi benar-benar opt-in yang bertahan: `simpanTitik` **tidak boleh** mengaktifkan ulang consent; bila `aktif === false`, tolak penerimaan titik. Selaraskan teks kartu dengan perilaku nyata dan jelaskan konsekuensinya (transaksi tertahan) sebelum tombol aktifkan. | `src/convex/lokasi.ts`, `src/convex/tracking.ts`, `src/pages/dashboard/notice-views.tsx` | R-05 |
| **T-06** | Saring `daftarPengajuan`/`titikPeminjam` per akun penyedia dana: hanya pengajuan yang berhubungan dengan akun itu, dan hentikan pemberian akses sesi `pengamat` ke data lokasi/identitas sama sekali. | `src/convex/penyediaDana.ts` | R-01, R-06, R-14 |
| **T-07** | Hash `perangkat.token` (simpan `tokenHash`, cari lewat hash) dan terbitkan ulang token saat perangkat didaftarkan ulang — sejalan dengan `security.ts`. | `src/convex/lokasi.ts`, `src/convex/schema.ts`, `src/convex/http.ts` | R-07 |
| **T-08** | Tambah cron retensi untuk `waLogs`, `lokasiPeringatan`, dan pemberitahuan; tetapkan kebijakan retensi eksplisit untuk dokumen KYC (mis. hapus berkas bila pengajuan ditolak / X bulan setelah lunas) dan untuk `auditLog`. | `src/convex/crons.ts`, modul baru, `src/lib/system-config.ts` | R-09 |
| **T-09** | Tambah jalur mandiri subjek data: ekspor "data saya" (JSON) dan permintaan hapus akun dengan alur verifikasi + audit, memakai `hapusTurunanAkun` yang sudah ada. | `src/convex/`, `src/pages/dashboard` | R-10 |
| **T-10** | Beri peringatan tegas + langkah pengamanan sebelum mengunduh snapshot (mis. konfirmasi ganda, pengingat menyimpan terenkripsi), perbaiki teks panel agar akurat soal apa yang **tidak** ikut (KYC/rekening), dan putuskan apakah snapshot wajib memuat `nasabahProfil` untuk pemulihan penuh. | `src/components/admin/BackupPanel.tsx`, `src/convex/system.ts` | R-11 |
| **T-11** | Tulis prosedur insiden: kanal laporan, langkah pembatasan, kewajiban notifikasi beserta tenggatnya, serta daftar query yang harus diperiksa. Sekaligus aktifkan pencatatan akses baca pada data sensitif. | `docs/`, `src/convex/` | R-08 |
| **T-12** | Putuskan enkripsi tingkat field untuk NIK & nomor rekening (atau tokenisasi), dan sebutkan eksplisit apa yang dienkripsi platform vs yang tidak. | `src/convex/schema.ts`, jalur tulis/baca | R-13 |

Prioritas: **T-01, T-02, T-03, T-05, T-04** lebih dulu (risiko tinggi + pemberitahuan),
lalu T-06…T-12.

---

## 5. Perlu tinjauan hukum / kepatuhan

Poin berikut **tidak dapat** diselesaikan di kode dan harus diputuskan pihak
hukum/kepatuhan:

1. **Dasar pemrosesan per tujuan.** Tetapkan dasar untuk tiap tujuan pada tabel
   §1 — terutama lokasi: apakah pemberitahuan + mekanisme saat ini sudah
   memenuhi syarat persetujuan, atau lokasi harus dipisah sebagai persetujuan
   tersendiri yang benar-benar dapat dicabut.
2. **Pembagian data ke penyedia dana.** Apakah wajar secara hukum membagikan
   identitas/lokasi peminjam kepada penyedia dana pihak ketiga — dan bila ya,
   bentuk perjanjian kerahasiaan/Pengendali–Prosesor yang diperlukan, serta
   apakah PINDAI bertindak sebagai pengendali atau prosesor.
3. **Penyamaran sebagai kontrol.** Tegaskan secara tertulis bahwa penyamaran nama
   **bukan** dasar pembenar pembagian data (kode saat ini justru tidak menyamarkan
   di server, lihat R-02) dan **bukan** pemenuhan prinsip minimalisasi.
4. **Dokumen identitas.** Apakah akses KTP/selfie yang terbatas pada admin +
   tanda air di layar sudah memadai, atau perlu kebijakan izin "perlu untuk tahu",
   batas waktu URL, dan larangan pengunduhan.
5. **Retensi.** Setujui masa simpan per jenis data (KYC, log WA, audit, lokasi,
   data keuangan) termasuk dasar menahan data setelah akun dihapus untuk
   kewajiban pembukuan/sengketa.
6. **Hak subjek data.** Sepakati isi dan SLA untuk akses, koreksi, penghapusan,
   penarikan persetujuan, dan portabilitas, lalu cocokkan dengan T-09.
7. **Insiden & notifikasi.** Tentukan pemicu, peran, tenggat notifikasi ke subjek
   data dan otoritas, serta kewajiban dokumentasi.
8. **Transfer lintas negara & pihak ketiga.** Sahkan dasar transfer (deployment
   Convex di luar Indonesia, tile peta, gateway WhatsApp) dan cantumkan
   penyedianya di pemberitahuan privasi; tinjau syarat layanan masing-masing.
9. **Pemberitahuan privasi & S&K.** Terbitkan versi final `/privasi`, beri
   penomoran versi, dan sinkronkan `CONTRACT_TERMS_VERSION` serta rekaman
   `persetujuanSyarat` supaya versi yang disetujui pengguna dapat dibuktikan.
10. **Uji toko (Play/App Store).** Data safety form dan deklarasi izin lokasi
    harus cocok dengan perilaku kode yang sebenarnya — termasuk setelah T-01/T-05.

---

## 6. Batasan audit

- Hanya pembacaan kode. Tidak ada pemeriksaan konfigurasi deployment Convex,
  kebijakan retensi penyedia, enkripsi at-rest aktual, atau akses operator ke
  konsol produksi.
- Tidak ada uji penetrasi, tidak ada pengujian runtime terhadap data nyata, dan
  tidak ada verifikasi bahwa pengguna sungguh melihat pemberitahuan sebelum
  menyetujui (hanya jejak `persetujuanSyarat` di server).
- Tidak ada penilaian hukum. Daftar risiko ini **tidak** menyatakan PINDAI patuh
  atau tidak patuh terhadap UU PDP No. 27/2022, POJK 6/2022, atau aturan lain.
- Beberapa klaim pada komentar kode tidak sesuai perilaku nyata (mis. "tercatat"
  untuk akses KTP, "opt-in" untuk lokasi). Temuan di atas memakai perilaku kode,
  bukan komentarnya.
