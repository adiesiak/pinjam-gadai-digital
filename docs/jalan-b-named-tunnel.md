# Jalan B — Named Tunnel Cloudflare: panduan lengkap

Tujuan: mengganti endpoint WhatsApp dari tunnel sementara menjadi
**`https://wa.pindai.biz.id/send`** yang tidak pernah berubah.

**Konsekuensi yang harus Anda terima lebih dulu:** nameserver `pindai.biz.id`
harus dipindahkan dari idwebhost ke Cloudflare. Itu menyentuh **seluruh domain**,
termasuk situs produksi yang sekarang jalan di Vercel.

---

## Inventaris DNS — WAJIB dipertahankan

Diperiksa 28 November 2026 lewat Google DNS-over-HTTPS. Zona ini **kecil**:
hanya **4 record**. Itu membuat migrasi jauh lebih aman daripada domain besar.

| # | Tipe | Nama | Nilai | Fungsi | Kalau hilang |
| --- | --- | --- | --- | --- | --- |
| 1 | `A` | `@` | `216.198.79.1` | **Vercel** — situs produksi | **pindai.biz.id mati** |
| 2 | `CNAME` | `send` | `send.forge.rmta.net.` | **Resend** return-path | email OTP terganggu |
| 3 | `TXT` | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4raXPhq7VpfByGhYo72nj7IyvQeKLWA2Nq8W3xpC8sN9lMEtwPEtaq5zka1udQRgbv++Yt5jxS3UYsqPGH7l6IW51Jm5NJw0OzT3DzjzO7ALNsvgTUo6J5fzc2sLcXw5SufwtOLQ9awQXkAOfpm5msYX7ndFQbPYdei5CGRl1owIDAQAB` | **Resend DKIM** | **OTP email berhenti terkirim** |
| 4 | `TXT` | `_dmarc` | `v=DMARC1; p=none;` | kebijakan DMARC | reputasi email turun |

**Tidak ada** record `MX`, `AAAA`, `CAA`, atau `www`. Tidak ada yang perlu
dipertahankan selain empat di atas.

**Yang akan ditambahkan:**

| Tipe | Nama | Nilai | Fungsi |
| --- | --- | --- | --- |
| `CNAME` | `wa` | `<TUNNEL-ID>.cfargotunnel.com` | endpoint WhatsApp |

---

## Peringatan sebelum mulai

1. **Lakukan saat sepi trafik.** Propagasi nameserver bisa 1–24 jam; selama itu
   beberapa resolver masih memakai idwebhost, sebagian sudah Cloudflare.
2. **Jangan hapus zone di idwebhost** sampai migrasi terbukti stabil minimal
   7 hari. Biarkan sebagai cadangan.
3. **Record `@` harus *DNS only* (awan abu-abu)**, bukan *Proxied*. Kalau
   di-proxy, Vercel tidak bisa memverifikasi domain dan situs berhenti.
4. **Catat keempat record di atas** di tempat aman sebelum menyentuh apa pun.
   Kalau ada yang terlewat saat Cloudflare memindai, Anda harus menambahkannya
   manual.

---

## Langkah 1 — Tambahkan zone di Cloudflare

1. Buka <https://dash.cloudflare.com> → **Add a site**.
2. Masukkan `pindai.biz.id` → pilih paket **Free**.
3. Cloudflare memindai record yang ada. **Periksa hasilnya terhadap tabel
   inventaris di atas.** Kalau ada yang tidak terbawa, tambahkan manual dengan
   tombol **Add record**:

```
Type: A      | Name: @                  | Content: 216.198.79.1        | Proxy: DNS only
Type: CNAME  | Name: send               | Content: send.forge.rmta.net | Proxy: DNS only
Type: TXT    | Name: resend._domainkey  | Content: p=MIGfMA0GCSqGSIb3...
Type: TXT    | Name: _dmarc             | Content: v=DMARC1; p=none;
```

4. Cloudflare menampilkan dua nameserver, misalnya:

```
ada.ns.cloudflare.com
bob.ns.cloudflare.com
```

**Catat keduanya.**

> Cloudflare mungkin menawarkan "Quick Scan" dan memasang record tambahan yang
> tidak Anda kenal. Hapus record yang tidak ada di tabel inventaris — jangan
> biarkan Cloudflare menebak.

---

## Langkah 2 — Ubah nameserver di registrar

1. Login ke tempat Anda membeli `pindai.biz.id` (registrar), **bukan** panel
   idwebhost.
2. Cari menu **Nameservers** / **DNS Server**.
3. Ganti dari:

```
ns1.idwebhost.id
ns2.idwebhost.id
```

   menjadi dua nameserver Cloudflare dari Langkah 1.

4. Simpan.

### Verifikasi propagasi

```bash
dig +short NS pindai.biz.id
# harus menampilkan *.ns.cloudflare.com
```

Bisa juga lewat <https://dnschecker.org> — tunggu sampai semua lokasi
menampilkan nameserver Cloudflare. Biasanya 1–4 jam, kadang sampai 24 jam.

**Selama propagasi belum selesai, jangan lanjut ke Langkah 3.** Tunnel butuh
zone sudah aktif di Cloudflare.

### Cek situs masih hidup

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pindai.biz.id/
# harus 200
```

