# API Bot WhatsApp — integrasi pengajuan ke website

Panduan untuk pengembang bot (Hermes). Setelah ini, **pengajuan dari bot masuk ke
tabel yang sama dengan website**, bukan ke database bot sendiri.

---

## Kenapa perlu diintegrasikan

Selama bot menyimpan pengajuan sendiri:

- Ada **dua database** untuk hal yang sama
- Format cepat menyimpang karena logikanya disalin
- Site dan bot bisa punya angka berbeda untuk pengajuan yang sama
- Pengajuan dari bot tidak muncul di panel admin website

Setelah integrasi:

```
Bot WhatsApp ──HTTPS + API key──► Convex ──► tabel loans (sama dengan website)
```

Bot menjadi **klien** website, bukan sistem kedua.

---

## Dasar

| Item | Nilai |
| --- | --- |
| Base URL | `https://academic-rooster-210.convex.site` |
| Autentikasi | `Authorization: Bearer <BOT_API_KEY>` |
| Format | JSON, UTF-8 |
| Batas body | 256 KB |

`BOT_API_KEY` adalah 64 karakter hex. **Jangan** ditanam di kode bot yang
di-commit — simpan di environment VPS.

Kalau header tidak ada atau kunci salah, semua endpoint menjawab `401`.
Kalau `BOT_API_KEY` belum diisi di Convex, semua endpoint menjawab `503`
(mati total, bukan menerima tanpa verifikasi).

---

## Alur lengkap

```
① User: "AJUKAN 2 JUTA 28 HARI"
        │
② Bot:  POST /bot/daftar         (kalau nomor belum terdaftar)
        │
③ Bot:  POST /bot/unggah-url     → { urlUnggah }
        │
④ Bot:  POST <urlUnggah>         → { storageId }  (foto KTP)
        POST <urlUnggah>         → { storageId }  (selfie KTP)
        POST <urlUnggah>         → { storageId }  (slip gaji)
        │
⑤ Bot:  POST /bot/pengajuan      → { nomorReferensi: "PGD-20261128-A1B2" }
        │
⑥ Bot:  teruskan nomorReferensi ke user via WhatsApp
```

---

## 1. `POST /bot/daftar`

Daftarkan nomor WhatsApp sebagai peminjam. Kalau nomor sudah ada, tidak
membuat duplikat — mengembalikan user yang sama.

**Request**

```json
{ "nomor": "08123456789", "nama": "Budi Santoso" }
```

Nomor boleh format apa pun: `0812…`, `+62 812-…`, `62812…`, `812…`.
Server menormalkannya ke `62812…`.

**Response — baru**

```json
{ "ok": true, "userId": "jx7…", "baru": true }
```

**Response — sudah ada**

```json
{ "ok": true, "userId": "jx7…", "baru": false }
```

**Error**

| Kode | Arti |
| --- | --- |
| `400` | Nomor tidak valid (harus 10–15 digit) atau nama < 2 karakter |

---

## 2. `POST /bot/unggah-url`

Dapatkan URL unggah **sekali pakai** untuk satu berkas.

**Request:** body kosong.

**Response**

```json
{ "ok": true, "urlUnggah": "https://academic-rooster-210.convex.cloud/api/storage/upload?…" }
```

**Cara mengunggah** — `POST` berkas ke URL itu. Convex storage HANYA menerima POST di URL ini; `PUT` dijawab 405 (terbukti di produksi 28 Nov 2026):

```bash
curl -X POST "$URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @ktp.jpg
```

**Response dari POST**

```json
{ "storageId": "kg2b2400pv6qask6r9eetdggns8k19fv" }
```

> **Penting:** bot **JANGAN** menyimpan foto di VPS. Kalau disimpan sendiri,
> dokumen KYC terpecah dua tempat dan pemulihan backup tidak lagi utuh.
> Teruskan foto dari WhatsApp langsung ke Convex.

Setiap berkas butuh URL unggah sendiri. Untuk pengajuan, ambil 3 URL
(KTP, selfie, slip gaji).

---

## 3. `POST /bot/pengajuan`

Buat pengajuan pinjaman atas nama pemilik nomor.

**Request**

```json
{
  "nomor": "08123456789",
  "data": {
    "pokokPinjaman": 2000000,
    "tujuan": "Modal usaha",
    "namaLengkap": "Budi Santoso",
    "namaBank": "BCA",
    "nomorRekening": "1234567890",
    "tenorHari": 28,
    "nik": "3273012345678901",
    "nomorWhatsApp": "08123456789",
    "penghasilanBulanan": 5000000,
    "sumberPenghasilan": "Karyawan swasta",
    "dokKtpId": "kg2b2400…",
    "dokSelfieKtpId": "kg20m6hb…",
    "dokSlipGajiId": "kg20nk44…",
    "persetujuanSyarat": true
  }
}
```

**Field wajib**

| Field | Tipe | Catatan |
| --- | --- | --- |
| `pokokPinjaman` | number | Rupiah bulat, dalam batas plafon akun |
| `tujuan` | string | Alasan peminjaman |
| `namaLengkap` | string | Sesuai KTP |
| `namaBank` | string | Bank/e-wallet tujuan pencairan |
| `nomorRekening` | string | |
| `tenorHari` | number | Tenor harian dari opsi resmi |
| `nik` | string | 16 digit |
| `nomorWhatsApp` | string | |
| `penghasilanBulanan` | number | |
| `sumberPenghasilan` | string | |
| `dokKtpId` | storageId | Hasil POST |
| `dokSelfieKtpId` | storageId | Hasil POST |
| `dokSlipGajiId` | storageId | Hasil POST |
| `persetujuanSyarat` | `true` | Harus `true` literal |

