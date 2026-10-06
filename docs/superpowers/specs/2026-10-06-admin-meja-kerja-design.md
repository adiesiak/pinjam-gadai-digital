# PINDAI — Meja Kerja Admin (Desain)

Dokumen kerja untuk tim PINDAI. Tujuannya satu: **tim operasional harus bisa
mulai kerja dan menemukan antrean yang perlu ditindak dalam hitungan detik**,
tanpa menebak-nebak di antara 17 menu sidebar.

Sifat dokumen ini: **rencana, bukan kode.** Belum ada berkas aplikasi yang
diubah. Setelah disetujui, penerapan mengikuti §11.

---

## 0. Ringkasan keputusan

| Pertanyaan | Keputusan | Alasan |
|---|---|---|
| Halaman default saat panel admin dibuka | **"Hari Ini"** (bukan `"pinjaman"`) | Panel ini meja kerja, bukan satu antrean. "Pinjaman" hanya 1 dari 17 modul; menjadikannya default menyembunyikan gadai, kredit, DPD, alert lokasi, dan status ledger dari pandangan pertama. "Hari Ini" adalah satu-satunya halaman yang bisa merangkum lintas modul. |
| Kebijakan aksi cepat di baris antrean | **Hanya "Tinjau" + aksi non-mutasi (salin referensi, saring). Tidak ada tombol setujui/tolak/cairkan inline** | Hampir semua perpindahan uang di backend sengaja *fail-closed* (`paymentGuard.rejectUnverifiedMoneyMovement`, `src/convex/paymentGuard.ts:7-11`). Tombol inline "Cairkan"/"Verifikasi" akan **selalu gagal** di server — lebih buruk daripada tidak ada tombol. Keputusan uang juga butuh konteks (KYC, taksiran, catatan review) yang hidup di dialog, dan daftar pindai rawan salah-klik pada uang nyata. |
| Pendekatan perubahan | **A sekarang; C menyusul** (lihat §3) | A menyelesaikan masalah nyata (orientasi + navigasi) murni di lapisan komposisi: tanpa perubahan backend, tanpa menulis ulang 19 panel. |
| Navigasi layar kecil | **Bottom bar 4 tab + sheet "Cari menu"**, mengganti `<select>` 17 opsi | `<select>` ber-`optgroup` menyembunyikan isi tiap menu dan memaksa gulir panjang; lencana angka tidak terbaca di dalam `<option>`. |
| Sidebar desktop | **Tidak diubah** (kecuali satu tombol "Hari Ini" di atasnya) | Sidebar ber-accordion sudah menampilkan 17 modul + lencana dengan benar. Mengubahnya menambah risiko tanpa manfaat. |
| Backend / Convex | **Tidak ada perubahan** di Fase 1 | Seluruh data "Hari Ini" sudah tersedia dari query yang panel admin **sudah** berlangganan. |
| Palet & token warna | **Tidak diubah** | `src/index.css` memetakan ulang skala Tailwind (slate→kertas hangat, emerald→kuningan, sky→hijau tinta, amber→bata, red→marun). Warna baru akan keluar dari sistem. |
| Infrastruktur uji React | **Tidak ditambah** | Repo belum punya uji komponen React; vitest hanya mencakup `src/convex/**`. Logika baru dipisah ke fungsi murni + harness SSR yang sudah ada. |

---

## 1. Konteks & masalah

Panel admin dirakit di `src/pages/Admin.tsx` (209 baris) → `src/pages/admin/admin-shell.tsx`
(header, statistik) → `src/pages/admin/admin-tabs.tsx` (409 baris: sidebar + isi panel).

Fakta yang menjadi dasar desain ini (nomor baris = keadaan berkas saat dokumen ini ditulis):

