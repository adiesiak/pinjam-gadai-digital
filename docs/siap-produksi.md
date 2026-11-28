# Kesiapan Produksi PINDAI

Diperiksa 28 November 2026 terhadap produksi (`pindai.biz.id`,
`academic-rooster-210`). Isinya hasil pengukuran, bukan daftar umum.

**Kesimpulan: sistem inti sudah berjalan dan aman, tetapi BELUM siap produksi
penuh karena tiga hal — dan yang paling mendesak adalah backup.**

---

## Ringkasan

| Kategori | Status |
| --- | --- |
| Autentikasi (4 kanal + TOTP) | **Siap** |
| WhatsApp (OTP + pengingat) | Berjalan, tetapi **endpoint sementara** |
| Data & migrasi | **Siap** (2058 dokumen) |
| Keamanan aplikasi | **Siap** |
| Keamanan dokumen KYC | **Siap** |
| Build & typecheck | **Siap** (0 error) |
| Penjadwal (cron) | **Siap** (semua berdenyut) |
| **Backup** | **BELUM — 48 hari tanpa backup** |
| Kredensial | **BELUM — perlu rotasi** |
| Fitur opsional | Mati sebagian (lihat bagian 4) |

---

## 1. Blocker — harus selesai sebelum produksi penuh

### ① Backup terakhir 48 hari lalu

**Temuan terukur:**

```
auditLog aksi="backup" terakhir : 1152 jam lalu (48 hari)
Batas yang kode sendiri tetapkan : 7 hari
```

**Kenapa ini blocker:** 48 hari transaksi tidak punya salinan. Kalau database
rusak atau terhapus, 40 pinjaman, 35 setoran, dan 87 entri ledger hilang
permanen. Convex Cloud **tidak** menyediakan pemulihan point-in-time sebagai
fitur bawaan.

**Kenapa tidak ada alarm sebelumnya:** peringatan backup bertingkat
`"peringatan"`, sedangkan `periksaSistem` hanya mencatat yang `"kritis"`. Sudah
diperbaiki (commit `6151119`) — sekarang alarm berbunyi dan tercatat di audit:

```
[backup] Backup data belum tercatat: Backup terakhir tercatat 48 hari lalu
(batas 7 hari). Periksa jadwal backup dan lakukan uji pemulihan berkala.
```

**Yang harus dilakukan:**

1. **Segera: buat backup pertama.**
   Panel admin → tab **Ekspor** → **Unduh snapshot JSON**.
   Simpan di luar mesin ini (Drive/disk eksternal).
2. **Pilih jadwal rutin.** Dua jalur:
   - **Manual mingguan** — paling sederhana, tanpa kredensial tambahan.
     Catat setiap kali selesai (tombol di panel sudah menulis audit).
   - **Otomatis ke Google Drive** — perlu `GOOGLE_DRIVE_CLIENT_ID`,
     `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`,
     `BACKUP_DRIVE_ENCRYPTION_KEY` (semuanya **kosong sekarang**).
     Panduan: `docs/operasional-backup.md`.
3. **Uji pemulihan sekali.** Backup yang belum pernah diuji bukan backup.
   Impor snapshot ke deployment dev, pastikan jumlah baris cocok.

> Catatan: snapshot memuat tautan dokumen **permanen**. Perlakukan berkasnya
> seperti data pribadi — jangan dibagikan.

### ② Endpoint WhatsApp masih tunnel sementara

**Kondisi:** `waSettings.apiUrl` =
`https://amsterdam-briefly-pentium-paint.trycloudflare.com/send`

Ini **quick tunnel** Cloudflare: URL berubah setiap `cloudflared` dijalankan
ulang. Bila itu terjadi, **OTP WhatsApp berhenti terkirim** dan pengguna yang
hanya memakai WhatsApp tidak bisa masuk.

Mitigasi yang sudah ada: pemantau `/health` tiap 15 menit + email alarm ke
admin setelah 2 kegagalan berturut (±30 menit).

**Yang harus dilakukan:** pindahkan ke endpoint permanen. Dua jalan, panduan
lengkap di:

- `docs/whatsapp-endpoint-permanen.md` — **Jalan A: Caddy + A record**
  (disarankan; tidak menyentuh DNS Vercel)
- `docs/jalan-b-named-tunnel.md` — Jalan B: named tunnel Cloudflare
  (butuh pindahkan nameserver domain)

### ③ Kredensial belum dirotasi

Selama pengerjaan, sejumlah kredensial terbaca oleh proses otomatis di mesin
admin, dan beberapa ditempelkan langsung di percakapan:

- Convex access token
- GitHub deploy key (kunci privatnya ada di riwayat chat)
- Resend API key
- Google client secret
- WhatsApp gateway token
- Secret TOTP admin

Kredensial yang pernah terbaca **tidak bisa dibersihkan — hanya bisa diganti**.
Runbook lengkap dengan urutan aman, cara verifikasi, dan tabel pelacakan:
`docs/rotasi-kredensial.md`.

