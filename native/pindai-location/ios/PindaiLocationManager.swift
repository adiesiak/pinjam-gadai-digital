import CoreLocation
import Foundation
import Security
import UIKit

/// Pengelola lokasi + pengirim heartbeat PINDAI (iOS).
///
/// Dua mode pemakaian, dan bedanya penting:
///
/// 1. **Dijalankan dari latar depan** (`mulai()`, dipanggil saat dashboard
///    terbuka). Di sini aplikasi boleh meminta pembaruan lokasi kontinu:
///    `startUpdatingLocation()`. Apple mensyaratkan permintaan ini dilakukan
///    saat aplikasi di latar depan — memulainya dari latar belakang **gagal**.
///    Dengan `UIBackgroundModes: location`, pembaruan itu tetap mengalir saat
///    aplikasi masuk latar belakang atau layar terkunci.
///
/// 2. **Dijalankan ulang oleh sistem di latar belakang** (aplikasi dihentikan,
///    lalu ada peristiwa lokasi). Di sini `pulihkanSaatPeluncuran()` hanya
///    berlangganan `startMonitoringSignificantLocationChanges()` — satu-satunya
///    jenis layanan lokasi yang membuat iOS menjalankan ulang aplikasi yang
///    sudah dihentikan (dengan izin "Selalu"). Titik yang masuk tetap dikirim
///    ke server; pemantauan kontinu dipasang lagi saat aplikasi dibuka.
///
/// Yang TIDAK dijamin: pengguna melakukan *force quit* dari app switcher →
/// iOS tidak menjalankan ulang aplikasi sampai pengguna membukanya sendiri.
final class PindaiLocationManager: NSObject, CLLocationManagerDelegate {

  static let shared = PindaiLocationManager()

  private enum Simpanan {
    /// Item Keychain. `kSecAttrAccessibleAfterFirstUnlock` dipilih khusus:
    /// peluncuran ulang di latar belakang sering terjadi saat layar terkunci,
    /// dan `WhenUnlocked` (default) akan gagal dibaca di kondisi itu.
    static let keychainService = "id.pindai.location"
    static let keychainAkun = "tokenPerangkat"
    static let endpoint = "pindai.endpoint"
    static let intervalDetik = "pindai.intervalDetik"
    static let jarakMeter = "pindai.jarakMeter"
    static let versiApp = "pindai.versiApp"
  }

  private let manajer = CLLocationManager()
  private var endpoint: URL?
  private var token: String?
  private var versiApp = "tidak diketahui"
  private var intervalDetik: TimeInterval = 60
  private var jarakMeter: Double = 50
  private var terakhirKirim = Date.distantPast
  private var lokasiTerkirim: CLLocation?
  /// Peluncuran latar belakang: jangan panggil `startUpdatingLocation()`.
  private var diluncurkanDiLatar = false

  private(set) var aktif = false
  private(set) var jumlahTerkirim = 0
  private(set) var terakhirTerkirim: Date?
  private(set) var galatTerakhir: String?

  private override init() {
    super.init()
    manajer.delegate = self
    manajer.desiredAccuracy = kCLLocationAccuracyBest
    manajer.activityType = .other
    // HARUS false: bila true, iOS menghentikan pembaruan begitu pengguna
    // berhenti bergerak — titik berhenti mengalir justru saat nasabah menunggu
    // di rumah, dan transaksinya ikut tertahan.
    manajer.pausesLocationUpdatesAutomatically = false
    // Indikator biru di status bar. Selain kewajiban etis, ini juga yang
    // menghindari masalah suspensi iOS 16.4 bagi aplikasi yang memakai
    // `startUpdatingLocation` bersama `startMonitoringSignificantLocationChanges`.
    manajer.showsBackgroundLocationIndicator = true
    // `distanceFilter` sengaja DIBIARKAN default (kCLDistanceFilterNone):
    // menyetelnya bersama dua layanan di atas termasuk pemicu masalah iOS 16.4.
    // Penyaringan jarak dilakukan di kode aplikasi, bukan di Core Location.
  }

  // MARK: - Dipanggil dari JavaScript (latar depan)