| Lokasi | Isi |
|---|---|
| `admin-tabs.tsx:123` | `const [activeTab, setActiveTab] = useState("pinjaman")` — default hari ini adalah satu antrean. |
| `admin-tabs.tsx:291` | `const panel: Record<string, ReactNode>` — pemetaan nilai tab → isi panel. |
| `admin-tabs.tsx:404` | `{panel[activeTab]}` — **tanpa penjaga**; nilai tab yang tidak punya panel akan merender kosong. |
| `admin-tabs.tsx:184` | `badge: ledger?.seimbang ? "OK" : "!"` — saat `ledger` masih `undefined`, badge sudah berkedip merah `!`. |
| `admin-tabs.tsx:98` | `ringkasGrup()` menjumlahkan **semua** lencana angka, termasuk `alokasi` = `stats.pinjamanDisetujui` (sudah disetujui, bukan menunggu). |
| `admin-tabs.tsx:314` | Bar `<select>` sticky untuk layar kecil — satu-satunya navigasi di bawah `lg`. |
| `admin-tabs.tsx:343` | Sidebar accordion desktop (`aria-label="Navigasi panel admin"`). |
| `Admin.tsx:185-192` (prop `AdminTabs`) | `overview`, `stats`, `ledger`, `onOpenLoan`, `onOpenPawn`, `onOpenSetup` — semua data yang dibutuhkan "Hari Ini" sudah dioper ke `AdminTabs`. |
| `admin.ts:888` / `:919` | `pendingDeposits` / `pendingWithdrawals` — query baca-saja untuk kartu 5 (Fase 2). |

Masalah yang dilaporkan dan/atau teramati:

1. **Titik masuk salah.** Admin membuka panel → mendarat di "Pinjaman". Bila pekerjaan hari ini ada di gadai/DPD/ledger, ia harus tahu dulu harus ke mana.
2. **Lencana berbohong.** `ringkasGrup` mencampur "menunggu tindakan" dengan "jumlah informasi" (R3), dan menyalakan merah saat data belum termuat (R1).
3. **Navigasi layar kecil buta.** `<select>` tidak menampilkan `hint` setiap menu dan lencananya terpotong.
4. **Tidak ada ringkasan lintas modul.** Tidak ada satu tempat yang menjawab "apa yang perlu saya kerjakan sekarang?".

---

## 2. Tujuan / Non-tujuan

**Tujuan**

- Satu halaman default yang menjawab "apa yang perlu ditindak hari ini" dari data yang sudah ada.
- Setiap modul tetap terjangkau dalam ≤2 ketukan di layar kecil, ≤1 klik + 1 gulir di desktop.
- Semua angka menunjukkan keadaan sebenarnya: **"—" saat memuat, bukan 0**; 0 berarti benar-benar nol.
- Satu kebijakan aksi baris yang eksplisit dan aman untuk uang.
- Menutup temuan R1, R2, R3 sekaligus di jalur yang sama.

**Non-tujuan (Fase 1)**

- Tidak menulis ulang isi 19 panel di `src/components/admin/`.
- Tidak menambah query/mutation Convex, tidak menyentuh `paymentGuard` atau endpoint fail-closed.
- Tidak mengubah palet, `src/index.css`, `vite.config.ts`, skema Convex, atau rute.
- Tidak menambah pustaka uji atau komponen React baru di luar `src/components/ui/` yang sudah ada.
- Tidak menambah konsep penugasan/klaim tiket (lihat C).

---

## 3. Pendekatan A / B / C

| Pendekatan | Isi | Biaya | Status |
|---|---|---|---|
| **A — Lapisan komposisi** | Panel "Hari Ini" baru + navigasi baru + pemisahan logika murni ke `admin-queue.ts` + pemakaian ulang `QueueRow`/`EmptyQueue`/`SubTabFilter`. Nol perubahan backend, nol penulisan ulang panel. | Rendah | **Dikerjakan sekarang** |
| **B — Penyeragaman isi panel** | Menyeragamkan tata letak di dalam 19 panel (header kartu, sub-tab, keadaan kosong, tabel→kartu). | Sedang–tinggi | Ditunda |
| **C — Model ruang kerja** | Aggregasi sisi server, filter tersimpan, penugasan tiket per admin, kotak masuk pribadi, notifikasi. | Tinggi | Menyusul setelah A terpakai |

Alasan A dulu: A menyelesaikan keluhan yang nyata dengan risiko terkecil, dan ia
**tidak menghalangi B/C** — `admin-queue.ts` (bagian murni) menjadi fondasi
keduanya. Mengerjakan B lebih dulu berarti menyeragamkan tampilan panel yang
mungkin belum tentu dibuka operator.

---

## 4. Arsitektur informasi

