import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
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
          <div className="animate-masuk flex flex-col gap-4">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle>Rincian pengajuan pinjaman tunai</DialogTitle>
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
                    ["Tenor pengajuan", `${loan.tenorBulan} bulan`],
                    ["Pokok pengajuan tersimpan di Convex", formatRupiah(loan.pokokPinjaman)],
                    ...(loan.simulasiBulanan !== null && (loan.tenorBulan === 3 || loan.tenorBulan === 6)
                      ? [
                          ["Biaya admin perkiraan (2%, dipotong di muka)", formatRupiah(loan.simulasiBulanan.biayaAdminTotal)],
                          ["Biaya platform perkiraan (0% — dihapus)", formatRupiah(loan.simulasiBulanan.biayaPlatformTotal)],
                          ["Total potongan di muka perkiraan (2%)", formatRupiah(loan.simulasiBulanan.biayaLayananTotal)],
                          [
                            "Biaya admin cicilan perkiraan (2% per bayar)",
                            formatRupiah(loan.simulasiBulanan.biayaAdminCicilanTotal),
                          ],
                        ]
                      : loan.simulasiBulanan !== null
                        ? [["Biaya layanan perkiraan (2%, dipotong di muka)", formatRupiah(loan.simulasiBulanan.biayaLayananTotal)]]
                        : []),
                    ["Total kewajiban perkiraan", formatRupiah(loan.totalKewajiban)],
                  ]
                : [
                    ["Keperluan", loanPurposeLabel(loan.tujuan)],
                    ["Pokok pengajuan tersimpan di Convex", formatRupiah(loan.pokokPinjaman)],
                    ["Biaya admin perkiraan (2%)", formatRupiah(loan.quote.biayaAdmin)],
                    ["Biaya platform perkiraan (0% — dihapus)", formatRupiah(loan.quote.biayaPlatform)],
                    ["Perkiraan potongan di muka (2%)", formatRupiah(loan.quote.totalPotonganDiMuka)],
                    ["Perkiraan nilai bersih (98%)", formatRupiah(loan.quote.danaBersihDitransfer)],
                    ["Total kewajiban perkiraan", formatRupiah(loan.quote.totalKewajibanPelunasan)],
                  ]
              ).map(([label, value], index, semua) => (
                <div
                  key={label}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd
                    className={`text-sm tabular-nums sm:text-right ${
                      label.startsWith("Perkiraan nilai bersih") ||
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
                <p className="text-sm font-medium">Pelunasan pada ledger</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <dt className="text-muted-foreground">Tanggal acuan</dt>
                    <dd className="tabular-nums">{formatDate(loan.pelunasan.jatuhTempoPada)}</dd>
                  </div>
                  {loan.pelunasan.hariTerlambat > 0 ? (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-red-600">Tanggal acuan terlampaui {loan.pelunasan.hariTerlambat} hari</dt>
                      <dd className="tabular-nums text-red-600">+{formatRupiah(loan.pelunasan.dendaTerlambat)}</dd>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-muted-foreground">Sisa waktu</dt>
                      <dd className="tabular-nums">
                        {loan.pelunasan.sisaHari === 0 ? "Hari ini" : `${loan.pelunasan.sisaHari} hari`}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  Pelunasan belum tersedia di aplikasi; status pelunasan diperbarui oleh tim PINDAI pada ledger internal.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Dialog rincian status gadai internal; tidak mengajukan atau mengonfirmasi pelepasan fisik. */
export function PawnDetailDialog({
  pawnId,
  onClose,
}: {
  pawnId: Id<"pawns"> | null;
  onClose: () => void;
}) {
  const pawn = useQuery(api.loans.getMyPawn, pawnId ? { pawnId } : "skip");

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
          <div className="animate-masuk flex flex-col gap-4">
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
                <div
                  key={label}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="break-words text-sm sm:text-right">{value}</dd>
                </div>
              ))}
            </dl>

            {pawn.catatanReview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan internal penilaian</p>
                <p className="mt-1 text-sm">{pawn.catatanReview}</p>
              </div>
            )}

            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              Status ini mengikuti pencatatan ledger internal. Pembayaran gadai dan perubahan status terkait pelepasan dinonaktifkan.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
