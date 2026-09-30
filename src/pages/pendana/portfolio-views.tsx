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
  biayaAdminCicilanTotal: number;
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

/** Tab 2 — ringkasan alokasi pada ledger internal. */
export function PortfolioSection({ portfolio }: { portfolio: PortfolioRow[] | undefined }) {
  if (portfolio === undefined) return <Loading />;
  if (portfolio.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Belum ada catatan alokasi"
        body="Catatan alokasi yang Anda buat akan tampil di sini bersama kode referensi, rincian hitungan, dan status ledger internal."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Rincian biaya dan jadwal di bawah dihitung dari data pinjaman tersimpan di Convex. Ini perkiraan berdasarkan pengajuan; status mengikuti pencatatan ledger internal.
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
                Tujuan: {loanPurposeLabel(f.tujuan)} · Status aplikasi: {f.statusVerifikasi}
              </p>
              {f.tenorBulan !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {f.tenorBulan === 3 || f.tenorBulan === 6
                    ? `Biaya admin 2% (${formatRupiah(f.biayaAdmin)}) + platform 3% (${formatRupiah(f.biayaPlatform)}) dipotong di muka dari dana yang diterima; setiap cicilan ditambah biaya admin 2% dari nominal cicilan (${formatRupiah(f.biayaAdminCicilanTotal)} selama tenor).`
                    : `Biaya layanan 3% (${formatRupiah(f.biayaLayananTotal)}), dipotong di muka dari dana yang diterima.`}
                </p>
              )}
            </div>
            <PortfolioStatusBadge state={f.statusPelunasan} isPaid={f.statusPinjaman === "lunas"} />
          </div>

          <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <InfoRow label="Pokok pinjaman" value={formatRupiah(f.pokokPinjaman)} />
            <InfoRow label="Alokasi tercatat di ledger" value={formatRupiah(f.jumlahAlokasi)} />
            <InfoRow label="Imbal hasil" value={formatRupiah(f.imbalHasil)} />
            <InfoRow label="Total kewajiban (bukan tagihan)" value={formatRupiah(f.totalKewajiban)} />
            <InfoRow
              label="Tenor"
              value={f.tenorBulan !== null ? `${f.tenorBulan} bulan` : `${f.tenorHari} hari`}
            />
            <InfoRow
              label="Tanggal acuan"
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
            <h3 className="font-semibold">Perkiraan biaya dari data pengajuan Convex</h3>
            {f.skemaBulanan ? (
              <dl className="mt-2 space-y-1.5">
                {f.tenorBulan === 3 || f.tenorBulan === 6 ? (
                  <>
                    <InfoRow label="Biaya admin 2% (dipotong di muka)" value={formatRupiah(f.biayaAdmin)} />
                    <InfoRow label="Biaya platform 3% (dipotong di muka)" value={formatRupiah(f.biayaPlatform)} />
                    <InfoRow label="Total biaya tenor 5%" value={formatRupiah(f.biayaLayananTotal)} />
                    <InfoRow
                      label="Biaya admin cicilan 2% per bayar"
                      value={formatRupiah(f.biayaAdminCicilanTotal)}
                    />
                  </>
                ) : (
                  <InfoRow label="Biaya layanan tenor 1 bulan (3%)" value={formatRupiah(f.biayaLayananTotal)} />
                )}
                <InfoRow label="Potongan di muka" value={formatRupiah(f.totalPotonganDiMuka)} />
                <InfoRow label="Nilai bersih" value={formatRupiah(f.danaDiterimaPeminjam)} />
              </dl>
            ) : (
              <dl className="mt-2 space-y-1.5">
                <InfoRow label="Biaya admin" value={formatRupiah(f.biayaAdmin)} />
                <InfoRow label="Biaya platform" value={formatRupiah(f.biayaPlatform)} />
                <InfoRow label="Total potongan di muka" value={formatRupiah(f.totalPotonganDiMuka)} />
                <InfoRow label="Nilai bersih" value={formatRupiah(f.danaDiterimaPeminjam)} />
              </dl>
            )}
          </section>

          <section className="mt-3 rounded-xl border border-slate-200 px-3 py-3 text-xs">
            <h3 className="font-semibold">Perkiraan jadwal kewajiban</h3>
            <p className="mt-1 text-muted-foreground">Catatan jadwal pada aplikasi: {f.catatanJadwal} Ini bukan tagihan, riwayat pembayaran, atau bukti cicilan dibayar.</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {f.jadwalPelunasan.map((cicilan, index) => (
                <li key={`${cicilan.bulan ?? cicilan.hariKe}-${index}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
                  <span>{cicilan.bulan !== null ? `Bulan ke-${cicilan.bulan}` : `Hari ke-${cicilan.hariKe}`}</span>
                  <span className="font-semibold tabular-nums">{formatRupiah(cicilan.total)}</span>
                </li>
              ))}
            </ul>
          </section>

          {f.simulasiCicilanBulanan.length > 0 && (
            <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs">
              <summary className="cursor-pointer font-medium">Lihat cicilan bulanan (bukan tagihan aktual)</summary>
              <p className="mt-2 text-muted-foreground">Jadwal ini mengikuti model cicilan; pada akhir tenor status pinjaman dapat ditandai lunas sekaligus di ledger.</p>
              <ul className="mt-2 divide-y divide-amber-100">
                {f.simulasiCicilanBulanan.map((cicilan, index) => (
                  <li key={`${cicilan.bulan}-${index}`} className="flex flex-wrap justify-between gap-3 py-1.5">
                    <span>Bulan {cicilan.bulan}</span>
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
              Tanggal acuan terlewati {f.pelunasan.hariTerlambat} hari — denda {formatRupiah(f.pelunasan.dendaTerlambat)}; total kewajiban termasuk denda {formatRupiah(f.pelunasan.totalKewajibanDenganPenalti)}. Ini bukan tagihan atau tunggakan yang diverifikasi.
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
    return <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">Tanggal acuan terlewati</Badge>;
  }
  if (state === "lancar") {
    return <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Dalam tanggal acuan</Badge>;
  }
  return <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Berjalan di ledger</Badge>;
}
