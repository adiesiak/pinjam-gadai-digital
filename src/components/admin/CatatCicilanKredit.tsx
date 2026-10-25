import { useMutation, useQuery } from "convex/react";
import { Loader2, ReceiptText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

import { formatDate } from "./admin-format";
import type { KreditRowData } from "./KreditReviewDialog";

/** Tanggal hari ini dalam format input `date` (zona waktu peramban). */
function tanggalHariIni(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Hanya digit — input nominal tidak menerima titik/format lain. */
function hanyaDigit(teks: string): string {
  return teks.replace(/\D/g, "");
}

/**
 * Pencatatan satu cicilan Kredit Barang oleh admin.
 *
 * Nominal tidak bisa diketik bebas: server menolak angka selain tagihan bulan
 * berikutnya, jadi kolomnya diisi tagihan itu dan admin hanya mencocokkan
 * mutasi bank. Bila peminjam sudah mengirim bukti transfer, bukti itu bisa
 * dipilih agar ikut ditandai `dicocokkan` dan tidak menggantung di antrean.
 */
export function CatatCicilanKredit({
  row,
  onRecorded,
}: {
  row: KreditRowData;
  onRecorded?: () => void;
}) {
  const tagihan = row.cicilanBerikut;
  const bukti = useQuery(api.cicilanKredit.buktiKreditMenunggu, {
    kreditId: row._id,
  });
  const catat = useMutation(api.cicilanKredit.catatCicilanKredit);

  const [jumlah, setJumlah] = useState(tagihan !== null ? String(tagihan.total) : "");
  const [tanggal, setTanggal] = useState(tanggalHariIni);
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [receiptId, setReceiptId] = useState<Id<"manualPaymentReceipts"> | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (tagihan === null) {
    return (
      <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Seluruh cicilan sudah tercatat. Status kredit menunggu penutupan otomatis.
      </p>
    );
  }

  const kirim = async () => {
    const nominal = Number(jumlah);
    if (!Number.isSafeInteger(nominal) || nominal <= 0) {
      setError("Nominal cicilan harus angka rupiah bulat.");
      return;
    }
    if (referensi.trim().length < 4) {
      setError("Isi referensi mutasi bank minimal 4 karakter.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hasil = await catat({
        kreditId: row._id,
        jumlah: nominal,
        tanggal: new Date(`${tanggal}T12:00:00`).getTime(),
        referensiMutasi: referensi.trim(),
        ...(receiptId === "" ? {} : { receiptId }),
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      toast.success(
        hasil.lunas
          ? `Cicilan bulan ${hasil.bulanKe} tercatat — kredit lunas.`
          : `Cicilan bulan ${hasil.bulanKe} tercatat di ledger.`,
      );
      onRecorded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat cicilan kredit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
        <ReceiptText className="size-3.5 text-emerald-700" aria-hidden />
        Catat cicilan diterima
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-600">
        Bulan {tagihan.bulan} dari {row.totalBulan} · tagihan{" "}
        <strong className="tabular-nums">{formatRupiah(tagihan.total)}</strong> (pokok{" "}
        {formatRupiah(tagihan.pokok)} + margin {formatRupiah(tagihan.margin)}).
      </p>

      {bukti !== undefined && bukti.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
          <p className="text-[11px] font-semibold text-amber-900">
            Bukti transfer menunggu pencocokan
          </p>
          <ul className="mt-1 space-y-1">
            {bukti.map((b) => (
              <li key={b._id}>
                <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-amber-900">
                  <input
                    type="radio"
                    name={`bukti-${row._id}`}
                    checked={receiptId === b._id}
                    onChange={() => {
                      setReceiptId(b._id);
                      setJumlah(String(b.jumlah));
                      setTanggal(
                        new Date(b.tanggalTransfer).toISOString().slice(0, 10),
                      );
                      setReferensi(b.referensiTransfer);
                    }}
                    className="mt-0.5 accent-emerald-700"
                  />
                  <span>
                    <span className="font-mono">{b.nomorReferensi}</span> ·{" "}
                    {formatRupiah(b.jumlah)} · {formatDate(b.tanggalTransfer)} ·{" "}
                    {b.referensiTransfer}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {receiptId !== "" && (
            <button
              type="button"
              onClick={() => setReceiptId("")}
              className="mt-1 text-[11px] font-semibold text-amber-800 underline underline-offset-2"
            >
              Lepas bukti
            </button>
          )}
        </div>
      )}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-[11px] font-medium text-slate-700">
          Nominal diterima
          <Input
            value={jumlah}
            onChange={(e) => setJumlah(hanyaDigit(e.target.value))}
            inputMode="numeric"
            className="mt-1 h-9 tabular-nums"
          />
        </label>
        <label className="block text-[11px] font-medium text-slate-700">
          Tanggal diterima
          <Input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="mt-1 h-9"
          />
        </label>
        <label className="block text-[11px] font-medium text-slate-700 sm:col-span-2">
          Referensi mutasi bank
          <Input
            value={referensi}
            onChange={(e) => setReferensi(e.target.value)}
            placeholder="mis. TRF-20261023-001"
            className="mt-1 h-9 font-mono text-xs"
          />
        </label>
        <label className="block text-[11px] font-medium text-slate-700 sm:col-span-2">
          Catatan (opsional)
          <Input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. disetor tunai ke kantor"
            className="mt-1 h-9"
          />
        </label>
      </div>

      {error !== null && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-800">
          {error}
        </p>
      )}

      <Button
        type="button"
        disabled={busy}
        onClick={() => void kirim()}
        className="mt-2 w-full gap-1.5 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}
        Catat cicilan
      </Button>
    </div>
  );
}
