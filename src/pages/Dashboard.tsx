import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";

import { MyContractsSection } from "./dashboard/contract-views";
import { DashboardFooter } from "./dashboard/dashboard-footer";
import { DashboardHeader } from "./dashboard/dashboard-header";
import { DashboardSidebar } from "./dashboard/dashboard-sidebar";
import type { TabBadge } from "./dashboard/dashboard-tab-nav";
import { LoanDetailDialog, PawnDetailDialog } from "./dashboard/detail-dialogs";
import { LoanForm, PawnForm } from "./dashboard/forms-views";
import { GadaiBillingSection } from "./dashboard/gadai-views";
import { HistorySection } from "./dashboard/history-views";
import { ActiveLoanSection, ScheduleSection } from "./dashboard/loan-views";
import { DueReminderBanner, LocationConsentCard } from "./dashboard/notice-views";
import { SummaryCards } from "./dashboard/summary-cards";
import { PawnVaultSection } from "./dashboard/vault-views";

/**
 * Dashboard nasabah — PINDAI.
 * Hanya merangkai modul di ./dashboard/*; tiap bagian hidup di file sendiri
 * agar mudah disunting dan dirawat.
 *
 * Tata letak: profil + navigasi tab di sisi kiri (kolom kanan berisi konten),
 * menumpuk ke bawah pada layar sempit.
 */
export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const loans = useQuery(api.loans.listMyLoans);
  const summary = useQuery(api.loans.myLoanSummary);
  const pawns = useQuery(api.loans.listMyPawns);
  const dueReminder = useQuery(api.loans.dueReminder);
  const schedule = useQuery(api.loans.myLoanSchedule);
  const contracts = useQuery(api.loans.myContracts);

  const [loanDetailId, setLoanDetailId] = useState<Id<"loans"> | null>(null);
  const [pawnDetailId, setPawnDetailId] = useState<Id<"pawns"> | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isLoading =
    loans === undefined ||
    summary === undefined ||
    pawns === undefined ||
    dueReminder === undefined ||
    schedule === undefined ||
    contracts === undefined;

  const greetingName = user?.name ?? user?.email?.split("@")[0] ?? "Nasabah";

  // ===== Indikator jumlah pada item tab sidebar =====
  const scheduleRows = schedule ?? [];
  const pinjamanAktif = scheduleRows.filter((l) => l.status === "didanai").length;
  const tagihanTerlambat = scheduleRows.filter(
    (l) => (l.pelunasan?.hariTerlambat ?? 0) > 0,
  ).length;
  const tagihanDekat = scheduleRows.filter(
    (l) =>
      l.status === "didanai" &&
      l.pelunasan !== null &&
      l.pelunasan.hariTerlambat === 0 &&
      l.pelunasan.sisaHari <= 7,
  ).length;
  const gadaiAktif = (pawns ?? []).filter(
    (p) => p.status === "aktif" || p.status === "menunggu_pelepasan",
  ).length;
  const jumlahKontrak = contracts ? contracts.pinjaman.length + contracts.gadai.length : 0;

  const tabBadges: Partial<Record<string, TabBadge>> = {};
  if (pinjamanAktif > 0) tabBadges.pinjaman = { count: pinjamanAktif };
  if (tagihanTerlambat > 0) tabBadges.jadwal = { count: tagihanTerlambat, tone: "danger" };
  else if (tagihanDekat > 0) tabBadges.jadwal = { count: tagihanDekat, tone: "warning" };
  if (gadaiAktif > 0) tabBadges.gadai = { count: gadaiAktif };
  if (jumlahKontrak > 0) tabBadges.kontrak = { count: jumlahKontrak };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Bar atas ===== */}
      <DashboardHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Tabs
          defaultValue="pinjaman"
          className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8"
        >
          {/* ===== Sisi kiri: profil + navigasi tab ===== */}
          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-64">
            <DashboardSidebar
              greetingName={greetingName}
              role={user?.role}
              badges={tabBadges}
              onSignOut={handleSignOut}
            />
          </aside>

          {/* ===== Kolom konten ===== */}
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="mt-20 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Memuat data Anda…
              </div>
            ) : (
              <>
                {/* Pengingat jatuh tempo live */}
                {dueReminder !== null && <DueReminderBanner reminder={dueReminder} />}

                {/* Persetujuan pelacakan lokasi (opt-in, dapat dicabut) */}
                <LocationConsentCard />

                {/* ===== Ringkasan keuangan ===== */}
                <SummaryCards schedule={schedule ?? []} />

                {/* ============ TAB 1: PINJAMAN AKTIF ============ */}
                <TabsContent value="pinjaman" className="mt-8">
                  <ActiveLoanSection
                    schedule={schedule ?? []}
                    onOpenDetail={setLoanDetailId}
                  />
                </TabsContent>

                {/* ============ TAB 2: JADWAL ANGSURAN ============ */}
                <TabsContent value="jadwal" className="mt-8">
                  <ScheduleSection schedule={schedule ?? []} />
                </TabsContent>

                {/* ============ TAB 3: JAMINAN GADAI ============ */}
                <TabsContent value="gadai" className="mt-8">
                  <div className="space-y-8">
                    <GadaiBillingSection pawns={pawns ?? []} />
                    <PawnVaultSection pawns={pawns ?? []} onOpenDetail={setPawnDetailId} />
                  </div>
                </TabsContent>

                {/* ============ TAB 4: E-CONTRACT ============ */}
                <TabsContent value="kontrak" className="mt-8">
                  <MyContractsSection contracts={contracts} />
                </TabsContent>

                {/* ============ TAB 5: FORM PENGAJUAN ============ */}
                <TabsContent value="form" className="mt-8">
                  <div className="grid gap-8 lg:grid-cols-2">
                    <section>
                      <h2 className="text-lg font-semibold">Form Pengajuan Pinjaman</h2>
                      <Separator className="my-4" />
                      <LoanForm
                        onCreated={(ref) =>
                          toast.success(`Pengajuan terkirim — nomor referensi ${ref}`)
                        }
                      />
                    </section>
                    <section>
                      <h2 className="text-lg font-semibold">Gadaikan Barang</h2>
                      <Separator className="my-4" />
                      <PawnForm
                        onCreated={() =>
                          toast.success(
                            "Pengajuan gadai terkirim — tim kami akan menghubungi Anda untuk penjadwalan pemeriksaan.",
                          )
                        }
                      />
                    </section>
                  </div>
                </TabsContent>

                {/* ============ TAB 6: RIWAYAT ============ */}
                <TabsContent value="riwayat" className="mt-8">
                  <HistorySection
                    loans={loans ?? []}
                    pawns={pawns ?? []}
                    onOpenLoan={setLoanDetailId}
                    onOpenPawn={setPawnDetailId}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </main>

      <LoanDetailDialog loanId={loanDetailId} onClose={() => setLoanDetailId(null)} />
      <PawnDetailDialog pawnId={pawnDetailId} onClose={() => setPawnDetailId(null)} />

      <DashboardFooter />
    </div>
  );
}