**Field opsional penting**

| Field | Kapan dipakai |
| --- | --- |
| `tenorBulan` | Pinjaman bulanan (3/6/9/12). Bila diisi, `tenorHari` diabaikan |
| `dokKartuKeluargaId`, `dokBuktiDomisiliId` | Jaminan tambahan, wajib untuk tenor 3/6 bulan dan pokok ≥ Rp 3.000.000 |
| `cairEkspres` | `false` = pencairan biasa |
| `catatanPeminjam` | Catatan tambahan |
| `kunciIdempotensi` | **Disarankan**: kunci unik per pengajuan, supaya kiriman ulang tidak melahirkan pengajuan kedua |

**Response sukses**

```json
{ "ok": true, "appId": "jx7…", "nomorReferensi": "PGD-20261128-A1B2" }
```

**Response gagal** — `400` dengan `error` berisi alasan dari server, misalnya:

```json
{ "ok": false, "error": "Pengajuan ditolak: KYC belum terverifikasi." }
```

> **Pesan error ditampilkan apa adanya ke user.** Server sudah menulisnya dalam
> bahasa Indonesia yang bisa dibaca nasabah.

---

## 4. `GET /bot/status?nomor=08123456789`

Cek pengajuan milik satu nomor. Hanya mengembalikan pengajuan **nomor itu** —
bot tidak bisa membaca pengajuan orang lain.

**Response**

```json
{
  "ok": true,
  "userId": "jx7…",
  "pengajuan": [
    {
      "nomorReferensi": "PGD-20261128-A1B2",
      "status": "diajukan",
      "pokokPinjaman": 2000000,
      "tenorHari": 28,
      "tenorBulan": null,
      "dibuatPada": 1795840699205
    }
  ]
}
```

Maksimal 10 pengajuan terbaru. Nomor yang belum terdaftar menjawab
`{"ok":false,"alasan":"Nomor belum terdaftar."}`.

---

## Yang tetap berlaku (tidak bisa dilewati bot)

Pengajuan dari bot **tunduk pada aturan yang sama** dengan website, karena
memakai fungsi inti yang sama:

| Aturan | Akibat kalau dilanggar |
| --- | --- |
| KYC harus VERIFIED | Ditolak |
| Plafon pinjaman | Ditolak dengan pesan plafon |
| Batas minimal/maksimal pokok | Ditolak |
| Tenor harus dari opsi resmi | Ditolak |
| Syarat underwriting (jaminan) | Ditolak |
| Gerbang anti-spam | Ditolak |
| Pembatas laju per akun | Ditolak |

Karena satu implementasi, **tidak mungkin** bot punya aturan lebih longgar
daripada website.

---

## Alur yang disarankan untuk bot

```
User: "AJUKAN 2 JUTA"

Bot:  cek POST /bot/status?nomor=…
      ├─ nomor belum terdaftar → minta nama → POST /bot/daftar
      └─ sudah terdaftar

Bot:  minta data: tujuan, bank, rekening, NIK, penghasilan

Bot:  minta foto: KTP, selfie + KTP, slip gaji
      untuk tiap foto: POST /bot/unggah-url → POST berkas → simpan storageId

Bot:  konfirmasi ringkasan ke user

Bot:  POST /bot/pengajuan  (dengan kunciIdempotensi unik)
      ├─ sukses → kirim nomorReferensi ke user
      └─ gagal  → kirim pesan error, minta perbaiki
```

---

## Contoh lengkap (curl)

```bash
BASE="https://academic-rooster-210.convex.site"
KEY="<BOT_API_KEY>"

# 1. daftar
curl -s -X POST "$BASE/bot/daftar" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"nomor":"08123456789","nama":"Budi Santoso"}'

# 2. dapat URL unggah
URL=$(curl -s -X POST "$BASE/bot/unggah-url" \
  -H "Authorization: Bearer $KEY" | jq -r .urlUnggah)

# 3. unggah berkas
SID=$(curl -s -X POST "$URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @ktp.jpg | jq -r .storageId)

# 4. ajukan
curl -s -X POST "$BASE/bot/pengajuan" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"nomor\":\"08123456789\",\"data\":{...\"dokKtpId\":\"$SID\"...}}"

# 5. cek status
curl -s "$BASE/bot/status?nomor=08123456789" \
  -H "Authorization: Bearer $KEY"
```

---

## Kalau ada masalah

| Gejala | Sebab |
| --- | --- |
| `401` semua endpoint | `BOT_API_KEY` di bot beda dengan di Convex |
| `503` semua endpoint | `BOT_API_KEY` belum diset di environment Convex |
| `404` saat pengajuan | Nomor belum terdaftar — panggil `/bot/daftar` dulu |
| `400` "KYC belum terverifikasi" | User harus menyelesaikan KYC di website dulu |
| `400` "Plafon …" | Pokok melebihi plafon akun |

---

## Berkas terkait

| Berkas | Isi |
| --- | --- |
| `src/convex/botApi.ts` | Helper, pencarian nomor, pendaftaran, status |
| `src/convex/http.ts` | Route `/bot/*` |
| `src/convex/loans.ts` | `ajukanPinjamanInti` + `_ajukanDariBot` |
| `src/convex/botApi.convex.test.ts` | 10 tes |

---

## Yang belum ada

| Fitur | Catatan |
| --- | --- |
| Setoran/angsuran lewat bot | Belum; endpoint menyusul |
| Indeks `by_nomor_wa` | Pencarian nomor masih memindai; cukup untuk volume sekarang |
| Pembatas laju per nomor | Belum; mengandalkan pembatas per akun di inti |
| Webhook balik ke bot | Belum; bot memanggil (pull), bukan menerima push |
