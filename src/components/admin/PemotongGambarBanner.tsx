import { ImageOff, Loader2, Move, ZoomIn } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  MAKS_BANNER_BYTE,
  RASIO_BANNER,
  UKURAN_BANNER,
  hitungPotonganGambar,
  type VarianGambarBanner,
} from "@/lib/bannerPromo";

/** Lebar kanvas pratinjau; tinggi mengikuti rasio varian. */
const LEBAR_PRATINJAU = 640;

function kanvasKeBlob(
  kanvas: HTMLCanvasElement,
  tipe: string,
  kualitas: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    kanvas.toBlob((blob) => resolve(blob), tipe, kualitas);
  });
}

async function kompresKanvas(
  kanvas: HTMLCanvasElement,
): Promise<{ blob: Blob; ekstensi: string }> {
  // WebP lebih kecil untuk foto; JPEG dipakai bila peramban tidak bisa
  // meng-encode WebP (toBlob mengembalikan null).
  let blob = await kanvasKeBlob(kanvas, "image/webp", 0.86);
  let ekstensi = "webp";
  if (blob === null) {
    blob = await kanvasKeBlob(kanvas, "image/jpeg", 0.86);
    ekstensi = "jpg";
  }
  if (blob === null) throw new Error("Gambar tidak bisa diproses.");

  for (const kualitas of [0.78, 0.7, 0.62, 0.54]) {
    if (blob.size <= MAKS_BANNER_BYTE) break;
    const berikut = await kanvasKeBlob(
      kanvas,
      ekstensi === "webp" ? "image/webp" : "image/jpeg",
      kualitas,
    );
    if (berikut === null) break;
    blob = berikut;
  }
  if (blob.size > MAKS_BANNER_BYTE) {
    throw new Error(
      `Hasil kompresi masih di atas ${MAKS_BANNER_BYTE / (1024 * 1024)} MB. Coba gambar lain.`,
    );
  }
  return { blob, ekstensi };
}

/**
 * Pemotong gambar banner di peramban.
 *
 * Admin memilih fokus dan zoom pada kanvas pratinjau, lalu hasilnya dipotong
 * tepat ke rasio bingkai dan dikompres sebelum diunggah. Dengan begitu materi
 * kampanye tidak perlu disiapkan di aplikasi lain, dan gambar yang tersimpan
 * tidak pernah berukuran 12 MB.
 */
