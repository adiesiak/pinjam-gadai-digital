# Audit & Rencana Keamanan PINDAI

> Status: **audit teknis internal**, bukan penilaian kepatuhan.
> Dokumen ini mencatat apa yang benar-benar ada di kode, apa yang belum, dan apa
> yang harus diputuskan di lapisan lain (hosting, hukum, operasi). Jangan dipakai
> sebagai bukti atau pernyataan bahwa PINDAI sudah "aman", "terenkripsi", atau
> patuh aturan apa pun.

- Tanggal: 14 Oktober 2026.
- Metode: pembacaan kode statis (`src/convex`, `src/lib`, `src/pages`,
  `src/components`, `index.html`, `public/`), ditambah uji otomatis yang
  dijalankan pada berkas yang diubah. Tidak ada uji penetrasi, tidak ada
  pemeriksaan konfigurasi deployment, tidak ada pengujian terhadap data produksi.
- Rujukan terkait: `docs/audit-privasi.md` (perlindungan data pribadi, UU PDP),
  `docs/otp-whatsapp.md` (mesin OTP), `docs/aplikasi-native.md`.
- Legenda status: **ADA** (sudah ada dan terverifikasi di kode), **BARU** (baru
  ditambahkan pada putaran ini), **SEBAGIAN**, **BELUM**.

---

## 0. Ringkasan putaran ini

Yang ditambahkan: **gerbang anti-pengiriman-palsu** untuk formulir pengajuan
(pinjaman dan gadai), terdiri dari pustaka murni, penegakan server, jejak audit,
kunci sementara, dan pengujian end-to-end.

| Berkas | Isi |
|---|---|
| `src/lib/gerbangKirim.ts` | Aturan murni: jebakan (honeypot), jeda waktu minimum, sidik permintaan, kunci idempotensi, skema jejak kirim yang ketat (zod `.strict()`) |
| `src/lib/gerbangKirim.test.ts` | 48 uji murni (`bun src/lib/gerbangKirim.test.ts`) |
| `src/convex/gerbangKirim.ts` | Penegakan: `mintaIzinKirim` (gerbang izin), `gerbangPengajuan` (penjaga di mutasi), pembatas laju, pencatatan pelanggaran, retensi |
| `src/convex/gerbangKirim.convex.test.ts` | 12 uji end-to-end lewat mutasi pengajuan sungguhan |
| `src/components/JebakanFormulir.tsx` | Kolom jebakan yang dipakai bersama semua formulir |
| `src/convex/schema.ts` | Tabel `gerbangKirim` (jejak kirim + pelanggaran) |
| `src/convex/crons.ts` | Retensi harian jejak gerbang (7 hari) |
| `src/convex/loans.ts` | `createLoanApplication` & `createPawnApplication` memanggil penjaga, menerima `jebakan`, `formDibukaPada` |
| `src/pages/dashboard/pengajuan-cepat-views.tsx`, `src/pages/dashboard/forms-views.tsx` | Formulir mengirim jejak gerbang + kunci idempotensi, dan meminta izin ke server sebelum mengirim |

Batas yang perlu dibaca sebelum menilai putaran ini: gerbang ini menaikkan biaya
pengiriman otomatis, **tidak** membuktikan pengirimnya manusia, dan **tidak**
menggantikan verifikasi KYC, pembatas laju per IP, maupun CAPTCHA pihak ketiga.

---

## 1. Keamanan web & mitigasi ancaman (OWASP)

### 1.1 HTTPS dan header keamanan

- **HTTPS: SEBAGIAN (di luar kendali kode).** Aplikasi tidak pernah menyusun URL
  `http://` sendiri, dan permintaan data berjalan ke deployment Convex
  (`*.convex.cloud`) serta host aplikasi. Penegakan HTTPS berada di lapisan
  hosting yang dikelola platform, jadi **tidak dapat diverifikasi dari repositori**
  dan tidak diklaim di sini.
