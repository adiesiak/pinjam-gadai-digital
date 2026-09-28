import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2, MapPin, RefreshCw, ShieldAlert, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { LOKASI_KEBIJAKAN, labelUmurLokasi } from "@/lib/lokasi";
import {
  bacaTokenPerangkat,
  idPerangkat,
  kirimHeartbeatLatar,
  lingkunganNative,
  mulaiPelacakanLatar,
  pluginLokasiLatar,
  simpanTokenPerangkat,
  urlHeartbeatLokasi,
  versiAplikasi,
  type PelacakanLatar,
} from "@/lib/native";

/**
 * URL deployment Convex — dipakai menurunkan endpoint HTTP heartbeat native.
 * `VITE_CONVEX_SITE_URL` opsional bila tim ingin menunjuk domain situs lain.
 */
const URL_CONVEX = import.meta.env.VITE_CONVEX_URL as string | undefined;
const URL_CONVEX_SITUS = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;

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
type StatusIzin = "memeriksa" | "siap" | "ditolak" | "mati";

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
  const [pesan, setPesan] = useState<string | null>(null);
  const [akurasi, setAkurasi] = useState<number | null>(null);
  const [percobaanDaftar, setPercobaanDaftar] = useState(0);
  const watchRef = useRef<number | null>(null);
  const pelacakanRef = useRef<PelacakanLatar | null>(null);
  const kirimTerakhirRef = useRef(0);
  const versiRef = useRef<string | null>(null);
  // Nomor urut pemanggilan pemantauan — membuang watcher yang sudah usang.
  const generasiRef = useRef(0);
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
    return {
      native: platform !== "web",
      platform,
      deviceId: idPerangkat(),
      token: bacaTokenPerangkat(),
    };
  });
  /** Token perangkat untuk endpoint HTTP heartbeat (diperbarui saat mendaftar). */
  const tokenRef = useRef<string | null>(perangkat.token);

  // Browser tanpa layanan lokasi dideteksi saat render — bukan lewat efek,
  // sehingga efek di bawah murni memulai pemantauan tanpa setState.
  const didukung = typeof navigator !== "undefined" && Boolean(navigator.geolocation);

  /** Kirim satu titik ke server — dibatasi interval agar hemat kuota. */
  const kirimTitik = useCallback(
    (lat: number, lng: number, akurasiMeter: number) => {
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
          })
          .catch((err: unknown) => {
            setPesan(
              err instanceof Error ? err.message : "Gagal mengirim titik lokasi ke server.",
            );
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
          { lat, lng, akurasi: akurasiMeter },
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

  /** Jalur browser — hanya mengalir selama tab terbuka. */
  const mulaiWatchBrowser = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setIzin("siap");
        setAkurasi(pos.coords.accuracy);
        kirimTitik(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        // 1 = izin ditolak/blokir, 2 = posisi tidak tersedia (GPS mati), 3 = timeout.
        setIzin(err.code === 1 ? "ditolak" : "mati");
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
  }, [kirimTitik]);

  /**
   * Mulai memantau posisi: pakai layanan latar belakang aplikasi native bila
   * tersedia, kalau tidak jatuh ke `navigator.geolocation`. State hanya ditulis
   * dari callback GPS, bukan dari badan efek.
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
    if (!perangkat.native || pluginLokasiLatar() === null) {
      mulaiWatchBrowser();
      return;
    }
    void mulaiPelacakanLatar(
      (titik) => {
        setIzin("siap");
        setAkurasi(titik.akurasi);
        kirimTitik(titik.lat, titik.lng, titik.akurasi);
      },
      (pesanGalat) => {
        // Bedakan izin ditolak dari GPS mati — instruksi perbaikannya berbeda.
        setIzin(/NOT_AUTHORIZED|PERMISSION|DENIED/i.test(pesanGalat) ? "ditolak" : "mati");
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

  // Gerbang dianggap aktif bila salah satu kebijakan menyala. "Wajib aplikasi"
  // ikut dihitung walau gerbang lokasi dimatikan admin: server tetap menuntut
  // titik dari aplikasi, jadi pemantauan harus tetap berjalan agar transaksi
  // pengguna aplikasi tidak ditolak tanpa sebab yang terlihat.
  const gerbangAktif =
    aktif &&
    didukung &&
    status !== undefined &&
    (status.wajib !== false || status.wajibAplikasiNative);

  /** Tombol “Coba lagi” & saat kembali ke tab: reset lalu pantau ulang. */
  const cobaLagi = useCallback(() => {
    setPesan(null);
    setIzin("memeriksa");
    mulaiWatch();
  }, [mulaiWatch]);

  /** Ulangi pendaftaran perangkat bila gagal (mis. jaringan terputus). */
  const cobaLagiDaftar = useCallback(() => {
    setPesan(null);
    setPercobaanDaftar((n) => n + 1);
  }, []);

  // Aplikasi native mendaftarkan perangkatnya agar kebijakan "wajib aplikasi"
  // mengenali perangkat ini.
  //
  // PENTING: pendaftaran TIDAK boleh bergantung pada `gerbangAktif`. Bila admin
  // mematikan `lokasiWajib` sementara `wajibAplikasiNative` menyala, pengguna
  // aplikasi akan terjebak selamanya di layar "mendaftarkan perangkat" —
  // layar itu muncul dari keadaan server, sedangkan pendaftarannya di-skip.
  useEffect(() => {
    if (!aktif || !perangkat.native) return;
    const deviceId = perangkat.deviceId;
    if (deviceId === null) return;
    let dibatalkan = false;
    void (async () => {
      versiRef.current = await versiAplikasi();
      try {
        const hasil = await daftarkanRef.current({
          deviceId,
          platform: perangkat.platform,
          versiApp: versiRef.current ?? "tidak diketahui",
        });
        // Token dipakai mengirim titik tanpa sesi (layanan lokasi), termasuk
        // saat aplikasi di latar belakang. Disimpan agar app tidak perlu
        // mendaftar ulang setiap kali dibuka.
        tokenRef.current = hasil.token;
        simpanTokenPerangkat(hasil.token);
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
  }, [aktif, perangkat, percobaanDaftar]);

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
      cobaLagi();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [gerbangAktif, cobaLagi]);

  if (!aktif) return <>{children}</>;

  if (status === undefined) {
    return (
      <LayarPenuh>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </LayarPenuh>
    );
  }

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
              deskripsi="Transaksi PINDAI kini hanya dilayani dari aplikasi resmi, karena hanya aplikasi yang dapat memantau lokasi di latar belakang saat layar terkunci atau berpindah aplikasi."
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
              <TombolKeluar onKeluar={() => void signOut()} />
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
              kode="Transaksi hanya dari aplikasi"
              judul="Buka PINDAI dari aplikasi"
              deskripsi="Perangkat ini sudah terdaftar di aplikasi PINDAI, tetapi aktivitas lokasi terakhir tercatat dari browser. PINDAI hanya melayani transaksi yang disertai pemantauan lokasi dari aplikasi resmi."
            >
              <DaftarLangkah
                langkah={[
                  "Buka aplikasi PINDAI di HP dengan akun yang sama.",
                  "Tutup tab PINDAI di browser ini — tab yang masih terbuka terus mengirim titik lokasi dari browser dan menahan transaksi Anda.",
                  "Setelah aplikasi mengirim titik lokasi (≤60 detik), halaman ini terbuka sendiri.",
                ]}
              />
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                Lokasi hanya dapat dipantau di latar belakang oleh aplikasi resmi, sehingga
                transaksi harus berasal dari sana. Itu keterbatasan browser, bukan pengaturan
                PINDAI.
              </p>
              <TombolKeluar onKeluar={() => void signOut()} />
            </Kartu>
          </LayarPenuh>
        );
      }
    }
  }

  if (status.wajib === false) return <>{children}</>;

  if (izin === "siap") {
    return (
      <>
        {children}
        <PilLokasi
          akurasi={akurasi}
          segar={status.segar}
          umurMenit={status.umurMenit}
          latarBelakang={perangkat.native}
        />
      </>
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
        deskripsi="PINDAI hanya melayani pengajuan, cicilan, dan pelunasan saat lokasi perangkat aktif. Ini melindungi Anda dan Pendana dari pengajuan oleh pihak lain."
      >
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          <ShieldAlert className="mr-1.5 inline size-3.5 align-[-2px]" />
          {diagnosis}
          {status.umurMenit !== null && (
            <>
              {" "}
              Titik terakhir diterima server {labelUmurLokasi(status.umurMenit)} (batas{" "}
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
                  "Ketuk “Coba lagi”, lalu biarkan halaman ini terbuka saat bertransaksi.",
                ]
          }
        />
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          {perangkat.native
            ? "Setelah izin “sepanjang waktu” diberikan, lokasi tetap terkirim walau layar terkunci atau Anda berpindah aplikasi."
            : "Di browser, lokasi hanya terkirim selama halaman ini terbuka. Pasang aplikasi PINDAI untuk pemantauan latar belakang."}{" "}
          Dengan mengaktifkan lokasi, Anda menyetujui pemantauan posisi selama pinjaman
          aktif — hanya untuk verifikasi data dan penagihan, tidak dibagikan ke pihak lain.
        </p>
        {pesan && (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {pesan}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button className="h-11" onClick={cobaLagi}>
            <RefreshCw className="mr-1.5 size-4" /> Coba lagi
          </Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => void signOut()}
          >
            Keluar dari akun
          </Button>
        </div>
      </Kartu>
    </LayarPenuh>
  );
}

/** Indikator kecil di kanan bawah selama lokasi mengalir ke server. */
function PilLokasi({
  akurasi,
  segar,
  umurMenit,
  latarBelakang,
}: {
  akurasi: number | null;
  segar: boolean;
  umurMenit: number | null;
  latarBelakang: boolean;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur">
      {segar ? (
        <CheckCircle2 className="size-3.5 text-emerald-600" />
      ) : (
        <Loader2 className="size-3.5 animate-spin text-amber-600" />
      )}
      <span className={segar ? "text-emerald-700" : "text-amber-700"}>
        {segar
          ? latarBelakang
            ? "Lokasi aktif (latar belakang)"
            : "Lokasi aktif"
          : umurMenit === null
            ? "Mengirim lokasi…"
            : `Titik terakhir ${labelUmurLokasi(umurMenit)}`}
      </span>
      {akurasi !== null && (
        <span className="tabular-nums text-muted-foreground">± {Math.round(akurasi)} m</span>
      )}
    </div>
  );
}

function LayarPenuh({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16 text-slate-900">
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
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
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
