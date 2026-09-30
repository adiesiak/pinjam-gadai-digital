import { useQuery } from "convex/react";
import { useState } from "react";
import { Store, TrendingUp, Wallet } from "lucide-react";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";

import { FundingContractsSection } from "./funding-contracts-views";
import { HistorySection } from "./history-views";
import { KreditBarangSection } from "./kredit-views";
import { MarketplaceSection } from "./market-views";
import { PendanaSidebar } from "./pendana-sidebar";
import type { TabBadge } from "./pendana-tab-nav";
import { PortfolioSection } from "./portfolio-views";
import { WalletSection } from "./wallet-views";

/**
 * Workspace utama Pendana: profil + enam tab di sisi kiri, ringkasan saldo dan
 * konten tab di kolom kanan.
 */
export function PendanaWorkspace({
  greetingName,
  onSignOut,
}: {
  greetingName: string;
  onSignOut: () => void;
}) {
  const wallet = useQuery(api.pendana.myWallet);
  const portfolio = useQuery(api.pendana.myPortfolio);
  const marketplace = useQuery(api.pendana.marketplace);
  const contracts = useQuery(api.pendana.myFundingContracts);
  const peluangKredit = useQuery(api.pendana.marketplaceKredit);
  const [defaultTab, setDefaultTab] = useState("marketplace");

  // ===== Indikator jumlah pada item tab sidebar =====
  const peluangPendanaan = marketplace?.length ?? 0;
  const pendanaanMenunggak = (portfolio ?? []).filter(
    (p) => p.statusPelunasan === "menunggak",
  ).length;
  const posisiAlokasi = wallet?.posisiAlokasi ?? 0;
  const jumlahKontrak = contracts?.length ?? 0;
  const peluangKreditBarang = peluangKredit?.length ?? 0;

  const tabBadges: Partial<Record<string, TabBadge>> = {};
  if (peluangPendanaan > 0) tabBadges.marketplace = { count: peluangPendanaan };
  if (pendanaanMenunggak > 0) tabBadges.portofolio = { count: pendanaanMenunggak, tone: "danger" };
  else if (posisiAlokasi > 0) tabBadges.portofolio = { count: posisiAlokasi };
  if (jumlahKontrak > 0) tabBadges.kontrak = { count: jumlahKontrak };
  if (peluangKreditBarang > 0) tabBadges.kredit = { count: peluangKreditBarang };

  return (
    <>
      <Tabs
        defaultValue="marketplace"
        value={defaultTab}
        onValueChange={setDefaultTab}
        className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8"
      >
        {/* ===== Sisi kiri: profil + navigasi tab ===== */}
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-64">
          <PendanaSidebar
            greetingName={greetingName}
            badges={tabBadges}
            activeTab={defaultTab}
            onTabChange={setDefaultTab}
            onSignOut={onSignOut}
          />
        </aside>

        {/* ===== Kolom konten ===== */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
              Ruang Pendana · simulasi ledger internal
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Ledger simulasi Pendana</h1>
          </div>

          {/* ===== Ringkasan ledger ===== */}
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            Seluruh saldo, alokasi, dan imbal hasil di ruang ini adalah angka simulasi ledger internal. Catatan setoran/penarikan tidak menunjukkan dana masuk atau keluar; tidak ada transfer eksternal yang diproses atau diverifikasi.
          </p>
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-4">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Saldo ledger (simulasi)</p>
                  <p className="mt-2 break-words text-xl font-semibold tabular-nums text-primary sm:text-2xl">
                    {formatRupiah(wallet?.saldo ?? 0)}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Wallet className="size-5" strokeWidth={2} />
                </span>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total alokasi simulasi</p>
                  <p className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">
                    {formatRupiah(wallet?.danaBekerja ?? 0)}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Store className="size-5" strokeWidth={2} />
                </span>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Estimasi Imbal Hasil simulasi</p>
                  <p className="mt-2 break-words text-xl font-semibold tabular-nums text-emerald-600 sm:text-2xl">
                    {formatRupiah(wallet?.imbalHasilDiharapkan ?? 0)}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <TrendingUp className="size-5" strokeWidth={2} />
                </span>
              </div>
            </div>
          </section>

          {/* ===== Konten tab ===== */}
          <TabsContent value="marketplace" className="mt-8">
            <MarketplaceSection />
          </TabsContent>

          <TabsContent value="kredit" className="mt-8">
            <KreditBarangSection />
          </TabsContent>

          <TabsContent value="portofolio" className="mt-8">
            <PortfolioSection portfolio={portfolio} />
          </TabsContent>

          <TabsContent value="kontrak" className="mt-8">
            <FundingContractsSection />
          </TabsContent>

          <TabsContent value="dompet" className="mt-8">
            <WalletSection />
          </TabsContent>

          <TabsContent value="riwayat" className="mt-8">
            <HistorySection />
          </TabsContent>
        </div>
      </Tabs>

    </>
  );
}
