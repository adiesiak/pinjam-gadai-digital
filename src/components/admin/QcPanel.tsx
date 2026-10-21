/**
 * QcPanel — tampilan hasil suite QC konsistensi untuk rute `/qc`.
 *
 * Murni presentational: seluruh status, detail, dan angka datang dari
 * `jalankanQc` (lib/qcKonsistensi) yang sudah diuji terpisah, sehingga komponen
 * ini hanya bertugas menyajikannya — tidak ada logika uang di sini. Warna
 * memakai token tema (`bg-card`, `text-muted-foreground`) supaya tetap
 * terbaca pada mode gelap maupun tema pesisir/terakota/salju/karnival.
 */
import {
  CheckCircle2,
  CircleX,
  ClipboardCopy,
  Loader2,
  MinusCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GRUP_QC, type HasilQc, type StatusCekQc } from "@/lib/qcKonsistensi";
import { cn } from "@/lib/utils";

const META_STATUS: Record<
  StatusCekQc,
  { label: string; ikon: typeof CheckCircle2; kelas: string }
> = {
  lulus: {
    label: "lulus",
    ikon: CheckCircle2,
    kelas: "text-emerald-600",
  },
  gagal: {
    label: "GAGAL",
    ikon: CircleX,
    kelas: "text-red-600",
  },
  awas: {
    label: "peringatan",
    ikon: TriangleAlert,
    kelas: "text-amber-600",
  },
  lewat: {
    label: "dilewati",
    ikon: MinusCircle,
    kelas: "text-slate-400",
  },
};

/** Susun laporan teks — dipakai tombol salin agar hasil bisa ditempel ke tiket. */
function teksLaporan(hasil: HasilQc, waktu: number): string {
  const kepala = hasil.lulusSemua
    ? `LULUS (${hasil.ringkasan.lulus}/${hasil.ringkasan.total})`
    : `GAGAL (${hasil.ringkasan.gagal} dari ${hasil.ringkasan.total} pemeriksaan)`;
  const stempel = new Date(waktu).toLocaleString("id-ID");
  const baris = GRUP_QC.flatMap((g) => [
    "",
    `[${g}]`,
    ...hasil.cek
      .filter((c) => c.grup === g)
      .map((c) => `  ${c.status.toUpperCase().padEnd(8)} ${c.judul} — ${c.detail}`),
  ]);
  return ["QC Konsistensi PINDAI", `Status: ${kepala}`, `Waktu: ${stempel}`, ...baris].join("\n");
}

async function salinLaporan(hasil: HasilQc): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      throw new Error("clipboard tidak tersedia");
    }
    // Waktu dibaca di dalam handler klik — bukan saat render.
    await navigator.clipboard.writeText(teksLaporan(hasil, Date.now()));
    toast.success("Laporan QC disalin ke papan klip.");
  } catch {
    toast.error("Gagal menyalin laporan QC.");
  }
}

function Kepala({ hasil }: { hasil: HasilQc | null }) {
  const gagal = hasil?.ringkasan.gagal ?? 0;
  const awas = hasil?.ringkasan.awas ?? 0;
  const nada =
    hasil === null
      ? "border-border bg-card"
      : gagal > 0
        ? "border-red-200 bg-red-50"
        : awas > 0
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50";

  return (
    <section className="animate-masuk space-y-4 rounded-3xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <ShieldCheck className="size-4" /> Pengujian mutu data
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            QC Konsistensi PINDAI
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Sebelas pemeriksaan yang menghitung ulang angka pada data asli: ruang pendana,
            panel admin, dan rekonsiliasi keduanya. Suite gagal begitu satu invariant uang
            dilanggar.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground",
              hasil !== null && "text-emerald-700",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                hasil === null ? "bg-slate-300" : "bg-emerald-500 animate-pulse",
              )}
              aria-hidden="true"
            />
            {hasil === null ? "menjalankan pemeriksaan…" : "data langsung · diperbarui otomatis"}
          </span>
          {hasil !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void salinLaporan(hasil)}
            >
              <ClipboardCopy className="size-4" /> Salin laporan
            </Button>
          )}
        </div>
      </div>

      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3", nada)}>
        {hasil === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Menjalankan pemeriksaan terhadap data asli…
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {hasil.lulusSemua
                ? awas > 0
                  ? `Lulus dengan ${awas} peringatan`
                  : "Seluruh pemeriksaan lulus"
                : `Suite gagal — ${gagal} pemeriksaan dilanggar`}
            </p>
            <div className="flex flex-wrap gap-2 text-xs tabular-nums">
              {(
                [
                  ["lulus", hasil.ringkasan.lulus, "text-emerald-700"],
                  ["gagal", hasil.ringkasan.gagal, "text-red-700"],
                  ["peringatan", hasil.ringkasan.awas, "text-amber-700"],
                  ["dilewati", hasil.ringkasan.lewat, "text-muted-foreground"],
                ] as const
              ).map(([label, nilai, kelas]) => (
                <span
                  key={label}
                  className={cn(
                    "rounded-full border border-border/70 bg-background/60 px-2.5 py-1 font-medium",
                    kelas,
                  )}
                >
                  {nilai} {label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function BarisCek({ c }: { c: HasilQc["cek"][number] }) {
  const meta = META_STATUS[c.status];
  const Ikon = meta.ikon;
  return (
    <li className="flex gap-3 border-t border-border/60 px-4 py-3 first:border-t-0 sm:px-5">
      <Ikon className={cn("mt-0.5 size-4 shrink-0", meta.kelas)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{c.judul}</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              c.status === "gagal"
                ? "bg-red-100 text-red-700"
                : c.status === "lulus"
                  ? "bg-emerald-100 text-emerald-700"
                  : c.status === "awas"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-600",
            )}
          >
            {meta.label}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.detail}</p>
        {c.nilai.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.nilai.map((n) => (
              <span
                key={n}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              >
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** Panel hasil suite — `hasil === null` menampilkan keadaan memuat. */
export function QcPanel({ hasil }: { hasil: HasilQc | null }) {
  return (
    <div className="space-y-4">
      <Kepala hasil={hasil} />
      {GRUP_QC.map((g) => {
        const cek = hasil?.cek.filter((c) => c.grup === g) ?? [];
        const gagal = cek.filter((c) => c.status === "gagal").length;
        return (
          <section
            key={g}
            className="animate-masuk overflow-hidden rounded-2xl border border-border bg-card"
          >
            <header className="flex items-center justify-between gap-3 bg-background/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">{g}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {hasil === null
                  ? "memuat…"
                  : gagal > 0
                    ? `${gagal} gagal · ${cek.length} total`
                    : `${cek.filter((c) => c.status === "lulus").length}/${cek.length} lulus`}
              </span>
            </header>
            <ul>
              {hasil === null ? (
                <li className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-5">
                  <Loader2 className="size-4 animate-spin" /> Menjalankan pemeriksaan…
                </li>
              ) : (
                cek.map((c) => <BarisCek key={c.id} c={c} />)
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
