# PPOB publik & koneksi H2H server pulsa

Etalase `/ppob` menjual pulsa, paket data, token listrik, voucher game, dan saldo
e-wallet sebagai **penjualan tunai**. Ini bukan pinjaman dan bukan akad
murabahah: katalog syariah tetap terpisah, dengan margin akadnya sendiri.

## Alur uang

1. Pembeli memilih produk di `/ppob`, mengisi nomor tujuan dan WhatsApp.
2. Server membuat pesanan dengan **harga dan laba yang dibekukan**.
3. Pembeli transfer ke rekening usaha yang tercantum di `/ppob/pesanan/:kode`.
4. Admin membuka **Admin → Operasional → PPOB Publik** dan memverifikasi
   transfer: nominal harus sama dengan tagihan, referensi mutasi bank wajib.
5. Setelah yakin, admin menekan **Proses** untuk mengirim topup ke H2H.
6. Server menyimpan status, dan halaman pembeli ikut berubah.
7. Webhook provider mempercepat status akhir; cron tiap 10 menit memeriksa
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

Produk prabayar masuk ke lima kategori PINDAI, sedangkan produk pascabayar
(BPJS, PDAM, PLN pascabayar) diambil lewat `cmd: "pasca"`. Produk pascabayar
memakai alur cek tagihan: `commands: "inq-pasca"` lebih dulu, lalu
`pay-pasca` dengan `ref_id` yang sama.

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

### 3. `POST /tagihan` (khusus pascabayar)

```json
{ "refId": "PDB…", "kode": "BPJS-KES", "nomorTujuan": "0001234567890" }
```

Balas dengan `namaPelanggan`, `periode`, `nominal`/`nilai_tagihan`, `admin`, dan
`price` (biaya yang ditarik provider dari deposit). `refId` yang sama wajib
dipakai saat membayar tagihan. Digiflazz memakai endpoint `/transaction` dengan
`commands: "inq-pasca"`.

### 4. `POST /transaksi`

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

### 5. `GET /transaksi/:refId`

Dipakai cron dan tombol **Cek**. Balas dengan bentuk yang sama seperti
`POST /transaksi`.

### 6. Webhook (opsional tetapi disarankan)

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

## Verifikasi pembayaran dan nomor seri

- Kode pesanan baru memakai 12 karakter base32 dan dicek unik sebelum disimpan.
  Kode lama tetap bisa dilacak lewat halaman status.
- Halaman status publik TIDAK menampilkan `sn`. Pembeli membukanya dengan 4 digit
  terakhir nomor tujuan; 5 percobaan salah mengunci pembukaan selama 15 menit.
  Salinan nomor seri tetap dikirim ke WhatsApp pembeli.
- Admin wajib mengisi nominal diterima dan referensi mutasi bank saat verifikasi.
  Nominal harus sama persis dengan tagihan, dan satu referensi hanya boleh dipakai
  untuk satu pesanan. Verifikasi tidak lagi langsung mengirim topup — tekan
  **Proses** secara terpisah setelah yakin.
- Refund hanya dari pesanan `gagal` yang pernah dibayar (atau `diproses` dengan
  bukti kegagalan), dan wajib menyertakan referensi transfer balik. Pesanan
  `sukses` tidak bisa direfund.
- Verifikasi TOTP admin dikunci 15 menit setelah 5 kode salah.

## Pascabayar (BPJS, PDAM, PLN)

1. Pembeli mengisi nomor pelanggan, lalu menekan **Cek tagihan**.
2. Server bertanya ke provider dan menyimpan hasilnya di `ppobTagihan` selama
   15 menit. Peramban hanya menerima token, bukan hak menentukan nominal.
3. Setelah tagihan tampil, pembeli membuat pesanan. `refId` pesanan sama dengan
   `refId` cek tagihan supaya provider membayar tagihan yang tadi dilihat.
4. Setelah admin memverifikasi transfer, **Proses** mengirim `pay-pasca`.

Biaya platform adalah biaya admin tetap per tagihan (diatur di panel), bukan
persen dari nominal. Bila biaya yang ditarik provider lebih besar, biaya admin
otomatis dinaikkan agar platform tidak menjual di bawah modal.

## Pengamanan dan rekonsiliasi

- **Turnstile**: bila `VITE_TURNSTILE_SITE_KEY` dan `TURNSTILE_SECRET_KEY` diisi,
  setiap pembeli harus lolos verifikasi. Pas terikat hash perangkat dan hanya
  berlaku sekali; cek tagihan memakai pas tanpa menghabiskannya.
- **Batas per perangkat**: maksimal 3 pesanan belum dibayar per jam dan jeda
  30 detik antar pesanan. Hash perangkat dibuat dari ID acak peramban, bukan
  sidik jari.
- **Rekening operasional PPOB**: isi nama, bank, dan nomor di panel. Bila kosong,
  halaman pembayaran memakai rekening usaha utama. Rekening angsuran tidak ikut
  berubah.
- **Rekonsiliasi**: setiap 00.05 WIB server membandingkan saldo provider dengan
  saldo buku (saldo akhir sebelumnya + deposit manual - modal pesanan yang sudah
  dikirim). Selisih di atas Rp 10.000 dikabarkan ke WhatsApp admin. Riwayat dan
  tombol **Periksa** ada di tab Pengaturan.
- **Aksi sensitif**: verifikasi pembayaran, refund, dan penerapan markup massal
  mengirim pesan WhatsApp ke admin yang sama.

## Batas yang disengaja

- Pembayaran masih manual (transfer/QRIS) dan diverifikasi admin. Belum ada
  payment gateway otomatis.
- Rekonsiliasi memakai pesanan `diproses` dan `sukses`; pesanan yang gagal
  sebelum dikirim tidak mengurangi saldo provider.
- Saldo deposit tidak bisa ditarik dari aplikasi; isi deposit di dashboard
  provider.
- Refund tidak otomatis; admin menandainya setelah transfer balik benar-benar
  dilakukan.
