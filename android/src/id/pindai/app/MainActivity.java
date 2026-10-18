package id.pindai.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.graphics.Color;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * PINDAI di Android: satu WebView yang memuat aplikasi web resmi.
 *
 * Tiga hal yang membuatnya benar-benar bisa dipakai, bukan sekadar bingkai:
 *  - Swafoto KTP memakai getUserMedia, jadi permintaan kamera dari WebView
 *    diteruskan ke izin Android dan baru diberikan setelah pengguna setuju.
 *  - Gerbang lokasi memakai geolocation, jadi permintaan GPS juga diteruskan.
 *  - Unggah berkas (KTP, bukti bayar) memakai pemilih berkas Android.
 *
 * Tautan ke luar (WhatsApp, telepon, surel) dibuka di aplikasi lain supaya
 * OTP WhatsApp dan tautan panggilan tetap bekerja. Tautan internal tetap di
 * dalam WebView agar tombol kembali tidak melompat keluar aplikasi.
 */
public class MainActivity extends Activity {

    /** Alamat aplikasi. Ganti di sini bila domain produksi berubah. */
    private static final String ALAMAT = "https://pindai.biz.id/";
    private static final String HOST = "pindai.biz.id";

    private static final int REQ_KAMERA = 7001;
    private static final int REQ_LOKASI = 7002;
    private static final int REQ_BERKAS = 7003;

    /**
     * Versi terpasang. Naikkan bersama `versionCode` di build.sh dan
     * AndroidManifest setiap kali merilis APK baru — angka inilah yang
     * dibandingkan dengan `version.json` di server.
     */
    private static final int VERSI_KODE = 3;

    /** Beranda saja yang dimuat ulang setelah aplikasi lama ditinggal. */
    private static final long JEDA_MUAT_ULANG_MS = 15L * 60 * 1000;

    private WebView web;
    /** Bilah "versi baru tersedia" di atas WebView; tersembunyi sampai perlu. */
    private LinearLayout bilahPembaruan;
    private TextView teksPembaruan;
    /** Waktu aplikasi terakhir ditinggal, 0 bila belum pernah. */
    private long ditinggalPada;
    /** WebView sementara untuk dialog cetak; disimpan agar tidak dibersihkan GC. */
    private WebView webCetak;
    private PermissionRequest permintaanKamera;
    private GeolocationPermissions.Callback callbackLokasi;
    private String asalLokasi;
    private ValueCallback<Uri[]> callbackBerkas;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        web = new WebView(this);

