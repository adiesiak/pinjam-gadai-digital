import { useMutation, useQuery } from "convex/react";
import {
  Loader2,
  MapPin,
  RefreshCw,
  Settings,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  izinSetelahGalatLokasi,
  LOKASI_KEBIJAKAN,
  labelUmurLokasi,
  pesanLokasiPalsu,
  type IzinLokasi,
} from "@/lib/lokasi";
import {
  bukaSetelanAplikasi,
  hentikanLayananLokasi,
  idPerangkat,
  kirimHeartbeatLatar,
  lingkunganNative,
  mulaiLayananLokasi,
  mulaiPelacakanLatar,
  muatTokenPerangkat,
  PELACAKAN_LATAR_OPSI,
  pluginLayananLokasi,
  pluginLokasiLatar,
  simpanTokenPerangkat,
  urlHeartbeatLokasi,
  versiAplikasi,
  type LayananLokasi,
  type PelacakanLatar,
} from "@/lib/native";

/**
 * URL deployment Convex — dipakai menurunkan endpoint HTTP heartbeat native.
 * `VITE_CONVEX_SITE_URL` opsional bila tim ingin menunjuk domain situs lain.
 */
const URL_CONVEX = import.meta.env.VITE_CONVEX_URL as string | undefined;
const URL_CONVEX_SITUS = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;

/**
 * Tenggang sebelum layanan native dianggap mati diam-diam (ms). Dua kali
 * interval heartbeat ditambah kelonggaran untuk fix GPS pertama.
 */
const TENGGANG_LAYANAN_MS = 120_000;

/** Selang pemeriksaan kesehatan layanan native (ms). */
const PERIKSA_LAYANAN_MS = 30_000;

/**
 * Gerbang lokasi wajib Peminjam.
 *
 * Selama gerbang menyala (Pengaturan Sistem → lokasiWajib), dashboard Peminjam
 * TIDAK bisa dipakai tanpa titik GPS yang mengalir: perangkat mengirim
 * heartbeat tiap ±60 detik ke server, dan server menolak semua aksi finansial
 * bila titik terakhir kedaluwarsa. Jadi mematikan lokasi = tidak bisa
 * bertransaksi — bukan sekadar peringatan.
 *
 * Dua jalur pemantauan:
 *  - Browser (`navigator.geolocation`): hanya mengalir selagi tab terbuka.
 *  - Aplikasi native (Capacitor, lihat `src/lib/native.ts`): memakai layanan
 *    lokasi latar belakang sehingga titik tetap terkirim saat layar terkunci.
 *    Perangkat juga mendaftarkan diri agar kebijakan `wajibAplikasiNative`
 *    mengenalinya — tanpa pendaftaran itu, pengguna aplikasi justru akan
 *    diminta "memasang aplikasi".
 *
 * Kebijakan "wajib aplikasi" (`wajibAplikasiNative`) diperiksa lebih dulu
 * daripada gerbang lokasi, mengikuti aturan server: transaksi hanya dilayani
 * bila titik lokasi TERAKHIR datang dari aplikasi. Karena itu nasabah yang
 * membuka PINDAI di browser ditahan di sini, bukan dibiarkan menekan tombol
 * lalu menerima error dari server.
 *
 * Batas yang ditampilkan jujur ke pengguna: browser tidak bisa memaksa tombol
 * GPS menyala dan tidak bisa melacak saat tab ditutup. Itu keterbatasan
 * platform, bukan pengaturan PINDAI.
 */
type StatusIzin = IzinLokasi;

