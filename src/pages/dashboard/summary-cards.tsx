import { CheckCircle, AlertCircle, ShieldCheck, LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { CountUp } from "@/components/CountUp";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/money";
import { ringkasJatuhTempo } from "@/lib/jatuhTempo";

import type { LoanScheduleRow } from "./shared";

/** Plafon internal: seberapa dekat peminjam terhadap batas Rp10 juta. */
function PlafonKartu({ schedule }: { schedule: LoanScheduleRow[] }) {
  const aktif = useMemo(
    () => schedule.filter((l) => l.status === "didanai"),
    [schedule],
  );
  // Batas konfigurasi: Rp10 juta seperti disebutkan di formulir.
  const BATAS = 10_000_000;
  const terpakai = useMemo(
    () =>
      aktif.reduce((acc, l) => acc + (l.pokokPinjaman ?? 0), 0),
    [aktif],
  );
  const tersedia = Math.max(0, BATAS - terpakai);
  const persen = Math.min(100, Math.round((terpakai / BATAS) * 100));
  const warna = persen >= 80 ? "bg-amber-500" : persen >= 50 ? "bg-emerald-500" : "bg-emerald-400";

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Limit Plafon Tersedia</p>
          <p className="mt-1 break-words text-xl font-semibold tabular-nums text-emerald-700 sm:text-2xl">
            <CountUp value={tersedia} format={formatRupiah} />
          </p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Pelunasan tepat waktu meningkatkan limit hingga Rp 10.000.000
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <svg viewBox="0 0 100 100" className="h-5 w-5" aria-hidden>
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-emerald-200" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${persen} 100`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className="text-emerald-600"
            />
          </svg>
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Progress
          value={persen}
          className="h-2 flex-1"
        />
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">{persen}%</span>
      </div>
    </div>
  );
}

/** Tagihan & jatuh tempo: tagihan aktif bulan ini + status jatuh tempo terdekat. */
function TagihanKartu({ schedule }: { schedule: LoanScheduleRow[] }) {
  const aktif = useMemo(
    () => schedule.filter((l) => l.status === "didanai"),
    [schedule],
  );
  const sekarang = Date.now();
  const terdekat = useMemo(() => {
    if (aktif.length === 0) return null;
    return aktif.reduce((min, l) => {
      const jt = ringkasJatuhTempo(
        {
          status: l.status,
          pokokPinjaman: l.pokokPinjaman,
          didanaiPada: l.didanaiPada ?? undefined,
          tenorHari: l.tenorHari ?? undefined,
          tenorBulan: l.tenorBulan ?? undefined,
          persenBunga: undefined,
        },
        sekarang,
      );
      const minJT = ringkasJatuhTempo(
        {
          status: min.status,
          pokokPinjaman: min.pokokPinjaman,
          didanaiPada: min.didanaiPada ?? undefined,
          tenorHari: min.tenorHari ?? undefined,
          tenorBulan: min.tenorBulan ?? undefined,
          persenBunga: undefined,
        },
        sekarang,
      );
      if (!jt.ada) return min;
      if (!minJT.ada) return l;
      return jt.tanggal! < minJT.tanggal! ? l : min;
    });
  }, [aktif, sekarang]);

  const tagihanAktif = useMemo(
    () =>
      aktif.reduce((acc, l) => acc + (l.pelunasan?.totalKewajibanDenganPenalti ?? l.totalKewajiban), 0),
    [aktif],
  );

  const overdue = terdekat && ringkasJatuhTempo(
    {
      status: terdekat.status,
      pokokPinjaman: terdekat.pokokPinjaman,
      didanaiPada: terdekat.didanaiPada ?? undefined,
      tenorHari: terdekat.tenorHari ?? undefined,
      tenorBulan: terdekat.tenorBulan ?? undefined,
      persenBunga: undefined,
    },
    sekarang,
  ).nada === "terlambat";

  const jt = terdekat
    ? ringkasJatuhTempo(
        {
          status: terdekat.status,
          pokokPinjaman: terdekat.pokokPinjaman,
          didanaiPada: terdekat.didanaiPada ?? undefined,
          tenorHari: terdekat.tenorHari ?? undefined,
          tenorBulan: terdekat.tenorBulan ?? undefined,
      persenBunga: undefined,
    },
        sekarang,
      )
    : null;

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Tagihan Aktif Bulan Ini</p>
          <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">
            <CountUp value={tagihanAktif} format={formatRupiah} />
          </p>
        </div>
        {jt && jt.ada && (
          <Badge
            variant="outline"
            className={
              overdue
                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-50"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
            }
          >
            {overdue ? (
              <>
                <AlertCircle className="mr-1 size-3.5" aria-hidden />
                Overdue
              </>
            ) : (
              <>
                <CheckCircle className="mr-1 size-3.5" aria-hidden />
                Aman
              </>
            )}
          </Badge>
        )}
      </div>
      {jt && jt.ada && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <svg viewBox="0 0 24 24" className="shrink-0 h-3.5 w-3.5 text-slate-400" aria-hidden>
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="tabular-nums text-slate-500">
            Jatuh tempo terdekat: {jt.teks} · {jt.hitung}
          </span>
        </div>
      )}
      {!jt || !jt.ada ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Belum ada catatan kewajiban aktif.</p>
      ) : null}
    </div>
  );
}

/** Status verifikasi KYC: badge + link cepat. */
function KycKartu({ status }: { status: string | null }) {
  const terusVerified =
    status === "VERIFIED" || status === "terverifikasi";
  const perluTindakan =
    status === null ||
    status === "NOT_STARTED" ||
    status === "NEEDS_CORRECTION" ||
    status === "REJECTED" ||
    status === "REVERIFICATION_REQUIRED";

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Status Verifikasi KYC</p>
          <div className="mt-2 flex items-center gap-2">
            {terusVerified ? (
              <Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                <ShieldCheck className="mr-1 size-3.5" aria-hidden />
                KYC Terverifikasi
              </Badge>
            ) : (
              <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                <AlertCircle className="mr-1 size-3.5" aria-hidden />
                Butuh Tindakan
              </Badge>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {terusVerified
              ? "Identitas Anda sudah diverifikasi tim PINDAI."
              : "Lengkapi data dan dokumen identitas untuk verifikasi."}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <ShieldCheck className="size-5" strokeWidth={2} />
        </span>
      </div>
      {perluTindakan && (
        <a
          href="/dashboard?tab=kyc"
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
        >
          Lengkapi KYC
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

/**
 * Ringkasan keuangan peminjam — 3 kartu:
 * 1. Limit Plafon Tersedia (dengan progress bar)
 * 2. Tagihan Aktif Bulan Ini (dengan status badge jatuh tempo)
 * 3. Status Verifikasi KYC (badge + link cepat)
 */
export function SummaryCards({
  schedule,
  kycStatus,
}: {
  schedule: LoanScheduleRow[];
  kycStatus?: string | null;
}) {
  return (
    <section className="mt-5 grid gap-3 sm:grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 xl:gap-4">
      <PlafonKartu schedule={schedule} />
      <TagihanKartu schedule={schedule} />
      <KycKartu status={kycStatus ?? null} />
    </section>
  );
}
