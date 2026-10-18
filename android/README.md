# PINDAI Android (APK)

Pembungkus WebView untuk aplikasi web PINDAI. Satu Activity, tanpa Gradle dan
tanpa AndroidX, sehingga build-nya hanya butuh JDK 17 + Android SDK
build-tools 34. Hasil build dipasang di repo sebagai `public/pindai.apk` dan
ditautkan dari tombol "Pasang aplikasi" di beranda.

## Isi folder

| Berkas | Peran |
| --- | --- |
| `AndroidManifest.xml` | Paket `id.pindai.app`, izin internet/lokasi/kamera, tema terang. |
| `src/id/pindai/app/MainActivity.java` | WebView + kamera (getUserMedia), GPS, pemilih berkas, tautan luar. |
| `res/values/` | Nama aplikasi dan tema. |
| `res/mipmap-*/ic_launcher.png` | Ikon 48–192 px, dibuat dari `src/assets/logo.svg`. |
| `build.sh` | aapt2 → javac → d8 → zipalign → apksigner, keluaran `public/pindai.apk`. |

## Build

```bash
export JAVA_HOME=/path/ke/jdk-17
export ANDROID_SDK=/path/ke/android-sdk        # butuh platforms/android-34 + build-tools/34.0.0
bash android/build.sh
```

Hasil: `public/pindai.apk` (±24 KB), ditandatangani, siap dipasang di Android 6+.

## Alamat aplikasi

Alamat ada di `MainActivity.ALAMAT` dan `HOST`:

```java
private static final String ALAMAT = "https://better-spoons-create.freebuff.dev/";
private static final String HOST = "better-spoons-create.freebuff.dev";
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
