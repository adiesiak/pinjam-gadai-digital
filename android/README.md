# PINDAI Android (APK)

Pembungkus WebView untuk aplikasi web PINDAI. Satu Activity, tanpa Gradle dan
tanpa AndroidX, sehingga build-nya hanya butuh JDK 17 + Android SDK
build-tools 34. Hasil build dipasang di repo sebagai `public/pindai.apk` dan
ditautkan dari tombol "Pasang aplikasi" di beranda.

## Isi folder

| Berkas | Peran |
| --- | --- |
| `AndroidManifest.xml` | Paket `id.pindai.app`, izin internet/lokasi/kamera, tema terang. |
| `src/id/pindai/app/MainActivity.java` | WebView + kamera (getUserMedia), GPS, pemilih berkas, tautan luar, bilah pembaruan. |
| `res/values/` | Nama aplikasi dan tema. |
| `res/mipmap-*/ic_launcher.png` | Ikon 48–192 px, dibuat dari `src/assets/logo.svg`. |
| `build.sh` | aapt2 → javac → d8 → zipalign → apksigner, keluaran `public/pindai.apk`. |

## Build

```bash
export JAVA_HOME=/path/ke/jdk-17
export ANDROID_SDK=/path/ke/android-sdk        # butuh platforms/android-34 + build-tools/34.0.0
bash android/build.sh
```

Hasil: `public/pindai.apk` (±28 KB), ditandatangani, siap dipasang di Android 6+.
Versi yang terbit saat ini adalah 1.2.0 (versionCode 3).

## Jembatan halaman ↔ aplikasi

WebView memblokir `window.open` dan tidak menangani unduhan `blob:`. Aplikasi
menyuntikkan objek `PindaiAndroid` (lihat `src/lib/jembatanAndroid.ts`):

| Metode | Dipakai untuk | Pengganti di web |
| --- | --- | --- |
| `cetak(html)` | Dialog cetak Android → simpan PDF (perjanjian, audit) | `window.open` + `window.print()` |
| `unduh(nama, mime, base64)` | Simpan CSV/poster ke folder Downloads | tautan `blob:` |
| `bukaLuar(url)` | WhatsApp, telepon, surel | `window.open(url)` |

Bila aplikasi tidak menyediakan metode itu (mis. dibuka di Chrome), halaman
otomatis kembali ke jalur web biasa.

### Naikkan versi sebelum merilis pembaruan

Versi ditulis di `build.sh` (`VERSI_KODE`, `VERSI_NAMA`). Skrip itu memakai
angka tersebut untuk APK **dan** menulis `public/version.json`, lalu angka yang
sama harus masuk ke `MainActivity.VERSI_KODE` dan `AndroidManifest.xml`.

Android menolak memasang pembaruan dengan `versionCode` yang sama atau lebih
kecil, jadi naikkan `VERSI_KODE` setiap kali merilis.

## Pembaruan di aplikasi

Aplikasi yang sudah terpasang mengecek `https://<alamat>/version.json` sekali
setiap dibuka:

```json
{ "versionCode": 3, "versionName": "1.2.0", "apkUrl": "/pindai.apk" }
```

Bila `versionCode` di server lebih besar dari `MainActivity.VERSI_KODE`, bilah
hijau "PINDAI 1.2.0 tersedia" muncul di atas halaman dengan tombol **Unduh**
yang membuka APK di peramban sistem. Pemeriksaan ini diam saja bila jaringan
gagal — aplikasi tetap bisa dipakai.

Aplikasi juga menambahkan penanda versinya ke User-Agent:
`PINDAIApp/<VERSI_KODE>`. Halaman membacanya untuk layar **wajib perbarui**
(bila admin menandai sebuah versi wajib). Angka itu harus berasal dari
`VERSI_KODE`, bukan ditulis tetap, agar pemeriksaan mengenai versi yang benar.
APK yang lebih tua menulis `PINDAIApp/1.0` dan dibaca sebagai versi 0.

Selain itu, bila aplikasi ditinggal lebih dari 15 menit dan saat kembali masih
di beranda, beranda dimuat ulang agar teks dan konfigurasi terbaru dari server
terpakai. Halaman formulir dan KYC tidak dimuat ulang supaya isian yang sedang
diketik tidak hilang.

`public/version.json` di repo sengaja menunjuk versi APK yang benar-benar ada
di `public/pindai.apk`. Menjalankan `build.sh` menulis ulang berkas itu sesuai
versi yang baru dibangun, jadi keduanya tidak bisa berbeda.

Mengabari pengguna bahwa versi baru terbit (notifikasi di pusat notifikasi dan
pesan WhatsApp) adalah langkah terpisah dari build: lihat
[`docs/pembaruan-aplikasi.md`](../docs/pembaruan-aplikasi.md).

## Alamat aplikasi

Alamat ada di `MainActivity.ALAMAT` dan `HOST`:

```java
private static final String ALAMAT = "https://pindai.biz.id/";
private static final String HOST = "pindai.biz.id";
```

Ganti keduanya bila domain produksi berubah, lalu build ulang. APK menyimpan
alamat saat build — APK lama tidak ikut pindah sendiri.

## Penandatanganan — baca sebelum merilis

- APK di repo ditandatangani dengan keystore yang dibuat saat build
  (`~/.pindai/pindai-release.jks` atau `PINDAI_KEYSTORE`). **Simpan keystore itu**
  kalau ingin bisa memasang pembaruan menimpa versi lama; keystore berbeda =
  pengguna harus mencopot aplikasi dulu.
- Untuk Play Store, buat upload key sendiri di Play Console dan simpan di tempat
  aman. Jangan pernah commit keystore atau kata sandinya ke repo ini.
- APK ini adalah build *sideload*: pengguna perlu mengizinkan "instal dari
  sumber ini". Itu wajar untuk APK di luar toko.

## Batasan yang diketahui

- WebView memakai sesi Convex yang sama dengan web; login WhatsApp OTP dibuka
  di aplikasi WhatsApp lalu kembali ke aplikasi.
- Kamera dan GPS bekerja lewat izin runtime; bila pengguna menolak, halaman
  menampilkan pesan yang sama seperti di peramban.
- Tautan eksternal (WhatsApp, telepon, surel) dibuka di aplikasi lain.
- Belum ada deep link (`pindai://`) dan belum ada notifikasi push.