---

## 2. Yang sudah siap (terverifikasi)

### Autentikasi

| Kanal | Status | Bukti |
| --- | --- | --- |
| Google OIDC | Aktif | Tombol membuka halaman Google dengan `client_id` dan `redirect_uri` benar, tanpa `redirect_uri_mismatch` |
| Email OTP | Aktif | Resend `delivered`; permintaan OTP mengembalikan sukses |
| Kata sandi admin | Aktif | Login berhasil, sandi salah ditolak |
| **TOTP admin** | **Aktif** | `mfaSettings.totpSecret` terisi, `mfa_aktif` tercatat di audit |
| WhatsApp OTP | Aktif | `klaimOtp` tersimpan dengan `statusPengiriman: terkirim` |

Pembatas laju auth juga sudah bekerja setelah commit `8ed63d5`:

```
3 login gagal  -> 3 baris adminLoginAttempts   (sebelumnya 0)
percobaan ke-6 -> diblokir
4 minta token  -> 3 baris, ke-4 diblokir
```

### Keamanan aplikasi

| Aspek | Hasil |
| --- | --- |
| Rahasia di bundle produksi | 0 dari 8 pola |
| Header keamanan | HSTS, CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy |
| API tanpa login | ditolak (admin, nasabah, kyc, wallet) |
| Guard fungsi admin | lengkap pada 6 fungsi paling berdampak |
| Kerentanan dependensi | 12 → 2 (sisanya tidak terjangkau) |

### Keamanan dokumen

| Aspek | Hasil |
| --- | --- |
| Tautan KTP/selfie | bertanda tangan HMAC, 10 menit, terverifikasi 403 tanpa sig |
| Bukti pembayaran | bertanda tangan (commit `75b660d`) |
| Ekspor dokumen | action ber-audit (commit `0e21310`) |
| Enkripsi at-rest | ditangani Convex; tidak dapat diverifikasi dari luar |

### Operasional

| Aspek | Hasil |
| --- | --- |
| Cron | semua berdenyut (3–10 jam lalu) |
| Pemantau gateway | tiap 15 menit, status `sehat: true` |
| Alarm peringatan sistem | tercatat di audit (commit `6151119`) |
| Pengiriman WhatsApp otomatis | `waLogs` terbaru semua `terkirim` |
| Akun uji tertinggal | tidak ada (171 pengguna, 0 bertanda uji) |
| Build | `tsc -b && vite build`, 0 error |
| Tes | 816 lulus (93 berkas) |

---

## 3. Volume data saat ini

Pantauan untuk kapasitas dan retensi:

| Tabel | Baris |
| --- | --- |
| `users` | 171 |
| `loans` | 40 |
| `deposits` | 35 |
| `ledger_entries` | 87 |
| `auditLog` | 571 |
| `waLogs` | 460 |
| `lokasiJejak` | 346 |
| `kycProfil` | 0 |

`kycProfil` kosong karena dokumen KYC pada data hasil migrasi disimpan langsung
di `loans` (`dokKtpId`, `dokSelfieKtpId`, dst), bukan di tabel KYC baru. Itu
konsekuensi migrasi, bukan kerusakan — tetapi berarti alur KYC mandiri belum
pernah dipakai pengguna nyata.

---

## 4. Fitur yang mati (perlu keputusan)

Environment variable berikut kosong, sehingga fiturnya tidak berjalan:

| Variabel | Fitur yang mati | Dampak |
| --- | --- | --- |
| `GOOGLE_DRIVE_*`, `BACKUP_DRIVE_ENCRYPTION_KEY` | Backup otomatis ke Drive | **Blocker** — lihat bagian 1 |
| `TURNSTILE_SECRET_KEY` | Captcha server-side Cloudflare | Captcha lokal (matematika) masih jalan; ini lapisan tambahan |
| `PPOB_H2H_*` | Pembelian pulsa/token via H2H | Fitur PPOB tidak bisa dipakai |
| `FONNTE_TOKEN` | Jalur Fonnte (termasuk lampiran PDF) | Tidak perlu — gateway Baileys dipakai |
| `VLY_INTEGRATION_KEY` | Integrasi VLY | Hanya bila memang dipakai |

**Keputusan yang perlu Anda ambil:** fitur mana yang memang bagian dari produk,
dan mana yang sengaja dimatikan. Fitur yang tidak dipakai sebaiknya ditutup di
UI, bukan dibiarkan terlihat tetapi gagal.

---

## 5. Urutan pengerjaan yang disarankan

