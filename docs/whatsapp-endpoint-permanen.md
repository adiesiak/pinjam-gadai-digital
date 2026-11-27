# Membuat endpoint WhatsApp permanen

Dokumen ini menggantikan bagian "Cara menutup risiko ini" di
[whatsapp-gateway.md](whatsapp-gateway.md) dengan langkah yang bisa dijalankan.

## Kenapa ini perlu

Endpoint WhatsApp PINDAI sekarang memakai tunnel **quick** Cloudflare:

```
https://amsterdam-briefly-pentium-paint.trycloudflare.com/send
```

URL itu **berubah setiap `cloudflared` dijalankan ulang** dan mati bila
prosesnya berhenti. Kalau itu terjadi:

- `waSettings.apiUrl` menunjuk alamat mati
- **OTP WhatsApp berhenti terkirim tanpa peringatan**
- Pengguna tidak bisa masuk lewat WhatsApp

## Kendala yang harus diketahui lebih dulu

**DNS `pindai.biz.id` tidak dikelola Cloudflare.**

```
nameserver sekarang : ns1.idwebhost.id, ns2.idwebhost.id
A record            : 216.198.79.1 (Vercel)
```

Cloudflare Tunnel dengan nama tetap (`cloudflared tunnel route dns`) mensyaratkan
zone domain berada di Cloudflare. Dengan DNS di idwebhost, perintah itu gagal
dan CNAME ke `cfargotunnel.com` tidak akan diresolusi Cloudflare.

Jadi ada dua jalan, dan keduanya berbeda risiko.

---

## Jalan A — Caddy + A record (cocok dengan DNS sekarang)

**Tidak menyentuh DNS yang ada.** Hanya menambah satu record baru.

### Yang dibutuhkan