- **Header keamanan: TERPASANG di server statis repositori (`main.ts`).**
  Server Deno + Hono itu menyajikan `dist/`, dan middleware-nya mengirim:
  `Content-Security-Policy` (lengkap, bukan bertahap), `Strict-Transport-Security`
  (`max-age=31536000; includeSubDomains`, tanpa `preload`), `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY` beserta `frame-ancestors 'none'`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy:
  same-origin-allow-popups` (popup masuk Google tetap bisa berkomunikasi dengan
  halaman pembuka), dan `Permissions-Policy` yang hanya membuka kamera, mikrofon,
  serta lokasi untuk origin sendiri.
  - Isi CSP ditulis satu kali di `main.ts` dengan alasan tiap izin: `script-src
    'self'` (tanpa skrip sebaris), `wasm-unsafe-eval` + `cdn.jsdelivr.net` untuk
    mesin OCR Tesseract, `challenges.cloudflare.com` untuk Turnstile,
    `connect-src` ke domain Convex (`.convex.cloud` dan pasangan `.convex.site`
    untuk Convex Auth), `frame-src` ke OpenStreetMap, serta `img-src` yang
    mengizinkan HTTPS karena avatar Google, gambar QRIS, dan berkas storage
    Convex berasal dari host berbeda per deployment.
  - Skrip tema sebelum paint dipindah dari blok sebaris di `index.html` ke
    `public/tema-awal.js`; tanpa pemindahan itu CSP harus memakai
    `'unsafe-inline'` untuk skrip, dan pengecualian itu juga berlaku bagi skrip
    yang disuntikkan penyerang.
  - **`public/_headers`** memuat nilai header yang sama untuk hosting statis
    yang membaca berkas itu (Cloudflare Pages, Netlify). Vite menyalinnya ke
    `dist/`, jadi host yang tidak menjalankan `main.ts` tetap mendapat HSTS,
    `nosniff`, dan CSP yang sama. Dua tempat itu harus diubah bersama —
    tidak ada mekanisme yang menyamakannya otomatis.
  - **Belum diverifikasi:** apakah platform produksi benar-benar menjalankan
    `main.ts` sebagai server, dan apakah respons produksi memuat header di atas.
    Pembuktiannya hanya lewat permintaan ke URL produksi (`curl -I`), bukan dari
    repositori. Bila host memakai server lain, nilai header yang sama harus
    dipasang di sana.
  - Catatan: header pada endpoint JSON Convex (`src/convex/http.ts`) **tidak**
    melindungi halaman aplikasi, karena endpoint itu tidak pernah menyajikan HTML.

### 1.2 CORS dan pembatas laju

- **CORS: SEBAGIAN.** `src/convex/http.ts` memakai
  `Access-Control-Allow-Origin: *` pada endpoint yang diautentikasi token
  (`/lokasi/heartbeat`, `/api/cek-status/*`, `/api/aplikasi-android`). Alasannya
  tercatat di berkas itu: tidak ada kredensial cookie yang ikut terkirim
  otomatis, dan klien native tidak mengirim `Origin`. Risikonya bukan
  kebocoran cookie, melainkan **halaman web mana pun bisa memanggil endpoint itu
  dengan token yang sudah dicuri**. Bila daftar origin pemakai sudah diketahui,
  ganti `*` dengan daftar putih.
- **Pembatas laju: ADA, dan kini bertambah.** Yang sudah ada sebelum putaran ini:
  - login peminjam: 5 gagal / 15 menit per IP dan per identifier (`security.ts`);
  - kata sandi Super Admin: 5 percobaan / 15 menit per email, berlaku untuk semua
    alamat agar tidak membocorkan alamat admin;
  - permintaan token aktivasi/reset admin: 3 / 15 menit per email;
  - OTP WhatsApp: 5/jam per pengguna, 5/jam per nomor, 10/jam per IP, plus cooldown
    60 detik (`otpWhatsapp.ts`, ringkasannya di `docs/otp-whatsapp.md`);
  - ping tautan cek-status: dibatasi di mutasi internal.
  - **BARU:** gerbang pengajuan: **5 kiriman per menit per akun**, dihitung dari
    pengajuan yang benar-benar diterima (`periksaBatasGerbang`).
  - Batasan yang jujur: Convex tidak mengekspos IP klien, jadi batas per IP hanya
    bisa memakai IP yang dikirim klien (dipakai di endpoint HTTP yang memegang
    header, bukan di mutasi). Karena itu pembatas utama di sini adalah per akun.

### 1.3 Mitigasi bot (Cloudflare Turnstile)

- **TERPASANG pada gerbang pengiriman pengajuan, nonaktif sampai kuncinya diisi.**
  Alurnya: widget `components/GerbangTurnstile.tsx` menampilkan tantangan bila
  `VITE_TURNSTILE_SITE_KEY` ada saat build, lalu menukar tokennya lewat action
  `turnstile.verifikasiTurnstile`. Action itu memanggil `siteverify` Cloudflare
  dan mencatat PAS berumur lima menit di `turnstilePasses`. `gerbangKirim.mintaIzinKirim`
  menolak kiriman tanpa pas selama `TURNSTILE_SECRET_KEY` terpasang, dan pas itu
  dihabiskan hanya setelah jebakan serta jeda waktu juga lolos. Widget saja tidak
  cukup: pemanggil yang melewati UI tetap ditolak server.
- Kenapa tidak di login/OTP: alur masuk Convex Auth ditangani provider dan tidak
  bisa disisipi pemeriksaan tanpa menyentuh berkas auth yang dibekukan proyek ini.
  Titik yang dijaga sekarang adalah tempat bot menghasilkan data: pengajuan
  pinjaman (jalur cepat dan jalur klasik) dan pengajuan gadai.
- Status verifikasi: kunci belum diisi di lingkungan ini, jadi perilakunya masih
  seperti sebelum integrasi (semua kiriman lolos tanpa tantangan). Bukti yang ada
  adalah tes `gerbangKirim.convex.test.ts`: tanpa kunci gerbang tetap lolos;
  dengan kunci, kiriman tanpa pas ditolak dan TIDAK dihitung sebagai pelanggaran;
  pas hanya berlaku sekali; pas kedaluwarsa tidak membuka gerbang. Verifikasi
  token sungguhan ke Cloudflare belum dijalankan karena kredensialnya tidak ada.
- Untuk mengaktifkan: isi `VITE_TURNSTILE_SITE_KEY` (kunci situs) dan
  `TURNSTILE_SECRET_KEY` (kunci rahasia) lewat panel Keys/API keys, lalu build
  ulang klien agar kunci situs ikut tertanam.

---

## 2. Guardrail pengiriman (anti pengajuan palsu)

### 2.1 Perlindungan status UI

- **ADA.** `useKirimSekali` (`src/hooks/use-cegah-tinggalkan.ts`) mengunci handler
  sebelum React sempat merender ulang tombol, sehingga klik ganda dan Enter
  berulang tidak menjalankan pengiriman dua kali. Tahap pekerjaan dan labelnya
  (`diam`, `memvalidasi`, `mengunggah`, `mengirim`, `sukses`, `galat`) beserta
  `sibuk()` dan `LABEL_TAHAP` ada di `src/lib/formInteraksi.ts`, dipakai untuk
  `disabled`/`aria-busy` dan status unggahan bermakna.
- Yang **BARU**: gerbang izin dijalankan sebagai langkah pertama di dalam blok
  `try`, dan bila ditolak, kunci kirim dibuka kembali (`kirimSekali.buka()`) supaya
  pengguna dapat memperbaiki isian dan mencoba lagi.

### 2.2 Jebakan (honeypot) dan cek jeda waktu

- **BARU.**
  - Kolom jebakan: `KOLOM_JEBAKAN` = `surelCadangan`, dirender oleh
    `JebakanFormulir` dengan posisi di luar layar, `tabIndex={-1}`,
    `aria-hidden`, dan `pointer-events-none`. Pengguna sungguhan tidak pernah
    melihat, menjangkau, atau mengisinya. Server menolak kiriman yang mengisinya
    (`periksaJebakan`).
  - Jeda waktu: `JEDA_MINIMAL_KIRIM_MS` = 2.000 ms. Cap waktu dibuat sekali saat
    formulir dipasang dan dikirim sebagai `formDibukaPada`. Kiriman yang lebih
    cepat dari itu ditolak, dan cap waktu di masa depan atau bukan angka positif
    juga ditolak (`periksaJedaKirim`).
  - Ketiadaan sinyal tidak menuduh apa pun (`undefined` bukan bukti robot).
    Sinyal ini juga **bukan** satu-satunya penahan: pembatas laju per akun bekerja
    walau klien tidak mengirim jejak gerbang sama sekali. Ini disengaja, bukan
    kelalaian; lihat 2.5.

### 2.3 Validasi muatan yang ketat

- **SEBAGIAN, dan disengaja.**
  - Jejak gerbang divalidasi dengan skema zod **ketat** (`skemaJejakKirim`,
    `.strict()` di `src/lib/gerbangKirim.ts`): tipe salah, nilai di luar rentang,
    dan **kolom tak dikenal** ditolak. Pesannya sengaja umum agar robot tidak bisa
    menyetel ulang payload sampai lolos.
  - Muatan bisnis (NIK 16 digit, batas plafon, tenor sah, format rekening,
    nominal) **tidak** divalidasi ulang dengan zod, melainkan oleh argumen Convex
    dan modul domain yang sudah menjadi satu-satunya sumber aturan
    (`lib/dataDiri.ts`, `lib/plafon.ts`, `lib/loan.ts`, `lib/bulanan.ts`).
    Alasannya tertulis di kepala `lib/formInteraksi.ts`: dua salinan aturan yang
    sama cepat atau lambat akan berbeda diam-diam, dan versi yang salah itulah yang
    akan dipakai salah satu sisi.
  - `zod` sebelumnya sudah tercantum di `package.json` tetapi belum dipakai di
    mana pun. Putaran ini memakainya hanya untuk amplop jejak kirim.

### 2.4 Idempotensi

- **ADA, dan kini benar-benar dipakai.** `src/convex/idempotensi.ts` menyimpan
  hasil operasi per (pengguna, kunci) di tabel `idempotencyKeys`, menolak kunci
  yang sama untuk operasi berbeda, dan membersihkan baris lebih tua dari 7 hari
  lewat cron harian.
- Yang **BARU**: formulir pengajuan kini mengirim `kunciIdempotensi` yang dibuat
  sekali per formulir (`kunciIdempotensiBaru()`), sehingga pengiriman ulang karena
  jaringan mengembalikan pengajuan yang **sama**, bukan membuat yang kedua.
  Sebelumnya argumen ini ada di server tetapi tidak pernah dikirim klien, jadi
  perlindungannya tidak pernah aktif untuk pengguna nyata.
- Terverifikasi: uji `idempotensi.convex.test.ts` dan uji gerbang memastikan
  pengiriman ulang dengan kunci sama hanya menghasilkan satu baris, dan (penting)
  pengiriman ulang itu **tidak** memakan jatah pembatas laju.

### 2.5 Catatan penting: penolakan di dalam mutasi Convex tidak menyimpan jejak

Ini temuan teknis yang membentuk rancangan di atas, dan perlu diketahui siapa pun
yang menambah penjaga baru.

Mutasi Convex bersifat transaksional: bila mutasi melempar galat, **seluruh**
tulisannya dibatalkan. Jadi penjaga yang menolak dengan `throw` tidak dapat
meninggalkan baris apa pun, termasuk baris "percobaan gagal" dan entri
`auditLog` yang ditulis tepat sebelumnya. Diuji langsung: pada rancangan pertama,
jejak audit untuk kiriman yang ditolak selalu kosong.

Karena itu penolakan dibagi dua lapis:

1. **Gerbang izin** (`gerbangKirim.mintaIzinKirim`), dipanggil formulir sebelum
   mengirim. Penolakannya dijawab sebagai nilai (`{ ok: false, alasan }`), jadi
   mutasinya sukses dan baris pelanggaran + jejak `auditLog` benar-benar
   tersimpan. Di sinilah kunci sementara bisa aktif.
2. **Penjaga di mutasi pengajuan** (`gerbangPengajuan` di
   `createLoanApplication`/`createPawnApplication`), untuk pemanggil yang melewati
   gerbang. Ia menolak dengan galat (jejaknya memang ikut terbatalkan) dan tetap
   membaca kunci sementara yang sudah dicatat lapis 1.

Konsekuensi yang harus diketahui: robot yang memanggil mutasi pengajuan langsung
tetap ditahan pembatas laju dan ditolak oleh cek jebakan/jeda, tetapi
**percobaan yang ditolaknya tidak menambah hitungan kunci sementara**, karena
tidak ada transaksi yang berhasil untuk menulisnya. Bila akuntabilitas tingkat
percobaan untuk jalur itu diperlukan, bentuknya harus action yang memanggil
mutasi pencatat terpisah, bukan mutasi tunggal.

Pengujian yang membuktikan kedua lapis ini: `src/convex/gerbangKirim.convex.test.ts`
(12 uji, termasuk "jebakan ditolak dan jejaknya tersimpan" dan "kunci sementara
dari gerbang juga menahan mutasi pengajuan").

---

## 3. Pemeriksaan awal KYC otomatis

- **Penolakan berkas palsu: ADA.** `src/convex/berkasIdentitas.ts` memeriksa
  metadata dan ukuran berkas di server, dan lewat action `periksaIsiBerkasKyc`
  memeriksa **isi** berkas (magic bytes) serta dimensi gambar. Berkas yang lolos
  ditandai di tabel `berkasTerverifikasi`, dan mutasi yang menautkan dokumen KYC
  menolak storage id tanpa penanda itu. Ini berarti pemeriksaan tidak dapat
  dilewati dengan mengunggah langsung ke URL unggah bertanda tangan.
- **OCR dan pencocokan NIK: ADA, dengan batas jujur.** `src/lib/kycOcr.ts` dan
  `kycOcrMesin.ts` (Tesseract) mengekstrak teks KTP di peramban untuk membantu
  pengisian, dan aturan format ada di `lib/kycAturan.ts`. Batasnya: OCR berjalan di
  klien, jadi hasilnya membantu pengguna dan petugas, bukan bukti keaslian.
  Pencocokan angka identitas dengan isian tetap diperiksa di jalur KYC.
- **Liveness / deteksi wajah: SEBAGIAN.** Ada perekaman wajah dan lingkungan
  (`KameraLive.tsx`, `lib/verifikasiPembayaran.ts`), penyimpanan snapshot + video,
  dan gerbang lokasi/titik wajib. **Tidak ada** pemeriksaan keberadaan wajah
  (face detection) yang menolak gambar pemandangan, gambar kosong, atau meme.
  Pemeriksaan yang ada membuktikan berkasnya gambar yang terbaca, bukan bahwa di
  dalamnya ada wajah manusia.
- **Pencatatan kegagalan KYC & kunci sementara: SEBAGIAN.** Jejak percobaan KYC
  dan OTP tercatat (`auditLog`, `loginLogs`, `waOtpChallenges`), dan batas
  percobaan OTP sudah mengunci kode setelah 5 gagal serta membatasi 10 gagal/jam
  per pengguna. **BARU:** percobaan pengiriman pengajuan yang mencurigakan kini
  juga tercatat dan mengunci sementara (3 pelanggaran dalam 15 menit, lihat
  bagian 2.5). Belum ada: kunci sementara untuk kegagalan verifikasi dokumen KYC
  itu sendiri.

---

## 4. Privasi & penyimpanan aman

Rincian lengkap ada di `docs/audit-privasi.md` (inventaris data, 14 risiko,
12 perbaikan yang diusulkan). Ringkas terhadap daftar di permintaan ini:

- **Enkripsi at-rest (field-level): BELUM.** NIK, nomor rekening, dan koordinat
  disimpan sebagai kolom biasa. Yang berlaku sekarang hanya enkripsi bawaan
  platform saat transit (TLS) dan at-rest penyimpanan Convex. Tidak ada AES-256
  tingkat kolom maupun tokenisasi NIK di kode. Untuk mengubahnya perlu keputusan
  produk (contoh di `docs/audit-privasi.md` T-12) dan jalur migrasi data yang ada,
  bukan sekadar menambal skema.
- **Enkripsi saat transit: SEBAGIAN (tidak dapat diverifikasi dari kode).**
  Semua panggilan keluar memakai HTTPS (gateway WhatsApp memeriksa endpoint wajib
  HTTPS dan hostname publik, anti-SSRF). Versi TLS (1.2 vs 1.3) ditentukan
  penyedia, bukan kode, jadi tidak diklaim di sini.
- **Penyimpanan berkas & kontrol akses: SEBAGIAN, dan ada dua lubang yang
  diketahui.** Dokumen identitas hanya dibuka admin lewat `admin.dokumenKycUrls`
  dan ditampilkan dengan `WatermarkedDoc`; ruang penyedia dana tidak menerima
  dokumen identitas. Dua lubang yang dicatat di `docs/audit-privasi.md`:
  (a) pembukaan dokumen identitas belum menulis entri audit (R-03) dan
  (b) tanda air hanya lapisan CSS, sehingga berkas asli tetap utuh bila URL
  bertanda tangan bocor. URL bertanda tangan Convex juga tidak punya masa berlaku
  jangka pendek yang bisa diatur dari sini.
- **RBAC: ADA.** `src/convex/adminAuthz.ts` menegakkan peran di server (gerbang
  MFA/TOTP Super Admin, sesi admin, perangkat dipercaya), dan modul ruang penyedia
  dana membentuk barisnya lewat daftar putih sehingga data identitas tidak pernah
  ikut terserialkan. Batasnya juga tercatat: sesi kode akses bersama tidak dapat
  ditelusuri ke orang tertentu (R-14).
- **Jejak audit: ADA untuk tindakan tulis dan admin**, termasuk rincian baris
  turunan yang dihapus (`auditLog.rincianHapus`) dan kini pelanggaran gerbang
  pengajuan. **BELUM:** pencatatan akses **baca** atas data sensitif (pembukaan
  KTP dan query ruang penyedia dana), yang membuat penelusuran insiden belum
  lengkap (`docs/audit-privasi.md` R-03, R-08, T-11).

---

## 5. Verifikasi yang dijalankan

| Perintah | Hasil |
|---|---|
| `bunx convex dev --once` | Sukses; tabel & indeks `gerbangKirim` ditambahkan |
| `bunx tsc -b --noEmit` | Sukses (0 galat) |
| `bun src/lib/gerbangKirim.test.ts` | 48 lulus, 0 gagal |
| `bunx vitest run src/convex/gerbangKirim.convex.test.ts` | 12 lulus, 0 gagal |
| `bunx vitest run` (seluruh uji Convex) | 38 berkas lulus, 0 gagal |
| `bun src/pages/dashboard/pengajuan-cepat.render.test.tsx` | 31 lulus |
| `bun src/pages/dashboard/form-pengajuan.render.test.tsx` | 40 lulus |
| `bun src/pages/dashboard/summary-cards.render.test.tsx` | 21 lulus |

Belum dijalankan atau tidak dapat dijalankan di lingkungan ini: pemeriksaan
header pada respons HTTP produksi, pengujian Turnstile (belum ada), pengujian
runtime terhadap data nyata, uji penetrasi, dan verifikasi versi TLS.

## 6. Batasan dokumen ini

- Tidak ada penilaian kepatuhan (UU PDP, POJK, atau aturan lain).
- Tidak ada pemeriksaan konfigurasi deployment, kunci API, atau akses operator ke
  konsol produksi.
- Klaim "ada" di dokumen ini berarti "ada di kode dan teruji", bukan "sudah
  cukup"; dua tempat yang eksplisit belum cukup dicatat di bagian 2.5 dan 4.
