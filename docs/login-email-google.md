# Mengaktifkan Login Email dan Google (Gratis)

Status per 27 November 2026: **login email dan OTP belum berfungsi di produksi.**

Penyebabnya bukan bug kode, melainkan kunci layanan pihak ketiga yang belum
diisi di deployment Convex `academic-rooster-210`. Dokumen ini mencatat bukti,
lalu langkah mengaktifkannya dengan layanan yang punya kuota gratis.

## Bukti dari produksi

Log fungsi Convex (`npx convex logs --history 20`):

```
[CONVEX A(auth:signIn)] Uncaught Error: Could not send the sign-in code:
VLY_INTEGRATION_KEY is not set on this Convex deployment,
so email sign-in cannot send codes.
```

Uji per provider lewat `POST /api/action` ke `auth:signIn`:

| Metode | Hasil | Sebab |
| --- | --- | --- |
| `email-otp` | gagal | `VLY_INTEGRATION_KEY` kosong (gateway VLY berbayar) |
| `whatsapp-otp` | gagal | `WHATSAPP_API_KEY` / `FONNTE_TOKEN` kosong (Fonnte berbayar) |
| `nik-otp` | gagal | sama, jalurnya lewat WhatsApp |
| `google` | nonaktif | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` kosong |
| `password` | akun ada | akun `charelsoerya2@gmail.com` terdaftar |
| `anonymous` | **berhasil** | tidak butuh layanan luar |

Artinya infrastruktur auth sehat (JWT, JWKS, OIDC, route callback semua normal).
Yang mati hanya **pengiriman kode**.

## 1. Email OTP lewat Resend (gratis 100 email/hari)

Kode sudah mendukung Resend. Bila `RESEND_API_KEY` diisi, jalur Resend dipakai;
bila tidak, kode kembali ke gateway VLY seperti sebelumnya
(lihat `src/convex/auth/emailOtp.ts`).

Langkah:

1. Daftar di <https://resend.com> (gratis, tanpa kartu kredit).
2. **Domains** → tambahkan `pindai.biz.id`, lalu salin record DNS yang
   ditampilkan (SPF, DKIM, dan opsional DMARC) ke pengelola DNS domain.
   Tunggu status **Verified** (biasanya beberapa menit).
3. **API Keys** → buat kunci baru, izin *Sending access*. Salin nilainya.
4. Pasang di Convex:

```bash
npx convex env set RESEND_API_KEY re_xxxxxxxx
npx convex env set EMAIL_FROM "PINDAI <noreply@pindai.biz.id>"
```

5. Uji: buka <https://pindai.biz.id/auth>, masukkan email, tekan kirim kode.

### Uji cepat tanpa domain

Sebelum domain terverifikasi, isi `EMAIL_FROM` dengan `onboarding@resend.dev`.
Resend hanya mengizinkannya mengirim ke alamat pemilik akun Resend sendiri —
cukup untuk membuktikan alur berjalan.

### Kalau kuota 100/hari kurang

- **Brevo** — 300 email/hari gratis, API HTTP juga.
- **Gmail SMTP** — 500/hari, tetapi butuh `"use node"` + nodemailer dan
  sering masuk folder spam. Tidak disarankan untuk kode login.

## 2. Login Google (gratis selamanya)

Kode sudah lengkap di `src/convex/auth/google.ts`; tombolnya menyala otomatis
begitu dua variabel di bawah terisi (`api.users.googleSiap`).

Langkah:

1. Buka <https://console.cloud.google.com> → buat project (gratis).
2. **APIs & Services → OAuth consent screen** → pilih *External*, isi nama
   aplikasi, email dukungan, dan domain `pindai.biz.id`. Tambahkan scope
   `userinfo.email` dan `userinfo.profile`.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Isi **Authorized redirect URIs** dengan tepat:

```
https://academic-rooster-210.convex.site/api/auth/callback/google
```

5. Salin *Client ID* dan *Client secret*, lalu:

```bash
npx convex env set AUTH_GOOGLE_ID xxxx.apps.googleusercontent.com
npx convex env set AUTH_GOOGLE_SECRET GOCSPX-xxxx
```

6. Uji: tombol "Masuk dengan Google" di halaman masuk tidak lagi abu-abu.

Catatan penting: **akun Super Admin sengaja ditolak** lewat Google
(`jagaMasukGoogle` di `src/convex/auth/google.ts`). Admin tetap masuk dengan
kata sandi + TOTP. Google hanya untuk peminjam dan penyedia dana.

## 3. WhatsApp OTP

Tidak ada opsi yang benar-benar gratis:

- **Fonnte** — berbayar sekitar Rp 65.000/bulan per perangkat.
- **Meta WhatsApp Cloud API** — ada kuota gratis 1.000 percakapan/bulan, tetapi
  butuh verifikasi bisnis dan approval template. Cocok bila volume OTP rendah.

Selama belum diaktifkan, sembunyikan jalur WhatsApp di UI atau biarkan
menampilkan pesan bahwa kanal itu belum tersedia, supaya pengguna tidak
menunggu kode yang tidak akan datang.

## 4. Login kata sandi admin

Sudah berfungsi tanpa layanan luar. Akun kata sandi untuk
`charelsoerya2@gmail.com` ada di tabel `authAccounts`.

### Kenapa admin sempat tidak bisa masuk sama sekali

Convex Auth meminta **faktor kedua** (kode email) setiap kali masuk selama
`authAccounts.emailVerified` masih kosong:

```js
// node_modules/@convex-dev/auth/dist/providers/Password.js
if (config.verify && !account.emailVerified) {
  return await signInViaProvider(ctx, config.verify, { accountId: account._id, params });
}
return { userId: user._id };
```

`src/convex/auth.ts` memasang `verify: adminPasswordOtp`, dan
`adminPasswordOtp` mengirim kode lewat `kirimEmailVerifikasi`. Jadi alur masuk
admin adalah **kata sandi + kode email**, bukan kata sandi saja.

Akun admin hasil migrasi punya `users.emailVerificationTime` tetapi **tidak**
punya `authAccounts.emailVerified`. Akibatnya login selalu menuntut kode email —
dan karena kanal email belum dikonfigurasi, admin tidak bisa masuk sama sekali.
Pesan di UI hanya "Permintaan gagal. Periksa kembali email dan coba lagi."
(`src/lib/authAdmin.ts`), yang menyesatkan: emailnya benar, yang gagal adalah
pengiriman kode.

Perbaikannya: isi `authAccounts.emailVerified` dengan alamat admin. Alamat itu
memang sudah terverifikasi, jadi pengisian ini jujur, dan sesudahnya masuk cukup
dengan kata sandi. Faktor kedua otomatis diminta lagi bila kelak `verify`
dipakai untuk akun yang emailnya belum terverifikasi.

Saat menambah admin baru lewat panel, pastikan `authAccounts.emailVerified`
ikut terisi; kalau tidak, admin itu akan mengalami masalah yang sama begitu
kanal email dimatikan.

## Cara memeriksa kesiapan

```bash
npx convex env list
```

Yang harus terlihat setelah semuanya diisi:

```
RESEND_API_KEY=re_...
EMAIL_FROM=PINDAI <noreply@pindai.biz.id>
AUTH_GOOGLE_ID=....apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-...
```

Bila email masih gagal, pesan galat di `npx convex logs` sekarang menyebut
sebabnya secara spesifik, misalnya:

```
Could not send the sign-in code (Resend HTTP 401): API key is invalid
Could not send the sign-in code (Resend HTTP 403): Domain is not verified
```

Itu berbeda dari pesan lama yang hanya menyebut variabel VLY belum diisi.
