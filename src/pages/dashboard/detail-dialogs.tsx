import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [confirmRepayOpen, setConfirmRepayOpen] = useState(false);

  const handleRepay = async () => {
    if (!loan) return;
    setRepaying(true);
    try {
      const r = await repayLoan({ loanId: loan._id });
      toast.success(
        r.dendaTerlambat > 0
          ? `Nilai pelunasan simulasi ${formatRupiah(r.totalDibayar)} tercatat di ledger internal, termasuk denda ${formatRupiah(r.dendaTerlambat)}. Tidak ada pembayaran eksternal.`
          : `Nilai pelunasan simulasi ${formatRupiah(r.totalDibayar)} tercatat di ledger internal. Tidak ada pembayaran eksternal.`,
      );
      setConfirmRepayOpen(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pencatatan pelunasan simulasi gagal.");
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
                <DialogTitle className="tabular-nums">Pokok simulasi · {formatRupiah(loan.pokokPinjaman)}</DialogTitle>
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
              {(loan.tenorBulan !== null
                ? [
                    ["Keperluan", loanPurposeLabel(loan.tujuan)],
                    ["Pokok pinjaman pada simulasi", formatRupiah(loan.pokokPinjaman)],
                    ["Tenor simulasi", `${loan.tenorBulan} bulan`],
                    ["Uang muka simulasi (DP 0%)", formatRupiah(0)],
                    ["Pokok acuan simulasi (DP 0%)", formatRupiah(loan.pokokPinjaman)],
                    ["Bunga menurun simulasi", formatRupiah(loan.imbalHasilTotal)],
                    ["Total kewajiban simulasi", formatRupiah(loan.totalKewajiban)],
                  ]
                : [
                    ["Keperluan", loanPurposeLabel(loan.tujuan)],
                    ["Pokok simulasi pinjaman", formatRupiah(loan.quote.pokok)],
                    ["Biaya admin simulasi (3%)", formatRupiah(loan.quote.biayaAdmin)],
                    ["Biaya platform simulasi (2%)", formatRupiah(loan.quote.biayaPlatform)],
                    ["Nilai bersih simulasi (95%; tidak ditransfer)", formatRupiah(loan.quote.danaBersihDitransfer)],
                    ["Bunga simulasi (30%)", formatRupiah(loan.quote.bunga)],
                    ["Total kewajiban simulasi", formatRupiah(loan.quote.totalKewajibanPelunasan)],
                  ]
              ).map(([label, value], index, semua) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd
                    className={`text-sm tabular-nums ${
                      label === "Pokok acuan simulasi (DP 0%)" ||
                      label === "Nilai bersih simulasi (95%; tidak ditransfer)" ||
                      index === semua.length - 1
                        ? "font-semibold"
                        : ""
                    }`}
                  >
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
                <p className="text-sm font-medium">Pelunasan pada simulasi ledger</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Tanggal acuan simulasi</dt>
                    <dd className="tabular-nums">{formatDate(loan.pelunasan.jatuhTempoPada)}</dd>
                  </div>
                  {loan.pelunasan.hariTerlambat > 0 ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-red-600">Tanggal acuan simulasi terlampaui {loan.pelunasan.hariTerlambat} hari</dt>
                      <dd className="tabular-nums text-red-600">+{formatRupiah(loan.pelunasan.dendaTerlambat)}</dd>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Sisa waktu pada simulasi</dt>
                      <dd className="tabular-nums">
                        {loan.pelunasan.sisaHari === 0 ? "Hari ini" : `${loan.pelunasan.sisaHari} hari`}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Aksi ini hanya mencatat perubahan status dan nilai kewajiban pada ledger internal. Tidak ada uang yang dibayarkan, ditransfer, atau diverifikasi; pelunasan dicatat sekaligus, tanpa cicilan parsial.
                </p>
                <AlertDialog open={confirmRepayOpen} onOpenChange={setConfirmRepayOpen}>
                  <Button className="mt-3 w-full" disabled={repaying} onClick={() => setConfirmRepayOpen(true)}>
                    Catat pelunasan simulasi {formatRupiah(loan.pelunasan.totalKewajibanDenganPenalti)}
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Konfirmasi pencatatan simulasi</AlertDialogTitle>
                      <AlertDialogDescription>
                        Ini akan menandai kewajiban sebagai lunas di ledger internal PINDAI. Tidak ada pembayaran aktual, transfer bank/e-wallet, atau bukti pembayaran yang dibuat. Seluruh nilai dicatat sekaligus.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={repaying}>Batal</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={repaying}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleRepay();
                        }}
                      >
                        {repaying ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        Ya, catat simulasi
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
      toast.success("Permintaan perubahan status gadai tercatat di ledger internal.");
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
                Catatan gadai internal · {pawn.nomorReferensi} · {formatDate(pawn._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {pawnStatusMeta(pawn.status as PawnStatus).description}
            </p>

            <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {[
                ["Kategori yang dipilih", pawn.kategori],
                ["Alamat yang dilaporkan pemohon", pawn.alamatPenilaian],
                [
                  "Nilai taksiran internal",
                  pawn.nilaiTaksiran !== undefined
                    ? formatRupiah(pawn.nilaiTaksiran)
                    : "Menunggu catatan taksiran",
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
                <p className="text-xs font-medium text-muted-foreground">Catatan internal penilaian (bukan verifikasi fisik)</p>
                <p className="mt-1 text-sm">{pawn.catatanReview}</p>
              </div>
            )}

            {pawn.status === "aktif" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium">Ajukan pembaruan status gadai</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Setelah kewajiban simulasi lunas, Anda dapat meminta pembaruan status. Perubahan status tidak membuktikan barang pernah dititipkan atau telah dikembalikan.
                </p>
                <Button className="mt-3 w-full" disabled={requesting} onClick={handleRequestRelease}>
                  {requesting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
                    </>
                  ) : (
                    "Ajukan pembaruan status"
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
