import { useQuery } from "convex/react";
import { Store, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";

import { DepositSimDialog } from "./deposit-views";
import { FundingContractsSection } from "./funding-contracts-views";
import { HistorySection } from "./history-views";
import { MarketplaceSection } from "./market-views";
import { PendanaTabNav } from "./pendana-tab-nav";
import { PortfolioSection } from "./portfolio-views";
import { WalletSection } from "./wallet-views";

/** Workspace utama Pendana: ringkasan saldo + lima tab. */
export function PendanaWorkspace() {
  const wallet = useQuery(api.pendana.myWallet);
  const portfolio = useQuery(api.pendana.myPortfolio);
  const [depositOpen, setDepositOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState("marketplace");

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
          Ruang Pendana
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Dompet &amp; Alokasi Pendanaan</h1>
      </div>

      {/* ===== Ringkasan keuangan ===== */}
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Saldo Dompet</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-primary">
                {formatRupiah(wallet?.saldo ?? 0)}
              </p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Wallet className="size-5" strokeWidth={2} />
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Dana Dialokasikan</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {formatRupiah(wallet?.danaBekerja ?? 0)}
              </p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Store className="size-5" strokeWidth={2} />
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Estimasi Imbal Hasil Bunga</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600">
                {formatRupiah(wallet?.imbalHasilDiharapkan ?? 0)}
              </p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="size-5" strokeWidth={2} />
            </span>
          </div>
        </div>
      </section>

      {/* ===== Tab navigasi ===== */}
      <Tabs defaultValue="marketplace" value={defaultTab} onValueChange={setDefaultTab} className="mt-8">
        <PendanaTabNav />

        <TabsContent value="marketplace" className="mt-8">
          <MarketplaceSection />
        </TabsContent>

        <TabsContent value="portofolio" className="mt-8">
          <PortfolioSection portfolio={portfolio} />
        </TabsContent>

        <TabsContent value="kontrak" className="mt-8">
          <FundingContractsSection />
        </TabsContent>

        <TabsContent value="dompet" className="mt-8">
          <WalletSection onDepositRequested={() => setDepositOpen(true)} />
        </TabsContent>

        <TabsContent value="riwayat" className="mt-8">
          <HistorySection />
        </TabsContent>
      </Tabs>

      {/* Dialog deposit simulasi (dibuka dari tombol di dalam tab dompet) */}
      <DepositSimDialog open={depositOpen} onClose={() => setDepositOpen(false)} />
    </>
  );
}
