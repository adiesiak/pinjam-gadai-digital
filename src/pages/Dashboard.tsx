import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ChevronDown, FilePlus2, HandCoins } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { tabDariParams } from "@/lib/notifikasi";
import { Button } from "@/components/ui/button";
import { JENIS_PENGAJUAN_AWAL, type JenisPengajuan } from "@/lib/jenisPengajuan";
import { formatRupiah } from "@/lib/money";

import { LocationGate } from "@/components/LocationGate";
import { SkipLink } from "@/components/SkipLink";
import { ModeNasabahUji } from "@/components/ModeNasabahUji";
import { FadeIn } from "@/components/Reveal";
import { SkeletonBarisDaftar, SkeletonKartu } from "@/components/ui/loading";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import type { IdTahapKyc } from "@/lib/kycTahapan";

import { DataDiriSection } from "./dashboard/data-diri-views";
import {
  KycMenuSidebar,
  KycSection,
  menuTahapKyc,
  tampilkanMenuTahapKyc,
} from "./dashboard/kyc-views";
import { DashboardFooter } from "./dashboard/dashboard-footer";
import { DashboardHeader } from "./dashboard/dashboard-header";
import { DashboardSidebar } from "./dashboard/dashboard-sidebar";
import { DashboardBottomNav, labelTujuan, type TabBadge } from "./dashboard/dashboard-tab-nav";
import { LoanDetailDialog } from "./dashboard/detail-dialogs";
import { PersetujuanVerifikasiPembayaran } from "@/components/PersetujuanVerifikasiPembayaran";
import { FormPengajuanSection } from "./dashboard/form-pengajuan-views";
import { AngsuranSection, TagihanBerikutnyaRingkas } from "./dashboard/angsuran-views";
import { CatatanPinjamanSection } from "./dashboard/history-views";
import { DaftarPengajuanSyariah } from "./dashboard/syariah-views";
import { ActiveLoanSection } from "./dashboard/loan-views";
import { DueReminderBanner, LokasiPeringatanBanner } from "./dashboard/notice-views";
import { RiwayatProgresPlafon, SummaryCards } from "./dashboard/summary-cards";
import { DoorprizeWidget } from "@/components/DoorprizeWidget";
import { KartuReferral } from "@/components/KartuReferral";
import { KartuLimitVoucher } from "@/components/voucher/KartuLimitVoucher";
import { BannerPromoGambar } from "@/components/promo/BannerPromoGambar";
import { PromoBungaAktif } from "@/components/promo/PromoBungaAktif";
import { PromoDashboard } from "@/components/promo/PromoDashboard";

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
  const adminPratinjauId =
    role === "admin" && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("lihatNasabah")
      : null;
  const pratinjauUserId = adminPratinjauId as Id<"users"> | null;
  const dataPratinjau = useQuery(
    api.nasabah.dashboardNasabahUntukAdmin,
    pratinjauUserId === null ? "skip" : { userId: pratinjauUserId },
  );
  const catatLihatNasabah = useMutation(api.nasabah.catatLihatDashboardNasabah);
  // Simpan id yang auditnya sudah tercatat, bukan boolean: saat pratinjau
  // berganti akun, hasil akun sebelumnya tidak lagi dianggap siap.
  const [auditSiapUntuk, setAuditSiapUntuk] = useState<Id<"users"> | null>(null);
  const auditPratinjauSiap =
    pratinjauUserId !== null && auditSiapUntuk === pratinjauUserId;
  useEffect(() => {
    if (pratinjauUserId === null) return;
    let aktif = true;
    void catatLihatNasabah({ userId: pratinjauUserId }).then(
      () => {
        if (aktif) setAuditSiapUntuk(pratinjauUserId);
      },
      () => {
        if (aktif) setAuditSiapUntuk(null);
      },
    );
    return () => {
      aktif = false;
    };
  }, [pratinjauUserId, catatLihatNasabah]);

  // Lewati query nasabah saat profil masih dimuat, sesi tamu, atau pratinjau admin.
  // Admin tanpa target pratinjau tidak punya data nasabah sendiri; query
  // peminjam dilewati supaya halaman pemilih akun tidak membaca catatan kosong.
  const argsPeminjam =
    user === undefined || isAnonymous || adminPratinjauId !== null || role === "admin"
      ? ("skip" as const)
      : {};
  const loans = useQuery(api.loans.listMyLoans, argsPeminjam);
  const summary = useQuery(api.loans.myLoanSummary, argsPeminjam);
  const dueReminder = useQuery(api.loans.dueReminder, argsPeminjam);
  const schedule = useQuery(api.loans.myLoanSchedule, argsPeminjam);
  const angsuran = useQuery(api.angsuran.myAngsuran, argsPeminjam);
  // Status KYC dipakai untuk lencana tab (butuh tindakan nasabah), tidak ikut
  // menahan seluruh dashboard saat masih dimuat: tanpa data, tabnya cukup tanpa
  // lencana.
  const kyc = useQuery(api.kyc.kycSaya, argsPeminjam);
  // Produk yang dibuka admin. Tanpa data, formulir menampilkan semua jenis
  // (bawaan), lalu menyaring begitu konfigurasi tiba.
  const produkAktif = useQuery(api.system.getProdukAktif, {});
  const [loanDetailId, setLoanDetailId] = useState<Id<"loans"> | null>(null);
  const [ringkasanLengkap, setRingkasanLengkap] = useState(false);
  const [verifikasiTerbuka, setVerifikasiTerbuka] = useState(false);
  const loanDetail = (loans ?? []).find((loan) => loan._id === loanDetailId) ?? null;

  // Tab yang sedang dibuka. Parameter `?tab=…` (mis. dari pusat notifikasi)
  // diutamakan selama masih ada di URL, lalu pilihan pengguna mengambil alih,
  // jadi tautan notifikasi selalu membuka tab yang dimaksud, tanpa memaksa
  // pengguna tetap terkunci di tab itu setelah ia berpindah sendiri.
  const [parameter, setParameter] = useSearchParams();
  const tabDariUrl = tabDariParams(parameter);
  const [tabLokal, setTabLokal] = useState<string>(() => tabDariUrl ?? "pinjaman");
  const activeTab = tabDariUrl ?? tabLokal;
  // Profil dan KYC berbagi satu halaman Akun. Nilai tab lama tetap diterima
  // agar tautan notifikasi `?tab=diri`/`?tab=kyc` membuka subbagian yang benar.
  const tabTampil = activeTab === "diri" || activeTab === "kyc" ? "akun" : activeTab;
  const [bagianAkun, setBagianAkun] = useState<"diri" | "kyc">(
    activeTab === "kyc" ? "kyc" : "diri",
  );
  const gantiTab = (value: string) => {
    setTabLokal(value);
    // Simpan tab di URL tanpa menumpuk riwayat: muat ulang dan tautan yang
    // dibagikan membuka tab yang sama. Parameter lain (mis. `lihatNasabah`
    // saat admin mempratinjau akun) tetap dibawa, bukan dibuang.
    if (typeof window !== "undefined") {
      const berikut = new URLSearchParams(parameter);
      if (berikut.get("tab") !== value) {
        berikut.set("tab", value);
        setParameter(berikut, { replace: true });
      }
    }
  };

  // Bila tab berpindah lewat tautan (mis. notifikasi KYC), subbagian Akun
  // mengikuti nilai tab lama itu; klik submenu sendiri tidak mengubahnya.
  useEffect(() => {
    if (activeTab === "diri" || activeTab === "kyc") setBagianAkun(activeTab);
  }, [activeTab]);

  const pilihBagianAkun = (bagian: "diri" | "kyc") => {
    setBagianAkun(bagian);
    if (activeTab !== "akun") gantiTab("akun");
  };

  // Judul tab peramban mengikuti menu yang dibuka, supaya beberapa tab
  // dashboard bisa dibedakan saat dibuka bersamaan.
  useEffect(() => {
    document.title = `${labelTujuan(activeTab)} — PINDAI`;
  }, [activeTab]);

  // Pindah menu berarti pindah halaman: gulir ke atas dan pindahkan fokus ke
  // isi, bukan membiarkan pembaca layar di tengah daftar tab yang lama.
  useEffect(() => {
    const konten = document.getElementById("konten");
    if (konten === null) return;
    konten.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);
  // Jenis pengajuan yang aktif dimiliki di sini, bukan di halaman form: CTA di
  // tab lain (dan pintasan menu layar sempit) harus bisa membuka halaman form
  // dengan jenisnya sudah terpilih, dan pilihan pemakai bertahan saat berpindah
  // tab.
  const [jenisPengajuan, setJenisPengajuan] = useState<JenisPengajuan>(
    JENIS_PENGAJUAN_AWAL,
  );
  // Jalur dipilih di Ringkasan atau dari tautan produk, lalu diteruskan ke
  // formulir. Disimpan di sini supaya "Ajukan akad syariah" bisa langsung
  // membuka formulir akad, bukan formulir pinjaman konvensional.
  const [jalurPengajuan, setJalurPengajuan] = useState<"konvensional" | "syariah">(
    parameter.get("jalur") === "syariah" ? "syariah" : "konvensional",
  );
  /** Tahap KYC yang dipilih dari menu sidebar; null = modul memilih sendiri. */
  const [tahapKyc, setTahapKyc] = useState<IdTahapKyc | null>(null);

  /** Buka halaman Form Pengajuan dengan jenis yang sudah dipilih. */
  const bukaPengajuan = (jenis: JenisPengajuan) => {
    setJenisPengajuan(jenis);
    setJalurPengajuan("konvensional");
    gantiTab("form");
  };
  const bukaSyariah = () => {
    setJalurPengajuan("syariah");
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

  // Admin yang membuka /dashboard tanpa target pratinjau tidak diberi dashboard
  // kosong: yang ia butuhkan adalah pintu masuk Mode Nasabah untuk memilih akun
  // uji. Pratinjau yang sedang berjalan tetap memakai alur di bawah karena saat
  // itu peramban sudah memegang sesi akun target.
  if (role === "admin" && adminPratinjauId === null) {
    return <ModeNasabahUji />;
  }

  if (adminPratinjauId !== null) {
    if (dataPratinjau === undefined || !auditPratinjauSiap) {
      return <RingkasanMemuat />;
    }
    if (dataPratinjau === null) {
      return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
          <p className="text-sm text-muted-foreground">Nasabah tidak ditemukan atau pratinjau tidak diizinkan.</p>
          <Button className="mt-4 w-fit" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 size-4" /> Kembali ke panel admin
          </Button>
        </main>
      );
    }
    return (
      <div className="bg-ambient-glass min-h-screen px-4 py-6 text-slate-900 sm:px-6">
        <main className="mx-auto max-w-5xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Pratinjau Super Admin · baca saja</p>
              <h1 className="mt-1 text-xl font-semibold">Dashboard {dataPratinjau.nama}</h1>
              <p className="mt-1 text-sm text-amber-950/80">Data nasabah ditampilkan untuk pemeriksaan. Tidak ada tindakan atas nama nasabah di sini.</p>
            </div>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 size-4" /> Kembali ke panel admin
            </Button>
          </div>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Semua pengajuan", dataPratinjau.jumlahPengajuan],
              ["Pinjaman aktif", dataPratinjau.pinjamanAktif],
              ["Menunggu tinjauan", dataPratinjau.pinjamanMenunggu],
              ["Lunas", dataPratinjau.pinjamanLunas],
            ].map(([label, jumlah]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{jumlah}</p>
              </div>
            ))}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold">Status akun</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Email</dt><dd>{dataPratinjau.email ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Kode nasabah</dt><dd>{dataPratinjau.kodePeminjam ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">KYC</dt><dd>{dataPratinjau.kycStatus}</dd></div>
              <div><dt className="text-muted-foreground">Data diri</dt><dd>{dataPratinjau.profilAda ? "Tersimpan" : "Belum diisi"}</dd></div>
              <div><dt className="text-muted-foreground">Ditolak</dt><dd>{dataPratinjau.pinjamanDitolak}</dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold">Pengajuan terbaru</h2>
            {dataPratinjau.pengajuanTerbaru.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Belum ada pengajuan.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {dataPratinjau.pengajuanTerbaru.map((loan) => (
                  <li key={loan.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>{loan.nomorReferensi} · {formatRupiah(loan.pokokPinjaman)}</span>
                    <span className="text-muted-foreground">{loan.status} · {loan.tenorBulan === null ? `${loan.tenorHari} hari` : `${loan.tenorBulan} bulan`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (isAnonymous) {
    return (
      <div className="bg-ambient-glass flex min-h-screen flex-col overflow-x-clip text-slate-900">
        <SkipLink />
        <DashboardHeader />
        <main
          id="konten"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-12 sm:px-6"
        >
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Mode tamu · baca saja</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Kenali PINDAI sebelum membuat akun.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              Sebagai tamu, Anda dapat membaca informasi umum. Setelah masuk dengan email atau nomor WhatsApp, Anda dapat mengelola data akun dan catatan pengajuan di PINDAI; perpindahan dana ditangani di luar aplikasi.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold">Pinjaman harian</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ilustrasi: biaya admin 2% (biaya platform dihapus) dan bunga flat 26–40% sesuai nominal serta tenor. Angka ini bukan pencairan atau tagihan; status lunas hanya perubahan catatan internal.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold">Pinjaman bulanan</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ilustrasi: biaya 2% dipotong di muka, biaya admin cicilan 2% dari nominal cicilan pada setiap pembayaran bulanan, dan bunga flat dari pokok penuh mengikuti tarif akun (bawaan 30%/8%/12%/10%/8% per bulan untuk tenor 1/3/6/9/12 bulan). Jadwal dan status lunas hanya catatan internal; tidak ada pembayaran aktual.</p>
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

  // Lencana tagihan menempel di Cicilan — di situlah tagihan berikutnya dan
  // tombol bayar berada. Bila jadwal angsuran belum ada (data lama), Ringkasan
  // tetap memakai pengingat tingkat pinjaman supaya tidak ada tagihan yang
  // hilang dari layar.
  const adaJadwalAngsuran = (angsuran?.ringkasan.jumlah ?? 0) > 0;
  if (adaJadwalAngsuran && angsuran !== undefined) {
    const r = angsuran.ringkasan;
    if (r.terlambat > 0) tabBadges.cicilan = { count: r.terlambat, tone: "danger" };
    else if (r.jatuhTempoHariIni > 0)
      tabBadges.cicilan = { count: r.jatuhTempoHariIni, tone: "warning" };
    else if (r.berikutnya?.tampilan === "segera")
      tabBadges.cicilan = { count: r.berikutnya.sisaHari, tone: "warning" };
  } else {
    if (tagihanTerlambat > 0) tabBadges.ringkasan = { count: tagihanTerlambat, tone: "danger" };
    else if (tagihanDekat > 0) tabBadges.ringkasan = { count: tagihanDekat, tone: "warning" };
  }
  // Hanya status yang MENUNGGU TINDAKAN NASABAH yang diberi lencana, VERIFIED
  // dan PENDING_REVIEW bukan pekerjaan pengguna.
  if (
    kyc !== undefined &&
    (kyc.status === "NEEDS_CORRECTION" ||
      kyc.status === "REJECTED" ||
      kyc.status === "REVERIFICATION_REQUIRED")
  ) {
    tabBadges.akun = { count: 1, tone: kyc.status === "REJECTED" ? "danger" : "warning" };
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
        <SkipLink />
        {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Bar atas ===== */}
      <DashboardHeader />

      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 pb-24 sm:px-6 sm:py-8 sm:pb-24 lg:pb-8"
      >
        <Tabs
          value={tabTampil}
          onValueChange={gantiTab}
          className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8"
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
                {/* Pengingat tingkat pinjaman hanya dipakai bila jadwal angsuran
                    belum ada. Untuk pinjaman bulanan, tanggal akhir tenor bukan
                    tagihan berikutnya — halaman Cicilan yang memegang angka itu. */}
                {dueReminder !== null && !adaJadwalAngsuran && (
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
                  {/* Banner gambar dari admin tampil lebih dulu bila ada;
                      kartu promo teks/bunga tetap satu-satunya banner angka,
                      supaya tagihan terdekat tidak terdorong jauh ke bawah. */}
                  {role === "dana" ? null : (
                    <>
                      <BannerPromoGambar
                        penempatan="dashboard"
                        className="mt-0 mb-4 max-w-none px-0 sm:px-0"
                      />
                      <PromoDashboard
                        onAjukan={() => bukaPengajuan("pinjaman")}
                        className="mb-4"
                      />
                    </>
                  )}
                  {/* Tagihan angsuran terdekat langsung di Ringkasan. Halaman
                      Cicilan tetap memegang dialog pembayaran; kartu ini hanya
                      memilih tagihan paling awal dari data server yang sama. */}
                  {angsuran !== undefined && (
                    <div className="mb-4">
                      <TagihanBerikutnyaRingkas
                        data={angsuran}
                        onBukaCicilan={() => gantiTab("cicilan")}
                      />
                    </div>
                  )}
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
                  {/* Lapis ketiga: informasi pendukung. Disembunyikan sampai
                      diminta agar kewajiban dan tiga angka pokok tampil dulu. */}
                  <div className="mt-4 flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={ringkasanLengkap}
                      onClick={() => setRingkasanLengkap((sebelumnya) => !sebelumnya)}
                      className="gap-1.5 text-xs text-slate-600"
                    >
                      <ChevronDown
                        className={
                          ringkasanLengkap
                            ? "size-4 rotate-180 transition-transform"
                            : "size-4 transition-transform"
                        }
                        aria-hidden="true"
                      />
                      {ringkasanLengkap
                        ? "Sembunyikan bagian lain"
                        : "Lihat plafon, referral, dan doorprize"}
                    </Button>
                  </div>
                  {ringkasanLengkap && (
                    <div className="mt-4 space-y-4">
                      <RiwayatProgresPlafon />
                      {role !== "dana" && <KartuReferral />}
                      <DoorprizeWidget peran="peminjam" />
                    </div>
                  )}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="w-full gap-2 bg-emerald-800 text-white hover:bg-emerald-900 sm:w-auto"
                      onClick={() => bukaPengajuan("pinjaman")}
                    >
                      <FilePlus2 className="size-4" aria-hidden />
                      Ajukan Pinjaman
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 border-amber-700/40 text-amber-900 hover:bg-amber-50 sm:w-auto"
                      onClick={bukaSyariah}
                    >
                      <HandCoins className="size-4" aria-hidden />
                      Ajukan akad syariah
                    </Button>
                  </div>
                </TabsContent>

                {/* ===== TAB 2: CATATAN PINJAMAN =====
                    Daftar semua pinjaman dengan saringan status; rincian satu
                    pinjaman dibuka lewat dialog, bukan kartu kedua di layar. */}
                <TabsContent value="cicilan" className="mt-6 animate-masuk">
                  <AngsuranSection />
                </TabsContent>

                <TabsContent value="pinjaman" className="mt-6 animate-masuk">
                  <CatatanPinjamanSection loans={loans ?? []} onOpenLoan={setLoanDetailId} />
                  {/* Pengajuan akad syariah punya catatannya sendiri: bukan
                      pinjaman konvensional, jadi tidak dicampur ke daftar di atas. */}
                  <section className="mt-8" aria-labelledby="judul-catatan-syariah">
                    <h2
                      id="judul-catatan-syariah"
                      className="text-base font-semibold text-navy"
                    >
                      Pengajuan akad syariah
                    </h2>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                      Murabahah dan Rahn yang Anda ajukan, beserta keputusan
                      petugas dan alasan penolakan bila ada.
                    </p>
                    <DaftarPengajuanSyariah
                      className="mt-3"
                      onBukaForm={bukaSyariah}
                    />
                  </section>
                </TabsContent>

                {/* ===== TAB 4: FORM PENGAJUAN, satu halaman, tiga jenis =====
                    Peminjam memilih pinjaman / gadai / kredit barang lewat menu
                    dropdown; hanya formulir jenis itu yang dirender. */}
                <TabsContent value="form" className="mt-8 min-w-0 animate-masuk">
                  {/*
                   * Limit + voucher duduk tepat di atas formulir: di sinilah
                   * angkanya dipakai. Kartu batas pinjaman di tab Ringkasan
                   * tetap satu angka plafon tanpa voucher, jadi tidak ada dua
                   * kartu yang menyebut limit dengan cara berbeda.
                   */}
                  <PromoBungaAktif className="mb-4" />
                  <KartuLimitVoucher className="mb-4" />
                  <FormPengajuanSection
                    jenis={jenisPengajuan}
                    onUbahJenis={setJenisPengajuan}
                    onBukaKyc={() => gantiTab("kyc")}
                    jalurAwal={jalurPengajuan}
                    produkAktif={produkAktif}
                  />
                </TabsContent>

                {/* ===== TAB: AKUN, profil & rekening + verifikasi KYC =====
                    Dua halaman yang dulu terpisah digabung karena menjawab
                    pertanyaan yang sama. Deep link `?tab=diri` dan `?tab=kyc`
                    tetap membuka subbagian yang benar. */}
                <TabsContent value="akun" className="mt-8 min-w-0 animate-masuk">
                  <div
                    role="group"
                    aria-label="Bagian akun"
                    className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1"
                  >
                    {(
                      [
                        { value: "diri", label: "Profil & Rekening" },
                        { value: "kyc", label: "Verifikasi KYC" },
                      ] as const
                    ).map((bagian) => (
                      <button
                        key={bagian.value}
                        type="button"
                        aria-pressed={bagianAkun === bagian.value}
                        onClick={() => pilihBagianAkun(bagian.value)}
                        className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2 ${
                          bagianAkun === bagian.value
                            ? "bg-white text-emerald-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {bagian.label}
                      </button>
                    ))}
                  </div>

                  <div className={bagianAkun === "kyc" ? "mt-6 max-w-3xl" : "mt-6"}>
                    {bagianAkun === "diri" ? (
                      <DataDiriSection />
                    ) : (
                      /* Terpisah dari formulir pengajuan: menyimpan KYC tidak
                         membuat catatan pinjaman apa pun, dan status VERIFIED
                         bukan persetujuan pinjaman. Batas 48rem: sejak navigasi
                         tahap pindah ke sidebar, kolom isi KYC jadi lebih lebar
                         daripada formulirnya. */
                      <KycSection tahapPilihan={tahapKyc} onPilihTahap={setTahapKyc} />
                    )}
                  </div>
                </TabsContent>

              </>
            )}
          </FadeIn>
        </Tabs>
      </main>

        <LoanDetailDialog
          loanId={loanDetailId}
          onClose={() => { setLoanDetailId(null); setVerifikasiTerbuka(false); }}
          onMintaVerifikasi={() => setVerifikasiTerbuka(true)}
        />
        {loanDetailId !== null && (
          <PersetujuanVerifikasiPembayaran
            terbuka={verifikasiTerbuka}
            loanId={loanDetailId}
            nomorReferensi={loanDetail?.nomorReferensi ?? dueReminder?.nomorReferensi ?? "pinjaman"}
            onTutup={() => setVerifikasiTerbuka(false)}
          />
        )}

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
