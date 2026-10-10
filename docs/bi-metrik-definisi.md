# BI — Definisi Metrik Dashboard Analitik

Dokumen ini adalah **register metrik** sebelum ada satu pun visualisasi di frontend.
Tujuannya: setiap angka di dashboard harus bisa ditelusuri ke sumber tabel/indeks
Convex yang ada, dengan definisi yang sama yang dipakai developer dan operator.

Status dokumen: **draft internal fase BI-1/BI-2**, bukan janji fitur ke user.

---

## 1. Prinsip penamaan & batasan

- Semua nilai uang dalam **rupiah bulat**.
- Semua waktu dalam **epoch milidetik server** kecuali disebut lain.
- Status yang dipakai di ringkasan BI **harus pakai status kanonik produk**,
  bukan ejaan warisan. Untuk pinjaman gunakan `src/lib/statusPinjaman.ts`.
- Definisi metrik hanya boleh memakai tabel yang **sebenarnya ada** di schema.
  Jika sumber data belum ada, metrik tersebut masuk **Metrik Tunda**, bukan
  metrik yang definisinya dimasukkan asumsi.

---

## 2. Register metrik

### 2.1 Produksi & pencairan pinjaman tunai

#### BI-L1 · Total pengajuan pinjaman baru (per periode)

- **Sumber**: `loans`
- **Definisi operasional**:
  jumlah baris `loans` yang pertama kali tercatat dalam periode yang ditentukan.
  Gunakan `_creationTime` atau `diajukanPada` bila tersedia, dengan kebijakan
  per periode yang konsisten (mis. mulai UTC/nol menit WIB).
- **Filter wajib**:
  - Tidak memakai filter status — hitung seluruh pengajuan baru yang masuk,
    bukan hanya yang lolos tinjauan.
- **Catatan double-count**:
  - Satu pengajuan = satu baris `loans`. Tidak boleh dihitung dari `nasabahProfil`,
    `kycProfil`, atau log komunikasi.
  - Baris warisan yang dibuat sebelum konvensi waktu berlaku harus digunakan
    dengan hati-hati; kalau `diajukanPada` dipakai, pastikan hanya yang memang
    punya kolom itu yang dimasukkan, atau gunakan `_creationTime` saja agar
    definisi stabil.

---

#### BI-L2 · Pengajuan masuk ke tahap tinjauan

- **Sumber**: `loans`
- **Definisi operasional**:
  jumlah baris `loans` yang berada di tahap tinjauan saat snapshot,
  atau yang baru masuk tahap tinjauan dalam periode (tergantung mode ringkasan).
- **Status yang dihitung**:
  gunakan `diTahapTinjauan(status)` dari `src/lib/statusPinjaman.ts`.
  Jangan membuat definisi sendiri berbasis teks status.
- **Catatan double-count**:
  - Tahap ini boleh mencakup ejaan warisan bila aplikasi masih membaca data lama,
    tapi definisi BI harus tetap merujuk status kanonik yang sama dengan sistem.
  - Beda dengan BI-L1: BI-L1 menghitung pengajuan **baru**, BI-L2 menghitung
    posisi **di tinjauan**.

---

#### BI-L3 · Pinjaman disetujui (disalurkan)

- **Sumber**: `loans`
- **Definisi operasional**:
  jumlah pinjaman dengan status kanonik `didanai`.
- **Catatan**:
  kolom `didanaiPada` ada di `loans` dan bisa dipakai untuk metrik “disalurkan
  dalam periode ini”. Status kanonik yang dipakai tetap `didanai`, bukan
  `disetujui` — karena `disetujui` hanya sub-tahap internal yang tidak berarti
  dana sudah ditandai tersalurkan.

---

#### BI-L4 · Pencairan / total pokok pinjaman yang disalurkan

- **Sumber**: `loans`
- **Definisi operasional**:
  jumlah pokok dari pinjaman dengan status `didanai`.
  Hitung dari `loans.pokokPinjaman` untuk setiap baris yang memenuhi filter status/waktu.
- **Filter wajib**:
  - Status = `didanai`
  - Periode disalurkan didefinisikan dari `didanaiPada` bila tersedia.
