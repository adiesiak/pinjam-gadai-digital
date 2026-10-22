# Domain kustom: pindai.biz.id + www

Panduan ini menyiapkan dua nama — `pindai.biz.id` (kanonik) dan
`www.pindai.biz.id` — dengan HTTPS dan pengalihan permanen www → apex.

> **Penting — di mana aplikasi ini berjalan.**
>
> Proyek ini adalah Vite + React + Convex yang dijalankan Freebuff. Pada hosting
> Freebuff, domain kustom dipasang lewat pengaturan domain di platform, dan
> Nginx/Certbot **tidak** dipakai. Bagian Nginx di bawah berlaku bila Anda
> memindahkan aplikasi ke VPS sendiri (Deno `main.ts` + `dist/`).
>
> Saya tidak bisa mengubah DNS registrar, menerbitkan sertifikat, atau
> menjalankan `sudo` di server Anda dari workspace ini. Berkas konfigurasi dan
> perintah di bawah adalah yang perlu Anda jalankan di server/registrar.

---

## 1. DNS di registrar

| Tipe | Nama | Nilai | TTL | Catatan |
| --- | --- | --- | --- | --- |
| `A` | `@` | `<IP_PUBLIK_VPS>` | 3600 | IPv4 server |
| `CNAME` | `www` | `pindai.biz.id` | 3600 | Jangan diarahkan langsung ke IP |
| `AAAA` | `@` | `<IPv6_VPS>` | 3600 | Opsional, hanya bila IPv6 aktif |

- `CNAME` **tidak boleh** dipasang di `@` (root). Bila registrar hanya
  menyediakan CNAME di root, gunakan fitur ALIAS/ANAME atau A Record.
- Hapus record lama yang menunjuk hosting sebelumnya (A/AAAA/CNAME `@` maupun
  `www`), termasuk record parkir registrar.
- Di Cloudflare: saat penerbitan sertifikat, set kedua record ke **DNS only**
  (awan abu-abu). Mode proxied (awan oranye) membuat tantangan HTTP-01
  Let's Encrypt tidak sampai ke server. Setelah sertifikat ada, proxy boleh
  dinyalakan dengan SSL mode **Full (strict)**.

Verifikasi sebelum lanjut (tunggu propagasi, biasanya < 15 menit):

```bash
dig +short A pindai.biz.id
dig +short A www.pindai.biz.id
getent hosts www.pindai.biz.id
```

`www` harus menghasilkan IP yang sama dengan apex (CNAME diikuti), bukan
`NXDOMAIN`.

---

## 2. Prasyarat server (VPS)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo ufw allow 'Nginx Full'
```

Port **80** dan **443** harus terbuka di firewall VPS/penyedia cloud. Bila ada
load balancer di depan, TLS bisa diterminasi di sana — lewati bagian Nginx ini
dan teruskan `X-Forwarded-Proto: https` ke aplikasi.

Aplikasi harus berjalan di `127.0.0.1:8000` (Deno `main.ts`). Contoh unit
systemd `/etc/systemd/system/pindai.service`:

```ini
[Unit]
Description=PINDAI (Deno static server)
After=network.target

[Service]
Type=simple
User=pindai
WorkingDirectory=/opt/pindai
EnvironmentFile=/etc/pindai.env
ExecStart=/usr/bin/deno run --allow-net --allow-read --allow-env /opt/pindai/main.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pindai
```

`EnvironmentFile` berisi `VITE_CONVEX_URL=...` (dipakai CSP `connect-src`).
Jangan menaruh rahasia Convex di berkas itu bila tidak perlu.

---

## 3. Nginx — tahap 1 (HTTP, sebelum sertifikat)

```bash
sudo mkdir -p /var/www/certbot
sudo cp deploy/nginx/pindai.biz.id.http.conf /etc/nginx/sites-available/pindai.biz.id
sudo ln -sf /etc/nginx/sites-available/pindai.biz.id /etc/nginx/sites-enabled/pindai.biz.id
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Cek cepat: `curl -I http://pindai.biz.id` harus menjawab `200` (bukan `502`).
`502` berarti aplikasi belum berjalan di port 8000.

---

## 4. Sertifikat Let's Encrypt (kedua nama sekaligus)

```bash
sudo certbot --nginx -d pindai.biz.id -d www.pindai.biz.id
```

- Pilih **Redirect** bila ditanya; konfigurasi final di bawah juga sudah
  memaksa HTTPS.
- Sertifikat disimpan di `/etc/letsencrypt/live/pindai.biz.id/`.
- Pastikan **satu** sertifikat memuat kedua nama. Certbot menambahkan nama baru
  ke sertifikat yang sudah ada, jadi jalankan perintah dengan **kedua** `-d`
  setiap kali memperbarui.

Perpanjangan otomatis (timer bawaan paket Debian/Ubuntu):

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

---

## 5. Nginx — tahap 2 (HTTPS + www → apex)

```bash
sudo cp deploy/nginx/pindai.biz.id.conf /etc/nginx/sites-available/pindai.biz.id
sudo nginx -t
sudo systemctl reload nginx
```

Hasil yang diharapkan:

| Permintaan | Jawaban |
| --- | --- |
| `http://pindai.biz.id/...` | `301` ke `https://pindai.biz.id/...` |
| `http://www.pindai.biz.id/...` | `301` ke `https://pindai.biz.id/...` |
| `https://www.pindai.biz.id/...` | `301` ke `https://pindai.biz.id/...` |
| `https://pindai.biz.id/...` | `200`, aplikasi |

Catatan konfigurasi:

