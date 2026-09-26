import { useQuery } from "convex/react";
import {
  CalendarClock,
  FileText,
  Loader2,
  LogOut,
  Package,
  ScrollText,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { formatRupiah } from "@/lib/money";

import { MyContractsSection } from "./dashboard/contract-views";
import { LoanDetailDialog, PawnDetailDialog } from "./dashboard/detail-dialogs";
import { LoanForm, PawnForm } from "./dashboard/forms-views";
import { GadaiBillingSection } from "./dashboard/gadai-views";
import { HistorySection } from "./dashboard/history-views";
import { ActiveLoanSection, ScheduleSection } from "./dashboard/loan-views";
import { DueReminderBanner, LocationConsentCard } from "./dashboard/notice-views";
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

  // ===== Ringkasan keuangan (3 kartu utama) =====
  const danaBersihTotal = useMemo(
    () => (schedule ?? []).reduce((acc, l) => acc + l.quote.danaBersihDitransfer, 0),
    [schedule],
  );
  const totalKewajiban = useMemo(
    () => (schedule ?? []).reduce((acc, l) => acc + l.quote.totalKewajibanPelunasan, 0),
    [schedule],
  );
  const sisaTagihan = useMemo(() => {
    const aktif = (schedule ?? []).filter((l) => l.status === "didanai");
    return aktif.reduce((acc, l) => acc + (l.pelunasan?.totalKewajibanDenganPenalti ?? 0), 0);
  }, [schedule]);
  const jatuhTempoTerdekat = useMemo(() => {
    const aktif = (schedule ?? []).filter((l) => l.status === "didanai" && l.pelunasan);
    if (aktif.length === 0) return null;
    return aktif.reduce((min, l) =>
      (l.pelunasan?.jatuhTempoPada ?? Infinity) < (min.pelunasan?.jatuhTempoPada ?? Infinity) ? l : min,
    );
  }, [schedule]);

  const greetingName = user?.name ?? user?.email?.split("@")[0] ?? "Nasabah";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Header ===== */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              P
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.14em] sm:block">
              PINDAI
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-semibold">Halo, {greetingName} 👋</p>
              <Badge className="mt-0.5 hidden border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100 sm:inline-flex">
                <ShieldCheck className="mr-1 size-3" /> KTP Terverifikasi
              </Badge>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {greetingName.charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {user?.role === "admin" && (
              <Button asChild variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex">
                <Link to="/admin">Panel Admin</Link>
              </Button>
            )}
            {user?.role === "pendana" && (
              <Button asChild variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex">
                <Link to="/pendana">Ruang Pendana</Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

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
            <section className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Dana Bersih Diterima</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600">
                      {formatRupiah(danaBersihTotal)}
                    </p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Wallet className="size-5" strokeWidth={2} />
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Kewajiban Pelunasan</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatRupiah(totalKewajiban)}
                    </p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <CalendarClock className="size-5" strokeWidth={2} />
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Sisa Tagihan Berjalan</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-destructive">
                      {formatRupiah(sisaTagihan)}
                    </p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Package className="size-5" strokeWidth={2} />
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {jatuhTempoTerdekat
                    ? `Jatuh tempo ${jatuhTempoTerdekat.pelunasan?.hariTerlambat && jatuhTempoTerdekat.pelunasan.hariTerlambat > 0 ? `terlambat ${jatuhTempoTerdekat.pelunasan.hariTerlambat} hari` : `${jatuhTempoTerdekat.pelunasan?.sisaHari ?? 0} hari lagi`}`
                    : "Tidak ada tagihan aktif saat ini."}
                </p>
              </div>
            </section>

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