export function LocationGate({
  children,
  aktif = true,
}: {
  children: React.ReactNode;
  aktif?: boolean;
}) {
  const status = useQuery(api.lokasi.statusSaya);
  const catat = useMutation(api.lokasi.catatLokasi);
  const daftarkan = useMutation(api.lokasi.daftarkanPerangkat);
  const { signOut } = useAuth();
  const [izin, setIzin] = useState<StatusIzin>("memeriksa");
  /**
   * Salinan `izin` untuk callback geolocation. Dibaca dari ref supaya handler
   * error tetap melihat keadaan terbaru tanpa membuat watcher ulang — dan supaya
   * error sementara tidak pernah menjatuhkan gerbang yang sudah siap.
   */
  const izinRef = useRef<StatusIzin>("memeriksa");
  useEffect(() => {
    izinRef.current = izin;
  }, [izin]);
  const [pesan, setPesan] = useState<string | null>(null);
  const [percobaanDaftar, setPercobaanDaftar] = useState(0);
  const watchRef = useRef<number | null>(null);
  const pelacakanRef = useRef<PelacakanLatar | null>(null);
  const kirimTerakhirRef = useRef(0);
  const versiRef = useRef<string | null>(null);
  // Nomor urut pemanggilan pemantauan — membuang watcher yang sudah usang.
  const generasiRef = useRef(0);
  /** Layanan lokasi native yang sedang jadi sumber titik (null = jalur lain). */
  const layananRef = useRef<LayananLokasi | null>(null);
  const layananMulaiRef = useRef(0);
  /** Salinan status server untuk pemeriksaan berkala (tanpa setState). */
  const statusRef = useRef<{ segar: boolean; umurMenit: number | null; batasMenit: number } | null>(
    null,
  );
  const catatRef = useRef(catat);
  const daftarkanRef = useRef(daftarkan);
  useEffect(() => {
    catatRef.current = catat;
    daftarkanRef.current = daftarkan;
  }, [catat, daftarkan]);

  // Lingkungan native & identitas perangkat dihitung sekali saat mount. Di
  // browser nilainya netral ("web"/null) sehingga perilaku web tidak berubah.
  const [perangkat] = useState(() => {
    const platform = lingkunganNative();
    return { native: platform !== "web", platform, deviceId: idPerangkat() };
  });
  /**
   * Token perangkat untuk endpoint HTTP heartbeat. Diisi dari penyimpanan aman
   * perangkat (Keychain/EncryptedSharedPreferences) oleh efek pendaftaran, lalu
   * diperbarui dengan token terbaru dari server — pembacaannya asinkron.
   */
  const tokenRef = useRef<string | null>(null);

  // Browser tanpa layanan lokasi dideteksi saat render — bukan lewat efek,
  // sehingga efek di bawah murni memulai pemantauan tanpa setState.
  const didukung = typeof navigator !== "undefined" && Boolean(navigator.geolocation);

  /** Kirim satu titik ke server — dibatasi interval agar hemat kuota. */
  const kirimTitik = useCallback(
    (lat: number, lng: number, akurasiMeter: number, mock?: boolean) => {
      const now = Date.now();
      if (now - kirimTerakhirRef.current < LOKASI_KEBIJAKAN.intervalDetik * 1000) return;
      kirimTerakhirRef.current = now;

      /** Jalur sesi (WebSocket Convex) — selalu tersedia. */
      const kirimLewatSesi = () => {
        void catatRef
          .current({
            lat,
            lng,
            akurasi: akurasiMeter,
            sumber: perangkat.native ? "aplikasi" : "web",
            platform: perangkat.platform,
            versiApp: versiRef.current ?? undefined,
            deviceId: perangkat.deviceId ?? undefined,
            mock: mock === true ? true : undefined,
          })
          .catch((err: unknown) => {
            const teks =
              err instanceof Error ? err.message : "Gagal mengirim titik lokasi ke server.";
            // Server menolak titik dari mock location; bedakan dari GPS mati
            // supaya instruksi yang tampil benar (matikan aplikasi lokasi
            // palsu, bukan "nyalakan GPS").
            if (pesanLokasiPalsu(teks)) setIzin("palsu");
            setPesan(teks);
          });
      };

      // Aplikasi native: kirim lewat HTTP native lebih dulu. Permintaan dari
      // WebView dibatasi Android setelah ±5 menit di latar belakang, sedangkan
      // HTTP native tidak — inilah yang menjaga lokasi tetap mengalir saat
      // layar terkunci. Bila gagal, titik tetap dikirim lewat jalur sesi.
      const url = perangkat.native ? urlHeartbeatLokasi(URL_CONVEX, URL_CONVEX_SITUS) : null;
      const token = tokenRef.current;
      if (url !== null && token !== null) {
        void kirimHeartbeatLatar(
          url,
          token,
          { lat, lng, akurasi: akurasiMeter, mock },
          { platform: perangkat.platform, versiApp: versiRef.current },
        ).then((hasil) => {
          if (!hasil.ok) kirimLewatSesi();
        });
        return;
      }
      kirimLewatSesi();
    },
    [perangkat],
  );

  /**
   * Jalur browser — hanya mengalir selama tab terbuka.
   * API `navigator.geolocation` tidak melaporkan mock location, jadi penipuan
   * di sini hanya bisa ditangkap heuristik server (akurasi mustahil, lompatan
   * tidak wajar, koordinat beku).
   */
  const mulaiWatchBrowser = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setIzin("siap");
        kirimTitik(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        // 1 = izin ditolak/blokir; 2 = posisi tidak tersedia; 3 = timeout.
        // Hanya penolakan izin yang boleh menutup gerbang yang sudah siap.
        const berikutnya = izinSetelahGalatLokasi(izinRef.current, err.code === 1);
        if (berikutnya !== null) setIzin(berikutnya);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
  }, [kirimTitik]);

  /** Jalur cadangan: plugin lokasi latar belakang + heartbeat dari WebView. */
  const mulaiWatchDalamAplikasi = useCallback(() => {
    // Dibaca tanpa menaikkan nomor urut: `mulaiWatch` sudah menaikkannya, dan
    // jalur pemulihan memanggil fungsi ini di luar `mulaiWatch`.
    const generasi = generasiRef.current;
    if (!perangkat.native || pluginLokasiLatar() === null) {
      mulaiWatchBrowser();
      return;
    }
    void mulaiPelacakanLatar(
      (titik) => {
        setIzin("siap");
        kirimTitik(titik.lat, titik.lng, titik.akurasi, titik.mock);
      },
      (pesanGalat) => {
        // Bedakan izin ditolak dari GPS mati — instruksi perbaikannya berbeda.
        // Aturan "gerbang yang sudah siap tidak ditutup oleh galat sementara"
        // sama dengan jalur browser (`izinSetelahGalatLokasi`).
        const ditolak = /NOT_AUTHORIZED|PERMISSION|DENIED/i.test(pesanGalat);
        const berikutnya = izinSetelahGalatLokasi(izinRef.current, ditolak);
        if (berikutnya !== null) setIzin(berikutnya);
      },
    ).then((pelacakan) => {
      // `visibilitychange` dan `focus` sering memicu dua kali beruntun. Bila
      // panggilan yang lebih baru sudah menggantikan yang ini, watcher lama
      // WAJIB dihentikan — kalau tidak, dua pemantauan berjalan bersamaan dan
      // menguras baterai sampai komponen dilepas.
      if (generasi !== generasiRef.current) {
        if (pelacakan !== null) void pelacakan.hentikan().catch(() => undefined);
        return;
      }
      if (pelacakan === null) {
        // Plugin ada tetapi gagal start — jangan biarkan pengguna tanpa
        // pemantauan sama sekali; jalur browser tetap lebih baik daripada nol.
        mulaiWatchBrowser();
        return;
      }
      pelacakanRef.current = pelacakan;
    });
  }, [kirimTitik, mulaiWatchBrowser, perangkat.native]);

  /**
   * Mulai memantau posisi. Urutan pilihan:
   *  1. **Layanan lokasi PINDAI** (foreground service Android / Background
   *     Modes iOS) — memegang GPS dan mengirim heartbeat SENDIRI, jadi tetap
   *     jalan walau WebView di-pause Android.
   *  2. Plugin lokasi latar belakang + heartbeat dari WebView (CapacitorHttp).
   *  3. `navigator.geolocation` di browser biasa.
   * State hanya ditulis dari callback, bukan dari badan efek.
   */
  const mulaiWatch = useCallback(() => {
    const generasi = (generasiRef.current += 1);
    if (watchRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (pelacakanRef.current !== null) {
      const lama = pelacakanRef.current;
      pelacakanRef.current = null;
      void lama.hentikan().catch(() => undefined);
    }

    const layanan = perangkat.native ? pluginLayananLokasi() : null;
    const url = perangkat.native ? urlHeartbeatLokasi(URL_CONVEX, URL_CONVEX_SITUS) : null;
    const token = tokenRef.current;
    if (layanan !== null && url !== null && token !== null) {
      void mulaiLayananLokasi(layanan, {
        url,
        token,
        intervalDetik: LOKASI_KEBIJAKAN.intervalDetik,
        jarakMeter: PELACAKAN_LATAR_OPSI.filterJarakMeter,
      }).then((hasil) => {
        if (generasi !== generasiRef.current) {
          // Sudah digantikan pemanggilan yang lebih baru — jangan tinggalkan
          // layanan tanpa pemilik.
          if (hasil.aktif) void hentikanLayananLokasi(layanan);
          return;
        }
        if (hasil.aktif) {
          layananRef.current = layanan;
          layananMulaiRef.current = Date.now();
          setIzin("siap");
          return;
        }
        // Layanan menolak menyala (izin "Selalu" belum diberikan, plugin belum
        // dibangun, dsb) → pakai jalur cadangan supaya nasabah tetap terlacak.
        if (hasil.pesan !== null) setPesan(hasil.pesan);
        mulaiWatchDalamAplikasi();
      });
      return;
    }
    mulaiWatchDalamAplikasi();
  }, [mulaiWatchDalamAplikasi, perangkat.native]);

  // Gerbang dianggap aktif bila salah satu kebijakan menyala. "Wajib aplikasi"
  // ikut dihitung walau gerbang lokasi dimatikan admin: server tetap menuntut
  // titik dari aplikasi, jadi pemantauan harus tetap berjalan agar transaksi
  // pengguna aplikasi tidak ditolak tanpa sebab yang terlihat.
  const gerbangAktif =
    aktif &&
    didukung &&
    status !== undefined &&
    !status.pratinjau &&
    (status.wajib !== false || status.wajibAplikasiNative);

  /**
   * Tombol “Coba lagi” & saat kembali ke tab: pantau ulang.
   *
   * `lembut` dipakai saat halaman kembali terlihat (galeri/kamera/aplikasi lain
   * ditutup). Di jalur itu layar "memeriksa" TIDAK dipasang selama gerbang sudah
   * siap: mengganti isi halaman dengan layar gerbang melepas formulir yang sedang
   * diisi, dan itu yang membuat pengajuan ter-reset setiap kali memilih berkas.
   */
  const cobaLagi = useCallback(
    (lembut = false) => {
      setPesan(null);
      if (!lembut || izinRef.current !== "siap") setIzin("memeriksa");
      mulaiWatch();
    },
    [mulaiWatch],
  );

  /** Ulangi pendaftaran perangkat bila gagal (mis. jaringan terputus). */
  const cobaLagiDaftar = useCallback(() => {
    setPesan(null);
    setPercobaanDaftar((n) => n + 1);
  }, []);

  /**
   * Keluar dari akun: hentikan layanan native dulu.
   * Layanan membawa token akun yang sedang masuk — membiarkannya hidup setelah
   * keluar berarti perangkat terus melapor atas nama akun lama.
   */
  const keluar = useCallback(() => {
    const layanan = layananRef.current;
    layananRef.current = null;
    if (layanan !== null) void hentikanLayananLokasi(layanan);
    void signOut();
  }, [signOut]);

  /**
   * Buka Setelan perangkat. Perlu tombol, bukan hanya instruksi tertulis:
   * ada kondisi di mana menekan "Coba lagi" tidak akan pernah berhasil —
   * di iOS, memilih "Izinkan Sekali" membuat permintaan izin "Selalu"
   * berikutnya diabaikan sistem.
   */
  const bukaSetelan = useCallback(() => {
    const layanan = pluginLayananLokasi();
    if (layanan === null) return;
    void bukaSetelanAplikasi(layanan);
  }, []);

  // Tombol Setelan hanya berguna bila plugin layanan PINDAI ikut dibangun.
  const adaTombolSetelan = perangkat.native && pluginLayananLokasi() !== null;

  // Aplikasi native mendaftarkan perangkatnya agar kebijakan "wajib aplikasi"
  // mengenali perangkat ini.
  //
  // PENTING: pendaftaran TIDAK boleh bergantung pada `gerbangAktif`. Bila admin
  // mematikan `lokasiWajib` sementara `wajibAplikasiNative` menyala, pengguna
  // aplikasi akan terjebak selamanya di layar "mendaftarkan perangkat" —
  // layar itu muncul dari keadaan server, sedangkan pendaftarannya di-skip.
  useEffect(() => {
    // Pratinjau admin: perangkat admin bukan perangkat nasabah. Jangan daftarkan,
    // dan jangan mulai layanan lokasi native — layanan itu mengirim lewat token
    // perangkat di luar jalur sesi, sehingga pagar server tidak menjangkaunya.
    if (!aktif || !perangkat.native || status === undefined || status.pratinjau) return;
    const deviceId = perangkat.deviceId;
    if (deviceId === null) return;
    let dibatalkan = false;
    void (async () => {
      versiRef.current = await versiAplikasi();
      // Token tersimpan dimuat lebih dulu supaya heartbeat bisa lewat HTTP
      // native walau pendaftaran ulang belum selesai (mis. jaringan lambat).
      tokenRef.current = await muatTokenPerangkat();
      if (dibatalkan) return;
      try {
        const hasil = await daftarkanRef.current({
          deviceId,
          platform: perangkat.platform,
          versiApp: versiRef.current ?? "tidak diketahui",
        });
        // Token dipakai mengirim titik tanpa sesi (layanan lokasi), termasuk
        // saat aplikasi di latar belakang. Disimpan di penyimpanan aman
        // perangkat agar app tidak perlu mendaftar ulang setiap kali dibuka.
        //
        // Token null berarti pendaftaran dilewati (sesi pratinjau admin):
        // jangan menimpa token yang sudah tersimpan — itu milik perangkat
        // admin sendiri, bukan milik akun yang sedang dipratinjau.
        if (hasil.token !== null) {
          tokenRef.current = hasil.token;
          await simpanTokenPerangkat(hasil.token);
        }
      } catch (err) {
        if (dibatalkan) return;
        setPesan(
          err instanceof Error ? err.message : "Gagal mendaftarkan perangkat aplikasi.",
        );
      }
    })();
    return () => {
      dibatalkan = true;
    };
  }, [aktif, perangkat, percobaanDaftar, status?.pratinjau]);

  // Salinan status server untuk pemeriksaan layanan berkala di bawah.
  useEffect(() => {
    statusRef.current =
      status === undefined
        ? null
        : { segar: status.segar, umurMenit: status.umurMenit, batasMenit: status.batasMenit };
  }, [status]);

  useEffect(() => {
    if (!gerbangAktif) return;
    // Memulai pemantauan tanpa setState langsung di badan effect.
    mulaiWatch();
    return () => {
      // Batalkan panggilan yang masih berjalan: bila `addWatcher` belum selesai
      // saat komponen dilepas, hasilnya harus dibuang dan dihentikan — kalau
      // tidak, layanan lokasi latar belakang terus hidup tanpa pemilik.
      generasiRef.current += 1;
      if (watchRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (pelacakanRef.current !== null) {
        const lama = pelacakanRef.current;
        pelacakanRef.current = null;
        void lama.hentikan().catch(() => undefined);
      }
    };
  }, [gerbangAktif, mulaiWatch]);

  // Kembali ke tab / fokus → langsung ambil & kirim titik baru (lokasi sering
  // dimatikan saat aplikasi tidak dipakai, jadi tiap kembali harus dicek ulang).
  useEffect(() => {
    if (!gerbangAktif) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      kirimTerakhirRef.current = 0;
      cobaLagi(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [gerbangAktif, cobaLagi]);

  // Layanan native hidup selama gerbang menyala. Sengaja TIDAK dihentikan saat
  // komponen dilepas: justru itu intinya — titik tetap terkirim walau aplikasi
  // di latar belakang atau halaman ditutup.
  useEffect(() => {
    if (gerbangAktif) return;
    const layanan = layananRef.current;
    if (layanan === null) return;
    layananRef.current = null;
    void hentikanLayananLokasi(layanan);
  }, [gerbangAktif]);

  /**
   * Layanan native bisa berhenti diam-diam (izin lokasi dicabut, proses
   * dihentikan sistem, atau plugin belum ikut dibangun). Karena WebView tidak
   * lagi mengirim titik saat layanan aktif, matinya layanan harus dideteksi —
   * kalau tidak, nasabah hanya melihat pil "titik terakhir …" tanpa tahu
   * kenapa transaksinya ditolak. Setelah tenggang, jalur cadangan dinyalakan
   * sehingga tidak ada nasabah yang terkunci tanpa jalan keluar.
   */
  useEffect(() => {
    if (!gerbangAktif) return;
    const periksa = window.setInterval(() => {
      const layanan = layananRef.current;
      if (layanan === null) return;
      if (Date.now() - layananMulaiRef.current < TENGGANG_LAYANAN_MS) return;
      const server = statusRef.current;
      if (server === null || server.segar) return;
      if (server.umurMenit === null || server.umurMenit <= server.batasMenit) return;
      layananRef.current = null;
      void hentikanLayananLokasi(layanan);
      mulaiWatchDalamAplikasi();
    }, PERIKSA_LAYANAN_MS);
    return () => window.clearInterval(periksa);
  }, [gerbangAktif, mulaiWatchDalamAplikasi]);

  if (!aktif) return <>{children}</>;

  if (status === undefined) {
    return (
      <LayarPenuh>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </LayarPenuh>
    );
  }

  // Pratinjau admin melewati gerbang TANPA memantau lokasi. Titik dari
  // perangkat admin bukan milik akun yang sedang dibuka: kalau dibaca dan
  // dikirim, lokasi nasabah asli tertimpa (server menolaknya, tetapi membaca
  // GPS admin tetap tidak perlu). Bilah pratinjau di atas layar sudah
  // menjelaskan bahwa sesi ini bukan sesi nasabah.
  if (status.pratinjau) return <>{children}</>;

  // Kebijakan "wajib aplikasi" diperiksa LEBIH DULU daripada gerbang lokasi:
  // server menolak transaksi berdasarkan kebijakan ini walau gerbang lokasi
  // dimatikan admin, sehingga UI tidak boleh membiarkan nasabah masuk ke
  // dashboard yang transaksinya pasti gagal.
  if (status.wajibAplikasiNative) {
    // Sudah memakai aplikasi native, pendaftaran perangkat sedang diproses.
    if (perangkat.native && !status.perangkatTerdaftar) {
      return (
        <LayarPenuh>
          <div className="flex flex-col items-center gap-3 text-center">
            {pesan === null ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <ShieldAlert className="size-5 text-destructive" />
            )}
            <p className="text-xs text-muted-foreground">
              {pesan === null
                ? "Mendaftarkan perangkat aplikasi PINDAI…"
                : "Perangkat belum berhasil didaftarkan"}
            </p>
            {pesan && (
              <p className="max-w-xs rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {pesan}
              </p>
            )}
            {pesan !== null && (
              <Button className="h-11" onClick={cobaLagiDaftar}>
                <RefreshCw className="mr-1.5 size-4" /> Coba lagi
              </Button>
            )}
          </div>
        </LayarPenuh>
      );
    }

    if (!perangkat.native) {
      // Belum pernah memasang aplikasi → ajak memasang.
      if (!status.perangkatTerdaftar) {
        return (
          <LayarPenuh>
            <Kartu
              ikon={<Smartphone className="size-5" />}
              kode="Wajib aplikasi PINDAI"
              judul="Pasang aplikasi untuk melanjutkan"
              deskripsi="Akses ke fitur ini mensyaratkan aplikasi native sesuai pengaturan akun. Aplikasi dapat mengirim koordinat di latar belakang sebagai metadata perangkat."
            >
              <DaftarLangkah
                langkah={[
                  "Pasang aplikasi PINDAI dari Play Store / App Store (tautan diberikan tim PINDAI).",
                  "Buka PINDAI dari aplikasi tersebut, lalu masuk dengan akun yang sama.",
                  "Saat diminta, izinkan lokasi dengan pilihan \"Selalu\" agar pemantauan berjalan di latar belakang.",
                ]}
              />
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                Situs web tidak dapat memantau lokasi setelah tab ditutup. Itu keterbatasan
                browser, bukan pengaturan PINDAI.
              </p>
              <TombolKeluar onKeluar={keluar} />
            </Kartu>
          </LayarPenuh>
        );
      }

      // Perangkat sudah pernah terdaftar, tetapi titik lokasi terakhir datang
      // dari browser. Server menolak transaksi dari sumber ini, jadi halaman
      // ini menahan lebih awal alih-alih membiarkan nasabah menekan tombol dan
      // menerima error.
      if (status.sumber === "web") {
        return (
          <LayarPenuh>
            <Kartu
              ikon={<Smartphone className="size-5" />}
              kode="Akses melalui aplikasi"
              judul="Buka PINDAI dari aplikasi"
              deskripsi="Perangkat ini tercatat pernah didaftarkan, tetapi titik terakhir dilaporkan dari browser. Gerbang akses ini meminta titik baru melalui aplikasi sebagai metadata perangkat."
            >
              <DaftarLangkah
                langkah={[
                  "Buka aplikasi PINDAI di HP dengan akun yang sama.",
                  "Tutup tab PINDAI di browser ini agar tab tersebut tidak terus memperbarui koordinat dari browser.",
                  "Setelah aplikasi melaporkan titik koordinat baru (≤60 detik), status gerbang akses diperbarui.",
                ]}
              />
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                Aplikasi dapat mengirim koordinat di latar belakang; aturan ini hanya mengatur akses ke fitur ini. Koordinat yang dilaporkan dicatat sebagai metadata perangkat. Itu keterbatasan browser, bukan pengaturan PINDAI.
              </p>
              <TombolKeluar onKeluar={keluar} />
            </Kartu>
          </LayarPenuh>
        );
      }
    }
  }

  if (status.wajib === false) return <>{children}</>;

  if (izin === "siap") return <>{children}</>;

  // Lokasi terdeteksi berasal dari aplikasi lokasi palsu: instruksinya sama
  // sekali berbeda dari "nyalakan GPS", jadi layarnya dipisah.
  if (izin === "palsu") {
    return (
      <LayarPenuh>
        <Kartu
          ikon={<ShieldAlert className="size-5" />}
          kode="Koordinat perlu diperiksa"
          judul="Periksa setelan lokasi perangkat"
          deskripsi="Gerbang dapat menolak koordinat yang ditandai perangkat sebagai mock location atau pola tertentu. Ini pemeriksaan metadata otomatis pada koordinat yang dilaporkan."
        >
          <DaftarLangkah
            langkah={[
              "Pastikan tidak ada aplikasi pengubah lokasi (fake GPS) yang aktif di HP ini.",
              "Android: Setelan → Opsi pengembang → matikan “Pilih aplikasi lokasi palsu”.",
              "Nyalakan ulang HP bila perlu, lalu ketuk “Coba lagi” di halaman ini.",
            ]}
          />
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Titik baru dapat memperbarui status gerbang akses. Koordinat yang dilaporkan dicatat sebagai metadata perangkat.
          </p>
          {pesan && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {pesan}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button className="h-11" onClick={() => cobaLagi()}>
              <RefreshCw className="mr-1.5 size-4" /> Coba lagi
            </Button>
            <Button variant="outline" className="h-11" onClick={keluar}>
              Keluar dari akun
            </Button>
          </div>
        </Kartu>
      </LayarPenuh>
    );
  }

  const diagnosis =
    !didukung
      ? "Perangkat/browser ini tidak menyediakan layanan lokasi. Gunakan Chrome/Safari versi terbaru."
      : izin === "memeriksa"
        ? "Menunggu izin & sinyal GPS dari perangkat…"
        : izin === "ditolak"
          ? perangkat.native
            ? "Izin lokasi aplikasi PINDAI ditolak/blokir."
            : "Izin lokasi untuk situs ini diblokir/ditolak."
          : "GPS perangkat tampak tidak aktif atau sinyal tidak ditemukan.";

  return (
    <LayarPenuh>
      <Kartu
        ikon={<MapPin className="size-5" />}
        kode="Lokasi wajib aktif"
        judul="Nyalakan lokasi untuk melanjutkan"
        deskripsi="Untuk membuka dashboard, gerbang ini meminta koordinat terbaru yang dilaporkan perangkat. Gerbang hanya memeriksa kebaruan koordinat yang dilaporkan perangkat."
      >
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          <ShieldAlert className="mr-1.5 inline size-3.5 align-[-2px]" />
          {diagnosis}
          {status.umurMenit !== null && (
            <>
              {" "}
              Koordinat terakhir diterima server {labelUmurLokasi(status.umurMenit)} (batas{" "}
              {status.batasMenit} menit).
            </>
          )}
        </p>
        <DaftarLangkah
          langkah={
            perangkat.native
              ? [
                  "Buka Setelan HP → Lokasi → Aktifkan.",
                  "Setelan → Aplikasi → PINDAI → Izin → Lokasi → pilih “Izinkan sepanjang waktu”.",
                  "Kembali ke aplikasi, lalu ketuk “Coba lagi”.",
                ]
              : [
                  "Android: Setelan → Lokasi → Aktifkan, lalu izinkan lokasi untuk browser ini.",
                  "iPhone: Setelan → Privasi & Keamanan → Layanan Lokasi → (Safari/Chrome) → Saat Menggunakan App.",
                  "Ketuk “Coba lagi”, lalu biarkan halaman ini terbuka saat menggunakan dashboard.",
                ]
          }
        />
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          {perangkat.native
            ? "Setelah izin “sepanjang waktu” diberikan, lokasi tetap terkirim walau layar terkunci atau Anda berpindah aplikasi."
            : "Di browser, lokasi hanya terkirim selama halaman ini terbuka. Pasang aplikasi PINDAI untuk pemantauan latar belakang."}{" "}
          Izin lokasi memungkinkan perangkat mengirim koordinat agar status gerbang akses dapat diperbarui. Koordinat yang dilaporkan dicatat sebagai metadata perangkat.
        </p>
        {pesan && (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {pesan}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button className="h-11" onClick={() => cobaLagi()}>
            <RefreshCw className="mr-1.5 size-4" /> Coba lagi
          </Button>
          {adaTombolSetelan && (
            <Button variant="outline" className="h-11" onClick={bukaSetelan}>
              <Settings className="mr-1.5 size-4" /> Buka Setelan
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={keluar}>
            Keluar dari akun
          </Button>
        </div>
      </Kartu>
    </LayarPenuh>
  );
}

function LayarPenuh({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900 sm:px-6 sm:py-16">
      {children}
    </div>
  );
}

function Kartu({
  ikon,
  kode,
  judul,
  deskripsi,
  children,
}: {
  ikon: React.ReactNode;
  kode: string;
  judul: string;
  deskripsi: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
      <span className="clay-icon-blue inline-flex size-11 items-center justify-center">
        {ikon}
      </span>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {kode}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{judul}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{deskripsi}</p>
      <div className="mt-5 text-left">{children}</div>
    </div>
  );
}

function DaftarLangkah({ langkah }: { langkah: readonly string[] }) {
  return (
    <ol className="mt-4 space-y-2 text-xs leading-5 text-slate-600">
      {langkah.map((t, i) => (
        <li key={t} className="flex gap-2">
          <span className="font-semibold tabular-nums text-primary">{i + 1}.</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function TombolKeluar({ onKeluar }: { onKeluar: () => void }) {
  return (
    <Button variant="outline" className="mt-5 h-11 w-full" onClick={onKeluar}>
      Keluar dari akun
    </Button>
  );
}
