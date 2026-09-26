import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel, loanStatusMeta } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { pawnStatusMeta, type PawnStatus } from "@/lib/pawn";

import { formatDate } from "./shared";

/** Dialog rincian pinjaman + aksi pelunasan. */
export function LoanDetailDialog({
  loanId,
  onClose,
}: {
  loanId: Id<"loans"> | null;
  onClose: () => void;
}) {
  const loan = useQuery(api.loans.getMyLoan, loanId ? { loanId } : "skip");
  const repayLoan = useMutation(api.loans.repayLoan);
  const [repaying, setRepaying] = useState(false);

  const handleRepay = async () => {
    if (!loan) return;
    setRepaying(true);
    try {
      const r = await repayLoan({ loanId: loan._id });
      toast.success(
        r.dendaTerlambat > 0
          ? `Pelunasan tercatat — total dibayar ${formatRupiah(r.totalDibayar)} (termasuk denda ${formatRupiah(r.dendaTerlambat)} untuk ${r.hariTerlambat} hari keterlambatan).`
          : `Pelunasan tercatat — total dibayar ${formatRupiah(r.totalDibayar)}. Terima kasih!`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pelunasan gagal.");
    } finally {
      setRepaying(false);
    }
  };

  return (
    <Dialog open={loanId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {loan === undefined ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : loan === null ? (
          <DialogHeader>
            <DialogTitle>Pengajuan tidak ditemukan</DialogTitle>
            <DialogDescription>Data ini mungkin bukan milik akun Anda.</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="tabular-nums">{formatRupiah(loan.pokokPinjaman)}</DialogTitle>
                <StatusBadge status={loan.status} kind="loan" />
              </div>
              <DialogDescription className="tabular-nums">
                {loan.nomorReferensi} · {formatDate(loan._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {loanStatusMeta(loan.status).description}
            </p>

            <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {[
                ["Keperluan", loanPurposeLabel(loan.tujuan)],
                ["Pokok pinjaman", formatRupiah(loan.quote.pokok)],
                ["Biaya Admin (3%)", formatRupiah(loan.quote.biayaAdmin)],
                ["Biaya Platform (2%)", formatRupiah(loan.quote.biayaPlatform)],
                ["Dana bersih diterima", formatRupiah(loan.quote.danaBersihDitransfer)],
                ["Bunga (30%)", formatRupiah(loan.quote.bunga)],
                ["Total kewajiban pelunasan", formatRupiah(loan.quote.totalKewajibanPelunasan)],
              ].map(([label, value], index) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className={`text-sm tabular-nums ${index === 2 || index === 6 ? "font-semibold" : ""}`}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {loan.catatanReview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan review</p>
                <p className="mt-1 text-sm">{loan.catatanReview}</p>
              </div>
            )}

            {loan.status === "didanai" && loan.pelunasan && (
              <div
                className={`rounded-2xl border p-4 ${
                  loan.pelunasan.hariTerlambat > 0 ? "border-red-200 bg-red-50/60" : "border-slate-200"
                }`}
              >
                <p className="text-sm font-medium">Lunasi pinjaman</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Jatuh tempo</dt>
                    <dd className="tabular-nums">{formatDate(loan.pelunasan.jatuhTempoPada)}</dd>
                  </div>
                  {loan.pelunasan.hariTerlambat > 0 ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-red-600">Terlambat {loan.pelunasan.hariTerlambat} hari</dt>
                      <dd className="tabular-nums text-red-600">+{formatRupiah(loan.pelunasan.dendaTerlambat)}</dd>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Sisa waktu</dt>
                      <dd className="tabular-nums">
                        {loan.pelunasan.sisaHari === 0 ? "Hari ini" : `${loan.pelunasan.sisaHari} hari`}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Pembayaran menutup pokok, imbal hasil Pendana, dan denda (bila terlambat).
                  Aksi ini tidak dapat dibatalkan.
                </p>
                <Button className="mt-3 w-full" disabled={repaying} onClick={handleRepay}>
                  {repaying ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Memproses…
                    </>
                  ) : (
                    `Lunasi ${formatRupiah(loan.pelunasan.totalKewajibanDenganPenalti)}`
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Dialog rincian gadai + aksi pengajuan pelepasan. */
export function PawnDetailDialog({
  pawnId,
  onClose,
}: {
  pawnId: Id<"pawns"> | null;
  onClose: () => void;
}) {
  const pawn = useQuery(api.loans.getMyPawn, pawnId ? { pawnId } : "skip");
  const requestPawnRelease = useMutation(api.loans.requestPawnRelease);
  const [requesting, setRequesting] = useState(false);

  const handleRequestRelease = async () => {
    if (!pawn) return;
    setRequesting(true);
    try {
      await requestPawnRelease({ pawnId: pawn._id });
      toast.success("Permintaan pelepasan terkirim — petugas akan mengonfirmasi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim permintaan.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Dialog open={pawnId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {pawn === undefined ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : pawn === null ? (
          <DialogHeader>
            <DialogTitle>Pengajuan tidak ditemukan</DialogTitle>
            <DialogDescription>Data ini mungkin bukan milik akun Anda.</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="max-w-64 text-base leading-snug">{pawn.deskripsiBarang}</DialogTitle>
                <StatusBadge status={pawn.status} kind="pawn" />
              </div>
              <DialogDescription className="tabular-nums">
                {pawn.nomorReferensi} · {formatDate(pawn._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {pawnStatusMeta(pawn.status as PawnStatus).description}
            </p>

            <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {[
                ["Kategori", pawn.kategori],
                ["Alamat penilaian", pawn.alamatPenilaian],
                [
                  "Nilai taksiran",
                  pawn.nilaiTaksiran !== undefined
                    ? formatRupiah(pawn.nilaiTaksiran)
                    : "Menunggu pemeriksaan petugas",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-right text-sm">{value}</dd>
                </div>
              ))}
            </dl>

            {pawn.catatanReview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan penilaian</p>
                <p className="mt-1 text-sm">{pawn.catatanReview}</p>
              </div>
            )}

            {pawn.status === "aktif" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium">Ajukan pelepasan barang</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Setelah kewajiban gadai lunas, ajukan pelepasan dan petugas akan
                  mengonfirmasi pengembalian barang.
                </p>
                <Button className="mt-3 w-full" disabled={requesting} onClick={handleRequestRelease}>
                  {requesting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
                    </>
                  ) : (
                    "Ajukan pelepasan"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