- Header keamanan (HSTS, CSP, `X-Frame-Options`, `Permissions-Policy`) dipasang
  `main.ts`. **Jangan menambahkannya lagi di Nginx**; dua nilai CSP dibaca
  peramban sebagai irisan yang lebih ketat dan bisa memutus OCR/Turnstile.
- `client_max_body_size 12m` hanya pagar transport unggahan KTP/selfie.
- `/assets/` di-cache satu tahun karena nama berkasnya ber-hash.
- Blok `www` tetap memegang sertifikat agar TLS berhasil sebelum pengalihan
  dikirim.

---

## 6. Konfigurasi aplikasi (Vite + Convex)

Proyek ini memakai Vite, **bukan** Next.js, jadi tidak ada
`NEXT_PUBLIC_APP_URL`. Origin aplikasi dibaca dari environment Convex:

| Variabel | Di mana | Nilai |
| --- | --- | --- |
| `APP_ORIGIN` | Environment deployment Convex | `https://pindai.biz.id` |
| `SITE_URL` | Diisi platform (domain backend Convex) | biarkan apa adanya |
| `VITE_CONVEX_URL` | Environment build Vite | URL deployment Convex Anda |

```bash
# Dev
bunx convex env set APP_ORIGIN https://pindai.biz.id

# Produksi
bunx convex env set APP_ORIGIN https://pindai.biz.id --prod
```

Mengapa: `src/lib/akunGoogle.ts` dan callback `redirect` di
`src/convex/auth.ts` memakai `originAplikasi(SITE_URL, APP_ORIGIN)`. Pada
deployment ini `SITE_URL` berisi domain **backend** Convex, sehingga tanpa
`APP_ORIGIN` alamat kembali OAuth memakai cadangan `https://pindai.biz.id` —
kebetulan sudah benar, tetapi menyetelnya eksplisit mencegah kejutan saat
domain berpindah lagi.

**CORS.** Tidak ada allowlist origin di aplikasi:

- Klien Convex memanggil `*.convex.cloud` / `*.convex.site`; CORS ditangani
  Convex, dan sesi memakai token, bukan cookie lintas situs.
- Endpoint HTTP kustom (`src/convex/http.ts`) mengirim
  `Access-Control-Allow-Origin: *` karena diautentikasi token, bukan cookie.
- Karena `www` dialihkan 301 ke apex, semua halaman, sesi, dan redirect auth
  hanya berjalan di satu origin kanonik.

**Google OAuth.** Authorized redirect URI di Google Cloud Console tetap menunjuk
backend Convex, bukan domain aplikasi:

```
https://<deployment-anda>.convex.site/api/auth/callback/google
```

Tidak perlu menambah `https://www.pindai.biz.id` sebagai JavaScript origin
untuk alur server-side ini.

---

## 7. Verifikasi akhir

```bash
# Rantai pengalihan
curl -sSI http://pindai.biz.id | head -4
curl -sSI http://www.pindai.biz.id | head -4
curl -sSI https://www.pindai.biz.id | head -4
curl -sSI https://pindai.biz.id | head -6

# Sertifikat memuat kedua nama
openssl s_client -connect pindai.biz.id:443 -servername pindai.biz.id </dev/null \
  | openssl x509 -noout -subject -ext subjectAltName

# Aplikasi benar-benar tersaji
curl -sS https://pindai.biz.id/manifest.webmanifest | head -5
```

Lalu di peramban:

1. Buka `http://pindai.biz.id` — harus mendarat di `https://pindai.biz.id`.
2. Buka `https://www.pindai.biz.id/cek-status` — harus pindah ke apex dengan
   jalur yang sama.
3. Masuk lewat email OTP, muat ulang dashboard, lalu keluar.
4. Masuk lewat Google (bila kredensial diisi) — harus kembali ke
   `https://pindai.biz.id`, bukan halaman "No matching routes found".
5. Buka DevTools → Console: tidak boleh ada galat CORS atau mixed content.

---

## 8. Bila bermasalah

| Gejala | Periksa |
| --- | --- |
| `502 Bad Gateway` | Aplikasi tidak berjalan di `127.0.0.1:8000`; `systemctl status pindai` |
| Tantangan ACME `404` | `root /var/www/certbot` dan folder itu ada; Cloudflare masih proxied |
| Sertifikat hanya `pindai.biz.id` | Ulangi Certbot dengan **kedua** `-d` |
| `www` tidak resolve | CNAME `www` → `pindai.biz.id`, tunggu TTL |
| Halaman putih setelah pindah domain | `APP_ORIGIN` salah; cek build memakai `VITE_CONVEX_URL` yang benar |
| Login Google kembali ke backend | `APP_ORIGIN` belum disetel atau `SITE_URL` menimpa; lihat `originAplikasi` |
| Ganti domain lagi | Ubah `SITUS_RESMI` di `src/lib/tautanAplikasi.ts`, `APP_ORIGIN`, lalu DNS/SSL |

---

## Ringkasan perintah

```bash
# 1. DNS: A @ -> IP VPS, CNAME www -> pindai.biz.id
# 2. Bootstrap HTTP
sudo cp deploy/nginx/pindai.biz.id.http.conf /etc/nginx/sites-available/pindai.biz.id
sudo ln -sf /etc/nginx/sites-available/pindai.biz.id /etc/nginx/sites-enabled/pindai.biz.id
sudo nginx -t && sudo systemctl reload nginx

# 3. Sertifikat
sudo certbot --nginx -d pindai.biz.id -d www.pindai.biz.id

# 4. HTTPS + redirect www
sudo cp deploy/nginx/pindai.biz.id.conf /etc/nginx/sites-available/pindai.biz.id
sudo nginx -t && sudo systemctl reload nginx

# 5. Origin aplikasi
bunx convex env set APP_ORIGIN https://pindai.biz.id --prod
```
