# Gateway WhatsApp PINDAI — konfigurasi aktif

Dicatat 28 November 2026. Dokumen ini mencatat apa yang **benar-benar terpasang
di produksi**, bukan rencana.

## Yang terpasang

Pengiriman WhatsApp PINDAI memakai **gateway generik** yang endpoint-nya
disediakan oleh Baileys milik Hermes di VPS, di belakang tunnel Cloudflare.

| Setelan | Nilai |
| --- | --- |
| Lokasi konfigurasi | tabel `waSettings`, slot `global` |
| `apiUrl` | `https://amsterdam-briefly-pentium-paint.trycloudflare.com/send` |
| `authHeader` | `Authorization` |
| `authPrefix` | `Bearer ` |
| `fieldNomor` | `target` |
| `fieldPesan` | `message` |
| `aktif` | `true` |
| Token | env `WHATSAPP_API_KEY` di deployment `academic-rooster-210` |

Tidak ada kode PINDAI yang diubah untuk ini. `kirimPesanOtp` di
`src/convex/otpWhatsapp.ts` sudah memprioritaskan gateway begitu
`waSettings.apiUrl` terisi, jadi **OTP ikut lewat jalur ini**, bukan hanya
pengingat tagihan.

## Bukti terverifikasi

| Uji | Hasil |
| --- | --- |
| `GET /health` tunnel | `{"ok":true,"siap":true,"alasan":null}` |
| `POST /send` langsung dengan token | `{"ok":true,"status":true,"messageId":"3EB01CD49A25051792AB4D"}` |
| `whatsapp:_kirimPesanUmum` (jalur produksi) | `ok: true`, `messageId 3EB0D8589B30FEF4359557` |
| `kirimPesanOtp` (jalur OTP) | `terkirim: true`, `messageId 3EB0E5758B95E451CB82A0` |
| **`klaimPeminjam:mintaKodeKlaim`** (alur login sungguhan) | `terkirim: true`, baris `klaimOtp` tersimpan dengan `statusPengiriman: "terkirim"` dan `messageId 3EB06010780327496EC85D` |
| `validasiGatewayUrl` | lolos (HTTPS, port 443, domain publik, tanpa wildcard DNS) |

Uji terakhir adalah bukti end-to-end yang sebenarnya: kode OTP dibuat, di-hash
dengan salt, dikirim lewat gateway, dan challenge tersimpan dengan masa berlaku
5 menit serta maksimal 5 percobaan. Kode aslinya tidak pernah tersimpan — hanya
hash-nya.

## Risiko utama: URL tunnel bersifat SEMENTARA

`trycloudflare.com` adalah tunnel **quick** Cloudflare. URL-nya **berubah setiap
kali `cloudflared` dijalankan ulang**, dan tunnel mati bila prosesnya berhenti.

Artinya: begitu VPS reboot, `cloudflared` restart, atau layanan berhenti,
`waSettings.apiUrl` menunjuk ke alamat mati. Gejalanya:

- Pengiriman gagal dengan pesan `HTTP 5xx` atau `fetch failed`
- **OTP WhatsApp berhenti terkirim** — pengguna tidak bisa masuk lewat WhatsApp
- Tidak ada peringatan otomatis; baru terlihat saat ada yang mencoba

PINDAI punya timeout 10 detik (`GATEWAY_TIMEOUT_MS`), jadi kegagalan muncul
cepat, tetapi tetap tanpa alarm.

### Cara menutup risiko ini

Panduan langkah-demi-langkah ada di
**[whatsapp-endpoint-permanen.md](whatsapp-endpoint-permanen.md)**, termasuk
perbandingan risiko kedua jalan.

Ringkasnya:

- **Jalan A — Caddy + A record.** Tambah satu record `A` untuk subdomain
  (mis. `wa.pindai.biz.id`) di idwebhost, lalu jalankan
  `deploy/wa-sender/install.sh`. Tidak menyentuh DNS Vercel. **Disarankan.**
- **Jalan B — Named tunnel Cloudflare.** URL tetap dan IP VPS tersembunyi,
  tetapi **DNS `pindai.biz.id` harus dipindahkan ke Cloudflare** lebih dulu,
  dan itu menyentuh situs produksi.

Catatan penting: DNS `pindai.biz.id` sekarang di `ns1/ns2.idwebhost.id`, bukan
Cloudflare, jadi named tunnel **tidak bisa** dipakai tanpa memindahkan
nameserver.

## Bila URL tunnel berubah

Perbarui `waSettings.apiUrl` lewat panel admin **Pengaturan → WhatsApp**. Panel
memvalidasi URL dengan aturan yang sama (`validasiGatewayUrl`), jadi URL yang
tidak lolos akan ditolak sebelum tersimpan.

Catatan: panel admin mewajibkan TOTP aktif. Selama `mfaSettings` kosong, seluruh
panel admin menolak akses — termasuk halaman pengaturan WhatsApp.

## Hal yang perlu diingat

- **Nomor pengirim** adalah nomor milik Hermes. Gateway ini hanya mengirim, tidak
  menangani pesan masuk; balasan tetap dilayani bot Hermes.
- **Hanya teks.** Lampiran PDF hanya didukung jalur Fonnte.
- **Bukan API resmi WhatsApp.** Untuk OTP dan pengingat transaksional volume
  rendah risikonya kecil; jangan dipakai broadcast promosi massal.
- Token gateway disimpan hanya di environment Convex. Jangan menaruhnya di repo,
  dokumen, atau pesan.