- **Catatan double-count**:
  - Jangan hitung dari `deposits`/`fundings`/`ledger` sebagai pengganti pokok
    pinjaman kecuali ada definisi resmi yang mengaitkannya. Pokok produk
    pinjaman tunai ada di `loans.pokokPinjaman`.
  - Jangan jumlahkan `pokokDiajukan`; angkat bisnis butuh yang disetujui/dialokasikan.

---

### 2.2 Gadai

#### BI-P1 · Pengajuan gadai baru

- **Sumber**: `pawns`
- **Definisi operasional**:
  jumlah baris `pawns` baru dalam periode.
- **Catatan**:
  pola-nya sama dengan pinjaman: hitung dari `pawns._creationTime` atau kolom waktu
  pengajuan yang ada di schema.

---

#### BI-P2 · Gadai aktif

- **Sumber**: `pawns`
- **Definisi operasional**:
  jumlah baris `pawns` dengan status gadai yang sedang berjalan sesuai validator
  produk (`pawnStatusValidator`).
- **Catatan**:
  jangan inventori “gadai yang pernah ada”. Gunakan status kanonik gadai yang
  dipetakan sama seperti modul gadai; kalau ada status warisan, sesuaikan lewat
  fungsi pemetaan produk, bukan teks bebas.

---

### 2.3 Kredit barang (Skema C)

#### BI-K1 · Pengajuan kredit barang baru

- **Sumber**: `kreditBarang`
- **Definisi operasional**:
  jumlah baris `kreditBarang` baru dalam periode.
- **Catatan**:
  ini menghitung pengajuan masuk, bukan barang yang sudah jadi kredit resmi.
  Status hanya relevan bila bisnis meminta ringkasan “pengajuan masuk vs disetujui”.

---

#### BI-K2 · Kredit barang disetujui

- **Sumber**: `kreditBarang`
- **Definisi operasional**:
  jumlah baris `kreditBarang` dengan status setujui/berjalan sesuai `kreditStatusValidator`.
- **Catatan**:
  definisi harus merujuk schema status kredit barang, bukan status pinjaman.

---

#### BI-K3 · Total pokok kredit barang yang dialokasikan / disalurkan

- **Sumber**: `kreditBarang` + `kreditFundings`
- **Definisi operasional (opsional / tunda dahulu)**:
  jika bisnis meminta angka “total dana kredit barang yang sudah dialokasikan”,
  sumber yang tepat adalah ringkasan alokasi kredit barang, bukan sekadar
  `kreditBarang.pokokDibiayai` kalau alokasi sudah dipisah.
- **Status**:
  masuk **Metrik Tunda** sampai skema dan alur pendanaan kredit barang dibaca
  lebih lanjut (dokumen ini tidak berasumsi dulu).

---

### 2.4 Deposit / uang masuk manual

#### BI-D1 · Total uang masuk tercatat (deposit tercatat)

- **Sumber**: `manualPaymentReceipts` / tabel setara yang benar-benar ada
- **Definisi operasional (opsional / tunda)**:
  jumlah atau ringkasan nilai dari bukti uang masuk yang **sudah tercatat**.
- **Status**:
  masuk **Metrik Tunda**.

Alasannya satu: dokumen ini belum membaca sumber resmi “uang masuk manual” dan
tidak boleh membangun definisi dari nama tabel yang asal-asalan. Kalau produk
memiliki skema `deposits` atau tabel setara, definisi BI-D1 baru disusun setelah
nama tabel, field status, dan waktu pencatatan dibaca ulang di BI-2 lanjutan.

---

### 2.5 Pembayaran / pelunasan

#### BI-R1 · Cicilan terbayar / total pelunasan pinjaman

- **Sumber**: `kreditPayments` untuk skema kredit, dan sistem pembayaran pinjaman
  yang ada untuk pinjaman/gadai.
- **Definisi operasional (opsional / tunda)**:
  jumlah atau nominal pembayaran yang **sudah tercatat dan lolos guard pembayaran**.
- **Status**:
  masuk **Metrik Tunda**.

Catatan penting: bukan setiap baris “pembayaran tercatat” otomatis berarti
“pembayaran terverifikasi/berhasil”. Definisi BI-R1 hanya ada setelah jelas
jalur pembayaran resmi dan status yang dihitung (tercatat / diverifikasi /
terbayar) — dan setelah tahu mekanisme guard yang dipakai produk.

