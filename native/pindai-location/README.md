# Plugin native PINDAI — layanan lokasi + heartbeat mandiri

Plugin Capacitor milik PINDAI. Berbeda dari `@capacitor-community/background-geolocation`
(plugin umum: hanya memberi pembaruan lokasi ke JavaScript), plugin ini
**memegang GPS dan mengirim heartbeat sendiri** lewat kode native:

```
Layanan/manager native ──POST──> /lokasi/heartbeat ──> heartbeatNative ──> simpanTitik
```

Kenapa ini yang dibutuhkan: Android membatasi permintaan jaringan yang berasal
dari WebView setelah ±5 menit aplikasi di latar belakang. Selama pengiriman
masih dipicu dari JavaScript, titik lokasi berhenti mengalir tepat saat aplikasi
tidak dibuka — padahal itu justru periode yang paling ingin dipantau. Di sini
WebView tidak dilibatkan sama sekali saat layanan berjalan.

---

## 1. Isi folder

| Berkas | Tujuan salinan di proyek native |
|---|---|
| `android/PindaiLocationService.kt` | `android/app/src/main/java/id/pindai/location/` |
| `android/PindaiLocationPlugin.kt` | `android/app/src/main/java/id/pindai/location/` |
| `ios/PindaiLocationManager.swift` | `ios/App/App/` (target aplikasi) |
| `ios/PindaiLocationPlugin.swift` | `ios/App/App/` (target aplikasi) |

Kode sengaja **tidak memakai dependensi tambahan**: Android memakai
`LocationManager` dan `HttpURLConnection` bawaan SDK (tanpa Google Play Services,
tanpa OkHttp), iOS memakai `CoreLocation` dan `URLSession`. Tidak ada paket yang
perlu dipasang untuk plugin ini sendiri, jadi tidak ada yang bisa bentrok saat
Capacitor atau Gradle diperbarui.

Pastikan `package id.pindai.location` di kedua berkas Kotlin sesuai dengan
struktur folder `android/app/src/main/java/id/pindai/location/`.

---

## 2. Daftarkan plugin di aplikasi

Sisi JavaScript tetap memakai `registerPlugin`, jadi plugin ini harus terdaftar
di sisi native.

**Android** — `MainActivity.kt`:

```kotlin
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import id.pindai.location.PindaiLocationPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // WAJIB sebelum super.onCreate(), kalau tidak plugin tidak terdaftar.
        registerPlugin(PindaiLocationPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

**iOS** — `ViewController.swift`:

```swift
import Capacitor

class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PindaiLocationPlugin())
    }
}
```

> `capacitorDidLoad()` tersedia di Capacitor 6/7. Bila versi Anda lebih lama,
> panggil `bridge?.registerPluginInstance(...)` dari `viewDidLoad()`.

---

## 3. Android — manifest

Di `android/app/src/main/AndroidManifest.xml`, izin berikut (kalau belum ada):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

lalu deklarasikan layanannya di dalam `<application>`:

```xml
<service
    android:name="id.pindai.location.PindaiLocationService"
    android:exported="false"
    android:foregroundServiceType="location" />
