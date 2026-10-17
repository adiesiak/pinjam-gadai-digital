# Pratinjau Super Admin — "masuk sebagai" pendana & peminjam

Super Admin dapat membuka aplikasi **sebagai** satu akun pendana atau peminjam,
untuk melihat persis apa yang akun itu lihat: ruang pendana miliknya sendiri
(`/penyedia-dana`) atau dashboard peminjam (`/dashboard`). Ini bukan tampilan
tiruan dan bukan ringkasan versi admin — peramban admin benar-benar memakai
**sesi nyata akun itu**.

## Dari mana dibuka

| POV | Pintu masuk |
| --- | --- |
| Pendana | Tab **Nasabah & Pendana → Manajemen Akun & Hak Akses**, kolom *Tindakan* pada baris akun → **Masuk sebagai** |
| Peminjam | Tab **Plafon Nasabah**, tombol **Masuk sebagai** pada baris nasabah; juga dari dialog **Profil** nasabah |

Setiap tombol membuka konfirmasi yang menyebut akun tujuan, ruang yang akan
dibuka, dan bahwa sesi admin disimpan sehingga bisa dikembalikan. Kolom *alasan*
opsional dan ikut ke Audit Trail.

### Mode Nasabah di `/dashboard`

Admin yang membuka `/dashboard` tidak mendapat dashboard nasabah kosong,
melainkan layar **Mode Nasabah**: satu kotak pencarian akun nasabah dan tombol
**Masuk sebagai** per baris. Layar ini dipakai untuk menguji alur nasabah dari
awal sampai akhir (pengajuan, KYC, kontrak, pembayaran) tanpa harus mencari
akunnya lebih dulu di panel.

- Yang ditawarkan hanya akun **peminjam** dan pendaftar baru yang belum punya
  peran. Akun pendana tetap dibuka dari Manajemen Akun, dan akun admin memang
  tidak bisa dipratinjau.
- Pencarian mencocokkan nama, email, kode nasabah, NIK, dan nomor WhatsApp.
  Dari kelima field itu, **NIK dan nomor WhatsApp tidak dikirim ke peramban** —
  keduanya hanya dipakai server untuk mencocokkan, sementara layar menampilkan
  nama, email, kode, status KYC, penanda data diri, dan riwayat pengajuan.
- `pratinjau.cariNasabahUji` tidak menambah izin apa pun: ia hanya membaca daftar
  untuk admin, dan sesi yang belum lolos TOTP mendapat `siap: false` (layar
  menampilkan langkah verifikasi) alih-alih galat. Tiket tetap hanya terbit dari
  `mintaTiket`.

## Cara kerjanya

1. `pratinjau.mintaTiket` (convex/pratinjau.ts) menerbitkan **tiket sekali pakai**
   berumur 5 menit. Mutation ini hanya dilayani `requireAdminSession` — peran
   admin **dan** bukti TOTP pada sesi Auth yang sedang dipakai.
2. Provider `pratinjau-admin` (convex/auth/pratinjau.ts) menukar tiket menjadi
   sesi akun target, lalu peramban dimuat ulang ke ruang akun itu.
3. Sesi pratinjau dibuat server, **bukan** oleh `signIn` bawaan Convex Auth:
   jalur bawaan menghapus sesi pemanggil (yaitu sesi admin), sehingga admin harus
   memasukkan kata sandi + TOTP lagi setiap kali selesai mempratinjau. Sesi
   pratinjau juga berumur paling lama 2 jam.
4. Bilah **Mode pratinjau** selalu tampil di atas layar selama pratinjau, memuat
   akun yang sedang dibuka, admin pembukanya, dan batas waktunya, plus tombol
   **Kembali ke Mode Admin**.

## Kembali ke Mode Admin

Token sesi admin disalin ke `localStorage` sebelum sesi berpindah (lib/pratinjau.ts)
dan ditulis kembali saat tombol kembali ditekan; sesi pratinjau di akun target
ditutup dan dicatat. Bila penyimpanan lokal diblokir peramban, **pratinjau tidak
dijalankan sama sekali** — pratinjau tanpa jalan pulang lebih buruk daripada
tidak mempratinjau.

## Pagar yang dijaga server

- Hanya admin dengan sesi TOTP terverifikasi yang bisa menerbitkan tiket.
- Tiket berumur pendek, sekali pakai, dan divalidasi ulang saat ditukar.
- Akun tim (admin) tidak dapat dipratinjau; akun tamu juga tidak, karena sesinya
  terikat perangkat, bukan akun.
- Paling banyak 3 pratinjau aktif per admin.
- Awal dan akhir pratinjau masuk **Audit Trail** dengan nama admin sebagai
  aktornya (`pratinjau_mulai`, `pratinjau_selesai`, `pratinjau_diakhiri_admin`).
- Kartu **Pratinjau Aktif** (tab Nasabah & Pendana) memperlihatkan pratinjau yang
  masih hidup dan bisa **mengakhiri paksa** dari panel; itu mencabut sesi hasil
  pratinjau, sementara sesi sungguhan milik pemilik akun tidak tersentuh.

## Yang perlu diketahui

- Pratinjau berlaku untuk SELURUH peramban itu, bukan satu tab: token sesi
  disimpan per-origin, dan tab lain yang sedang terbuka ikut berpindah sesi.
  Buka pratinjau dari peramban yang tab adminnya tidak sedang dipakai, atau
  segarkan tab lain sesudahnya.
- Selama pratinjau, tindakan dari peramban itu tercatat atas nama akun target —
  sama seperti bila akunnya sendiri yang menekan tombolnya. Karena itu awal dan
  akhir pratinjau selalu meninggalkan jejak auditori.
- Batas 2 jam adalah batas *pembaruan* sesi: token yang sudah terbit tetap
  berlaku sampai JWT-nya kedaluwarsa (masa JWT bawaan Convex Auth), jadi batas
  ini bukan pemutus instan. Untuk memutus segera, gunakan **Akhiri pratinjau**
  di panel.
- Peramban pratinjau mendaftar sebagai sesi perangkat akun target, sehingga
  daftar "Sesi saya" akun itu memuatnya sampai batas waktunya. Menggugurkan sesi
  dari sisi akun target **tidak** memutus pratinjau (pengguguran sesi di aplikasi
  ini hanya memaksa logout untuk akun ber-TOTP, dan akun target bukan admin).
  Yang benar-benar memutusnya: **Akhiri pratinjau** dari panel admin — itu
  menghapus sesi Auth hasil pratinjau sehingga peramban itu tidak bisa lagi
  memperbarui tokennya.