Tiga belas modul tetap seperti sekarang; hanya dikelompokkan ulang untuk layar
kecil. Desktop memakai 5 grup accordion yang sudah ada; layar kecil memakai 4 tab.

**Peta lengkap — 17 modul + "Hari Ini" = 18 nilai tab, tanpa duplikat dan tanpa yang hilang:**

| Tab bawah (mobile) | Modul (chip) | Asal grup desktop |
|---|---|---|
| **Hari Ini** | `hari-ini` | *(baru — di atas accordion)* |
| **Antrean** | `pinjaman`, `gadai`, `kredit`, `alokasi`, `dpd`, `lelang` | Pengajuan & tindakan + `dpd`,`lelang` dari Pemantauan |
| **Nasabah** | `plafon`, `akses`, `lokasi` | Nasabah & penyedia dana + `lokasi` dari Pemantauan |
| **Sistem** | `ledger`, `pengumuman`, `whatsapp`, `config`, `template`, `loglogin`, `audit`, `backup` | Komunikasi + Sistem & keamanan + `ledger` dari Pemantauan |

Hitungan: 1 + 6 + 3 + 8 = **18**. ✓

Modul default tiap grup: Antrean→`pinjaman`, Nasabah→`plafon`, Sistem→`ledger`.

**Jaminan kelengkapan lewat tipe, bukan lewat disiplin.** Nilai tab dijadikan
satu sumber kebenaran di fungsi murni:

```ts
// src/lib/admin-queue.ts
export const NILAI_MODUL_ADMIN = [
  "hari-ini",
  "pinjaman", "gadai", "kredit", "alokasi", "dpd", "lelang",
  "plafon", "akses", "lokasi",
  "ledger", "pengumuman", "whatsapp", "config", "template", "loglogin", "audit", "backup",
] as const;
export type NilaiModulAdmin = (typeof NILAI_MODUL_ADMIN)[number];
```

Lalu di `admin-tabs.tsx` pemetaan panel dibuat **ekshaustif**:

```ts
const panel: Record<NilaiModulAdmin, ReactNode> = { /* … */ };
```

Akibatnya: modul tanpa panel = **galat kompilasi**, nilai tab asing = **galat
kompilasi**, dan `panel[activeTab]` dijamin terdefinisi menurut tipe. Ini menutup
**R2** secara struktural — bukan dengan penjaga runtime yang bisa terlewat.

---

## 5. Panel "Hari Ini"

Murni presentasional. Menerima prop yang **sudah** dioper `Admin.tsx` ke
`AdminTabs` (`overview`, `stats`, `ledger`) + `onBukaModul(value)` untuk CTA.

Kartu, urut prioritas:

| # | Kartu | Sumber | Angka | CTA |
|---|---|---|---|---|
| 1 | **Perlu keputusan** | `overview.loans` (`diajukan`,`sedang_direview`) + `overview.pawns` (`diajukan`,`sedang_dinilai`) + `overview.kredit` (`diajukan`,`sedang_ditinjau`) | jumlah ketiganya | → Antrean/Pinjaman |
| 2 | **Lewat tanggal acuan** | `stats.pinjamanTerlambat` | jumlah | → `dpd` |
| 3 | **Perhatian lokasi** | `stats.gpsMismatch + stats.titikDicurigai + stats.peringatanLokasiAktif + stats.pinjamanTanpaLokasi` | jumlah | → `lokasi` |
| 4 | **Ledger internal** | `ledger.seimbang`, `ledger.pendapatanPlatform`, `ledger.entryCount` | seimbang / tidak + Rp | → `ledger` |
| 5 | **Uang tertahan** *(Fase 2 — lihat §11)* | `api.admin.pendingDeposits`, `api.admin.pendingWithdrawals` | jumlah menunggu | → `ledger` |

**Aturan keadaan angka (wajib, berlaku untuk semua kartu):**

| Keadaan | Tampilan |
|---|---|
| Sumber `undefined` (memuat) | `—` redup + `aria-busy`, **bukan** `0` |
| Sumber gagal/`null` | "tidak tersedia" redup, bukan `0` |
| Sumber siap, nilai 0 | `0` + kalimat "tidak ada yang perlu ditindak" |

Ini persyaratan inti: hari ini `ringkasGrup` dan lencana memperlakukan "belum
termuat" sebagai "aman/kosong", yang membuat admin salah paham.