```

- `foregroundServiceType="location"` wajib untuk `targetSdk` 34+.
- `FOREGROUND_SERVICE_LOCATION` juga wajib di `targetSdk` 34+.
- Izin ini **sama** dengan yang diminta plugin lokasi umum di
  `docs/aplikasi-native.md` — kalau keduanya dipasang, cukup satu kali.
- Android 13+ butuh `POST_NOTIFICATIONS` **runtime** agar notifikasi pemantauan
  tampil. Minta sekali dari alur aplikasi (mis. saat pertama membuka dashboard);
  plugin ini tidak bisa memintanya sendiri karena layanan mulai tanpa Activity.

---

## 4. iOS — Info.plist

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

**Tanpa `UIBackgroundModes: location`, menyetel
`allowsBackgroundLocationUpdates = true` akan membuat aplikasi crash.** Itu
sebabnya langkah ini bukan opsional.

Izin "Selalu" tidak bisa didapat dalam satu dialog: iOS mewajibkan pengguna
memilih "Saat Menggunakan App" dulu, baru menaikkannya di Setelan → Privasi &
Keamanan → Layanan Lokasi → PINDAI → **Selalu**. Plugin akan **reject** `mulai()`
sampai izin itu ada, dan UI otomatis memakai jalur cadangan — jadi tidak ada
status "lokasi aktif" yang menyesatkan.

### Peluncuran ulang di latar belakang (wajib dipasang)

iOS bisa **menghentikan** aplikasi, lalu **menjalankannya ulang di latar
belakang** saat ada peristiwa lokasi — tetapi hanya bila izinnya "Selalu" dan
hanya untuk *significant location change* / *visits* / *region monitoring*.
Tanpa penanganan, aplikasi yang dijalankan ulang itu tidak punya konfigurasi
apa pun (endpoint & token hanya ada di memori), sehingga titik lokasi berhenti
terkirim tanpa pesan galat.

Pasang di `AppDelegate.swift`:

```swift
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // `launchOptions[.location] != nil` berarti sistem menjalankan aplikasi
        // karena peristiwa lokasi — bukan karena pengguna membukanya.
        PindaiLocationManager.shared.pulihkanSaatPeluncuran(
            diluncurkanKarenaLokasi: launchOptions?[.location] != nil
        )
        return true
    }
}
```

Yang dilakukan `pulihkanSaatPeluncuran()`:

- membaca ulang `endpoint`/`interval`/`jarak` dari `UserDefaults` dan **token
dari Keychain** (`kSecAttrAccessibleAfterFirstUnlock`, karena peluncuran ulang
sering terjadi saat layar terkunci — dengan `WhenUnlocked` default, token tidak
bisa dibaca dan pemulihan ini gagal);
- memasang ulang `startMonitoringSignificantLocationChanges()` — Apple
mensyaratkan ini: *"Upon relaunch, you must still configure a location manager
object and call this method to continue receiving location events."*
- **tidak** memanggil `startUpdatingLocation()`. Permintaan pembaruan lokasi
kontinu yang dimulai dari latar belakang **gagal** menurut dokumentasi Apple;
pemantauan kontinu dipasang lagi oleh `mulai()` saat dashboard dibuka.

Praktisnya: aplikasi yang dijalankan ulang di latar belakang tetap mengirim
titik saat pengguna **bergerak**. Saat pengguna berhenti dan kemudian membuka
aplikasi, `mulai()` memasang lagi pemantauan kontinu - dan kalau penggunanya
tidak membuka aplikasi, ia juga tidak bertransaksi, jadi tidak ada celah yang
terbuka.

`hentikan()` menghapus konfigurasi tersimpan, sehingga layanan yang dihentikan
(dari UI maupun saat keluar akun) **tidak** dihidupkan kembali oleh peluncuran
ulang berikutnya.

---

## 5. Kontrak API

```ts
import { registerPlugin } from "@capacitor/core";

const PindaiLocation = registerPlugin("PindaiLocation");

// Mulai layanan. Reject bila izin/endpoint belum siap.
await PindaiLocation.mulai({
  url: "https://<deployment>.convex.site/lokasi/heartbeat",
  token: "<token perangkat dari lokasi.daftarkanPerangkat>",
  intervalDetik: 60,   // opsional, minimum 15
  jarakMeter: 50,      // opsional
});
// → { aktif: true }

await PindaiLocation.hentikan();

await PindaiLocation.status();
// → { aktif: boolean, jumlahTerkirim: number, terakhirTerkirimMs?: number, galatTerakhir?: string }

