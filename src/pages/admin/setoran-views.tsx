import { useMutation } from "convex/react";
import { BadgeCheck, Loader2, Wallet } from "lucide-react";
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
};

/** Tab Setoran — verifikasi setoran/penarikan Pendana + kesehatan ledger. */
export function SetoranSection({
  pendingDeposits,
  pendingWd,
  ledger,
}: {
  pendingDeposits: PendingDeposit[] | undefined;
  pendingWd: PendingWithdrawal[] | undefined;
  ledger: LedgerSummary | undefined;
}) {
  const confirmDeposit = useMutation(api.admin.confirmDeposit);
  const processWd = useMutation(api.admin.processWithdrawal);
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
    <>        {pendingDeposits === undefined ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : pendingDeposits.length === 0 ? (
        <EmptyQueue icon={Wallet} title="Tidak ada setoran menunggu verifikasi" />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {pendingDeposits.map((d) => (
            <li key={d._id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {d.nomorReferensi} · {d.emailPendana ?? "tanpa email"} · ref transfer: {d.referensiTransfer}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  className="gradient-primary rounded-full border-0"
                  onClick={async () => {
                    try {
                      await confirmDeposit({ depositId: d._id });
                      toast.success("Setoran terverifikasi & tercatat di jurnal.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Gagal konfirmasi.");
                    }
                  }}
                >
                  <BadgeCheck className="mr-1 size-4" />
                  Verifikasi
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setRejectingDeposit({ id: d._id, ref: d.nomorReferensi })}
                >
                  Tolak
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Antrean penarikan Pendana */}
      <h3 className="mt-10 text-sm font-semibold text-navy">Antrean penarikan dana</h3>
      {pendingWd === undefined ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : pendingWd.length === 0 ? (
        <EmptyQueue icon={Wallet} title="Tidak ada penarikan menunggu diproses" />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {pendingWd.map((w) => (
            <li key={w._id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">{formatRupiah(w.jumlah)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {w.nomorReferensi} · {w.emailPendana ?? "tanpa email"} · {w.namaBank} {w.nomorRekening}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  className="gradient-primary rounded-full border-0"
                  onClick={async () => {
                    try {
                      await processWd({ withdrawalId: w._id });
                      toast.success("Penarikan diproses & tercatat di jurnal.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Gagal memproses.");
                    }
                  }}
                >
                  <BadgeCheck className="mr-1 size-4" />
                  Proses
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setRejectingWd({ id: w._id, ref: w.nomorReferensi })}
                >
                  Tolak
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="clay-card mt-10 p-6">
        <h3 className="text-sm font-semibold text-navy">Kesehatan ledger (double-entry)</h3>
        {ledger === undefined ? (
          <p className="mt-3 text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Total debit", formatRupiah(ledger.totalDebit)],
                ["Total kredit", formatRupiah(ledger.totalKredit)],
                ["Jumlah entri", `${ledger.entryCount}`],
                ["Status", ledger.seimbang ? "Seimbang" : "Tidak seimbang"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Jurnal append-only. Total debit selalu sama dengan total kredit.
            </p>
          </>
        )}
      </div>

      {/* Dialog tolak setoran */}
      <Dialog open={rejectingDeposit !== null} onOpenChange={(open) => !open && setRejectingDeposit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak setoran</DialogTitle>
            <DialogDescription>
              {rejectingDeposit?.ref} — alasan wajib diisi dan akan tercatat.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={depositReason}
            onChange={(e) => setDepositReason(e.target.value)}
            placeholder="Contoh: bukti transfer tidak dapat diverifikasi…"
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
                  toast.success("Setoran ditolak.");
                  setRejectingDeposit(null);
                  setDepositReason("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menolak setoran.");
                }
              }}
            >
              Tolak setoran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tolak penarikan */}
      <Dialog open={rejectingWd !== null} onOpenChange={(open) => !open && setRejectingWd(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak penarikan</DialogTitle>
            <DialogDescription>
              {rejectingWd?.ref} — alasan wajib diisi dan akan tercatat di audit.
            </DialogDescription>
          </DialogHeader>
          <Textarea
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
                  toast.success("Penarikan ditolak.");
                  setRejectingWd(null);
                  setWdReason("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menolak penarikan.");
                }
              }}
            >
              Tolak penarikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
