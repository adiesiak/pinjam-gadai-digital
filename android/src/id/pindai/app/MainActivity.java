package id.pindai.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
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
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

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
    private static final String ALAMAT = "https://better-spoons-create.freebuff.dev/";
    private static final String HOST = "better-spoons-create.freebuff.dev";

    private static final int REQ_KAMERA = 7001;
    private static final int REQ_LOKASI = 7002;
    private static final int REQ_BERKAS = 7003;

    private WebView web;
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
        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

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
        s.setUserAgentString(s.getUserAgentString() + " PINDAIApp/1.0");

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
