package id.pindai.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Layanan lokasi PINDAI — memegang GPS dan mengirim heartbeat SENDIRI.
 *
 * Ini inti Fase 2: layanan berjalan sebagai *foreground service*, jadi ia tetap
 * hidup dan tetap boleh melakukan permintaan jaringan saat WebView di-pause
 * Android (±5 menit setelah aplikasi di latar belakang). Titik lokasi dikirim
 * langsung ke `POST /lokasi/heartbeat`, bukan lewat jembatan JavaScript.
 *
 * Yang TIDAK dijamin, dan jangan diklaim sebaliknya:
 *  - Aplikasi di-*force stop* oleh pengguna → sistem menghentikan layanan ini.
 *    Server akan menolak transaksi setelah titik terakhir kedaluwarsa.
 *  - Izin lokasi "sepanjang waktu" dicabut → layanan kehilangan pasokan titik;
 *    `galatTerakhir` mencatat sebabnya dan plugin melaporkannya ke UI.
 *
 * Batas platform: aplikasi biasa tidak bisa mencegah pengguna mematikan GPS.
 * Yang bisa dijamin adalah "mati lokasi = tidak bisa bertransaksi".
 */
class PindaiLocationService : Service(), LocationListener {

  companion object {
    const val AKSI_MULAI = "id.pindai.location.MULAI"
    const val AKSI_HENTIKAN = "id.pindai.location.HENTIKAN"

    const val EKSTRA_ENDPOINT = "endpoint"
    const val EKSTRA_TOKEN = "token"
    const val EKSTRA_INTERVAL_DETIK = "intervalDetik"
    const val EKSTRA_JARAK_METER = "jarakMeter"

    private const val TAG = "PindaiLocation"
    private const val KANAL_ID = "pindai-lokasi"
    private const val NOTIF_ID = 4711
    private const val AKURASI_MAKS_METER = 1500f

    /** Status untuk `status()` di plugin — hanya berlaku dalam proses ini. */
    @Volatile var aktif: Boolean = false
    @Volatile var jumlahTerkirim: Int = 0
    @Volatile var terakhirTerkirimMs: Long = 0L
    @Volatile var galatTerakhir: String? = null
  }

