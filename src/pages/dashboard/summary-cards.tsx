import { ArrowRight, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import { CountUp } from "@/components/CountUp";
import { JatuhTempoBadge, statusTagihanDari } from "@/components/StatusBadge";
import { StatusKycBadge } from "@/components/StatusKycBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  KETERANGAN_STATUS_KYC,
  STATUS_BUTUH_TINDAKAN_NASABAH,
  type StatusKyc,
} from "@/lib/kycStatus";
import { ringkasJatuhTempo } from "@/lib/jatuhTempo";
import { formatRupiah } from "@/lib/money";

import type { LoanScheduleRow } from "./shared";

/** Batas plafon yang dipakai halaman lain (formulir & halaman plafon). */
const BATAS_PLAFON = 10_000_000;

/** Ringkasan jatuh tempo satu baris pinjaman, dihitung sekali per baris. */
function ringkasBaris(l: LoanScheduleRow, sekarang: number) {
  return ringkasJatuhTempo(
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
}

/** Plafon internal: seberapa dekat peminjam terhadap batas Rp10 juta. */
function PlafonKartu({ schedule }: { schedule: LoanScheduleRow[] }) {
  const aktif = useMemo(() => schedule.filter((l) => l.status === "didanai"), [schedule]);
  const terpakai = useMemo(
    () => aktif.reduce((acc, l) => acc + (l.pokokPinjaman ?? 0), 0),
    [aktif],
  );
  const tersedia = Math.max(0, BATAS_PLAFON - terpakai);
  const persen = Math.min(100, Math.round((terpakai / BATAS_PLAFON) * 100));

  return (
    <div className="glass-card micro-metric min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5">
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
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Progress
          value={persen}
          aria-label={`Pemakaian limit: ${formatRupiah(terpakai)} dari ${formatRupiah(BATAS_PLAFON)}`}
          className="h-2 min-w-24 flex-1"
        />
        {/* Angka persen saja tidak memberi tahu apa pun; nominal terpakai dari
            batasnya yang bisa ditindaklanjuti (mis. ajukan pelunasan lebih awal). */}
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">
          {formatRupiah(terpakai)} dari {formatRupiah(BATAS_PLAFON)}
        </span>
      </div>
    </div>
  );
}

/** Tagihan & jatuh tempo: total kewajiban aktif + status jatuh tempo terdekat. */
function TagihanKartu({ schedule }: { schedule: LoanScheduleRow[] }) {
  const aktif = useMemo(() => schedule.filter((l) => l.status === "didanai"), [schedule]);

  const tagihanAktif = useMemo(
    () =>
      aktif.reduce((acc, l) => acc + (l.pelunasan?.totalKewajibanDenganPenalti ?? l.totalKewajiban), 0),
    [aktif],
  );

  // Satu perhitungan untuk baris terdekat: tanggal, kalimat hitung hari, dan
  // nadanya berasal dari sumber yang sama (`lib/jatuhTempo.ts`).
  const terdekat = useMemo(() => {
    const sekarang = Date.now();
    let terpilih: { row: LoanScheduleRow; jt: ReturnType<typeof ringkasJatuhTempo> } | null = null;
    for (const row of aktif) {
      const jt = ringkasBaris(row, sekarang);
      if (!jt.ada) continue;
      if (terpilih === null || (jt.tanggal ?? Infinity) < (terpilih.jt.tanggal ?? Infinity)) {
        terpilih = { row, jt };
      }
    }
    return terpilih;
  }, [aktif]);

  return (
    <div className="glass-card micro-metric min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Tagihan Aktif Bulan Ini</p>
          <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">
            <CountUp value={tagihanAktif} format={formatRupiah} />
          </p>
        </div>
        {terdekat !== null && <JatuhTempoBadge status={statusTagihanDari(terdekat.jt.nada)} />}
      </div>
      {terdekat !== null ? (
        <p className="mt-3 text-xs leading-5 tabular-nums text-slate-600">
          Jatuh tempo terdekat: {terdekat.jt.teks} · {terdekat.jt.hitung}
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Belum ada kewajiban aktif. Setelah pengajuan disalurkan, tanggal acuan dan
          kesiapan pembayarannya tampil di sini.
        </p>
      )}
    </div>
  );
}

/**
 * Status verifikasi KYC: SATU sumber status untuk seluruh halaman.
 *
 * Label, warna, dan kalimat penjelasnya diambil dari `lib/kycStatus.ts` — sumber
 * yang sama dengan modul KYC, lencana status, dan panel petugas. Sebelumnya
 * kartu ini punya daftar status sendiri ("Butuh Tindakan" untuk status yang
 * tidak dikenal, termasuk saat data belum termuat), sehingga bisa berbunyi
 * berlawanan dengan modul KYC di bawahnya.
 */
function KycKartu({ status, onBuka }: { status: StatusKyc | null; onBuka?: () => void }) {
  const butuhTindakan = status !== null && STATUS_BUTUH_TINDAKAN_NASABAH.includes(status);

  return (
    <div className="glass-card micro-metric min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Status Verifikasi KYC</p>
          <div className="mt-2 flex items-center gap-2">
            {status === null ? (
              <span className="text-xs text-muted-foreground">Memuat status…</span>
            ) : (
              <StatusKycBadge status={status} />
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {status === null
              ? "Status verifikasi belum bisa dibaca. Coba muat ulang halaman ini."
              : KETERANGAN_STATUS_KYC[status]}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <ShieldCheck className="size-5" strokeWidth={2} aria-hidden />
        </span>
      </div>
      {butuhTindakan && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3 gap-1.5"
          onClick={onBuka}
        >
          Lengkapi KYC
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      )}
    </div>
  );
}

/**
 * Ringkasan keuangan peminjam — tiga kartu: limit plafon, tagihan aktif, dan
 * status verifikasi KYC. KYC di sini hanya ringkasan; isinya di tab Verifikasi
 * KYC.
 */
export function SummaryCards({
  schedule,
  kycStatus = null,
  onBukaKyc,
}: {
  schedule: LoanScheduleRow[];
  /** `null` = status belum terbaca (kueri masih dimuat), bukan "butuh tindakan". */
  kycStatus?: StatusKyc | null;
  onBukaKyc?: () => void;
}) {
  return (
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-4">
      <PlafonKartu schedule={schedule} />
      <TagihanKartu schedule={schedule} />
      <KycKartu status={kycStatus} onBuka={onBukaKyc} />
    </section>
  );
}
