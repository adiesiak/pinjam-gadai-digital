/**
 * Halaman /promo — "Poster Promo PINDAI", brand asset center untuk kampanye.
 *
 * Sembilan poster 1080 × 1350 (rasio 4:5) dirender dari data `promoPosters`
 * lewat komposer Canvas 2D (`lib/promoPosterGambar`) sehingga pratinjau, modal,
 * dan PNG unduhan SEMUA memakai desain yang sama — tidak ada elemen UI situs
 * yang ikut masuk ke gambar. Konten (badge, headline, CTA, dst.) berasal dari
 * data sehingga kelak bisa diedit admin tanpa menyentuh kode gambar.
 *
 * Gerak halaman memakai bahasa animasi PINDAI yang sama dengan landing
 * (`framer-motion` + `lib/motion`): header masuk berurutan, pil filter aktif
 * bergeser mulus (`layoutId`), kartu galeri muncul berjeda saat difilter
 * (`AnimatePresence`), dan pratinjau membesar halus saat dibuka — semuanya
 * menyusut menjadi fade sederhana saat `prefers-reduced-motion` aktif.
 *
 * Navigasi dan identitas utama situs tidak diubah; halaman ini hanya mengisi
 * rute /promo yang sudah ada.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Eye, Link2, Share2, Shapes } from "lucide-react";

import {
  KATEGORI_POSTER,
  SHARE_TEKS,
  promoPostersAktif,
  tautanPoster,
  type PromoPoster,
} from "@/lib/promoPosters";
import { UKURAN_POSTER, gambarPoster } from "@/lib/promoPosterGambar";
import { EASE_OUT } from "@/lib/motion";

/** Skala kanvas kartu (540 px → 1/2 dari 1080) supaya pratinjau tetap ringan. */
const SKALA_KARTU = 0.5;
const LEBAR_KARTU = Math.round(UKURAN_POSTER.lebar * SKALA_KARTU);

/** Kanvas PNG berukuran penuh — dibuat segagal mungkin di luar layar. */
function kanvasPenuh(p: PromoPoster): HTMLCanvasElement | null {
  const kanvas = document.createElement("canvas");
  kanvas.width = UKURAN_POSTER.lebar;
  kanvas.height = UKURAN_POSTER.tinggi;
  const ctx = kanvas.getContext("2d");
  if (!ctx) return null;
  gambarPoster(ctx, p);
  return kanvas;
}

/** Unduh PNG 1080 × 1350 dengan nama dari data. */
function unduhPoster(p: PromoPoster): void {
  try {
    const kanvas = kanvasPenuh(p);
    if (!kanvas) throw new Error("kanvas");
    const tautan = document.createElement("a");
    tautan.href = kanvas.toDataURL("image/png");
    tautan.download = p.file;
    document.body.appendChild(tautan);
    tautan.click();
    tautan.remove();
    toast.success(`PNG diunduh — ${p.file} (1080 × 1350).`);
  } catch {
    toast.error("Gagal membuat PNG. Coba lagi.");
  }
}

/** Salin URL poster ke papan klip. */
async function salinTautan(p: PromoPoster, diam = false): Promise<void> {
  try {
    await navigator.clipboard.writeText(tautanPoster(p.id));
    if (!diam) toast.success("Tautan poster disalin.");
  } catch {
    toast.error("Gagal menyalin tautan.");
  }
}

/**
 * Bagikan: Web Share API bila tersedia (berbagi berkas PNG bila didukung,
 * selain itu teks + tautan), jatuh ke salin tautan bila tidak tersedia.
 */
async function bagikanPoster(p: PromoPoster): Promise<void> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const kanvas = kanvasPenuh(p);
      const blob = await new Promise<Blob | null>((selesai) =>
        kanvas?.toBlob(selesai, "image/png"),
      );
      const berkas = blob ? new File([blob], p.file, { type: "image/png" }) : null;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (berkas && nav.canShare?.({ files: [berkas] })) {
        await nav.share({ files: [berkas], text: SHARE_TEKS });
        return;
      }
      await nav.share({ title: "PINDAI", text: SHARE_TEKS, url: tautanPoster(p.id) });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Selain pembatalan: lanjut ke salin tautan.
    }
  }
  await salinTautan(p);
}

/** Header masuk berurutan: label, judul, keterangan, lalu ringkasan aset. */
const wadahHeader: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.02 } },
};

const itemHeader: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

/**
 * Varian kartu galeri. `custom` = indeks kartu, dipakai sebagai jeda berurutan
 * pada saat masuk; saat keluar jedanya dihapus supaya kartu yang difilter tidak
 * menggantung di layar. Reduced-motion menyisakan fade saja.
 */
