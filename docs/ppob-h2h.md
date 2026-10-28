# PPOB publik & koneksi H2H server pulsa

Etalase `/ppob` menjual pulsa, paket data, token listrik, voucher game, dan saldo
e-wallet sebagai **penjualan tunai**. Ini bukan pinjaman dan bukan akad
murabahah: katalog syariah tetap terpisah, dengan margin akadnya sendiri.

## Alur uang

1. Pembeli memilih produk di `/ppob`, mengisi nomor tujuan dan WhatsApp.
2. Server membuat pesanan dengan **harga dan laba yang dibekukan**.
3. Pembeli transfer ke rekening usaha yang tercantum di `/ppob/pesanan/:kode`.
4. Admin membuka **Admin → Operasional → PPOB Publik**, menekan
   **Verifikasi & proses**.
5. Server memanggil H2H, menyimpan status, dan halaman pembeli ikut berubah.
6. Webhook provider mempercepat status akhir; cron tiap 10 menit memeriksa
   pesanan yang masih `diproses` dengan `ref_id` yang sama.

Laba = `hargaJual - hargaModal`, dicatat per pesanan. Tidak ada jurnal pinjaman
yang tersentuh.

## Environment

| Variabel | Wajib | Isi |
|---|---|---|
| `PPOB_H2H_API_KEY` | ya | API key/rahasia server pulsa. Jangan pernah ditempel di panel. |
| `PPOB_H2H_USERNAME` | opsional | Username H2H bila tidak diisi di panel. Nilai panel menang. |
| `PPOB_H2H_WEBHOOK_SECRET` | disarankan | Rahasia HMAC webhook. Tanpa ini endpoint webhook menolak semua permintaan. |

Isi lewat menu **Keys / API keys** pada proyek. Panel hanya melaporkan
"Terpasang" atau "Belum diisi"; nilainya tidak pernah dikirim ke peramban.

Webhook: `https://<deployment>.convex.site/ppob/webhook`. Panel menampilkan URL
lengkapnya bila `CONVEX_SITE_URL` terbaca.

## Provider Digiflazz

Pilih provider **Digiflazz**, isi username, biarkan alamat kosong. Adaptor
memakai endpoint resmi:

- `POST /v1/price-list` — `cmd: "prepaid"`, `sign = md5(username + apiKey + "pricelist")`
- `POST /v1/cek-saldo` — `cmd: "deposit"`, `sign = md5(username + apiKey + "depo")`
- `POST /v1/transaction` — `sign = md5(username + apiKey + ref_id)`

Hanya produk prabayar yang masuk ke lima kategori PINDAI. Produk pascabayar
(PDAM, BPJS, TV pascabayar) sengaja belum diambil karena butuh pemeriksaan
tagihan sebelum pembayaran, bukan satu kolom nomor.

Webhook Digiflazz mengirim `X-Hub-Signature: sha1=<hmac>`; yang diverifikasi
adalah **body mentah** dengan `PPOB_H2H_WEBHOOK_SECRET` sebagai kunci
HMAC-SHA1.

## Provider kustom (server pulsa sendiri)

Pilih provider **Server pulsa sendiri** dan isi alamat HTTPS. Server harus
menyediakan tiga endpoint berikut. Semua respons JSON, autentikasi
`Authorization: Bearer <PPOB_H2H_API_KEY>`.

### 1. `GET /produk`

```json
{
  "produk": [
    {
      "kode": "TSEL10",
      "nama": "Telkomsel 10.000",
      "kategori": "pulsa",
      "operator": "Telkomsel",
      "harga": 9850,
      "aktif": true,
      "stok": 25
    }
  ]
}
```

`kategori` menerima `pulsa`, `data`, `token-listrik`, `game`, `ewallet` (atau
penamaan Digiflazz seperti `Pulsa`, `Paket Data`, `E-Money`, `Games`, `PLN`).
`harga` adalah harga modal untuk PINDAI, rupiah bulat. Produk tanpa kategori
yang dikenal, tanpa kode, atau dengan harga nol dibuang.

### 2. `GET /saldo`

```json
{ "saldo": 1500000 }
```

### 3. `POST /transaksi`

```json
{
  "refId": "PDBMG7XK2AB12CD34",
  "kode": "TSEL10",
  "nomorTujuan": "081234567890"
}
```

Balasan status:

