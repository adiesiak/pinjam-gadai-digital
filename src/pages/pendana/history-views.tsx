import { useQuery } from "convex/react";
import { ArrowRight, Landmark } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";

import { EmptyState, Loading } from "./feedback";
import { DepositBadge, WithdrawalBadge } from "./wallet-views";

/** Tab 5 — Riwayat transaksi Pendana. */
export function HistorySection() {
  const fundings = useQuery(api.pendana.myFundings);
  const deposits = useQuery(api.pendana.myDeposits);
  const withdrawals = useQuery(api.pendana.myWithdrawals);

  if (fundings === undefined || deposits === undefined || withdrawals === undefined) {
    return <Loading />;
  }
  const kosong = fundings.length === 0 && deposits.length === 0 && withdrawals.length === 0;
  if (kosong) {
    return (
      <EmptyState
        icon={Landmark}
        title="Belum ada transaksi"
        body="Semua alokasi, setoran, dan penarikan Anda tercatat di sini."
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <section>
        <h3 className="text-sm font-semibold">Alokasi pendanaan</h3>
        {fundings.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {fundings.map((f) => (
              <li key={f._id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(f.jumlahAlokasi)}</p>
                  <FundingStatusBadge status={f.status} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {f.nomorReferensi}{" "}
                  <ArrowRight className="inline size-3 align-middle" aria-hidden />{" "}
                  {f.loanRef} · imbal hasil {formatRupiah(f.imbalHasil)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Setoran</h3>
        {deposits.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {deposits.map((d) => (
              <li key={d._id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                  <DepositBadge status={d.status} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {d.nomorReferensi} · ref {d.referensiTransfer}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Penarikan</h3>
        {withdrawals.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {withdrawals.map((w) => (
              <li key={w._id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(w.jumlah)}</p>
                  <WithdrawalBadge status={w.status} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {w.nomorReferensi} · {w.namaBank} {w.nomorRekening}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FundingStatusBadge({ status }: { status: string }) {
  if (status === "selesai") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Imbal Hasil Cair
      </Badge>
    );
  }
  if (status === "dibatalkan") {
    return <Badge variant="destructive">Dibatalkan</Badge>;
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
      Dalam Pendanaan Berjalan
    </Badge>
  );
}
