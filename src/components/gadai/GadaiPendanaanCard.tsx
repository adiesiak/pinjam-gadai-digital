import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "convex/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { GADAI_PRICING, quoteGadai } from "@/lib/gadai";
import { formatRupiah, parseRupiah } from "@/lib/money";

import type { GadaiPendanaanRow } from "./types";

/** Kartu penetapan hitungan gadai internal; tidak mencatat pencairan, pembayaran, atau penitipan. */
export function GadaiPendanaanCard({ pawn }: { pawn: GadaiPendanaanRow }) {
  const setPendanaan = useMutation(api.gadai.setPendanaanGadai);

  const [pokok, setPokok] = useState("");
  const [persen, setPersen] = useState(String(GADAI_PRICING.sewaModalMinPercent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPokok = (() => {
    if (pokok.trim() === "") return null;
    try {
      return parseRupiah(pokok);
    } catch {
      return null;
    }
  })();
  const persenNum = Number(persen.replace(",", "."));
  const persenValid =
    Number.isFinite(persenNum) &&
    persenNum >= GADAI_PRICING.sewaModalMinPercent &&
    persenNum <= GADAI_PRICING.sewaModalMaxPercent;
  const quote =
    parsedPokok !== null && persenValid ? quoteGadai(parsedPokok, persenNum) : null;
  const batasLtv =
    pawn.hargaPasar !== null && pawn.hargaPasar > 0
      ? Math.round((pawn.hargaPasar * GADAI_PRICING.ltvMaxPercent) / 100)
      : null;
  const pokokMelebihiLtv =
    parsedPokok !== null && batasLtv !== null && parsedPokok > batasLtv;

  const belumPendanaan = pawn.pokokGadai === undefined;

  const jalankan = async () => {
    setBusy(true);
    setError(null);
    try {
      if (parsedPokok === null || !persenValid) {
        throw new Error("Isi pokok acuan dan sewa modal 5–10% yang valid.");
      }
      if (pokokMelebihiLtv && batasLtv !== null) {
        throw new Error(
          `Pokok melebihi batas hitung aplikasi 70% (${formatRupiah(batasLtv)}) dari harga yang dicantumkan ${formatRupiah(pawn.hargaPasar ?? 0)}.`,
        );
      }
      await setPendanaan({
        pawnId: pawn._id,
        pokokGadai: parsedPokok,
        persenSewaModal: persenNum,
      });
      toast.success(
        "Hitungan internal gadai tersimpan pada ledger internal.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `Penyimpanan hitungan internal gagal: ${e.message}.`
          : "Penyimpanan hitungan internal gagal.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{pawn.deskripsiBarang}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {pawn.nomorReferensi} · {pawn.namaLengkap}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Taksiran internal{" "}
          <span className="tabular-nums">
            {pawn.nilaiTaksiran !== undefined
              ? formatRupiah(pawn.nilaiTaksiran)
              : "—"}
          </span>
          {batasLtv !== null ? (
            <>
              {" "}
              · batas hitung 70%{" "}
              <span className="tabular-nums">{formatRupiah(batasLtv)}</span>
            </>
          ) : null}
        </p>
      </div>

      {belumPendanaan ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`pokok-${pawn._id}`}>Pokok gadai (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id={`pokok-${pawn._id}`}
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={pokok}
                  onChange={(e) => setPokok(e.target.value)}
                  onBlur={() => {
                    if (parsedPokok !== null) {
                      setPokok(formatRupiah(parsedPokok).replace("Rp ", ""));
                    }
                  }}
                  placeholder={
                    batasLtv !== null
                      ? formatRupiah(batasLtv).replace("Rp ", "")
                      : "5.000.000"
                  }
                  disabled={busy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`persen-${pawn._id}`}>Sewa modal (% per 30 hari)</Label>
              <Input
                id={`persen-${pawn._id}`}
                inputMode="decimal"
                className="tabular-nums"
                value={persen}
                onChange={(e) => setPersen(e.target.value)}
                placeholder="5"
                disabled={busy}
              />
            </div>
          </div>

          {quote !== null && (
            <p className="text-xs leading-5 text-emerald-800">
              Nilai bersih{" "}
              <b className="tabular-nums">
                {formatRupiah(quote.danaBersihDitransfer)}
              </b>{" "}
              (99%), potongan muka{" "}
              <span className="tabular-nums">{formatRupiah(quote.potonganDiMuka)}</span>{" "}
              (1%), sewa modal periode pertama{" "}
              <span className="tabular-nums">{formatRupiah(quote.sewaModalPeriode)}</span>.
            </p>
          )}

          {pokokMelebihiLtv && batasLtv !== null && (
            <p className="text-xs font-medium text-destructive">
              Pokok melebihi batas hitung aplikasi 70% ({formatRupiah(batasLtv)}) dari harga yang dicantumkan{" "}
              {formatRupiah(pawn.hargaPasar ?? 0)}.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-xs leading-5 text-emerald-800">
          Pokok acuan internal{" "}
          <b className="tabular-nums">{formatRupiah(pawn.pokokGadai ?? 0)}</b> · sewa
          modal{" "}
          <b>{pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent}%</b>/30 hari. Data ini mengikuti pencatatan ledger internal.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {belumPendanaan && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            className="gradient-primary rounded-full border-0"
            disabled={busy || parsedPokok === null || !persenValid || pokokMelebihiLtv}
            onClick={() => void jalankan()}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Simpan hitungan internal
          </Button>
        </div>
      )}
    </div>
  );
}
