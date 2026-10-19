import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Check,
  ExternalLink,
  FileSearch,
  RefreshCw,
  X,
} from "lucide-react";
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
  ReturnType<typeof useQuery<typeof api.angsuran.daftarBuktiAngsuran>>
>;
type Baris = Data["rows"][number];

function KartuBukti({ row }: { row: Baris }) {
  const verifikasi = useMutation(api.angsuran.verifikasiBuktiAngsuran);
  const awal =
    row.angsuranId ?? row.saran?.angsuranId ?? row.kandidat[0]?.angsuranId ?? null;
  const [angsuranId, setAngsuranId] = useState<string>(awal ?? "");
  const terpilih = row.kandidat.find((k) => k.angsuranId === angsuranId) ?? null;
  const [referensi, setReferensi] = useState("");
  const [jumlah, setJumlah] = useState(String(terpilih?.seharusnya ?? row.jumlah));
  const [catatan, setCatatan] = useState("");
  const [modeTolak, setModeTolak] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const pilih = (id: string) => {
    setAngsuranId(id);
    const k = row.kandidat.find((x) => x.angsuranId === id);
    if (k !== undefined) setJumlah(String(k.seharusnya));
  };

  const kirim = async (keputusan: "terima" | "tolak") => {
    setGalat(null);
    if (angsuranId === "") {
      setGalat("Pilih angsuran yang dicocokkan.");
      return;
    }
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
    }
    setBusy(true);
    try {
      await verifikasi({
        receiptId: row._id as Id<"manualPaymentReceipts">,
        angsuranId: angsuranId as Id<"angsuran">,
        keputusan,
        ...(keputusan === "terima"
          ? { referensiMutasi: referensi.trim(), jumlahMutasi: Number(jumlah) }
          : {}),
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      toast.success(
        keputusan === "terima"
          ? "Bukti dicocokkan. Angsuran ditandai lunas."
          : "Bukti ditolak. Angsuran kembali menunggu pembayaran.",
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Bukti gagal diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {row.nomorReferensi} · bukti transfer
          </p>
          <h3 className="mt-1 text-sm font-semibold">{row.namaPeminjam}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pinjaman {row.nomorPinjaman} ·{" "}
            {row.tenorBulan === null ? `${row.tenorHari} hari` : `${row.tenorBulan} bulan`} ·
            transfer {formatTanggalWIB(row.tanggalTransfer)}
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
        {row.saran !== null && (
          <span
            className={
              row.saran.selisih === 0
                ? "text-emerald-700"
                : "text-amber-800"
            }
          >
            Saran: angsuran {row.saran.nomor} · {formatRupiah(row.saran.seharusnya)}
            {row.saran.selisih === 0
              ? " · nominal cocok"
              : ` · selisih ${formatRupiah(row.saran.selisih)}`}
          </span>
        )}
      </div>

      {row.kandidat.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Tidak ada angsuran terbuka pada pinjaman ini. Bukti tidak dapat
          dicocokkan sampai jadwal angsuran tersedia.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`angsuran-${row._id}`}>Angsuran</Label>
            <select
              id={`angsuran-${row._id}`}
              value={angsuranId}
              onChange={(e) => pilih(e.target.value)}
              disabled={busy}
              className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm disabled:opacity-50"
            >
              {row.kandidat.map((k) => (
                <option key={k.angsuranId} value={k.angsuranId}>
                  Angsuran {k.nomor} · {formatRupiah(k.seharusnya)} · jatuh tempo{" "}
                  {formatTanggalWIB(k.jatuhTempoPada)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mutasi-${row._id}`}>Referensi mutasi bank</Label>
            <Input
              id={`mutasi-${row._id}`}
              value={referensi}
              onChange={(e) => setReferensi(e.target.value)}
              placeholder="Nomor transaksi pada mutasi rekening"
              maxLength={120}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`jumlah-${row._id}`}>Nominal mutasi diterima</Label>
            <Input
              id={`jumlah-${row._id}`}
              type="number"
              min="1"
              step="1"
              value={jumlah}
              onChange={(e) => setJumlah(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`catatan-${row._id}`}>Catatan (opsional)</Label>
            <Input
              id={`catatan-${row._id}`}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder={modeTolak ? "Alasan penolakan" : "Catatan pencocokan"}
              maxLength={500}
              disabled={busy}
            />
          </div>
        </div>
      )}

      {galat !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {galat}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || row.kandidat.length === 0}
          onClick={() => void kirim("terima")}
          className="gap-1.5"
        >
          <Check className="size-4" aria-hidden /> Verifikasi & tandai lunas
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || row.kandidat.length === 0}
          onClick={() => {
            setModeTolak(true);
            void kirim("tolak");
          }}
          className="gap-1.5 text-destructive"
        >
          <X className="size-4" aria-hidden /> Tolak bukti
        </Button>
        <span className="text-[11px] leading-5 text-muted-foreground">
          Verifikasi mewajibkan referensi mutasi dan nominal yang cocok — bukan
          sekadar persetujuan.
        </span>
      </div>
    </article>
  );
}

/**
 * Rekonsiliasi bukti transfer angsuran.
 *
 * Antrean hanya berisi bukti yang belum diproses. Saran pencocokan dihitung
 * server dari nominal + tanggal; admin tetap mengisi referensi mutasi bank
 * sebagai bukti perpindahan dana. Tombol backfill membuat jadwal untuk pinjaman
 * lama yang cair sebelum fitur ini ada.
 */
export function RekonsiliasiAngsuran() {
  const data = useQuery(api.angsuran.daftarBuktiAngsuran, {});
  const backfill = useMutation(api.angsuran.pastikanSemuaAngsuran);
  const [busy, setBusy] = useState(false);

  if (data === undefined) {
    return <SkeletonBarisDaftar baris={3} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm font-semibold">Antrean bukti transfer angsuran</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Cocokkan bukti ke angsuran, isi referensi mutasi bank, lalu tandai
            lunas. Sistem menulis jurnal pokok/bunga/biaya/denda dan menaikkan
            plafon hanya bila seluruh angsuran lunas tepat waktu.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const hasil = await backfill({});
              toast.success(
                hasil.dibuat === 0
                  ? "Semua pinjaman berjalan sudah punya jadwal."
                  : `${hasil.dibuat} pinjaman mendapat jadwal angsuran.`,
              );
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Backfill gagal.");
            } finally {
              setBusy(false);
            }
          }}
          className="gap-1.5"
        >
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden />
          Siapkan jadwal pinjaman lama
        </Button>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
            <CalendarClock className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-semibold">Tidak ada bukti menunggu</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            Bukti transfer yang dikirim peminjam muncul di sini. Setelah
            dicocokkan, angsuran berubah lunas dan hilang dari antrean.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.rows.map((row) => (
            <KartuBukti key={row._id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
