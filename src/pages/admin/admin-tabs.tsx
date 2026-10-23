import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Banknote,
  BellRing,
  BookOpen,
  ClipboardList,
  Database,
  FileText,
  Gavel,
  KeyRound,
  LayoutDashboard,
  Lock,
  Landmark,
  Map as MapIcon,
  Megaphone,
  MessageSquare,
  Newspaper,
  HandCoins,
  Package,
  Power,
  Send,
  SlidersHorizontal,
  Settings2,
  Trophy,
  ShieldCheck,
  ShoppingBag,
  PanelsTopLeft,
  Smartphone,
  Users,
} from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import {
  bacaSidebarTerbuka,
  KELAS_GESER_KONTEN,
  KUERI_LAYAR_SIDEBAR,
  pintasanSidebar,
  SidebarAdmin,
  simpanSidebarTerbuka,
  type GrupSidebar,
} from "@/components/admin/admin-sidebar";
import { AksesPenyediaDanaPanel } from "@/components/admin/AksesPenyediaDanaPanel";
import { AnnouncementCms } from "@/components/admin/AnnouncementCms";
import { AplikasiAndroidPanel } from "@/components/admin/AplikasiAndroidPanel";
import { KontenPendanaPanel } from "@/components/admin/KontenPendanaPanel";
import { LandingCmsPanel } from "@/components/admin/LandingCmsPanel";
import { AuditTrailPanel } from "@/components/admin/AuditTrailPanel";
import { BackupPanel } from "@/components/admin/BackupPanel";
import { LiveLocationMap } from "@/components/admin/LiveLocationMap";
import { VerifikasiLokasiPanel } from "@/components/admin/VerifikasiLokasiPanel";
import { KreditQueuePanel } from "@/components/admin/KreditQueuePanel";
import { KillSwitchPanel } from "@/components/admin/KillSwitchPanel";
import { KycPanel } from "@/components/admin/KycPanel";
import { LoginSecurityPanel } from "@/components/admin/LoginSecurityPanel";
import { DpdTab, LelangTab, LoanAllocationQueueTab } from "@/components/admin/OperationsTabs";
import { PanelBiKesehatan } from "@/components/admin/PanelBiKesehatan";
import { SystemConfigPanel } from "@/components/admin/SystemConfigPanel";
import { UndianPanel } from "@/components/admin/UndianPanel";
import { PlafonPanel } from "@/components/admin/PlafonPanel";
import { PromoPinjamanPanel } from "@/components/admin/PromoPinjamanPanel";
import { SyariahPanel } from "@/components/admin/SyariahPanel";
import { RekonsiliasiAngsuran } from "@/components/admin/RekonsiliasiAngsuran";
import { WhatsAppPanel } from "@/components/admin/WhatsAppPanel";
import { WebsiteTemplatePanel } from "@/components/admin/WebsiteTemplatePanel";
import {
  type AdminOverviewData,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { SkeletonKartu } from "@/components/ui/loading";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { RingkasanAnalitik } from "@/components/admin/RingkasanAnalitik";
import {
  hitungMenunggu,
  modulDariParameter,
  NILAI_MODUL_ADMIN,
  type NilaiModulAdmin,
} from "@/lib/admin-queue";
import { MejaKerja } from "./meja-kerja";
import { LoanQueueSection, PawnQueueSection } from "./queue-views";
import { PagePengembangan } from "./page-pengembangan";
import {
  AdminStats,
  type AdminStatsData,
  type KendaliMenuPonsel,
  type ProdukAdmin,
} from "./admin-shell";

/** Satu seksi menu beserta isinya — bentuknya dimiliki sidebar. */
type AdminTabGroup = GrupSidebar;



// `LencanaTab` tinggal di `@/components/admin/admin-shared` agar sidebar, chip
// modul, dan bilah bawah memakai lencana yang sama persis.
// `ringkasGrup` tinggal di `@/lib/admin-queue`: hanya lencana yang benar-benar
// menunggu tindakan yang dijumlahkan, dan logikanya diuji tanpa React.

/** Tab navigasi + seluruh konten tab panel admin. */
export function AdminTabs({
  header = () => null,
  overview,
  stats,
  menunggu = { pinjaman: 0, gadai: 0, kredit: 0 },
  onOpenLoan,
  onOpenPawn,
  onOpenSetup,
  kycMenunggu = null,
  angsuranMenunggu = null,
  syariahMenunggu = null,
}: {
  /**
   * Kepala panel (judul/breadcrumb, notifikasi, status sistem, menu profil).
   * Dipanggil dengan label modul yang sedang aktif supaya breadcrumb-nya selalu
   * menunjuk halaman yang benar — sumber labelnya tetap di komponen ini — plus
   * kendali laci menu, karena laci dipegang komponen ini sedangkan tombolnya
   * duduk di kepala panel.
   *
   * Ia duduk di KOLOM KONTEN kanan, bukan di atas sidebar.
   */
  header?: (judul: string, menuPonsel: KendaliMenuPonsel) => ReactNode;
  overview: AdminOverviewData;
  stats: AdminStatsData | undefined;
  /** Cacah pengajuan menunggu keputusan per produk — untuk KPI di Ringkasan. */
  menunggu?: Record<ProdukAdmin, number>;
  onOpenLoan: (l: LoanRow) => void;
  onOpenPawn: (p: PawnRow) => void;
  onOpenSetup: () => void;
  /**
   * Jumlah pengajuan KYC yang menunggu peninjauan, atau `null` bila belum
   * diketahui (masih dimuat). Dikirim sebagai prop — bukan di-query di sini —
   * supaya komponen ini tetap murni tampilan dan bisa dirender di luar
   * `ConvexProvider` (mis. skrip QA meja kerja).
   */
  kycMenunggu?: number | null;
  /** Jumlah bukti transfer angsuran yang belum dicocokkan. */
  angsuranMenunggu?: number | null;
  /** Jumlah pengajuan akad syariah yang menunggu keputusan. */
  syariahMenunggu?: number | null;
}) {
  // Default "Hari Ini": ini meja kerja, bukan satu antrean. Mendarat di
  // ringkasan dulu berarti admin melihat apa yang menunggu sebelum memilih modul.
  // `?tab=` membuka satu modul langsung (mis. `?tab=doorprize` untuk doorprize
  // triwulanan) tanpa menambah sub-path publik di samping rute admin tersembunyi.
  const [activeTab, setActiveTab] = useState<NilaiModulAdmin>(() =>
    typeof window === "undefined"
      ? "hari-ini"
      : modulDariParameter(new URLSearchParams(window.location.search).get("tab")),
  );

  // Sidebar: bawaan terbuka, dan pilihan petugas yang tersimpan selalu menang.
  // Laci ponsel sebaliknya — ia pintu yang dibuka dengan sengaja, bukan tempat
  // mendarat, jadi selalu mulai tertutup.
  const [sidebarTerbuka, setSidebarTerbuka] = useState<boolean>(() => bacaSidebarTerbuka());
  const [drawerTerbuka, setDrawerTerbuka] = useState(false);
  const layarLebar = useMediaQuery(KUERI_LAYAR_SIDEBAR);

  const ubahSidebar = useCallback((terbuka: boolean) => {
    setSidebarTerbuka(terbuka);
    simpanSidebarTerbuka(terbuka);
  }, []);

  // Ctrl+B (⌘B di Mac) membuka-tutup "menu": di layar lebar kolom sidebar,
  // di layar kecil laci — sesuai apa yang sedang tampak.
  useEffect(() => {
    const tangani = (e: KeyboardEvent) => {
      if (!pintasanSidebar(e)) return;
      // Jangan rebut pintasan saat petugas sedang mengetik di formulir.
      const target = e.target as HTMLElement | null;
      const sedangMengetik =
        target !== null &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");
      if (sedangMengetik) return;

      e.preventDefault();
      if (layarLebar) ubahSidebar(!sidebarTerbuka);
      else setDrawerTerbuka((sebelumnya) => !sebelumnya);
    };
    document.addEventListener("keydown", tangani);
    return () => document.removeEventListener("keydown", tangani);
  }, [layarLebar, sidebarTerbuka, ubahSidebar]);

  // Enam grup tetap: Operasional → Nasabah → Pemantauan → Konten → Sistem →
  // Keamanan & Audit. "Ringkasan" tetap di dalam Operasional supaya meja kerja
  // dan antrean yang ditanganinya tidak terpisah.
  const menu: AdminTabGroup[] = [
    {
      judul: "Operasional",
      items: [
        {
          value: "hari-ini",
          label: "Ringkasan",
          hint: "Pekerjaan yang perlu ditindak hari ini.",
          // Sengaja tanpa lencana: satu angka di sini akan mencampur beberapa
          // metrik berbeda (keputusan, keterlambatan, lokasi) dan justru
          // melebih-lebihkan — kesalahan yang sama seperti pada R3.
          badge: null,
          hitung: "tidak",
          Icon: LayoutDashboard,
        },
        {
          value: "pinjaman",
          label: "Pengajuan Pinjaman",
          hint: "Tinjau pengajuan pinjaman tunai, atau catat pengajuan yang diterima di luar aplikasi.",
          badge: `${hitungMenunggu(overview.loans, "pinjaman")}`,
          hitung: "menunggu",
          Icon: ClipboardList,
        },
        {
          value: "gadai",
          label: "Pengajuan Gadai",
          hint: "Tinjau pengajuan gadai dan nilai barang jaminan, atau catat pengajuan manual.",
          badge: `${hitungMenunggu(overview.pawns, "gadai")}`,
          hitung: "menunggu",
          Icon: Package,
        },
        {
          value: "kredit",
          label: "Pengajuan Kredit",
          hint: "Tinjau pengajuan kredit barang, atau catat pengajuan manual atas nama nasabah.",
          badge: `${hitungMenunggu(overview.kredit, "kredit")}`,
          hitung: "menunggu",
          Icon: ShoppingBag,
        },
        {
          value: "syariah",
          label: "Pengajuan Syariah",
          hint: "Tinjau pengajuan Murabahah dan Rahn; setujui angka akad atau tolak dengan alasan.",
          badge: syariahMenunggu === null ? null : `${syariahMenunggu}`,
          hitung: "menunggu",
          Icon: HandCoins,
        },
        {
          value: "kyc",
          label: "Verifikasi KYC",
          hint: "Tinjau verifikasi identitas (KTP, selfie, bukti penghasilan) dan putuskan: verifikasi, minta perbaikan, atau tolak.",
          badge: kycMenunggu === null ? null : `${kycMenunggu}`,
          hitung: "menunggu",
          Icon: ShieldCheck,
        },
        {
          value: "alokasi",
          label: "Siap disalurkan",
          hint: "Pinjaman yang keputusannya sudah tercatat, menunggu dana ditandai tersalurkan (status Ditinjau).",
          badge: stats ? `${stats.pinjamanDisetujui}` : null,
          // R3: keputusan yang sudah tercatat BUKAN pekerjaan tertunda — tandai
          // "info" supaya tidak ikut dijumlahkan pada ringkasan grup tertutup.
          hitung: "info",
          Icon: Banknote,
        },
        {
          value: "undian",
          label: "Doorprize & Antrean",
          hint: "Kelola hadiah doorprize triwulanan, undi pemenang akhir kuartal, dan cocokkan dana yang kembali ke pool auto-matching.",
          badge: null,
          hitung: "tidak",
          Icon: Trophy,
        },
        {
          value: "rekonsiliasi",
          label: "Rekonsiliasi Angsuran",
          hint: "Cocokkan bukti transfer ke angsuran, isi referensi mutasi bank, lalu tandai lunas.",
          badge: angsuranMenunggu === null ? null : `${angsuranMenunggu}`,
          hitung: "menunggu",
          Icon: Landmark,
        },
        {
          value: "plafon",
          label: "Plafon Nasabah",
          hint: "Kelola plafon, bunga efektif, dan skor risiko per nasabah.",
          badge: null,
          hitung: "tidak",
          Icon: SlidersHorizontal,
        },
        {
          value: "akses",
          label: "Nasabah & Pendana",
          hint: "Kelola hak akses dan posisi pendana, termasuk akses lihat saja.",
          badge: null,
          hitung: "tidak",
          Icon: Users,
        },
      ],
    },
    {
      judul: "Pemantauan",
      items: [
        {
          value: "lokasi",
          label: "Peta lokasi",
          // Angka "perhatian lokasi" digabung dari empat sebab (koordinat
          // dicurigai, lokasi ditandai, peringatan belum diakui, pinjaman tanpa
          // titik perangkat). Satu angka gabungan di samping menu tidak bisa
          // dibaca sebagai antrean kerja, jadi lencananya DIHAPUS: cacahannya
          // ada di kartu "Perlu tindakan" di halaman Ringkasan, yang menyebut
          // sebabnya satu per satu.
          hint: "Peta titik lokasi terakhir yang dilaporkan perangkat peminjam (nasabah). Jumlah titik yang perlu ditinjau ada di Ringkasan.",
          badge: null,
          hitung: "tidak",
          Icon: MapIcon,
        },
        {
          value: "dpd",
          label: "Jatuh Tempo",
          hint: "Pinjaman yang melewati jatuh tempo dan permohonan restrukturisasi yang menunggu keputusan.",
          badge: stats ? `${stats.pinjamanTerlambat}` : null,
          hitung: "menunggu",
          Icon: BellRing,
        },
        {
          value: "lelang",
          label: "Kalkulator Lelang",
          hint: "Kalkulator nilai lelang untuk barang jaminan.",
          badge: null,
          hitung: "tidak",
          Icon: Gavel,
        },
      ],
    },
    {
      judul: "Konten",
      items: [
        {
          value: "template",
          label: "Template Website",
          hint: "Teks dan tampilan halaman publik.",
          badge: null,
          hitung: "tidak",
          Icon: PanelsTopLeft,
        },
        {
          value: "landing",
          label: "Konten Beranda",
          hint: "Teks hero, tiga kartu layanan, panduan, dan footer halaman publik.",
          badge: null,
          hitung: "tidak",
          Icon: Newspaper,
        },
        {
          value: "pendana",
          label: "Halaman Pendana",
          hint: "Teks halaman /jadi-pendana dan berkas proposal PDF yang diunduh dari halaman itu.",
          badge: null,
          hitung: "tidak",
          Icon: FileText,
        },
        {
          value: "pengumuman",
          label: "Banner & Pengumuman",
          hint: "Terbitkan pengumuman sistem untuk pengguna aplikasi.",
          badge: null,
          hitung: "tidak",
          Icon: MessageSquare,
        },
        {
          value: "promo",
          label: "Promo Pinjaman",
          hint: "Atur teks kampanye pinjaman dan pilih tempat tampilnya: beranda, dashboard, /promo, atau form pengajuan.",
          badge: null,
          hitung: "tidak",
          Icon: Megaphone,
        },
        {
          value: "whatsapp",
          label: "WhatsApp",
          hint: "Template pesan dan status kanal WhatsApp.",
          badge: null,
          hitung: "tidak",
          Icon: Send,
        },
        {
          value: "aplikasi",
          label: "Aplikasi Android",
          hint: "Ganti splash screen, logo di dalam aplikasi, nama, dan warna tanpa build ulang.",
          badge: null,
          hitung: "tidak",
          Icon: Smartphone,
        },
      ],
    },
    {
      judul: "Sistem",
      items: [
        {
          value: "config",
          label: "Parameter Bisnis",
          hint: "Bunga, limit, biaya, potongan admin atas uang yang kembali, dan Mode Pemeliharaan sistem.",
          badge: null,
          hitung: "tidak",
          Icon: Settings2,
        },
        {
          value: "bi",
          label: "Kesehatan Sistem",
          hint: "Catatan internal, metrik bisnis, keseimbangan ledger, dan sinyal kesehatan sistem.",
          badge: null,
          hitung: "tidak",
          Icon: Activity,
        },
        {
          value: "backup",
          label: "Backup Database",
          hint: "Snapshot dan pemulihan database.",
          badge: null,
          hitung: "tidak",
          Icon: Database,
        },
        {
          value: "pengembangan",
          label: "Peta Sistem",
          hint: "Halaman, fitur, logika bisnis, dan alur kerja yang berjalan di PINDAI.",
          badge: null,
          hitung: "tidak",
          Icon: BookOpen,
        },
        {
          value: "audit",
          label: "Audit Trail",
          hint: "Timeline log seluruh tindakan admin.",
          badge: null,
          hitung: "tidak",
          Icon: Lock,
        },
        {
          value: "loglogin",
          label: "Keamanan Login",
          hint: "Riwayat sesi, perangkat, dan status verifikasi TOTP.",
          badge: null,
          hitung: "tidak",
          Icon: KeyRound,
        },
        {
          value: "killswitch",
          label: "Kill Switch",
          hint: "Darurat: blokir seluruh pengajuan baru. Eksekusi wajib mengetik NONAKTIFKAN dan mengisi alasan.",
          badge: null,
          hitung: "tidak",
          Icon: Power,
        },
      ],
    },
  ];

  /**
   * Pindah menu, lalu tutup laci ponsel: tujuannya sudah tercapai, jadi lapisan
   * gelapnya tidak perlu menghalangi isi yang baru terbuka.
   */
  const pilihMenu = (value: NilaiModulAdmin) => {
    setActiveTab(value);
    setDrawerTerbuka(false);
    // Simpan modul aktif di URL supaya muat ulang atau tautan yang dibagikan
    // membuka modul yang sama. `replaceState` tidak menambah entri riwayat.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("tab") !== value) {
        url.searchParams.set("tab", value);
        window.history.replaceState(window.history.state, "", url);
      }
    }
  };

  const semuaItem = menu.flatMap((g) => g.items);
  const aktif = semuaItem.find((i) => i.value === activeTab) ?? semuaItem[0];

  /** Isi setiap menu — satu entri per nilai tab. */
  // `Record<NilaiModulAdmin, ReactNode>` yang ekshaustif: menambah nilai modul
  // tanpa isinya langsung menjadi galat kompilasi — menutup R2 di akarnya.
  const panel: Record<NilaiModulAdmin, ReactNode> = {
    "hari-ini": (
      <div className="space-y-4">
        {/* Sapaan satu baris menggantikan banner gelap "Ringkasan sistem hari
            ini": tidak ada lagi permukaan emerald-950 di kepala halaman. */}
        <p className="text-sm leading-6 text-slate-600">
          Selamat bekerja. Berikut yang perlu ditindak hari ini, urut dari yang paling mendesak.
        </p>
        {/* Urutan tetap: (1) Perlu tindakan, (2) empat KPI seragam,
            (3) dua grafik. Yang menuntut tindakan selalu paling atas. */}
        <MejaKerja
          overview={overview}
          stats={stats}
          onBukaModul={pilihMenu}
          kycMenunggu={kycMenunggu}
        />
        {stats === undefined ? (
          <div role="status" aria-live="polite" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <span className="sr-only">Memuat statistik operasional…</span>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonKartu key={i} className="rounded-2xl p-4" />
            ))}
          </div>
        ) : (
          <AdminStats stats={stats} menunggu={menunggu} />
        )}
        {/* Grafik & peringatan risiko diletakkan setelah KPI: grafik jadi
            konteks, bukan hal pertama yang dibaca. */}
        <RingkasanAnalitik
          stats={stats}
          overview={overview}
          onBukaModul={(modul) => {
            // `modul` datang sebagai string dari `lib/analitikAdmin` (sengaja
            // bebas tipe UI). Di sini nilainya divalidasi ke daftar modul admin
            // sebelum dipakai, jadi nilai asing tidak pernah membuka tab fiktif.
            if ((NILAI_MODUL_ADMIN as readonly string[]).includes(modul)) {
              pilihMenu(modul as NilaiModulAdmin);
            }
          }}
        />
      </div>
    ),
    pinjaman: <LoanQueueSection loans={overview.loans} onOpen={onOpenLoan} />,
    gadai: <PawnQueueSection pawns={overview.pawns} onOpen={onOpenPawn} />,
    kredit: <KreditQueuePanel />,
    syariah: <SyariahPanel />,
    kyc: <KycPanel />,
    alokasi: <LoanAllocationQueueTab onOpen={onOpenLoan} />,
    undian: <UndianPanel />,
    rekonsiliasi: <RekonsiliasiAngsuran />,
    // Peta live + audit verifikasi dari tautan WhatsApp: dua sisi data lokasi
    // yang sama (titik dari `/cek-status` juga mengalir ke peta lewat jejak
    // lokasi), jadi sengaja satu modul — bukan tab tersendiri di sidebar.
    lokasi: (
      <div className="space-y-4">
        <LiveLocationMap />
        <VerifikasiLokasiPanel />
      </div>
    ),
    dpd: <DpdTab />,
    lelang: <LelangTab />,
    plafon: <PlafonPanel />,
    akses: <AksesPenyediaDanaPanel />,
    landing: <LandingCmsPanel />,
    pendana: <KontenPendanaPanel />,
    pengumuman: <AnnouncementCms />,
    promo: <PromoPinjamanPanel />,
    whatsapp: <WhatsAppPanel />,
    config: <SystemConfigPanel />,
    template: <WebsiteTemplatePanel />,
    aplikasi: <AplikasiAndroidPanel />,
    loglogin: <LoginSecurityPanel onOpenSetup={onOpenSetup} />,
    killswitch: <KillSwitchPanel />,
    bi: <PanelBiKesehatan />,
    audit: <AuditTrailPanel />,
    backup: <BackupPanel />,
    pengembangan: <PagePengembangan />,
  };

  return (
    <div
      className={cn(
        "kolom-admin min-h-screen bg-slate-50",
        sidebarTerbuka ? KELAS_GESER_KONTEN.terbuka : KELAS_GESER_KONTEN.tertutup,
      )}
    >
      {/* Sidebar: kolom tetap di layar lebar (240px / 72px), laci di layar kecil.
          Kepala panel, KPI, dan isi modul duduk di kolom kanan. */}
      <SidebarAdmin
        menu={menu}
        activeTab={activeTab}
        onPilih={pilihMenu}
        terbuka={sidebarTerbuka}
        onToggle={ubahSidebar}
        drawerTerbuka={drawerTerbuka}
        onUbahDrawer={setDrawerTerbuka}
      />

      {/* Kepala panel duduk di kolom kanan, bukan di atas sidebar. Kendali laci
          dioper supaya tombol menunya satu-satunya pintu menu di layar kecil. */}
      {header(aktif?.label ?? "Ringkasan", {
        terbuka: drawerTerbuka,
        onToggle: () => setDrawerTerbuka((sebelumnya) => !sebelumnya),
      })}

      {/* Layar kecil: bilah bawah + strip chip modul + sheet pencarian.
          Menggantikan `<select>` 17 opsi yang menyembunyikan isi tiap menu. */}
      <AdminNav menu={menu} activeTab={activeTab} onPilih={pilihMenu} />

      <main
        id="konten"
        tabIndex={-1}
        className={cn(
          "mx-auto w-full pb-24",
          // Verifikasi KYC mengatur tata letaknya sendiri: panelnya memakai tinggi
          // layar penuh dengan gulir internal, dan area buktinya butuh lebar.
          // Karena itu kolomnya dilebarkan dan paddingnya dirapatkan.
          aktif?.value === "kyc"
            ? "max-w-none px-2 py-2 sm:px-3 sm:py-3 lg:pb-3"
            : "max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:pb-8",
        )}
      >
        <div
          className={cn("min-w-0", aktif?.value === "kyc" ? "space-y-2" : "space-y-4 sm:space-y-5")}
        >
          {/* Kartu judul modul DIHILANGKAN pada Ringkasan dan pada Verifikasi KYC:
              label menu di sidebar sudah berbunyi sama, dan di KYC kartunya
              digantikan baris ringkas + cacah antrean di dalam panelnya. */}
          {aktif && aktif.value !== "hari-ini" && aktif.value !== "kyc" && (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                <aktif.Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{aktif.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{aktif.hint}</p>
              </div>
            </div>
          )}

          {/* Panel menunjuk balik ke tombolnya (`aria-labelledby`) sekaligus
              tetap punya `aria-label` sebagai cadangan. */}
          <div
            key={activeTab}
            id={`panel-${aktif?.value}`}
            role="region"
            aria-label={aktif?.label}
            // Hanya menunjuk tombol yang benar-benar terlihat: tombol laci saat
            // laci terbuka, tombol kolom tetap saat kolomnya dirender. Kalau
            // tidak ada keduanya, region ini tetap bernama lewat `aria-label`.
            aria-labelledby={
              aktif === undefined || (!drawerTerbuka && !layarLebar)
                ? undefined
                : drawerTerbuka
                  ? `laci-${aktif.value}`
                  : sidebarTerbuka
                    ? `tab-${aktif.value}`
                    : `tab-ikon-${aktif.value}`
            }
            className="min-w-0 animate-masuk"
          >
            {panel[activeTab]}
          </div>
        </div>
      </main>

      {/* Footer panel: identitas badan hukum + penafian. Dulu panel admin tidak
          menyebut entitas sama sekali, sehingga tangkapan layar meja kerja bisa
          dibaca sebagai produk tanpa pemilik. `pb-24` memberi ruang bilah menu
          bawah di ponsel. */}
      <footer className="mx-auto w-full max-w-7xl px-3 pb-24 pt-6 sm:px-6 lg:pb-8">
        <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <p className="shrink-0 font-medium text-slate-600">{HAK_CIPTA_PINDAI}</p>
          <p className="max-w-xl sm:text-right">{PENAFIAN_PINDAI}</p>
        </div>
      </footer>
    </div>
  );
}
