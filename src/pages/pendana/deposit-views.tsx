import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Setoran Pendana hanya mengumpulkan bukti untuk pencocokan admin. */
export function DepositForm() {
  const instructions = useQuery(api.system.getPaymentInstructions);
  const generateUploadUrl = useMutation(api.pendana.generateDepositUploadUrl);
  const requestDeposit = useMutation(api.pendana.requestDeposit);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<"transfer" | "qris">("transfer");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (instructions === undefined) return <p className="text-sm text-muted-foreground">Memuat instruksi…</p>;
  if (!instructions.pendanaDepositEnabled) return <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Pengiriman bukti setoran belum dibuka oleh tim operasional. Pencocokan admin tidak mengkreditkan saldo.</section>;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div><h3 className="text-sm font-semibold">Kirim bukti setoran</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Bukti hanya ditinjau dan dicocokkan secara manual; saldo ledger tetap tidak berubah.</p></div>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <div><p className="text-xs font-semibold">Transfer bank</p><p className="mt-1 text-sm">{instructions.namaBank} · {instructions.nomorRekening}</p><p className="text-xs text-muted-foreground">{instructions.namaRekening}</p></div>
        <div><p className="text-xs font-semibold">QRIS · {instructions.namaMerchantQris}</p>{instructions.qrisUrl ? <img src={instructions.qrisUrl} alt={`QRIS ${instructions.namaMerchantQris}`} className="mt-2 max-h-40 object-contain" /> : <p className="mt-1 text-xs text-muted-foreground">QRIS belum diunggah admin.</p>}</div>
      </div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (event) => {
        event.preventDefault();
        const rupiah = Number(amount);
        if (!Number.isSafeInteger(rupiah) || rupiah < 100_000 || !file || reference.trim().length < 4) { toast.error("Isi nominal minimal Rp100.000, referensi, dan bukti unggahan."); return; }
        if (file.size > 5_000_000 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { toast.error("Bukti harus JPG, PNG, WebP, atau PDF maksimal 5 MB."); return; }
        setBusy(true);
        try {
          const url = await generateUploadUrl();
          const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
          const result = (await response.json()) as { storageId?: Id<"_storage"> };
          if (!response.ok || !result.storageId) throw new Error("Bukti gagal diunggah.");
          await requestDeposit({ jumlah: rupiah, referensiTransfer: reference, metodePembayaran: method, tanggalTransfer: new Date(`${date}T00:00:00`).getTime(), buktiPembayaranId: result.storageId });
          toast.success("Bukti masuk antrean pencocokan. Saldo tidak berubah.");
          setAmount(""); setReference(""); setFile(null);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Bukti setoran gagal dikirim.");
        } finally { setBusy(false); }
      }}>
        <div><Label htmlFor="deposit-amount">Nominal yang diklaim</Label><Input id="deposit-amount" type="number" min="100000" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label htmlFor="deposit-method">Metode</Label><select id="deposit-method" className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value as "transfer" | "qris")}><option value="transfer">Transfer bank</option><option value="qris" disabled={!instructions.qrisUrl}>{instructions.qrisUrl ? "QRIS" : "QRIS (belum tersedia)"}</option></select></div>
        <div><Label htmlFor="deposit-date">Tanggal transfer</Label><Input id="deposit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label htmlFor="deposit-reference">Referensi transfer</Label><Input id="deposit-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} /></div>
        <div className="sm:col-span-2"><Label htmlFor="deposit-file">Bukti unggahan (maks. 5 MB)</Label><Input id="deposit-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Mengunggah…" : "Kirim bukti saja"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Nominal ini adalah klaim pengguna: {formatRupiah(Number(amount) || 0)}. Pencocokan admin bukan konfirmasi bank dan tidak menambah saldo.</p>
    </section>
  );
}

/** Dialog kompatibilitas tanpa QR atau nomor rekening/VA contoh. */
export function DepositSimDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Setoran belum tersedia</DialogTitle>
          <DialogDescription>
            Tidak ada QR, virtual account, atau instruksi pembayaran aktif. Jangan mengirim dana berdasarkan tampilan atau catatan aplikasi.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
