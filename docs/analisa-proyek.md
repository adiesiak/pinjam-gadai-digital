# Analisa Proyek PINDAI (Pinjam & Gadai Digital)

Catatan pembaca data: setiap temuan di bawah punya bukti yang bisa dijalankan
ulang — angka dihitung dari kode, bukan dari ringkasan atau ingatan. Yang tidak
bisa saya verifikasi disebutkan eksplisit di bagian akhir.

## 1. Bentuk proyek

- 249 berkas di `src/`, ~60.280 baris. Vite + React 19 + Tailwind v4 + shadcn/ui
  di depan, Convex + Convex Auth di belakang, dua runner tes (`bun` untuk
  `src/lib`, `vitest` edge-runtime untuk `src/convex`).
- Tiga lini produk dengan skema uang yang berbeda: pinjaman tunai (harian 130%
  flat / bulanan), gadai (Skema B), kredit barang (Skema C).
- Logika uang terpusat rapi di `src/lib/{money,bunga,bagiHasil,loan,bulanan,gadai,kredit}.ts`,
  hampir seluruhnya integer/BigInt. Ini bagian terkuat proyek.

## 2. Temuan utama — tiga definisi "potongan admin", hanya satu yang benar-benar dibukukan

Ada tiga jalur perhitungan potongan/keuntungan admin, dan ketiganya tidak
sepakat untuk pinjaman yang sama.

| Sumber | Rumus | Hasil untuk pokok Rp1.000.000 @30%, admin 5% |
| --- | --- | --- |
| Ledger saat pelunasan (`convex/loans.ts:1442`, `bagiImbalHasil`) | 5% × Imbal Hasil | **Rp15.000** |
| Dashboard admin & panel penyedia (`lib/bagiHasil.ts:85`, `bagiHasilPinjaman`) | 5% × total kewajiban | Rp65.000 |
| Kartu "Nilai biaya pada ledger" (`admin.ts:1056`, `ledgerSummary`) | hanya entri `jenis === "platform_fee"` | Rp20.000 (potongan Rp15.000 tidak terhitung — dijurnal sebagai `jenis: "payout"`, `loans.ts:1445`) |

Akibatnya, pada satu pinjaman Rp1jt/30%:

- Kartu admin **"Keuntungan admin sudah tercatat"** (`pages/admin/admin-shell.tsx:219`)
  menampilkan Rp65.000, padahal ledger membukukan Rp15.000 → **lebih 4,3×**.
- Panel penyedia dana (`convex/penyediaDana.ts:448,537`; `pages/PenyediaDana.tsx:318,586`)
  menampilkan keuntungan penyedia Rp235.000, padahal ledger membayar Rp285.000.
- Skala bedanya bukan pembulatan: Rp10jt → Rp650.000 vs Rp150.000 (selisih
  Rp500.000). Rp333.333 → Rp21.666 vs Rp5.000.

Kebijakan yang **dijalankan** ledger adalah 5% dari Imbal Hasil (sesuai header
`lib/bagiHasil.ts`). Kebijakan yang **didokumentasikan dan diuji** adalah 5% dari
total kewajiban — `lib/bagiHasil.test.ts:79-82` bahkan menyebutnya eksplisit
("potongan admin = 5% dari TOTAL (bukan dari bunga)"), sehingga rangkaian tes
mengunci rumus yang tidak pernah dieksekusi. Panel pinjaman di `penyediaDana.ts`
juga tidak membaca cap audit `fundings.imbalHasilNet` / `fundings.potonganAdmin`
yang ditulis saat pelunasan, padahal cap itu justru bukti angka yang benar-benar
dibayarkan.

Tidak ada satu pun berkas tes yang memuat `bagiHasilPinjaman` **dan** `quoteLoan`
sekaligus, dan `bagiImbalHasil` hanya diuji terpisah — jadi tidak ada invarian
yang menahan ketiga angka ini agar sama.