---

### 2.6 Pencairan dana yang terverifikasi

#### BI-F1 · Dana yang sudah dicairkan (terverifikasi)

- **Sumber utama**: belum ditetapkan dalam draft ini.
- **Status**: **Metrik Tunda**.

Alasannya: istilah “terverifikasi” bisa berarti beberapa hal di sistem keuangan,
dan dokumen ini tidak boleh membangun definisi dari asumsi:
- Apakah yang dihitung adalah pencairan yang sudah teraudit di ledger?
- Apakah yang dihitung adalah alokasi yang sudah diterapkan/ditanai?
- Apakah yang dihitung adalah transfer keluar ke nasabah yang sudah tercatat?

Semua itu harus ditelusuri ke tabel yang tepat (`fundings`, `transferPendana`,
`ledger_entries`, atau modul pencairan produk) sebelum ada satu angka yang
ditampilkan.

---

### 2.7 Operasional nasabah & KYC

#### BI-C1 · Nasabah terverifikasi (KYC)

- **Sumber**: `kycProfil.status`
- **Definisi operasional**:
  jumlah pengguna dengan `kycProfil.status = VERIFIED`.
- **Catatan**:
  nilai ini bisa dipakai untuk “base nasabah siap produk”, tapi **bukan**
  sama dengan “nasabah sudah punya pinjaman” atau “nasabah sudah terverifikasi
  identitas secara bank/regulatory”. KYC mandiri di PINDAI adalah status
  identitas yang diproses petugas di modul KYC, bukan persetujuan pinjaman dan
  bukan bukti pencairan.

---

#### BI-C2 · Nasabah yang sedang mengajukan KYC

- **Sumber**: `kycProfil.status`
- **Definisi operasional**:
  jumlah pengguna dengan status progres KYC yang relevan
  (mis. `IN_PROGRESS`, `PENDING_REVIEW`, `NEEDS_CORRECTION`).
- **Catatan**:
  urutan status harus mengikuti definisi produk di `src/lib/kycStatus.ts` dan
  `src/convex/kyc.ts`, bukan tampilan panel saja.

---

### 2.8 Penagihan & operasional harian

#### BI-A1 · Kasus penagihan terbuka

- **Sumber**: `penagihanKasus`
- **Definisi operasional**:
  jumlah kasus penagihan sesuai status “masih aktif/terbuka” sesuai definisi
  produk di modul penagihan.
- **Catatan**:
  sangat penting membedakan “status pembayaran yang dicatat petugas” dengan
  “bukti pembayaran resmi di ledger/pinjaman”. Modul penagihan sendiri tidak
  memindahkan uang; ia hanya mencatat apa yang dilaporkan/dikerjakan petugas.

---

#### BI-A2 · Janji pembayaran masuk / terpenuhi

- **Sumber**: `penagihanJanji`
- **Definisi operasional**:
  jumlah janji yang dibuat / jumlah janji yang terpenuhi dalam periode,
  sesuai status janji produk.
- **Status**:
  opsional. Hanya masuk jika bisnis meminta metrik janji pembayaran, bukan
  sekadar ringkasan penagihan kasar.

---

### 2.9 Ringkasan keuangan utama (opsional untuk MVP)

#### BI-M1 · Jumlah penyedia dana aktif / total alokasi dana

- **Sumber**: `users` dengan role penyedia dana dan/atau `fundings` / `alokasiDana`
  (tergantung skema alokasi yang ada).
- **Definisi operasional**:
  jumlah penyedia dana dan/atau total alokasi dana yang tercatat.
- **Status**:
  masuk **Metrik Tunda** hingga skema alokasi & pendanaan resmi dibaca lengkap.
  Tidak boleh dibangun dari asumsi bahwa semua `users.role = DANA` otomatis
  berarti “penyedia dana aktif dengan dana terpakai”.

---

## 3. Tabel ringkasan status definisi

