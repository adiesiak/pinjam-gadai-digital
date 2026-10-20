import { useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, FileSearch, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";

type Data = NonNullable<
  ReturnType<typeof useQuery<typeof api.perpanjanganPinjaman.daftarPembayaranPinjaman>>
>;
type Baris = Data["rows"][number];

const LABEL_JALUR: Record<Baris["paymentType"], string> = {
  pelunasan_total: "Pelunasan total",
  bunga_saja: "Bayar bunga saja",
  cicil_pokok: "Cicil pokok",
};

function KartuPembayaran({ row }: { row: Baris }) {
  const verifikasi = useMutation(api.perpanjanganPinjaman.verifikasiPembayaranPinjaman);
  const [referensi, setReferensi] = useState("");
  const [jumlah, setJumlah] = useState(String(row.jumlah));
  const [catatan, setCatatan] = useState("");
  const [konfirmasiTolak, setKonfirmasiTolak] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const rencana = row.rencana;
  const masihCocok =
    rencana.principalSebelum === row.sisaPokokSekarang &&
    rencana.jatuhTempoSebelum === row.jatuhTempoSekarang &&
    rencana.interestDue === row.bungaSekarang;

  const kirim = async (keputusan: "terima" | "tolak") => {
    setGalat(null);
    if (keputusan === "terima") {
      if (referensi.trim().length < 4) {
        setGalat("Referensi mutasi bank wajib diisi (minimal 4 karakter).");
        return;
      }
      const nominal = Number(jumlah);
      if (!Number.isSafeInteger(nominal) || nominal <= 0) {
        setGalat("Nominal mutasi harus rupiah bulat positif.");
        return;
      }
      if (!masihCocok) {
        setGalat("Tagihan sudah berubah. Minta nasabah mengirim bukti baru.");
        return;
      }
    }
    setBusy(true);
    try {
      await verifikasi({
        receiptId: row._id as Id<"manualPaymentReceipts">,
        keputusan,
        ...(keputusan === "terima"
          ? { referensiMutasi: referensi.trim(), jumlahMutasi: Number(jumlah) }
          : {}),
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      toast.success(
        keputusan === "terima"
          ? row.paymentType === "pelunasan_total"
            ? "Pelunasan dicocokkan. Pinjaman ditutup dan alokasi penyedia dana diselesaikan."
            : "Pembayaran dicocokkan. Pokok, bunga, dan jatuh tempo sudah diperbarui."
          : "Bukti ditolak. Pinjaman tidak berubah.",
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Bukti gagal diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        masihCocok ? "border-slate-200" : "border-amber-300"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {row.nomorReferensi} · bukti transfer
          </p>
          <h3 className="mt-1 text-sm font-semibold">{row.namaPeminjam}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.nomorPinjaman} · {LABEL_JALUR[row.paymentType]}
            {row.extensionDays !== null ? ` · +${row.extensionDays} hari` : ""} · transfer{" "}
            {formatTanggalWIB(row.tanggalTransfer)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Diklaim</p>
          <p className="text-lg font-semibold tabular-nums">{formatRupiah(row.jumlah)}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.metodePembayaran === "transfer" ? "Transfer bank" : "QRIS"} · ref{" "}
            {row.referensiTransfer}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-xs sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Bunga periode ini</dt>
          <dd className="tabular-nums">{formatRupiah(rencana.interestDue)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">
            {row.paymentType === "cicil_pokok" ? "Cicilan pokok" : "Pokok"}
          </dt>
          <dd className="tabular-nums">
            {formatRupiah(
              row.paymentType === "cicil_pokok" ? rencana.principalPaid : rencana.principalSebelum,
            )}
          </dd>
        </div>
        {rencana.lateFee > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-red-700">
            <dt>Denda {rencana.hariTerlambat} hari</dt>
            <dd className="tabular-nums">{formatRupiah(rencana.lateFee)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Total tagihan</dt>
          <dd className="font-semibold tabular-nums">{formatRupiah(rencana.totalDue)}</dd>
        </div>
        {row.paymentType !== "pelunasan_total" && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Sisa pokok baru</dt>
              <dd className="tabular-nums">{formatRupiah(rencana.principalSesudah)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">
                Tier {rencana.tierRate}% · bunga berikut
              </dt>
              <dd className="tabular-nums">{formatRupiah(rencana.nextInterestAmount)}</dd>
            </div>
            {rencana.nextDueDate !== null && (
              <div className="flex items-baseline justify-between gap-3 sm:col-span-2">
                <dt className="text-muted-foreground">Jatuh tempo baru</dt>
                <dd className="tabular-nums">{formatTanggalWIB(rencana.nextDueDate)}</dd>
              </div>
            )}
          </>
        )}
      </dl>

      {!masihCocok && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"
        >
          Tagihan sudah berubah sejak bukti dikirim. Jangan cocokkan bukti ini;
          minta nasabah mengirim bukti baru.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {row.buktiUrl === null ? (
          <span className="text-amber-700">Bukti tidak dapat dibuka.</span>
        ) : (
          <a
            href={row.buktiUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-emerald-800 underline-offset-4 hover:underline"
          >
            <FileSearch className="size-3.5" aria-hidden /> Buka bukti transfer
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`mutasi-pinjaman-${row._id}`}>Referensi mutasi bank</Label>
          <Input
            id={`mutasi-pinjaman-${row._id}`}
            value={referensi}
            onChange={(e) => setReferensi(e.target.value)}
            placeholder="Nomor transaksi pada mutasi rekening"
            maxLength={120}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`jumlah-pinjaman-${row._id}`}>Nominal mutasi diterima</Label>
          <Input
            id={`jumlah-pinjaman-${row._id}`}
            type="number"
            min="1"
            step="1"
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`catatan-pinjaman-${row._id}`}>Catatan (opsional)</Label>
          <Input
            id={`catatan-pinjaman-${row._id}`}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder={konfirmasiTolak ? "Alasan penolakan" : "Catatan pencocokan"}
            maxLength={500}
            disabled={busy}
          />
        </div>
      </div>

      {galat !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {galat}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !masihCocok}
          onClick={() => void kirim("terima")}
          className="gap-1.5"
        >
          <Check className="size-4" aria-hidden /> Cocokkan & terapkan
        </Button>
        {konfirmasiTolak ? (
          <span className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void kirim("tolak")}
              className="gap-1.5"
            >
              <X className="size-4" aria-hidden /> Ya, tolak bukti
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setKonfirmasiTolak(false)}
            >
              Batal
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setKonfirmasiTolak(true)}
            className="gap-1.5 text-destructive"
          >
            <X className="size-4" aria-hidden /> Tolak bukti
          </Button>
        )}
        <span className="text-[11px] leading-5 text-muted-foreground">
          {row.paymentType === "pelunasan_total"
            ? "Jurnal memakai event LOAN_REPAYMENT."
            : "Jurnal memakai event INTEREST_ONLY_PAYMENT atau PARTIAL_PRINCIPAL_PAYMENT."}
        </span>
      </div>
    </article>
  );
}

/** Antrean bukti bayar bunga / cicil pokok / pelunasan pinjaman harian. */
export function RekonsiliasiPembayaranPinjaman() {
  const data = useQuery(api.perpanjanganPinjaman.daftarPembayaranPinjaman, {});

  if (data === undefined) return <SkeletonBarisDaftar baris={2} />;
  if (data.rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div>
          <p className="text-sm font-semibold text-emerald-950">
            Antrean perpanjangan & cicil pokok
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-emerald-900">
            {data.jumlah} bukti menunggu. Mencocokkan bukti memperbarui sisa pokok,
            tier bunga, bunga periode berikut, dan jatuh tempo sesuai snapshot server.
          </p>
        </div>
        <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-900">
          {data.jumlah} bukti
        </span>
      </div>
      {data.rows.map((row) => (
        <KartuPembayaran key={row._id} row={row} />
      ))}
    </section>
  );
}

