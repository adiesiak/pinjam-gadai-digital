import { useMutation, useQuery } from "convex/react";
import { FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

/** Tanggal hari ini (YYYY-MM-DD) untuk nilai awal form — dihitung sekali saat
 * modul dimuat supaya render tetap murni (bebas `Date.now()` saat render). */
const HARI_INI = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 10);

export function ManualPaymentEvidenceForm({
  jenis,
  targetId,
  reference,
  suggestedAmount,
}: {
  jenis: "pinjaman" | "kredit_barang" | "gadai";
  targetId: Id<"loans"> | Id<"kreditBarang"> | Id<"pawns">;
  reference: string;
  suggestedAmount: number;
}) {
  const instructions = useQuery(api.system.getPaymentInstructions);
  const generateUploadUrl = useMutation(api.loans.generatePaymentReceiptUploadUrl);
  const submit = useMutation(api.loans.submitManualPaymentReceipt);
  const [amount, setAmount] = useState(String(Math.max(1, Math.round(suggestedAmount))));
  const [method, setMethod] = useState<"transfer" | "qris">("transfer");
  const [transferDate, setTransferDate] = useState(HARI_INI);
  const [bankReference, setBankReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold">Kirim bukti untuk pencocokan manual</h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Referensi {reference}. Pengiriman dan pencocokan bukti tidak mencatat cicilan, mengubah status, atau memengaruhi ledger. Pastikan instruksi penerima dengan kanal resmi sebelum transfer.</p>
      {instructions && (
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2">
          <div><p className="font-medium">Transfer bank (instruksi)</p><p className="mt-1">{instructions.namaBank} · {instructions.nomorRekening}</p><p>{instructions.namaRekening}</p></div>
          <div><p className="font-medium">QRIS · {instructions.namaMerchantQris}</p>{instructions.qrisUrl ? <img src={instructions.qrisUrl} alt={`QRIS ${instructions.namaMerchantQris}`} className="mt-2 max-h-36 object-contain" /> : <p className="mt-1 text-muted-foreground">Gambar QRIS belum diunggah admin.</p>}</div>
        </div>
      )}
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={async (event) => {
        event.preventDefault();
        const rupiah = Number(amount);
        if (!Number.isSafeInteger(rupiah) || rupiah <= 0) { toast.error("Nominal harus rupiah bulat positif."); return; }
        if (bankReference.trim().length < 4 || !file) { toast.error("Referensi bank dan bukti unggahan wajib diisi."); return; }
        if (file.size > 5_000_000 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { toast.error("Bukti harus JPG, PNG, WebP, atau PDF maksimal 5 MB."); return; }
        setBusy(true);
        try {
          const url = await generateUploadUrl();
          const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
          const result = (await response.json()) as { storageId?: Id<"_storage"> };
          if (!response.ok || !result.storageId) throw new Error("Bukti gagal diunggah.");
          const target = jenis === "pinjaman" ? { loanId: targetId as Id<"loans"> } : jenis === "kredit_barang" ? { kreditId: targetId as Id<"kreditBarang"> } : { pawnId: targetId as Id<"pawns"> };
          const saved = await submit({ jenis, ...target, jumlah: rupiah, metodePembayaran: method, tanggalTransfer: new Date(`${transferDate}T00:00:00`).getTime(), referensiTransfer: bankReference, buktiPembayaranId: result.storageId });
          toast.success(`Bukti ${saved.nomorReferensi} masuk antrean pencocokan manual.`);
          setBankReference("");
          setFile(null);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Bukti pembayaran gagal dikirim.");
        } finally {
          setBusy(false);
        }
      }}>
        <div><Label htmlFor={`receipt-amount-${targetId}`}>Nominal yang diklaim</Label><Input id={`receipt-amount-${targetId}`} type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label htmlFor={`receipt-method-${targetId}`}>Metode</Label><select id={`receipt-method-${targetId}`} className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value as "transfer" | "qris")}><option value="transfer">Transfer bank</option><option value="qris" disabled={!instructions?.qrisUrl}>{instructions?.qrisUrl ? "QRIS" : "QRIS (belum tersedia)"}</option></select></div>
        <div><Label htmlFor={`receipt-date-${targetId}`}>Tanggal transfer</Label><Input id={`receipt-date-${targetId}`} type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} /></div>
        <div><Label htmlFor={`receipt-reference-${targetId}`}>Referensi transfer</Label><Input id={`receipt-reference-${targetId}`} value={bankReference} onChange={(e) => setBankReference(e.target.value)} maxLength={120} placeholder="Nomor referensi dari aplikasi bank" /></div>
        <div className="sm:col-span-2"><Label htmlFor={`receipt-file-${targetId}`}>Bukti unggahan (maks. 5 MB)</Label><Input id={`receipt-file-${targetId}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <Button type="submit" size="sm" disabled={busy} className="sm:col-span-2">{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileUp className="mr-2 size-4" />}Kirim bukti saja</Button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">Jumlah contoh {formatRupiah(suggestedAmount)} · pencocokan dilakukan manual oleh tim PINDAI.</p>
    </section>
  );
}

export function ManualPaymentEvidenceHistory() {
  const rows = useQuery(api.loans.myManualPaymentReceipts);
  if (!rows?.length) return null;
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Riwayat bukti pembayaran yang dikirim</h3>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((row) => <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span>{row.nomorReferensi} · {formatRupiah(row.jumlah)} · {row.jenis}</span><span className="text-muted-foreground">{row.status === "dicocokkan" ? "Mutasi dicocokkan — saldo tidak berubah" : row.status === "ditolak" ? `Ditolak${row.catatanAdmin ? `: ${row.catatanAdmin}` : ""}` : "Menunggu pencocokan"}</span></li>)}
      </ul>
    </section>
  );
}