| # | Tindakan | Perkiraan | Blocker? |
| --- | --- | --- | --- |
| 1 | **Buat backup pertama sekarang** (panel → Ekspor) | 10 menit | **Ya** |
| 2 | Uji pemulihan backup sekali ke deployment dev | 1 jam | **Ya** |
| 3 | Jadwalkan backup mingguan (manual atau Drive) | 30 menit | **Ya** |
| 4 | Rotasi kredensial sesuai `docs/rotasi-kredensial.md` | 2 jam | **Ya** |
| 5 | Endpoint WhatsApp permanen (Jalan A) | 30 menit | **Ya** |
| 6 | Putuskan fitur mati mana yang ditutup di UI | 1 jam | Tidak |
| 7 | Tinjau kebijakan retensi dokumen KYC | Keputusan bisnis | Tidak |
| 8 | Aktifkan Dependabot, tinjau PR pertamanya | 15 menit | Tidak |
| 9 | Uji beban / uji pengguna sungguhan | 1 hari | Tidak |
| 10 | Uji penetrasi pihak ketiga (lembaga keuangan) | Vendor | Tidak |

---

## 6. Yang tidak bisa diselesaikan dari sisi kode

| Hal | Sebab |
| --- | --- |
| Dokumen lama di deployment `neighborly-panther-850` | Deployment itu milik akun Convex lain; URL penyimpanannya masih hidup |
| Kepatuhan POJK/OJK | Butuh auditor bersertifikat |
| Ketersediaan & latensi | Ditentukan Convex Cloud dan Vercel |
| Keamanan VPS tempat gateway WhatsApp | Di luar jangkauan repo |

---

## 7. Perintah pemeriksaan cepat

Untuk memeriksa ulang keadaan kapan saja:

```bash
# status gateway WhatsApp terakhir
npx convex run --inline-query \
  'const s = await ctx.db.query("gatewayWaStatus").first(); return s' --prod

# kapan backup terakhir
npx convex run --inline-query \
  'const b = await ctx.db.query("auditLog").withIndex("by_aksi", q => q.eq("aksi","backup")).order("desc").first(); return b ? { hariLalu: Math.round((Date.now()-b.waktu)/86400000) } : null' --prod

# peringatan sistem terakhir
npx convex run --inline-query \
  'const a = await ctx.db.query("auditLog").withIndex("by_aksi", q => q.eq("aksi","peringatan_sistem")).order("desc").first(); return a ? a.detail : null' --prod

# jalankan pemeriksa sistem sekarang
npx convex run monitoring:periksaSistem --prod
```

Pemeriksaan dari luar:

```bash
curl -s -o /dev/null -w "situs %{http_code}\n" https://pindai.biz.id/
curl -s https://<domain-gateway-anda>/health
```
---

## Aturan deploy: SATU tempat saja

**Ditambahkan 28 November 2026 setelah kejadian nyata.**

`convex deploy` meng-upload SELURUH project — semua fungsi, schema, dan
`http.ts` — bukan hanya yang berubah. Karena itu **deploy terakhir menang total**
dan menghapus apa pun yang tidak ada di mesin yang men-deploy.

Kejadian yang sudah terbukti:

| Waktu | Yang men-deploy | Akibat |
| --- | --- | --- |
| Sesi ini | Admin (harness) | `integrasiBot` milik Hermes hilang |
| Sesi ini | Hermes (VPS) | `botApi` hilang, route `/bot/*` jadi 404 |

Selama beberapa jam endpoint `/bot/status` dan `/bot/daftar` mengembalikan 404
tanpa sebab yang jelas, sampai ditemukan bahwa deployment berisi modul
`integrasiBot` yang tidak ada di repo.

### Aturan

1. **Hanya satu mesin yang boleh menjalankan `convex deploy`.** Saat ini:
   mesin admin.
2. **Bot WhatsApp TIDAK boleh punya akses deploy.** Bot adalah klien HTTP,
   bukan pengelola deployment. Semua yang dibutuhkan sudah tersedia lewat
   `/bot/*`.
3. Kalau pihak lain butuh bereksperimen: buat **deployment dev** terpisah
   (`npx convex deployment create <nama> --type dev`), jangan pakai produksi.

### Kenapa ini berbahaya, bukan sekadar tidak nyaman

Bukan hanya fitur saling menimpa. Kalau dua pihak men-deploy dengan `schema.ts`
berbeda, tabel atau field yang tidak ada di versi terakhir **hilang dari
definisi schema**. Datanya masih di database, tapi aplikasi akan gagal karena
"tabel tidak dikenal". Itu kerusakan yang tidak bisa diperbaiki dengan deploy
ulang.

### Cara memeriksa apakah ada deploy asing

```bash
# daftar fungsi yang ada di deployment
npx convex run --inline-query 'return 1' --prod

# atau bandingkan: modul yang tidak ada di repo tapi ada di deployment
# berarti ada mesin lain yang men-deploy
```

Gejala khas: endpoint HTTP yang seharusnya ada tiba-tiba 404, padahal kode di
repo benar dan `git status` bersih.

### Pencabutan akses deploy dari VPS bot

```bash
# di VPS Hermes
unset CONVEX_DEPLOY_KEY
# lalu hapus dari berkas environment dan unit systemd
# cek juga: ~/.convex/config.json, .env, ecosystem.config.js
```