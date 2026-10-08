import { useQuery } from "convex/react";
import { Loader2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { JENIS_PENGAJUAN_AWAL, type JenisPengajuan } from "@/lib/jenisPengajuan";
import { formatRupiah } from "@/lib/money";
import type { FunctionReturnType } from "convex/server";

import { LocationGate } from "@/components/LocationGate";
import { ManualPaymentEvidenceHistory } from "@/components/ManualPaymentEvidenceForm";
import { FadeIn } from "@/components/Reveal";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";

import { MyContractsSection } from "./dashboard/contract-views";
import { DataDiriSection } from "./dashboard/data-diri-views";
import { DashboardFooter } from "./dashboard/dashboard-footer";
import { DashboardHeader } from "./dashboard/dashboard-header";
import { DashboardSidebar } from "./dashboard/dashboard-sidebar";
import type { TabBadge } from "./dashboard/dashboard-tab-nav";
import { LoanDetailDialog, PawnDetailDialog } from "./dashboard/detail-dialogs";
import {
  FormPengajuanSection,
  TombolBuatPengajuan,
} from "./dashboard/form-pengajuan-views";
import { GadaiBillingSection } from "./dashboard/gadai-views";
import { HistorySection } from "./dashboard/history-views";
import { ActiveLoanSection, ScheduleSection } from "./dashboard/loan-views";
import { DueReminderBanner, LokasiPeringatanBanner } from "./dashboard/notice-views";
import { SummaryCards } from "./dashboard/summary-cards";
import { PawnVaultSection } from "./dashboard/vault-views";

type CreditHistory = FunctionReturnType<typeof api.loans.myLoanCreditHistory>;

function CreditProgressCard({ history }: { history: CreditHistory }) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <TrendingUp className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Riwayat progres plafon tunai</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {history.jumlahPelunasanTepatWaktu} entri status lunas tepat waktu pada ledger
            </span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
            Plafon tercatat {formatRupiah(history.plafonEfektif)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Catatan pinjaman tunai minimal Rp1 juta yang berstatus lunas di ledger pada atau sebelum tanggal acuan dapat menambah plafon internal Rp1 juta, hingga Rp10 juta. Status dan tanggal ini mengikuti pencatatan ledger internal, bukan skor biro kredit atau jaminan pengajuan disetujui.
          </p>
          {history.riwayat.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {history.riwayat.slice(0, 3).map((loan) => (
                <li key={loan.nomorReferensi} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-medium tabular-nums">{formatRupiah(loan.pokokPinjaman)}</span>
                  <span className="ml-2 text-muted-foreground">
                    Status lunas (ledger){loan.lunasPada ? ` · ${new Date(loan.lunasPada).toLocaleDateString("id-ID")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Dashboard nasabah — PINDAI.
 * Hanya merangkai modul di ./dashboard/*; tiap bagian hidup di file sendiri
 * agar mudah disunting dan dirawat.
 *
 * Tata letak: profil + navigasi tab di sisi kiri (kolom kanan berisi konten),
 * menumpuk ke bawah pada layar sempit.
 */
export default function Dashboard() {
  const { user, isAnonymous, signOut } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  // Lewati query hanya saat profil pengguna masih dimuat atau pengguna tamu.
  // Akun baru memang belum punya role; endpoint Peminjam mendukung role kosong,
  // jadi menunggu role terisi akan membuat spinner abadi.
  const argsPeminjam = user === undefined || isAnonymous ? ("skip" as const) : {};
  const loans = useQuery(api.loans.listMyLoans, argsPeminjam);
  const summary = useQuery(api.loans.myLoanSummary, argsPeminjam);
  const creditHistory = useQuery(api.loans.myLoanCreditHistory, argsPeminjam);
  const pawns = useQuery(api.loans.listMyPawns, argsPeminjam);
  const dueReminder = useQuery(api.loans.dueReminder, argsPeminjam);
  const schedule = useQuery(api.loans.myLoanSchedule, argsPeminjam);
  const contracts = useQuery(api.loans.myContracts, argsPeminjam);

  const [loanDetailId, setLoanDetailId] = useState<Id<"loans"> | null>(null);
  const [pawnDetailId, setPawnDetailId] = useState<Id<"pawns"> | null>(null);
  const [activeTab, setActiveTab] = useState("pinjaman");
  // Jenis pengajuan yang aktif dimiliki di sini, bukan di halaman form: CTA di
  // tab lain (dan pintasan menu layar sempit) harus bisa membuka halaman form
  // dengan jenisnya sudah terpilih, dan pilihan pemakai bertahan saat berpindah
  // tab.
  const [jenisPengajuan, setJenisPengajuan] = useState<JenisPengajuan>(
    JENIS_PENGAJUAN_AWAL,
  );

  /** Buka halaman Form Pengajuan dengan jenis yang sudah dipilih. */
  const bukaPengajuan = (jenis: JenisPengajuan) => {
    setJenisPengajuan(jenis);
    setActiveTab("form");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleCreateAccount = async () => {
    await signOut();
    navigate("/auth?returnTo=%2Fdashboard");
  };

  if (isAnonymous) {
    return (
      <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50 text-slate-900">
        <DashboardHeader />
        <main className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-12 sm:px-6">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Mode tamu · baca saja</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Kenali PINDAI sebelum membuat akun.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              Sebagai tamu, Anda dapat membaca informasi umum. Setelah masuk dengan email, Anda dapat mengelola data akun dan catatan pengajuan pada ledger internal; perpindahan dana ditangani di luar aplikasi.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold">Pinjaman harian</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ilustrasi ledger: asumsi biaya admin 2% (biaya platform dihapus), dan bunga flat 30%. Angka ini bukan pencairan atau tagihan; status lunas hanya perubahan catatan internal.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold">Pinjaman bulanan</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ilustrasi ledger: asumsi biaya layanan 5% (tenor 3/6) atau 3% (tenor 1) dipotong di muka, dan bunga flat dari pokok penuh (30% tenor 1 bulan, 25% tenor 3 bulan, 20% tenor 6 bulan). Jadwal dan status lunas hanya catatan internal; tidak ada pembayaran aktual.</p>
              </div>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={() => void handleCreateAccount()}>Masuk / buat akun dengan email OTP</Button>
              <Button asChild variant="outline"><Link to="/">Baca informasi layanan</Link></Button>
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">PINDAI di halaman ini hanya menyediakan catatan internal. Informasi ini bukan penawaran, bukti transaksi, atau jaminan pencairan dana.</p>
          </section>
        </main>
        <DashboardFooter />
      </div>
    );
  }

  const isLoading =
    loans === undefined ||
    summary === undefined ||
    creditHistory === undefined ||
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
    // Gerbang lokasi wajib: Peminjam tidak bisa memakai dashboard tanpa GPS
    // aktif (heartbeat ke server). Admin dan penyedia dana dikecualikan — sama
    // seperti PERAN_WAJIB_LOKASI di convex/lokasi.ts (hanya peminjam/member).
    <LocationGate aktif={role !== "admin" && role !== "dana"}>
      <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50 text-slate-900">
        {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Bar atas ===== */}
      <DashboardHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8"
        >
          {/* ===== Sisi kiri: profil + navigasi tab ===== */}
          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-64">
            <DashboardSidebar
              greetingName={greetingName}
              role={user?.role}
              badges={tabBadges}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onBuatPengajuan={bukaPengajuan}
              onSignOut={handleSignOut}
            />
          </aside>

          {/* ===== Kolom konten ===== */}
          <FadeIn className="min-w-0 flex-1">
            {isLoading ? (
              <div className="mt-20 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Memuat data Anda…
              </div>
            ) : (
              <>
                {/* Pengingat jatuh tempo live */}
                {dueReminder !== null && <DueReminderBanner reminder={dueReminder} />}

                {/* Peringatan lokasi dicurigai — ditulis server saat titik
                    lokasi nasabah ditandai (mis. koordinat beku berulang). */}
                <LokasiPeringatanBanner />

                {/* Status lokasi wajib tampil sebagai pil di kanan bawah —
                    gerbangnya sendiri membungkus seluruh dashboard. */}

                {/* ===== Ringkasan keuangan ===== */}
                <SummaryCards schedule={schedule ?? []} />
                {creditHistory && <CreditProgressCard history={creditHistory} />}

                {/* ============ TAB 1: PINJAMAN AKTIF ============ */}
                <TabsContent value="pinjaman" className="mt-8 animate-masuk">
                  <TombolBuatPengajuan
                    jenis="pinjaman"
                    onClick={() => bukaPengajuan("pinjaman")}
                  />
                  <ActiveLoanSection
                    schedule={schedule ?? []}
                    onOpenDetail={setLoanDetailId}
                  />
                </TabsContent>

                {/* ============ TAB 2: JADWAL ANGSURAN ============ */}
                <TabsContent value="jadwal" className="mt-8 animate-masuk">
                  <ScheduleSection schedule={schedule ?? []} />
                </TabsContent>

                {/* ============ TAB 3: JAMINAN GADAI ============ */}
                <TabsContent value="gadai" className="mt-8 animate-masuk">
                  <TombolBuatPengajuan jenis="gadai" onClick={() => bukaPengajuan("gadai")} />
                  <div className="space-y-8">
                    <GadaiBillingSection pawns={pawns ?? []} />
                    <PawnVaultSection pawns={pawns ?? []} onOpenDetail={setPawnDetailId} />
                  </div>
                </TabsContent>

                {/* ============ TAB 4: E-CONTRACT ============
                    Kredit barang tidak punya tab sendiri lagi: formulir dan
                    catatannya berada di tab Form Pengajuan. */}
                <TabsContent value="kontrak" className="mt-8 animate-masuk">
                  <MyContractsSection contracts={contracts} />
                </TabsContent>

                {/* ===== TAB 5: FORM PENGAJUAN — satu halaman, tiga jenis =====
                    Peminjam memilih pinjaman / gadai / kredit barang lewat menu
                    dropdown; hanya formulir jenis itu yang dirender. */}
                <TabsContent value="form" className="mt-8 min-w-0 animate-masuk">
                  <FormPengajuanSection
                    jenis={jenisPengajuan}
                    onUbahJenis={setJenisPengajuan}
                  />
                </TabsContent>

                {/* ===== TAB: DATA DIRI — sunting mandiri nasabah ===== */}
                <TabsContent value="diri" className="mt-8 min-w-0 animate-masuk">
                  <DataDiriSection />
                </TabsContent>

                {/* ============ TAB 6: RIWAYAT ============ */}
                <TabsContent value="riwayat" className="mt-8 animate-masuk">
                  <div className="space-y-6">
                    <HistorySection
                      loans={loans ?? []}
                      pawns={pawns ?? []}
                      onOpenLoan={setLoanDetailId}
                      onOpenPawn={setPawnDetailId}
                    />
                    <ManualPaymentEvidenceHistory />
                  </div>
                </TabsContent>
              </>
            )}
          </FadeIn>
        </Tabs>
      </main>

        <LoanDetailDialog loanId={loanDetailId} onClose={() => setLoanDetailId(null)} />
        <PawnDetailDialog pawnId={pawnDetailId} onClose={() => setPawnDetailId(null)} />

        <DashboardFooter />
      </div>
    </LocationGate>
  );
}
