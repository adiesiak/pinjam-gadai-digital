/**
 * Seksi "Aset Aplikasi Android" untuk halaman /promo.
 *
 * Tujuannya satu: admin bisa mengunduh seluruh perangkat aset aplikasi Android
 * (ikon peluncur, ikon adaptive, ikon notifikasi, splash, logo, wordmark,
 * feature graphic) tanpa membuka alat desain. Semua PNG dibuat di peramban dari
 * painter Canvas 2D di `lib/asetAndroid`, jadi berkas yang diunduh PERSIS sama
 * dengan yang dipratinjau — tidak ada berkas aset yang perlu disimpan di server.
 *
 * Kartu memuat hal yang biasanya bikin aset ditolak: ukuran piksel, wajib/tidak
 * wajibnya transparansi, dan folder tujuan di proyek Android. Panduan pasang
 * (XML ikon adaptive, colors, tema splash Android 12) bisa disalin langsung.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, FileCode2, Layers, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ASET_ANDROID,
  PANDUAN_ANDROID,
  asetAndroidPerKategori,
  gambarAsetAndroid,
  type AsetAndroid as Aset,
} from "@/lib/asetAndroid";

/** Ukuran sisi terpanjang pratinjau di dalam kartu (px). */
const PRATINJAU_MAKS = 190;
/** Jeda antar-unduhan saat "Unduh semua" (peramban membatasi unduhan beruntun). */
const JEDA_UNDUH_MS = 350;

/** Kanvas berukuran penuh untuk satu aset — sumber berkas yang diunduh. */
function kanvasPenuh(aset: Aset): HTMLCanvasElement | null {
  const kanvas = document.createElement("canvas");
  kanvas.width = aset.canvas[0];
  kanvas.height = aset.canvas[1];
  const ctx = kanvas.getContext("2d");
  if (!ctx) return null;
  gambarAsetAndroid(ctx, aset);
  return kanvas;
}

/** Unduh satu aset sebagai PNG dengan nama berkas dari data. */
function unduhAset(aset: Aset, diam = false): boolean {
  try {
    const kanvas = kanvasPenuh(aset);
    if (!kanvas) throw new Error("kanvas");
    const tautan = document.createElement("a");
    tautan.href = kanvas.toDataURL("image/png");
    tautan.download = aset.berkas;
    document.body.appendChild(tautan);
    tautan.click();
    tautan.remove();
    if (!diam) {
      toast.success(`PNG diunduh — ${aset.berkas} (${aset.canvas[0]} × ${aset.canvas[1]}).`);
    }
    return true;
  } catch {
    if (!diam) toast.error("Gagal membuat PNG. Coba lagi.");
    return false;
  }
}

/** Kanvas pratinjau — digambar di efek, bukan saat render. */
function KanvasAset({ aset }: { aset: Aset }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const kanvas = ref.current;
    if (!kanvas) return;
    const ctx = kanvas.getContext("2d");
    if (!ctx) return;
    const [lebar, tinggi] = aset.canvas;
    const skala = PRATINJAU_MAKS / Math.max(lebar, tinggi);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, kanvas.width, kanvas.height);
    ctx.scale(skala, skala);
    gambarAsetAndroid(ctx, aset);
  }, [aset]);

  const [lebar, tinggi] = aset.canvas;
  const skala = PRATINJAU_MAKS / Math.max(lebar, tinggi);

  return (
    <canvas
      ref={ref}
      width={Math.round(lebar * skala)}
      height={Math.round(tinggi * skala)}
      className="max-h-full w-auto max-w-full rounded-lg shadow-sm ring-1 ring-slate-200/70"
      aria-label={`Pratinjau ${aset.label}`}
      role="img"
    />
  );
}

