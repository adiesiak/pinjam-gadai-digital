# Analisa Proyek PINDAI (Pinjam & Gadai Digital)

Catatan pembaca data: setiap temuan punya bukti yang bisa dijalankan ulang —
angka dihitung dari kode, bukan dari ringkasan atau ingatan. Bagian 0 mencatat
status perbaikan; bagian 1–7 adalah temuan dan tindakannya.

## 0. Status perbaikan

| # | Temuan | Status | Bukti |
| --- | --- | --- | --- |
| 1 | Tiga definisi "potongan admin" (ledger vs dashboard vs kartu ledger) | **Diperbaiki** | `lib/bagiHasil.ts` sekarang menghitung dari satu pintu; invarian lintas-modul ditambahkan di `lib/bagiHasil.test.ts` |
| 2 | Dua kebijakan pembulatan (half-up vs floor) untuk bunga yang sama | **Diperbaiki** | `bagiHasilPinjaman` memakai `percentOf`; 150.000 pokok yang dulu berselisih Rp1 kini identik |
| 3 | Pinjaman bulanan dihitung seolah satu bulan bunga | **Diperbaiki** (temuan baru, ditemukan saat verifikasi) | `bagiHasilPinjamanDari` memakai simulasi tenor penuh; tes Convex baru menahan regresinya |
| 4 | Rantai `bun run test` selalu merah → 14 berkas tes Convex tak pernah jalan | **Diperbaiki** | `bun run test` exit 0; vitest ikut berjalan |
| 5 | Tes loading screen bergantung urutan blok + splash `index.html` menyimpang | **Diperbaiki** | 57/57 lulus; `vault-snow` disamakan |
| 6 | 64 error ESLint | **Diperbaiki** | `bunx eslint .` → 0 error, 11 warning (semuanya pra-ada) |
| 7 | Rute mati `/penyedia-dana` → dirinya sendiri; `/pendana` 404 | **Diperbaiki** | `main.tsx` mengarahkan `/pendana` → `/penyedia-dana` |
| 8 | `.env.keys` tidak masuk `.gitignore` | **Diperbaiki** | `.gitignore` memuat `.env.keys` |
| 9 | Skrip QA yang menunjuk modul Convex yang sudah pindah | **Diperbaiki sebagian** | `api.pendana.*` → `api.alokasiDana.*`; skrip QA tidak bisa dijalankan di sandbox ini (butuh deployment + token admin) |
| 10 | Berkas besar (Landing 2.075 baris, PenyediaDana 2.074, …) | **Terbuka** | Belum dipecah — tidak mendesak |
| 11 | Copy kebijakan masih menyebut "5% dari total kewajiban" (halaman penyedia dana + Syarat & Ketentuan) | **Diperbaiki** | Kini "5% dari uang yang kembali (pokok + Imbal Hasil), bukan dari pokok" — sesuai kebijakan #16 |
| 12 | Kartu "Pendapatan tercatat" / tren melewatkan potongan admin (jurnal `payout`) | **Diperbaiki** | Predikat bersama + tes baru di `integrasiLedger.convex.test.ts` |
| 13 | Label "Biaya platform" dipakai untuk potongan admin (dua tempat) | **Diperbaiki** | Menjadi "Potongan admin", seragam dengan panel admin & akad. Dibalik lagi atas keputusan pemilik: ruang pendana kini menyebutnya "Biaya platform (layanan)" — istilah yang sama dengan akad & Pengaturan Sistem |
| 14 | Baris "Potongan admin" muncul dua kali dengan nilai sama di detail pinjaman | **Diperbaiki** | Duplikat dihapus (kedua field memang selalu sama) |
| 15 | Label "Total kewajiban (pokok + bunga)" untuk pinjaman bulanan | **Diperbaiki** | Label kondisional: menyebut biaya cicilan pada tenor bulanan |
| 16 | Kartu "Aliran uang satu pinjaman" (panel Ringkasan) memakai dasar 5% **dari uang yang kembali**, sedangkan ledger & panel penyedia dana masih membukukan 5% **dari Imbal Hasil** | **Diperbaiki** | Dasar potongan disamakan ke "uang yang kembali" di seluruh sistem: `lib/bagiHasil.ts` (satu pintu), `convex/loans.ts` (potongan per alokasi saat pelunasan), panel penyedia dana, Syarat & Ketentuan, dan Pengaturan Sistem. Untuk Rp1jt: potongan Rp65.000, penyedia dana menerima Rp1.235.000 — kartu, panel, dan ledger kini identik |

