import { useMutation, useQuery } from "convex/react";
import { Loader2, QrCode, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

import { DepositForm } from "./deposit-views";
import { Loading } from "./feedback";

/** Tab 4 — Dompet & penarikan. */
export function WalletSection({ onDepositRequested }: { onDepositRequested: () => void }) {
  const wallet = useQuery(api.pendana.myWallet);
  const deposits = useQuery(api.pendana.myDeposits);
  const withdrawals = useQuery(api.pendana.myWithdrawals);
  const requestWithdrawal = useMutation(api.pendana.requestWithdrawal);

  const [jumlah, setJumlah] = useState("");
  const [namaBank, setNamaBank] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
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

  const ajukanPenarikan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (parsed === null) {
      setError("Masukkan jumlah rupiah bulat yang valid (min Rp 100.000).");
      return;
    }
    if (namaBank.trim().length < 2) {
      setError("Nama bank wajib diisi (mis. BCA, Mandiri).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    setBusy(true);
    try {
      await requestWithdrawal({
        jumlah: parsed,
        namaBank,
        nomorRekening,
      });
      toast.success("Permintaan penarikan simulasi tercatat di ledger. Tidak ada transfer ke rekening.");
      setJumlah("");
      setNamaBank("");
      setNomorRekening("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim permintaan penarikan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      {/* ===== Setor / tambah saldo ===== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Catat setoran simulasi</h3>
          <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <Wallet className="mr-1 size-3" /> Ledger {formatRupiah(wallet?.saldo ?? 0)}
          </Badge>
        </div>
        <Separator className="my-4" />
        <p className="text-xs leading-5 text-muted-foreground">
          Form ini hanya menambahkan catatan setoran pada simulasi. Tidak ada rekening pembayaran, QRIS/VA aktif, transfer, pengecekan referensi bank, atau dana yang masuk. Saldo yang ditampilkan adalah angka ledger internal.
        </p>
        <div className="mt-4">
          <DepositForm />
        </div>
        <Separator className="my-5" />
        <Button variant="outline" className="w-full" onClick={onDepositRequested}>
          <QrCode className="mr-1.5 size-4" /> Lihat ilustrasi QR / VA nonaktif
        </Button>
      </section>

      {/* ===== Penarikan ===== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold">Catat permintaan penarikan simulasi</h3>
        <Separator className="my-4" />
        <form onSubmit={ajukanPenarikan} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wd-jumlah">Jumlah penarikan</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                Rp
              </span>
              <Input
                id="wd-jumlah"
                inputMode="numeric"
                className="pl-9 tabular-nums"
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
                onBlur={() => {
                  if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
                }}
                placeholder="2.500.000"
                required
                aria-required="true"
                aria-invalid={error !== null && parsed === null}
                aria-describedby={error && parsed === null ? "wd-error" : undefined}
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wd-bank">Nama bank</Label>
              <Input
                id="wd-bank"
                value={namaBank}
                onChange={(e) => setNamaBank(e.target.value)}
                placeholder="BCA"
                autoComplete="organization"
                required
                aria-required="true"
                aria-invalid={error !== null && namaBank.trim().length < 2}
                aria-describedby={error && namaBank.trim().length < 2 ? "wd-error" : undefined}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wd-rek">Nomor rekening</Label>
              <Input
                id="wd-rek"
                inputMode="numeric"
                value={nomorRekening}
                onChange={(e) => setNomorRekening(e.target.value)}
                placeholder="1234567890"
                className="tabular-nums"
                autoComplete="off"
                required
                aria-required="true"
                aria-invalid={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))}
                aria-describedby={error && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, "")) ? "wd-error" : undefined}
                disabled={busy}
              />
            </div>
          </div>
          {error && (
            <p
              ref={errorRef}
              id="wd-error"
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
            Ajukan Penarikan
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Nama bank dan nomor rekening hanya disimpan sebagai informasi tujuan. Status proses tidak mengirim dana dan perubahan saldo ledger bukan bukti transfer.
          </p>
        </form>

        {/* Riwayat penarikan */}
        <Separator className="my-5" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Riwayat penarikan simulasi
        </h4>
        {withdrawals === undefined ? (
          <Loading />
        ) : withdrawals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Belum ada penarikan.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {withdrawals.map((w) => (
              <li key={w._id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(w.jumlah)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {w.nomorReferensi} · {w.namaBank} {w.nomorRekening}
                    {w.catatanAdmin ? ` · ${w.catatanAdmin}` : ""}
                  </p>
                </div>
                <WithdrawalBadge status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Proteksi transaksi — OTP WhatsApp */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 xl:col-span-2">
        <WaOtpProtectionCard />
      </section>

      {/*          Riwayat setoran simulasi */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 xl:col-span-2">
        <h3 className="text-sm font-semibold">Riwayat setoran</h3>
        <Separator className="my-4" />
        {deposits === undefined ? (
          <Loading />
        ) : deposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada setoran.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {deposits.map((d) => (
              <li key={d._id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {d.nomorReferensi} · ref: {d.referensiTransfer}
                  </p>
                </div>
                <DepositBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Kartu proteksi transaksi — aktif/nonaktifkan OTP WhatsApp wajib. */
export function WaOtpProtectionCard() {
  const status = useQuery(api.security.myWaOtpStatus, {});
  const setWajib = useMutation(api.security.setWaOtpRequired);
  const [busy, setBusy] = useState(false);

  const toggle = async (wajib: boolean) => {
    setBusy(true);
    try {
      await setWajib({ wajib });
      toast.success(
        wajib
          ? "Proteksi OTP WhatsApp aktif — setiap alokasi/penarikan wajib verifikasi."
          : "Proteksi OTP WhatsApp dinonaktifkan.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah proteksi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Proteksi transaksi — OTP WhatsApp</h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            Aktifkan agar setiap alokasi dana dan penarikan meminta kode 6 digit
            yang dikirim ke WhatsApp Anda (berlaku 5 menit, sekali pakai).
            Percobaan verifikasi terbatas 5x per 15 menit.
          </p>
        </div>
      </div>
      {status?.aktif ? (
        <Button variant="outline" disabled={busy} onClick={() => void toggle(false)}>
          Nonaktifkan
        </Button>
      ) : (
        <Button disabled={busy} onClick={() => void toggle(true)}>
          Aktifkan proteksi
        </Button>
      )}
    </div>
  );
}

export function WithdrawalBadge({ status }: { status: string }) {
  if (status === "diproses") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Status diproses (ledger saja)
      </Badge>
    );
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">Dibatalkan / Ditolak</Badge>;
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">        Menunggu status internal
    </Badge>
  );
}

export function DepositBadge({ status }: { status: string }) {
  if (status === "terverifikasi") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Ditandai admin (bukan verifikasi bank)
      </Badge>
    );
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">Ditolak</Badge>;
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">        Menunggu tinjauan internal
    </Badge>
  );
}