        // WebView di bawah, bilah pembaruan di atas. Bilahnya dibuat sekali dan
        // baru ditampilkan bila server melaporkan versionCode yang lebih tinggi.
        LinearLayout akar = new LinearLayout(this);
        akar.setOrientation(LinearLayout.VERTICAL);
        siapkanBilahPembaruan();
        akar.addView(bilahPembaruan, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        akar.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(akar);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // Penanda ini dibaca halaman (`lib/pembaruanAplikasi`) untuk tahu versi
        // APK mana yang sedang dipakai. Angkanya HARUS `VERSI_KODE`: layar
        // wajib perbarui membandingkan angka itu dengan versi yang diumumkan
        // admin. Menulis angka tetap di sini membuat pemeriksaan salah sasaran.
        s.setUserAgentString(s.getUserAgentString() + " PINDAIApp/" + VERSI_KODE);

        // Jembatan untuk halaman: cetak/PDF, simpan berkas, buka tautan luar.
        // Hanya tiga metode beranotasi @JavascriptInterface yang terekspos.
        web.addJavascriptInterface(new Jembatan(), "PindaiAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri tujuan = req.getUrl();
                String skema = tujuan.getScheme();
                boolean web = "http".equals(skema) || "https".equals(skema);
                if (web && HOST.equals(tujuan.getHost())) return false;
                bukaDiLuar(tujuan);
                return true;
            }
        });

        // Unduhan (mis. tautan APK di beranda) diserahkan ke peramban sistem:
        // WebView tidak punya pengelola unduhan sendiri.
        web.setDownloadListener((url, ua, disposisi, mime, panjang) ->
                bukaDiLuar(Uri.parse(url)));

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean mintaVideo = false;
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) mintaVideo = true;
                    }
                    if (!mintaVideo || punyaIzin(Manifest.permission.CAMERA)) {
                        request.grant(request.getResources());
                        return;
                    }
                    permintaanKamera = request;
                    mintaIzin(new String[]{Manifest.permission.CAMERA}, REQ_KAMERA);
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                if (punyaIzin(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    callback.invoke(origin, true, false);
                    return;
                }
                callbackLokasi = callback;
                asalLokasi = origin;
                mintaIzin(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                }, REQ_LOKASI);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (callbackBerkas != null) callbackBerkas.onReceiveValue(null);
                callbackBerkas = callback;

                Intent pilih = new Intent(Intent.ACTION_GET_CONTENT);
                pilih.addCategory(Intent.CATEGORY_OPENABLE);
                pilih.setType(mimeUtama(params));
                Intent ambil = new Intent(Intent.ACTION_GET_CONTENT);
                ambil.addCategory(Intent.CATEGORY_OPENABLE);
                ambil.setType("*/*");
                try {
                    startActivityForResult(
                            Intent.createChooser(pilih, "Pilih berkas"), REQ_BERKAS);
                } catch (Exception e) {
                    callbackBerkas = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        if (state == null) web.loadUrl(ALAMAT);
        else web.restoreState(state);

        periksaVersiTerbaru();
    }

    /**
     * Bilah pembaruan: teks putih di atas hijau PINDAI, satu tombol Unduh.
     * Tombol membuka APK di peramban sistem — WebView tidak bisa memasang APK
     * sendiri, dan memasangnya butuh persetujuan pengguna.
     */
    private void siapkanBilahPembaruan() {
        float dp = getResources().getDisplayMetrics().density;
        int sisi = (int) (12 * dp);

        bilahPembaruan = new LinearLayout(this);
        bilahPembaruan.setOrientation(LinearLayout.HORIZONTAL);
        bilahPembaruan.setGravity(Gravity.CENTER_VERTICAL);
        bilahPembaruan.setBackgroundColor(Color.parseColor("#065F46"));
        bilahPembaruan.setPadding(sisi, (int) (8 * dp), sisi, (int) (8 * dp));
        bilahPembaruan.setVisibility(View.GONE);

        teksPembaruan = new TextView(this);
        teksPembaruan.setTextColor(Color.WHITE);
        teksPembaruan.setTextSize(13);
        teksPembaruan.setText("Versi baru PINDAI tersedia.");
        bilahPembaruan.addView(teksPembaruan, new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button tombol = new Button(this);
        tombol.setText("Unduh");
        tombol.setAllCaps(false);
        tombol.setTextColor(Color.parseColor("#065F46"));
        tombol.setBackgroundColor(Color.WHITE);
        tombol.setOnClickListener(v -> bukaDiLuar(Uri.parse(ALAMAT + "pindai.apk")));
        bilahPembaruan.addView(tombol, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    /**
     * Ambil `version.json` sekali per peluncuran. Jaringan gagal, JSON rusak,
     * atau `versionCode` kosong berarti tidak ada yang ditampilkan — cek versi
     * tidak boleh mengganggu pemakaian aplikasi.
     */
    private void periksaVersiTerbaru() {
        new Thread(() -> {
            int kode = 0;
            String nama = "";
            HttpURLConnection koneksi = null;
            try {
                koneksi = (HttpURLConnection) new URL(ALAMAT + "version.json").openConnection();
                koneksi.setConnectTimeout(5000);
                koneksi.setReadTimeout(5000);
                koneksi.setUseCaches(false);
                koneksi.setRequestProperty("Cache-Control", "no-cache");
                StringBuilder isi = new StringBuilder();
                try (BufferedReader baca = new BufferedReader(new InputStreamReader(
                        koneksi.getInputStream(), StandardCharsets.UTF_8))) {
                    String baris;
                    while ((baris = baca.readLine()) != null) isi.append(baris);
                }
                JSONObject json = new JSONObject(isi.toString());
                kode = json.optInt("versionCode", 0);
                nama = json.optString("versionName", "");
            } catch (Exception ignored) {
                return;
            } finally {
                if (koneksi != null) koneksi.disconnect();
            }

            if (kode <= VERSI_KODE) return;
            final String versi = nama;
            runOnUiThread(() -> {
                if (versi.isEmpty()) {
                    teksPembaruan.setText("Versi baru PINDAI tersedia.");
                } else {
                    teksPembaruan.setText("PINDAI " + versi + " tersedia.");
                }
                bilahPembaruan.setVisibility(View.VISIBLE);
            });
        }).start();
    }

    /**
     * Metode yang dipanggil halaman lewat `window.PindaiAndroid`.
     * Semuanya dijalankan di UI thread karena menyentuh WebView/PrintManager.
     */
    private class Jembatan {

        @JavascriptInterface
        public void cetak(final String html) {
            runOnUiThread(() -> {
                webCetak = new WebView(MainActivity.this);
                webCetak.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                        if (pm == null) return;
                        String judul = "PINDAI";
                        pm.print(judul,
                                view.createPrintDocumentAdapter(judul),
                                new PrintAttributes.Builder().build());
                    }
                });
                webCetak.loadDataWithBaseURL(ALAMAT, html, "text/html", "utf-8", null);
            });
        }

        @JavascriptInterface
        public void unduh(final String nama, final String mime, final String base64) {
            runOnUiThread(() -> {
                try {
                    byte[] data = Base64.decode(base64, Base64.DEFAULT);
                    simpanBerkas(nama, mime, data);
                    Toast.makeText(MainActivity.this,
                            "Tersimpan di Downloads: " + nama, Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this,
                            "Gagal menyimpan berkas", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void bukaLuar(final String url) {
            runOnUiThread(() -> bukaDiLuar(Uri.parse(url)));
        }
    }

    /**
     * Simpan byte ke folder Downloads. Android 10+ memakai MediaStore (tanpa
     * izin penyimpanan); versi lama memakai folder aplikasi agar tidak perlu
     * meminta izin tambahan.
     */
    private void simpanBerkas(String nama, String mime, byte[] data) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues nilai = new ContentValues();
            nilai.put(MediaStore.MediaColumns.DISPLAY_NAME, nama);
            nilai.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            nilai.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri tujuan = getContentResolver()
                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, nilai);
            if (tujuan == null) throw new IllegalStateException("Downloads tidak bisa ditulis");
            try (OutputStream keluar = getContentResolver().openOutputStream(tujuan)) {
                if (keluar == null) throw new IllegalStateException("Aliran kosong");
                keluar.write(data);
            }
            return;
        }
        File folder = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (folder == null) throw new IllegalStateException("Folder unduhan tidak ada");
        if (!folder.exists() && !folder.mkdirs()) {
            throw new IllegalStateException("Folder unduhan tidak bisa dibuat");
        }
        try (FileOutputStream keluar = new FileOutputStream(new File(folder, nama))) {
            keluar.write(data);
        }
    }

    /** MIME pertama dari atribut accept; jatuh ke semua berkas bila kosong. */
    private String mimeUtama(WebChromeClient.FileChooserParams params) {
        String[] diterima = params.getAcceptTypes();
        if (diterima != null) {
            for (String t : diterima) {
                if (t != null && t.contains("/") && !t.contains(",")) return t;
            }
        }
        return "*/*";
    }

    private void bukaDiLuar(Uri tujuan) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, tujuan));
        } catch (Exception ignored) {
            // Tidak ada aplikasi yang bisa membuka tautan ini; biarkan halaman.
        }
    }

    private boolean punyaIzin(String izin) {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(izin) == PackageManager.PERMISSION_GRANTED;
    }

    private void mintaIzin(String[] izin, int kode) {
        if (Build.VERSION.SDK_INT < 23) return;
        requestPermissions(izin, kode);
    }

    @Override
    public void onRequestPermissionsResult(int kode, String[] izin, int[] hasil) {
        super.onRequestPermissionsResult(kode, izin, hasil);
        boolean diberi = hasil.length > 0 && hasil[0] == PackageManager.PERMISSION_GRANTED;

        if (kode == REQ_KAMERA && permintaanKamera != null) {
            if (diberi) permintaanKamera.grant(permintaanKamera.getResources());
            else permintaanKamera.deny();
            permintaanKamera = null;
        }
        if (kode == REQ_LOKASI && callbackLokasi != null) {
            callbackLokasi.invoke(asalLokasi, diberi, false);
            callbackLokasi = null;
            asalLokasi = null;
        }
    }

    @Override
    protected void onActivityResult(int kode, int hasil, Intent data) {
        super.onActivityResult(kode, hasil, data);
        if (kode != REQ_BERKAS || callbackBerkas == null) return;

        Uri[] uris = null;
        if (hasil == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int jumlah = data.getClipData().getItemCount();
                uris = new Uri[jumlah];
                for (int i = 0; i < jumlah; i++) {
                    uris[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                uris = new Uri[]{data.getData()};
            }
        }
        callbackBerkas.onReceiveValue(uris);
        callbackBerkas = null;
    }

    @Override
    protected void onPause() {
        super.onPause();
        ditinggalPada = System.currentTimeMillis();
    }

    /**
     * Kembali dari aplikasi lain: muat ulang beranda bila sudah lama ditinggal,
     * supaya teks dan konfigurasi terbaru dari server terpakai. Halaman lain
     * (formulir, KYC) tidak dimuat ulang — isian yang sedang diketik jangan
     * hilang hanya karena pengguna sempat membuka WhatsApp.
     */
    @Override
    protected void onResume() {
        super.onResume();
        long lama = System.currentTimeMillis() - ditinggalPada;
        if (ditinggalPada == 0 || lama < JEDA_MUAT_ULANG_MS) return;
        if (!diBeranda()) return;
        ditinggalPada = 0;
        web.reload();
    }

    private boolean diBeranda() {
        String url = web.getUrl();
        if (url == null) return false;
        String dasar = ALAMAT.endsWith("/")
                ? ALAMAT.substring(0, ALAMAT.length() - 1)
                : ALAMAT;
        return url.equals(ALAMAT) || url.equals(dasar);
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
