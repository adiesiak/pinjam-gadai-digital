# PINDAI — Membungkus Web Menjadi Aplikasi Native (Lokasi Latar Belakang)

Dokumen kerja untuk tim PINDAI. Tujuannya satu: **lokasi Peminjam harus tetap
terkirim ke server walau aplikasi ditutup, layar terkunci, atau pengguna
berpindah aplikasi.** Ini tidak mungkin dicapai dari browser; hanya aplikasi
native yang bisa.

Kerjakan seluruh langkah di bawah **di repo terpisah (mis. `pindai-app`)** atau
minimal di mesin/CI dengan Android Studio & Xcode. Sandbox Freebuff Web ini
hanya untuk kode web + Convex, dan dev server-nya tidak dipakai untuk build
native.

---

## 0. Ringkasan keputusan

| Pertanyaan | Keputusan | Alasan |
|---|---|---|
| Cara membungkus | **Capacitor 7** | Web PINDAI dipakai apa adanya — satu basis kode React, tanpa menulis ulang UI. |
| Plugin lokasi latar | **`@capacitor-community/background-geolocation` v1** | Satu-satunya plugin Capacitor komunitas yang memakai *foreground service* Android + Background Modes iOS. Mendukung Capacitor v7. |
| Alternatif yang ditolak | React Native / Flutter | Butuh menulis ulang seluruh UI + Convex Auth; biaya besar tanpa manfaat. |
| Saat saklar `wajibAplikasiNative` dinyalakan | **Setelah rilis toko + 100% pengguna Peminjam pakai app** | Kalau dinyalakan lebih awal, semua nasabah web langsung terblokir. |

---

## 1. Yang SUDAH siap di repo ini

Tidak perlu ditulis lagi — cukup dipakai dari aplikasi native.

### Klien — `src/lib/native.ts`
Jembatan native yang **tidak menambah dependency apa pun**. Di browser semua
fungsinya no-op, jadi bundel web tidak berubah.

| Fungsi | Guna |
|---|---|
| `lingkunganNative()` | `"web"` \| `"android"` \| `"ios"` dari global `window.Capacitor`. |
| `idPerangkat()` | ID perangkat stabil untuk `daftarkanPerangkat`. `null` di browser. |
| `versiAplikasi()` | Versi + build dari plugin `App` (`"1.4.0 (42)"`). |
| `pluginLokasiLatar()` | Mencari plugin `BackgroundGeolocation` di `Capacitor.Plugins`. |
| `pasangPluginLokasiLatar(p)` | Daftar manual via `registerPlugin(...)` — jaring pengaman bila `Capacitor.Plugins` tidak ada. |
| `mulaiPelacakanLatar(onTitik, onGalat)` | Mulai watcher latar belakang; `null` bila plugin belum terpasang (bukan error). |

### Klien — `src/components/LocationGate.tsx`
Sudah native-aware:
- Memakai watcher latar belakang bila plugin ada, **fallback** ke
  `navigator.geolocation` bila tidak (atau bila `addWatcher` gagal).
- Mengirim heartbeat dengan `sumber: "aplikasi"`, `platform` (`android`/`ios`),
  `versiApp`, dan `deviceId`.
- **Mendaftarkan perangkat sendiri** saat berjalan di aplikasi native, sehingga
  pengguna aplikasi tidak pernah diminta "memasang aplikasi" oleh kebijakan
  `wajibAplikasiNative` (tanpa ini, mereka akan melihat layar blokir).
- Instruksi yang ditampilkan menyesuaikan: langkah Setelan Android/iPhone khusus
  aplikasi, bukan Safari/Chrome.

### Server — `src/convex/lokasi.ts`
| Endpoint | Guna |
|---|---|
| `lokasi.daftarkanPerangkat({deviceId, platform, versiApp})` | Daftar perangkat native; masa berlaku 30 hari sejak heartbeat terakhir. |
| `lokasi.catatLokasi({lat, lng, akurasi, sumber, platform, versiApp, deviceId})` | Heartbeat titik lokasi (validasi wilayah, akurasi, lompatan mustahil). |
| `lokasi.statusSaya()` | Status gerbang untuk UI (`segar`, `umurMenit`, `perangkatTerdaftar`). |
| `requireGerbangLokasi(ctx, userId, user, titik?)` | Dipanggil pada semua aksi finansial Peminjam. |