Kalau bukan 200, **hentikan** dan periksa record `@` di Cloudflare: pastikan
tipenya `A`, isinya `216.198.79.1`, dan proxy **DNS only**.

---

## Langkah 3 — Pasang cloudflared di VPS

Jalankan sebagai root.

```bash
# tambah repo Cloudflare
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install -y cloudflared

cloudflared --version
```

---

## Langkah 4 — Login dan buat tunnel

```bash
cloudflared tunnel login
```

Perintah ini mencetak URL. Buka di browser, pilih zone **pindai.biz.id**,
lalu **Authorize**. Sertifikat tersimpan di `~/.cloudflared/cert.pem`.

```bash
cloudflared tunnel create pindai-wa
```

Output menampilkan **Tunnel ID** (format UUID) dan membuat berkas kredensial:

```
~/.cloudflared/<TUNNEL-ID>.json
```

**Catat Tunnel ID-nya.**

---

## Langkah 5 — Konfigurasi ingress

Buat `/etc/cloudflared/config.yml`:

```yaml
tunnel: pindai-wa
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: wa.pindai.biz.id
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Ganti `<TUNNEL-ID>` dengan ID dari Langkah 4.

> `127.0.0.1:8787` adalah port service Baileys. Kalau Hermes memakai port lain,
> sesuaikan. Cek dengan `sudo ss -tlnp | grep -E '8787|node'`.

### Pastikan service Baileys hidup

```bash
curl -s http://127.0.0.1:8787/health
# {"ok":true,"siap":true,"alasan":null}
```

Kalau belum menjawab, selesaikan dulu service Baileys-nya — tunnel hanya
meneruskan, tidak membuat service-nya.

---

## Langkah 6 — Daftarkan DNS tunnel

```bash
cloudflared tunnel route dns pindai-wa wa.pindai.biz.id
```

Perintah ini membuat CNAME `wa` → `<TUNNEL-ID>.cfargotunnel.com` secara
otomatis di Cloudflare. **Ini hanya berhasil bila nameserver sudah pindah**
(Langkah 2 selesai).

Verifikasi:

```bash
dig +short wa.pindai.biz.id
```

---

## Langkah 7 — Jadikan layanan systemd

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

Uji:

```bash
curl -s https://wa.pindai.biz.id/health
# {"ok":true,"siap":true,"alasan":null}
```

### Matikan tunnel quick lama

Kalau `cloudflared` quick tunnel masih berjalan, hentikan supaya tidak ada dua
proses berebut:

```bash
sudo systemctl list-units --type=service | grep -i cloudflared
ps aux | grep -i 'cloudflared tunnel --url'
# hentikan proses quick tunnel yang lama
```

---

## Langkah 8 — Uji kirim sebelum menyentuh PINDAI

```bash
curl -s -X POST https://wa.pindai.biz.id/send \
  -H "Authorization: Bearer <TOKEN-SEKARANG>" \
  -H "Content-Type: application/json" \
  -d '{"target":"6285119574032","message":"Uji endpoint permanen"}'
