# Tambahan dokumentasi: endpoint KYC dan uang

Dokumen ini melengkapi `docs/api-bot-whatsapp.md`. Empat endpoint di sini
ditambahkan setelah pihak bot menunjukkan bahwa kontrak awal berhenti di
pengajuan — sehingga pinjaman dari bot tidak bisa dicairkan, tidak bisa dibayar,
dan tidak bisa ditagih.

Semua endpoint memakai dasar yang sama: base URL
`https://academic-rooster-210.convex.site`, header
`Authorization: Bearer <BOT_API_KEY>`, body JSON.

---

## Ringkasan seluruh endpoint

| Endpoint | Metode | Menyentuh uang? |
| --- | --- | --- |
| `/bot/daftar` | POST | tidak |
| `/bot/unggah-url` | POST | tidak |
| `/bot/status` | GET | tidak |
| `/bot/tagihan` | GET | tidak (baca saja) |
| `/bot/kyc` | POST | tidak |
| `/bot/pengajuan` | POST | tidak (mengajukan) |
| `/bot/pencairan` | POST | **ya** |
| `/bot/pembayaran` | POST | **ya** |

---

## 5. `GET /bot/tagihan?nomor=`

Menjawab pertanyaan yang paling sering datang lewat WhatsApp: "berapa yang harus
saya bayar".

**Response**

```json
{
  "ok": true,
  "userId": "jx7...",
  "tarifDendaPerHari": 2,
  "pinjaman": [
    {
      "nomorReferensi": "PGD-20261021-29U3",
      "status": "didanai",
      "ringkasan": {
        "jumlahAngsuran": 1,
        "lunas": 0,
        "menungguVerifikasi": 0,
        "terlambat": 1,
        "jatuhTempoHariIni": 0,
        "totalKewajiban": 3900000,
        "totalDibayar": 0,
        "sisaTagihan": 4500000,
        "dendaBerjalan": 600000,
        "semuaLunas": false,
        "berikutnya": {
          "nomor": 1,
          "jatuhTempoPada": 1794998961963,
          "total": 3900000,
          "dendaBerjalan": 600000
        }
      }
    }
  ]
}
```

Pinjaman berjalan lebih dulu; di dalamnya tagihan terdekat lebih dulu.
`tarifDendaPerHari` disertakan supaya bot bisa **menjelaskan** dendanya
("terlambat 10 hari × 2%/hari"), bukan sekadar menyebut angka.

---

## 6. `POST /bot/pencairan`

Menandai pinjaman tersalurkan. Ini yang membuat pinjaman berstatus `didanai`,
punya jadwal angsuran, dan mulai ditagih.

**Request**

```json
{ "nomorReferensi": "PGD-20261128-A1B2", "catatan": "opsional" }
```

**Response**

```json
{ "ok": true, "sudah": false, "nomorReferensi": "PGD-20261128-A1B2" }
```

`sudah: true` berarti pinjaman itu memang sudah didanai sebelumnya — permintaan
ulang tidak membuat jadwal angsuran kedua.

### Yang terjadi di server

Pencairan **bukan** sekadar ubah status. Ia:

1. Memeriksa pinjaman masih di tahap tinjauan
2. **Memeriksa ada penyedia dana** (lihat peringatan di bawah)
3. Mencatat persetujuan perjanjian dari pengajuan
4. Mengubah status → `didanai`, mengisi `didanaiPada`
5. Mencatat sumber dana pendana
6. **Membuat jadwal angsuran** lewat `pastikanAngsuran`
7. Menulis audit berlabel `bot-whatsapp` dengan aksi `pencairan_dari_bot`
8. Mengirim notifikasi WhatsApp status + rincian resmi ke nasabah

### Peringatan: pinjaman tanpa pendana ditolak

```
"Pinjaman ini belum punya penyedia dana, jadi tidak akan muncul di ruang
pendana mana pun. Tetapkan pendananya lebih dulu, lalu tandai dana tersalurkan."
```

Itu aturan bisnis, bukan bug — uang harus dari sumber yang jelas. Tampilkan
pesannya apa adanya; admin perlu tahu pinjaman mana yang belum ada pendananya.

---

## 7. `POST /bot/pembayaran`

Mencatat pembayaran yang sudah diterima. Server memilih sendiri jalur yang benar
berdasarkan data pinjaman:

| Skema pinjaman | Yang terjadi |
| --- | --- |
| Harian (`tenorHari`) | Pelunasan menutup pinjaman sekaligus |
| Bulanan (`tenorBulan`) | Cicilan mengisi baris `angsuran` yang sesuai |

Bot **tidak perlu** tahu bedanya — cukup kirim nominalnya.

**Request**

```json
{
  "nomorReferensi": "PGD-20261128-A1B2",
  "referensi": "MUTASI-BCA-20261128-001",
  "jumlah": 4500000,
  "tanggal": 1795000000000,
  "catatan": "opsional"
}
```

| Field | Wajib | Keterangan |
| --- | --- | --- |
| `nomorReferensi` | ya | Nomor pinjaman |
| `referensi` | ya | **Kunci idempotensi** 4–128 karakter, mis. nomor mutasi bank |
| `jumlah` | ya | Rupiah bulat positif — **uang yang benar-benar diterima** |
| `tanggal` | tidak | Epoch ms; bawaan sekarang |
| `catatan` | tidak | Maks 500 karakter |

