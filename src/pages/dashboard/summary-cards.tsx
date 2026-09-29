import { CalendarClock, Package, Wallet } from "lucide-react";
import { useMemo } from "react";

import { formatRupiah } from "@/lib/money";

import type { LoanScheduleRow } from "./shared";

/** Ringkasan keuangan: dana bersih, total kewajiban, dan sisa tagihan. */
export function SummaryCards({ schedule }: { schedule: LoanScheduleRow[] }) {
  // Dana diterima: 95% pada skema harian, 100% pada skema bulanan (DP 0%).
  const danaBersihTotal = useMemo(
    () =>
      schedule.reduce(
        (acc, l) =>
          acc + (l.tenorBulan !== null ? l.pokokPinjaman : l.quote.danaBersihDitransfer),
        0,
      ),
    [schedule],
  );
  // Kewajiban mengikuti skema pinjaman (130% atau Σ cicilan bulanan).
  const totalKewajiban = useMemo(
    () => schedule.reduce((acc, l) => acc + l.totalKewajiban, 0),
    [schedule],
  );
  const sisaTagihan = useMemo(() => {
    const aktif = schedule.filter((l) => l.status === "didanai");
    return aktif.reduce((acc, l) => acc + (l.pelunasan?.totalKewajibanDenganPenalti ?? 0), 0);
  }, [schedule]);
  const jatuhTempoTerdekat = useMemo(() => {
    const aktif = schedule.filter((l) => l.status === "didanai" && l.pelunasan);
    if (aktif.length === 0) return null;
    return aktif.reduce((min, l) =>
      (l.pelunasan?.jatuhTempoPada ?? Infinity) < (min.pelunasan?.jatuhTempoPada ?? Infinity) ? l : min,
    );
  }, [schedule]);

  return (
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-4">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Dana Bersih Diterima</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums text-emerald-600 sm:text-2xl">
              {formatRupiah(danaBersihTotal)}
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Wallet className="size-5" strokeWidth={2} />
          </span>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Total Kewajiban Pelunasan</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">
              {formatRupiah(totalKewajiban)}
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <CalendarClock className="size-5" strokeWidth={2} />
          </span>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Sisa Tagihan Berjalan</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums text-destructive sm:text-2xl">
              {formatRupiah(sisaTagihan)}
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Package className="size-5" strokeWidth={2} />
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {jatuhTempoTerdekat
            ? `Jatuh tempo ${jatuhTempoTerdekat.pelunasan?.hariTerlambat && jatuhTempoTerdekat.pelunasan.hariTerlambat > 0 ? `terlambat ${jatuhTempoTerdekat.pelunasan.hariTerlambat} hari` : `${jatuhTempoTerdekat.pelunasan?.sisaHari ?? 0} hari lagi`}`
            : "Tidak ada tagihan aktif saat ini."}
        </p>
      </div>
    </section>
  );
}
