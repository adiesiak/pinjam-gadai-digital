import Capacitor
import Foundation

/// Plugin Capacitor PINDAI untuk iOS — jembatan tipis ke `PindaiLocationManager`.
///
/// Permukaan API sama persis dengan versi Android (dipakai `src/lib/native.ts`):
///   mulai({ url, token, intervalDetik?, jarakMeter? }) → { aktif: Boolean }
///   hentikan()                                          → void
///   status()   → { aktif, jumlahTerkirim, terakhirTerkirimMs, galatTerakhir }
///
/// `mulai` **reject** bila izin "Selalu" belum ada. Itu disengaja: UI akan
/// menyimpulkan layanan belum bisa jalan dan memakai jalur cadangan, bukan
/// menampilkan status "lokasi aktif" yang menyesatkan.
@objc(PindaiLocationPlugin)
public class PindaiLocationPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "PindaiLocationPlugin"
  public let jsName = "PindaiLocation"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "mulai", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "hentikan", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
  ]

  @objc func mulai(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let endpoint = URL(string: urlString) else {
      call.reject("URL endpoint tidak valid.")
      return
    }
    guard let token = call.getString("token"), !token.isEmpty else {
      call.reject("Token perangkat wajib dikirim.")
      return
    }

    let versiApp =
      Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "tidak diketahui"
    let galat = PindaiLocationManager.shared.mulai(
      endpoint: endpoint,
      token: token,
      intervalDetik: call.getInt("intervalDetik") ?? 60,
      jarakMeter: call.getInt("jarakMeter") ?? 50,
      versiApp: versiApp
    )
    if let galat {
      call.reject(galat)
      return
    }
    call.resolve(["aktif": true])
  }

  @objc func hentikan(_ call: CAPPluginCall) {
    PindaiLocationManager.shared.hentikan()
    call.resolve()
  }

  @objc func status(_ call: CAPPluginCall) {
    let manajer = PindaiLocationManager.shared
    var hasil: [String: Any] = [
      "aktif": manajer.aktif,
      "jumlahTerkirim": manajer.jumlahTerkirim,
    ]
    if let terakhir = manajer.terakhirTerkirim {
      hasil["terakhirTerkirimMs"] = Int(terakhir.timeIntervalSince1970 * 1000)
    }
    if let galat = manajer.galatTerakhir {
      hasil["galatTerakhir"] = galat
    }
    call.resolve(hasil)
  }
}
