import { useMutation } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

/** Form pencatatan setoran pada ledger simulasi internal. */
export function DepositForm() {
  const requestDeposit = useMutation(api.pendana.requestDeposit);
  const [jumlah, setJumlah] = useState("");
  const [referensi, setReferensi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

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
          setError("Isi referensi catatan minimal 4 karakter.");
          return;
        }
        setBusy(true);
        try {
          await requestDeposit({ jumlah: parsed, referensiTransfer: referensi });
          toast.success("Catatan setoran simulasi dibuat. Tidak ada transfer atau saldo eksternal yang diverifikasi.");
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
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={error !== null && parsed === null}
            aria-describedby={error && parsed === null ? "dep-error" : undefined}
            disabled={busy}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dep-ref">Referensi catatan (opsional)</Label>
        <Input
          id="dep-ref"
          value={referensi}
          onChange={(e) => setReferensi(e.target.value)}
          placeholder="Contoh: BCAX0012345678"
          autoComplete="off"
          required
          aria-required="true"
          aria-invalid={error !== null && referensi.trim().length < 4}
          aria-describedby={error && referensi.trim().length < 4 ? "dep-error" : undefined}
          disabled={busy}
        />
      </div>
      {error && (
        <p
          ref={errorRef}
          id="dep-error"
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
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

/** Dialog dekoratif QR / VA contoh — tidak terhubung ke pembayaran dan tidak dapat memproses dana. */
export function DepositSimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ilustrasi QR / Virtual Account</DialogTitle>
          <DialogDescription>
            Contoh visual saja: kode QR ini tidak dapat dipindai untuk pembayaran, dan nomor VA tidak aktif. Tidak ada gateway pembayaran atau konfirmasi transfer.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="qris">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-slate-100 p-1">
            <TabsTrigger value="qris" className="rounded-full text-xs">Ilustrasi QR</TabsTrigger>
            <TabsTrigger value="va" className="rounded-full text-xs">Contoh VA</TabsTrigger>
          </TabsList>
          <TabsContent value="qris" className="mt-4">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-5">
              <QrSim />
              <p className="text-xs text-muted-foreground">
                QR dekoratif — tidak dapat dipindai dan tidak memicu pembayaran.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="va" className="mt-4">
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-xs text-muted-foreground">Nomor VA contoh (tidak aktif)</p>
              <p className="mt-1 font-mono text-lg font-semibold tracking-wider">880801000000000</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  void navigator.clipboard.writeText("880801000000000");
                  toast.success("Nomor contoh disalin — bukan rekening pembayaran aktif.");
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
      aria-label="QR dekoratif; tidak dapat dipindai untuk pembayaran"
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