**Kartu 5 sengaja baca-saja.** Deposit & penarikan yang menunggu verifikasi
melewati endpoint yang *fail-closed* — `admin.ts:948` `processWithdrawal`
(tolak di `:952`) dan `admin.ts:1019` `confirmDeposit` (tolak di `:1023`),
keduanya memanggil `rejectUnverifiedMoneyMovement` (`paymentGuard.ts:7-11`). Karena itu kartu ini **hanya menampilkan
jumlah dan alasan tindakan otomatis dinonaktifkan**, plus instruksi verifikasi
manual di luar sistem. Tidak ada tombol "Setujui"/"Cairkan".

---

## 6. Kebijakan aksi cepat (keputusan)

**Aturan tunggal: satu baris antrean hanya boleh melakukan hal yang tidak
mengubah uang atau status.**

| Aksi | Inline di baris? | Alasan |
|---|---|---|
| **Tinjau** (buka `LoanReviewDialog` / `PawnReviewDialog` / panel kredit) | ✅ **tombol utama, satu per baris** | Non-mutasi. Dialog tujuan sudah memuat KYC, taksiran, dan penjaga otorisasi. |
| Salin nomor referensi | ✅ | Non-mutasi, sering dipakai saat verifikasi manual. |
| Ubah sub-tab / saring / cari | ✅ | Non-mutasi, sudah ada (`SubTabFilter`). |
| Setujui / tolak pengajuan | ❌ | Butuh konteks berkas + rawan salah-klik pada keputusan uang. Tetap di dalam dialog. |
| Cairkan dana / catat transfer / alokasi | ❌ | Endpoint *fail-closed* — tombol tidak akan pernah bisa berhasil. |
| Verifikasi / tolak deposit & penarikan | ❌ (baca-saja) | Sama: *fail-closed*. Tampilkan status + alasan dinonaktifkan. |
| Hapus data | ❌ | Sudah punya alur + konfirmasi sendiri di panelnya (mis. `IntegrasiLedgerPanel`, tombol "Hapus N terpilih"). |

Bentuk tombolnya: `QueueRow` (sudah ada di `admin-shared.tsx`) menambahkan satu
slot kanan berisi tombol `Tinjau` berkas ikon `size-4` di dalam tombol aksi
(konsisten dengan skala ikon yang didokumentasikan di kepala `admin-shared.tsx`).

---

## 7. Navigasi layar kecil

Mengganti `<select>` di `admin-tabs.tsx:314-341`.

**Bottom bar (tetap di bawah, `lg:hidden`, `fixed inset-x-0 bottom-0 z-30`):**
4 tab — `Hari Ini`, `Antrean`, `Nasabah`, `Sistem`. Tiap tab: ikon `size-4` +
label `text-[11px]`, keadaan aktif memakai `gradient-primary text-white` (kelas
yang sama dengan item sidebar aktif). Markup: `<nav aria-label="Menu operasi">`
berisi `<button aria-current="page">` — **bukan** `role="tablist"`, mengikuti
alasan yang sudah ditulis di `admin-shared.tsx` (komentar `SubTabFilter`):
penyaring satu daftar tidak perlu pasangan `tablist`/`tabpanel` yang mudah salah
pasang.

**Strip chip per tab** (`sticky top-14 sm:top-16`, di bawah `AdminHeader`):
chip modul milik tab itu, memakai `SubTabFilter` yang sudah ada. Chip terakhir
`Cari…` membuka sheet.

**Sheet "Cari menu"** (`sheet.tsx` + primitif `command.tsx`): input pencarian
otomatis fokus, menyaring 18 modul berdasarkan **label + nama grup + `hint`**.
Memilih hasil → set `activeTab`, buka grupnya, tutup sheet. Reuse `command.tsx`
(`CommandInput`/`CommandItem`/`CommandEmpty`) memberi navigasi papan ketik gratis.
Setiap modul terjangkau dalam ≤2 ketukan; lewat pencarian = 1 ketuk + mengetik.

**Desktop:** sidebar accordion tidak berubah; hanya ditambah satu tombol
**"Hari Ini"** di atas `Accordion` (`admin-tabs.tsx:343`), sehingga desktop juga
punya satu pintu masuk ringkasan. `activeTab` tetap sumber kebenaran tunggal
untuk kedua ukuran layar.

