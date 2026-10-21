# Laporan pendana lewat WhatsApp

Pendana menerima angka pendanaannya dalam **satu berkas PDF** yang dikirim ke
WhatsApp miliknya sendiri. Ada dua laporan untuk pendana, dan keduanya memuat
dua tingkat pembacaan: ringkasan angka portofolio di atas, lalu rincian per
pinjaman di bawahnya. Laporan ketiga adalah rekap internal seluruh pendana.

| Laporan | Dikirim saat | Penerima |
|---|---|---|
| **Pelunasan** (`laporan_pelunasan`) | Admin menandai satu pinjaman **lunas** (`loans.ubahStatusPinjaman`) | Pemilik kanonik pinjaman (`loans.pendanaId`) |
| **Kinerja pendanaan** (`laporan_portofolio`) | Pendana menekan **Kirim laporan ke WhatsApp** di ruang penyedia dana | Akun yang menekannya |
| **Rekap semua pendana** (`rekap_pendana`) | Super Admin menekan **Kirim rekap ke WhatsApp** di bagian Rekap Dana Pendana | Nomor yang ditulis admin saat itu |

Nomor tujuan dua laporan pendana selalu nomor yang **tersimpan di akun
penerima**. Aksi `laporanPendana.kirimLaporanPortofolio` tidak menerima argumen
nomor sama sekali, jadi laporan keuangan tidak bisa dialihkan ke nomor lain oleh
siapa pun yang menemukan tombolnya. Rekap seluruh pendana berbeda: ia milik
admin, bukan milik satu pendana, jadi nomor tujuannya ditulis admin setiap kali
mengirim, dan pengirimnya tetap tercatat di `waLogs`.

## 1. Dari mana nomornya

Nomornya **diisi sendiri oleh pendana** di ruang penyedia dana, bagian "Laporan
ke WhatsApp" (`components/penyediaDana/KontakLaporanWhatsapp.tsx`), dan disimpan
pada akunnya (`users.nomorWhatsApp`, mutation `penyediaDana.simpanKontakLaporan`):

- hanya akun berperan penyedia dana yang boleh menyimpan atau menghapusnya;
- nomor dinormalkan ke bentuk `62…` lewat aturan yang sama dengan seluruh
  aplikasi (`lib/otpWa`), jadi satu nomor tidak tersimpan dalam dua bentuk;
- mengosongkan isian **menghapus** nomornya. Sesudah itu tidak ada laporan yang
  dikirim sampai pemiliknya mengisinya lagi: lebih baik daripada mengirim
  laporan keuangan ke nomor lama yang mungkin bukan miliknya;
- panel admin (`UbahAkunPendanaDialog`) hanya mengurus nama dan email login.
  Nomor laporan tidak ada di sana, supaya tidak ada dua tempat yang bisa
  menentukan ke mana laporan pemilik akun dikirim.