/** Tombol salin untuk satu potong teks (path berkas atau potongan XML). */
function TombolSalin({ teks, label }: { teks: string; label: string }) {
  const [tersalin, setTersalin] = useState(false);

  useEffect(() => {
    if (!tersalin) return;
    const t = setTimeout(() => setTersalin(false), 1600);
    return () => clearTimeout(t);
  }, [tersalin]);

  const salin = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(true);
      toast.success(`${label} disalin.`);
    } catch {
      toast.error("Gagal menyalin. Salin manual dari kotak di samping.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void salin()}
      aria-label={`Salin ${label}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-navy"
    >
      {tersalin ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {tersalin ? "Tersalin" : "Salin"}
    </button>
  );
}

/** Satu kartu aset: pratinjau, ukuran, tujuan berkas, dan tombol unduh. */
function KartuAset({ aset }: { aset: Aset }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
      <div className="flex h-52 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#fbfaf6_0%,#f1ede3_100%)] p-3">
        <KanvasAset aset={aset} />
      </div>

      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">{aset.label}</h4>
        <Badge variant="outline" className="shrink-0 text-[11px] tabular-nums">
          {aset.canvas[0]} × {aset.canvas[1]}
        </Badge>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">{aset.keterangan}</p>

      <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <code className="min-w-0 break-all font-mono text-[11px] leading-4 text-slate-600">
            {aset.tujuan}
          </code>
          <TombolSalin teks={aset.tujuan} label={`tujuan berkas ${aset.label}`} />
        </div>
        <p className="text-[11px] leading-4 text-amber-800">{aset.catatan}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button size="sm" className="rounded-full" onClick={() => unduhAset(aset)}>
          <Download className="size-4" /> Unduh PNG
        </Button>
        <Badge
          variant="outline"
          className={`text-[11px] ${aset.latarPenuh ? "border-navy/30 text-navy" : "border-amber-300/80 text-amber-700"}`}
        >
          <Layers className="mr-1 size-3" />
          {aset.latarPenuh ? "Latar penuh" : "Transparan"}
        </Badge>
      </div>
    </article>
  );
}

/** Seksi lengkap aset aplikasi Android untuk halaman /promo. */
export function AsetAndroid() {
  const [sibuk, setSibuk] = useState(false);
  const grup = asetAndroidPerKategori();

  /** Unduh seluruh berkas berurutan — peramban bisa menahan unduhan beruntun. */
  const unduhSemua = async (): Promise<void> => {
    setSibuk(true);
    const gagal: string[] = [];
    for (const [i, aset] of ASET_ANDROID.entries()) {
      if (!unduhAset(aset, true)) gagal.push(aset.berkas);
      if (i < ASET_ANDROID.length - 1) {
        await new Promise((selesai) => setTimeout(selesai, JEDA_UNDUH_MS));
      }
    }
    setSibuk(false);
    if (gagal.length === 0) {
      toast.success(`${ASET_ANDROID.length} berkas PNG diunduh ke folder Unduhan.`);
    } else {
      toast.error(`${gagal.length} berkas gagal dibuat. Coba unduh satu per satu.`);
    }
  };

  return (
    <section id="aset-android" aria-labelledby="aset-android-judul" className="mt-10 scroll-mt-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Smartphone className="size-4" /> Aplikasi Android
          </p>
          <h2
            id="aset-android-judul"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Aset aplikasi Android
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {ASET_ANDROID.length} berkas siap pakai untuk proyek Android dan Play Store: ikon
            peluncur, ikon adaptive, ikon notifikasi, splash screen, logo, dan feature graphic.
            Semua PNG dibuat di peramban ini — yang diunduh persis sama dengan yang terlihat di
            layar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="rounded-full" disabled={sibuk} onClick={() => void unduhSemua()}>
            <Download className="size-4" />
            {sibuk ? "Menyiapkan berkas…" : `Unduh semua (${ASET_ANDROID.length})`}
          </Button>
          <Badge variant="secondary" className="rounded-full text-[11px]">
            PNG · latar penuh &amp; transparan
          </Badge>
        </div>
      </header>

      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Peramban bisa menampilkan izin “Unduh beberapa berkas” saat memakai tombol unduh semua.
        Izinkan supaya {ASET_ANDROID.length} berkas tersimpan sekaligus — kalau ditolak, unduh
        satu per satu dari kartu di bawah.
      </p>

      {grup.map(({ kategori, daftar }) => (
        <div key={kategori} className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            {kategori}
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
              {daftar.length} berkas
            </span>
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {daftar.map((aset) => (
              <KartuAset key={aset.id} aset={aset} />
            ))}
          </div>
        </div>
      ))}

      {/* Panduan memakai <details> (bukan komponen ber-Presence) supaya isinya
          tetap ada di markup — terbaca mesin pencari, dan bisa diuji tanpa
          membuka panelnya lebih dulu. */}
      <details className="group mt-10 rounded-2xl border border-slate-200 bg-white px-4 py-3 open:pb-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-navy [&::-webkit-details-marker]:hidden">
          <FileCode2 className="size-4" /> Panduan pasang di Android Studio
          <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
            buka
          </span>
          <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">
            tutup
          </span>
        </summary>
        <div className="mt-4 space-y-6">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Langkah
              </h4>
              <ol className="mt-2 space-y-2">
                {PANDUAN_ANDROID.langkah.map((langkah, i) => (
                  <li key={i} className="flex gap-3 text-xs leading-5 text-slate-600">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <span>{langkah}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Warna brand (colors.xml)
              </h4>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {PANDUAN_ANDROID.warna.map((w) => (
                  <li
                    key={w.nama}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="size-6 shrink-0 rounded-md ring-1 ring-slate-200"
                      style={{ backgroundColor: w.nilai }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[11px] text-slate-700">
                        {w.nama}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {w.nilai}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Potongan kode
              </h4>
              {PANDUAN_ANDROID.potongan.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy">{p.judul}</p>
                      <code className="block truncate font-mono text-[11px] text-muted-foreground">
                        {p.berkas}
                      </code>
                    </div>
                    <TombolSalin teks={p.kode} label={`kode ${p.judul}`} />
                  </div>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-navy p-3 text-[11px] leading-5 text-[#fbf8f1]">
                    <code>{p.kode}</code>
                  </pre>
                </div>
              ))}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Berkas &amp; tujuannya
              </h4>
              <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
                {ASET_ANDROID.map((aset) => (
                  <li
                    key={aset.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2"
                  >
                    <code className="font-mono text-[11px] text-slate-700">{aset.berkas}</code>
                    <code className="min-w-0 flex-1 break-all text-right font-mono text-[11px] text-muted-foreground">
                      {aset.tujuan}
                    </code>
                  </li>
                ))}
              </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