**Konsekuensi tata letak yang wajib diurus:**

- `<main>` di `Admin.tsx` perlu `pb-24 lg:pb-8` agar bottom bar tidak menutupi baris terakhir.
- Bottom bar memakai `pb-[env(safe-area-inset-bottom)]` untuk iPhone.
- Sheet/dialog tetap `z-50`, di atas bottom bar (`z-30`).
- Offset sticky hari ini `top-16` (64px) padahal `AdminHeader` setinggi 56px di bawah `sm` — perbaiki jadi `top-14 sm:top-16` agar tidak ada celah 8px.

---

## 8. Primitif bersama & berkas

**Baru**

| Berkas | Isi |
|---|---|
| `src/lib/admin-queue.ts` | **Murni, tanpa React.** `NILAI_MODUL_ADMIN`/`NilaiModulAdmin`, `ringkasGrup`, `jumlahPerluKeputusan`, `jumlahPerhatianLokasi`, `saringModul`, `GRUP_NAV` (pemetaan tab bawah → nilai modul). |
| `src/lib/admin-queue.test.ts` | Uji bun biasa (gaya `src/lib/promoProfil.test.ts`), masuk rantai `test` di `package.json`. |
| `src/pages/admin/meja-kerja.tsx` | Panel "Hari Ini" (§5). Presentasional. |
| `src/components/admin/admin-nav.tsx` | Bottom bar + strip chip + sheet "Cari menu" (§7). |

**Disunting**

| Berkas | Perubahan |
|---|---|
| `src/pages/admin/admin-tabs.tsx` | `activeTab` default → `"hari-ini"`; tambah item/panel `hari-ini`; `panel: Record<NilaiModulAdmin, ReactNode>` (ekshaustif); ganti `<select>` → `AdminNav`; `ringkasGrup` diimpor dari `admin-queue.ts` (R3), `LencanaTab` ditambah penjaga `undefined` (R1). |
| `src/pages/Admin.tsx` | Sisipkan `<MejaKerja>` lewat `panel["hari-ini"]` (via `AdminTabs`, tanpa prop baru bila CTA internal); tambah `pb-24 lg:pb-8` pada `<main>`. |
| `package.json` | Tambahkan `bun src/lib/admin-queue.test.ts` ke rantai skrip `test`. |

**Tidak disentuh:** `src/index.css`, `vite.config.ts`, `src/main.tsx`, rute,
`src/convex/**`, `src/components/ui/**`.

Tipe data panel tetap memakai tipe yang sudah ada (`LoanRow`, `PawnRow`,
`KreditRow`, `AdminStatsData`, `LedgerSummary`) — tidak ada tipe baru untuk data
server.

---

## 9. Temuan yang ikut ditutup

| Temuan | Cara ditutup |
|---|---|
| **R1** lencana merah palsu saat `ledger` `undefined` (`admin-tabs.tsx:184`) | `badge: ledger === undefined ? null : ledger.seimbang ? "OK" : "!"` |
| **R2** `{panel[activeTab]}` tanpa penjaga (`:404`) | `Record<NilaiModulAdmin, ReactNode>` yang ekshaustif → jaminan tipe (§4) |
| **R3** `ringkasGrup` melebih-lebihkan yang menunggu (`:98`) | `AdminTabItem` mendapat `hitung: "menunggu" \| "info" \| "tidak"`; `ringkasGrup` hanya menjumlah `"menunggu"`; `alokasi` (`stats.pinjamanDisetujui`) = `"info"` |
| **T1** tata letak di dalam panel | Ditunda ke B (di luar lingkup) |
| **T2** ekspor `ringkasGrup` untuk diuji | `ringkasGrup` pindah ke `admin-queue.ts`, diuji langsung |
| **T3** setiap nilai menu punya panel | Dijamin tipe (§4), bukan sekadar diuji |
| **T4** keadaan "memuat" palsu | Aturan `—` vs `0` (§5), berlaku juga untuk lencana |

---

## 10. Uji & verifikasi

**Uji otomatis (yang bisa dijalankan di sini)**