  private var manajer: LocationManager? = null
  private var endpoint: String? = null
  private var token: String? = null
  private var versiApp: String = "tidak diketahui"
  private var intervalMs: Long = 60_000L
  private var jarakMeter: Float = 50f
  private var terakhirKirimMs: Long = 0L
  private var pengirim: ExecutorService? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == AKSI_HENTIKAN) {
      stopSelf()
      return START_NOT_STICKY
    }

    val url = intent?.getStringExtra(EKSTRA_ENDPOINT)
    val kunci = intent?.getStringExtra(EKSTRA_TOKEN)
    if (url.isNullOrBlank() || kunci.isNullOrBlank()) {
      // Intent tanpa kredensial: tidak ada gunanya melanjutkan.
      galatTerakhir = "Endpoint atau token perangkat tidak dikirim."
      stopSelf()
      return START_NOT_STICKY
    }
    endpoint = url
    token = kunci
    intervalMs = (intent.getIntExtra(EKSTRA_INTERVAL_DETIK, 60).coerceAtLeast(15)) * 1000L
    jarakMeter = intent.getIntExtra(EKSTRA_JARAK_METER, 50).coerceAtLeast(0).toFloat()
    versiApp = bacaVersiApp()

    if (!punyaIzin()) {
      galatTerakhir = "Izin lokasi belum diberikan."
      stopSelf()
      return START_NOT_STICKY
    }

    mulaiForeground()
    mulaiPantau()
    aktif = true
    galatTerakhir = null

    // REDELIVER: kalau sistem menghentikan lalu menjalankan ulang layanan,
    // intent beserta kredensialnya ikut dikirim lagi sehingga pemantauan
    // pulih tanpa perlu WebView.
    return START_REDELIVER_INTENT
  }

  private fun punyaIzin(): Boolean {
    val halus = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
    val kasar = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
    return halus == PackageManager.PERMISSION_GRANTED || kasar == PackageManager.PERMISSION_GRANTED
  }

  private fun mulaiForeground() {
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(KANAL_ID) == null) {
      val kanal = NotificationChannel(
        KANAL_ID,
        "Pemantauan lokasi PINDAI",
        NotificationManager.IMPORTANCE_LOW,
      ).apply { description = "Menjaga lokasi tetap terkirim selama pinjaman aktif." }
      nm.createNotificationChannel(kanal)
    }

    val notifikasi: Notification = NotificationCompat.Builder(this, KANAL_ID)
      .setContentTitle("PINDAI memantau lokasi")
      .setContentText("Lokasi aktif agar pengajuan, cicilan, dan pelunasan dapat dilayani.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notifikasi, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIF_ID, notifikasi)
    }
  }

  @SuppressLint("MissingPermission")
  private fun mulaiPantau() {
    val lm = getSystemService(LOCATION_SERVICE) as? LocationManager ?: run {
      galatTerakhir = "Layanan lokasi perangkat tidak tersedia."
      return
    }
    manajer = lm
    val penyedia = when {
      lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> null
    }
    if (penyedia == null) {
      galatTerakhir = "GPS perangkat tidak aktif."
      return
    }
    lm.requestLocationUpdates(penyedia, intervalMs, jarakMeter, this, Looper.getMainLooper())
  }

  override fun onLocationChanged(lokasi: Location) {
    if (lokasi.accuracy > AKURASI_MAKS_METER) {
      // Titik terlalu kasar untuk dipakai server; tunggu fix yang lebih baik.
      return
    }
    val sekarang = System.currentTimeMillis()
    if (sekarang - terakhirKirimMs < intervalMs) return
    terakhirKirimMs = sekarang
    kirim(lokasi)
  }

  override fun onProviderDisabled(penyedia: String) {
    galatTerakhir = "Penyedia lokasi ($penyedia) dimatikan."
  }

  override fun onProviderEnabled(penyedia: String) {
    galatTerakhir = null
    mulaiPantau()
  }

  /** Kirim satu titik ke `POST /lokasi/heartbeat` — di luar thread utama. */
  private fun kirim(lokasi: Location) {
    val url = endpoint ?: return
    val kunci = token ?: return
    val eksekutor = pengirim ?: Executors.newSingleThreadExecutor().also { pengirim = it }
    eksekutor.execute {
      var koneksi: HttpURLConnection? = null
      try {
        val isi = JSONObject().apply {
          put("lat", lokasi.latitude)
          put("lng", lokasi.longitude)
          put("akurasi", lokasi.accuracy.toDouble())
          put("platform", "android")
          put("versiApp", versiApp)
        }.toString()

        koneksi = (URL(url).openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          connectTimeout = 15_000
          readTimeout = 15_000
          doOutput = true
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("Authorization", "Bearer $kunci")
        }
        OutputStreamWriter(koneksi.outputStream, "UTF-8").use { it.write(isi) }

        val kode = koneksi.responseCode
        if (kode in 200..299) {
          jumlahTerkirim += 1
          terakhirTerkirimMs = System.currentTimeMillis()
          galatTerakhir = null
        } else {
          // 401 = token tidak dikenal (perangkat dihapus/di-reset) → hentikan
          // saja; mencoba terus hanya membuang baterai.
          galatTerakhir = "Server menolak titik lokasi (HTTP $kode)."
          if (kode == 401) stopSelf()
        }
      } catch (galat: Exception) {
        galatTerakhir = galat.message ?: "Gagal mengirim titik lokasi."
        Log.w(TAG, "Heartbeat lokasi gagal", galat)
      } finally {
        koneksi?.disconnect()
      }
    }
  }

  private fun bacaVersiApp(): String {
    return try {
      val info = packageManager.getPackageInfo(packageName, 0)
      info.versionName ?: "tidak diketahui"
    } catch (galat: Exception) {
      "tidak diketahui"
    }
  }

  override fun onDestroy() {
    aktif = false
    manajer?.removeUpdates(this)
    manajer = null
    pengirim?.shutdown()
    pengirim = null
    super.onDestroy()
  }
}