export function PemotongGambarBanner({
  terbuka,
  berkas,
  varian,
  busy,
  onTutup,
  onSelesai,
}: {
  terbuka: boolean;
  berkas: File | null;
  varian: VarianGambarBanner;
  busy?: boolean;
  onTutup: () => void;
  onSelesai: (file: File) => void | Promise<void>;
}) {
  const kanvasRef = useRef<HTMLCanvasElement>(null);
  const seretRef = useRef<{
    x: number;
    y: number;
    fokusX: number;
    fokusY: number;
  } | null>(null);

  const [gambar, setGambar] = useState<HTMLImageElement | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fokusX, setFokusX] = useState(0.5);
  const [fokusY, setFokusY] = useState(0.5);
  const [sibukLokal, setSibukLokal] = useState(false);

  const rasio = RASIO_BANNER[varian];
  const ukuran = UKURAN_BANNER[varian];
  const label = varian === "desktop" ? "Desktop (8:3)" : "Ponsel (4:5)";

  useEffect(() => {
    setZoom(1);
    setFokusX(0.5);
    setFokusY(0.5);
    setGalat(null);
    if (berkas === null) {
      setGambar(null);
      return;
    }

    const url = URL.createObjectURL(berkas);
    const img = new Image();
    let aktif = true;
    img.onload = () => {
      if (!aktif) return;
      setGambar(img);
    };
    img.onerror = () => {
      if (!aktif) return;
      setGambar(null);
      setGalat("Berkas ini tidak bisa dibaca sebagai gambar.");
    };
    img.src = url;
    return () => {
      aktif = false;
      URL.revokeObjectURL(url);
    };
  }, [berkas]);

  useEffect(() => {
    const kanvas = kanvasRef.current;
    if (kanvas === null || gambar === null) return;
    const ctx = kanvas.getContext("2d");
    if (ctx === null) return;

    const potongan = hitungPotonganGambar({
      lebarAsli: gambar.naturalWidth,
      tinggiAsli: gambar.naturalHeight,
      rasio,
      zoom,
      fokusX,
      fokusY,
    });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, kanvas.width, kanvas.height);
    ctx.drawImage(
      gambar,
      potongan.sx,
      potongan.sy,
      potongan.sw,
      potongan.sh,
      0,
      0,
      kanvas.width,
      kanvas.height,
    );

    // Garis bantu ringan: membantu menempatkan teks poster di tengah.
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = 1;
    for (const bagian of [1 / 3, 2 / 3]) {
      ctx.beginPath();
      ctx.moveTo(kanvas.width * bagian, 0);
      ctx.lineTo(kanvas.width * bagian, kanvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, kanvas.height * bagian);
      ctx.lineTo(kanvas.width, kanvas.height * bagian);
      ctx.stroke();
    }
  }, [gambar, rasio, zoom, fokusX, fokusY]);

  const geser = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const kanvas = kanvasRef.current;
    if (kanvas === null || gambar === null || seretRef.current === null) return;
    const kotak = kanvas.getBoundingClientRect();
    if (kotak.width === 0 || kotak.height === 0) return;
    const potongan = hitungPotonganGambar({
      lebarAsli: gambar.naturalWidth,
      tinggiAsli: gambar.naturalHeight,
      rasio,
      zoom,
      fokusX: seretRef.current.fokusX,
      fokusY: seretRef.current.fokusY,
    });
    const deltaX =
      ((event.clientX - seretRef.current.x) / kotak.width) *
      (potongan.sw / gambar.naturalWidth);
    const deltaY =
      ((event.clientY - seretRef.current.y) / kotak.height) *
      (potongan.sh / gambar.naturalHeight);
    setFokusX(
      Math.min(1, Math.max(0, seretRef.current.fokusX - deltaX)),
    );
    setFokusY(
      Math.min(1, Math.max(0, seretRef.current.fokusY - deltaY)),
    );
  };

  const gunakan = async () => {
    if (gambar === null) return;
    setSibukLokal(true);
    try {
      const kanvas = document.createElement("canvas");
      kanvas.width = ukuran.lebar;
      kanvas.height = ukuran.tinggi;
      const ctx = kanvas.getContext("2d");
      if (ctx === null) throw new Error("Kanvas tidak tersedia.");
      const potongan = hitungPotonganGambar({
        lebarAsli: gambar.naturalWidth,
        tinggiAsli: gambar.naturalHeight,
        rasio,
        zoom,
        fokusX,
        fokusY,
      });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        gambar,
        potongan.sx,
        potongan.sy,
        potongan.sw,
        potongan.sh,
        0,
        0,
        kanvas.width,
        kanvas.height,
      );
      const { blob, ekstensi } = await kompresKanvas(kanvas);
      await onSelesai(
        new File([blob], `banner-${varian}.${ekstensi}`, { type: blob.type }),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyiapkan gambar.",
      );
    } finally {
      setSibukLokal(false);
    }
  };

  const tinggiPratinjau = Math.round(LEBAR_PRATINJAU / rasio);
  const sibuk = busy === true || sibukLokal;

  return (
    <Dialog open={terbuka && berkas !== null} onOpenChange={(buka) => !buka && !sibuk && onTutup()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Atur potongan gambar — {label}</DialogTitle>
          <DialogDescription>
            Geser gambar untuk memilih bagian tengah, lalu atur zoom. Hasilnya
            disimpan {ukuran.lebar} × {ukuran.tinggi} px dan dikompres otomatis
            di bawah {MAKS_BANNER_BYTE / (1024 * 1024)} MB.
          </DialogDescription>
        </DialogHeader>

        {galat !== null ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-800">
            <ImageOff className="size-4" /> {galat}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
              <canvas
                ref={kanvasRef}
                width={LEBAR_PRATINJAU}
                height={tinggiPratinjau}
                className="mx-auto block h-auto max-h-[55vh] w-auto max-w-full cursor-grab touch-none active:cursor-grabbing"
                aria-label="Pratinjau potongan gambar banner"
                onPointerDown={(event) => {
                  if (gambar === null) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  seretRef.current = { x: event.clientX, y: event.clientY, fokusX, fokusY };
                }}
                onPointerMove={geser}
                onPointerUp={() => {
                  seretRef.current = null;
                }}
                onPointerCancel={() => {
                  seretRef.current = null;
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <ZoomIn className="size-3.5" /> Zoom
              </span>
              <Slider
                className="min-w-40 flex-1"
                min={1}
                max={3}
                step={0.01}
                value={[zoom]}
                onValueChange={(nilai) => setZoom(nilai[0] ?? 1)}
                aria-label="Zoom gambar"
                disabled={gambar === null}
              />
              <span className="w-10 text-right text-xs tabular-nums text-slate-500">
                {zoom.toFixed(1)}×
              </span>
            </div>

            <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
              <Move className="size-3.5 shrink-0" /> Seret gambar di area
              pratinjau untuk menggeser fokus.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={sibuk}
            onClick={onTutup}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="min-h-11 bg-[#064E3B] text-white hover:bg-[#021E17]"
            disabled={gambar === null || sibuk}
            onClick={() => void gunakan()}
          >
            {sibuk ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : null}
            {sibuk ? "Menyiapkan…" : "Gunakan gambar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
