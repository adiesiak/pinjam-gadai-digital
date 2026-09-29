import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EContractWidget } from "@/components/EContract";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { loanPurposeLabel, quoteLoan } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

import { formatDate, type LoanRow } from "./admin-shared";
import { LoanKycPanel } from "./LoanKycPanel";

export function LoanReviewDialog({
  row,
  onClose,
}: {
  row: LoanRow | null;
  onClose: () => void;
}) {
  const markInReview = useMutation(api.loans.markLoanInReview);
  const approve = useMutation(api.loans.approveLoan);
  const reject = useMutation(api.loans.rejectLoan);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (row === null) return null;
  const q = quoteLoan(row.pokokPinjaman);
  const pending = row.status === "diajukan";
  const decided = row.status === "disetujui" || row.status === "ditolak";

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Keputusan tersimpan.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="tabular-nums">
              {formatRupiah(row.pokokPinjaman)}
            </DialogTitle>
            <StatusBadge status={row.status} kind="loan" />
          </div>
          <DialogDescription className="tabular-nums">
            Catatan pengajuan internal · {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <LoanKycPanel row={row} />

        <EContractWidget kind="loan" loanId={row._id} />

        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Bank / e-wallet yang dicatat", row.namaBank ?? "Tidak dicatat (data lama)"],
            ["Rekening / akun yang dicatat", row.nomorRekening],
            ["Keperluan", loanPurposeLabel(row.tujuan)],
            [
              "Skema",
              row.tenorBulan !== null
                ? `Bulanan — ${row.tenorBulan} bulan`
                : `Harian — ${row.tenorHari ?? 30} hari`,
            ],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ...(row.tenorBulan !== null
              ? ([
                  ["Uang muka pada simulasi (DP 0%)", formatRupiah(0)],
                  ["Pokok simulasi (tidak ditransfer)", formatRupiah(row.pokokPinjaman)],
                  [
                    "Biaya layanan (3% dari pokok)",
                    formatRupiah(
                      row.biayaLayananTotal ??
                        Math.max(
                          0,
                          (row.totalKewajiban ?? 0) -
                            row.pokokPinjaman -
                            (row.imbalHasilTotal ?? 0),
                        ),
                    ),
                  ],
                  ["Bunga menurun pada simulasi", formatRupiah(row.imbalHasilTotal ?? 0)],
                  ["Cicilan per bulan (ilustrasi)", formatRupiah(row.cicilanPerBulan ?? 0)],
                  ["Total pengembalian simulasi", formatRupiah(row.totalKewajiban ?? 0)],
                ] as Array<[string, string]>)
              : ([
                  ["Biaya admin (3%)", formatRupiah(q.biayaAdmin)],
                  ["Biaya platform (2%)", formatRupiah(q.biayaPlatform)],
                  ["Nilai bersih simulasi (95%; tidak ditransfer)", formatRupiah(q.danaBersihDitransfer)],
                  ["Bunga simulasi (30%)", formatRupiah(q.bunga)],
                  ["Total kewajiban simulasi (130%)", formatRupiah(q.totalKewajibanPelunasan)],
                ] as Array<[string, string]>)),
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 px-3 py-3 sm:gap-4 sm:px-4">
              <dt className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm">{label}</dt>
              <dd className="min-w-0 break-words text-right text-xs leading-5 sm:text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        {row.status === "didanai" && row.jatuhTempoPada !== null && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              (row.hariTerlambat ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p
              className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
                (row.hariTerlambat ?? 0) > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {(row.hariTerlambat ?? 0) > 0
                ? `Melewati tanggal acuan ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Tanggal acuan hari ini"
                  : `Tanggal acuan dalam ${row.sisaHari} hari`}
            </p>
            <p className="mt-1 text-sm">
              Tanggal acuan {formatDate(row.jatuhTempoPada)} · total simulasi dengan denda{" "}
              <span className="font-semibold tabular-nums">
                {formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}
              </span>
              {(row.dendaTerlambat ?? 0) > 0 && (
                <span className="tabular-nums text-destructive">
                  {" "}
                  (denda {formatRupiah(row.dendaTerlambat ?? 0)})
                </span>
              )}
            </p>
          </div>
        )}

        {!decided && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alasan-pinjaman">
                Catatan alasan (wajib untuk penolakan internal)
              </Label>
              <Textarea
                id="alasan-pinjaman"
                aria-invalid={reason.trim().length === 0}
                aria-describedby="alasan-pinjaman-help"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: informasi/dokumen yang dimasukkan belum lengkap…"
              />
              <p id="alasan-pinjaman-help" className="text-xs text-muted-foreground">
                Isi alasan sebelum memilih Tolak; alasan akan dicatat sebagai bagian dari keputusan internal.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2 min-[420px]:flex min-[420px]:flex-wrap">
              {pending && (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    run("review", () => markInReview({ loanId: row._id }))
                  }
                >
                  {busy === "review" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Mulai review
                </Button>
              )}
              <Button
                disabled={busy !== null}
                onClick={() => run("approve", () => approve({ loanId: row._id }))}
              >
                {busy === "approve" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Setujui (status aplikasi)
              </Button>
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() => run("reject", () => reject({ loanId: row._id, reason }))}
              >
                {busy === "reject" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tolak dengan alasan
              </Button>
            </div>
          </>
        )}

        {row.catatanReview && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan keputusan</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