function varianGaleri(reduce: boolean): Variants {
  if (reduce) {
    return {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: 0.22 } },
      keluar: { opacity: 0, transition: { duration: 0.14 } },
    };
  }
  return {
    hidden: { opacity: 0, y: 20, scale: 0.985 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.42, delay: Math.min(i, 8) * 0.05, ease: EASE_OUT },
    }),
    keluar: { opacity: 0, y: -12, scale: 0.985, transition: { duration: 0.2, ease: EASE_OUT } },
  };
}

/**
 * Kanvas poster — menggambar `poster` pada lebar piksel tertentu (rasio 4:5).
 * Menggambar terjadi di efek, bukan saat render, sesuai aturan kemurnian React.
 */
function KanvasPoster({
  poster,
  lebar,
  className,
}: {
  poster: PromoPoster;
  lebar: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const kanvas = ref.current;
    if (!kanvas) return;
    const ctx = kanvas.getContext("2d");
    if (!ctx) return;
    const skala = lebar / UKURAN_POSTER.lebar;

    const gambar = (sumber?: HTMLImageElement): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, kanvas.width, kanvas.height);
      ctx.scale(skala, skala);
      gambarPoster(ctx, poster, sumber);
    };

    if (poster.image) {
      const img = new Image();
      img.onload = () => gambar(img);
      img.onerror = () => gambar();
      img.src = poster.image;
    } else {
      gambar();
    }
  }, [poster, lebar]);

  return (
    <canvas
      ref={ref}
      width={lebar}
      height={Math.round((lebar * UKURAN_POSTER.tinggi) / UKURAN_POSTER.lebar)}
      className={className}
      aria-label={`Poster ${poster.title}`}
      role="img"
    />
  );
}

