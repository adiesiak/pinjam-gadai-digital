import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { proyeksiJadwalGadai, sewaModalBerikutnya } from "@/lib/gadai";
import { formatRupiah, type Rupiah } from "@/lib/money";

/** Parse input cicilan menjadi rupiah bulat positif (tanpa null/float). */
function parseCicilan(raw: string): Rupiah | null {
  const cleaned = raw.replace(/[rp\s.]/gi, "").replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const v = Math.round(Number(cleaned));
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** Tab 3a — simulasi sewa modal dan entri pokok gadai pada ledger. */
export function GadaiBillingSection({
  pawns,
}: {
  pawns: Array<{
    _id: Id<"pawns">;
    nomorReferensi: string;
    deskripsiBarang: string;
    status: string;
    pokokGadai?: number;
    sisaPokok?: number;
    persenSewaModal?: number;
  }>;
}) {
  const bayarGadai = useMutation(api.gadai.bayarGadai);
  const [busyId, setBusyId] = useState<Id<"pawns"> | null>(null);

  // Hanya gadai dengan pokok sah (ditetapkan admin) yang menampilkan tagihan.
  const berjalan = pawns.filter((p) => {
    const pokok = p.pokokGadai ?? 0;
    const sisa = p.sisaPokok ?? pokok;
    return pokok > 0 && sisa > 0 && p.status === "aktif";
  });
  const siapDiambil = pawns.filter(
    (p) =>
      (p.pokokGadai ?? 0) > 0 && (p.sisaPokok ?? 0) <= 0 && p.status === "menunggu_pelepasan",
  );

  const handleBayar = async (
    pawnId: Id<"pawns">,
    cicilPokok: number,
    bayarHanyaSewa: boolean,
  ): Promise<boolean> => {
    setBusyId(pawnId);
    try {
      const r = await bayarGadai({ pawnId, cicilPokok, bayarHanyaSewa });
      if (r === null) return false;
      if (r.custody === "SIAP_DIAMBIL") {
        toast.success("Pokok simulasi tercatat Rp0 pada ledger. Tidak ada pembayaran atau pengembalian barang yang dikonfirmasi.");
      } else {
        toast.success(
          `Pencatatan simulasi ${formatRupiah(r.totalBayar)} — sisa pokok ledger ${formatRupiah(r.sisaPokokSetelah)}, sewa simulasi berikutnya ${formatRupiah(r.sewaModalBerikut)}. Tidak ada pembayaran eksternal.`,
        );
      }
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Pencatatan simulasi gadai gagal: ${e.message}. Tidak ada pembayaran eksternal atau pengembalian barang yang diproses.`
          : "Pencatatan simulasi gadai gagal. Tidak ada pembayaran eksternal atau pengembalian barang yang diproses.",
      );
      return false;
    } finally {
      setBusyId(null);
    }
  };

  if (berjalan.length === 0 && siapDiambil.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold">Catatan simulasi gadai</h2>
      <Separator className="my-4" />
      <div className="space-y-4">
        {siapDiambil.map((p) => (
          <div
            key={p._id}
            className="card-lift rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.deskripsiBarang}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.nomorReferensi}</p>
              </div>
              <Badge className="border-0 bg-emerald-500 text-white hover:bg-emerald-500">
                Sisa pokok simulasi Rp0
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-emerald-800">
              Sisa pokok simulasi <b>Rp0</b> pada ledger. Status ini bukan bukti pelunasan aktual, penitipan, atau pengembalian barang.
            </p>
          </div>
        ))}
        {berjalan.map((p) => (
          <GadaiBillingCard
            key={p._id}
            pawn={{
              _id: p._id,
              nomorReferensi: p.nomorReferensi,
              deskripsiBarang: p.deskripsiBarang,
              pokokGadai: p.pokokGadai ?? 0,
              sisaPokok: p.sisaPokok ?? p.pokokGadai ?? 0,
              persenSewaModal: p.persenSewaModal ?? 5,
            }}
            busy={busyId === p._id}
            onBayar={handleBayar}
          />
        ))}
      </div>
    </section>
  );
}

function GadaiBillingCard({
  pawn,
  busy,
  onBayar,
}: {
  pawn: {
    _id: Id<"pawns">;
    nomorReferensi: string;
    deskripsiBarang: string;
    pokokGadai: number;
    sisaPokok: number;
    persenSewaModal: number;
  };
  busy: boolean;
  onBayar: (
    pawnId: Id<"pawns">,
    cicilPokok: number,
    bayarHanyaSewa: boolean,
  ) => Promise<boolean>;
}) {
  const [cicil, setCicil] = useState("");
  const sisa = pawn.sisaPokok;
  const persen = pawn.persenSewaModal;
  const sewaSekarang = sewaModalBerikutnya(sisa, persen);

  const cicilSim = useMemo(() => {
    const v = parseCicilan(cicil);
    if (v === null || v > sisa) return null;
    return v;
  }, [cicil, sisa]);
  const sewaSetelah = cicilSim !== null ? sewaModalBerikutnya(sisa - cicilSim, persen) : null;
  const proyeksi = useMemo(
    () => (cicilSim !== null ? proyeksiJadwalGadai(sisa, persen, cicilSim, 6) : []),
    [cicilSim, sisa, persen],
  );

  const tercicil = pawn.pokokGadai - sisa;
  const persenTercicil = Math.min(
    100,
    Math.round((tercicil / Math.max(1, pawn.pokokGadai)) * 100),
  );

  return (
    <div className="card-lift rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{pawn.deskripsiBarang}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{pawn.nomorReferensi}</p>
        </div>
        <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          Status internal: aktif
        </Badge>
      </div>

      <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <dt className="text-muted-foreground">Sisa pokok simulasi</dt>
          <dd className="font-semibold tabular-nums">{formatRupiah(sisa)}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <dt className="text-muted-foreground">Sewa modal berikutnya (simulasi)</dt>
          <dd className="tabular-nums">
            {formatRupiah(sewaSekarang)}{" "}
            <span className="text-xs text-muted-foreground">({persen}% × sisa pokok / 30 hari)</span>
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span>Pokok tercatat di ledger</span>
          <span className="tabular-nums">
            {formatRupiah(tercicil)} / {formatRupiah(pawn.pokokGadai)}
          </span>
        </div>
        <Progress value={persenTercicil} className="mt-1.5" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`cicil-${pawn._id}`}>Pokok simulasi untuk dicatat (opsional)</Label>
          <Input
            id={`cicil-${pawn._id}`}
            inputMode="numeric"
            placeholder="Mis. 1000000"
            value={cicil}
            onChange={(e) => setCicil(e.target.value)}
            className="tabular-nums"
            disabled={busy}
          />
          {cicilSim !== null && sewaSetelah !== null && (
            <p className="mt-1.5 text-xs text-emerald-700">
              Setelah cicil {formatRupiah(cicilSim)}: sewa berikutnya turun ke{" "}
              <b className="tabular-nums">{formatRupiah(sewaSetelah)}</b>.
            </p>
          )}
          {cicilSim === null && cicil.trim() !== "" && (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              Masukkan rupiah bulat, maksimal sisa pokok {formatRupiah(sisa)}.
            </p>
          )}
        </div>
        <div className="flex flex-col justify-end gap-2">
          <Button
            aria-label={`Catat simulasi cicilan pokok dan sewa, bukan pembayaran aktual${cicilSim !== null ? `, ${formatRupiah(cicilSim + sewaSekarang)}` : ""}`}
            disabled={busy || cicilSim === null}
            onClick={() => {
              if (cicilSim === null) return;
              void onBayar(pawn._id, cicilSim, false).then((ok) => {
                if (ok) setCicil("");
              });
            }}
          >
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Catat cicilan + sewa simulasi{" "}
            <span className="tabular-nums">({formatRupiah((cicilSim ?? 0) + sewaSekarang)})</span>
          </Button>
          <Button
            variant="outline"
            aria-label={`Catat simulasi sewa saja, bukan pembayaran aktual, ${formatRupiah(sewaSekarang)}`}
            disabled={busy}
            onClick={() => void onBayar(pawn._id, 0, true)}
          >
            Catat simulasi sewa saja ({formatRupiah(sewaSekarang)})
          </Button>
        </div>
      </div>

      {proyeksi.length > 1 && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold">
            Ilustrasi sewa menurun bila pokok simulasi dicatat {formatRupiah(cicilSim ?? 0)}/periode:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {proyeksi.map((row) => (
              <span
                key={row.periode}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium tabular-nums"
              >
                P{row.periode}: sewa {formatRupiah(row.sewaModal)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
