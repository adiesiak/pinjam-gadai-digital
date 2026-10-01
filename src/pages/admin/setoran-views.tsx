import { useMutation } from "convex/react";
import { Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyQueue } from "@/components/admin/admin-shared";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

export type PendingDeposit = {
  _id: Id<"deposits">;
  nomorReferensi: string;
  jumlah: number;
  referensiTransfer: string;
  emailPendana: string | null;
};

export type PendingWithdrawal = {
  _id: Id<"withdrawals">;
  nomorReferensi: string;
  jumlah: number;
  namaBank: string;
  nomorRekening: string;
  emailPendana: string | null;
};

export type LedgerSummary = {
  totalDebit: number;
  totalKredit: number;
  entryCount: number;
  seimbang: boolean;
  /** Total biaya platform yang sudah dijurnal (platform:FEE, sisi debit). */
  pendapatanPlatform: number;
};

/** Tab catatan saldo — tinjauan entri setoran/penarikan dan kesehatan ledger internal. */
export function SetoranSection({
  pendingDeposits,
  pendingWd,
  ledger,
}: {
  pendingDeposits: PendingDeposit[] | undefined;
  pendingWd: PendingWithdrawal[] | undefined;
  ledger: LedgerSummary | undefined;
}) {
  const rejectDeposit = useMutation(api.admin.rejectDeposit);
  const rejectWd = useMutation(api.admin.rejectWithdrawal);

  const [rejectingDeposit, setRejectingDeposit] = useState<{
    id: Id<"deposits">;
    ref: string;
  } | null>(null);
  const [depositReason, setDepositReason] = useState("");
  const [rejectingWd, setRejectingWd] = useState<{
    id: Id<"withdrawals">;
    ref: string;
  } | null>(null);
  const [wdReason, setWdReason] = useState("");

  return (
    <>
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Semua nominal dan saldo adalah catatan ledger internal. Admin hanya dapat meninjau atau menolak catatan; persetujuan manual dicatat pada ledger internal. Konfirmasi setoran dan pemrosesan penarikan dinonaktifkan.
      </p>
      {pendingDeposits === undefined ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : pendingDeposits.length === 0 ? (
        <EmptyQueue icon={Wallet} title="Tidak ada catatan setoran menunggu tinjauan" />
      ) : (
        <ul className="animate-masuk divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {pendingDeposits.map((d) => (
            <li key={d._id} className="flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {d.nomorReferensi} · {d.emailPendana ?? "tanpa email"} · referensi yang dicantumkan: {d.referensiTransfer}
                </p>
              </div>
              <div className="flex w-full shrink-0 sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full rounded-full sm:w-auto"
                  onClick={() => setRejectingDeposit({ id: d._id, ref: d.nomorReferensi })}
                >
                  Tolak catatan
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Antrean penarikan Pendana */}
      <h3 className="mt-10 text-sm font-semibold text-navy">Catatan permintaan penarikan</h3>
      {pendingWd === undefined ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : pendingWd.length === 0 ? (
        <EmptyQueue icon={Wallet} title="Tidak ada catatan penarikan menunggu tinjauan" />
      ) : (
        <ul className="animate-masuk divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {pendingWd.map((w) => (
            <li key={w._id} className="flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">{formatRupiah(w.jumlah)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {w.nomorReferensi} · {w.emailPendana ?? "tanpa email"} · {w.namaBank} {w.nomorRekening}
                </p>
              </div>
              <div className="flex w-full shrink-0 sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full rounded-full sm:w-auto"
                  onClick={() => setRejectingWd({ id: w._id, ref: w.nomorReferensi })}
                >
                  Tolak catatan
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="clay-card mt-10 p-6">
        <h3 className="text-sm font-semibold text-navy">Keseimbangan jurnal internal (double-entry)</h3>
        {ledger === undefined ? (
          <p className="mt-3 text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <>
            <div className="animate-masuk mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ["Total debit", formatRupiah(ledger.totalDebit)],
                ["Total kredit", formatRupiah(ledger.totalKredit)],
                ["Jumlah entri", `${ledger.entryCount}`],
                ["Biaya platform pada ledger", formatRupiah(ledger.pendapatanPlatform)],
                ["Status", ledger.seimbang ? "Seimbang" : "Tidak seimbang"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Jurnal internal append-only. Keseimbangan debit/kredit hanya memeriksa entri ledger, bukan transaksi bank. Nilai biaya pinjaman, potongan gadai, dan layanan Kredit Barang adalah catatan internal, bukan pendapatan yang diterima.
            </p>
          </>
        )}
      </div>

      {/* Dialog tolak setoran */}
      <Dialog open={rejectingDeposit !== null} onOpenChange={(open) => !open && setRejectingDeposit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak catatan setoran</DialogTitle>
            <DialogDescription>
              {rejectingDeposit?.ref} — alasan wajib diisi dan akan tercatat. Tindakan ini hanya mengubah status ledger; bukan pemeriksaan bukti bank.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            id="reject-deposit-reason"
            aria-label="Alasan penolakan catatan setoran"
            required
            aria-required="true"
            aria-invalid={!depositReason.trim()}
            rows={3}
            value={depositReason}
            onChange={(e) => setDepositReason(e.target.value)}
            placeholder="Contoh: informasi yang dikirim belum sesuai dengan catatan aplikasi…"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRejectingDeposit(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!depositReason.trim()}
              onClick={async () => {
                if (!rejectingDeposit) return;
                try {
                  await rejectDeposit({ depositId: rejectingDeposit.id, reason: depositReason });
                  toast.success("Catatan setoran ditolak pada ledger.");
                  setRejectingDeposit(null);
                  setDepositReason("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menolak setoran.");
                }
              }}
            >
              Tolak catatan setoran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tolak penarikan */}
      <Dialog open={rejectingWd !== null} onOpenChange={(open) => !open && setRejectingWd(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak catatan permintaan penarikan</DialogTitle>
            <DialogDescription>
              {rejectingWd?.ref} — alasan wajib diisi dan akan tercatat di audit. Tindakan ini hanya mengubah status internal pada ledger.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            id="reject-withdrawal-reason"
            aria-label="Alasan penolakan catatan permintaan penarikan"
            required
            aria-required="true"
            aria-invalid={!wdReason.trim()}
            rows={3}
            value={wdReason}
            onChange={(e) => setWdReason(e.target.value)}
            placeholder="Contoh: rekening tujuan tidak cocok dengan identitas…"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRejectingWd(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!wdReason.trim()}
              onClick={async () => {
                if (!rejectingWd) return;
                try {
                  await rejectWd({ withdrawalId: rejectingWd.id, reason: wdReason });
                  toast.success("Catatan permintaan penarikan ditolak pada ledger.");
                  setRejectingWd(null);
                  setWdReason("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menolak penarikan.");
                }
              }}
            >
              Tolak catatan penarikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
