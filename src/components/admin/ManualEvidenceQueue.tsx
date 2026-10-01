import { useMutation, useQuery } from "convex/react";
import { ExternalLink, Loader2, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyQueue } from "@/components/admin/admin-shared";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

export function ManualEvidenceQueue() {
  const receipts = useQuery(api.admin.pendingManualPaymentReceipts);
  const deposits = useQuery(api.admin.pendingDepositEvidence);
  const matchReceipt = useMutation(api.admin.matchManualPaymentReceipt);
  const rejectReceipt = useMutation(api.admin.rejectManualPaymentReceipt);
  const matchDeposit = useMutation(api.admin.matchDepositEvidence);
  const rejectDeposit = useMutation(api.admin.rejectDeposit);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const match = async (id: string, kind: "receipt" | "deposit", amount: number) => {
    const reference = references[id]?.trim() ?? "";
    if (reference.length < 4) { toast.error("Referensi mutasi wajib minimal 4 karakter."); return; }
    if (Number(amounts[id] ?? amount) !== amount) { toast.error("Nominal mutasi harus sama persis dengan klaim."); return; }
    setBusy(id);
    try {
      if (kind === "receipt") await matchReceipt({ receiptId: id as Id<"manualPaymentReceipts">, referensiMutasi: reference, jumlahMutasi: amount });
      else await matchDeposit({ depositId: id as Id<"deposits">, referensiMutasi: reference, jumlahMutasi: amount });
      toast.success("Mutasi dicatat cocok; saldo dan status kewajiban tidak berubah.");
      setReferences((state) => ({ ...state, [id]: "" }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencatat pencocokan."); }
    finally { setBusy(null); }
  };

  const reject = async (id: string, kind: "receipt" | "deposit") => {
    const reason = reasons[id]?.trim() ?? "";
    if (!reason) { toast.error("Alasan penolakan wajib diisi."); return; }
    setBusy(id);
    try {
      if (kind === "receipt") await rejectReceipt({ receiptId: id as Id<"manualPaymentReceipts">, reason });
      else await rejectDeposit({ depositId: id as Id<"deposits">, reason });
      toast.success("Bukti ditolak pada catatan internal; saldo/status tidak berubah.");
      setReasons((state) => ({ ...state, [id]: "" }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menolak bukti."); }
    finally { setBusy(null); }
  };

  const loading = receipts === undefined || deposits === undefined;
  return (
    <section className="space-y-8">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
        Antrean ini hanya untuk membandingkan bukti unggahan dengan mutasi yang diperiksa operator. Tindakan di sini tidak membuat cicilan, tidak mengubah status pinjaman/gadai, dan tidak mengkredit saldo atau ledger.
      </p>
      <EvidenceList title="Bukti pembayaran Peminjam" loading={loading} empty={!loading && (receipts?.length ?? 0) === 0}>
        {receipts?.map((row) => (
          <li key={row._id} className="space-y-3 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold">{formatRupiah(row.jumlah)} · {row.jenis.replace("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{row.nomorReferensi} · {row.emailPemohon ?? "tanpa email"} · {row.metodePembayaran} · {new Date(row.tanggalTransfer).toLocaleDateString("id-ID")}</p><p className="mt-1 text-xs text-muted-foreground">Referensi pemohon: {row.referensiTransfer}</p></div>
              {row.buktiUrl ? <a href={row.buktiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"><ExternalLink className="size-3" />Buka bukti</a> : <span className="text-xs text-destructive">File bukti tidak tersedia</span>}
            </div>
            {row.buktiUrl && row.fileContentType === "application/pdf" ? <a href={row.buktiUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Lihat PDF</a> : row.buktiUrl ? <a href={row.buktiUrl} target="_blank" rel="noreferrer"><img src={row.buktiUrl} alt={`Bukti ${row.nomorReferensi}`} className="max-h-52 rounded-lg border border-slate-200 object-contain" /></a> : null}
            <MatchControls id={row._id} amount={row.jumlah} reference={references[row._id] ?? ""} amountInput={amounts[row._id] ?? String(row.jumlah)} reason={reasons[row._id] ?? ""} busy={busy === row._id} matchAvailable={Boolean(row.buktiUrl)} onReference={(value) => setReferences((state) => ({ ...state, [row._id]: value }))} onAmount={(value) => setAmounts((state) => ({ ...state, [row._id]: value }))} onReason={(value) => setReasons((state) => ({ ...state, [row._id]: value }))} onMatch={() => void match(row._id, "receipt", row.jumlah)} onReject={() => void reject(row._id, "receipt")} />
          </li>
        ))}
      </EvidenceList>
      <EvidenceList title="Bukti setoran Pendana" loading={loading} empty={!loading && (deposits?.length ?? 0) === 0}>
        {deposits?.map((row) => (
          <li key={row._id} className="space-y-3 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{formatRupiah(row.jumlah)} · {row.metodePembayaran ?? "metode lama"}</p><p className="mt-1 text-xs text-muted-foreground">{row.nomorReferensi} · {row.emailPendana ?? "tanpa email"} · referensi pemohon: {row.referensiTransfer}</p>{row.tanggalTransfer && <p className="mt-1 text-xs text-muted-foreground">{new Date(row.tanggalTransfer).toLocaleDateString("id-ID")}</p>}</div>{row.buktiUrl ? <a href={row.buktiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"><ExternalLink className="size-3" />Buka bukti</a> : <span className="text-xs text-destructive">File bukti tidak tersedia</span>}</div>
            {row.buktiUrl && (row.fileContentType === "application/pdf" ? <a href={row.buktiUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Lihat PDF</a> : <a href={row.buktiUrl} target="_blank" rel="noreferrer"><img src={row.buktiUrl} alt={`Bukti setoran ${row.nomorReferensi}`} className="max-h-52 rounded-lg border border-slate-200 object-contain" /></a>)}
            <MatchControls id={row._id} amount={row.jumlah} reference={references[row._id] ?? ""} amountInput={amounts[row._id] ?? String(row.jumlah)} reason={reasons[row._id] ?? ""} busy={busy === row._id} matchAvailable={Boolean(row.buktiUrl)} onReference={(value) => setReferences((state) => ({ ...state, [row._id]: value }))} onAmount={(value) => setAmounts((state) => ({ ...state, [row._id]: value }))} onReason={(value) => setReasons((state) => ({ ...state, [row._id]: value }))} onMatch={() => void match(row._id, "deposit", row.jumlah)} onReject={() => void reject(row._id, "deposit")} />
          </li>
        ))}
      </EvidenceList>
    </section>
  );
}

function EvidenceList({ title, loading, empty, children }: { title: string; loading: boolean; empty: boolean; children: ReactNode }) {
  return <div><h3 className="mb-3 text-sm font-semibold text-navy">{title}</h3>{loading ? <p className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Memuat bukti…</p> : empty ? <EmptyQueue icon={Wallet} title="Tidak ada bukti yang menunggu pencocokan" /> : <ul className="animate-masuk divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">{children}</ul>}</div>;
}

function MatchControls({ id, amount, reference, amountInput, reason, busy, matchAvailable, onReference, onAmount, onReason, onMatch, onReject }: { id: string; amount: number; reference: string; amountInput: string; reason: string; busy: boolean; matchAvailable: boolean; onReference: (value: string) => void; onAmount: (value: string) => void; onReason: (value: string) => void; onMatch: () => void; onReject: () => void }) {
  return <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><div><Label htmlFor={`match-ref-${id}`} className="text-xs">Referensi mutasi yang diperiksa</Label><Input id={`match-ref-${id}`} value={reference} onChange={(event) => onReference(event.target.value)} maxLength={120} /></div><div><Label htmlFor={`match-amount-${id}`} className="text-xs">Nominal mutasi (klaim {formatRupiah(amount)})</Label><Input id={`match-amount-${id}`} type="number" min="0" value={amountInput} onChange={(event) => onAmount(event.target.value)} /></div><Button type="button" size="sm" disabled={busy || !matchAvailable || reference.trim().length < 4 || Number(amountInput) !== amount} onClick={onMatch}>Catat kecocokan mutasi</Button><div className="flex gap-2"><Textarea aria-label={`Alasan penolakan ${id}`} rows={1} value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Alasan jika bukti ditolak" /><Button type="button" size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={onReject}>Tolak bukti</Button></div></div>;
}