Server **sudah** menolak pengajuan pinjaman/gadai/kredit, cicilan, dan pelunasan
tanpa titik segar. Yang belum ada hanyalah aplikasi native yang bisa memasok
titik itu saat aplikasi tertutup.

---

## 2. Batas yang jujur (jangan dijanjikan berlebihan ke manajemen/OJK)

| Keinginan | Bisa? | Catatan |
|---|---|---|
| Blokir transaksi saat lokasi mati | ✅ Sudah jalan | Server-side, tidak bisa dilewati dari HP pengguna. |
| Lokasi jalan saat layar terkunci / app di latar belakang | ✅ Dengan app native | Butuh *foreground service* (Android) / Background Modes (iOS) + izin "Selalu". |
| Lokasi jalan saat aplikasi **benar-benar ditutup paksa (force stop)** | ❌ | Android menghentikan foreground service saat app di-force stop. Titik terakhir tetap dipakai sampai kedaluwarsa, lalu transaksi diblokir. |
| Mencegah pengguna mematikan tombol GPS | ❌ | Hanya bisa lewat perangkat terkelola (Android device owner / MDM). Aplikasi biasa tidak punya wewenang itu — aturan OS dan toko aplikasi. |
| Menyontek GPS (fake GPS) | ⚠️ Sebagian | Server sudah menolak lompatan mustahil. Untuk deteksi penuh, aktifkan `isFromMockProvider` di sisi native pada Fase 2. |

Kesimpulan yang bisa dijual: **"mati lokasi = tidak bisa bertransaksi"**, bukan
"pengguna tidak bisa mematikan lokasi".

---

## 3. Prasyarat

- **Android**: Android Studio (Ladybug+), Android SDK 35, JDK 17, `minSdkVersion 23`.
- **iOS**: macOS + Xcode 16, CocoaPods (`sudo gem install cocoapods`).
- **Akun**: Google Play Console (sekali bayar US$25), Apple Developer Program (US$99/tahun).
- **Konveks**: deployment produksi + `VITE_CONVEX_URL` untuk build rilis.
- **Domain**: sudah ada (HTTPS) untuk halaman privasi & syarat layanan — keduanya
  **wajib** untuk review toko.

---

## 4. Langkah 1 — Bootstrap proyek native

```bash
# dari salinan repo web PINDAI
bun add @capacitor/core @capacitor/app @capacitor-community/background-geolocation
bun add -d @capacitor/cli

bunx cap init "PINDAI" "id.pindai.app" --web-dir dist
bunx cap add android
bunx cap add ios
```

`capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "id.pindai.app",
  appName: "PINDAI",
  webDir: "dist",
  android: {
    // WAJIB. Tanpa ini, pembaruan lokasi berhenti setelah ±5 menit di latar
    // belakang (lihat catatan plugin, isu #89). Ini penyebab nomor satu
    // "lokasi jalan sebentar lalu mati".
    useLegacyBridge: true,
  },
};

export default config;
```

Catatan:
- `webDir` harus sama dengan output Vite (default `dist`). Jalankan
  `bunx vite build` **di repo native**, bukan di sandbox Freebuff.
- Jangan mengubah `vite.config.ts` (khususnya `server.hmr: false`) — dev server
  Freebuff tidak dipakai untuk build native.
- Setiap kali kode web berubah: `bunx vite build && bunx cap sync`.

### Daftarkan plugin di entry native

Buat `src/lib/native-plugins.ts` (cara resmi plugin, lihat README-nya):

```ts
import { registerPlugin } from "@capacitor/core";

import { pasangPluginLokasiLatar } from "@/lib/native";

// Nama "BackgroundGeolocation" harus sama persis dengan nama plugin native.
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
pasangPluginLokasiLatar(BackgroundGeolocation);
```

lalu impor sekali di `src/main.tsx`:

```ts
import "@/lib/native-plugins";
```

Di browser baris itu tidak berefek (plugin hanya aktif di shell native).

---

## 5. Langkah 2 — Manifest & permission Android

`android/app/src/main/AndroidManifest.xml`, sebelum `<application>`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

- `FOREGROUND_SERVICE_LOCATION` wajib untuk `targetSdk` 34+.
- `POST_NOTIFICATIONS` (Android 13+) dibutuhkan supaya notifikasi
  "PINDAI memantau lokasi" tampil. Minta runtime permission-nya (mis. lewat
  `@capacitor/local-notifications` atau plugin notifikasi lain).
- **Jangan** mendeklarasikan `<service>` sendiri: plugin sudah menyertakannya
  (dengan `foregroundServiceType="location"`). Verifikasi lewat Android Studio →
  *Merged Manifest* dan pastikan hanya ada satu entri `BackgroundGeolocationService`.

Teks notifikasi & ikon di `android/app/src/main/res/values/strings.xml`:

```xml
<resources>
  <string name="capacitor_background_geolocation_notification_channel_name">
    Pemantauan lokasi PINDAI
  </string>
  <string name="capacitor_background_geolocation_notification_icon">drawable/ic_tracking</string>
  <string name="capacitor_background_geolocation_notification_color">#0f3d3a</string>
</resources>
```

Ikon notifikasi harus bergambar vektor atau PNG **berlatar transparan** (pilih
*Notification Icons* saat membuat image asset di Android Studio).

### Urutan permintaan izin (penting)

Android melarang meminta `ACCESS_BACKGROUND_LOCATION` lewat dialog biasa
(Android 11+). Alurnya:

1. Minta **"Saat aplikasi digunakan"** (foreground) → `requestPermissions: true` dari plugin.
2. Setelah pengguna bertransaksi pertama, tampilkan layar penjelasan berisi
   tombol yang membuka **Setelan → Izin → Lokasi → Izinkan sepanjang waktu**
   (plugin menyediakan `BackgroundGeolocation.openSettings()`).
3. Baru setelah itu titik mengalir saat layar terkunci.

---

## 6. Langkah 3 — Konfigurasi iOS