```json
{ "status": "Sukses", "sn": "SN-123", "pesan": "Transaksi Sukses" }
```

`status` menerima `Sukses`/`success`, `Pending`, atau `Gagal`/`failed` (tidak
peka huruf besar-kecil). Status yang tidak dikenal dianggap masih diproses.

### 4. `GET /transaksi/:refId`

Dipakai cron dan tombol **Cek**. Balas dengan bentuk yang sama seperti
`POST /transaksi`.

### 5. Webhook (opsional tetapi disarankan)

`POST https://<deployment>.convex.site/ppob/webhook`

Header `X-Hub-Signature: sha1=<hex>`, dengan
`hex = HMAC-SHA1(body_mentah, PPOB_H2H_WEBHOOK_SECRET)`. Body:

```json
{
  "data": {
    "ref_id": "PDBMG7XK2AB12CD34",
    "status": "Sukses",
    "rc": "00",
    "sn": "SN-123",
    "message": "Transaksi Sukses"
  }
}
```

## Status pesanan

| Status | Arti |
|---|---|
| `menunggu_bayar` | Belum ada transfer terverifikasi. Provider tidak boleh menyentuh pesanan ini. |
| `dibayar` | Transfer sudah diverifikasi admin. |
| `diproses` | Sudah dikirim ke provider, menunggu status final. |
| `sukses` | Produk terkirim. `sn` disimpan dan ditampilkan ke pembeli. |
| `gagal` | Provider menolak/gagal. Dana perlu dikembalikan manual. |
| `refund` | Admin menandai dana sudah dikembalikan. |

Status final tidak bisa dibalik oleh webhook yang datang terlambat.

## Markup

Harga jual dihitung `ceil((modal + max(markupMinimum, modal × markupPersen)) / 100) × 100`.
Nilai bawaan 5% dengan minimum Rp 500. Harga manual per produk dipertahankan
saat sinkron berikutnya selama masih menutup modal baru; bila modal naik
melewatinya, harga dihitung ulang agar tidak menjual rugi. Tombol **Terapkan
markup** menyeragamkan semua produk dan menghapus tanda manual.

Markup per kategori (Pulsa, Paket data, Token listrik, Game, E-wallet) bersifat
opsional dan **menggantikan** tarif global untuk kategori itu — bukan menambah
di atasnya. Kolom kosong berarti ikut global. Contoh wajar: pulsa 2%, paket
data 4%, token listrik 7%, game 10%, e-wallet 3%. Setelah mengubah tarif, buka
tab Produk dan tekan **Terapkan markup**; sinkron berikutnya juga memakai tarif
baru untuk produk yang belum dihargai manual.

## Notifikasi WhatsApp

Isi **WhatsApp admin** di tab Pengaturan (format `62…` tanpa `+`). Nomor itu
menerima ping saat pesanan baru dibuat dan alarm saat saldo provider turun di
bawah **Ambang alarm saldo**. Alarm dikirim paling sering sekali per 12 jam,
lewat gateway WhatsApp yang sama dengan pengingat pinjaman; bila gateway belum
aktif, percobaan tetap tercatat di `waLogs` dengan status `gagal`.

Pembeli menerima kabar otomatis saat pesanan berubah menjadi dibayar, diproses,
selesai (beserta nomor seri/token), gagal, atau refund. Kabar hanya dikirim saat
status benar-benar berubah, jadi webhook yang diulang tidak mengirim pesan ganda.

## Laporan

Tab **Laporan** menghitung omzet dan laba dari pesanan `sukses` saja, dipisah
hari ini (kalender WIB), bulan ini, dan per kategori. Daftar gagal/refund ikut
ditampilkan, dan seluruh rekap bisa diunduh sebagai CSV. Angka bulan ini dibaca
dari maksimal 3.000 pesanan terbaru; bila batas itu tercapai, panel menampilkan
peringatan agar rekap dicocokkan dengan mutasi saldo provider.

## Batas yang disengaja

- Pembayaran masih manual (transfer/QRIS) dan diverifikasi admin. Belum ada
  payment gateway otomatis.
- Hanya produk prabayar. Pascabayar butuh alur cek tagihan tersendiri.
- Saldo deposit tidak bisa ditarik dari aplikasi; isi deposit di dashboard
  provider.
- Refund tidak otomatis; admin menandainya setelah transfer balik benar-benar
  dilakukan.
