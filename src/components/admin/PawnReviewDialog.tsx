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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="max-w-72 text-base leading-snug">
              {row.deskripsiBarang}
            </DialogTitle>
            <StatusBadge status={row.status} kind="pawn" />
          </div>
          <DialogDescription className="tabular-nums">
            {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Rekening tujuan", row.nomorRekening],
            ["Kategori", row.kategori],
            ["Alamat penilaian", row.alamatPenilaian],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            [
              "Nilai taksiran",
              row.nilaiTaksiran !== undefined
                ? formatRupiah(row.nilaiTaksiran)
                : "Belum dinilai",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
              <dd className="text-right text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        <EContractWidget kind="pawn" pawnId={row._id} pawnRef={row.nomorReferensi} />

        <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-5 text-muted-foreground">
            Pemeriksaan wajib dilakukan di lokasi dengan pencatatan live
            location. Catat hasil kunjungan sebelum menetapkan taksiran.
          </p>
        </div>

        {!decided && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alasan-gadai">Alasan (wajib untuk penolakan)</Label>
              <Textarea
                id="alasan-gadai"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: barang tidak dapat diverifikasi kepemilikannya…"
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
                    run("appraisal", () => markInAppraisal({ pawnId: row._id }))
                  }
                >
                  {busy === "appraisal" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Jadwalkan penilaian
                </Button>
              )}
              {inAppraisal && (
                <Button onClick={onAppraise}>
                  <ClipboardList className="mr-2 size-4" />
                  Input taksiran
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
                  Rilis barang
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
            <p className="text-xs font-medium text-muted-foreground">Catatan penilaian</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