`ios/App/App/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>PINDAI memerlukan lokasi untuk memverifikasi pengajuan pinjaman Anda.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>PINDAI memantau lokasi selama pinjaman aktif — juga saat layar terkunci — agar pengajuan dan cicilan tetap dapat dilayani.</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

- Tambahkan juga **Background Modes → Location updates** di Xcode
  (Signing & Capabilities) sebagai konfirmasi visual.
- Apple sangat ketat soal lokasi latar belakang: siapkan penjelasan
  in-app (layar "Mengapa PINDAI perlu lokasi") dan pastikan aplikasi tetap
  berguna tanpa izin itu — kalau tidak, pengajuan akan ditolak (lihat Fase 5).

---

## 7. Fase 2 — Agar heartbeat TIDAK berhenti saat aplikasi di latar belakang

**Ini bagian yang paling sering dilewatkan tim dan bikin fitur "jalan sebentar
lalu mati".**

Android membatasi permintaan jaringan yang berasal dari WebView setelah ±5 menit
aplikasi di latar belakang. Klien Convex berjalan di WebView (WebSocket), jadi
heartbeat `lokasi.catatLokasi` bisa tertahan walau foreground service dan
plugin lokasi tetap hidup.

Rencana penanganannya:

1. **Endpoint HTTP di Convex** — tambahkan rute di `src/convex/http.ts`
   (saat ini hanya memuat rute auth):
   - `POST /lokasi/heartbeat` dengan body
     `{ token, lat, lng, akurasi, deviceId, versiApp }`.
   - Handler memverifikasi token perangkat lalu memanggil logika `simpanTitik`
     yang sudah ada (satu sumber validasi).
2. **Token perangkat** — ubah `lokasi.daftarkanPerangkat` agar mengembalikan
   token acak sekali pakai (disimpan sebagai hash di tabel `perangkat`).
   Aplikasi menyimpannya di Keychain (iOS) / EncryptedSharedPreferences
   (Android) dan mengirimnya lewat header `Authorization`.
3. **Pengiriman dari sisi native**, bukan dari WebView:
   - Cara cepat: panggil endpoint itu dari *callback* plugin memakai
     `CapacitorHttp` (HTTP native, tidak ter-throttle).
   - Cara paling tahan lama: plugin native kecil milik PINDAI yang menjalankan
     foreground service + POST sendiri. Ini yang dipakai aplikasi fintech pada
     umumnya.
4. **Deteksi lokasi palsu di sisi native** — kirim juga `isFromMockProvider`
   dan `simulated` dari plugin, lalu tolak di `simpanTitik`.

Sampai Fase 2 selesai, pemantauan latar belakang berfungsi untuk sesi-sesi
pendek (±5 menit) dan **selalu segar kembali saat pengguna membuka aplikasi**
(`LocationGate` mengirim titik baru setiap tab kembali aktif). Karena itu:
**naikkan `lokasiMaxUmurMenit` ke 15–20 lewat /admin → Pengaturan Sistem**
sebelum merilis aplikasi, agar nasabah tidak terblokir saat membuka aplikasi
setelah lama menganggur.

---

## 8. Langkah 4 — Uji sebelum rilis

### Uji lapangan (wajib)
| Kasus | Hasil yang diharapkan |
|---|---|
| App dibuka, izin "sepanjang waktu" diberikan | Notifikasi "PINDAI memantau lokasi" muncul; pil status "Lokasi aktif (latar belakang)". |
| Layar dikunci 10 menit | Titik tetap bertambah di /admin → peta/audit lokasi. |
| Lokasi dimatikan di Setelan | Pengajuan/cicilan ditolak server; dashboard menampilkan layar blokir. |
| Aplikasi di-force stop, lalu lokasi dimatikan | Transaksi ditolak (titik kedaluwarsa). |
| Fake GPS | Titik ditolak (akurasi/lompatan mustahil). |
| Perangkat tanpa GPS / browser lama | Fallback `navigator.geolocation` + pesan diagnosis yang benar. |
| `wajibAplikasiNative` dinyalakan (di staging) | Pengguna web terblokir; pengguna app native lolos tanpa melihat layar "pasang aplikasi". |

### Uji otomatis yang sudah ada
```bash
bun run test          # termasuk src/lib/native.test.ts, src/convex/lokasi.convex.test.ts
bunx tsc -b --noEmit
bunx eslint src/lib/native.ts src/components/LocationGate.tsx
```

---

## 9. Fase 3 — Rollout & aktivasi `wajibAplikasiNative`

Urutan ini **tidak boleh dibalik**:

1. **Staging**: rilis app internal (Play *internal testing*, TestFlight).
   Nyalakan `wajibAplikasiNative` di deployment staging, uji seluruh alur dengan
   akun uji Peminjam.
2. **Produksi, fase lunak**: rilis ke Play/App Store. Saklar tetap **OFF** —
   nasabah web masih bisa bertransaksi, aplikasi hanya menambah kemampuan.
3. **Pantau** di /admin:
   - Kartu **"Lokasi Tidak Mengalir"** → jumlah pinjaman didanai tanpa titik segar.
   - `statusSaya.perangkatTerdaftar` untuk melihat berapa Peminjam sudah di app.
4. **Sosialisasi**: WhatsApp/email ke seluruh Peminjam aktif + banner pengumuman
   (CMS Pengumuman) berisi tautan toko dan tanggal penutupan akses web.
5. **Nyalakan `wajibAplikasiNative`** hanya setelah ≥95% Peminjam aktif
   terdaftar. Siapkan jalur bantuan: nasabah yang belum bisa memasang aplikasi
   harus tetap bisa melunasi lewat kanal manual (transfer + verifikasi admin).

> Setiap perubahan konfigurasi ini diaudit di /admin → Pengaturan Sistem.
> Saklar bersifat global dan langsung berlaku ke seluruh pengguna.

---

## 10. Fase 4 — Rilis ke toko & kepatuhan

### Google Play
- **Sensitive permissions declaration** untuk `ACCESS_BACKGROUND_LOCATION`
  (wajib bila targetSdk 34+). Harus disertai video singkat yang menunjukkan
  fitur ini memang inti aplikasi.
- **Foreground service types declaration** untuk `location` — jelaskan
  penggunaannya dan tampilkan notifikasi permanen (sudah dilakukan plugin).
- **Data safety**: nyatakan bahwa lokasi dikumpulkan & dibagikan ke server
  PINDAI, terenkripsi saat transit, dan apa dasar penggunaannya.
- **Kebijakan privasi** yang dapat diakses publik (URL) — sebutkan lokasi,
  masa simpan, dan cara meminta penghapusan.

### Apple App Store
- Guideline **5.1.1** (izin & tujuan) dan **2.5.4** (lokasi latar belakang):
  hanya untuk fitur yang terlihat jelas di UI. Sertakan penjelasan in-app.
- Aplikasi harus **tetap berguna tanpa izin lokasi** (mis. bisa melihat
  riwayat, jadwal cicilan, kontrak). Kalau seluruh aplikasi terkunci tanpa
  lokasi, risiko penolakan tinggi — pertimbangkan mode "baca-saja" tanpa izin.
- Guideline **3.2.1**: jangan memaksa memasang aplikasi lain. Karena web dan app
  native adalah produk PINDAI yang sama, ini aman.

### Kepatuhan Indonesia
- **UU PDP No. 27/2022**: lokasi = data pribadi. Butuh persetujuan eksplisit
  (sudah direkam di tabel `trackingConsents`), pemberitahuan tujuan, dan hak
  akses/penghapusan. Siapkan menu **"Riwayat lokasi saya" + "Hapus data lokasi"**
  di profil.
- **POJK 6/2022** (perlindungan konsumen): transparansi biaya & perlakuan
  setara; jelaskan di kebijakan privasi bahwa pemantauan hanya selama pinjaman
  aktif.
- **Transfer data lintas negara**: deployment Convex berada di luar Indonesia →
  cantumkan di kebijakan privasi dan siapkan dasar transfer yang sah.

---

## 11. Checklist

**Persiapan**
- [ ] Repo native dibuat, `bunx cap add android ios` sukses
- [ ] `android.useLegacyBridge: true` terpasang
- [ ] `src/lib/native-plugins.ts` dibuat & diimpor di `main.tsx`
- [ ] Permission Android + `strings.xml` notifikasi lengkap
- [ ] Info.plist iOS + Background Modes location

**Fungsi**
- [ ] Perangkat native terdaftar otomatis (`perangkat` terisi di Convex)
- [ ] Heartbeat terkirim dengan `sumber: "aplikasi"`
- [ ] Lokasi mengalir saat layar terkunci
- [ ] Fallback browser tetap jalan bila plugin tidak ada
- [ ] Pengguna app native tidak pernah melihat layar "pasang aplikasi"

**Sebelum menyalakan `wajibAplikasiNative`**
- [ ] `lokasiMaxUmurMenit` dinaikkan ke 15–20
- [ ] ≥95% Peminjam aktif terdaftar di tabel `perangkat`
- [ ] Kanal bantuan untuk pelunasan manual sudah disiapkan
- [ ] Fase 2 (heartbeat native/HTTP) minimal sudah diuji di staging

**Toko**
- [ ] Kebijakan privasi & syarat layanan tayang di URL publik
- [ ] Declaration background location + foreground service (Play)
- [ ] Data safety form diisi
- [ ] Penjelasan in-app "mengapa PINDAI perlu lokasi"

---

## 12. Estimasi

| Fase | Perkiraan |
|---|---|
| 1–3 (membungkus + plugin + manifest/Info.plist) | 3–5 hari kerja |
| Uji lapangan lintas perangkat | 1 minggu |
| Fase 2 (heartbeat native + token perangkat) | 1–2 minggu |
| Review toko (Play 2–7 hari, Apple 1–3 hari, bisa revisi) | 1–3 minggu |
| **Total sampai lokasi latar belakang andal di produksi** | **±4–6 minggu** |
