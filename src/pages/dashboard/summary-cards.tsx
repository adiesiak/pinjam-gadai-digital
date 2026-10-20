import { useQuery } from "convex/react";
import { ArrowRight, CheckCircle2, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { useMemo } from "react";

import { CountUp } from "@/components/CountUp";
import { JatuhTempoBadge, statusTagihanDari } from "@/components/StatusBadge";
import { StatusKycBadge } from "@/components/StatusKycBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import {
  KETERANGAN_STATUS_KYC,
  STATUS_BUTUH_TINDAKAN_NASABAH,
  type StatusKyc,
} from "@/lib/kycStatus";
import { ringkasJatuhTempo } from "@/lib/jatuhTempo";
import { formatRupiah } from "@/lib/money";
import {
  kalimatBatasPlafon,
  PLAFON_BARU,
  PLAFON_NAIK_SETELAH_LUNAS,
  type RingkasanPlafon,
} from "@/lib/plafon";
import { formatTanggalWIB } from "@/lib/waktu";

import type { LoanScheduleRow } from "./shared";

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

/**
 * Kartu batas pinjaman — SATU angka: berapa yang boleh diajukan SEKARANG.
 *
 * Angkanya dari `nasabah.plafonRingkasSaya`: plafon master nasabah dipotong
 * pokok pinjaman berjalan, dihitung server dengan `ringkasPlafon` yang sama
 * dengan validasi pengajuan. Sebelumnya kartu ini menghitung sendiri terhadap
 * batas Rp10 juta yang ditulis di layar, sehingga bisa menyebut "tersedia
 * Rp 9.000.000" untuk nasabah yang batasnya Rp1 juta — dan berbeda dari
 * formulir pengajuan yang memakai angka server.
 *
 * Murni atas `ringkas` supaya bisa diuji tanpa klien Convex; pembungkus
 * `PlafonKartu` yang menyediakan datanya.
 */
export function KartuBatasPinjaman({ ringkas }: { ringkas: RingkasanPlafon | null }) {
  const adaUtang = ringkas !== null && ringkas.jumlahAktif > 0;
  // Angkanya dianimasikan (CountUp), jadi nama untuk pembaca layar dipasang
  // eksplisit pada elemennya — sekaligus jadi satu-satunya tempat angka batas
  // ini ditulis di kartu, memakai `tersedia` dari server.
  const labelBatas =
    ringkas === null
      ? undefined
      : `Batas pinjaman yang bisa diajukan ${formatRupiah(ringkas.tersedia)}`;
  const persen = adaUtang
    ? Math.min(100, Math.max(0, Math.round((ringkas.terpakai / ringkas.maksimal) * 100)))
    : 0;
  // Kalimat kenaikan hanya relevan selama batasnya belum menyentuh langit-langit
  // kebijakan — menyebutnya untuk batas Rp10 juta hanya mengulang angka kepala.
  const bisaNaik = ringkas !== null && ringkas.maksimal < PLAFON_NAIK_SETELAH_LUNAS;

  return (
    <div className="glass-card micro-metric min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Batas pinjaman yang bisa diajukan</p>
          <p
            className="mt-1 break-words text-xl font-semibold tabular-nums text-emerald-700 sm:text-2xl"
            aria-label={labelBatas}
          >
            {ringkas === null ? (
              <span className="text-base font-medium text-muted-foreground">Memuat…</span>
            ) : (
              <CountUp value={ringkas.tersedia} format={formatRupiah} />
            )}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Wallet className="size-5" strokeWidth={2} aria-hidden />
        </span>
      </div>
      {adaUtang && (
        <div className="mt-3">
          {/* Nominal terpakai yang bisa ditindaklanjuti (mis. lunasi lebih awal),
              bukan persentase telanjang. */}
          <Progress
            value={persen}
            aria-label={`Terpakai ${formatRupiah(ringkas.terpakai)} dari batas ${formatRupiah(ringkas.maksimal)}`}
            className="h-2"
          />
          <p className="mt-1 text-[11px] leading-5 tabular-nums text-slate-500">
            Terpakai {formatRupiah(ringkas.terpakai)} dari {formatRupiah(ringkas.maksimal)}
          </p>
        </div>
      )}
      {ringkas === null ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Batas pinjaman Anda sedang dibaca. Angkanya muncul setelah tersimpan.
        </p>
      ) : adaUtang ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {kalimatBatasPlafon(ringkas)}
        </p>
      ) : bisaNaik ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Selesaikan 1x pinjaman tepat waktu untuk membuka limit{" "}
          {formatRupiah(PLAFON_NAIK_SETELAH_LUNAS)}.
        </p>
      ) : null}
    </div>
  );
}

