import { useQuery } from "convex/react";
import {
  CalendarClock,
  FileText,
  Loader2,
  Package,
  ScrollText,
  Send,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";

import { MyContractsSection } from "./dashboard/contract-views";
import { DashboardHeader } from "./dashboard/dashboard-header";
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Header ===== */}
      <DashboardHeader greetingName={greetingName} role={user?.role} onSignOut={handleSignOut} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
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

            {/* ===== Tab navigasi ===== */}
            <Tabs defaultValue="pinjaman" className="mt-8">
              <TabsList className="flex w-full flex-wrap gap-2 overflow-x-auto bg-transparent p-0">
                {(
                  [
                    ["pinjaman", "Pinjaman Aktif", <Wallet key="i" className="size-4" />],
                    ["jadwal", "Jadwal Angsuran", <CalendarClock key="i" className="size-4" />],
                    ["gadai", "Jaminan Gadai Saya", <Package key="i" className="size-4" />],
                    ["kontrak", "E-Contract Saya", <FileText key="i" className="size-4" />],
                    ["form", "Form Pengajuan Baru", <Send key="i" className="size-4" />],
                    ["riwayat", "Riwayat Transaksi", <ScrollText key="i" className="size-4" />],
                  ] as Array<[string, string, React.ReactNode]>
                ).map(([value, label, icon]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium shadow-sm transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    <span className="mr-1.5 inline-flex align-middle">{icon}</span>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

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
                <HistorySection loans={loans ?? []} pawns={pawns ?? []} onOpenLoan={setLoanDetailId} onOpenPawn={setPawnDetailId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <LoanDetailDialog loanId={loanDetailId} onClose={() => setLoanDetailId(null)} />
      <PawnDetailDialog pawnId={pawnDetailId} onClose={() => setPawnDetailId(null)} />

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-xs leading-5 text-muted-foreground">
          PINDAI — Pinjam & Gadai Digital. Dana bersih 95%, total kewajiban 130%,
          didanai oleh Pendana terverifikasi. Pengajuan memerlukan verifikasi KTP
          dan lokasi real.
        </div>
      </footer>
    </div>
  );
}
