# DESIGN.md — arah visual PINDAI

> **Catatan jujur, jangan dilewati.** Arah di berkas ini ditulis oleh **agen, bukan pemilik produk**.
> Gaya karangan agen cenderung jatuh ke rasa AI bawaan — gradien biru-ungu, kaca di mana-mana,
> kartu fitur seragam, angka statistik yang tidak berdasar — yaitu persis slop yang disaring
> `antislop.md`. Jadi perlakukan ini sebagai **titik tolak yang cenderung monoton**, bukan
> kebenaran yang sudah dicicipi mata manusia. Tajamkan atau ganti begitu pemilik produk menulis
> arahnya sendiri; jangan pernah menambah janji produk ke berkas ini.

## Brief dari pemilik produk

Tiga jawaban ini berasal dari **pemilik produk**, bukan dari agen, dan menang atas arah karangan
agen di bagian mana pun yang berbenturan dengannya:

- **Produk:** keseluruhannya — pinjam, gadai, ruang Pendana, dan meja kerja admin/QC.
- **Audiens prioritas:** nasabah peminjam / penggadai. Kalau dua pilihan saling menekan, yang menang
  adalah pilihan yang memudahkan nasabah memahami biaya dan menyelesaikan pengajuan.
- **Mood:** koperasi digital — hangat, ramah, membumi.

## Identitas

PINDAI adalah layanan **pinjam dan gadai digital** untuk orang yang butuh dana cepat tanpa akses
bank yang nyaman, **plus** ruang bagi Pendana terverifikasi dan meja kerja admin/QC. Satu produk,
tiga pembaca: nasabah peminjam, Pendana, petugas — dengan **nasabah peminjam sebagai pembaca
pertama**: dialah yang datang dalam keadaan terdesak dan paling sering tersesat di istilah.

Yang harus terasa saat dibuka: **ini koperasi yang mencatat dan mengenal anggotanya.** Ada urutan,
ada angka yang bisa ditelusuri, ada tanda tangan — tapi juga ada orang yang menjelaskan, bukan
formulir yang membentak. Bukan aplikasi yang menjanjikan cepat kaya, dan bukan kalkulator dingin.

## Kepribadian

- **Benar:** *membumi* (bahasa sehari-hari, istilah dijelaskan di tempat, tidak ada jarak
  korporat), *hangat* (kertas hangat dan sapaan manusia, bukan putih lab dan robot), *tertib*
  (baris rapi, satuan jelas, angka rata), *terang-terangan* (biaya, potongan, dan status ditulis
  apa adanya, sebelum tanda tangan).
- **Hindari:** *mewah palsu* (emas berkilau, kaca premium, tanpa isi), *renyah ala startup*
  (emoji, bahasa gaul di layar uang), *dingin-korporat tanpa penulis* (teks generik yang bisa
  ditempel ke produk apa pun).

## Palet

Bahasa warna tunggal: **tinta & kuningan**. Hijau tinta tua = lembaga & aksi; kuningan = nilai
uang dan status positif; netral = kertas hangat, bukan abu-abu SaaS.

| Peran | Token | Nilai |
|---|---|---|
| Permukaan | `--background`, `--card` | `#ffffff` |
| Tinta teks | `--foreground` | `#1c1a15` |
| Brand / aksi utama | `--primary`, `--navy` | `#0f3d3a` |
| Fokus | `--ring` | `#1f6a62` |
| Kuningan (uang, hasil positif) | `--gold` | `#9c7b3a` |
| Kertas (isian sekunder) | `--secondary`, `--accent` | `#f1ede3` |
| Netral lembut | `--muted`, `--muted-foreground` | `#f8f6f1` / `#6b6455` |
| Garis | `--border` | `#e3ddd0` |

Skala utilitas dipetakan ulang di `src/index.css` supaya tidak ada warna yang lolos: `sky` → hijau
tinta, `slate` → netral kertas hangat, `emerald` → kuningan, `amber` → oranye bata, `red` → merah
bata. Lima preset tema resmi — `tinta` (bawaan), `pesisir`, `terakota`, `salju`, `karnival` —
diaktifkan lewat `data-theme` pada `:root`; arah ini tidak menambah warna keenam.