Sebelum nomornya ada, kartu di ruang pendana menyatakannya terbuka ("Belum ada
nomor tersimpan, jadi tidak ada laporan yang dikirim ke mana pun") dan tombol
kirimnya terkunci.

## 2. Isi laporan

Angka laporan diambil dari `ruangPendana` di `convex/penyediaDana.ts` — query
yang sama dengan yang dirender di layar — sehingga tidak ada perhitungan uang
kedua yang bisa berbeda sedikit dari tampilan.| Bagian | Laporan pelunasan | Laporan kinerja | Rekap semua pendana |
| --- | --- | --- | --- |
| Ringkasan | hasil satu pinjaman: pokok, tanggal tersalurkan, tanggal lunas, keuntungan dibukukan, biaya platform (layanan) | dana tersalurkan, masih berjalan, keuntungan dibukukan, keuntungan perkiraan, total keuntungan, biaya platform, jumlah pinjaman | total seluruh pendana: jumlah pendana, jumlah pinjaman, dana tersalurkan, keuntungan dibukukan, perkiraan, biaya platform, transfer belum dicatat |
| Rincian | pinjaman yang bersangkutan (referensi, peminjam) | daftar **pinjaman berjalan** dan **pinjaman lunas**, satu baris per pinjaman | satu blok per pendana: jumlah pinjaman, dana tersalurkan, keuntungan dibukukan dan perkiraan, biaya platform |
| Keadaan transfer | apakah catatan transfer keuntungannya sudah dibuat admin | berapa pinjaman lunas yang catatan transfernya belum dibuat | jumlah pinjaman lunas yang catatan transfernya belum dibuat, per pendana |
| Nama peminjam | disamarkan | disamarkan | tidak dicantumkan |

Istilahnya sengaja sama persis dengan ruang penyedia dana ("Dana tersalurkan",
"Keuntungan dibukukan", "Keuntungan perkiraan", "Biaya platform (layanan)").

Dua batas yang perlu diketahui:

- daftar per pinjaman dicetak maksimal **25 baris per bagian**
  (`BATAS_PINJAMAN_LAPORAN`); sisa barisnya **disebutkan jumlahnya**, bukan
  dihilangkan diam-diam;
- laporan pelunasan hanya berangkat untuk pinjaman yang punya pemilik kanonik.
  Pinjaman warisan yang kepemilikannya hanya berupa nama **dilewati** — menebak
  akun dari nama berarti mengirim rincian keuangan ke orang yang salah.

## 3. Yang harus diatur pengelola

| Hal | Nilai | Wajib |
|---|---|---|
| Token gateway | `WHATSAPP_API_KEY` (atau `FONNTE_TOKEN`) di environment deployment Convex | Ya |
| Gateway | endpoint **Fonnte** (`https://api.fonnte.com/send`) bila laporan dikirim sebagai lampiran | Ya, untuk lampiran |
| Integrasi | aktif dengan endpoint yang lolos validasi di **Panel WhatsApp** admin | Ya |

Lampiran hanya dikirim ke endpoint Fonnte, yang mengenal field `url` (diambil
gateway dari URL publik) dan `filename` (nama yang dibaca penerima). Gateway lain
**ditolak dengan alasan yang bisa dibaca admin** — "Gateway yang diatur belum
mendukung lampiran berkas" — bukan dicatat "terkirim" padahal berkasnya tidak
ikut. Penolakan itu juga muncul di kartu ruang pendana saat ia meminta laporannya.

## 4. Jejak pengiriman dan umur berkas

- Setiap percobaan tercatat di `waLogs` dengan `jenis` `laporan_pelunasan`,
  `laporan_portofolio`, atau `rekap_pendana`, `loanId` (untuk pelunasan), dan
  `olehUserId`. Panel WhatsApp admin menampilkan label ramahnya dari
  `jenisRamahWa` (`lib/templatePesanWa.ts`).
- Status yang mungkin tercatat: `terkirim`, `gagal`, `tanpa_nomor` (nomor pemilik
  belum diisi), `dinonaktifkan` (integrasi WhatsApp belum aktif), `dilewati`
  (pinjaman tanpa pemilik kanonik).
- Berkas PDF disimpan di storage Convex hanya untuk sementara: ia dibuat, dipakai
  gateway, lalu **dihapus lewat penjadwalan setelah satu jam**
  (`RETENSI_BERKAS_MS`). URL berkas Convex adalah tautan yang berlaku sampai
  berkasnya dihapus, jadi membiarkannya berarti meninggalkan tautan ke laporan
  keuangan yang tidak bisa dicabut.
- Pesan WhatsAppnya pendek dan menunjuk lampirannya. Angka yang diulang panjang
  di pesan akan membuat dua versi angka beredar di percakapan, dan yang terakhir
  terlihat itu yang dibaca.

## 5. Di mana diuji

| Berkas | Yang dijaga |
|---|---|
| `src/lib/laporanPendana.test.ts` | isi laporan: istilah, rupiah, batas baris, tanpa tanda pisah panjang |
| `src/lib/pdfSederhana.test.ts` | penyusunan berkas PDF-nya |
| `src/components/penyediaDana/KontakLaporanWhatsapp.render.test.tsx` | keadaan kartu: belum ada nomor, tombol terkunci, kegagalan tampil apa adanya |
| `src/components/penyediaDana/RekapPendanaUnduhan.render.test.tsx` | keadaan tombol rekap: jumlah pendana, unduh tanpa nomor, kirim terkunci tanpa nomor, kegagalan tampil apa adanya |
| `src/convex/laporanPendana.convex.test.ts` | nomor milik akun, kiriman portofolio ke nomor sendiri, lampiran PDF, retensi berkas, pemicu pelunasan otomatis, rekap hanya untuk Super Admin |
| `scripts/qa-ruang-pendana.ts` | kartu terpasang hanya untuk pemilik portofolio, dan penjagaan nomor ada di sumbernya |
