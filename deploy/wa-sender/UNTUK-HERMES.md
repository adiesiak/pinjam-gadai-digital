# Tugas untuk Hermes: pasang WhatsApp Sender PINDAI

Dokumen ini instruksi operasional. Jalankan di VPS tempat Hermes berada.

## Latar belakang singkat

PINDAI (aplikasi pinjaman di `pindai.biz.id`) mengirim WhatsApp lewat **gateway
generik** yang endpoint-nya diatur admin. Saat ini gateway belum diisi, sehingga
OTP WhatsApp dan pengingat tagihan tidak terkirim.

Tugas ini memasang endpoint tersebut memakai Baileys, memakai nomor WhatsApp
yang sudah ada (`6285119574032`), sebagai **perangkat tertaut kedua** di samping
Hermes. Hermes tetap berjalan normal; service ini hanya mengirim, tidak
menangani pesan masuk.

## Yang dibutuhkan

- Akses root di VPS (Debian/Ubuntu).
- Domain HTTPS yang record A-nya sudah menunjuk ke IP VPS ini.
  Contoh yang direncanakan: `wa.pindai.biz.id`.
- Port 80 dan 443 terbuka (Caddy butuh keduanya untuk menerbitkan sertifikat).

## Langkah 1: ambil kode

Repo PINDAI publik:

```bash
cd /tmp
rm -rf pindai-deploy
git clone --depth 1 https://github.com/adiesiak/pinjam-gadai-digital.git pindai-deploy
ls pindai-deploy/deploy/wa-sender/
```

Harus terlihat `install.sh`, `server.mjs`, `package.json`, `README.md`.

## Langkah 2: jalankan pemasangan

Ganti `<DOMAIN>` dengan domain HTTPS yang dipakai.

```bash
cd /tmp/pindai-deploy/deploy/wa-sender
sudo bash install.sh <DOMAIN> 6285119574032
```

Skrip ini mengerjakan semuanya: memasang Node.js 20 dan Caddy bila belum ada,
memasang dependensi, membuat token gateway, membuat layanan systemd, menyiapkan
HTTPS, lalu mencetak kode pautan.

Durasi normal 2–5 menit.

## Langkah 3: laporkan kode pautan

Skrip mencetak blok seperti ini di bagian akhir:

```
=================================================
 KODE PAUTAN WHATSAPP: ABCD-1234
=================================================
```

**Laporkan kode itu ke pengguna** — mereka memasukkannya di HP:
WhatsApp → Perangkat Tertaut → Tautkan perangkat → Tautkan dengan nomor telepon.

Kode berlaku sekitar **1 menit**. Bila kedaluwarsa:

```bash
sudo systemctl restart pindai-wa-sender && sleep 8
sudo journalctl -u pindai-wa-sender -n 80 --no-pager | grep -A6 'KODE PAUTAN'
```

## Langkah 4: laporkan token dan URL

Skrip juga mencetak:

```
================= SIMPAN INFORMASI INI =================
apiUrl (untuk waSettings) : https://<DOMAIN>/send
WHATSAPP_API_KEY          : <64 karakter hex>
========================================================
```

**Laporkan keduanya ke pengguna.** Token ini dipasang di Convex oleh pihak PINDAI
sebagai `WHATSAPP_API_KEY`; jangan di-commit, jangan dikirim ke tempat publik
lain, dan jangan ditulis di dokumen repo.

## Langkah 5: pastikan sehat

```bash
sudo systemctl status pindai-wa-sender --no-pager
curl -s https://<DOMAIN>/health
```

Yang diharapkan:

```json
{"ok":true,"siap":true,"alasan":null}
```

- `"siap":false` dengan `alasan` berisi `menunggu pautan` → WhatsApp belum
  dipindai; ulangi Langkah 3.
- `"siap":false` dengan `alasan` berisi `terputus` → cek
  `journalctl -u pindai-wa-sender -n 50 --no-pager`.

Uji kirim (setelah tertaut):

```bash
curl -s -X POST https://<DOMAIN>/send \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"target":"6285119574032","message":"Uji dari PINDAI"}'
```

Harus membalas `{"ok":true,"status":true,...}`.

## Kontrak yang dilayani service ini

PINDAI memanggilnya dengan bentuk berikut — jangan diubah tanpa memberi tahu:

```
POST /send
Authorization: Bearer <WHATSAPP_API_KEY>
Content-Type: application/json

{ "target": "6285119574032", "message": "isi pesan" }
```

Balasan 2xx JSON tanpa `status:false` / `success:false` dianggap terkirim.
`GET /health` tidak butuh auth.

## Batasan penting

1. **Nomor sama dengan Hermes.** Service ini perangkat tertaut kedua, bukan
   pengambil alih. Jangan menyalin atau berbagi folder `auth/` dengan sesi
   Hermes — dua proses yang menulis kredensial sama akan merusak keduanya.
2. **Wajib HTTPS port 443 dengan nama domain.** PINDAI menolak `http://`, alamat
   IP literal, port selain 443, dan layanan wildcard DNS seperti `nip.io`.
   Karena itu Caddy dipakai.
3. **Bukan API resmi WhatsApp.** Untuk OTP dan pengingat transaksional volume
   rendah risikonya kecil. Jangan dipakai broadcast promosi massal.
4. **PINDAI punya timeout 10 detik.** Bila VPS lambat membalas, PINDAI mencatat
   gagal walau pesan akhirnya terkirim.
5. **Hanya teks.** Lampiran PDF tidak didukung jalur ini.

## Kalau gagal, kumpulkan ini

```bash
sudo journalctl -u pindai-wa-sender -n 60 --no-pager
sudo journalctl -u caddy -n 40 --no-pager
dig +short <DOMAIN>
sudo ss -tlnp | grep 8787
```

Penyebab paling sering:

| Gejala | Sebab |
| --- | --- |
| `/health` tidak menjawab, Caddy error | record A domain belum menunjuk IP VPS, atau port 80/443 tertutup |
| `alasan: "terputus (401)"` | sesi tidak valid; hapus `/opt/pindai-wa-sender/auth` lalu pautkan ulang |
| `alasan: "terputus (440)"` | sesi digantikan perangkat lain; pautkan ulang |
| kode pautan tidak muncul | nomor pada argumen kedua salah format, atau WhatsApp sudah mencapai batas 4 perangkat tertaut |
| `curl` lokal OK tapi HTTPS gagal | Caddy belum selesai menerbitkan sertifikat; tunggu 1–2 menit |
