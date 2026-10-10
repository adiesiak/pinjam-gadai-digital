# OTP WhatsApp (Fonnte)

Kode OTP PINDAI dikirim lewat **Fonnte** dari backend. Satu mesin OTP dipakai
untuk dua keperluan:

| Tujuan (`tujuan`) | Dipakai oleh | Efek setelah kode benar |
|---|---|---|
| `verifikasi_nomor` | Tahap **Nomor WhatsApp** di modul KYC | `kycProfil.nomorWhatsAppTerverifikasi` terisi (hasil pemeriksaan KYC) |
| `transaksi` | Alokasi dana & penarikan penyedia dana (bila `waOtpWajib` menyala) | Izin sekali pakai 2 menit untuk satu transaksi |

## 1. Yang harus diisi pengelola

| Environment variable | Isi | Wajib |
|---|---|---|
| `FONNTE_TOKEN` | Token perangkat Fonnte (menu *Device* → *Token*) | Ya — tanpa ini kode tidak dikirim |

Setel pada **deployment Convex**, bukan di `.env` frontend:

```bash
bunx convex env set FONNTE_TOKEN <token-fonnte>
# lingkungan lain:
bunx convex env set --prod FONNTE_TOKEN <token-fonnte>
```

Token **hanya** dibaca di action `otpWhatsapp.mintaOtpWa`. Ia tidak pernah ditulis
ke source code, database, log (`waLogs`/`auditLog`), maupun balasan API, dan
tidak pernah sampai ke browser.

## 2. Format panggilan Fonnte (sesuai dokumentasi resmi)

- `POST https://api.fonnte.com/send`
- Header: `Authorization: <token>` — **tanpa** awalan `Bearer`
  (`Content-Type: application/x-www-form-urlencoded`)
- Body: `target=<62…>`, `message=<teks>`, `countryCode=62`
- Sukses: `{ "status": true, "detail": "success! message in queue", … }`
- Gagal: `{ "status": false, "reason": "target invalid" | "token invalid" | "insufficient quota" … }`
- Batas tunggu PINDAI: **10 detik**, tanpa mengikuti redirect; HTTP non-2xx atau
  balasan yang tidak berbentuk JSON diperlakukan sebagai gagal.
- Sumber: <https://docs.fonnte.com/api-send-message/>

## 3. Aturan kode (ditegakkan server)

| Aturan | Nilai | Di mana |
|---|---|---|
| Panjang kode | 6 digit, `crypto.getRandomValues` + rejection sampling | `lib/otpWa.ts` |
| Penyimpanan | hanya `SHA-256(salt + ":" + kode)` | tabel `waOtpChallenges` |
| Masa berlaku | 5 menit | `OTP_MASA_BERLAKU_MS` |
| Sekali pakai | `dipakaiPada` diisi saat kode benar | mutation verifikasi |
| Percobaan per kode | 5 (kode hangus setelahnya) | `percobaanGagal`/`maksPercobaan` |
| Percobaan per pengguna | 10 gagal / jam (lintas kode) | jumlah `percobaanGagal` |
| Cooldown kirim ulang | 60 detik per pengguna + tujuan | `OTP_COOLDOWN_MS` |
| Batas permintaan | 5/jam per pengguna, 5/jam per nomor, 10/jam per IP | `_simpanPermintaan` |

Ikatan: kode hanya sah untuk **pengguna** yang memintanya, **nomor** yang sama
dengan saat pengiriman, dan **tujuan** yang diminta. Mengganti nomor KYC
membatalkan bukti lama (server menghitung ulang `cocok`), dan kode untuk satu
tujuan tidak bisa dipakai di tujuan lain.

**Kirim ≠ verifikasi.** Respons sukses Fonnte hanya mengisi `statusPengiriman`.
Status "nomor terverifikasi" hanya bisa diberikan `verifikasiOtpWa` setelah hash
kode benar-benar cocok.

## 4. Di mana melihat hasilnya

- **Nasabah**: tahap *Nomor WhatsApp* di dashboard KYC — tombol "Kirim kode ke
  WhatsApp", kolom 6 digit, dan status terverifikasi.
- **Petugas**: rincian KYC di `/admin` menampilkan hasil pemeriksaan nomor
  beserta peringatan bila bukti lama tidak lagi cocok dengan nomor tersimpan.
- **Audit**: `auditLog` (`kyc_nomor_wa_terverifikasi`, nomor bertopeng),
  `loginLogs` (`metode: "wa_otp"`), dan `waLogs` (`jenis: otp_*`, isi disembunyikan).

## 5. Catatan & batasan

- Enam digit hanya punya 1.000.000 kemungkinan: hash ber-salt melindungi dari
  pembacaan kasual, **bukan** dari penyerang yang sudah memegang isi database.
  Yang melindunginya adalah masa berlaku pendek, sekali pakai, batas percobaan,
  dan pembatas laju.
- Pengiriman yang gagal/timeout **tidak** membuat kode tidak sah: kode yang
  sudah terkirim sebagian tetap bisa diverifikasi sampai kedaluwarsa. Yang tidak
  pernah terjadi adalah "kirim sukses" yang langsung menandai terverifikasi.
- IP klien dikirim klien (Convex tidak mengekspos IP), jadi pembatas per-IP
  hanya menambah lapisan — bukan pengganti batas per pengguna & per nomor.
- Kolom warisan `mfaSettings.waOtpKode`/`waOtpKedaluwarsa`/`waOtpGagal` tidak
  lagi dipakai (dulu menyimpan kode plaintext). Boleh dihapus setelah dipastikan
  tidak ada dokumen lama yang mengisinya.
- Verifikasi nomor WhatsApp tercatat sebagai **hasil pemeriksaan**, bukan syarat
  mutlak pengajuan KYC: keputusan VERIFIED tetap milik petugas.
