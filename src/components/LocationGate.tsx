import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2, MapPin, RefreshCw, ShieldAlert, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { LOKASI_KEBIJAKAN, labelUmurLokasi } from "@/lib/lokasi";

/**
 * Gerbang lokasi wajib Peminjam.
 *
 * Selama gerbang menyala (Pengaturan Sistem → lokasiWajib), dashboard Peminjam
 * TIDAK bisa dipakai tanpa titik GPS yang mengalir: perangkat mengirim
 * heartbeat tiap ±60 detik ke server, dan server menolak semua aksi finansial
 * bila titik terakhir kedaluwarsa. Jadi mematikan lokasi = tidak bisa
 * bertransaksi — bukan sekadar peringatan.
 *
 * Batas platform yang ditampilkan jujur ke pengguna: browser tidak bisa
 * memaksa tombol GPS menyala, dan tidak bisa melacak saat tab ditutup. Karena
 * itu ada mode "wajib aplikasi" (setelah aplikasi Android/iOS dirilis) yang
 * memanfaatkan layanan lokasi latar belakang milik aplikasi native.
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
  const { signOut } = useAuth();
  const [izin, setIzin] = useState<StatusIzin>("memeriksa");
  const [pesan, setPesan] = useState<string | null>(null);
  const [akurasi, setAkurasi] = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const kirimTerakhirRef = useRef(0);
  const catatRef = useRef(catat);
  useEffect(() => {
    catatRef.current = catat;
  }, [catat]);

  // Browser tanpa layanan lokasi dideteksi saat render — bukan lewat efek,
  // sehingga efek di bawah murni memulai pemantauan tanpa setState.
  const didukung = typeof navigator !== "undefined" && Boolean(navigator.geolocation);

  /** Mulai memantau posisi — state hanya ditulis dari callback GPS. */
  const mulaiWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setIzin("siap");
        setAkurasi(pos.coords.accuracy);
        const now = Date.now();
        // Kirim ke server maksimal sekali per interval — hemat kuota.
        if (now - kirimTerakhirRef.current < LOKASI_KEBIJAKAN.intervalDetik * 1000) {
          return;
        }
        kirimTerakhirRef.current = now;
        void catatRef
          .current({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            akurasi: pos.coords.accuracy,
            sumber: "web",
            platform: navigator.userAgent.slice(0, 120),
          })
          .catch((err: unknown) => {
            setPesan(
              err instanceof Error ? err.message : "Gagal mengirim titik lokasi ke server.",
            );
          });
      },
      (err) => {
        // 1 = izin ditolak/blokir, 2 = posisi tidak tersedia (GPS mati), 3 = timeout.
        setIzin(err.code === 1 ? "ditolak" : "mati");
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
  }, []);

  const gerbangAktif = aktif && didukung && status !== undefined && status.wajib !== false;

  /** Tombol “Coba lagi” & saat kembali ke tab: reset lalu pantau ulang. */
  const cobaLagi = useCallback(() => {
    setPesan(null);
    setIzin("memeriksa");
    mulaiWatch();
  }, [mulaiWatch]);

  useEffect(() => {
    if (!gerbangAktif) return;
    // Memulai pemantauan tanpa setState langsung di badan effect.
    mulaiWatch();
    return () => {
      if (watchRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
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

  if (status.wajib === false) return <>{children}</>;

  // Kebijakan "wajib aplikasi" (aktif setelah aplikasi native dirilis).
  if (status.wajibAplikasiNative && !status.perangkatTerdaftar) {
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

  if (izin === "siap") {
    return (
      <>
        {children}
        <PilLokasi akurasi={akurasi} segar={status.segar} umurMenit={status.umurMenit} />
      </>
    );
  }

  const diagnosis =
    !didukung
      ? "Perangkat/browser ini tidak menyediakan layanan lokasi. Gunakan Chrome/Safari versi terbaru."
      : izin === "memeriksa"
        ? "Menunggu izin & sinyal GPS dari perangkat…"
        : izin === "ditolak"
          ? "Izin lokasi untuk situs ini diblokir/ditolak."
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
          langkah={[
            "Android: Setelan → Lokasi → Aktifkan, lalu izinkan lokasi untuk browser ini.",
            "iPhone: Setelan → Privasi & Keamanan → Layanan Lokasi → (Safari/Chrome) → Saat Menggunakan App.",
            "Ketuk “Coba lagi”, lalu biarkan halaman ini terbuka saat bertransaksi.",
          ]}
        />
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
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
}: {
  akurasi: number | null;
  segar: boolean;
  umurMenit: number | null;
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
          ? "Lokasi aktif"
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
