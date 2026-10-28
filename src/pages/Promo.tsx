/**
 * Halaman /promo — "Poster Promo PINDAI", brand asset center untuk kampanye.
 *
 * Sembilan poster dirender dari data `promoPosters` lewat Canvas 2D dalam tiga
 * ukuran sosial. Pratinjau, modal, dan PNG unduhan memakai desain yang sama;
 * satu pilihan rasio mengubah komposisi dan ukuran kanvas, bukan sekadar crop.
 *
 * Gerak halaman memakai bahasa animasi PINDAI yang sama dengan landing
 * (`framer-motion` + `lib/motion`): header masuk berurutan, pil filter aktif
 * bergeser mulus (`layoutId`), kartu galeri muncul berjeda saat difilter
 * (`AnimatePresence`), dan pratinjau membesar halus saat dibuka — semuanya
 * menyusut menjadi fade sederhana saat `prefers-reduced-motion` aktif.
 *
 * Halaman ini juga menjadi tempat unduh **aset aplikasi Android** (ikon peluncur,
 * ikon adaptive, ikon notifikasi, splash, logo, wordmark, feature graphic) lewat
 * seksi `AsetAndroid` — diletakkan tepat setelah header karena aset itu dicari
 * orang yang sedang menyiapkan build Android, bukan yang sedang menyusun poster.
 *
 * Navigasi dan identitas utama situs tidak diubah; halaman ini hanya mengisi
 * rute /promo yang sudah ada.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "convex/react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { toast } from "sonner";

import { AsetAndroid } from "@/components/AsetAndroid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Download,
  Eye,
  Link2,
  Share2,
  Shapes,
  Smartphone,
  Copy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import {
  KATEGORI_POSTER,
  SHARE_TEKS,
  promoPostersAktif,
  promoPostersDenganTarif,
  tautanPoster,
  type PromoPoster,
} from "@/lib/promoPosters";
import {
  UKURAN_POSTER,
  gambarPoster,
  type RasioPoster,
  type UkuranPoster,
} from "@/lib/promoPosterGambar";
import { ASET_ANDROID } from "@/lib/asetAndroid";
import { EASE_OUT } from "@/lib/motion";
import { api } from "@/convex/_generated/api";
import { BannerPromoGambar } from "@/components/promo/BannerPromoGambar";
import { PromoPinjamanKartu } from "@/components/promo/PromoPinjamanKartu";
import type { DataPromoPinjaman } from "@/lib/promoPinjaman";
import type { TarifBiaya } from "@/lib/loan";

/** Lebar kartu setengah ukuran sumber untuk menjaga pratinjau tetap ringan. */
const SKALA_KARTU = 0.5;
const LEBAR_KARTU = Math.round(UKURAN_POSTER.potret.lebar * SKALA_KARTU);

function kanvasPenuh(
  p: PromoPoster,
  rasio: RasioPoster,
): HTMLCanvasElement | null {
  const ukuran = UKURAN_POSTER[rasio];
  const kanvas = document.createElement("canvas");
  kanvas.width = ukuran.lebar;
  kanvas.height = ukuran.tinggi;
  const ctx = kanvas.getContext("2d");
  if (!ctx) return null;
  gambarPoster(ctx, p, ukuran);
  return kanvas;
}

function unduhPoster(p: PromoPoster, rasio: RasioPoster): void {
  try {
    const kanvas = kanvasPenuh(p, rasio);
    if (!kanvas) throw new Error("kanvas");
    const tautan = document.createElement("a");
    tautan.href = kanvas.toDataURL("image/png");
    tautan.download = p.file.replace(/\.png$/i, `-${rasio}.png`);
    document.body.appendChild(tautan);
    tautan.click();
    tautan.remove();
    toast.success(`PNG ${ukuranLabel(rasio)} diunduh.`);
  } catch {
    toast.error("Gagal membuat PNG. Coba lagi.");
  }
}

function ukuranLabel(rasio: RasioPoster): string {
  return UKURAN_POSTER[rasio].label;
}

