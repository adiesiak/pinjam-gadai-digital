# Runbook Rotasi Kredensial PINDAI

Dibuat 28 November 2026. **Jalankan setelah produksi dinyatakan live dan stabil.**

## Kenapa dokumen ini ada

Selama pengerjaan, sejumlah kredensial terbaca oleh proses otomatis di mesin
admin dan beberapa ditempelkan langsung di percakapan. Tidak ada indikasi
penyalahgunaan, tetapi kredensial yang pernah singgah di luar tempat
seharusnya harus dianggap terekspos dan **diganti**, bukan sekadar "dipantau".

Prinsipnya: **kredensial yang pernah terbaca tidak bisa "dibersihkan" — hanya
bisa diganti.**

---

## Ringkasan: apa yang harus dirotasi

| # | Kredensial | Tingkat risiko | Dampak rotasi | Downtime |
| --- | --- | --- | --- | --- |
| 1 | **Convex access token** (`~/.convex/config.json`) | **Kritis** — akses penuh DB | Sesi CLI berakhir | Tidak ada |
| 2 | **GitHub deploy key** `pindai-vps-hermes` | **Kritis** — kunci privat ada di chat | Clone VPS berhenti | Tidak ada |
| 3 | **RESEND_API_KEY** | Tinggi — kirim email atas nama domain | OTP email sesaat gagal | < 1 menit |
| 4 | **AUTH_GOOGLE_SECRET** | Tinggi — palsukan OAuth | Login Google sesaat gagal | < 1 menit |
| 5 | **WHATSAPP_API_KEY** | Tinggi — kirim WhatsApp atas nama nomor | OTP WA sesaat gagal | < 1 menit |
| 6 | **JWT_PRIVATE_KEY + JWKS** | Tinggi — bisa terbitkan token sesi | **Semua pengguna logout** | Tidak ada |
| 7 | **BERKAS_LINK_SECRET** | Sedang — tanda tangan tautan KTP | Tautan aktif (≤10 menit) mati | Tidak ada |
| 8 | **ADMIN_BOOTSTRAP_SECRET** | Rendah — jalur sudah mati | Tidak ada | Tidak ada |
| 9 | **Secret TOTP admin** | Tinggi — bisa buat kode 2FA | Perlu pindai QR ulang | Tidak ada |
| 10 | **Kata sandi admin** | Tinggi | Perlu masuk ulang | Tidak ada |

**Yang TIDAK perlu dirotasi** (belum pernah diset, jadi tidak ada nilainya):
`BACKUP_DRIVE_ENCRYPTION_KEY`, `FONNTE_TOKEN`, `GOOGLE_DRIVE_*`,
`PPOB_H2H_*`, `TURNSTILE_SECRET_KEY`, `VLY_INTEGRATION_*`.