Verifikasi akhir setelah semua perubahan: `bunx convex dev --once` exit 0 →
`bunx tsc -b --noEmit` exit 0 → `bunx eslint .` exit 0 → `bun run test` exit 0
(seluruh rantai, termasuk `vitest`: 14 berkas / 149 tes).

Angka panel juga diperiksa lewat "jalan kaki" data — harness sementara yang
menjalankan query yang sama dengan halaman (`adminStats`, `ledgerSummary`,
`daftarInvestor`, `daftarPengajuan`) atas data uji, lalu mencetak angka yang
akan terlihat pengguna. Dengan kebijakan berjalan (potongan 5% dari uang yang
kembali), pinjaman 1jt/30% menghasilkan potongan admin Rp65.000 dan keuntungan
penyedia Rp235.000; pinjaman bulanan 2jt/3 bulan @10% menghasilkan bunga
Rp600.000 (satu tenor penuh, dulu Rp200.000), potongan admin Rp130.000 (dasar =
pokok + Imbal Hasil tenor, Rp2.600.000, biaya admin cicilan tidak ikut dipotong),
dan keuntungan penyedia Rp470.000. Harness itu sudah dihapus.

## 1. Bentuk proyek

- 249 berkas di `src/`, ~60.280 baris. Vite + React 19 + Tailwind v4 + shadcn/ui
  di depan, Convex + Convex Auth di belakang; dua runner tes (`bun` untuk
  `src/lib`, `vitest` edge-runtime untuk `src/convex`).
- Tiga lini produk: pinjaman tunai (harian 130% flat / bulanan), gadai (Skema B),
  kredit barang (Skema C).
- Logika uang terpusat di `src/lib/{money,bunga,bagiHasil,loan,bulanan,gadai,kredit}.ts`,
  hampir seluruhnya integer/BigInt. Ini bagian terkuat proyek.

## 2. Temuan utama — tiga definisi "potongan admin" (diperbaiki)

Dulu ada tiga jalur perhitungan untuk pinjaman yang sama:

| Sumber | Rumus lama | Hasil untuk pokok Rp1.000.000 @30%, admin 5% |
| --- | --- | --- |
| Ledger saat pelunasan (`convex/loans.ts:1442`, `bagiImbalHasil`) | 5% × Imbal Hasil | **Rp15.000** |
| Dashboard admin & panel penyedia (`bagiHasilPinjaman`) | 5% × total kewajiban | Rp65.000 |
| Kartu "Nilai biaya pada ledger" (`admin.ledgerSummary`) | hanya entri `jenis === "platform_fee"` | Rp20.000 (potongan Rp15.000 dijurnal sebagai `jenis: "payout"`, jadi tidak terhitung) |

Akibatnya kartu **"Keuntungan admin sudah tercatat"** menampilkan Rp65.000
sementara ledger membukukan Rp15.000 (lebih 4,3×), dan panel penyedia
menampilkan keuntungan Rp235.000 sementara ledger membayar Rp285.000. Pada
Rp10jt selisihnya Rp500.000 — bukan pembulatan.

**Perbaikan:** satu pintu uang dipilih — `bagiHasilPinjaman` menyusun angkanya
dari `percentOf` + `bagiImbalHasil`, bukan menghitung ulang, sehingga panel dan
ledger tidak bisa lagi berbeda. (Dasar potongan lalu diganti dari "Imbal Hasil"
menjadi "uang yang kembali" pada 2026-10-07 — lihat temuan #16 — dan
`convex/loans.ts` ikut memakai dasar baru itu per alokasi.)
Ekspektasi tes yang mengunci rumus lama diperbarui (22 assertion
  di `penyediaDana.convex.test.ts` dan 5 nilai di `bagiHasil.test.ts`) dan
  diganti dengan invarian lintas-modul: untuk 8 pokok × 4 bunga × 3 potongan,
  `bagiHasilPinjaman` harus sama dengan `quotePinjaman` + `bagiImbalHasil` yang
  dipakai ledger.Kartu "Nilai biaya pada ledger" juga sudah diperbaiki: penyaringnya dulu hanya
`jenis === "platform_fee"`, sehingga potongan admin atas Imbal Hasil (dijurnal
`jenis: "payout"`) tidak ikut terhitung dan angkanya selalu lebih kecil daripada
kas yang benar-benar masuk `platform:FEE`. Sekarang kedua jenis pendapatan
platform dihitung lewat satu predikat bersama (`pendapatanPlatformEntry`), yang
dipakai juga oleh grafik tren — sehingga Σ semua bulan = pendapatanPlatform
tetap benar. Denda keterlambatan sengaja tetap di luar hitungan: itu sanksi ke
Peminjam, bukan pendapatan jasa.

