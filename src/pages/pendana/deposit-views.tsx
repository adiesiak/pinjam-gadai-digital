import { useMutation } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

/** Deret pseudo-acak deterministik (LCG) — murni, tanpa state global. */
function pseudoRandomGrid(rows: number, cols: number, seed: number): boolean[][] {
  let state = seed;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rand() > 0.5),
  );
}

/** Form pengajuan setoran (verifikasi admin). */
export function DepositForm() {
  const requestDeposit = useMutation(api.pendana.requestDeposit);
  const [jumlah, setJumlah] = useState("");
  const [referensi, setReferensi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Rupiah | null>(() => {
    try {
      return parseRupiah(jumlah);
    } catch {
      return null;
    }
  }, [jumlah]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (parsed === null) {
          setError("Masukkan jumlah rupiah bulat yang valid (min Rp 100.000).");
          return;
        }
        if (referensi.trim().length < 4) {
          setError("Nomor referensi transfer wajib diisi.");
          return;
        }
        setBusy(true);
        try {
          await requestDeposit({ jumlah: parsed, referensiTransfer: referensi });
          toast.success("Setoran diajukan — menunggu verifikasi tim.");
          setJumlah("");
          setReferensi("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal mengirim setoran.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="dep-jumlah">Jumlah setoran</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            Rp
          </span>
          <Input
            id="dep-jumlah"
            inputMode="numeric"
            className="pl-9 tabular-nums"
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
            onBlur={() => {
              if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
            }}
            placeholder="5.000.000"
            disabled={busy}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dep-ref">Nomor referensi transfer</Label>
        <Input
          id="dep-ref"
          value={referensi}
          onChange={(e) => setReferensi(e.target.value)}
          placeholder="Contoh: BCAX0012345678"
          disabled={busy}
        />
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        <Plus className="mr-1 size-4" />
        Ajukan setoran
      </Button>
    </form>
  );
}

/** Dialog simulasi QRIS / VA untuk deposit — murni visual, tanpa aset eksternal. */
export function DepositSimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simulasi Deposit — QRIS / Virtual Account</DialogTitle>
          <DialogDescription>
            Salurkan dana lewat salah satu saluran simulasi, lalu ajukan setoran
            dengan nomor referensi transfer Anda.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="qris">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-slate-100 p-1">
            <TabsTrigger value="qris" className="rounded-full text-xs">QRIS</TabsTrigger>
            <TabsTrigger value="va" className="rounded-full text-xs">Virtual Account</TabsTrigger>
          </TabsList>
          <TabsContent value="qris" className="mt-4">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-5">
              <QrSim />
              <p className="text-xs text-muted-foreground">
                Pindai QR simulasi — dana masuk dompet setelah tim memverifikasi transfer.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="va" className="mt-4">
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-xs text-muted-foreground">Nomor Virtual Account (simulasi)</p>
              <p className="mt-1 font-mono text-lg font-bold tracking-wider">880801000000000</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  void navigator.clipboard.writeText("880801000000000");
                  toast.success("Nomor VA disalin.");
                }}
              >
                Salin nomor
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** QR dekoratif deterministik (simulasi) — murni visual. */
function QrSim() {
  const cells = 21;
  const size = 9;
  const grid = pseudoRandomGrid(cells, cells, 987654321);
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = edge || core;
      }
  };
  finder(0, 0);
  finder(0, cells - 7);
  finder(cells - 7, 0);
  return (
    <svg
      width={200}
      height={200}
      viewBox={`0 0 ${cells * size} ${cells * size}`}
      className="rounded-xl bg-white p-1"
      role="img"
      aria-label="QRIS simulasi"
    >
      {grid.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect key={`${r}-${c}`} x={c * size} y={r * size} width={size} height={size} fill="#1c1a15" rx={1.5} />
          ) : null,
        ),
      )}
    </svg>
  );
}
