# URL gateway WhatsApp yang mengikuti dirinya sendiri

Cara membuat PINDAI selalu menunjuk gateway WhatsApp yang benar, **tanpa perlu
memperbarui URL manual** setiap kali tunnel restart.

---

## Masalahnya

`cloudflared tunnel --url` (quick tunnel) membuat nama acak sekali pakai:

```
amsterdam-briefly-pentium-paint.trycloudflare.com   <- sekali pakai
baru-sekali-lain.trycloudflare.com                  <- setelah restart
```

`waSettings.apiUrl` di PINDAI menyimpan URL lama. Begitu tunnel restart:

1. URL lama mati
2. PINDAI tetap mencoba mengirim ke sana
3. **OTP WhatsApp berhenti terkirim**
4. Pengguna yang hanya memakai WhatsApp tidak bisa masuk

Sebelumnya satu-satunya jalan adalah admin membuka panel dan menempelkan URL
baru secara manual.

---

## Solusinya

Gateway **melaporkan URL-nya sendiri** ke PINDAI setiap kali dapat URL baru.

```
cloudflared  --(cetak URL baru)-->  tunnel-otomatis.sh
                                          |
                                          | POST waLaporUrl:laporkanUrl
                                          v
                                     PINDAI (Convex)
                                     waSettings.apiUrl diperbarui
```

Admin tidak perlu menyentuh apa pun. PINDAI selalu menunjuk alamat yang benar.

---

## Keamanan

Endpoint ini bisa memindahkan tujuan pengiriman OTP. Kalau disalahgunakan,
penyerang dapat mengarahkan OTP ke servernya — itu **pencurian akun**. Karena
itu tiga lapis:

| Lapis | Yang dijaga |
| --- | --- |
| **Token** | Wajib sama dengan `WHATSAPP_API_KEY` (token yang sudah dipakai PINDAI). Dibandingkan waktu-konstan. Tidak ada rahasia baru. |
| **Host** | Hanya `https://*.trycloudflare.com`, `*.pindai.biz.id`, atau host yang sedang dipakai. Gateway tidak bisa menunjuk sembarang server. |
| **Audit** | Setiap perubahan mencatat URL **lama dan baru** di audit trail. Pengalihan diam-diam akan terlihat. |

Sudah diuji di produksi: token salah menghasilkan
`{"ok":false,"alasan":"Token tidak sah."}` dan `apiUrl` **tidak berubah**.

---

## Pemasangan di VPS

Prasyarat: `server.mjs` sudah berjalan di port 8787, dan `cloudflared`
terpasang.

### 1. Salin berkas

```bash
sudo mkdir -p /opt/pindai-wa-sender
cd /opt/pindai-wa-sender

# dari repo
sudo cp tunnel-otomatis.sh /opt/pindai-wa-sender/
sudo chmod +x /opt/pindai-wa-sender/tunnel-otomatis.sh

sudo cp pindai-wa-tunnel.service /etc/systemd/system/
```

### 2. Simpan token (jangan di unit file)

```bash
sudo mkdir -p /etc/pindai
sudo install -m 600 -o pindai -g pindai /dev/null /etc/pindai/wa.env
sudo nano /etc/pindai/wa.env
```

Isi:

```
WHATSAPP_API_KEY=<token gateway dari PINDAI>
CONVEX_URL=https://academic-rooster-210.convex.cloud
```

> Token yang sama dipakai PINDAI untuk mengirim. Ambil dari panel admin tab
> **WhatsApp**, atau dari environment Convex `WHATSAPP_API_KEY`.

### 3. Jalankan

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pindai-wa-tunnel
sudo systemctl status pindai-wa-tunnel --no-pager
```

### 4. Verifikasi

```bash
# URL baru harus tercatat di log
sudo journalctl -u pindai-wa-tunnel -n 30 --no-pager

# PINDAI harus sudah menunjuk URL baru
npx convex run --inline-query \
  'const w = await ctx.db.query("waSettings").first(); return w?.apiUrl' --prod
```

Uji dengan restart tunnel:

```bash
sudo systemctl restart pindai-wa-tunnel
sleep 20
# apiUrl di atas harus berubah sendiri
```

---

## Kalau lapor gagal

Pelaporan gagal **tidak menghentikan** tunnel — prioritasnya WhatsApp tetap
tersambung. Kalau lapor gagal terus:

| Gejala | Sebab |
| --- | --- |
| `{"ok":false,"alasan":"Token tidak sah."}` | `WHATSAPP_API_KEY` di VPS beda dengan di Convex |
| `{"ok":false,"alasan":"Host ... tidak diizinkan"}` | Bukan quick tunnel dan bukan subdomain pindai.biz.id |
| `{"ok":false,"alasan":"Gateway belum dikonfigurasi"}` | `WHATSAPP_API_KEY` kosong di Convex |

Perbarui manual lewat panel admin tab **WhatsApp** sebagai cadangan.

---

## Kapan ini TIDAK cukup

Skrip ini menyelesaikan masalah **URL berubah**. Tidak menyelesaikan masalah
**proses mati**.

| Masalah | Solusi |
| --- | --- |
| URL berubah tiap restart | **Skrip ini** |
| `cloudflared` mati | `Restart=always` di systemd (sudah diset) |
| VPS mati / jaringan putus | Endpoint permanen (Jalan A/B) |
| WhatsApp mengeluarkan sesi | Pindai ulang QR |

Untuk penggantian URL yang sepenuhnya permanen (tanpa tunnel sama sekali),
lihat `whatsapp-endpoint-permanen.md`.

---

## Berkas terkait

| Berkas | Isi |
| --- | --- |
| `deploy/wa-sender/tunnel-otomatis.sh` | Skrip yang menangkap URL dan melaporkannya |
| `deploy/wa-sender/pindai-wa-tunnel.service` | Unit systemd |
| `src/convex/waLaporUrl.ts` | Endpoint penerima laporan |
| `src/convex/waLaporUrl.convex.test.ts` | 6 tes keamanan |
