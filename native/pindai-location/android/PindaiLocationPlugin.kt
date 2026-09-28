package id.pindai.location

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import androidx.core.content.ContextCompat

/**
 * Plugin Capacitor PINDAI — jembatan tipis ke `PindaiLocationService`.
 *
 * Permukaan API (dipakai `src/lib/native.ts`):
 *   mulai({ url, token, intervalDetik?, jarakMeter? }) → { aktif: Boolean }
 *   hentikan()                                          → void
 *   status()   → { aktif, jumlahTerkirim, terakhirTerkirimMs, galatTerakhir }
 *
 * Catatan: permintaan izin `POST_NOTIFICATIONS` (Android 13+) tidak bisa diminta
 * dari sini karena plugin ini tidak punya Activity sendiri pada saat layanan
 * dimulai; minta sekali di alur aplikasi (mis. lewat @capacitor/local-notifications
 * atau dialog izin saat pertama masuk dashboard) supaya notifikasi pemantauan
 * tampil.
 */
@CapacitorPlugin(
  name = "PindaiLocation",
  permissions = [
    Permission(
      alias = "lokasi",
      strings = [
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
      ],
    ),
  ],
)
class PindaiLocationPlugin : Plugin() {

  @PluginMethod
  fun mulai(call: PluginCall) {
    val url = call.getString("url")
    val token = call.getString("token")
    if (url.isNullOrBlank() || token.isNullOrBlank()) {
      call.reject("URL endpoint dan token perangkat wajib dikirim.")
      return
    }
    if (getPermissionState("lokasi") != PermissionState.GRANTED) {
      requestPermissionForAlias("lokasi", call, "setelahIzinLokasi")
      return
    }
    jalankan(call, url, token)
  }

  @PermissionCallback
  private fun setelahIzinLokasi(call: PluginCall) {
    if (getPermissionState("lokasi") != PermissionState.GRANTED) {
      call.reject("Izin lokasi ditolak. PINDAI memerlukan lokasi selama pinjaman aktif.")
      return
    }
    val url = call.getString("url")
    val token = call.getString("token")
    if (url.isNullOrBlank() || token.isNullOrBlank()) {
      call.reject("URL endpoint dan token perangkat wajib dikirim.")
      return
    }
    jalankan(call, url, token)
  }

  private fun jalankan(call: PluginCall, url: String, token: String) {
    val intent = Intent(context, PindaiLocationService::class.java).apply {
      action = PindaiLocationService.AKSI_MULAI
      putExtra(PindaiLocationService.EKSTRA_ENDPOINT, url)
      putExtra(PindaiLocationService.EKSTRA_TOKEN, token)
      putExtra(PindaiLocationService.EKSTRA_INTERVAL_DETIK, call.getInt("intervalDetik") ?: 60)
      putExtra(PindaiLocationService.EKSTRA_JARAK_METER, call.getInt("jarakMeter") ?: 50)
    }
    try {
      ContextCompat.startForegroundService(context, intent)
    } catch (galat: Exception) {
      call.reject(galat.message ?: "Layanan lokasi tidak dapat dijalankan.")
      return
    }

    val hasil = JSObject()
    hasil.put("aktif", true)
    call.resolve(hasil)
  }

  @PluginMethod
  fun hentikan(call: PluginCall) {
    val intent = Intent(context, PindaiLocationService::class.java).apply {
      action = PindaiLocationService.AKSI_HENTIKAN
    }
    context.stopService(intent)
    call.resolve()
  }

  /**
   * Buka halaman Setelan aplikasi ini.
   *
   * Beberapa vendor (Xiaomi/Oppo/Vivo) menyembunyikan izin "sepanjang waktu"
   * dan pembatasan baterai beberapa lapis di dalam Setelan; mengarahkan
   * pengguna langsung ke halaman aplikasi jauh lebih efektif daripada
   * menjelaskannya lewat teks.
   */
  @PluginMethod
  fun bukaSetelan(call: PluginCall) {
    try {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.fromParts("package", context.packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      call.resolve()
    } catch (galat: Exception) {
      call.reject(galat.message ?: "Tidak dapat membuka Setelan.")
    }
  }

  @PluginMethod
  fun status(call: PluginCall) {
    val hasil = JSObject()
    hasil.put("aktif", PindaiLocationService.aktif)
    hasil.put("jumlahTerkirim", PindaiLocationService.jumlahTerkirim)
    hasil.put("terakhirTerkirimMs", PindaiLocationService.terakhirTerkirimMs)
    PindaiLocationService.galatTerakhir?.let { hasil.put("galatTerakhir", it) }
    call.resolve(hasil)
  }
}