**Yang bukan rahasia** (memang publik, ikut ke bundle browser):
`VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `SITE_URL`, `APP_ORIGIN`,
`VLY_CONVEX_AUTH_ISSUER`, `EMAIL_FROM`, `AUTH_GOOGLE_ID`.

---

## Urutan pengerjaan

Urutan ini disengaja: **semua yang butuh CLI dikerjakan lebih dulu**, karena
langkah 1 mematikan akses CLI.

```
Langkah 2–10  →  butuh CLI Convex aktif
Langkah 1     →  PALING AKHIR (mematikan CLI)
```

## Cara memasang rahasia tanpa membocorkannya ke riwayat shell

Menulis `npx convex env set KUNCI 'nilai-rahasia'` membuat nilai itu tersimpan
di riwayat shell (`.bash_history`, `ConsoleHost_history.txt`) — tempat yang
sering ikut ter-backup atau tersinkron.

Convex CLI bisa membaca nilai dari stdin. Salin rahasia ke clipboard lebih dulu:

```powershell
# Windows PowerShell
Get-Clipboard | npx convex env set RESEND_API_KEY --prod
```

```bash
# Linux / macOS
pbpaste | npx convex env set RESEND_API_KEY --prod
# atau
xclip -o | npx convex env set RESEND_API_KEY --prod
```

Dengan cara ini nilai rahasia tidak pernah muncul di layar maupun riwayat.
**Pakai pola ini untuk semua langkah di bawah.**

Alternatif: `--from-file <berkas>` lalu hapus berkasnya setelah selesai.

---

## Langkah 1 — Convex access token (paling akhir)

### Kenapa

Token ini memberi **akses penuh** ke database: baca semua tabel termasuk
`kycProfil` dan `mfaSettings.totpSecret`, tulis/hapus data apa pun, dan ubah
environment variable. Ini kredensial paling kuat yang ada di mesin.

### Di mana

```
Windows : C:\Users\<user>\.convex\config.json
Linux   : ~/.convex/config.json
```

Isinya token akses per-user, bukan per-project.

### Cara rotasi

1. Buka <https://dashboard.convex.dev> → **Settings → Access tokens**
   (atau **Profile → Access tokens**).
2. **Revoke** semua token yang ada.
3. Buat token baru bila masih perlu CLI. Kalau pekerjaan sudah selesai,
   **jangan buat baru**.
4. Di mesin admin, hapus cache lokal:

```powershell
# Windows
Remove-Item "$env:USERPROFILE\.convex\config.json" -Force
```

```bash
# Linux
rm -f ~/.convex/config.json
```

5. Login ulang hanya bila perlu: `npx convex dev` atau `npx convex login`.

### Verifikasi

```bash
npx convex env list --prod
# harus gagal / minta login
```

### Setelah ini

Akses CLI mati. Semua perubahan berikutnya lewat **Convex Dashboard** atau
panel admin PINDAI.

---

## Langkah 2 — GitHub deploy key

### Kenapa

Kunci privat `pindai-vps-hermes` **ditempelkan langsung di percakapan**. Siapa
pun yang membaca riwayat itu bisa meng-clone repo selama kunci masih aktif.

### Di mana

Repo `adiesiak/pinjam-gadai-digital` → **Settings → Deploy keys**.

Kunci yang harus dicabut:

```
id=171337431   title=pindai-vps-hermes   read_only=true
```

### Cara rotasi

**Opsi A — cabut saja** (repo sekarang publik, kunci tidak diperlukan):

1. GitHub → repo → **Settings → Deploy keys → Delete** pada `pindai-vps-hermes`.
2. Di VPS, hapus kunci privatnya:

```bash
rm -f ~/.ssh/pindai_deploy
# hapus juga blok "Host github-pindai" di ~/.ssh/config
```

**Opsi B — ganti dengan kunci baru yang lahir di VPS:**

```bash
# di VPS — kunci privat TIDAK pernah keluar dari mesin ini
ssh-keygen -t ed25519 -f ~/.ssh/pindai_deploy -N "" -C "pindai-vps-$(date +%Y%m%d)"
cat ~/.ssh/pindai_deploy.pub
```

Tempelkan **public key**-nya di GitHub → Settings → Deploy keys (read-only).
Kunci privat tetap di VPS, tidak pernah lewat chat.

### Verifikasi

```bash
ssh -T git@github-pindai
# atau, bila repo publik:
git clone --depth 1 https://github.com/adiesiak/pinjam-gadai-digital.git /tmp/uji
```

---

## Langkah 3 — RESEND_API_KEY

### Kenapa

Kunci ini terbaca penuh saat memeriksa log pengiriman email, dan juga
ditempelkan di percakapan.

### Di mana

Environment Convex `academic-rooster-210` → `RESEND_API_KEY`.

### Cara rotasi

1. Buka <https://resend.com/api-keys>.
2. **Delete** kunci lama.
3. **Create API Key** baru — permission **Sending access** saja, batasi ke
   domain `pindai.biz.id`.
4. Pasang:

```bash
npx convex env set RESEND_API_KEY <KUNCI-BARU> --prod
```

### Verifikasi

Login dengan email OTP di <https://pindai.biz.id/auth>, atau:

```bash
npx convex run auth:signIn \
  '{"provider":"email-otp","params":{"email":"uji@pindai.biz.id"}}' --prod
