import { useQuery } from "convex/react";
import { CalendarClock, CircleCheck, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";

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
 * walaupun pinjaman peminjam sudah lunas lebih awal. Setelah dicairkan,
 * pendana memilih sendiri: tarik ke rekening atau tempatkan lagi.
 */
export function KartuSiklusPendana() {
  const siklus = useQuery(api.siklusPendana.siklusSaya, {});

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
            const masuk = Math.min(row.totalCair, Math.max(0, row.totalMasuk));
            const persen =
              row.totalCair > 0
                ? Math.round((masuk / row.totalCair) * 100)
                : 0;
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
                    <dt className="text-[11px] text-slate-600">Biaya platform</dt>
                    <dd className="text-xs font-semibold tabular-nums text-slate-900">
                      − {formatRupiah(row.potongan)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-2">
                  <div className="flex items-baseline justify-between gap-3 text-[11px]">
                    <span className="text-slate-600">Dana yang sudah masuk</span>
                    <span className="tabular-nums font-medium text-slate-900">
                      {formatRupiah(masuk)} / {formatRupiah(row.totalCair)}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Dana siklus yang sudah masuk"
                    aria-valuemin={0}
                    aria-valuemax={row.totalCair}
                    aria-valuenow={masuk}
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100"
                  >
                    <span
                      className="block h-full rounded-full bg-emerald-700"
                      style={{ width: `${persen}%` }}
                    />
                  </div>
                </div>

                <p className="mt-2 text-[11px] leading-5 text-slate-600">
                  {row.sisaHari > 0
                    ? `${row.sisaHari} hari lagi. `
                    : "Sudah jatuh tempo. "}
                  Admin mencairkan siklus pada hari jatuh tempo. Setelah masuk
                  dompet, Anda memilih: tarik atau tempatkan lagi.
                </p>
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
