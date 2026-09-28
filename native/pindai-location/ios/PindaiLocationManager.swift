import CoreLocation
import Foundation

/// Pengelola lokasi + pengirim heartbeat PINDAI (iOS).
///
/// Di iOS tidak ada *foreground service* seperti Android. Yang membuat lokasi
/// tetap mengalir saat aplikasi di latar belakang adalah kombinasi:
///   - `UIBackgroundModes: location` di Info.plist,
///   - `manajer.allowsBackgroundLocationUpdates = true`,
///   - izin lokasi **"Selalu" (Always)** dari pengguna.
///
/// Pengiriman heartbeat dilakukan langsung dari delegate ini lewat `URLSession`,
/// jadi tidak bergantung pada WebView dan tidak terkena pembatasan jaringan
/// WebView seperti di Android.
final class PindaiLocationManager: NSObject, CLLocationManagerDelegate {

  static let shared = PindaiLocationManager()

  private let manajer = CLLocationManager()
  private var endpoint: URL?
  private var token: String?
  private var versiApp = "tidak diketahui"
  private var intervalDetik: TimeInterval = 60
  private var jarakMeter: Double = 50
  private var terakhirKirim = Date.distantPast
  private var lokasiTerkirim: CLLocation?

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
    // Indikator biru di status bar: pengguna harus tahu lokasinya dipakai.
    manajer.showsBackgroundLocationIndicator = true
  }

  /// Nyalakan pemantauan. Mengembalikan pesan galat bila belum bisa berjalan —
  /// pemanggil (plugin → UI) akan memakai jalur cadangan.
  func mulai(
    endpoint: URL,
    token: String,
    intervalDetik: Int,
    jarakMeter: Int,
    versiApp: String
  ) -> String? {
    self.endpoint = endpoint
    self.token = token
    self.intervalDetik = TimeInterval(max(15, intervalDetik))
    self.jarakMeter = Double(max(0, jarakMeter))
    self.versiApp = versiApp

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

    // HANYA aman bila `UIBackgroundModes` memuat "location" di Info.plist —
    // menyetelnya tanpa itu membuat aplikasi crash saat dijalankan.
    manajer.allowsBackgroundLocationUpdates = true
    manajer.startUpdatingLocation()
    aktif = true
    galatTerakhir = nil
    return nil
  }

  func hentikan() {
    manajer.stopUpdatingLocation()
    manajer.allowsBackgroundLocationUpdates = false
    aktif = false
  }

  // MARK: - CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations lokasi: [CLLocation]) {
    guard let terbaru = lokasi.last else { return }
    // Akurasi buruk tidak dipakai server (batas 1500 m di `simpanTitik`).
    guard terbaru.horizontalAccuracy > 0, terbaru.horizontalAccuracy <= 1500 else { return }

    let sekarang = Date()
    let jeda = sekarang.timeIntervalSince(terakhirKirim)
    let bergerakJauh = lokasiTerkirim.map { terbaru.distance(from: $0) >= max(jarakMeter, 200) } ?? false
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
    default:
      break
    }
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
}
