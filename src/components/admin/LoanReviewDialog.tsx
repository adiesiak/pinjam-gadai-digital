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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="tabular-nums">
              {formatRupiah(row.pokokPinjaman)}
            </DialogTitle>
            <StatusBadge status={row.status} kind="loan" />
          </div>
          <DialogDescription className="tabular-nums">
            {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <LoanKycPanel row={row} />

        <EContractWidget kind="loan" loanId={row._id} />

        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Rekening tujuan", row.nomorRekening],
            ["Keperluan", loanPurposeLabel(row.tujuan)],
            ["Tenor", row.tenorHari !== null ? `${row.tenorHari} hari` : "—"],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ["Biaya Admin (3%)", formatRupiah(q.biayaAdmin)],
            ["Biaya Platform (2%)", formatRupiah(q.biayaPlatform)],
            ["Dana bersih (95%)", formatRupiah(q.danaBersihDitransfer)],
            ["Bunga (30%)", formatRupiah(q.bunga)],
            ["Total kewajiban (130%)", formatRupiah(q.totalKewajibanPelunasan)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
              <dd className="text-right text-sm">{value}</dd>
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
                ? `Terlambat ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Jatuh tempo hari ini"
                  : `Jatuh tempo ${row.sisaHari} hari lagi`}
            </p>
            <p className="mt-1 text-sm">
              Batas {formatDate(row.jatuhTempoPada)} · total dengan denda{" "}
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
                Alasan (wajib untuk penolakan)
              </Label>
              <Textarea
                id="alasan-pinjaman"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: verifikasi dokumen belum lengkap…"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
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
                Setujui
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
