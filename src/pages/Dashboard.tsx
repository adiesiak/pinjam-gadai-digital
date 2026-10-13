import { useQuery } from "convex/react";
import { FilePlus2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { tabDariParams } from "@/lib/notifikasi";
import { Button } from "@/components/ui/button";
import { JENIS_PENGAJUAN_AWAL, type JenisPengajuan } from "@/lib/jenisPengajuan";
import { formatRupiah } from "@/lib/money";
import type { FunctionReturnType } from "convex/server";

import { LocationGate } from "@/components/LocationGate";
import { FadeIn } from "@/components/Reveal";
import { SkeletonBarisDaftar, SkeletonKartu } from "@/components/ui/loading";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import type { IdTahapKyc } from "@/lib/kycTahapan";

import { MyContractsSection } from "./dashboard/contract-views";
import { DataDiriSection } from "./dashboard/data-diri-views";
import {
  KycMenuSidebar,
  KycSection,
  KycStatusStrip,
  menuTahapKyc,
  tampilkanMenuTahapKyc,
} from "./dashboard/kyc-views";
import { DashboardFooter } from "./dashboard/dashboard-footer";
import { DashboardHeader } from "./dashboard/dashboard-header";
import { DashboardSidebar } from "./dashboard/dashboard-sidebar";
import { DashboardBottomNav, type TabBadge } from "./dashboard/dashboard-tab-nav";
import { LoanDetailDialog } from "./dashboard/detail-dialogs";
import { FormPengajuanSection } from "./dashboard/form-pengajuan-views";
import { CatatanPinjamanSection } from "./dashboard/history-views";
import { ActiveLoanSection } from "./dashboard/loan-views";
import { DueReminderBanner, LokasiPeringatanBanner } from "./dashboard/notice-views";
import { SummaryCards } from "./dashboard/summary-cards";

/**
 * Rangka pemuatan dashboard: bentuknya mengikuti kartu ringkasan + daftar
 * yang akan menggantikannya, sehingga tata letak tidak "melompat" saat data
 * asli tiba. Teks status tetap ada untuk pembaca layar.
 */
function RingkasanMemuat() {
  return (
    <div role="status" aria-live="polite" className="mt-8 space-y-6">
      <span className="sr-only">Memuat data Anda…</span>
      {/* Kolom skeleton disamakan dengan `SummaryCards` (2 di sm, 3 di xl,
          tiga kartu) supaya tata letak tidak melompat saat data asli tiba.
          Bentuk kartunya memakai `SkeletonKartu` bersama, jadi tinggi kartu di
          sini tidak bisa lagi menyimpang dari kartu angka yang sesungguhnya. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-4">
        {[0, 1, 2].map((kolom) => (
          <SkeletonKartu key={kolom} className="p-5" />
        ))}
      </div>
      {/* Daftarnya sudah punya wilayah statusnya sendiri; di sini isinya cukup
          dilihat, sementara pengumumannya dipegang teks "Memuat data Anda…" di
          atas, supaya pembaca layar tidak mendengar dua pengumuman sekaligus. */}
      <div aria-hidden="true">
        <SkeletonBarisDaftar baris={3} className="rounded-2xl border border-slate-200 bg-white p-5" />
      </div>
    </div>
  );
}

/**
 * Dashboard nasabah, PINDAI.
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
  const dueReminder = useQuery(api.loans.dueReminder, argsPeminjam);
  const schedule = useQuery(api.loans.myLoanSchedule, argsPeminjam);
  // Status KYC dipakai untuk lencana tab (butuh tindakan nasabah), tidak ikut
  // menahan seluruh dashboard saat masih dimuat: tanpa data, tabnya cukup tanpa
  // lencana.
  const kyc = useQuery(api.kyc.kycSaya, argsPeminjam);
  const [loanDetailId, setLoanDetailId] = useState<Id<"loans"> | null>(null);

  // Tab yang sedang dibuka. Parameter `?tab=…` (mis. dari pusat notifikasi)
  // diutamakan selama masih ada di URL, lalu pilihan pengguna mengambil alih,
  // jadi tautan notifikasi selalu membuka tab yang dimaksud, tanpa memaksa
  // pengguna tetap terkunci di tab itu setelah ia berpindah sendiri.
  const [parameter, setParameter] = useSearchParams();
  const tabDariUrl = tabDariParams(parameter);
  const [tabLokal, setTabLokal] = useState<string>(() => tabDariUrl ?? "pinjaman");
  const activeTab = tabDariUrl ?? tabLokal;
  const gantiTab = (value: string) => {
    if (tabDariUrl !== null) setParameter(new URLSearchParams(), { replace: true });
    setTabLokal(value);
  };
  // Jenis pengajuan yang aktif dimiliki di sini, bukan di halaman form: CTA di
  // tab lain (dan pintasan menu layar sempit) harus bisa membuka halaman form
  // dengan jenisnya sudah terpilih, dan pilihan pemakai bertahan saat berpindah
  // tab.
  const [jenisPengajuan, setJenisPengajuan] = useState<JenisPengajuan>(
    JENIS_PENGAJUAN_AWAL,
  );
  /** Tahap KYC yang dipilih dari menu sidebar; null = modul memilih sendiri. */
  const [tahapKyc, setTahapKyc] = useState<IdTahapKyc | null>(null);

  /** Buka halaman Form Pengajuan dengan jenis yang sudah dipilih. */
  const bukaPengajuan = (jenis: JenisPengajuan) => {
    setJenisPengajuan(jenis);
    gantiTab("form");
  };

  /**
   * Data menu tahap KYC untuk sidebar. Hanya ada selama verifikasinya belum
   * selesai (`tampilkanMenuTahapKyc`), dan dihitung dari data yang SUDAH
   * tersimpan: kolom sidebar tidak memegang draft lokal modul KYC.
   */
  const dataMenuKyc =
    kyc !== undefined && tampilkanMenuTahapKyc(kyc.status)
      ? menuTahapKyc({
          status: kyc.status,
          kekurangan: kyc.kekurangan,
          persetujuanAktif: kyc.persetujuanAktif,
          isian: kyc.isian,
          dokumen: kyc.dokumen,
        })
      : null;

  /** Buka satu tahap dari menu sidebar: pilih tahapnya, lalu pindah ke tab KYC. */
  const pilihTahapKyc = (id: IdTahapKyc) => {
    setTahapKyc(id);
    gantiTab("kyc");
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
      <div className="bg-ambient-glass flex min-h-screen flex-col overflow-x-clip text-slate-900">
        <DashboardHeader />
        <main className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-12 sm:px-6">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Mode tamu · baca saja</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Kenali PINDAI sebelum membuat akun.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              Sebagai tamu, Anda dapat membaca informasi umum. Setelah masuk dengan email, Anda dapat mengelola data akun dan catatan pengajuan di PINDAI; perpindahan dana ditangani di luar aplikasi.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold">Pinjaman harian</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ilustrasi: asumsi biaya admin 2% (biaya platform dihapus), dan bunga flat 30%. Angka ini bukan pencairan atau tagihan; status lunas hanya perubahan catatan internal.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold">Pinjaman bulanan</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ilustrasi: asumsi biaya layanan 5% (tenor 3/6) atau 3% (tenor 1) dipotong di muka, dan bunga flat dari pokok penuh (30% tenor 1 bulan, 25% tenor 3 bulan, 20% tenor 6 bulan). Jadwal dan status lunas hanya catatan internal; tidak ada pembayaran aktual.</p>
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
    dueReminder === undefined ||
    schedule === undefined;

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
  const tabBadges: Partial<Record<string, TabBadge>> = {};
  if (pinjamanAktif > 0) tabBadges.pinjaman = { count: pinjamanAktif };
  // Lencana kewajiban menempel di Ringkasan: di situlah kartu jatuh tempo
  // terdekat berada, jadi angkanya menunjuk halaman yang benar.
  if (tagihanTerlambat > 0) tabBadges.ringkasan = { count: tagihanTerlambat, tone: "danger" };
  else if (tagihanDekat > 0) tabBadges.ringkasan = { count: tagihanDekat, tone: "warning" };
  // Hanya status yang MENUNGGU TINDAKAN NASABAH yang diberi lencana, VERIFIED
  // dan PENDING_REVIEW bukan pekerjaan pengguna.
  if (
    kyc !== undefined &&
    (kyc.status === "NEEDS_CORRECTION" ||
      kyc.status === "REJECTED" ||
      kyc.status === "REVERIFICATION_REQUIRED")
  ) {
    tabBadges.kyc = { count: 1, tone: kyc.status === "REJECTED" ? "danger" : "warning" };
  }

  /** Isi kolom kiri (layar lebar): kartu profil, lima menu, tahap KYC, Keluar. */
  const isiMenu = (
    <DashboardSidebar
      greetingName={greetingName}
      role={user?.role}
      kycStatus={kyc === undefined ? null : kyc.status}
      badges={tabBadges}
      activeTab={activeTab}
      onTabChange={gantiTab}
      onSignOut={handleSignOut}
      kycMenu={
        dataMenuKyc === null ? null : (
          <KycMenuSidebar
            aktif={tahapKyc ?? dataMenuKyc.tahapAktif}
            statusPerTahap={dataMenuKyc.statusPerTahap}
            terkunci={dataMenuKyc.terkunci}
            onPilih={pilihTahapKyc}
          />
        )
      }
    />
  );
  return (
    // Gerbang lokasi wajib: Peminjam tidak bisa memakai dashboard tanpa GPS
    // aktif (heartbeat ke server). Admin dan penyedia dana dikecualikan, sama
    // seperti PERAN_WAJIB_LOKASI di convex/lokasi.ts (hanya peminjam/member).
    <LocationGate aktif={role !== "admin" && role !== "dana"}>
      <div className="bg-ambient-glass flex min-h-screen flex-col overflow-x-clip text-slate-900">
        {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Bar atas ===== */}
      <DashboardHeader />

      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 sm:px-6 sm:py-8 sm:pb-24 lg:pb-8"
      >
        <Tabs
          value={activeTab}
          onValueChange={gantiTab}
          className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8"
        >
          {/* ===== Sisi kiri: profil + navigasi tab (hanya lg ke atas) ===== */}
          <aside className="hidden w-full shrink-0 lg:sticky lg:top-20 lg:block lg:w-64">
            {isiMenu}
          </aside>

          {/* ===== Kolom konten ===== */}
          <FadeIn className="min-w-0 flex-1">
            {isLoading ? (
              <RingkasanMemuat />
            ) : (
              <>
                {/* Pengingat jatuh tempo live. Satu-satunya pengingat di layar;
                    membukanya berarti membuka rincian pinjaman terkait. */}
                {dueReminder !== null && (
                  <DueReminderBanner reminder={dueReminder} onLihatDetail={setLoanDetailId} />
                )}

                {/* Peringatan lokasi dicurigai, ditulis server saat titik
                    lokasi nasabah ditandai (mis. koordinat beku berulang). */}
                <LokasiPeringatanBanner />

                {/* Status lokasi wajib tampil sebagai pil di kanan bawah,
                    gerbangnya sendiri membungkus seluruh dashboard. */}

                {/* ===== TAB 1: RINGKASAN =====
                    Tiga hal saja: kewajiban terdekat (satu kartu), tiga angka
                    pokok (limit, tagihan bulan ini, status KYC), lalu satu jalan
                    ke pengajuan. Riwayat dan formulir punya halamannya sendiri,
                    jadi tidak ada bagian yang muncul dua kali di layar. */}
                <TabsContent value="ringkasan" className="mt-6 animate-masuk">
                  <ActiveLoanSection
                    schedule={schedule ?? []}
                    onOpenDetail={setLoanDetailId}
                    batas={1}
                  />
                  <SummaryCards
                    schedule={schedule ?? []}
                    kycStatus={kyc === undefined ? null : kyc.status}
                    onBukaKyc={() => gantiTab("kyc")}
                  />
                  <Button
                    type="button"
                    className="mt-4 w-full gap-2 bg-emerald-800 text-white hover:bg-emerald-900 sm:w-auto"
                    onClick={() => bukaPengajuan("pinjaman")}
                  >
                    <FilePlus2 className="size-4" aria-hidden />
                    Ajukan Pinjaman
                  </Button>
                </TabsContent>

                {/* ===== TAB 2: CATATAN PINJAMAN =====
                    Daftar semua pinjaman dengan saringan status; rincian satu
                    pinjaman dibuka lewat dialog, bukan kartu kedua di layar. */}
                <TabsContent value="pinjaman" className="mt-6 animate-masuk">
                  <CatatanPinjamanSection loans={loans ?? []} onOpenLoan={setLoanDetailId} />
                </TabsContent>

                {/* ===== TAB 5: FORM PENGAJUAN, satu halaman, tiga jenis =====
                    Peminjam memilih pinjaman / gadai / kredit barang lewat menu
                    dropdown; hanya formulir jenis itu yang dirender. */}
                <TabsContent value="form" className="mt-8 min-w-0 animate-masuk">
                  <FormPengajuanSection
                    jenis={jenisPengajuan}
                    onUbahJenis={setJenisPengajuan}
                    onBukaKyc={() => gantiTab("kyc")}
                  />
                </TabsContent>

                {/* ===== TAB: DATA DIRI, sunting mandiri nasabah ===== */}
                <TabsContent value="diri" className="mt-8 min-w-0 animate-masuk">
                  <DataDiriSection />
                </TabsContent>

                {/* ===== TAB: VERIFIKASI KYC, modul mandiri =====
                    Terpisah dari formulir pengajuan: menyimpan KYC tidak membuat
                    catatan pinjaman apa pun, dan status VERIFIED bukan
                    persetujuan pinjaman. */}
                {/* Batas 48rem: sejak navigasi tahap pindah ke sidebar, kolom isi
                    KYC jadi lebih lebar daripada formulirnya. */}
                <TabsContent value="kyc" className="mt-8 min-w-0 max-w-3xl animate-masuk">
                  <KycSection tahapPilihan={tahapKyc} onPilihTahap={setTahapKyc} />
                </TabsContent>

              </>
            )}
          </FadeIn>
        </Tabs>
      </main>

        <LoanDetailDialog loanId={loanDetailId} onClose={() => setLoanDetailId(null)} />

        {/* Navigasi bawah untuk layar sempit; kolom kiri hanya muncul di `lg`. */}
        <DashboardBottomNav
          badges={tabBadges}
          activeTab={activeTab}
          onTabChange={gantiTab}
        />

        <DashboardFooter />
      </div>
    </LocationGate>
  );
}