  /// Nyalakan pemantauan penuh. Mengembalikan pesan galat bila belum bisa
  /// berjalan — pemanggil (plugin → UI) akan memakai jalur cadangan.
  func mulai(
    endpoint: URL,
    token: String,
    intervalDetik: Int,
    jarakMeter: Int,
    versiApp: String
  ) -> String? {
    // Dipanggil dari latar depan (dashboard yang berjalan di WebView), jadi
    // mulai sekarang pemantauan kontinu boleh diminta.
    diluncurkanDiLatar = false
    guard CLLocationManager.locationServicesEnabled() else {
      galatTerakhir = "Layanan lokasi perangkat tidak aktif."
      return galatTerakhir
    }

    switch manajer.authorizationStatus {
    case .authorizedAlways:
      break
    case .authorizedWhenInUse, .notDetermined:
      // iOS tidak memberikan "Selalu" lewat satu dialog: ia harus melewati
      // "saat digunakan" dulu, lalu pengguna menaikkannya di Setelan.
      manajer.requestAlwaysAuthorization()
      galatTerakhir = "Izin lokasi \"Selalu\" belum diberikan."
      return galatTerakhir
    default:
      galatTerakhir = "Izin lokasi ditolak."
      return galatTerakhir
    }

    self.endpoint = endpoint
    self.token = token
    self.intervalDetik = TimeInterval(max(15, intervalDetik))
    self.jarakMeter = Double(max(0, jarakMeter))
    self.versiApp = versiApp
    // Konfigurasi baru disimpan setelah lolos pemeriksaan izin: kalau layanan
    // tidak bisa jalan, tidak ada yang perlu dipulihkan saat aplikasi
    // dijalankan ulang di latar belakang.
    simpanKonfigurasi()

    // HANYA aman bila `UIBackgroundModes` memuat "location" di Info.plist —
    // menyetelnya tanpa itu membuat aplikasi crash saat dijalankan.
    manajer.allowsBackgroundLocationUpdates = true
    manajer.startUpdatingLocation()
    // Sekaligus berlangganan significant-change: inilah yang membuat iOS
    // menjalankan ulang aplikasi setelah dihentikan, dan yang wajib dipasang
    // ulang pada setiap peluncuran (lihat `pulihkanSaatPeluncuran`).
    manajer.startMonitoringSignificantLocationChanges()
    aktif = true
    galatTerakhir = nil
    return nil
  }

  func hentikan() {
    manajer.stopUpdatingLocation()
    manajer.stopMonitoringSignificantLocationChanges()
    manajer.allowsBackgroundLocationUpdates = false
    hapusKonfigurasi()
    aktif = false
  }

  // MARK: - Dipanggil dari AppDelegate saat aplikasi diluncurkan

  /// Pulihkan layanan setelah aplikasi dijalankan ulang oleh sistem.
  ///
  /// Dipanggil dari `application(_:didFinishLaunchingWithOptions:)`. Aman
  /// dipanggil pada peluncuran biasa juga: tanpa konfigurasi tersimpan, fungsi
  /// ini tidak melakukan apa pun.
  ///
  /// `diluncurkanKarenaLokasi` diisi `launchOptions[.location] != nil`.
  func pulihkanSaatPeluncuran(diluncurkanKarenaLokasi: Bool) {
    diluncurkanDiLatar = diluncurkanKarenaLokasi
    let simpanan = UserDefaults.standard
    guard
      let endpointTeks = simpanan.string(forKey: Simpanan.endpoint),
      let endpointPulih = URL(string: endpointTeks),
      let tokenPulih = bacaTokenKeychain()
    else {
      return
    }

    // Tanpa izin "Selalu", iOS tidak akan menjalankan ulang aplikasi — dan
    // pemulihan ini tidak ada gunanya.
    guard manajer.authorizationStatus == .authorizedAlways else { return }

    endpoint = endpointPulih
    token = tokenPulih
    versiApp = simpanan.string(forKey: Simpanan.versiApp) ?? "tidak diketahui"
    intervalDetik = TimeInterval(max(15, simpanan.integer(forKey: Simpanan.intervalDetik)))
    jarakMeter = Double(max(0, simpanan.integer(forKey: Simpanan.jarakMeter)))
    manajer.allowsBackgroundLocationUpdates = true
    // WAJIB dipasang ulang: dokumentasi Apple — "Upon relaunch, you must still
    // configure a location manager object and call this method to continue
    // receiving location events."
    manajer.startMonitoringSignificantLocationChanges()
    aktif = true
    galatTerakhir = nil
  }

  // MARK: - CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations lokasi: [CLLocation]) {
    guard let terbaru = lokasi.last else { return }
    // Akurasi buruk tidak dipakai server (batas 1500 m di `simpanTitik`).
    guard terbaru.horizontalAccuracy > 0, terbaru.horizontalAccuracy <= 1500 else { return }

    // Lokasi simulasi (simulator, `simctl location`, atau tweak jailbreak):
    // server menolaknya, jadi jangan buang kuota — cukup laporkan sebabnya
    // supaya UI menampilkan instruksi yang benar, bukan "nyalakan GPS".
    if lokasiDariMock(terbaru) {
      galatTerakhir = "Lokasi terdeteksi berasal dari aplikasi lokasi palsu (mock location)."
      return
    }

    let sekarang = Date()
    let jeda = sekarang.timeIntervalSince(terakhirKirim)
    // Titik dari significant-change bisa datang jarang dan jauh; kirim saja
    // selama belum melewati interval, atau langsung bila pengguna bergerak jauh.
    let bergerakJauh = lokasiTerkirim.map { terbaru.distance(from: $0) >= max(jarakMeter, 200) } ?? true
    if jeda < intervalDetik && !(bergerakJauh && jeda >= 10) { return }