```

Lalu cek <https://resend.com/emails> — status harus `delivered`.

### Catatan

`EMAIL_FROM` (`PINDAI <noreply@pindai.biz.id>`) **tidak perlu** diubah; itu
alamat, bukan rahasia.

---

## Langkah 4 — AUTH_GOOGLE_SECRET

### Kenapa

Client secret ditempelkan langsung di percakapan.

### Di mana

Environment Convex → `AUTH_GOOGLE_SECRET`.

`AUTH_GOOGLE_ID` **tidak perlu** dirotasi — itu memang publik.

### Cara rotasi

1. Buka <https://console.cloud.google.com> → **APIs & Services → Credentials**.
2. Klik OAuth 2.0 Client ID milik PINDAI.
3. **Reset secret** (atau **Add secret** lalu hapus yang lama).
4. Pasang:

```bash
npx convex env set AUTH_GOOGLE_SECRET <SECRET-BARU> --prod
```

### Verifikasi

Buka <https://pindai.biz.id/auth> → klik **Masuk dengan Google** → harus sampai
halaman login Google tanpa `redirect_uri_mismatch`.

### Catatan

Authorized redirect URI **tidak berubah**:

```
https://academic-rooster-210.convex.site/api/auth/callback/google
```

---

## Langkah 5 — WHATSAPP_API_KEY

### Kenapa

Token gateway ditempelkan di percakapan.

### Di mana

- Environment Convex → `WHATSAPP_API_KEY`
- VPS → `/etc/pindai-wa-sender.env` (mode 600)

Keduanya harus **sama**.

### Cara rotasi

**Bila memakai skrip repo** (`deploy/wa-sender/install.sh`), token dibuat di
VPS. Untuk menggantinya:

```bash
# di VPS
sudo rm -f /etc/pindai-wa-sender.env
sudo bash /path/ke/deploy/wa-sender/install.sh <domain-anda> 6285119574032
# skrip mencetak token BARU di bagian ringkasan
```

**Bila memakai Hermes/Baileys manual:**

```bash
# di VPS — buat token baru
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Perbarui `WA_SENDER_TOKEN` di service/systemd Hermes, restart, lalu pasang di
Convex:

```bash
npx convex env set WHATSAPP_API_KEY <TOKEN-BARU> --prod
```

### Verifikasi

```bash
curl -s -X POST https://<domain-anda>/send \
  -H "Authorization: Bearer <TOKEN-BARU>" \
  -H "Content-Type: application/json" \
  -d '{"target":"6285119574032","message":"Uji rotasi token"}'
```

Lalu uji OTP nyata: halaman login → tab WhatsApp → minta kode.

### Catatan

`waSettings` di database **tidak perlu** diubah selama `apiUrl` tetap sama.

---

## Langkah 6 — JWT_PRIVATE_KEY + JWKS

### Kenapa

Kunci ini bisa menerbitkan token sesi yang sah. Terbaca penuh oleh proses CLI.

### Dampak

**Semua pengguna akan logout** — sesi lama tidak lagi bisa diverifikasi. Ini
normal dan sekali saja.

### Cara rotasi

Convex Auth menyediakan perintahnya (menghasilkan pasangan RS256 baru sekaligus
menulis `JWT_PRIVATE_KEY` dan `JWKS` ke deployment prod):

```bash
npx @convex-dev/auth --prod
```

**Perhatikan dua hal:**

1. Perintah ini **interaktif** — jalankan di terminal, bukan skrip otomatis.
2. Karena deployment sudah punya kunci, ia bertanya:

   ```
   The prod deployment already has JWT_PRIVATE_KEY or JWKS configured.
   Overwrite them? (y/N)
   ```

   **Default-nya "tidak".** Menekan Enter saja akan **membatalkan rotasi**
   tanpa pesan jelas. Jawab `y`.

Setelah selesai, verifikasi nilai benar-benar berubah:

```bash
npx convex env get JWT_PRIVATE_KEY --prod   # harus berbeda dari sebelumnya
npx convex env get JWKS --prod              # harus berbeda dari sebelumnya
```

### Verifikasi

1. Buka <https://pindai.biz.id> — pengguna lama diminta masuk lagi.
2. Login ulang sebagai admin.
3. Pastikan panel admin terbuka (butuh TOTP, lihat Langkah 9).

### Catatan penting

`JWT_PRIVATE_KEY` juga menjadi **cadangan** penanda tangan tautan berkas
(`src/convex/berkas.ts`), tetapi `BERKAS_LINK_SECRET` lebih diprioritaskan.
Jadi setelah rotasi ini, tautan `/berkas` yang masih beredar tetap sah selama
`BERKAS_LINK_SECRET` belum dirotasi — dan itu sebabnya Langkah 7 dikerjakan
setelahnya.

