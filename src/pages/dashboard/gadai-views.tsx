import { useMemo } from "react";

import { ManualPaymentEvidenceForm } from "@/components/ManualPaymentEvidenceForm";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { Id } from "@/convex/_generated/dataModel";
import { proyeksiJadwalGadai, sewaModalBerikutnya } from "@/lib/gadai";
import { formatRupiah } from "@/lib/money";

/** Tab gadai: hanya proyeksi dan catatan ledger; pembayaran tetap ditutup. */
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
  const berjalan = pawns.filter((p) => {
    const pokok = p.pokokGadai ?? 0;
    return pokok > 0 && (p.sisaPokok ?? pokok) > 0 && p.status === "aktif";
  });
  const pokokNol = pawns.filter(
    (p) => (p.pokokGadai ?? 0) > 0 && (p.sisaPokok ?? 0) <= 0,
  );

  if (berjalan.length === 0 && pokokNol.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold">Proyeksi gadai dan catatan internal</h2>
      <Separator className="my-4" />
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Pembayaran belum tersedia di aplikasi; statusnya diperbarui oleh tim PINDAI. Saldo pokok dan status mengikuti pencatatan ledger internal.
      </p>
      <div className="space-y-4">
        {berjalan.map((pawn) => (
          <GadaiProjectionCard
            key={pawn._id}
            pawn={{
              _id: pawn._id,
              nomorReferensi: pawn.nomorReferensi,
              deskripsiBarang: pawn.deskripsiBarang,
              pokok: pawn.pokokGadai ?? 0,
              sisa: pawn.sisaPokok ?? pawn.pokokGadai ?? 0,
              persen: pawn.persenSewaModal ?? 5,
            }}
          />
        ))}
        {pokokNol.map((pawn) => (
          <div key={pawn._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{pawn.deskripsiBarang}</p>
                <p className="text-xs text-muted-foreground">{pawn.nomorReferensi}</p>
              </div>
              <Badge className="border-0 bg-slate-200 text-slate-700 hover:bg-slate-200">
                Pokok ledger Rp0 — belum ada pelunasan tercatat
              </Badge>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Angka ini hanya status internal; tidak mengonfirmasi pembayaran aktual atau pengembalian barang.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function GadaiProjectionCard({
  pawn,
}: {
  pawn: {
    _id: Id<"pawns">;
    nomorReferensi: string;
    deskripsiBarang: string;
    pokok: number;
    sisa: number;
    persen: number;
  };
}) {
  const sewa = sewaModalBerikutnya(pawn.sisa, pawn.persen);
  const rencanaPokokPerPeriode = Math.max(1, Math.ceil(pawn.sisa / 6));
  const proyeksi = useMemo(
    () => proyeksiJadwalGadai(pawn.sisa, pawn.persen, rencanaPokokPerPeriode, 6),
    [pawn.sisa, pawn.persen, rencanaPokokPerPeriode],
  );
  const tercatat = Math.max(0, pawn.pokok - pawn.sisa);
  const persenTercatat = Math.min(100, Math.round((tercatat / Math.max(1, pawn.pokok)) * 100));

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{pawn.deskripsiBarang}</p>
          <p className="text-xs text-muted-foreground">{pawn.nomorReferensi}</p>
        </div>
        <Badge className="border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
          Status internal: aktif
        </Badge>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Sisa pokok pada ledger</dt>
          <dd className="font-semibold tabular-nums">{formatRupiah(pawn.sisa)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Sewa periode berikutnya</dt>
          <dd className="tabular-nums">{formatRupiah(sewa)} · {pawn.persen}%</dd>
        </div>
      </dl>
      <div className="mt-4">
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>Pokok yang tercatat di ledger</span>
          <span className="tabular-nums">{formatRupiah(tercatat)} / {formatRupiah(pawn.pokok)}</span>
        </div>
        <Progress value={persenTercatat} className="mt-2" />
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <p className="text-xs font-semibold">Ilustrasi sewa menurun (bukan tagihan)</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {proyeksi.map((row) => (
            <span key={row.periode} className="rounded-full bg-white px-2.5 py-1 text-[11px] tabular-nums">
              P{row.periode}: {formatRupiah(row.sewaModal)}
            </span>
          ))}
        </div>
      </div>
      <ManualPaymentEvidenceForm
        jenis="gadai"
        targetId={pawn._id}
        reference={pawn.nomorReferensi}
        suggestedAmount={sewa + rencanaPokokPerPeriode}
      />
    </article>
  );
}