Perlu keputusan produk sebelum diperbaiki: mana kebijakan yang benar (5% dari
bunga, atau 5% dari total kewajiban). Setelah itu, satu fungsi, satu tempat, dan
tambahkan invarian yang membandingkan angka tampilan dengan entri ledger.

## 3. Dua kebijakan pembulatan untuk angka yang sama

`percentOf` (`lib/money.ts`) membulatkan HALF-UP; `bagiHasilPinjaman`
(`lib/bagiHasil.ts`) membulatkan KE BAWAH. Keduanya menghitung bunga pinjaman
yang sama untuk pinjaman yang sama.

Diuji pada pokok Rp100.000–Rp400.000 @30%: **150.000 dari 300.001 pokok (≈50%)
berselisih tepat Rp1**. Contoh: pokok Rp333.333 → `quoteLoan` memberi bunga
Rp100.000 / total Rp433.333, `bagiHasilPinjaman` memberi Rp99.999 / Rp433.332.

Jadi selain selisih kebijakan di bagian 2, ada juga selisih pembulatan.

## 4. Tiga gerbang mutu, hanya satu yang hijau

| Perintah | Status | Bukti |
| --- | --- | --- |
| `bunx tsc -b --noEmit` | **hijau** (exit 0) | dijalankan |
| `bunx eslint .` | **merah** — 64 error, 11 warning | dijalankan |
| `bun run test` | **merah** — berhenti di langkah 17 dari 20 | dijalankan |
| `bunx vitest run` (dijalankan langsung) | **hijau** — 14 berkas, 147 tes, 8,5 detik | dijalankan |

`bun run test` memakai rantai `&&`, dan `src/lib/loadingScreen.test.ts` (langkah
17 dari 20) gagal 5 pemeriksaan. Saya jalankan rantai itu utuh: 16 langkah
pertama hijau — total 1.470 pemeriksaan lulus (financial 37, bagiHasil 214,
gadai 43, bulanan 453, kredit 129, lokasi 59, native 125, plafon 36, totp 27,
waUrl 31, rekonsiliasi 19, transferPendana 36, statusPinjaman 65, admin-queue 97,
paginasi 38, qa-meja-kerja 61) — lalu exit code 1 dan rantai berhenti di sana.

Karena itu **`promoProfil.test.ts`, `promoProfil.render.test.ts`, dan
`bunx vitest run` — seluruh 14 berkas tes integrasi Convex, 6.960 baris — tidak
pernah ikut berjalan** dari perintah resmi proyek. Ketika saya jalankan vitest
langsung, semuanya lulus. Jadi tesnya sehat; rantainya yang tidak pernah sampai
ke sana.

Efek lanjutannya: gerbang tes yang selalu merah tidak lagi bisa membedakan
regresi baru dari kegagalan lama. Riwayat kerja pada repo ini menunjukkan pola
itu ("gagal, tapi sama seperti sebelumnya").

**Rincian 5 kegagalan `loadingScreen.test.ts`** — ternyata bukan satu penyebab:

- 1 kegagalan **nyata**: splash statis di `index.html` (baris ~133) tidak punya
  grup `<g class="vault-snow">` yang ada di `components/LoadingScreen.tsx`, jadi
  bentuk brankas pada paint pertama berbeda dari yang diambil alih React —
  tepat hal yang ingin dicegah tes ini.
- 4 kegagalan **palsu, dari cacat tesnya sendiri**: tes memotong berkas dengan
  `lastIndexOf("@media (prefers-reduced-motion: reduce)")`. Aturan reduced-motion
  untuk `pb__*` ada di `src/index.css:846`, tetapi blok `@media` terakhir di
  berkas itu adalah blok tema karnival di baris 1063 — sehingga irisan tes jatuh
  di blok yang salah. CSS-nya sendiri benar dan lengkap. Artinya tes ini akan
  terus gagal setiap kali ada blok reduced-motion baru ditambahkan di bawahnya,
  dan tes ini **tidak mengukur apa yang diklaimnya ukur**.

