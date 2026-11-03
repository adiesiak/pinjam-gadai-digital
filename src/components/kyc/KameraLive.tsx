import { Camera, Loader2, RefreshCcw, SwitchCamera, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  dataUrlKeFile,
  kompresKanvasKeJpeg,
  ringkasKompresi,
  TAKARAN_FOTO_KYC,
  type HasilKompresi,
} from "@/lib/kompresiFoto";
import { cn } from "@/lib/utils";

/** Arah kamera yang ingin dipakai lebih dulu. */
export type ArahKamera = "depan" | "belakang";

/** Bingkai panduan: KTP mendatar, wajah+selfie tegak. */
export type BingkaiKamera = "ktp" | "selfie";

/** Kalimat izin/kesalahan peramban → pesan yang bisa ditindaklanjuti. */
function pesanGalatKamera(err: unknown): string {
  const nama = err instanceof Error ? err.name : "";
  if (nama === "NotAllowedError" || nama === "SecurityError") {
    return "Izin kamera ditolak. Buka pengaturan situs di peramban, izinkan akses kamera, lalu coba lagi.";
  }
  if (nama === "NotFoundError" || nama === "OverconstrainedError") {
    return "Kamera tidak ditemukan di perangkat ini. Coba tombol beralih kamera, atau gunakan perangkat lain.";
  }
  if (nama === "NotReadableError") {
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.";
  }
  return "Kamera tidak bisa diaktifkan. Pastikan situs diakses lewat HTTPS, lalu coba lagi.";
}

/**
 * KAMERA DALAM APLIKASI (bukan pemilih berkas, bukan aplikasi kamera HP).
 *
 * Kenapa komponen ini ada: memilih berkas lewat input `file` dengan
 * `capture="environment"` menyerahkan kendali ke aplikasi kamera bawaan sistem.
 * Di ponsel ber-RAM kecil, OS sering menutup/menyegarkan peramban saat berpindah
 * ke aplikasi kamera, dan seluruh isian hilang. Di sini `getUserMedia`
 * dijalankan DI DALAM halaman PINDAI: hanya ada satu konteks, jadi tidak ada
 * bagian yang bisa dipukul mati oleh pengalih aplikasi.
 *
 * Alur & batasnya:
 * - Pratinjau `<video>` dipasang dari `MediaStream` lokal; tidak ada frame yang
 *   dikirim ke mana pun sampai pengguna menekan "Ambil foto".
 * - Penangkapan dilakukan di `<canvas>` lokal lalu diubah menjadi `File` JPEG
 *   di perangkat. Yang diterima pemanggil adalah `File` biasa, jadi jalur unggah
 *   ke Convex storage yang sudah ada tidak perlu diubah sama sekali.
 * - Bingkai panduan hanya lapisan tampilan; ia tidak memotong gambar, sehingga
 *   petugas tetap melihat foto apa adanya.
 * - Semua track kamera dihentikan saat modal ditutup, saat arah ditukar, dan
 *   saat komponen dilepas — lampu kamera tidak boleh menyala diam-diam.
 * - Pratinjau kamera depan dicerminkan (cermin) HANYA untuk tampilan; berkas
 *   yang dihasilkan tidak dicerminkan.
 */
