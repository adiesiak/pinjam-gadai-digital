import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Coins, Loader2, Package, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { WaOtpDialog } from "@/components/WaOtpDialog";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

import { EmptyState, Loading } from "./feedback";

/** Tab 1 — Marketplace pinjaman & gadai. */
export function MarketplaceSection() {
  const marketplace = useQuery(api.pendana.marketplace);

  return (
    <div>
      {marketplace === undefined ? (
        <Loading />
      ) : marketplace.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Belum ada peluang pendanaan"
          body="Pinjaman yang telah disetujui tim akan tampil di sini beserta sisa kebutuhan pendanaannya. Semua peminjam sudah lolos verifikasi KYC."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {marketplace.map((m) => (
            <MarketCard key={m._id} row={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketCard({
  row,
}: {
  row: {
    _id: Id<"loans">;
    nomorReferensi: string;
    tujuan: string;
    pokokPinjaman: number;
    tenorHari: number;
    terkumpul: number;
    sisaKebutuhan: number;
    danaBersih: number;
    bunga: number;
    gadai: {
      deskripsiBarang: string;
      kategori: string;
      nilaiTaksiran: number;
      ltvPersen: number;
      kodeRakVault: string | null;
    } | null;
  };
}) {
  const allocateFunding = useMutation(api.pendana.allocateFunding);
  const waOtpStatus = useQuery(api.security.myWaOtpStatus, {});
  const [open, setOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [waNomorPendana, setWaNomorPendana] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Rupiah | null>(() => {
    try {
      return parseRupiah(jumlah);
    } catch {
      return null;
    }
  }, [jumlah]);

  const full = row.sisaKebutuhan <= 0;
  const pct = Math.min(100, Math.round((row.terkumpul / row.pokokPinjaman) * 100));

  const alokasikan = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan jumlah rupiah bulat yang valid.");
      return;
    }
    // OTP WA wajib — buka dialog verifikasi dulu; transaksi lanjut di callback.
    if (waOtpStatus?.aktif) {
      if (waNomorPendana.replace(/\D/g, "").length < 8) {
        setError("Masukkan nomor WhatsApp Anda (format 62…) untuk menerima kode OTP.");
        return;
      }
      setOtpOpen(true);
      return;
    }
    await eksekusiAlokasi();
  };

  const eksekusiAlokasi = async () => {
    setBusy(true);
    try {
      await allocateFunding({ loanId: row._id, jumlah: parsed! });
      toast.success("Alokasi berhasil dicatat di jurnal.");
      setOpen(false);
      setOtpOpen(false);
      setJumlah("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alokasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">
            Pinjaman Tunai
          </Badge>
          {row.gadai && (
            <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
              Gadai Digital — {row.gadai.kategori}
            </Badge>
          )}
        </div>
        <p className="mt-2 text-lg font-semibold tabular-nums">{formatRupiah(row.pokokPinjaman)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.nomorReferensi} · {loanPurposeLabel(row.tujuan)}
        </p>
      </div>

      {/* Info jaminan gadai bila ada */}
      {row.gadai && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
          <Package className="mt-0.5 size-4 shrink-0 text-emerald-600" strokeWidth={2} />
          <div className="min-w-0 text-xs">
            <p className="truncate font-medium text-emerald-900">{row.gadai.deskripsiBarang}</p>
            <p className="mt-0.5 tabular-nums text-emerald-700">
              Taksiran {formatRupiah(row.gadai.nilaiTaksiran)} · LTV {row.gadai.ltvPersen}%
              {row.gadai.kodeRakVault ? ` · rak ${row.gadai.kodeRakVault}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Rincian transparansi */}
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs">
        <div>
          <dt className="text-muted-foreground">Tenor</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{row.tenorHari} hari</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Verifikasi</dt>
          <dd className="mt-0.5 font-semibold text-emerald-600">Terverifikasi KYC</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hak bunga (30%)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatRupiah(row.bunga)}
          </dd>
        </div>
      </dl>

      {/* Progress pendanaan */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">Dana terkumpul</span>
          <span className="tabular-nums text-muted-foreground">
            {formatRupiah(row.terkumpul)} / {formatRupiah(row.pokokPinjaman)}
          </span>
        </div>
        <Progress className="mt-1.5 h-2.5" value={pct} />
        <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
          Sisa kebutuhan {formatRupiah(row.sisaKebutuhan)} · dana bersih Peminjam{" "}
          {formatRupiah(row.danaBersih)} (95%)
        </p>
      </div>

      {full ? (
        <Badge className="mt-4 border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <BadgeCheck className="mr-1 size-3.5" /> Terpenuhi penuh oleh Pendana
        </Badge>
      ) : (
        <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
          <Coins className="mr-1.5 size-4" />
          Alokasikan Dana Sekarang
        </Button>
      )}

      {/* Dialog alokasi — dilindungi anti-overfunding server-side */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alokasikan Dana</DialogTitle>
            <DialogDescription>
              {row.nomorReferensi} · sisa kebutuhan {formatRupiah(row.sisaKebutuhan)}. Alokasi
              melebihi sisa akan ditolak server (anti-overfunding).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="alo-jumlah">Jumlah alokasi</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="alo-jumlah"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  onBlur={() => {
                    if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
                  }}
                  placeholder={`Maks ${formatRupiah(row.sisaKebutuhan)}`}
                  disabled={busy}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Estimasi imbal hasil Anda:{" "}
                <span className="font-semibold tabular-nums text-emerald-700">
                  {formatRupiah(
                    parsed !== null && parsed > 0
                      ? Math.floor((row.bunga * Math.min(parsed, row.sisaKebutuhan)) / row.pokokPinjaman)
                      : 0,
                  )}
                </span>{" "}
                (30% proporsional)
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
            {waOtpStatus?.aktif && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <Label htmlFor="alo-wa">Nomor WhatsApp verifikasi (62…)</Label>
                <Input
                  id="alo-wa"
                  inputMode="tel"
                  value={waNomorPendana}
                  onChange={(e) => setWaNomorPendana(e.target.value)}
                  placeholder="628123456789"
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  Proteksi transaksi aktif — kode OTP dikirim ke nomor ini sebelum
                  alokasi diproses (5 menit, sekali pakai).
                </p>
              </div>
            )}
            <Button className="w-full" disabled={busy || parsed === null} onClick={alokasikan}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Konfirmasi Alokasi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {waNomorPendana && (
        <WaOtpDialog
          open={otpOpen}
          onOpenChange={setOtpOpen}
          tujuan={waNomorPendana.replace(/\D/g, "")}
          alasan={`Alokasi Dana ${row.nomorReferensi}`}
          onVerified={() => void eksekusiAlokasi()}
        />
      )}
    </article>
  );
}