---

## Langkah 7 — BERKAS_LINK_SECRET

### Kenapa

Rahasia ini menandatangani tautan dokumen KTP/selfie. Terbaca oleh proses CLI.
Siapa pun yang memegangnya bisa membuat tautan sah ke **dokumen identitas mana
pun** yang ada di storage.

### Dampak

Tautan `/berkas` yang sedang terbuka (umur maksimal 10 menit) menjadi tidak
sah. Pengguna cukup memuat ulang halaman.

### Cara rotasi

```bash
# buat rahasia baru
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# pasang
npx convex env set BERKAS_LINK_SECRET <RAHASIA-BARU> --prod
```

### Verifikasi

1. Buka panel admin → KYC → salah satu pengajuan.
2. Gambar KTP/selfie harus tetap tampil (tautan baru dibuat otomatis).
3. Uji tautan lama sudah mati:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://academic-rooster-210.convex.site/berkas?id=<id-lama>&exp=<exp-lama>&sig=<sig-lama>"
# harus 403
```

---

## Langkah 8 — ADMIN_BOOTSTRAP_SECRET

### Kenapa

Rahasia ini terbaca oleh proses CLI. Risikonya **rendah** karena jalur
bootstrap sudah mati sejak admin pertama ada:

```ts
// src/convex/admin.ts — bootstrapFirstAdmin
// "hanya berlaku selama belum ada admin; setelah admin pertama ada,
//  jalur ini mati dan promosi berikutnya lewat admin yang ada"
```

Tetap dirotasi karena tidak ada alasan mempertahankan nilai yang sudah bocor.

### Cara rotasi

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx convex env set ADMIN_BOOTSTRAP_SECRET <RAHASIA-BARU> --prod
```

### Verifikasi

```bash
npx convex run admin:bootstrapFirstAdmin '{"secret":"<RAHASIA-BARU>"}' --prod
# harus menolak: admin sudah ada
```

---

## Langkah 9 — Secret TOTP admin

### Kenapa

`mfaSettings.totpSecret` tersimpan **plaintext** di database (normal untuk TOTP
— server harus bisa memverifikasi). Siapa pun yang bisa membaca database bisa
membuat kode 2FA yang sah kapan saja, selamanya.

TOTP melindungi **jalur web**, bukan **jalur database**. Karena akses database
pernah terbuka, secret ini harus dianggap terekspos.

### Cara rotasi

1. Masuk sebagai admin ke panel:
   `https://pindai.biz.id/7c91f4d2e6a84b23b0f9d61a3e5c7a82`
2. Buka tab **Keamanan Login** (label di panel admin; berisi riwayat sesi,
   perangkat, dan status verifikasi TOTP).
3. Klik **Nonaktifkan 2FA** — tombol ini **mewajibkan kode TOTP yang sah**,
   jadi siapkan aplikasi authenticator Anda sebelum menekannya.
4. Setelah nonaktif, klik **Siapkan autentikasi dua faktor** → QR muncul.
5. Pindai dengan aplikasi authenticator.
6. Masukkan 6 digit untuk mengaktifkan.
7. **Centang "Ingat perangkat ini"** supaya tidak mengetik kode tiap sesi.
8. **Simpan kode cadangan** yang ditampilkan.

> Menonaktifkan TOTP juga mencabut seluruh perangkat yang pernah dipercaya,
> jadi Anda akan diminta memverifikasi ulang di semua perangkat.

### Verifikasi

```bash
# ganti <email> dengan email admin
npx convex run --inline-query \
  'const m = await ctx.db.query("mfaSettings").first(); return m ? m.totpSecret.length : 0' --prod
# harus 32
```

Yang lebih penting: pastikan **secret-nya berbeda** dari sebelumnya. Kalau
panjangnya sama (32), itu tidak membuktikan apa pun — periksa lewat aplikasi
authenticator bahwa entri PINDAI yang baru menghasilkan kode yang diterima.

### Penting

Lakukan setup di **perangkat Anda sendiri**. Jangan pernah meminta agen atau
orang lain membuatkan secret-nya: siapa pun yang tahu secret bisa membuat kode
sah selamanya.

---

## Langkah 10 — Kata sandi admin

### Kenapa

Kata sandi ini sempat ditulis ke berkas teks di disk saat pemulihan akun.