## Tipografi

Tidak ada webfont: tumpukan font sistem, dengan **angka selalu `tabular-nums`** supaya kolom rupiah
rata dan tidak melompat saat nilainya berubah. Teks judul pendek dan tegas; badan teks lebar baca
nyaman; label kecil memakai huruf besar berspasi lebar hanya untuk judul kolom — bukan hiasan di
setiap baris. Nama berkas, nomor referensi, dan NIK bertopeng memakai huruf monospace.

## Mood dan rujukan

- **Rujukan rasa utama — koperasi digital.** Ruang bersama yang anggotanya dikenal dengan nama:
  petugas menjelaskan, angka ditunjukkan, tidak ada dinding kaca antara lembaga dan orang. Hangat
  dan membumi, tapi tetap tertib karena ini uang.
- **Ekspresi visualnya** diambil dari buku besar pegadaian tua: kertas hangat, garis tinta, cap
  kuningan, tulisan yang rapi. Bukan "koperasi jadul": tetap layar modern, hanya tidak dingin.
- **Tidak boleh muncul:** gradien ungu-biru, glow neon, kaca tembus pandang tanpa alasan, emoji di
  layar uang, lencana "AI-powered", angka atau testimoni yang tidak berasal dari data nyata.

## Dial

`Dial: ENERGY 2 / RHYTHM 2 / MOTION 2`

Alasannya: produk uang yang harus dipercaya tidak boleh berteriak seperti portofolio agensi
(ENERGY 3), tapi juga tidak boleh sedatar halaman pemerintah (ENERGY 1) karena nasabah datang
dalam keadaan terdesak dan butuh satu jalan yang jelas. Halaman berubah bentuk antar bagian
(hero → rincian biaya → unggah dokumen → buku besar admin) tapi tetap satu keluarga (RHYTHM 2).
Gerak dipakai untuk menjelaskan kedatangan dan perubahan (RHYTHM/MOTION 2), bukan untuk menghibur
— mood koperasi digital menuntut kehangatan yang datang dari bahasa dan kertas, bukan dari gerakan
yang ramai.

## Tuas

- **Satu titik fokus per layar.** Di halaman pengajuan, titik fokusnya nominal dan biaya; di
  antrean admin, nomor referensi yang sedang dibuka. Sisanya menyerah pada fokus itu.
- **Hierarki lewat berat dan ukuran**, bukan lewat warna tambahan. Satu layar, satu aksen kuningan.
- **Ruang kosong sebagai struktur**: jarak yang memisahkan satu blok dari blok lain, bukan sisa
  ruang. Baris buku besar lebih rapat daripada kartu pemasaran.
- **Motif identitas:** garis buku besar — aturan 1px bernuansa kuningan sebagai pemisah antar
  baris data, dan setiap angka ditulis rata kanan dengan `tabular-nums`. Motif ini diulang di
  semua permukaan, jadi tidak ada layar yang bisa dipindahkan ke produk lain tanpa terbaca aneh.
- **Gerak:** kemunculan saat menggulir di halaman publik, transisi pada perubahan status dan
  terbukanya dialog `200ms`–`400ms`, tanpa animasi berulang tanpa sebab. Hormati
  `prefers-reduced-motion` (repo sudah melakukannya).

## Batas yang tidak bisa ditawar

Arah ini tidak memberi izin untuk melanggar `antislop.md`. Empat hal yang benar di produk ini dan
harus tetap benar:

1. **Nol data palsu.** Kosong berarti kosong, dengan penjelasan mengapa kosong dan apa langkah
   berikutnya. Tidak ada angka, testimoni, atau aktivitas karangan.
2. **Biaya terbaca sebelum tanda tangan.** Semua potongan dan bunga tampil sebagai angka, bukan
   di balik "mulai dari".
3. **Keadaan lengkap.** Setiap daftar punya keadaan memuat, kosong, galat, dan berhasil yang
   dirancang, bukan spinner bawaan.
4. **Satu makna kata.** Istilah uang, status, dan dokumen dipakai persis sama di layar, kontrak,
   notifikasi, dan meja admin.
