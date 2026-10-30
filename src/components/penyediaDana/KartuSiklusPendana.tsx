import { useMutation, useQuery } from "convex/react";
import { CalendarClock, CircleCheck, Loader2, Lock, RotateCcw, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PilihanSiklus } from "@/lib/siklusPendana";

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Siklus penempatan pendana 30 hari.
 *
 * Ini yang menjawab pertanyaan "kapan uang saya cair?": pokok + Imbal Hasil
 * baru bisa dipakai setelah admin mencairkan siklus pada hari jatuh tempo,
 * walaupun pinjaman peminjam sudah lunas lebih awal. Pendana memilih lebih
 * dulu: dicairkan ke rekening, atau diputar lagi menjadi siklus 30 hari baru.
 */
export function KartuSiklusPendana() {
  const siklus = useQuery(api.siklusPendana.siklusSaya, {});
  const pilih = useMutation(api.siklusPendana.pilihSiklus);
  const [busyId, setBusyId] = useState<string | null>(null);

  const simpanPilihan = async (
    siklusId: Id<"siklusPendana">,
    pilihan: PilihanSiklus,
  ) => {
    setBusyId(siklusId);
    try {
      await pilih({ siklusId, pilihan });
      toast.success(
        pilihan === "putar_ulang"
          ? "Siklus akan diputar lagi 30 hari saat jatuh tempo."
          : "Siklus akan dicairkan ke dompet saat jatuh tempo.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan pilihan siklus.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (siklus === undefined) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-3 h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-50"
      >
        <span className="sr-only">Memuat siklus pendana…</span>
      </div>
    );
  }
  if (siklus.length === 0) return null;

  const berjalan = siklus.filter((row) => row.status === "berjalan");
  const selesai = siklus
    .filter((row) => row.status !== "berjalan")
    .slice(0, 3);

  return (
    <section
      aria-label="Siklus pendana 30 hari"
      className="animate-masuk mt-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
            <CalendarClock className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-navy">
              Siklus penempatan 30 hari
            </h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              Pokok dan Imbal Hasil dikunci satu siklus. Pelunasan lebih awal
              oleh peminjam tidak mempercepat pencairan.
            </p>
          </div>
        </div>
        <Badge
          className={
            berjalan.length > 0
              ? "border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
              : "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
          }
        >
          {berjalan.length} berjalan
        </Badge>
      </header>

      {berjalan.length === 0 ? (
        <p className="pt-3 text-xs leading-5 text-muted-foreground">
          Tidak ada siklus berjalan. Dana yang sudah dicairkan ada di dompet dan
          bisa Anda tempatkan lagi kapan saja.
        </p>
      ) : (
        <div className="space-y-3 pt-3">
          {berjalan.map((row) => {
            return (
              <article
                key={row._id}
                className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                      Total cair saat jatuh tempo
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums leading-tight text-emerald-800">
                      {formatRupiah(row.totalCair)}
                    </p>
                  </div>
                  <p className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800">
                    <Lock className="size-3" aria-hidden />
                    Jatuh tempo {tanggal(row.jatuhTempoPada)}
                  </p>
                </div>

                <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-emerald-200/70 pt-2">
                  <div>
                    <dt className="text-[11px] text-slate-600">Pokok</dt>
                    <dd className="text-xs font-semibold tabular-nums text-slate-900">
                      {formatRupiah(row.pokok)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-600">Imbal Hasil</dt>
                    <dd className="text-xs font-semibold tabular-nums text-slate-900">
                      {formatRupiah(row.imbal)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-600">Porsi platform</dt>
                    <dd className="text-xs font-semibold tabular-nums text-slate-900">
                      − {formatRupiah(row.potongan)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-emerald-200/70 bg-white/70 px-2.5 py-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-900">
                    <Lock className="size-3" aria-hidden />
                    {row.modalDikerjakan > 0
                      ? "Pokok sedang bekerja pada pinjaman"
                      : "Dana terkunci sampai jatuh tempo"}
                  </span>
                  <span className="tabular-nums text-slate-700">
                    {formatRupiah(
                      row.modalDikerjakan > 0
                        ? row.modalDikerjakan
                        : row.totalMasuk,
                    )}
                  </span>
                </div>

                <div className="mt-3 border-t border-emerald-200/70 pt-2.5">
                  <p className="text-[11px] font-medium text-slate-600">
                    Saat jatuh tempo
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(
                      [
                        {
                          nilai: "cairkan" as const,
                          label: "Cairkan ke rekening",
                          Ikon: Wallet,
                        },
                        {
                          nilai: "putar_ulang" as const,
                          label: "Putar lagi 30 hari",
                          Ikon: RotateCcw,
                        },
                      ] satisfies ReadonlyArray<{
                        nilai: PilihanSiklus;
                        label: string;
                        Ikon: typeof Wallet;
                      }>
                    ).map(({ nilai, label, Ikon }) => {
                      const aktif = (row.pilihanPendana ?? "cairkan") === nilai;
                      return (
                        <button
                          key={nilai}
                          type="button"
                          aria-pressed={aktif}
                          disabled={busyId !== null}
                          onClick={() => void simpanPilihan(row._id, nilai)}
                          className={cn(
                            "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2",
                            aktif
                              ? "border-emerald-700 bg-emerald-700 text-white"
                              : "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50",
                            busyId !== null && "cursor-not-allowed opacity-60",
                          )}
                        >
                          {busyId === row._id ? (
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                          ) : (
                            <Ikon className="size-3" aria-hidden />
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-slate-600">
                    {row.sisaHari > 0
                      ? `Sisa ${row.sisaHari} hari. `
                      : "Sudah jatuh tempo. "}
                    {row.pilihanPendana === "putar_ulang"
                      ? "Pokok dan Imbal Hasil menjadi pokok siklus baru 30 hari."
                      : "Pokok dan Imbal Hasil masuk dompet, lalu bisa Anda tarik."}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selesai.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Siklus selesai
          </p>
          <ul className="mt-1 divide-y divide-slate-100">
            {selesai.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-xs"
              >
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <CircleCheck className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
                  {row.statusLabel} · {formatRupiah(row.totalCair)}
                </span>
                <span className="text-muted-foreground">
                  {row.dicairkanPada !== null
                    ? tanggal(row.dicairkanPada)
                    : tanggal(row.jatuhTempoPada)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