Kartu "Keuntungan admin sudah tercatat" memakai basis yang sama dengan ledger
(selisih maksimum satu rupiah hanya mungkin pada data warisan dengan beberapa
alokasi per pinjaman, karena ledger membulatkan per alokasi sedangkan kartu
menghitung per pinjaman).

## 3. Dua kebijakan pembulatan (diperbaiki)

`percentOf` membulatkan HALF-UP, `bagiHasilPinjaman` dulu membulatkan KE BAWAH —
padahal keduanya menghitung bunga pinjaman yang sama. Diuji pada pokok
Rp100.000–Rp400.000 @30%: **150.000 dari 300.001 pokok (≈50%) berselisih tepat
Rp1** (mis. pokok 333.333 → bunga 100.000 vs 99.999). Kini bunga dihitung dengan
`percentOf` (identik dengan yang ditagih ke Peminjam), sementara potongan admin
tetap KE BAWAH lewat `bagiImbalHasil` (sisa rupiah milik penyedia dana).

## 4. Pinjaman bulanan dihitung seolah satu bulan (diperbaiki)

`convex/penyediaDana.ts` dulu selalu memanggil `bagiHasilPinjaman(pokok, …)` dan
tidak pernah melihat `tenorBulan`. Untuk pinjaman 3/6 bulan, baris panel
menampilkan bunga satu bulan (mis. Rp200.000 dari pokok Rp2jt @10%/bulan),
sedangkan ledger saat pelunasan membukukan bunga **seluruh tenor**
(`simulasiBulananPinjaman(...).bungaTotal`). Karena panel inilah yang dipakai
admin untuk mencatat transfer keuntungan ke penyedia dana, angkanya berbeda dari
yang dibukukan.

**Perbaikan:** `bagiHasilPinjamanDari()` memilih skema menurut `tenorBulan`;
dipakai di ketiga konsumennya (`penyediaDana.ts`, `alokasiDana.ts`, `admin.ts`).
Tes Convex baru (`penyediaDana.convex.test.ts`) membandingkan baris panel dengan
`hitungSimulasiBulanan` untuk pinjaman 3 bulan, plus invarian bulanan di
`bagiHasil.test.ts`. Catatan: `totalLunas` untuk tenor 3/6 memuat biaya admin
cicilan (dibayar bersama cicilan), jadi identitas `potongan + pendanaTerima =
totalLunas` hanya berlaku untuk skema harian; yang berlaku di kedua skema adalah
`keuntunganPendana = bunga − potonganAdmin` dan `pendanaTerima = pokok +
keuntunganPendana`.

## 5. Gerbang mutu (diperbaiki)

| Perintah | Dulu | Sekarang |
| --- | --- | --- |
| `bunx tsc -b --noEmit` | hijau | hijau |
| `bunx eslint .` | merah — 64 error | hijau — 0 error, 11 warning |
| `bun run test` | merah — berhenti di langkah 17/20 | hijau — seluruh rantai, vitest ikut jalan |
| `bunx vitest run` | tidak pernah dijalankan oleh skrip proyek | 14 berkas / 148 tes |

Rantai `&&` dulu berhenti di `loadingScreen.test.ts`, sehingga `promoProfil*`
dan seluruh 14 berkas tes integrasi Convex (6.960 baris) tidak pernah ikut
berjalan dari perintah resmi. Gerbang yang selalu merah tidak lagi bisa
membedakan regresi baru dari kegagalan lama — dan itu memang terjadi pada
riwayat kerja repo ini ("gagal, tapi sama seperti sebelumnya").

Kegagalan loading screen itu sendiri ada dua sebab:
1. **Nyata:** splash statis `index.html` tidak punya grup `<g class="vault-snow">`
   yang ada di `components/LoadingScreen.tsx` — bentuk brankas pada paint
   pertama berbeda dari yang diambil alih React. Diperbaiki: grup disamakan
   lengkap dengan `.vault-snow { display: none; }` agar tudung salju tidak
   sempat muncul lalu hilang.