    terakhirKirim = sekarang
    lokasiTerkirim = terbaru
    kirim(terbaru)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    galatTerakhir = error.localizedDescription
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    switch manager.authorizationStatus {
    case .denied, .restricted:
      galatTerakhir = "Izin lokasi dicabut."
      aktif = false
    case .authorizedAlways:
      galatTerakhir = nil
      // Izin baru dinaikkan menjadi "Selalu" → pasang layanan pemulihan.
      if aktif {
        manager.startMonitoringSignificantLocationChanges()
        if !diluncurkanDiLatar {
          manager.startUpdatingLocation()
        }
      }
    default:
      break
    }
  }

  /**
   * Apakah titik ini dibuat perangkat lunak, bukan sensor?
   * `sourceInformation` tersedia sejak iOS 15 dan merupakan satu-satunya cara
   * resmi mengetahuinya — iOS tidak punya flag mock seperti Android.
   */
  private func lokasiDariMock(_ lokasi: CLLocation) -> Bool {
    if #available(iOS 15.0, *) {
      if let sumber = lokasi.sourceInformation {
        return sumber.isSimulatedBySoftware || sumber.isProducedByAccessory
      }
    }
    return false
  }

  // MARK: - Pengiriman

  private func kirim(_ lokasi: CLLocation) {
    guard let endpoint, let token else { return }

    var permintaan = URLRequest(url: endpoint)
    permintaan.httpMethod = "POST"
    permintaan.timeoutInterval = 15
    permintaan.setValue("application/json", forHTTPHeaderField: "Content-Type")
    permintaan.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

    let isi: [String: Any] = [
      "lat": lokasi.coordinate.latitude,
      "lng": lokasi.coordinate.longitude,
      "akurasi": lokasi.horizontalAccuracy,
      "platform": "ios",
      "versiApp": versiApp,
    ]
    permintaan.httpBody = try? JSONSerialization.data(withJSONObject: isi)

    URLSession.shared.dataTask(with: permintaan) { [weak self] _, respons, galat in
      guard let self else { return }
      if let galat {
        self.galatTerakhir = galat.localizedDescription
        return
      }
      guard let http = respons as? HTTPURLResponse else { return }
      if (200...299).contains(http.statusCode) {
        self.jumlahTerkirim += 1
        self.terakhirTerkirim = Date()
        self.galatTerakhir = nil
      } else {
        self.galatTerakhir = "Server menolak titik lokasi (HTTP \(http.statusCode))."
        // 401 = token tidak dikenal (perangkat dihapus / di-reset). Berhenti
        // saja; mencoba terus hanya membuang baterai.
        if http.statusCode == 401 { self.hentikan() }
      }
    }.resume()
  }

  // MARK: - Konfigurasi tersimpan

  /// Endpoint & pengaturan boleh di UserDefaults; token perangkat TIDAK —
  /// ia kredensial dan disimpan di Keychain.
  private func simpanKonfigurasi() {
    let simpanan = UserDefaults.standard
    simpanan.set(endpoint?.absoluteString, forKey: Simpanan.endpoint)
    simpanan.set(Int(intervalDetik), forKey: Simpanan.intervalDetik)
    simpanan.set(Int(jarakMeter), forKey: Simpanan.jarakMeter)
    simpanan.set(versiApp, forKey: Simpanan.versiApp)
    simpanTokenKeychain(token)
  }

  private func hapusKonfigurasi() {
    let simpanan = UserDefaults.standard
    simpanan.removeObject(forKey: Simpanan.endpoint)
    simpanan.removeObject(forKey: Simpanan.intervalDetik)
    simpanan.removeObject(forKey: Simpanan.jarakMeter)
    simpanan.removeObject(forKey: Simpanan.versiApp)
    hapusTokenKeychain()
  }

  private func kueriKeychain() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Simpanan.keychainService,
      kSecAttrAccount as String: Simpanan.keychainAkun,
    ]
  }

  private func simpanTokenKeychain(_ token: String?) {
    SecItemDelete(kueriKeychain() as CFDictionary)
    guard let token, let data = token.data(using: .utf8) else { return }
    var tambah = kueriKeychain()
    tambah[kSecValueData as String] = data
    // Terbaca setelah pembukaan pertama perangkat, termasuk saat layar terkunci:
    // peluncuran ulang di latar belakang sering terjadi dalam kondisi itu.
    tambah[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    SecItemAdd(tambah as CFDictionary, nil)
  }

  private func bacaTokenKeychain() -> String? {
    var kueri = kueriKeychain()
    kueri[kSecReturnData as String] = true
    kueri[kSecMatchLimit as String] = kSecMatchLimitOne
    var hasil: CFTypeRef?
    guard SecItemCopyMatching(kueri as CFDictionary, &hasil) == errSecSuccess,
      let data = hasil as? Data,
      let teks = String(data: data, encoding: .utf8),
      !teks.isEmpty
    else {
      return nil
    }
    return teks
  }

  private func hapusTokenKeychain() {
    SecItemDelete(kueriKeychain() as CFDictionary)
  }
}
