import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Activity,
  BellRing,
  ClipboardList,
  Database,
  Gavel,
  LayoutDashboard,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Power,
  Send,
  SlidersHorizontal,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  PanelsTopLeft,
  Smartphone,
  Wallet,
} from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { AksesPenyediaDanaPanel } from "@/components/admin/AksesPenyediaDanaPanel";
import { AnnouncementCms } from "@/components/admin/AnnouncementCms";
import { AplikasiAndroidPanel } from "@/components/admin/AplikasiAndroidPanel";
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
import { PlafonPanel } from "@/components/admin/PlafonPanel";
import { WhatsAppPanel } from "@/components/admin/WhatsAppPanel";
import { WebsiteTemplatePanel } from "@/components/admin/WebsiteTemplatePanel";
import {
  LencanaTab,
  type AdminOverviewData,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SkeletonKartu } from "@/components/ui/loading";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { RingkasanAnalitik } from "@/components/admin/RingkasanAnalitik";
import {
  hitungMenunggu,
  jumlahPerhatianLokasi,
  NILAI_MODUL_ADMIN,
  ringkasGrup,
  type BobotGrup,
  type NilaiModulAdmin,
} from "@/lib/admin-queue";

import { MejaKerja } from "./meja-kerja";
import { LoanQueueSection, PawnQueueSection } from "./queue-views";
import { AdminStats, type AdminStatsData, type ProdukAdmin } from "./admin-shell";

type TabIcon = typeof ClipboardList;

/** Satu menu operasional: nilai tab, label, penjelasan singkat, lencana, ikon. */
type AdminTabItem = {
  value: NilaiModulAdmin;
  label: string;
  /** Penjelasan satu baris — muncul saat tab aktif agar tim tahu isinya. */
  hint: string;
  badge: string | null;
  /**
   * Bobot lencana untuk ringkasan grup. Hanya `"menunggu"` yang dijumlahkan
   * saat grup tertutup; lencana informasi (mis. pinjaman yang sudah disetujui)
   * tidak boleh membuat grup tampak penuh pekerjaan.
   */
  hitung: BobotGrup;
  Icon: TabIcon;
};

/** Kelompok menu agar daftar panjang tidak membingungkan. */
type AdminTabGroup = {
  judul: string;
  items: AdminTabItem[];
};

/** Kelas bersama tombol menu di sidebar (bagian yang tidak berubah saat aktif). */
const KELAS_ITEM =
  "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-medium shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:min-h-10 lg:text-sm";
const KELAS_ITEM_IDLE = "text-navy hover:bg-slate-50";
const KELAS_ITEM_AKTIF = "gradient-primary text-white";

/**
 * Sidebar bisa mengecil jadi bilah ikon (~64px).
 *
 * Alasannya ruang: halaman kerja yang paling padat (verifikasi KYC) butuh lebar
 * untuk buktinya, dan 192px sidebar yang tidak sedang dibaca adalah lebar yang
 * hilang. Pilihan petugas disimpan di localStorage; TANPA pilihan tersimpan,
 * sidebar mengecil sendiri di layar sampai 1440px supaya di laptop kerja panel
 * ini langsung lega. Menekan tombolnya menimpa bawaan itu secara permanen.
 */
const KUERI_SIDEBAR_OTOMATIS = "(max-width: 1440px)";
const KUNCI_SIDEBAR_ADMIN = "pindai.admin.sidebar-ikon";

/** Pilihan sidebar yang tersimpan, atau `null` bila petugas belum pernah memilih. */
export function bacaPilihanSidebar(): boolean | null {
  try {
    const nilai = window.localStorage.getItem(KUNCI_SIDEBAR_ADMIN);
    return nilai === null ? null : nilai === "1";
  } catch {
    // localStorage bisa ditolak (mode privat); tanpa pilihan, bawaan layarlah
    // yang berlaku. Ini bukan galat yang perlu menghentikan panel.
    return null;
  }
}

