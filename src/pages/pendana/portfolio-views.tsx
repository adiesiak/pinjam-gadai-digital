import { Package, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

import { EmptyState, Loading } from "./feedback";
import { formatDate } from "./shared";

type PortfolioRow = {
  _id: Id<"fundings">;
  nomorReferensi: string;
  loanRef: string;
  tujuan: string;
  peminjamInisial: string;
  jumlahAlokasi: number;
  imbalHasil: number;
  statusAlokasi: string;
  statusPinjaman: string;
  statusPelunasan: "lancar" | "berjalan" | "menunggak";
  tenorHari: number;
  pelunasan: {
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
  } | null;
  jaminan: {
    deskripsiBarang: string;
    kategori: string;
    nilaiTaksiran: number | null;
    kodeRakVault: string | null;
  } | null;
};

/** Tab 2 — Portofolio pendanaan saya. */
export function PortfolioSection({ portfolio }: { portfolio: PortfolioRow[] | undefined }) {
  if (portfolio === undefined) return <Loading />;
  if (portfolio.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Belum ada posisi pendanaan"
        body="Alokasikan dana di Marketplace — posisi pinjaman yang Anda danai tampil di sini lengkap dengan status pelunasannya."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {portfolio.map((f) => (
        <li
          key={f._id}
          className={`card-lift rounded-2xl border bg-white p-5 shadow-sm ${
            f.statusPelunasan === "menunggak" ? "border-red-200" : "border-slate-200"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Peminjam {f.peminjamInisial}{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  · {f.loanRef} / {f.nomorReferensi}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loanPurposeLabel(f.tujuan)} · tenor {f.tenorHari} hari
              </p>
            </div>
            <PortfolioStatusBadge state={f.statusPelunasan} />
          </div>

          <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Dana dialokasikan</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(f.jumlahAlokasi)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Estimasi imbal hasil</dt>
              <dd className="font-medium tabular-nums text-emerald-700">{formatRupiah(f.imbalHasil)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Jatuh tempo</dt>
              <dd className={`tabular-nums ${f.statusPelunasan === "menunggak" ? "text-red-600" : ""}`}>
                {f.pelunasan ? formatDate(f.pelunasan.jatuhTempoPada) : "Menunggu pendanaan penuh"}
              </dd>
            </div>
          </dl>

          {f.pelunasan && f.pelunasan.hariTerlambat > 0 && (
            <p className="mt-2 text-xs text-red-600">
              Terlambat {f.pelunasan.hariTerlambat} hari — denda berjalan{" "}
              {formatRupiah(f.pelunasan.dendaTerlambat)} ditambahkan ke kewajiban Peminjam.
            </p>
          )}

          {/* Widget pelacakan jaminan gadai */}
          {f.jaminan && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
              <Package className="mt-0.5 size-4 shrink-0 text-emerald-600" strokeWidth={2} />
              <div className="min-w-0 text-xs">
                <p className="font-medium text-emerald-900">
                  Jaminan: {f.jaminan.deskripsiBarang}
                </p>
                <p className="mt-0.5 text-emerald-700">
                  {f.jaminan.kategori} · taksiran{" "}
                  {f.jaminan.nilaiTaksiran !== null ? formatRupiah(f.jaminan.nilaiTaksiran) : "—"} ·
                  tersimpan di Gudang Brankas PINDAI
                  {f.jaminan.kodeRakVault ? `, rak ${f.jaminan.kodeRakVault}` : ""} — terisolasi aman.
                </p>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function PortfolioStatusBadge({ state }: { state: "lancar" | "berjalan" | "menunggak" }) {
  if (state === "lancar") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Lancar</Badge>
    );
  }
  if (state === "menunggak") {
    return (
      <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">Menunggak</Badge>
    );
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Berjalan</Badge>
  );
}