export function KameraLive({
  buka,
  onTutup,
  judul,
  keterangan,
  bingkai,
  arahAwal = "belakang",
  onAmbil,
  disabled = false,
}: {
  buka: boolean;
  onTutup: () => void;
  judul: string;
  keterangan: string;
  bingkai: BingkaiKamera;
  arahAwal?: ArahKamera;
  /** Dipanggil dengan foto hasil tangkapan; berkas hanya ada di perangkat. */
  onAmbil: (file: File) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [arah, setArah] = useState<ArahKamera>(arahAwal);
  const [siap, setSiap] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  /** Hasil kompresi terakhir — ditampilkan supaya ukuran berkas terlihat. */
  const [hasilTerakhir, setHasilTerakhir] = useState<HasilKompresi | null>(null);
  const [jumlahKamera, setJumlahKamera] = useState(1);
  /** Dinaikkan tombol "Coba lagi": memaksa efek membuka ulang kamera. */
  const [percobaanKe, setPercobaanKe] = useState(0);
  // Peramban tanpa akses kamera langsung: pesannya diturunkan saat render,
  // bukan diset dari badan efek.
  const kameraTidakDidukung =
    typeof navigator === "undefined" ||
    navigator.mediaDevices?.getUserMedia === undefined;
  const galatTampil =
    galat ??
    (kameraTidakDidukung
      ? "Peramban ini tidak menyediakan akses kamera langsung. Coba peramban lain (Chrome/Safari terbaru)."
      : null);

  /** Hentikan seluruh track — dipanggil sebelum membuka arah baru & saat tutup. */
  const hentikan = useCallback(() => {
    const stream = streamRef.current;
    if (stream === null) return;
    for (const track of stream.getTracks()) track.stop();
    streamRef.current = null;
    setSiap(false);
  }, []);

  // Buka kamera saat modal tampil, tutup saat disembunyikan. `arah` sengaja
  // menjadi dependensi: beralih kamera = hentikan stream lama, buka yang baru.
  useEffect(() => {
    if (!buka) return;
    if (disabled) return;
    if (kameraTidakDidukung) return;

    let batal = false;

    const batasan: MediaStreamConstraints = {
      video: {
        facingMode: arah === "depan" ? "user" : { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    void navigator.mediaDevices
      .getUserMedia(batasan)
      .then((stream) => {
        if (batal) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video !== null) {
          video.srcObject = stream;
          void video.play().catch(() => {
            // Autoplay bisa ditolak; pengguna tetap bisa menekan tombol ambil
            // setelah frame pertama muncul, jadi tidak perlu menggagalkan apa pun.
          });
        }
        setSiap(true);
      })
      .catch((err: unknown) => {
        if (!batal) setGalat(pesanGalatKamera(err));
      });

    // Berapa banyak kamera yang ada — menentukan apakah tombol beralih berguna.
    if (navigator.mediaDevices.enumerateDevices !== undefined) {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (batal) return;
          const jumlah = list.filter((d) => d.kind === "videoinput").length;
          setJumlahKamera(Math.max(1, jumlah));
        })
        .catch(() => setJumlahKamera(1));
    }

    return () => {
      batal = true;
      const stream = streamRef.current;
      if (stream === null) return;
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    };
  }, [buka, arah, disabled, percobaanKe, kameraTidakDidukung]);

  // Bersihkan saat komponen dilepas (mis. pengguna pindah tab).
  useEffect(() => hentikan, [hentikan]);

  /** Tutup kamera sekaligus bersihkan kesiapan/kesalahan untuk pembukaan berikutnya. */
  const tutup = () => {
    hentikan();
    setGalat(null);
    onTutup();
  };

  const ambilFoto = () => {
    const video = videoRef.current;
    if (video === null) return;
    const lebar = video.videoWidth;
    const tinggi = video.videoHeight;
    if (lebar === 0 || tinggi === 0) {
      setGalat("Kamera belum siap. Tunggu sebentar, lalu ambil foto lagi.");
      return;
    }
    const kanvas = document.createElement("canvas");
    kanvas.width = lebar;
    kanvas.height = tinggi;
    const ctx = kanvas.getContext("2d");
    if (ctx === null) {
      setGalat("Perangkat ini tidak bisa memproses gambar kamera. Coba peramban lain.");
      return;
    }
    ctx.drawImage(video, 0, 0, lebar, tinggi);
    // Kompresi SEBELUM berkas dibuat: JPEG 0,7, sisi ≤1600 px, target ≤500 KB.
    // Di sini juga titik penghematan terbesar di HP kelas bawah — berkas 3–4 MB
    // dari kamera menjadi ratusan KB, jadi unggahan singkat dan tab tidak mudah
    // di-refresh sistem operasi.
    const hasil = kompresKanvasKeJpeg(kanvas);
    if (!hasil.sesuaiTarget) {
      setGalat(ringkasKompresi(hasil));
      return;
    }
    setHasilTerakhir(hasil);
    const nama = `${bingkai === "ktp" ? "ktp" : "selfie"}-live-${Date.now()}.jpg`;
    onAmbil(dataUrlKeFile(hasil.dataUrl, nama));
    tutup();
  };

  const beralihKamera = () => {
    hentikan();
    setGalat(null);
    setArah((lama) => (lama === "depan" ? "belakang" : "depan"));
  };

  return (
    <Dialog
      open={buka}
      onOpenChange={(terbuka) => {
        if (!terbuka) tutup();
      }}
    >
      <DialogContent className="max-w-xl gap-3 rounded-2xl border-slate-200 p-4 sm:p-5">
        <DialogHeader className="gap-1">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Camera className="size-4 text-emerald-800" aria-hidden />
            {judul}
          </DialogTitle>
          <DialogDescription className="text-[11px] leading-4 text-slate-500">
            {keterangan}
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label={`Pratinjau kamera ${bingkai === "ktp" ? "KTP" : "selfie"}`}
            className={cn(
              "aspect-[4/3] w-full object-cover",
              arah === "depan" && "-scale-x-100",
            )}
          />
          {/* Bingkai panduan transparan — hanya tampilan, tidak memotong gambar. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              aria-hidden
              className={cn(
                "relative border-2 border-dashed border-emerald-300/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]",
                bingkai === "ktp"
                  ? "h-[46%] w-[82%] rounded-lg"
                  : "h-[72%] w-[52%] rounded-[999px]",
              )}
            >
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                {bingkai === "ktp" ? "Posisikan seluruh sisi KTP di dalam bingkai" : "Posisikan wajah & KTP di dalam bingkai"}
              </span>
            </div>
          </div>
          {!siap && galatTampil === null && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-[11px] text-slate-200">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Menyalakan kamera…
            </div>
          )}
        </div>

        {galatTampil !== null && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-700">
            {galatTampil}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={ambilFoto}
            disabled={!siap || galatTampil !== null || disabled}
            className="gap-1.5 rounded-xl bg-emerald-800 px-5 py-2.5 font-semibold text-white hover:bg-emerald-900"
          >
            <Camera className="size-4" aria-hidden /> Ambil Foto Live
          </Button>
          {jumlahKamera > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={beralihKamera}
              disabled={disabled}
              className="gap-1.5 rounded-xl"
            >
              <SwitchCamera className="size-4" aria-hidden />
              {arah === "depan" ? "Kamera Belakang" : "Kamera Depan"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={tutup}
            className="gap-1.5 rounded-xl text-slate-600"
          >
            <X className="size-4" aria-hidden /> Tutup
          </Button>
          {!siap && galatTampil !== null && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                hentikan();
                setGalat(null);
                setPercobaanKe((lama) => lama + 1);
              }}
              className="gap-1.5 rounded-xl"
            >
              <RefreshCcw className="size-4" aria-hidden /> Coba lagi
            </Button>
          )}
        </div>
        <p className="text-[10px] leading-4 text-slate-500">
          Foto diambil langsung di dalam PINDAI dan tidak pernah dikirim ke mana pun sebelum Anda
          menekan Simpan. Aplikasi kamera HP tidak dibuka, jadi pengisian tidak terputus. Setiap foto
          dikompres di perangkat ini dulu (JPEG {Math.round(TAKARAN_FOTO_KYC.kualitas * 100)}%,
          maksimal {Math.round(TAKARAN_FOTO_KYC.maksByte / 1024)} KB) supaya unggahan singkat.
        </p>
        {hasilTerakhir !== null && (
          <p role="status" className="text-[10px] leading-4 text-emerald-700">
            {ringkasKompresi(hasilTerakhir)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