1. **IP publik VPS.** Cari dengan `curl -4 ifconfig.me` di VPS.
2. Akses ke panel DNS idwebhost untuk `pindai.biz.id`.
3. Port **80** dan **443** terbuka di firewall VPS (Caddy butuh keduanya untuk
   menerbitkan sertifikat Let's Encrypt).

### Langkah 1 — tambah record DNS

Di panel idwebhost, tambahkan:

| Tipe | Nama | Nilai | TTL |
| --- | --- | --- | --- |
| `A` | `wa` | `<IP publik VPS>` | 300 |

Hasilnya `wa.pindai.biz.id` menunjuk ke VPS. Record `@` dan `www` yang menunjuk
Vercel **tidak diubah**.

Tunggu 1–5 menit, lalu pastikan dari mesin mana pun:

```bash
dig +short wa.pindai.biz.id
# harus keluar IP VPS
```

### Langkah 2 — jalankan pemasangan

Repo PINDAI sudah menyediakan skripnya:

```bash
cd /tmp
rm -rf pindai-deploy
git clone --depth 1 https://github.com/adiesiak/pinjam-gadai-digital.git pindai-deploy
cd pindai-deploy/deploy/wa-sender
sudo bash install.sh wa.pindai.biz.id 6285119574032
```

Skrip memasang Node.js 20, dependensi Baileys, layanan systemd, dan Caddy dengan
sertifikat otomatis. Di akhir ia mencetak **kode pautan WhatsApp** dan **token
gateway**.

### Langkah 3 — pautkan WhatsApp

Kode pautan berlaku ±1 menit. Masukkan di HP:
**WhatsApp → Perangkat Tertaut → Tautkan perangkat → Tautkan dengan nomor telepon.**

Kalau kedaluwarsa:

```bash
sudo systemctl restart pindai-wa-sender && sleep 8
sudo journalctl -u pindai-wa-sender -n 80 --no-pager | grep -A6 'KODE PAUTAN'
```

### Langkah 4 — verifikasi

```bash
curl -s https://wa.pindai.biz.id/health
# {"ok":true,"siap":true,"alasan":null}

curl -s -X POST https://wa.pindai.biz.id/send \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"target":"6285119574032","message":"Uji endpoint permanen"}'
```

### Langkah 5 — perbarui PINDAI

Dua nilai berubah: `apiUrl` dan token.

**Token** (lewat CLI, karena panel admin butuh TOTP di sesi browser):

```bash
cd /path/ke/pinjam-gadai-digital
npx convex env set WHATSAPP_API_KEY <TOKEN-BARU> --prod
```

**`apiUrl`** — panel admin tab **WhatsApp**, atau langsung:

```js
{ apiUrl: "https://wa.pindai.biz.id/send", aktif: true }
```

Sisa setelan (`authHeader`, `authPrefix`, `fieldNomor`, `fieldPesan`) tidak
berubah.

### Kelebihan dan kekurangan

| | |
| --- | --- |
| **Kelebihan** | Tidak menyentuh DNS Vercel; tidak bergantung Cloudflare; URL tetap selamanya |
| **Kekurangan** | IP VPS terekspos publik; perlu port 80/443 terbuka; sertifikat diperbarui otomatis oleh Caddy |

---

## Jalan B — Named tunnel Cloudflare

URL tetap dan IP VPS tetap tersembunyi, tetapi **DNS harus pindah ke
Cloudflare**.

### Yang dibutuhkan

1. Akun Cloudflare (gratis).
2. Kesediaan memindahkan nameserver `pindai.biz.id` dari idwebhost ke Cloudflare.
3. Akses registrar domain untuk mengubah nameserver.

### Langkah 1 — pindahkan zone ke Cloudflare

1. Cloudflare → **Add a site** → `pindai.biz.id` → pilih paket **Free**.
2. Cloudflare memindai record yang ada. **Pastikan record ini ikut terbawa:**

   | Tipe | Nama | Nilai | Proxy |
   | --- | --- | --- | --- |
   | `A` | `@` | `216.198.79.1` | **DNS only** (abu-abu) |
   | `CNAME` | `www` | sesuai Vercel | **DNS only** |

   Record `@` **wajib** disetel *DNS only*, bukan *Proxied*. Kalau di-proxy,
   Vercel kehilangan domain dan situs bisa berhenti.

3. Cloudflare memberi dua nameserver, mis. `ada.ns.cloudflare.com`.
4. Ubah nameserver di registrar (tempat Anda membeli `pindai.biz.id`) menjadi
   dua nama itu.
5. Tunggu propagasi 1–24 jam. Cek dengan `dig +short NS pindai.biz.id`.

> **Peringatan.** Langkah ini menyentuh DNS situs produksi. Kalau record `@`
> salah, `pindai.biz.id` berhenti menyala. Lakukan saat sepi trafik, dan
> pastikan `216.198.79.1` tersalin persis.

### Langkah 2 — buat tunnel

```bash
# di VPS
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

cloudflared tunnel login          # buka URL, pilih zone pindai.biz.id
cloudflared tunnel create pindai-wa
```

Catat **Tunnel ID** yang dicetak.

### Langkah 3 — konfigurasi ingress

`/etc/cloudflared/config.yml`:

```yaml
tunnel: pindai-wa
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: wa.pindai.biz.id
    service: http://127.0.0.1:8787
  - service: http_status:404
```

### Langkah 4 — DNS dan layanan

```bash
cloudflared tunnel route dns pindai-wa wa.pindai.biz.id
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Langkah 5 — verifikasi dan perbarui PINDAI

Sama dengan Jalan A langkah 4–5, dengan URL `https://wa.pindai.biz.id/send`.

### Kelebihan dan kekurangan

| | |
| --- | --- |
| **Kelebihan** | IP VPS tersembunyi; tidak perlu port terbuka; proteksi DDoS Cloudflare |
| **Kekurangan** | **DNS situs produksi harus dipindahkan**; risiko downtime bila record salah; ketergantungan pada Cloudflare |

---

## Perbandingan

| | Jalan A (Caddy) | Jalan B (Named tunnel) |
| --- | --- | --- |
| Sentuh DNS Vercel | **Tidak** | **Ya — nameserver pindah** |
| Risiko downtime situs | Sangat kecil | Sedang |
| IP VPS terekspos | Ya | Tidak |
| Port 80/443 perlu terbuka | Ya | Tidak |
| Waktu pengerjaan | ~15 menit | ~1 jam + propagasi DNS |
| Ketergantungan pihak ketiga | Let's Encrypt saja | Cloudflare |

**Untuk kondisi PINDAI sekarang, Jalan A lebih aman**: satu record A tambahan
tidak bisa merusak situs yang sudah jalan, sedangkan memindahkan nameserver
menyentuh seluruh domain.

---

## Selama endpoint belum permanen

Kalau salah satu jalan di atas belum dikerjakan, lakukan ini minimal:

1. **Pantau tunnel.** Periksa `/health` berkala. Kalau `ok: false` atau tidak
   menjawab, OTP WhatsApp sedang mati.
2. **Simpan URL dan token** di tempat yang bisa diakses cepat.
3. **Siapkan langkah perbaikan** supaya bisa dijalankan dalam hitungan menit:

```bash
# di VPS, setelah cloudflared dijalankan ulang dan URL baru tercetak
# perbarui apiUrl lewat panel admin tab WhatsApp
```

Tanpa pemantauan, kegagalan tunnel baru ketahuan saat ada pengguna yang gagal
masuk — dan itu bisa berjam-jam.
