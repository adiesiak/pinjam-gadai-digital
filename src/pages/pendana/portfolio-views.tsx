import { TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

import { EmptyState, Loading } from "./feedback";
import { formatDate } from "./shared";

type JadwalPendanaan = {
  bulan: number | null;
  hariKe: number | null;
  pokok: number;
  imbalHasil: number;
  biayaLayanan: number;
  biayaAdmin: number;
  biayaPlatform: number;
  total: number;
  sisaPokok: number;
};

type PortfolioRow = {
  _id: Id<"fundings">;
  nomorReferensi: string;
  loanRef: string;
  kodePeminjam: string;
  statusVerifikasi: string;
  tujuan: string;
  pokokPinjaman: number;
  jumlahAlokasi: number;
  imbalHasil: number;
  statusAlokasi: string;
  statusPinjaman: string;
  statusPelunasan: "lancar" | "berjalan" | "menunggak";
  skemaBulanan: boolean;
  tenorHari: number;
  tenorBulan: number | null;
  imbalHasilTotal: number;
  totalKewajiban: number;
  cicilanPerBulan: number | null;
  biayaAdmin: number;
  biayaPlatform: number;
  totalPotonganDiMuka: number;
  biayaLayananTotal: number;
  danaDiterimaPeminjam: number;
  jadwalPelunasan: JadwalPendanaan[];
  simulasiCicilanBulanan: JadwalPendanaan[];
  catatanJadwal: string;
  pelunasan: {
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
    totalKewajibanPelunasan: number;
    totalKewajibanDenganPenalti: number;
  } | null;
};

/** Tab 2 — ringkasan alokasi pada ledger simulasi internal. */
export function PortfolioSection({ portfolio }: { portfolio: PortfolioRow[] | undefined }) {
  if (portfolio === undefined) return <Loading />;
  if (portfolio.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Belum ada catatan alokasi"
        body="Catatan alokasi simulasi yang Anda buat akan tampil di sini bersama kode referensi, rincian hitungan, dan status ledger internal."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Semua angka, jadwal, dan status di bawah adalah simulasi ledger internal. Status lunas bukan bukti pembayaran; alokasi dan pelunasan tidak memindahkan atau memverifikasi dana.
      </p>
      <ul className="space-y-3">
      {portfolio.map((f) => (
        <li
          key={f._id}
          className={`card-lift rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
            f.statusPelunasan === "menunggak" ? "border-red-200" : "border-slate-200"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold tracking-wide">Kode peminjam tercatat: {f.kodePeminjam}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {f.loanRef} · alokasi {f.nomorReferensi}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tujuan: {loanPurposeLabel(f.tujuan)} · Status aplikasi: {f.statusVerifikasi} (bukan verifikasi eksternal)
              </p>
              {f.tenorBulan !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {f.tenorBulan === 3 || f.tenorBulan === 6
                    ? `Biaya admin 5% (${formatRupiah(f.biayaAdmin)}) + platform 2% (${formatRupiah(f.biayaPlatform)}), diamortisasi; tanpa potongan di muka.`
                    : `Biaya layanan 3% (${formatRupiah(f.biayaLayananTotal)}), diamortisasi; tanpa potongan di muka.`}
                </p>
              )}
            </div>
            <PortfolioStatusBadge state={f.statusPelunasan} isPaid={f.statusPinjaman === "lunas"} />
          </div>

          <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <InfoRow label="Pokok pada simulasi" value={formatRupiah(f.pokokPinjaman)} />
            <InfoRow label="Alokasi tercatat di ledger" value={formatRupiah(f.jumlahAlokasi)} />
            <InfoRow label="Imbal hasil simulasi" value={formatRupiah(f.imbalHasil)} />
            <InfoRow label="Total kewajiban simulasi (bukan tagihan)" value={formatRupiah(f.totalKewajiban)} />
            <InfoRow
              label="Tenor simulasi"
              value={f.tenorBulan !== null ? `${f.tenorBulan} bulan` : `${f.tenorHari} hari`}
            />
            <InfoRow
              label="Tanggal acuan simulasi"
              value={
                f.pelunasan !== null
                  ? formatDate(f.pelunasan.jatuhTempoPada)
                  : f.statusPinjaman === "lunas"
                    ? "Status lunas (ledger)"
                    : "Menunggu target ledger"
              }
            />
          </dl>

          <section className="mt-4 rounded-xl border border-slate-200 px-3 py-3 text-xs">
            <h3 className="font-semibold">Rincian simulasi biaya dan nilai bersih</h3>
            {f.skemaBulanan ? (
              <dl className="mt-2 space-y-1.5">
                {f.tenorBulan === 3 || f.tenorBulan === 6 ? (
                  <>
                    <InfoRow label="Biaya admin 5% simulasi (diamortisasi)" value={formatRupiah(f.biayaAdmin)} />
                    <InfoRow label="Biaya platform 2% simulasi (diamortisasi)" value={formatRupiah(f.biayaPlatform)} />
                    <InfoRow label="Total biaya tenor 7%" value={formatRupiah(f.biayaLayananTotal)} />
                  </>
                ) : (
                  <InfoRow label="Biaya layanan simulasi tenor 1 bulan (3%)" value={formatRupiah(f.biayaLayananTotal)} />
                )}
                <InfoRow label="Potongan simulasi di muka" value={formatRupiah(f.totalPotonganDiMuka)} />
                <InfoRow label="Nilai bersih simulasi (tidak ditransfer)" value={formatRupiah(f.danaDiterimaPeminjam)} />
              </dl>
            ) : (
              <dl className="mt-2 space-y-1.5">
                <InfoRow label="Biaya admin simulasi" value={formatRupiah(f.biayaAdmin)} />
                <InfoRow label="Biaya platform simulasi" value={formatRupiah(f.biayaPlatform)} />
                <InfoRow label="Total potongan simulasi di muka" value={formatRupiah(f.totalPotonganDiMuka)} />
                <InfoRow label="Nilai bersih simulasi (tidak ditransfer)" value={formatRupiah(f.danaDiterimaPeminjam)} />
              </dl>
            )}
          </section>

          <section className="mt-3 rounded-xl border border-slate-200 px-3 py-3 text-xs">
            <h3 className="font-semibold">Jadwal simulasi kewajiban</h3>              <p className="mt-1 text-muted-foreground">Catatan jadwal pada aplikasi: {f.catatanJadwal} Ini bukan tagihan, riwayat pembayaran, atau bukti cicilan dibayar.</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {f.jadwalPelunasan.map((cicilan, index) => (
                <li key={`${cicilan.bulan ?? cicilan.hariKe}-${index}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
                  <span>{cicilan.bulan !== null ? `Bulan simulasi ke-${cicilan.bulan}` : `Hari simulasi ke-${cicilan.hariKe}`}</span>
                  <span className="font-semibold tabular-nums">{formatRupiah(cicilan.total)}</span>
                </li>
              ))}
            </ul>
          </section>

          {f.simulasiCicilanBulanan.length > 0 && (
            <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs">
              <summary className="cursor-pointer font-medium">Lihat simulasi cicilan bulanan (bukan tagihan aktual)</summary>
              <p className="mt-2 text-muted-foreground">Simulasi ini bukan riwayat pembayaran; pada akhir tenor status pinjaman dapat ditandai lunas sekaligus di ledger. Ini bukan pembayaran yang diverifikasi.</p>
              <ul className="mt-2 divide-y divide-amber-100">
                {f.simulasiCicilanBulanan.map((cicilan, index) => (
                  <li key={`${cicilan.bulan}-${index}`} className="flex flex-wrap justify-between gap-3 py-1.5">
                    <span>Bulan simulasi {cicilan.bulan}</span>
                    <span className="font-medium tabular-nums">{formatRupiah(cicilan.total)}</span>
                    <span className="w-full text-right text-muted-foreground">
                      Pokok {formatRupiah(cicilan.pokok)} · bunga {formatRupiah(cicilan.imbalHasil)}
                      {f.tenorBulan === 3 || f.tenorBulan === 6
                        ? ` · admin ${formatRupiah(cicilan.biayaAdmin)} · platform ${formatRupiah(cicilan.biayaPlatform)}`
                        : ` · layanan ${formatRupiah(cicilan.biayaLayanan)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {f.pelunasan !== null && f.pelunasan.hariTerlambat > 0 && (
            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
              Tanggal acuan simulasi terlewati {f.pelunasan.hariTerlambat} hari — denda simulasi {formatRupiah(f.pelunasan.dendaTerlambat)}; total kewajiban simulasi termasuk denda {formatRupiah(f.pelunasan.totalKewajibanDenganPenalti)}. Ini bukan tagihan atau tunggakan yang diverifikasi.
            </p>
          )}

          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Wilayah umum tidak dibagikan; alamat dan koordinat lokasi tidak ditampilkan. Dokumen identitas dan dokumen asli hanya dapat diakses admin berwenang.
          </p>
        </li>
      ))}
      </ul>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function PortfolioStatusBadge({
  state,
  isPaid,
}: {
  state: "lancar" | "berjalan" | "menunggak";
  isPaid: boolean;
}) {
  if (isPaid) {
    return <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Status lunas (ledger)</Badge>;
  }
  if (state === "menunggak") {
    return <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">Tanggal acuan simulasi terlewati</Badge>;
  }
  if (state === "lancar") {
    return <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Dalam tanggal acuan simulasi</Badge>;
  }
  return <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Berjalan di ledger</Badge>;
}