function captionPoster(p: PromoPoster): string {
  return [
    p.headline.replace(/\n/g, " "),
    p.description,
    p.caption,
    p.disclaimer,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function salinCaption(p: PromoPoster): Promise<void> {
  try {
    await navigator.clipboard.writeText(captionPoster(p));
    toast.success("Caption dan keterangannya disalin.");
  } catch {
    toast.error("Gagal menyalin caption.");
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
async function bagikanPoster(
  p: PromoPoster,
  rasio: RasioPoster,
): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      const kanvas = kanvasPenuh(p, rasio);
      const blob = await new Promise<Blob | null>((selesai) =>
        kanvas?.toBlob(selesai, "image/png"),
      );
      const namaBerkas = p.file.replace(/\.png$/i, `-${rasio}.png`);
      const berkas = blob
        ? new File([blob], namaBerkas, { type: "image/png" })
        : null;
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
      };
      if (berkas && nav.canShare?.({ files: [berkas] })) {
        await nav.share({ files: [berkas], text: SHARE_TEKS });
        return;
      }
      await nav.share({
        title: "PINDAI",
        text: SHARE_TEKS,
        url: tautanPoster(p.id),
      });
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
      transition: {
        duration: 0.42,
        delay: Math.min(i, 8) * 0.05,
        ease: EASE_OUT,
      },
    }),
    keluar: {
      opacity: 0,
      y: -12,
      scale: 0.985,
      transition: { duration: 0.2, ease: EASE_OUT },
    },
  };
}

/**
 * Kanvas poster menggambar pada ukuran terpilih. Efek menjaga render React tetap murni.
 */
function KanvasPoster({
  poster,
  lebar,
  ukuran,
  className,
}: {
  poster: PromoPoster;
  lebar: number;
  ukuran: UkuranPoster;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    const kanvas = ref.current;
    if (!kanvas) return;
    const ctx = kanvas.getContext("2d");
    if (!ctx) return;
    setSiap(false);
    const skala = lebar / ukuran.lebar;

    const gambar = (): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, kanvas.width, kanvas.height);
      ctx.scale(skala, skala);
      gambarPoster(ctx, poster, ukuran);
      setSiap(true);
    };

    gambar();
  }, [poster, lebar, ukuran]);

  return (
    <span
      className="relative block w-full overflow-hidden bg-slate-100"
      style={{ aspectRatio: `${ukuran.lebar} / ${ukuran.tinggi}` }}
    >
      {!siap && (
        <Skeleton
          aria-label={`Memuat poster ${poster.title}`}
          className="absolute inset-0 rounded-none"
        />
      )}
      <canvas
        ref={ref}
        width={lebar}
        height={Math.round((lebar * ukuran.tinggi) / ukuran.lebar)}
        className={`${className ?? ""} ${siap ? "" : "invisible"}`}
        aria-label={`Poster ${poster.title}, ${ukuran.label} piksel`}
        role="img"
      />
    </span>
  );
}

/**
 * Satu kartu poster pada galeri.
 *
 * Kartu ini sengaja TIDAK memakai bahasa visual kartu aset Android di atasnya
 * (garis slate tipis + tombol pil). Poster adalah materi cetak, jadi yang
 * dipakai motif kemasan PINDAI: bidang kertas hangat, tepi kuningan ganda,
 * dan garis putus seperti kop cetak yang memisahkan nomor kampanye dari
 * bidang poster. Keseragaman kartu dipertahankan karena galeri ini katalog:
 * sembilan aset dengan bobot setara perlu bisa dibandingkan baris demi baris;
 * variasi datang dari artwork tiap poster, bukan dari ukuran kartu.
 *
 * Hierarki tindakan: Unduh (satu-satunya tombol terisi), lalu Salin caption
 * dan Bagikan sebagai tombol tenang, dan tautan pratinjau untuk pengguna
 * sentuh/papan tombol yang tidak mendapat petunjuk hover.
 */