| Kode metrik | Sumber utama | Tingkat kesiapan | Alasan / catatan |
|---|---|---|---|
| BI-L1 | `loans` | Siap (definisi dasar) | Hitung deduktif dari status waktu; tapi sesuaikan periode dulu |
| BI-L2 | `loans` | Siap (definisi dasar) | Wajib pakai `diTahapTinjauan()` |
| BI-L3 | `loans` | Siap (definisi dasar) | Status kanonik `didanai` |
| BI-L4 | `loans` | Siap (definisi dasar) | Pokok disalurkan, bukan pokok diajukan |
| BI-P1 | `pawns` | Siap (definisi dasar) | Konfirmasi lapisan waktu di BI-2 lanjutan |
| BI-P2 | `pawns` | Siap (definisi dasar) | Status gadai harus dipetakan via schema |
| BI-K1 | `kreditBarang` | Siap (definisi dasar) | Pengajuan masuk |
| BI-K2 | `kreditBarang` | Siap (definisi dasar) | Disetujui/berjalan |
| BI-K3 | `kreditBarang` + `kreditFundings` | Tunda | Perlu audit alokasi dana kredit barang dulu |
| BI-D1 | `manualPaymentReceipts` / tabel deposit resmi | Tunda | Belum tentu tabel resmi yang tepat |
| BI-R1 | sistem pembayaran produk | Tunda | Harus bedakan tercatat vs terverifikasi vs terbayar |
| BI-F1 | `fundings` / `transferPendana` / `ledger_entries` / modul pencairan | Tunda | Definisi “terverifikasi” harus dieksplorasi lebih lanjut |
| BI-C1 | `kycProfil` | Siap (definisi dasar) | Jawaban: VERIFIED di `kycProfil.status` |
| BI-C2 | `kycProfil` | Siap (definisi dasar) | Progress KYC, bukan pinjaman |
| BI-A1 | `penagihanKasus` | Siap (definisi dasar) | Kasus terbuka, bukan total pembayaran resmi |
| BI-A2 | `penagihanJanji` | Opsional | Hanya jika bisnis meminta ringkasan janji |
| BI-M1 | `users` / alokasi dana / fundings | Tunda | Jangan asumsikan peran = dana aktif |

---

## 4. Catatan verifikasi double-count yang paling rawan

1. **Pokok pinjaman vs pokok diajukan vs pokok dibiayai** pisah di schema.
   Metrik pencairan hanya boleh pakai angka yang memang berstatus sebagai pokok
   produk yang relevan.
2. **Status KYC dan status pinjaman berbeda sumber**. Jangan menggabungkan
   `kycProfil.status` dengan `loans.status` untuk menghasilkan metrik “nasabah
   terverifikasi yang sudah dikasih uang”, kecuali ada definisi terpisah yang
   secara eksplisit menggabungkan keduanya.
3. **Kredit barang ada mekanisme pencairan otomatis di sistem**. Angka
   “disetujui” untuk kredit barang belum tentu sama dengan “dana sudah
   tersalurkan”, jadi kalau metrik berkaitan dana harus cek mekanisme
   `didanaiPada`/`fundings` setara untuk skema itu.
4. **Modul penagihan adalah catatan, bukan eksekusi pembayaran**. Jangan
   gunakan `penagihanPembayaran`/`penagihanJanji` sebagai sumber tunggal
   “pembayaran berhasil” untuk metrik keuangan utama, kecuali ada sinkronisasi
   eksplisit ke jalur pembayaran resmi.

---

## 5. Rencana lanjutan (BI-2 lanjutan + BI-4)

Sebelum ada query BI di Convex:

1. Tentukan **jangka waktu standar** tiap metrik:
   - total kumulatif,
   - periode harian,
   - periode bulanan,
   - snapshot status saat ini.
2. Pilih **sumber waktu**: `_creationTime`, `didanaiPada`, `lunasPada`,
   `dibuatPada`, `waktu`, atau kolom waktu spesifik produk lainnya.
3. Audit indeks yang tersedia per tabel (`by_user`, `by_status`, `by_loan`,
   `by_kredit`, `by_pendana`, dll) untuk memastikan agregasi tidak jadi
   `collect()` berat tanpa filter.
4. Tentukan apakah ada metrik yang lebih aman dihitung lewat **ringkasan
   tersimpan** atau **cron harian** (mis. untuk tren) alih-alih query langsung
   setiap render.
5. Bahasa definisi metrik “terverifikasi” dan “uang masuk manual” setelah
   menelusuri sumber pencairan & deposit resmi.
