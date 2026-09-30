import { useQuery } from "convex/react";
import { Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";

import { Loading } from "./feedback";

/** Tab dompet pendana: transaksi dinonaktifkan, riwayat hanya-baca. */
export function WalletSection() {
  const wallet = useQuery(api.pendana.myWallet);
  const deposits = useQuery(api.pendana.myDeposits);
  const withdrawals = useQuery(api.pendana.myWithdrawals);

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Setoran belum tersedia</h3>
          <Badge className="border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
            <Wallet className="mr-1 size-3" /> Ledger {formatRupiah(wallet?.saldo ?? 0)}
          </Badge>
        </div>
        <Separator className="my-4" />
        <p className="text-xs leading-5 text-muted-foreground">
          Belum ada izin atau penyedia pembayaran yang dipilih/diintegrasikan. Persetujuan admin maupun referensi manual bukan bukti dana masuk; saldo ini hanya catatan ledger internal, bukan dana tersedia.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold">Penarikan belum tersedia</h3>
        <Separator className="my-4" />
        <p className="text-xs leading-5 text-muted-foreground">
          Transfer keluar dinonaktifkan sampai ada penyedia dan konfirmasi transfer yang dapat diverifikasi. Halaman ini tidak mengumpulkan rekening tujuan.
        </p>
        <Separator className="my-5" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Riwayat penarikan (catatan internal)
        </h4>
        {withdrawals === undefined ? (
          <Loading />
        ) : withdrawals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Belum ada catatan penarikan.</p>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 xl:col-span-2">
        <h3 className="text-sm font-semibold">Riwayat setoran (catatan internal)</h3>
        <Separator className="my-4" />
        {deposits === undefined ? (
          <Loading />
        ) : deposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada catatan setoran.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {deposits.map((d) => (
              <li key={d._id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {d.nomorReferensi} · referensi yang dicatat: {d.referensiTransfer}
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

export function WithdrawalBadge({ status }: { status: string }) {
  if (status === "diproses") {
    return (
      <Badge className="border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
        Ditandai diproses di ledger (bukan bukti transfer)
      </Badge>
    );
  }
  if (status === "ditolak") return <Badge variant="destructive">Ditolak pada catatan internal</Badge>;
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
      Menunggu tinjauan internal
    </Badge>
  );
}

export function DepositBadge({ status }: { status: string }) {
  if (status === "terverifikasi") {
    return (
      <Badge className="border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
        Ditandai admin (bukan verifikasi bank)
      </Badge>
    );
  }
  if (status === "ditolak") return <Badge variant="destructive">Ditolak pada catatan internal</Badge>;
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
      Menunggu tinjauan internal
    </Badge>
  );
}