/** Satu kartu poster pada galeri — terangkat & poster membesar halus saat disorot. */
function KartuPoster({
  poster,
  onLihat,
}: {
  poster: PromoPoster;
  onLihat: (p: PromoPoster) => void;
}) {
  return (
    <article className="group flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
      <button
        type="button"
        onClick={() => onLihat(poster)}
        className="block w-full overflow-hidden rounded-xl border border-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        aria-label={`Buka pratinjau ${poster.title}`}
      >
        <KanvasPoster
          poster={poster}
          lebar={LEBAR_KARTU}
          className="block h-auto w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </button>

      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{poster.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{poster.badge}</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[11px]">
          {poster.category}
        </Badge>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 px-1 pb-1">
        <Button
          size="sm"
          className="rounded-full transition-transform hover:-translate-y-0.5"
          onClick={() => unduhPoster(poster)}
        >
          <Download className="size-4" /> Unduh PNG
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full transition-transform hover:-translate-y-0.5"
          onClick={() => void bagikanPoster(poster)}
        >
          <Share2 className="size-4" /> Bagikan
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full transition-colors hover:bg-slate-100"
          onClick={() => onLihat(poster)}
        >
          <Eye className="size-4" /> Lihat
        </Button>
      </div>
    </article>
  );
}

export function Promo() {
  const reduce = useReducedMotion() ?? false;
  const [kategori, setKategori] = useState<string>("Semua");
  const [params, setParams] = useSearchParams();

  const posterAktif = useMemo(() => promoPostersAktif(), []);
  const daftar = useMemo(
    () =>
      kategori === "Semua"
        ? posterAktif
        : posterAktif.filter((p) => p.category === kategori),
    [posterAktif, kategori],
  );

  // Pratinjau memakai URL sebagai satu-satunya sumber kebenaran (?poster=<id>):
  // tautan langsung terbuka, klik kartu menulis URL, tombol tutup menghapusnya,
  // dan tombol kembali browser otomatis menutup — tanpa efek sinkronisasi.
  const idTerbuka = params.get("poster");
  const terbuka = useMemo(
    () => (idTerbuka ? (posterAktif.find((p) => p.id === idTerbuka) ?? null) : null),
    [idTerbuka, posterAktif],
  );

  const bukaPratinjau = (p: PromoPoster): void => {
    const q = new URLSearchParams(params);
    q.set("poster", p.id);
    setParams(q);
  };

  const tutupPratinjau = (): void => {
    if (!params.has("poster")) return;
    const q = new URLSearchParams(params);
    q.delete("poster");
    setParams(q, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Header */}
        <motion.header
          variants={wadahHeader}
          initial="hidden"
          animate="show"
          className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6"
        >
          <motion.div variants={itemHeader}>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <motion.span
                aria-hidden="true"
                initial={reduce ? false : { rotate: -18, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                className="flex"
              >
                <Shapes className="size-4" />
              </motion.span>
              Brand asset center
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Poster Promo
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Materi kampanye PINDAI untuk berbagai kebutuhan.
            </p>
          </motion.div>
          <motion.p
            variants={itemHeader}
            className="text-xs tabular-nums text-muted-foreground"
          >
            {posterAktif.length} poster · 1080 × 1350 px · siap Instagram / WhatsApp / Facebook
          </motion.p>
        </motion.header>

        {/* Filter kategori — pil aktif bergeser mulus antar tombol. */}
        <motion.nav
          aria-label="Filter kategori poster"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18, ease: EASE_OUT }}
          className="mt-6 flex flex-wrap gap-2"
        >
          {KATEGORI_POSTER.map((k) => {
            const aktif = kategori === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKategori(k)}
                aria-pressed={aktif}
                className={`relative isolate overflow-hidden rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                  aktif
                    ? "border-primary"
                    : "border-border bg-card text-muted-foreground hover:border-slate-300 hover:text-foreground"
                }`}
              >
                {aktif && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="promo-filter-pil"
                    className="absolute inset-0 -z-10 rounded-full bg-primary"
                    transition={
                      reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }
                    }
                  />
                )}
                <span className={`relative ${aktif ? "text-primary-foreground" : ""}`}>
                  {k}
                </span>
              </button>
            );
          })}
        </motion.nav>

        {/* Galeri — kartu masuk berjeda; saat filter berubah, kartu lama keluar
            dan kartu baru mengambil tempatnya tanpa lompatan tata letak. */}
        {daftar.length === 0 ? (
          <motion.p
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="mt-10 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground"
          >
            Belum ada poster aktif pada kategori ini.
          </motion.p>
        ) : (
          // `relative` wajib bersama `AnimatePresence mode="popLayout"`: kartu
          // yang keluar dipaku `position: absolute` pada offset hasil ukur
          // terhadap `offsetParent`, jadi induknya harus jadi acuan posisi yang
          // stabil — tanpa itu kartu bisa melompat ke posisi lain.
          <section className="relative mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {daftar.map((p, i) => (
                <motion.div
                  key={p.id}
                  layout
                  custom={i}
                  variants={varianGaleri(reduce)}
                  initial="hidden"
                  animate="show"
                  exit="keluar"
                  className="h-full"
                >
                  <KartuPoster poster={p} onLihat={bukaPratinjau} />
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
        )}

        <motion.footer
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="mt-10 border-t border-border pt-5 text-xs leading-5 text-muted-foreground"
        >
          Seluruh poster memakai identitas visual PINDAI yang sama dan tidak
          memuat klaim persetujuan maupun keamanan absolut. Angka biaya dan
          ketentuan mengikuti konfigurasi sistem.
        </motion.footer>
      </main>

      {/* Pratinjau fullscreen — poster membesar halus, bilah alat menyusul. */}
      <Dialog
        open={terbuka !== null}
        onOpenChange={(buka) => {
          if (!buka) tutupPratinjau();
        }}
      >
        <DialogContent className="fixed inset-0 grid h-[100dvh] w-[100vw] max-w-none translate-x-0 translate-y-0 place-items-center gap-4 overflow-y-auto rounded-none border-0 bg-black/85 p-4 sm:max-w-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{terbuka?.title ?? "Pratinjau poster"}</DialogTitle>
            <DialogDescription>
              Pratinjau poster kampanye PINDAI berukuran 1080 × 1350 piksel.
            </DialogDescription>
          </DialogHeader>

          {terbuka && (
            <>
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="flex w-full max-w-5xl items-center justify-between gap-3 pr-10 text-white"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{terbuka.title}</p>
                  <p className="text-xs text-white/60">
                    {terbuka.category} · {terbuka.file} · 1080 × 1350
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 border-white/30 text-white/80">
                  {terbuka.nomor} / 09
                </Badge>
              </motion.div>

              <motion.div
                key={terbuka.id}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.42, ease: EASE_OUT }}
                className="flex w-full items-center justify-center"
              >
                <KanvasPoster
                  poster={terbuka}
                  lebar={UKURAN_POSTER.lebar}
                  className="block h-auto max-h-[68vh] w-auto max-w-full rounded-xl shadow-2xl"
                />
              </motion.div>

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12, ease: EASE_OUT }}
                className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-2"
              >
                <Button className="rounded-full" onClick={() => unduhPoster(terbuka)}>
                  <Download className="size-4" /> Unduh PNG
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => void bagikanPoster(terbuka)}
                >
                  <Share2 className="size-4" /> Bagikan
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => void salinTautan(terbuka)}
                >
                  <Link2 className="size-4" /> Salin Tautan
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={tutupPratinjau}
                >
                  Tutup
                </Button>
              </motion.div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