2. **Cacat tesnya:** irisan `lastIndexOf("@media (prefers-reduced-motion:
   reduce)")` jatuh pada blok tema karnival (`index.css:1063`), bukan aturan
   `pb__*` di baris 846 — 4 dari 5 kegagalan adalah palsu. Diperbaiki: seluruh
   blok reduced-motion dikumpulkan dengan pemasangan kurung berurutan, tanpa
   bergantung urutan. Pemeriksaan bentuk brankas juga tidak lagi memakai regex
   mentah (yang membaca `width=` di dalam `stroke-width=` dan akhiran `y=` pada
   `strokeOpacity`), tetapi nama atribut yang dinormalkan — jadi JSX dan HTML
   benar-benar dibandingkan apel ke apel.

Error ESLint dulu: 60 `no-explicit-any` di `scripts/qa-*.ts`, plus `setState`
sinkron di effect (`components/totp/TotpGate.tsx`, `components/admin/LoanReviewDialog.tsx`),
import `formatRupiah` tak terpakai, dan `adminId` tak terpakai. Semua
diselesaikan pada akarnya (anotasi `any` dihapus karena tipe Convex sudah
terinferensi; dua effect diganti pola yang benar) — tanpa mengecualikan berkas
dan tanpa directive penekan. `LoanReviewDialog` kini menyetel ulang state saat
render dengan membandingkan `_id` baris, bukan lewat effect yang mengikuti
identitas objek — sehingga ketikan admin tidak lagi hilang saat query reaktif
mengirim objek baru untuk baris yang sama.

## 6. Rute mati (diperbaiki)

`src/main.tsx` dulu mendaftarkan `/penyedia-dana` dua kali; yang kedua
mengarahkan ke dirinya sendiri sehingga tidak pernah terpakai. Sasaran aslinya
(tautan lama `/pendana`) tidak pernah ada sebagai rute, jadi bookmark lama kena
`NotFound`. Sekarang `/pendana` benar-benar dialihkan ke `/penyedia-dana`.

## 7. Kebersihan repo

- `.gitignore` kini memuat `.env.keys` (sebelumnya hanya `.env.local`, padahal
  `.env.keys` ada di akar proyek). Status lacak berkas itu tidak dapat saya
  periksa dari sandbox ini — akses berkas sensitif diblokir dan perintah git
  tidak tersedia — jadi mohon pastikan sendiri berkas itu tidak ikut ter-commit.
- Berkas terbesar: `pages/Landing.tsx` (2.075 baris), `pages/PenyediaDana.tsx`
  (2.074), `convex/penyediaDana.ts` (1.874), `convex/loans.ts` (1.734),
  `convex/admin.ts` (1.651). Layak dipecah, bukan mendesak.
- `scripts/qa-pendana.ts`, `qa-penalty.ts`, `qa-repay.ts` sempat menunjuk modul
  `api.pendana.*` yang sudah tidak ada; referensinya diperbarui ke
  `api.alokasiDana.*` (termasuk `becomePendana` → `naikPeranDana`). Skrip ini
  tidak dapat dijalankan di sandbox ini, jadi perbaikannya belum diuji runtime.

## 8. Yang sudah baik (jangan diutak-atik tanpa alasan)

- Aritmetika uang integer/BigInt dengan pembulatan eksplisit dan identitas yang
  diuji. `tsc` bersih.
- Escape HTML di dokumen kontrak: seluruh data peminjam melewati `escapeHtml`
  (`lib/contract.ts`), dan tidak ada interpolasi string mentah di template
  kontrak — penting karena dokumen itu ditulis lewat `document.write` ke window
  se-origin (`contract-views.tsx:236`, `ContractPrintButton.tsx:22`).
- Otorisasi diperiksa di server (`requireAdmin`, `requireDana`, `requirePengamat`;
  peran `pengamat` sengaja dipisah dari `dana`), ledger append-only dengan
  pengecekan keseimbangan, dan gerbang lokasi/TOTP untuk pergerakan uang.
- 148 tes integrasi Convex lulus.

## 9. Batasan verifikasi

- Tidak ada akses browser/PDF, jadi seluruh temuan berbasis pembacaan kode dan
  perhitungan langsung (skrip probe sementara, sudah dihapus), bukan pengamatan
  visual. Perubahan `index.html` dan kartu dashboard belum dilihat dengan mata.
- Skrip QA di `scripts/` tidak dapat dijalankan (butuh deployment + token admin
  + `VITE_CONVEX_URL`), jadi perbaikan referensinya hanya diverifikasi lewat
  pencocokan nama ekspor di `src/convex/_generated/api.d.ts`.
- Status lacak `.env.keys` tidak dapat diperiksa (akses berkas sensitif diblokir;
  perintah git tidak tersedia di sandbox ini).
- `bun run build` sengaja tidak dijalankan.