```

Harus membalas:

```json
{"ok":true,"status":true,"messageId":"..."}
```

**Jangan lanjut kalau ini belum berhasil.** Endpoint lama masih jalan, jadi
tidak ada yang rusak selama langkah ini belum lolos.

---

## Langkah 9 — Peralihkan PINDAI

Hanya **satu** yang berubah: `apiUrl`. Token tetap sama.

Di panel admin PINDAI, tab **WhatsApp**:

| Field | Nilai baru |
| --- | --- |
| `apiUrl` | `https://wa.pindai.biz.id/send` |
| `authHeader` | `Authorization` (tetap) |
| `authPrefix` | `Bearer ` (tetap) |
| `fieldNomor` | `target` (tetap) |
| `fieldPesan` | `message` (tetap) |
| `aktif` | `true` (tetap) |

Panel memvalidasi URL dengan aturan yang sama (`validasiGatewayUrl`), jadi URL
yang tidak lolos akan ditolak sebelum tersimpan.

---

## Langkah 10 — Verifikasi end-to-end

### a. Pesan biasa

Panel admin → pilih pinjaman → **Kirim pengingat**. Cek `waLogs`.

### b. OTP WhatsApp

Halaman login → tab WhatsApp → masukkan nomor → kode harus masuk.

### c. OTP email (pastikan DKIM tidak rusak)

Halaman login → tab email → kode harus masuk. Ini menguji bahwa record
`resend._domainkey` selamat dari migrasi.

### d. Situs

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pindai.biz.id/
# 200
```

### e. Tautan dokumen KTP

Panel admin → KYC → buka satu pengajuan. Gambar KTP/selfie harus tampil.

---

## Rollback

Kalau ada yang tidak beres, kembalikan nameserver ke idwebhost:

```
ns1.idwebhost.id
ns2.idwebhost.id
```

Propagasi balik 1–24 jam. **Karena itu jangan hapus zone di idwebhost.**

Untuk endpoint WhatsApp, kembalikan `apiUrl` di tab WhatsApp ke URL tunnel quick
lama — selama tunnel itu masih hidup.

---

## Daftar periksa

| # | Langkah | Selesai | Diverifikasi |
| --- | --- | --- | --- |
| 1 | Zone ditambahkan, 4 record lengkap | ☐ | ☐ |
| 2 | Nameserver diubah di registrar | ☐ | ☐ |
| 2b | `dig NS` menampilkan Cloudflare | ☐ | ☐ |
| 2c | Situs masih 200 | ☐ | ☐ |
| 3 | `cloudflared` terpasang | ☐ | ☐ |
| 4 | `cloudflared tunnel login` + `create` | ☐ | ☐ |
| 5 | `config.yml` benar | ☐ | ☐ |
| 5b | `/health` lokal 200 | ☐ | ☐ |
| 6 | `tunnel route dns` berhasil | ☐ | ☐ |
| 7 | Layanan systemd aktif | ☐ | ☐ |
| 7b | `/health` via HTTPS 200 | ☐ | ☐ |
| 8 | `POST /send` berhasil | ☐ | ☐ |
| 9 | `apiUrl` diperbarui di PINDAI | ☐ | ☐ |
| 10 | OTP WhatsApp masuk | ☐ | ☐ |
| 10b | OTP email masuk | ☐ | ☐ |
| 10c | Situs 200, KTP tampil | ☐ | ☐ |

---

## Risiko, jujur

| Risiko | Peluang | Dampak | Mitigasi |
| --- | --- | --- | --- |
| Record `@` lupa disetel DNS-only | Sedang | **Situs mati** | Periksa sebelum ubah nameserver |
| Record DKIM tidak terbawa | Sedang | OTP email mati | Cocokkan dengan tabel inventaris |
| Propagasi lama | Pasti | Sebagian pengguna gagal sementara | Kerjakan saat sepi trafik |
| Zone idwebhost dihapus terlalu cepat | Rendah | Tidak bisa rollback | Biarkan 7 hari |
| Cloudflare menebak record tambahan | Sedang | Record asing masuk | Hapus yang tidak dikenal |

**Kalau Anda ingin risiko lebih kecil**, Jalan A (Caddy + satu record `A`)
mencapai hasil yang sama — URL permanen yang sama — tanpa menyentuh nameserver.
Panduannya ada di [whatsapp-endpoint-permanen.md](whatsapp-endpoint-permanen.md).