**Response sukses — 200**

```json
{ "ok": true, "nomorReferensi": "PGD-20261128-A1B2", "jalur": "harian", "ulangan": false }
```

`ulangan: true` berarti kunci `referensi` itu sudah pernah dipakai — hasil yang
dikembalikan adalah hasil pertama, **bukan** pembayaran kedua.

**Response nominal tidak cocok — 409**

```json
{
  "ok": false,
  "alasan": "sebagian",
  "jalur": "harian",
  "totalDue": 4500000,
  "dibayar": 2000000,
  "kurang": 2500000,
  "lebih": 0,
  "pesan": "Nominal mutasi Rp2.000.000 tidak sama dengan total pelunasan Rp4.500.000 (...)."
}
```

Nominal harus **sama persis** — sistem tidak menerima pembayaran sebagian.
Gunakan field `kurang` untuk memberi tahu nasabah berapa lagi yang harus
ditransfer.

### Idempotensi

Kunci `referensi` disimpan per peminjam di tabel `idempotencyKeys`. Kalau bot
mengirim ulang karena jaringan putus, **pakai kunci yang sama** — jangan
membuat kunci baru, karena itu akan tercatat sebagai pembayaran kedua.

---

## 8. `POST /bot/kyc`

Mengumpulkan KYC lewat WhatsApp supaya nasabah tidak perlu pindah ke website.

**Request**

```json
{
  "nomor": "08123456789",
  "namaLengkap": "Budi Santoso",
  "nik": "3273012345678901",
  "alamat": "Jl. Contoh No. 1, Bandung",
  "pekerjaan": "Karyawan swasta",
  "penghasilanBulanan": 5000000,
  "sumberPenghasilan": "Gaji bulanan",
  "namaBank": "BCA",
  "nomorRekening": "1234567890",
  "ktpId": "kg2b2400...",
  "selfieKtpId": "kg20m6hb...",
  "buktiPenghasilanId": "kg20nk44...",
  "persetujuan": true,
  "namaKontakDarurat": "opsional",
  "nomorKontakDarurat": "opsional",
  "hubunganKontakDarurat": "opsional"
}
```

**Response**

```json
{ "ok": true, "status": "PENDING_REVIEW" }
```

### Yang penting

| Hal | Keterangan |
| --- | --- |
| `persetujuan` | **Wajib `true`**, dan bot harus **benar-benar menanyakannya** ke nasabah |
| 3 berkas | `ktpId`, `selfieKtpId`, `buktiPenghasilanId` — hasil `PUT` dari `/bot/unggah-url` |
| Status akhir | `PENDING_REVIEW` — **bukan** disetujui |
| Verifikasi | Tetap dilakukan admin di panel website |

Bot **tidak boleh** mengirim `persetujuan: true` tanpa bertanya. Server mencatat
waktu dan versi persetujuan sebagai jejak audit kalau ada sengketa.

Setelah KYC berstatus `VERIFIED` oleh admin, `/bot/pengajuan` baru bisa dipakai.

---

## Alur lengkap setelah semua endpoint ada

```
1. Nasabah: "AJUKAN 2 JUTA"
2. Bot: GET /bot/status          -> sudah terdaftar?
   - belum: POST /bot/daftar
3. Bot: GET /bot/kyc?             (cek melalui /bot/status atau tanya admin)
   - belum: kumpulkan data + 3 foto -> POST /bot/kyc -> PENDING_REVIEW
   - tunggu admin verifikasi
4. Bot: POST /bot/pengajuan      -> nomorReferensi
5. Bot: POST /bot/pencairan      -> menunggu pendana ditetapkan admin
   (atau admin mencairkan dari panel)
6. Bot: GET /bot/tagihan         -> berapa yang harus dibayar
7. Bot: POST /bot/pembayaran     -> catat pembayaran, 409 bila nominal beda
```

---

## Tabel masalah (tambahan)

| Gejala | Sebab | Tindakan |
| --- | --- | --- |
| `409` `alasan: "sebagian"` | Nominal tidak sama persis | Beri tahu nasabah `kurang` atau `lebih` |
| `400` "belum punya penyedia dana" | Pinjaman belum ada pendananya | Admin harus menetapkan pendana dulu |
| `400` "KYC belum terverifikasi" | KYC belum disetujui admin | Kirim lewat `/bot/kyc`, tunggu verifikasi |
| `400` persetujuan | `persetujuan` bukan `true` | Bot harus menanyakan persetujuan ke nasabah |
| `ulangan: true` | Kunci idempotensi dipakai ulang | Normal — jangan buat kunci baru untuk pembayaran yang sama |

---

## Berkas terkait

| Berkas | Isi |
| --- | --- |
| `src/convex/botApi.ts` | Daftar, status, tagihan, pencarian nomor |
| `src/convex/botBayar.ts` | Pemilihan jalur harian/bulanan + idempotensi |
| `src/convex/botKyc.ts` | Pengumpulan KYC lewat bot |
| `src/convex/http.ts` | Semua route `/bot/*` |
| `src/convex/botUang.convex.test.ts` | 5 tes tagihan & pencairan |
| `src/convex/botBayar.convex.test.ts` | 3 tes pembayaran |
| `src/convex/botApi.convex.test.ts` | 10 tes daftar, status, helper |
