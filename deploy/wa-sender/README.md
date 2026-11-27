# WhatsApp Sender PINDAI (Baileys)

Service kecil yang membuat **WhatsApp PINDAI berjalan tanpa biaya per pesan**,
memakai Baileys dan nomor WhatsApp yang sudah ada.

## Kenapa tidak perlu ubah kode PINDAI

PINDAI sudah punya **gateway generik** yang endpoint-nya diatur admin lewat
tabel `waSettings`. Kontraknya:

```
POST <apiUrl>
Authorization: <authPrefix><WHATSAPP_API_KEY>
Content-Type: application/json

{ "target": "628...", "message": "isi pesan" }
```

Balasan 2xx JSON tanpa `status:false` / `success:false` = terkirim.

Service ini memenuhi kontrak itu. Yang penting: `kirimPesanOtp` di
`src/convex/otpWhatsapp.ts` **sudah memprioritaskan gateway** — bila
`waSettings.apiUrl` terisi, **OTP ikut lewat sini**, bukan hanya pesan
penagihan. Jadi cukup atur gateway; tidak ada kode PINDAI yang perlu disentuh.

## Pemasangan

Satu perintah di VPS (Debian/Ubuntu, sebagai root):

```bash
sudo bash install.sh <domain-https> [nomor-whatsapp]

# contoh
sudo bash install.sh wa.pindai.biz.id 6285119574032
```

Skrip mengerjakan seluruhnya: Node.js 20, dependensi, token gateway, layanan
systemd, HTTPS lewat Caddy, lalu mencetak **kode pautan WhatsApp** dan **token
gateway**.

Instruksi lengkap untuk operator/agen: lihat [UNTUK-HERMES.md](UNTUK-HERMES.md).

## Syarat yang WAJIB dipenuhi

PINDAI memvalidasi URL gateway di `src/lib/waUrl.ts` (`validasiGatewayUrl`).
URL yang tidak lolos **tidak akan pernah di-fetch**:

| Aturan | Konsekuensi |
| --- | --- |
| Harus **HTTPS** | `http://` ditolak |
| Port **443** atau kosong | `:8787` ditolak |
| **Nama domain publik** | alamat IP literal ditolak |
| Tanpa kredensial di URL | `user:pass@host` ditolak |
| Bukan wildcard DNS | `nip.io`, `sslip.io`, dll ditolak |

Karena itu service ini **harus di belakang reverse proxy ber-TLS**. `install.sh`
memasang Caddy untuk itu.

## Konfigurasi

| Variabel | Default | Arti |
| --- | --- | --- |
| `WA_SENDER_TOKEN` | — | **wajib**, minimal 24 karakter |
| `WA_SENDER_PORT` | `8787` | port lokal |
| `WA_SENDER_HOST` | `127.0.0.1` | jangan diubah agar tidak terbuka ke internet |
| `WA_SENDER_PAIRING` | — | nomor untuk "Tautkan dengan nomor telepon" |
| `WA_SENDER_AUTH` | `./auth` | folder sesi Baileys |
| `WA_SENDER_FIELD_NOMOR` | `target` | nama field nomor di body |
| `WA_SENDER_FIELD_PESAN` | `message` | nama field pesan di body |
| `WA_SENDER_LOG` | `warn` | level log pino |

`install.sh` menaruh variabel ini di `/etc/pindai-wa-sender.env` (mode `600`).
Token **tidak pernah** masuk repo.

## Endpoint

| Metode | Path | Auth | Arti |
| --- | --- | --- | --- |
| `GET` | `/health` | tidak | `{ok, siap, alasan}` — `503` bila belum siap |
| `POST` | `/send` | Bearer | kirim satu pesan teks |

## Menghubungkan ke PINDAI

Setelah `install.sh` selesai, ia mencetak `apiUrl` dan token. Pasang di Convex:

```bash
npx convex env set WHATSAPP_API_KEY <token>
```

Lalu isi satu baris `waSettings` (tabel ini kosong pada deployment baru):

```js
{
  slot: "global",
  apiUrl: "https://<domain>/send",
  authHeader: "Authorization",
  authPrefix: "Bearer ",
  fieldNomor: "target",
  fieldPesan: "message",
  aktif: true
}
```

`slot` selalu `"global"`. Nama field boleh dikosongkan karena bawaannya sudah
`target`/`message`, sama dengan yang dilayani service ini.

## Nomor yang sama dengan Hermes

Service ini memakai nomor yang sama dengan Hermes, sehingga tertaut sebagai
**perangkat kedua**:

- WhatsApp mengizinkan sampai **4 perangkat tertaut**; Hermes tetap berjalan.
- Keduanya punya folder `auth/` **masing-masing**. Jangan disalin atau dibagi —
  dua proses yang menulis kredensial sama akan merusak sesi.
- Service ini **tidak menangani pesan masuk**. Pesan masuk tetap dilayani bot
  Hermes; service ini hanya mengirim.
- Logout satu perangkat tidak memutus perangkat lain, tetapi perangkat yang
  logout harus dipindai ulang.

## Batasan

- **Bukan API resmi WhatsApp.** Untuk OTP dan pengingat transaksional volume
  rendah risikonya kecil. Jangan dipakai broadcast promosi massal.
- **Sesi bisa logout.** Bila terjadi, hapus `auth/` lalu pautkan ulang.
- **Timeout PINDAI 10 detik** (`GATEWAY_TIMEOUT_MS`). Bila VPS lambat, PINDAI
  mencatat gagal walau pesan akhirnya terkirim.
- **Hanya teks.** Lampiran PDF hanya didukung jalur Fonnte; untuk laporan,
  kirim tautan di dalam teks.

## Perintah harian

```bash
sudo systemctl status pindai-wa-sender --no-pager
sudo journalctl -u pindai-wa-sender -n 60 --no-pager
sudo systemctl restart pindai-wa-sender
curl -s https://<domain>/health
```
