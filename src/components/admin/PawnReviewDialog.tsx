import { useMutation } from "convex/react";
import { ClipboardList, Loader2, MapPin } from "lucide-react";
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
import { formatRupiah } from "@/lib/money";

import { formatDate, type PawnRow } from "./admin-shared";

export function PawnReviewDialog({
  row,
  onClose,
  onAppraise,
}: {
  row: PawnRow | null;
  onClose: () => void;
  onAppraise: () => void;
}) {
  const markInAppraisal = useMutation(api.loans.markPawnInAppraisal);
  const reject = useMutation(api.loans.rejectPawn);
  const releasePawn = useMutation(api.loans.releasePawn);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (row === null) return null;
  const pending = row.status === "diajukan";
  const inAppraisal = row.status === "sedang_dinilai";
  const decided = row.status === "disetujui" || row.status === "ditolak";

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Perubahan status atau catatan internal tersimpan; ini bukan verifikasi fisik atau bukti penitipan barang.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="max-w-72 text-base leading-snug">
              {row.deskripsiBarang}
            </DialogTitle>
            <StatusBadge status={row.status} kind="pawn" />
          </div>
          <DialogDescription className="tabular-nums">
            Catatan pengajuan internal · {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Bank / e-wallet yang dicatat", row.namaBank ?? "Tidak dicatat (data lama)"],
            ["Rekening / akun yang dicatat", row.nomorRekening],
            ["Kategori yang dipilih", row.kategori],
            ["Alamat yang dilaporkan pemohon", row.alamatPenilaian],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            [
              "Nilai taksiran internal",
              row.nilaiTaksiran !== undefined
                ? formatRupiah(row.nilaiTaksiran)
                : "Belum ada catatan taksiran",
            ],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 px-3 py-3 sm:gap-4 sm:px-4">
              <dt className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm">{label}</dt>
              <dd className="min-w-0 break-words text-right text-xs leading-5 sm:text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        <EContractWidget kind="pawn" pawnId={row._id} pawnRef={row.nomorReferensi} />

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <p className="text-xs leading-5 text-amber-900">
            Alamat berasal dari masukan pemohon. Status atau catatan aplikasi tidak mengonfirmasi kunjungan, koordinat, pemeriksaan fisik, kepemilikan, maupun penitipan barang. Pemeriksaan nyata perlu dikonfirmasi terpisah.
          </p>
        </div>

        {!decided && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alasan-gadai">Alasan (wajib untuk penolakan)</Label>
              <Textarea
                id="alasan-gadai"
                aria-invalid={reason.trim().length === 0}
                aria-describedby="alasan-gadai-help"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: informasi barang atau dokumen belum lengkap…"
              />
              <p id="alasan-gadai-help" className="text-xs text-muted-foreground">
                Isi alasan sebelum memilih Tolak; alasan akan dicatat bersama keputusan.
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
                    run("appraisal", () => markInAppraisal({ pawnId: row._id }))
                  }
                >
                  {busy === "appraisal" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Tandai untuk penilaian
                </Button>
              )}
              {inAppraisal && (
                <Button onClick={onAppraise}>
                  <ClipboardList className="mr-2 size-4" />
                  Catat taksiran internal
                </Button>
              )}
              {row.status === "menunggu_pelepasan" && (
                <Button
                  disabled={busy !== null}
                  onClick={() =>
                    run("release", () => releasePawn({ pawnId: row._id }))
                  }
                >
                  {busy === "release" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Catat status pelepasan (ledger)
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() => run("reject", () => reject({ pawnId: row._id, reason }))}
              >
                {busy === "reject" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tolak dengan alasan
              </Button>
            </div>
          </>
        )}

        {row.catatanReview && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan internal penilaian (bukan verifikasi fisik)</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
