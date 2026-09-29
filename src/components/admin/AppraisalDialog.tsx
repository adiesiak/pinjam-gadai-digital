import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { LTV_HINTS, type CollateralCategory } from "@/lib/pawn";

import { type PawnRow } from "./admin-shared";

export function AppraisalDialog({
  pawn,
  onClose,
}: {
  pawn: PawnRow | null;
  onClose: () => void;
}) {
  const approvePawn = useMutation(api.loans.approvePawn);
  const [taksiran, setTaksiran] = useState("");
  const [hargaPasar, setHargaPasar] = useState("");
  const [kondisi, setKondisi] = useState("");
  const [rak, setRak] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pawn === null) return null;

  const parsed = (() => {
    try {
      return parseRupiah(taksiran);
    } catch {
      return null;
    }
  })();
  const parsedPasar = (() => {
    if (hargaPasar.trim() === "") return null;
    try {
      return parseRupiah(hargaPasar);
    } catch {
      return null;
    }
  })();
  const hint =
    LTV_HINTS[pawn.kategori as CollateralCategory] ??
    "hingga 60% dari nilai taksiran";

  const ltvPersen =
    parsedPasar !== null && parsedPasar > 0 && parsed !== null
      ? Math.round((parsed / parsedPasar) * 100)
      : null;
  const ltvMelebihi = ltvPersen !== null && ltvPersen > 70;

  const submit = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan nilai taksiran rupiah bulat yang valid.");
      return;
    }
    if (ltvMelebihi) {
      setError("LTV " + ltvPersen + "% melebihi batas maksimum 70% dari harga pasar.");
      return;
    }
    setBusy(true);
    try {
      await approvePawn({
        pawnId: pawn._id,
        nilaiTaksiran: parsed,
        ...(parsedPasar !== null ? { hargaPasar: parsedPasar } : {}),
        ...(kondisi.trim() ? { kondisiFisik: kondisi.trim() } : {}),
        ...(rak.trim() ? { kodeRakVault: rak.trim().toUpperCase() } : {}),
      });
      toast.success("Appraisal tersimpan & gadai disetujui.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan taksiran.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle>Penaksiran gadai</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {pawn.deskripsiBarang}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="harga-pasar">Harga pasar (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                <Input
                  id="harga-pasar"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={hargaPasar}
                  onChange={(e) => setHargaPasar(e.target.value)}
                  onBlur={() => {
                    if (parsedPasar !== null) setHargaPasar(formatRupiah(parsedPasar).replace("Rp ", ""));
                  }}
                  placeholder="12.000.000"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taksiran">Nilai taksiran (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                <Input
                  id="taksiran"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={taksiran}
                  onChange={(e) => setTaksiran(e.target.value)}
                  onBlur={() => {
                    if (parsed !== null) setTaksiran(formatRupiah(parsed).replace("Rp ", ""));
                  }}
                  placeholder="8.000.000"
                  disabled={busy}
                />
              </div>
            </div>
          </div>
          {ltvPersen !== null && (
            <p className={ltvMelebihi ? "text-xs font-medium text-destructive" : "text-xs font-medium text-emerald-600"}>
              LTV otomatis: {ltvPersen}% dari harga pasar (maksimum 70%).
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kondisi">Kondisi fisik</Label>
              <Input
                id="kondisi"
                value={kondisi}
                onChange={(e) => setKondisi(e.target.value)}
                placeholder="Mis. 95% mulus, dus + charger lengkap"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rak">Kode rak brankas</Label>
              <Input
                id="rak"
                value={rak}
                onChange={(e) => setRak(e.target.value)}
                placeholder="Mis. A-12"
                disabled={busy}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Acuan plafon kategori {pawn.kategori}: {hint}. Dana yang dicairkan
            kepada nasabah mengikuti kebijakan LTV yang berlaku.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:flex-row">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy || parsed === null}>
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Menyimpan…
              </>
            ) : (
              "Setujui gadai"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
