import { CalendarClock, Package, Wallet } from "lucide-react";
import { useMemo } from "react";

import { CountUp } from "@/components/CountUp";
import { formatRupiah } from "@/lib/money";

import type { LoanScheduleRow } from "./shared";

/** Ringkasan ledger internal: nilai bersih hitungan dan total kewajiban. */
export function SummaryCards({ schedule }: { schedule: LoanScheduleRow[] }) {
  // Dana bersih: 98% pada skema harian; pada bulanan pokok − biaya di muka 2%
  // (admin 2% untuk tenor 3/6, layanan 2% untuk tenor 1 — platform dihapus).
  const danaBersihTotal = useMemo(
    () =>
      schedule.reduce(
        (acc, l) =>
          acc +
          (l.tenorBulan !== null
            ? (l.simulasiBulanan?.danaDiterima ?? l.pokokPinjaman)
            : l.quote.danaBersihDitransfer),
        0,
      ),
    [schedule],
  );
  // Total kewajiban (130% atau Σ cicilan bulanan).
  const totalKewajiban = useMemo(
    () => schedule.reduce((acc, l) => acc + l.totalKewajiban, 0),
    [schedule],
  );
  const sisaSimulasi = useMemo(() => {
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
            <p className="text-xs text-muted-foreground">Nilai Bersih</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums text-emerald-600 sm:text-2xl">
              <CountUp value={danaBersihTotal} format={formatRupiah} />
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
            <p className="text-xs text-muted-foreground">Total kewajiban (bukan tagihan)</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">
              <CountUp value={totalKewajiban} format={formatRupiah} />
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
            <p className="text-xs text-muted-foreground">Sisa kewajiban · bukan tagihan atau tunggakan</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums text-destructive sm:text-2xl">
              <CountUp value={sisaSimulasi} format={formatRupiah} />
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Package className="size-5" strokeWidth={2} />
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {jatuhTempoTerdekat
            ? `Tanggal acuan ${jatuhTempoTerdekat.pelunasan?.hariTerlambat && jatuhTempoTerdekat.pelunasan.hariTerlambat > 0 ? `terlampaui ${jatuhTempoTerdekat.pelunasan.hariTerlambat} hari` : `dalam ${jatuhTempoTerdekat.pelunasan?.sisaHari ?? 0} hari`}`
            : "Tidak ada catatan kewajiban aktif."}
        </p>
      </div>
    </section>
  );
}