- `bun src/lib/admin-queue.test.ts` — uji murni, gaya `eq()`/penghitung yang sama dengan uji lib lain:
  - `ringkasGrup` → `null` bila semua nol; menjumlah **hanya** `hitung: "menunggu"`; mengabaikan `"info"` (kontra-contoh R3 dengan `alokasi`); `"!"` bila ada satu lencana `!`.
  - `jumlahPerluKeputusan` — fixture tiap status (`diajukan`/`sedang_direview`/`sedang_dinilai`/`sedang_ditinjau`) dihitung, `disetujui`/`ditolak`/`lunas` tidak.
  - `jumlahPerhatianLokasi` — menjumlah keempat stats.
  - `saringModul` — cocok pada label, nama grup, dan `hint`, tanpa peduli huruf besar/kecil.
  - `NILAI_MODUL_ADMIN` — 18 entri, **tanpa duplikat**.
- Tambahkan berkas itu ke rantai `test` di `package.json`.

**Verifikasi tipe & lint (dijalankan di sini)**

```
bunx tsc -b --noEmit
bunx eslint src/lib/admin-queue.ts src/lib/admin-queue.test.ts \
  src/pages/admin/meja-kerja.tsx src/components/admin/admin-nav.tsx \
  src/pages/admin/admin-tabs.tsx src/pages/Admin.tsx
```

Karena `panel` dibuat ekshaustif, `tsc` **adalah** uji T3 — modul tanpa panel
gagal kompilasi.

**Harness SSR (sudah ada di sesi ini)**

Render `AdminTabs` + `MejaKerja` ke string untuk memastikan tidak ada
`Cannot read properties of null` dan setiap nilai `NILAI_MODUL_ADMIN` merender
suatu isi (18/18). Ini pengganti terdekat uji komponen React yang belum ada di repo.

**Belum bisa diverifikasi di lingkungan ini (batasan, bukan lulus)**

- Tampilan visual di peramban / bottom bar sungguhan — tidak ada kendali peramban
  dan `scripts/.qa-admin-token` sudah kedaluwarsa. Pemeriksaan visual dilakukan
  oleh Anda di pratinjau.
- Uji "tombol gagal"-nya endpoint fail-closed: sudah pasti dari kode
  (`paymentGuard.ts:7-11` selalu melempar), tapi tidak dijalankan end-to-end.

---

## 11. Tahapan penerapan

1. **Fase 1 — fondasi murni.** `admin-queue.ts` + uji + masuk `package.json`. Tanpa UI.
2. **Fase 1 — "Hari Ini".** `meja-kerja.tsx`, `panel` ekshaustif, default → `"hari-ini"`, perbaikan R1/R3.
3. **Fase 1 — navigasi.** `admin-nav.tsx` (bottom bar + chip + sheet), hapus `<select>`, offset sticky, `pb-24`.
4. **Fase 2 — uang tertahan.** Kartu baca-saja dari `pendingDeposits`/`pendingWithdrawals` (bentuk keluaran perlu diperiksa dulu; tetap tanpa perubahan backend).
5. **Fase 3 — R4/R5.** `aria-controls`/`aria-labelledby` & navigasi panah antar-modul; menyusul bersama B/C.

Tiap fase harus meninggalkan aplikasi dalam keadaan **dapat dipakai** — tidak ada
fase yang menyisakan navigasi setengah jadi.

---

## 12. Pertanyaan terbuka untuk review

Keputusan "Hari Ini" (§0) dan kebijakan aksi cepat (§6) **sudah diputuskan** di
dokumen ini; keduanya bisa dibatalkan kalau Anda ingin sebaliknya:

1. **"Hari Ini" sebagai default** — setuju, atau tetap mendarat di `pinjaman`? (Bila tetap: `activeTab` default tidak berubah, panel "Hari Ini" tetap ada sebagai pintu masuk pertama.)
2. **Aksi baris hanya "Tinjau"** — setuju, atau ada aksi spesifik yang Anda ingin inline (mis. "Tandai sedang direview" yang non-uang)?
3. **Urutan kartu "Hari Ini"** (§5) — prioritas 1–4 sudah sesuai kebiasaan tim?
4. **Nama tab bawah** — `Antrean / Nasabah / Sistem` sudah cocok dengan istilah tim?
5. **Kartu uang tertahan** — kerjakan sebagai Fase 2, atau tunda sampai B/C?
