# Mengaktifkan Login Email dan Google (Gratis)

Status per 27 November 2026:

| Kanal | Status |
| --- | --- |
| Login email OTP | **AKTIF** (Resend, domain `pindai.biz.id` terverifikasi) |
| Lupa kata sandi admin | **AKTIF** (lewat Resend) |
| Login kata sandi admin | **AKTIF** |
| Login Google | belum — `AUTH_GOOGLE_ID` / `SECRET` kosong |
| WhatsApp OTP | belum — butuh Fonnte berbayar |

Dokumen ini mencatat bukti, keputusan, lalu langkah mengaktifkan yang tersisa.

## Riwayat: kenapa dulu gagal

Sebelum Resend dipasang, semua kanal bergantung layanan berbayar yang belum
dikonfigurasi. Log fungsi Convex waktu itu:

```
[CONVEX A(auth:signIn)] Uncaught Error: Could not send the sign-in code:
VLY_INTEGRATION_KEY is not set on this Convex deployment,
so email sign-in cannot send codes.
```

Uji per provider lewat `POST /api/action` ke `auth:signIn`:

| Metode | Dulu | Sekarang |
| --- | --- | --- |
| `email-otp` | gagal (VLY kosong) | **berhasil** |
| `whatsapp-otp` | gagal (Fonnte kosong) | gagal |
| `nik-otp` | gagal (lewat WhatsApp) | gagal |
| `google` | nonaktif | nonaktif |
| `password` | akun ada | **berhasil** |
| `anonymous` | berhasil | berhasil |

## 1. Email OTP lewat Resend (aktif)

Konfigurasi terpasang di deployment `academic-rooster-210`:

```bash
npx convex env set RESEND_API_KEY re_...
npx convex env set EMAIL_FROM "PINDAI <noreply@pindai.biz.id>"
```

Domain `pindai.biz.id` sudah berstatus **verified** di Resend (region
`ap-northeast-1`), jadi pengirim memakai domain sendiri, bukan
`onboarding@resend.dev`.

Bukti pengiriman dari API Resend:

```
to=uji.resend@pindai.biz.id  from=PINDAI <noreply@pindai.biz.id>
subject='Kode masuk PINDAI: 849470'  last_event=sent

to=charelsoerya2@gmail.com   from=PINDAI <noreply@pindai.biz.id>
subject='Kode masuk PINDAI: ohIcxSLJ5C1bXqwE1kMEQH5LAUzfV0Kp'  last_event=delivered
```

Verifikasi kode 6 digit juga sudah diuji sampai mendapat token sesi.

### Catatan penting: OTP email untuk alamat admin TIDAK dikirim

`emailOtp.sendVerificationRequest` sengaja tidak mengirim kode ke alamat Super
Admin. Tujuannya agar alamat admin tidak bisa dibedakan dari alamat biasa
(anti-enumerasi) dan kotak masuknya tidak bisa dibanjiri OTP. Permintaannya
tetap dijawab sukses.

Konsekuensinya: **admin tidak bisa masuk lewat tab "email OTP"**. Admin masuk
dengan kata sandi, dan bila lupa memakai **Lupa kata sandi** — jalur itu memakai
`adminPasswordOtp` yang mengirim kode tanpa penahan tersebut.

### Kuota

Resend gratis: 100 email/hari, 3.000/bulan. Bila kurang:

- **Brevo** — 300 email/hari gratis.
- **Gmail SMTP** — 500/hari, tetapi butuh `"use node"` + nodemailer dan sering
  masuk folder spam. Tidak disarankan untuk kode login.

## 2. Login Google (belum aktif)

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
kata sandi. Google hanya untuk peminjam dan penyedia dana.

## 3. WhatsApp OTP (belum aktif)

Tidak ada opsi yang benar-benar gratis:

- **Fonnte** — berbayar sekitar Rp 65.000/bulan per perangkat.
- **Meta WhatsApp Cloud API** — ada kuota gratis 1.000 percakapan/bulan, tetapi
  butuh verifikasi bisnis dan approval template.

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