### Cara rotasi

1. Masuk sebagai admin.
2. **Lupa kata sandi?** di halaman login, atau ganti dari panel.
3. Gunakan kata sandi baru yang **hanya ada di pengelola kata sandi** — tidak
   di berkas teks, tidak di chat.
4. Pastikan `authAccounts.emailVerified` tetap terisi email admin; tanpa itu
   Convex Auth akan meminta faktor kedua lewat email.

### Verifikasi

```bash
# login dengan kata sandi baru harus berhasil
npx convex run auth:signIn \
  '{"provider":"password","params":{"email":"<email>","password":"<SANDI-BARU>","flow":"signIn"}}' --prod
```

Lalu pastikan kata sandi lama **ditolak**.

---

## Setelah semua selesai — periksa jejak

### 1. Audit trail PINDAI

Panel admin → **Audit** — periksa apakah ada tindakan yang tidak Anda kenali.

```bash
npx convex run --inline-query \
  'return await ctx.db.query("auditLog").order("desc").take(50)' --prod
```

Yang wajar terlihat dari pekerjaan ini: `mfa_aktif`, `backup_dokumen`,
`admin_batas_kata_sandi_dibuka`, `backup`.

### 2. Riwayat akses Convex

<https://dashboard.convex.dev> → project → **Logs** / **Usage** — periksa
deployment `academic-rooster-210`.

### 3. Resend

<https://resend.com/emails> — pastikan tidak ada email yang tidak Anda kenali.

### 4. Google Cloud

<https://console.cloud.google.com> → **APIs & Services → Credentials** —
periksa "last used" pada OAuth client.

### 5. GitHub

Repo → **Settings → Deploy keys** dan **Settings → Security log** — pastikan
tidak ada kunci atau akses tak dikenal.

---

## Tabel pelacakan

Centang setelah tiap langkah selesai dan diverifikasi.

| # | Kredensial | Dirotasi | Diverifikasi | Tanggal | Catatan |
| --- | --- | --- | --- | --- | --- |
| 2 | GitHub deploy key | ☐ | ☐ | | |
| 3 | RESEND_API_KEY | ☐ | ☐ | | |
| 4 | AUTH_GOOGLE_SECRET | ☐ | ☐ | | |
| 5 | WHATSAPP_API_KEY | ☐ | ☐ | | |
| 6 | JWT_PRIVATE_KEY + JWKS | ☐ | ☐ | | semua pengguna logout |
| 7 | BERKAS_LINK_SECRET | ☐ | ☐ | | |
| 8 | ADMIN_BOOTSTRAP_SECRET | ☐ | ☐ | | |
| 9 | Secret TOTP admin | ☐ | ☐ | | |
| 10 | Kata sandi admin | ☐ | ☐ | | |
| 1 | Convex access token | ☐ | ☐ | | **paling akhir** |

---

## Yang berubah setelah rotasi

| Hal | Sebelum | Sesudah |
| --- | --- | --- |
| Akses CLI Convex dari mesin admin | Penuh | Dicabut |
| Akses database langsung (tanpa TOTP) | Ada | Tidak ada |
| Sesi pengguna | Aktif | Semua logout sekali (Langkah 6) |
| Tautan KTP yang beredar | Sah ≤10 menit | Mati saat rotasi |
| Kunci privat di chat | Aktif | Dicabut |

Setelah rotasi selesai, satu-satunya jalan masuk ke backend adalah:

1. **Panel admin PINDAI** — kata sandi + TOTP
2. **Convex Dashboard** — akun Convex Anda, sebaiknya dengan 2FA aktif

Pastikan **akun Convex Anda sendiri memakai 2FA**. Tanpa itu, seluruh rantai
ini kembali bergantung pada satu kata sandi.

---

## Yang tidak bisa ditutup dari sisi PINDAI

**Deployment lama `neighborly-panther-850`** masih menyimpan dokumen KYC, dan
URL penyimpanannya masih hidup. Deployment itu milik akun Convex lain sehingga
tidak dapat dihapus dari sini.

Tindakan yang bisa dilakukan:

1. Hubungi pemilik akun tersebut untuk menghapus deployment dan storage-nya.
2. Pastikan tidak ada URL dokumen lama tersimpan di dokumen, email, WhatsApp,
   atau laporan mana pun.