/** Batas pinjaman dari server — data datang dari kueri yang sama dengan formulir. */
function PlafonKartu() {
  const ringkas = useQuery(api.nasabah.plafonRingkasSaya, {});
  return <KartuBatasPinjaman ringkas={ringkas ?? null} />;
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
          <p className="text-xs text-muted-foreground">Sisa kewajiban aktif</p>
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
 * Riwayat Progres Plafon — level limit aktif dan satu langkah yang tersisa.
 *
 * Angka limit berasal dari server (`plafonEfektif`), bukan dihitung ulang dari
 * jumlah pelunasan di klien: override admin dan status tunggakan ikut terbaca
 * di angka yang sama dengan validasi pengajuan.
 */
export function RiwayatProgresPlafon() {
  const data = useQuery(api.loans.myLoanCreditHistory, {});

  if (data === undefined) {
    return (
      <section
        aria-label="Riwayat progres plafon"
        className="glass-card mt-4 rounded-2xl border p-4 sm:p-5"
      >
        <p className="text-xs text-muted-foreground">Memuat progres plafon…</p>
      </section>
    );
  }

  const terbuka = data.jumlahPelunasanTepatWaktu >= 1;
  const limitAktif = data.plafonEfektif;

  return (
    <section
      aria-labelledby="judul-progres-plafon"
      className="glass-card mt-4 rounded-2xl border p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="judul-progres-plafon"
            className="flex items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <TrendingUp className="size-4 text-emerald-700" aria-hidden />
            Riwayat Progres Plafon
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {terbuka
              ? "Limit Rp1.000.000 sudah terbuka. Pertahankan pembayaran tepat waktu agar tetap aktif."
              : "Selesaikan 1x pinjaman tepat waktu untuk membuka limit Rp1.000.000."}
          </p>
        </div>
        <span
          className={
            terbuka
              ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
              : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
          }
        >
          {terbuka ? "Nasabah Teruji" : "Nasabah Baru"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
            Level 1 · aktif
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-900">
            {formatRupiah(PLAFON_BARU)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-800">
            <CheckCircle2 className="size-3.5" aria-hidden /> Terbuka sejak awal
          </p>
        </div>
        <div
          className={
            terbuka
              ? "rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5"
              : "rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5"
          }
        >
          <p
            className={
              terbuka
                ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800"
                : "text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
            }
          >
            Level 2 · {terbuka ? "aktif" : "terkunci"}
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {formatRupiah(PLAFON_NAIK_SETELAH_LUNAS)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {terbuka
              ? `${data.jumlahPelunasanTepatWaktu}x lunas tepat waktu tercatat`
              : "Butuh 1x lunas tepat waktu"}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Progress
          value={terbuka ? 100 : 0}
          aria-label={
            terbuka
              ? "Progres plafon 1 dari 1 pelunasan tepat waktu"
              : "Progres plafon 0 dari 1 pelunasan tepat waktu"
          }
          className="h-2"
        />
        <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
          Limit aktif saat ini:{" "}
          <strong className="font-semibold tabular-nums text-slate-800">
            {formatRupiah(limitAktif)}
          </strong>
          {limitAktif !== (terbuka ? PLAFON_NAIK_SETELAH_LUNAS : PLAFON_BARU)
            ? " (ditetapkan khusus oleh tim PINDAI)"
            : ""}
          .
        </p>
      </div>

      {data.riwayat.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data.riwayat.slice(0, 3).map((item) => (
            <li
              key={item.nomorReferensi}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-1.5 text-slate-700">
                <CheckCircle2 className="size-3.5 text-emerald-700" aria-hidden />
                <span className="tabular-nums">{item.nomorReferensi}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatRupiah(item.pokokPinjaman)}
                {item.lunasPada === null ? "" : ` · ${formatTanggalWIB(item.lunasPada)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Ringkasan keuangan peminjam — tiga kartu: batas pinjaman, tagihan aktif, dan
 * status verifikasi KYC. KYC di sini hanya ringkasan; isinya di halaman
 * Status KYC.
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
      <PlafonKartu />
      <TagihanKartu schedule={schedule} />
      <KycKartu status={kycStatus} onBuka={onBukaKyc} />
    </section>
  );
}
