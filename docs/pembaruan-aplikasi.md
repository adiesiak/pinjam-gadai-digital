# Pengingat Pembaruan Aplikasi

Satu versi APK diumumkan sekali, lalu dua kabar berangkat dari pengumuman itu:
**notifikasi di pusat notifikasi** setiap akun, dan **pesan WhatsApp** ke akun
yang punya nomor. Keduanya memakai data pengumuman yang sama, jadi isi pesan
tidak bisa berbeda dari apa yang diumumkan.

Tidak ada push notification: aplikasi belum punya kanal push
(lihat "Batasan yang diketahui" di `android/README.md`).

## Alur

1. Admin membuka **Meja Kerja → Aplikasi Android → Pengingat pembaruan
   aplikasi** dan mengisi `versionCode`, nama versi, tautan unduhan, catatan
   opsional.
2. **Umumkan versi** menulis satu baris `pembaruanAplikasi`. Sejak itu pusat
   notifikasi setiap akun non-tamu menampilkan `PINDAI x.y.z sudah bisa
   dipasang` dengan tautan ke `/#pasang-aplikasi`.
3. **Kirim ke N penerima** mengirim pesan WhatsApp bertahap (10 pesan per
   gelombang) sampai semua penerima yang belum menerima versi itu terkirim.

## Data

| Tabel | Isi |
| --- | --- |
| `pembaruanAplikasi` | Satu baris per versi yang diumumkan: `versiKode`, `versiNama`, `tautan`, `catatan`, `diumumkanPada`, `diumumkanOleh`. Indeks `by_versiKode`. |
| `pembaruanAplikasiWa` | Satu baris per (versi, akun): `nomor` ternormalisasi, `status` (`terkirim`/`gagal`), `respon` gateway (dipotong 200 karakter), `pada`. Indeks `by_versiKode`, `by_versiKode_userId`. |

Tidak ada tabel notifikasi baru. Pusat notifikasi tetap menghitung daftarnya
dari sumbernya (`convex/notifikasi.ts`, sumber 9), dan keadaan baca tetap di
`notifikasiBaca` dengan kunci `pembaruan:<versionCode>`.

## Aturan yang dijaga server

- **Hanya admin dengan sesi TOTP terverifikasi** yang bisa mengumumkan dan
  mengirim (`convex/pembaruanAplikasi.ts`).
- **Satu `versionCode`, satu pengumuman.** Mutation menolak kode yang sudah
  pernah diumumkan, dan tautan wajib alamat `http(s)` utuh agar bisa dibuka
  penerima WhatsApp.
- **Penerima** hanya akun non-admin, non-tamu, non-akun catatan admin, dengan
  nomor yang lolos normalisasi `62…`. Dua akun bernomor sama hanya menerima
  satu pesan; nomor rusak dihitung terpisah sebagai "tanpa nomor".
- **Kirim ulang tidak mengulang pesan.** Baris `terkirim` dilewati pada klik
  berikutnya; baris `gagal` dicoba lagi. Kegagalan gateway dicatat sebagai
  `gagal` beserta alasannya, bukan dianggap terkirim.
- **Pesan disusun server** dari data versi yang tersimpan, bukan dari argumen
  klien.
- Modul ini tidak memindahkan uang dan tidak mengubah data pinjaman.

## Hubungan dengan bilah pembaruan di dalam APK

APK yang sudah terpasang mengecek `public/version.json` sekali setiap dibuka
(ditulis oleh `android/build.sh`). Bilah hijau "PINDAI x.y.z tersedia" muncul
bila `versionCode` di berkas itu lebih besar dari versi terpasang.

Artinya, saat merilis versi baru ada dua langkah berbeda:

1. bangun dan unggah APK (`bash android/build.sh`) — ini yang mengubah
   `version.json`, sehingga aplikasi lama menampilkan bilah unduhan;
2. umumkan versi yang sama di panel di atas — ini yang mengabari pengguna lewat
   notifikasi dan WhatsApp.

Keduanya tidak bisa saling menggantikan: `version.json` berkas statis yang ikut
build, sedangkan pengumuman tersimpan di database dan bisa dikirim kapan saja.

## Uji

```bash
bun src/lib/pembaruanAplikasi.test.ts                                   # aturan murni
bunx vitest run src/convex/pembaruanAplikasi.convex.test.ts             # server + notifikasi
```

Tes Convex menjaga: pengumuman ganda ditolak, tautan relatif ditolak, non-admin
tidak bisa mengumumkan/mengirim, notifikasi muncul dengan kunci
`pembaruan:<kode>` dan bisa ditandai dibaca, penerima tersaring tanpa duplikat,
serta penerima yang sudah menerima dilewati pada gelombang berikutnya.