// `LencanaTab` pindah ke `@/components/admin/admin-shared` agar chip modul dan
// bilah bawah di layar kecil memakai lencana yang sama persis.
// `ringkasGrup` kini tinggal di `@/lib/admin-queue` (T2): hanya lencana yang
// benar-benar menunggu tindakan yang dijumlahkan, dan logikanya diuji tanpa React.

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
}: {
  /**
   * Kepala panel (judul/breadcrumb, notifikasi, status sistem, menu profil).
   * Dipanggil dengan label modul yang sedang aktif supaya breadcrumb-nya selalu
   * menunjuk halaman yang benar — sumber labelnya tetap di komponen ini.
   *
   * Ia duduk di KOLOM KONTEN kanan, bukan di atas sidebar.
   */
  header?: (judul: string) => ReactNode;
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
}) {
  // Default "Hari Ini": ini meja kerja, bukan satu antrean. Mendarat di
  // ringkasan dulu berarti admin melihat apa yang menunggu sebelum memilih modul.
  const [activeTab, setActiveTab] = useState<NilaiModulAdmin>("hari-ini");

  // Sidebar: bawaan mengikuti lebar layar, dan pilihan manual petugas (bila ada)
  // selalu menang. `null` = belum pernah memilih.
  const layarSempit = useMediaQuery(KUERI_SIDEBAR_OTOMATIS);
  const [pilihanSidebar, setPilihanSidebar] = useState<boolean | null>(() => bacaPilihanSidebar());
  const sidebarIkon = pilihanSidebar ?? layarSempit;

  const ubahSidebar = (ikon: boolean) => {
    setPilihanSidebar(ikon);
    try {
      window.localStorage.setItem(KUNCI_SIDEBAR_ADMIN, ikon ? "1" : "0");
    } catch {
      // Gagal menyimpan pilihan bukan alasan menggagalkan tindakan: sidebar tetap
      // berubah untuk sesi ini, hanya bawaannya yang tidak ikut berubah.
    }
  };

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
          label: "Pengajuan Kredit Barang",
          hint: "Tinjau pengajuan kredit barang, atau catat pengajuan manual atas nama nasabah.",
          badge: `${hitungMenunggu(overview.kredit, "kredit")}`,
          hitung: "menunggu",
          Icon: ShoppingBag,
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
          label: "Pinjaman siap disalurkan",
          hint: "Pinjaman yang keputusannya sudah tercatat — menunggu dana ditandai tersalurkan (status Ditinjau).",
          badge: stats ? `${stats.pinjamanDisetujui}` : null,
          // R3: keputusan yang sudah tercatat BUKAN pekerjaan tertunda — tandai
          // "info" supaya tidak ikut dijumlahkan pada ringkasan grup tertutup.
          hitung: "info",
          Icon: Wallet,
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
          Icon: Wallet,
        },
      ],
    },
    {
      judul: "Pemantauan",
      items: [
        {
          value: "lokasi",
          label: "Peta lokasi nasabah",
          // Angka "perhatian lokasi" digabung dari empat sebab (koordinat
          // dicurigai, lokasi ditandai, peringatan belum diakui, pinjaman tanpa
          // titik perangkat). Satu angka gabungan di samping menu tidak bisa
          // dibaca sebagai antrean kerja, jadi lencananya DIHAPUS: cacahannya
          // ada di kartu "Perlu tindakan" di halaman Ringkasan, yang menyebut
          // sebabnya satu per satu.
          hint: "Peta titik lokasi terakhir yang dilaporkan perangkat peminjam. Jumlah titik yang perlu ditinjau ada di Ringkasan.",
          badge: null,
          hitung: "tidak",
          Icon: MapIcon,
        },
        {
          value: "dpd",
          label: "Jatuh Tempo",
          hint: "Pinjaman yang melewati jatuh tempo pelunasan.",
          badge: stats ? `${stats.pinjamanTerlambat}` : null,
          hitung: "menunggu",
          Icon: BellRing,
        },
        {
          value: "lelang",
          label: "Kalkulator Lelang Jaminan",
          hint: "Kalkulator nilai lelang untuk barang jaminan.",
          badge: null,
          hitung: "tidak",
          Icon: Gavel,
        },
        {
          value: "bi",
          label: "Catatan Internal & Kesehatan Sistem",
          hint: "Metrik bisnis siap dihitung, keseimbangan catatan internal, dan sinyal kesehatan sistem.",
          badge: null,
          hitung: "tidak",
          Icon: Activity,
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
          value: "pengumuman",
          label: "Banner & Pengumuman Sistem",
          hint: "Terbitkan pengumuman untuk pengguna aplikasi.",
          badge: null,
          hitung: "tidak",
          Icon: MessageSquare,
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
          label: "Pengaturan Parameter Bisnis (Bunga/Limit/Biaya)",
          hint: "Bunga, potongan admin atas uang yang kembali, limit/biaya, dan Mode Pemeliharaan sistem.",
          badge: null,
          hitung: "tidak",
          Icon: Settings2,
        },
        {
          value: "backup",
          label: "Backup & Snapshot Database",
          hint: "Cadangan data dan pemulihan sistem.",
          badge: null,
          hitung: "tidak",
          Icon: Database,
        },
      ],
    },
    {
      judul: "Keamanan & audit",
      items: [
        {
          value: "audit",
          label: "Audit Trail (Timeline Log)",
          hint: "Jejak seluruh tindakan admin dalam bentuk timeline berwarna.",
          badge: null,
          hitung: "tidak",
          Icon: Lock,
        },
        {
          value: "loglogin",
          label: "Session & Keamanan Login",
          hint: "Riwayat login, perangkat sesi, dan status verifikasi TOTP.",
          badge: null,
          hitung: "tidak",
          Icon: ShieldCheck,
        },
        {
          value: "killswitch",
          label: "Kill Switch Darurat",
          hint: "Blokir seluruh pengajuan baru — eksekusi wajib mengetik NONAKTIFKAN dan mengisi alasan.",
          badge: null,
          hitung: "tidak",
          Icon: Power,
        },
      ],
    },
  ];

  /**
   * Accordion sidebar bersifat TUNGGAL: satu grup terbuka pada satu waktu, jadi
   * sidebar tidak pernah menumpuk semua daftar sekaligus dan scroll-nya tetap
   * satu (sidebar sendiri).
   */
  const [grupTerbuka, setGrupTerbuka] = useState<string>(menu[0].judul);

  /** Pindah menu sekaligus pastikan grupnya terbuka, agar item aktif selalu
   *  terlihat di sidebar (mis. setelah memilih menu dari bilah bawah di ponsel). */
  const pilihMenu = (value: NilaiModulAdmin) => {
    setActiveTab(value);
    const grup = menu.find((g) => g.items.some((item) => item.value === value));
    if (grup) setGrupTerbuka(grup.judul);
  };

  /**
   * R5 — roving tabindex: panah kanan/bawah ke menu berikutnya, panah kiri/atas
   * ke sebelumnya, plus Home/End di kelompok yang sama. Fokus lalu dipindah ke
   * tombol tujuan supaya perpindahan keyboard terasa nyata.
   *
   * Satu handler biasa yang dipakai tiap tombol — bukan hook atau `useRef` per
   * item, karena memanggil hook di dalam `.map()` melanggar aturan hooks.
   */
  const tanganiTombol = (
    e: ReactKeyboardEvent<HTMLButtonElement>,
    grup: AdminTabGroup,
    value: NilaiModulAdmin,
  ) => {
    const daftar = grup.items.map((i) => i.value);
    const sekarang = daftar.indexOf(value);
    if (sekarang === -1) return;

    let selanjutnya: NilaiModulAdmin | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      selanjutnya = daftar[(sekarang + 1) % daftar.length] ?? null;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      selanjutnya = daftar[(sekarang - 1 + daftar.length) % daftar.length] ?? null;
    } else if (e.key === "Home") {
      selanjutnya = daftar[0] ?? null;
    } else if (e.key === "End") {
      selanjutnya = daftar[daftar.length - 1] ?? null;
    }
    if (selanjutnya === null || selanjutnya === value) return;

    e.preventDefault();
    pilihMenu(selanjutnya);
    document.getElementById(`tab-${selanjutnya}`)?.focus();
  };

  const semuaItem = menu.flatMap((g) => g.items);
  const aktif = semuaItem.find((i) => i.value === activeTab) ?? semuaItem[0];

  /** Satu modul sebagai bilah ikon (dipakai saat sidebar mengecil). */
  const ikonModul = ({ value, label, badge, Icon }: AdminTabItem) => {
    const iniAktif = value === activeTab;
    return (
      <TooltipProvider key={value} delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              id={`tab-ikon-${value}`}
              onClick={() => pilihMenu(value)}
              aria-current={iniAktif ? "page" : undefined}
              aria-controls={`panel-${value}`}
              aria-label={label}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                iniAktif ? KELAS_ITEM_AKTIF : KELAS_ITEM_IDLE,
              )}
            >
              <Icon className="size-4 shrink-0" />
              {badge !== null && badge !== "0" && (
                <span
                  className={cn(
                    "absolute -right-0.5 -top-0.5 rounded-full px-1 text-[9px] font-semibold tabular-nums",
                    iniAktif ? "bg-white text-navy" : "bg-amber-100 text-amber-900",
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-[11px]">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

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
    kyc: <KycPanel />,
    alokasi: <LoanAllocationQueueTab onOpen={onOpenLoan} />,
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
    pengumuman: <AnnouncementCms />,
    whatsapp: <WhatsAppPanel />,
    config: <SystemConfigPanel />,
    template: <WebsiteTemplatePanel />,
    aplikasi: <AplikasiAndroidPanel />,
    loglogin: <LoginSecurityPanel onOpenSetup={onOpenSetup} />,
    killswitch: <KillSwitchPanel />,
    bi: <PanelBiKesehatan />,
    audit: <AuditTrailPanel />,
    backup: <BackupPanel />,
  };

  return (
    <div className={cn("min-h-screen bg-slate-50", sidebarIkon ? "lg:pl-16" : "lg:pl-64")}>
      {/* Desktop: sidebar TETAP (fixed) setinggi layar — 256px, atau 64px dalam
          mode ikon — dengan satu area gulir: dirinya sendiri. Header, KPI, dan
          isi modul duduk di kolom kanan, jadi tidak ada baris statistik yang
          menempel di atas sidebar. */}
      <nav
        aria-label="Navigasi panel admin"
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-slate-200 lg:bg-white lg:py-4",
          sidebarIkon ? "lg:w-16 lg:px-2" : "lg:w-64 lg:px-3",
        )}
      >
        {!sidebarIkon && (
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Panel admin
          </p>
        )}

        {sidebarIkon ? (
          /* Mode ikon: daftar rata tanpa accordion. Judul grup tidak muat, jadi
             setiap modul membawa nama lengkapnya lewat tooltip + aria-label. */
          <div className="flex flex-col items-center">
            {menu.map((grup, indeks) => (
              <div
                key={grup.judul}
                className={cn(
                  "flex flex-col items-center gap-0.5",
                  indeks > 0 && "mt-1.5 w-full border-t border-slate-100 pt-1.5",
                )}
              >
                {grup.items.map(ikonModul)}
              </div>
            ))}
          </div>
        ) : (
          /* Accordion TUNGGAL: satu grup terbuka pada satu waktu. */
          <Accordion
            type="single"
            collapsible
            value={grupTerbuka}
            onValueChange={(nilai) => setGrupTerbuka(nilai === "" ? menu[0].judul : nilai)}
            className="flex flex-col"
          >
            {menu.map((grup) => (
              <AccordionItem
                key={grup.judul}
                value={grup.judul}
                // Buka/tutup hanya lewat klik pada judul (AccordionTrigger) —
                // tanpa perilaku hover, supaya kursor yang sekadar lewat tidak
                // ikut membuka atau menutup grup saat admin menelusuri menu.
                className="border-b border-slate-100 last:border-b-0"
              >
                <AccordionTrigger className="items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-navy hover:no-underline data-[state=open]:text-navy [&>svg]:size-3.5">
                  <span className="flex-1 text-left">{grup.judul}</span>
                  <LencanaTab badge={ringkasGrup(grup.items)} />
                </AccordionTrigger>
                <AccordionContent className="pb-1.5">
                  <div className="flex flex-col gap-1">
                    {grup.items.map(({ value, label, hint, badge, Icon }) => {
                      const iniAktif = value === activeTab;
                      return (
                        <button
                          key={value}
                          type="button"
                          id={`tab-${value}`}
                          onClick={() => pilihMenu(value)}
                          onKeyDown={(e) => tanganiTombol(e, grup, value)}
                          title={hint}
                          aria-current={iniAktif ? "page" : undefined}
                          // R4: tombol menu dan panelnya kini saling menunjuk, jadi
                          // pembaca layar tahu tombol mana yang mengendalikan isi mana.
                          aria-controls={`panel-${value}`}
                          // R5: hanya menu aktif yang masuk urutan Tab; sisanya
                          // dijangkau lewat tombol panah (roving tabindex).
                          tabIndex={iniAktif ? 0 : -1}
                          className={`${KELAS_ITEM} ${iniAktif ? KELAS_ITEM_AKTIF : KELAS_ITEM_IDLE}`}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 whitespace-normal break-words text-left leading-5">
                            {label}
                          </span>
                          <LencanaTab badge={badge} />
                        </button>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        <button
          type="button"
          onClick={() => ubahSidebar(!sidebarIkon)}
          aria-pressed={sidebarIkon}
          aria-label={
            sidebarIkon
              ? "Lebarkan sidebar panel admin"
              : "Kecilkan sidebar panel admin menjadi ikon"
          }
          title={sidebarIkon ? "Lebarkan sidebar" : "Kecilkan sidebar"}
          className={cn(
            "mt-3 flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            sidebarIkon ? "w-10" : "w-full px-3",
          )}
        >
          {sidebarIkon ? (
            <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" aria-hidden />
              Kecilkan menjadi ikon
            </>
          )}
        </button>
      </nav>

      {/* Kepala panel duduk di kolom kanan, bukan di atas sidebar. */}
      {header(aktif?.label ?? "Ringkasan")}

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
            aria-labelledby={aktif ? (sidebarIkon ? `tab-ikon-${aktif.value}` : `tab-${aktif.value}`) : undefined}
            className="min-w-0 animate-masuk"
          >
            {panel[activeTab]}
          </div>
        </div>
      </main>
    </div>
  );
}