function KartuPoster({
  poster,
  onLihat,
  rasio,
  onSalinCaption,
}: {
  poster: PromoPoster;
  onLihat: (p: PromoPoster) => void;
  rasio: RasioPoster;
  onSalinCaption: (p: PromoPoster) => void;
}) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gold/50 bg-card transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-gold/80 hover:shadow-[0_22px_42px_-24px_rgba(28,26,21,0.5)]">
      {/* Nomor kampanye memakai monospace (DESIGN: angka kode memakai
          monospace) supaya terbaca sebagai nomor aset, bukan judul. */}
      <div className="flex items-center justify-between gap-2 border-b border-dashed border-gold/45 px-4 py-2">
        <span className="font-mono text-[11px] font-semibold tabular-nums text-gold-foreground">
          No. {poster.nomor}
        </span>
        <span className="text-[11px] font-semibold text-gold-foreground">
          {poster.category}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onLihat(poster)}
        className="block w-full px-3 pt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label={`Buka pratinjau ${poster.title}`}
      >
        {/* Bingkai ganda: tepi kuningan + celah kertas, menandai poster sebagai
            cetakan. Hover hanya menebalkan tepi dan membesarkan artwork sedikit. */}
        <span className="block overflow-hidden rounded-lg bg-white p-1.5 ring-1 ring-gold/35 ring-offset-2 ring-offset-white transition-[box-shadow] duration-300 group-hover:ring-gold/60">
          <KanvasPoster
            poster={poster}
            lebar={LEBAR_KARTU}
            ukuran={UKURAN_POSTER[rasio]}
            className="block h-auto w-full rounded-[6px] transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        </span>
      </button>

      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        {/* Dua baris tetap supaya baris tombol antar kartu sejajar di katalog,
            tanpa memotong judul yang panjang. */}
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-navy">
          {poster.title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {poster.badge}
        </p>

        {/* Tindakan menempel di dasar kartu supaya sejajar antar kolom,
            berapa pun panjang tagline poster. */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          <Button
            size="sm"
            className="h-11 rounded-lg sm:h-8"
            onClick={() => unduhPoster(poster, rasio)}
          >
            <Download className="size-4" /> Unduh {ukuranLabel(rasio)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 rounded-lg text-navy hover:bg-secondary sm:h-8"
            onClick={() => onSalinCaption(poster)}
          >
            <Copy className="size-4" /> Salin caption
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 rounded-lg text-navy hover:bg-secondary sm:h-8"
            onClick={() => void bagikanPoster(poster, rasio)}
          >
            <Share2 className="size-4" /> Bagikan
          </Button>
        </div>

        <button
          type="button"
          onClick={() => onLihat(poster)}
          className="mt-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-[11px] font-semibold text-gold-foreground underline-offset-2 transition-colors hover:text-navy hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0"
        >
          <Eye className="size-3.5" aria-hidden="true" /> Pratinjau penuh
        </button>
      </div>
    </article>
  );
}

export function Promo({
  promoPinjaman = null,
  tarifBiaya = null,
  banner = null,
}: {
  /** Kampanye pinjaman aktif; rute mengisinya lewat `PromoDenganKampanye`. */
  promoPinjaman?: DataPromoPinjaman | null;
  /**
   * Banner promo bergambar dari wrapper. Diterima sebagai node, bukan di-query
   * di sini, supaya galeri poster tetap bisa dirender tanpa provider Convex.
   */
  banner?: ReactNode;
  /**
   * Tarif potongan di muka untuk poster "Biaya"; kosong = tarif bawaan mesin,
   * sehingga galeri tetap bisa dirender tanpa Convex di uji statis.
   */
  tarifBiaya?: Partial<TarifBiaya> | null;
} = {}) {
  const reduce = useReducedMotion() ?? false;
  const [kategori, setKategori] = useState<string>("Semua");
  const [rasio, setRasio] = useState<RasioPoster>("potret");
  const [params, setParams] = useSearchParams();

  // Poster biaya ikut tarif admin supaya materi kampanye tidak menampilkan
  // potongan lama setelah tarif diubah.
  const posterAktif = useMemo(
    () => promoPostersAktif(promoPostersDenganTarif(tarifBiaya)),
    [tarifBiaya],
  );
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
    () =>
      idTerbuka ? (posterAktif.find((p) => p.id === idTerbuka) ?? null) : null,
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
      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10"
      >
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
          <motion.div
            variants={itemHeader}
            className="flex flex-col items-start gap-2 sm:items-end"
          >
            <p className="text-xs tabular-nums text-muted-foreground">
              {posterAktif.length} poster · 3 ukuran PNG · untuk feed dan story
            </p>
            <a
              href="#aset-android"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <Smartphone className="size-3.5" /> Aset Android (
              {ASET_ANDROID.length} berkas) ↓
            </a>
          </motion.div>
        </motion.header>

        {banner}

        {promoPinjaman === null ? null : (
          <PromoPinjamanKartu
            promo={promoPinjaman}
            penempatan="promo"
            className="mt-6"
          />
        )}

        {/* Aset aplikasi Android lebih dulu: yang datang ke sini untuk menyiapkan
            build Android harus bisa langsung mengunduh tanpa menggulir galeri. */}
        <AsetAndroid />

        <h2 className="mt-12 border-b border-border pb-3 text-lg font-semibold tracking-tight text-foreground">
          Poster kampanye
        </h2>

        <div
          className="mt-5 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Ukuran poster PNG"
        >
          {(Object.keys(UKURAN_POSTER) as RasioPoster[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={rasio === key}
              onClick={() => setRasio(key)}
              className={`min-h-11 rounded-lg border px-3 text-xs font-semibold ${rasio === key ? "border-emerald-700 bg-emerald-700 text-white" : "border-border bg-card text-foreground hover:bg-slate-50"}`}
            >
              {key === "persegi"
                ? "Persegi"
                : key === "potret"
                  ? "Potret"
                  : "Story"}{" "}
              · {UKURAN_POSTER[key].label}
            </button>
          ))}
        </div>

        {/* Filter kategori — pil aktif bergeser mulus antar tombol. */}
        <motion.nav
          aria-label="Filter kategori poster"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18, ease: EASE_OUT }}
          className="mt-4 flex flex-wrap gap-2"
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
                      reduce
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 380, damping: 32 }
                    }
                  />
                )}
                <span
                  className={`relative ${aktif ? "text-primary-foreground" : ""}`}
                >
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
          <section className="relative mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* `relative` wajib bersama `AnimatePresence mode="popLayout"`:
                kartu yang keluar dipaku `position: absolute` pada offset hasil
                ukur terhadap `offsetParent`, jadi induknya harus menjadi acuan
                posisi yang stabil — tanpa itu kartu bisa melompat ke tempat lain. */}
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
                  <KartuPoster
                    poster={p}
                    onLihat={bukaPratinjau}
                    rasio={rasio}
                    onSalinCaption={(pilihan) => void salinCaption(pilihan)}
                  />
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
          Aset aplikasi Android dibuat dari painter yang sama dengan poster dan
          lambang brand di dalam aplikasi, jadi ikon peluncur di perangkat
          tampil identik dengan logo di situs. Seluruh poster memakai identitas
          visual PINDAI yang sama dan tidak memuat klaim persetujuan maupun
          keamanan absolut. Angka biaya dan ketentuan mengikuti konfigurasi
          sistem.
        </motion.footer>
      </main>

      {/* Pratinjau fullscreen — poster membesar halus, bilah alat menyusul. */}
      <Dialog
        open={terbuka !== null}
        onOpenChange={(buka) => {
          if (!buka) tutupPratinjau();
        }}
      >
        <DialogContent className="fixed inset-0 grid h-[100dvh] w-[100vw] max-w-none max-h-none translate-x-0 translate-y-0 place-items-center gap-4 overflow-y-auto overscroll-contain rounded-none border-0 bg-black/85 p-4 sm:max-w-none sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>{terbuka?.title ?? "Pratinjau poster"}</DialogTitle>
            <DialogDescription>
              Pratinjau poster kampanye PINDAI dalam ukuran yang dipilih.
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
                  <p className="truncate text-sm font-semibold">
                    {terbuka.title}
                  </p>
                  <p className="text-xs text-white/60">
                    {terbuka.category} · {terbuka.file} · {ukuranLabel(rasio)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 border-white/30 text-white/80"
                >
                  {terbuka.nomor} / 09
                </Badge>
              </motion.div>

              <motion.div
                key={`${terbuka.id}-${rasio}`}
                initial={
                  reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.42, ease: EASE_OUT }}
                className="flex w-full items-center justify-center"
              >
                <KanvasPoster
                  poster={terbuka}
                  lebar={UKURAN_POSTER[rasio].lebar}
                  ukuran={UKURAN_POSTER[rasio]}
                  className="block h-auto max-h-[68dvh] w-auto max-w-full rounded-xl shadow-2xl"
                />
              </motion.div>

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12, ease: EASE_OUT }}
                className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-2"
              >
                <Button
                  className="rounded-full"
                  onClick={() => unduhPoster(terbuka, rasio)}
                >
                  <Download className="size-4" /> Unduh {ukuranLabel(rasio)}
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => void salinCaption(terbuka)}
                >
                  <Copy className="size-4" /> Salin caption
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => void bagikanPoster(terbuka, rasio)}
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

/**
 * Pintu rute /promo. `Promo` sendiri tetap bebas hook Convex agar galeri
 * posternya bisa dirender di uji; kampanye diambil di sini, sekali saja.
 */
export function PromoDenganKampanye() {
  const promo = useQuery(api.promoPinjaman.promoAktif, { penempatan: "promo" });
  const ketentuan = useQuery(api.system.getKetentuanBiaya, {});
  return (
    <Promo
      promoPinjaman={promo ?? null}
      tarifBiaya={ketentuan?.tarifBiaya ?? null}
      banner={
        <BannerPromoGambar
          penempatan="promo"
          className="mt-6 max-w-none px-0 sm:px-0"
        />
      }
    />
  );
}