**Error ESLint** (64): 60 di antaranya `no-explicit-any` di `scripts/qa-*.ts`
(berkas skrip QA ikut masuk cakupan `eslint .`), sisanya di `src`:
`components/totp/TotpGate.tsx:38` dan `components/admin/LoanReviewDialog.tsx:70`
(`setState` sinkron di dalam effect), `components/admin/PenyediaDanaTable.tsx:22`
(import `formatRupiah` tak terpakai), `convex/admin-authz.convex.test.ts:1107`
(`adminId` tak terpakai).

## 5. Rute mati di frontend

`src/main.tsx:263` mendaftarkan rute kedua untuk path yang sama:

```tsx
<Route path="/penyedia-dana" element={<Navigate to="/penyedia-dana" replace />} />
```

Ini tidak pernah terpakai (rute pertama dengan path sama sudah menang) dan
sasaran aslinya — tautan lama `/pendana` yang disebut komentar di baris 253 —
tidak pernah ada sebagai rute. Jadi pengguna dengan bookmark lama kena
`NotFound`, bukan dialihkan. Sisa migrasi setengah jalan.

## 6. Kebersihan repo

- `.gitignore` hanya memuat `.env.local`. Berkas `.env.keys` ada di akar proyek
  dan tidak dicakup pola mana pun. Saya tidak bisa memeriksa status lacak
  berkas itu dari dalam sandbox ini (akses berkas sensitif diblokir), jadi
  mohon pastikan sendiri berkas itu tidak ikut ter-commit.
- Berkas terbesar: `pages/Landing.tsx` (2.075 baris), `pages/PenyediaDana.tsx`
  (2.074), `convex/penyediaDana.ts` (1.874), `convex/loans.ts` (1.734),
  `convex/admin.ts` (1.651). Layak dipecah, bukan mendesak.

## 7. Yang sudah baik (jangan diutak-atik tanpa alasan)

- Aritmetika uang integer/BigInt dengan pembulatan eksplisit dan identitas yang
  diuji (`potongan + bersih = bruto`, `debit = kredit`). `tsc` bersih.
- Escape HTML di dokumen kontrak: seluruh data peminjam melewati `escapeHtml`
  (`lib/contract.ts`), dan saya tidak menemukan interpolasi string mentah di
  template kontrak — penting karena dokumen itu ditulis lewat `document.write`
  ke window se-origin (`contract-views.tsx:236`, `ContractPrintButton.tsx:22`).
- Otorisasi diperiksa di server (`requireAdmin`, `requireDana`, `requirePengamat`,
  peran `pengamat` sengaja dipisah dari `dana`), ledger append-only dengan
  pengecekan keseimbangan, dan gerbang lokasi/TOTP untuk pergerakan uang.
- 14 berkas tes integrasi Convex (147 tes) semuanya lulus.

## 8. Urutan tindakan yang saya sarankan

1. Putuskan kebijakan potongan admin (bagian 2), lalu satukan ke satu fungsi dan
   tambahkan invarian yang membandingkan tampilan dengan entri ledger.
2. Perbaiki `loadingScreen.test.ts` agar tidak bergantung urutan blok
   (`lastIndexOf`), dan samakan splash `index.html` dengan komponen (tambahkan
   grup `vault-snow`). Setelah itu `bun run test` hijau dan vitest ikut berjalan.
3. Satukan kebijakan pembulatan antara `percentOf` dan `bagiHasilPinjaman`
   (bagian 3).
4. Bereskan 64 error ESLint (kecualikan `scripts/` atau beri tipe) dan hapus
   rute mati di `main.tsx`.
5. Tambahkan `.env.keys` ke `.gitignore` bila memang belum diabaikan.

## 9. Batasan verifikasi

- Tidak ada akses browser/PDF, jadi seluruh temuan berbasis pembacaan kode dan
  perhitungan langsung (skrip probe sementara, sudah dihapus), bukan pengamatan
  visual.
- Status lacak `.env.keys` tidak dapat saya periksa (akses berkas sensitif
  diblokir dan perintah git tidak tersedia di sandbox ini).
- `bun run build` sengaja tidak dijalankan.
