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
| `validasiGatewayUrl` | lolos (HTTPS, port 443, domain publik, tanpa wildcard DNS) |

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

**Pilihan 1 — Named tunnel (disarankan).** Buat tunnel permanen di Cloudflare
Zero Trust dengan subdomain tetap, mis. `wa.pindai.biz.id`. URL-nya tidak
berubah, dan `cloudflared` bisa dijalankan sebagai layanan systemd.

**Pilihan 2 — Domain sendiri + Caddy.** Ikuti `deploy/wa-sender/install.sh`
yang sudah ada di repo: Caddy menerbitkan sertifikat Let's Encrypt untuk
subdomain tetap. Ini juga menghilangkan ketergantungan pada Cloudflare.

**Pilihan 3 — tetap quick tunnel, tetapi pantau.** Tambahkan pemeriksaan
berkala terhadap `/health`; bila gagal, kirim peringatan ke admin. Paling murah,
paling rapuh.

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