// Buka Setelan aplikasi — jalan keluar dari jebakan izin di iOS
// (mis. pengguna memilih "Izinkan Sekali": permintaan "Selalu" berikutnya
// diabaikan sistem, jadi "Coba lagi" tidak akan pernah berhasil).
await PindaiLocation.bukaSetelan();
```

`url` dan `token` adalah kredensial yang sama dengan yang dipakai
`POST /lokasi/heartbeat`: perangkat dikenali dari token, jadi server yang
menetapkan sumber titik sebagai `"aplikasi"`, bukan klien.

Sisi web sudah terpasang di `src/lib/native.ts` (`pluginLayananLokasi`,
`mulaiLayananLokasi`, `hentikanLayananLokasi`) dan dipakai `LocationGate`:
layanan dicoba lebih dulu, dan bila tidak tersedia aplikasi otomatis kembali ke
plugin lokasi umum + `lokasi.catatLokasi`. **Tidak ada langkah UI yang perlu
ditulis ulang.**

---

## 6. Verifikasi yang belum dijalankan

Kode di folder ini ditulis untuk dibangun di proyek native, dan **belum pernah
dikompilasi** — tidak ada Android SDK/Xcode di lingkungan tempat berkas ini
dibuat. Sebelum dirilis, jalankan dan pastikan:

**Android**
```bash
cd android && ./gradlew assembleDebug
# bersih = tidak ada galat impor `id.pindai.location` dan service terdaftar:
#   ./gradlew :app:processDebugMainManifest  → periksa merged manifest
```
- [ ] `PindaiLocationService` muncul di *Merged Manifest* dengan `foregroundServiceType="location"`
- [ ] Izin lokasi diminta saat `mulai()` dipanggil pertama kali
- [ ] Notifikasi "PINDAI memantau lokasi" tampil dan tidak bisa di-swipe
- [ ] Matikan layar 15 menit → `lokasiJejak` di Convex tetap bertambah
- [ ] `PindaiLocation.status().galatTerakhir` terisi saat GPS dimatikan
- [ ] Cabut izin lokasi saat layanan jalan → `mulai()` berikutnya reject, UI pindah ke jalur cadangan

**iOS**
```bash
cd ios/App && xcodebuild -scheme App -configuration Debug
```
- [ ] Info.plist memuat `UIBackgroundModes: location`
- [ ] Izin "Selalu" diberikan → indikator lokasi biru muncul di status bar
- [ ] Kunci layar 15 menit → titik tetap terkirim
- [ ] Belum ada izin "Selalu" → `mulai()` reject dan aplikasi tetap terlacak lewat jalur cadangan
- [ ] Tombol "Buka Setelan" muncul di layar blokir dan membuka Setelan PINDAI

**Uji peluncuran ulang di latar belakang** (simulator, Xcode):

1. Buka dashboard (layanan menyala, izin "Selalu").
2. Simulator → Features → Location → **Freeway Drive**, lalu tekan tombol Home.
3. Xcode → Debug → **Simulate Location** tidak cukup; gunakan
   `xcrun simctl location <udid> start --speed=20 --interval=5` bila perlu, dan
   pastikan `lokasiJejak` di Convex masih bertambah saat aplikasi di latar belakang.
4. Terminate aplikasi (double-tap Home / swipe), lalu tetap bergerak.
   Aplikasi harus **dijalankan ulang oleh sistem** (lihat AppDelegate dipanggil
   di konsol) dan `lokasiJejak` bertambah lagi.
5. Buka aplikasi → pemantauan kontinu kembali aktif tanpa langkah manual.

Catatan: langkah 4 **tidak** berhasil bila aplikasi dihentikan dengan *force
quit* dari app switcher — iOS sengaja tidak menjalankan ulang aplikasi dalam
kondisi itu. Itu batas platform, bukan bug plugin.

---

## 7. Batas yang perlu diketahui (dan belum ditambal)

1. **Force stop mematikan layanan.** Android menghentikan *foreground service*
   saat pengguna melakukan *force stop* pada aplikasi. Setelah itu titik terakhir
   kedaluwarsa dan transaksi ditolak server — perilaku yang memang diinginkan,
   tapi tim CS perlu tahu penyebabnya.
2. **iOS: peluncuran ulang di latar belakang sudah ditangani** — konfigurasi
   disimpan (token di Keychain), `AppDelegate` memanggil
   `pulihkanSaatPeluncuran()`, dan significant-change dipasang ulang. Yang tetap
   di luar jangkauan: *force quit* oleh pengguna, dan kecepatan titik saat
   pengguna diam — significant-change memang tidak melaporkan apa pun selama
   perangkat tidak bergerak jauh. Itu perilaku sistem, bukan sesuatu yang bisa
   dipaksakan plugin.
3. **Deteksi lokasi palsu belum dikirim.** `Location.isFromMockProvider` (Android)
   dan `CLLocation.sourceInformation` (iOS) belum disertakan di body heartbeat;
   server juga belum menerima field tersebut.
4. **Token berasal dari WebView sekali.** Layar dashboard (yang berjalan di
   WebView) yang mendaftarkan perangkat dan menyerahkan token ke layanan. Kalau
   WebView tidak pernah dibuka sama sekali setelah pemasangan, layanan belum
   punya kredensial.
5. **Manajemen baterai vendor** (Xiaomi, Oppo, Vivo) bisa menghentikan layanan
   meski sudah *foreground service*. Umumnya perlu panduan "jangan batasi
   aplikasi ini" — pertimbangkan menampilkannya di UI bila
   `status().aktif` sering berubah.
