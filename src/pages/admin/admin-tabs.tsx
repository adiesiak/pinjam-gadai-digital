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
  Sparkles,
  MessageSquare,
  Package,
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
import { LandingTemplatePanel } from "@/components/admin/LandingTemplatePanel";
import { LiveLocationMap } from "@/components/admin/LiveLocationMap";
import { KreditQueuePanel } from "@/components/admin/KreditQueuePanel";
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
import {
  hitungMenunggu,
  jumlahPerhatianLokasi,
  ringkasGrup,
  type BobotGrup,
  type NilaiModulAdmin,
} from "@/lib/admin-queue";

import { MejaKerja } from "./meja-kerja";
import { LoanQueueSection, PawnQueueSection } from "./queue-views";
import { type AdminStatsData } from "./admin-shell";

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

// `LencanaTab` pindah ke `@/components/admin/admin-shared` agar chip modul dan
// bilah bawah di layar kecil memakai lencana yang sama persis.
// `ringkasGrup` kini tinggal di `@/lib/admin-queue` (T2): hanya lencana yang
// benar-benar menunggu tindakan yang dijumlahkan, dan logikanya diuji tanpa React.

/** Tab navigasi + seluruh konten tab panel admin. */
export function AdminTabs({
  overview,
  stats,
  onOpenLoan,
  onOpenPawn,
  onOpenSetup,
  kycMenunggu = null,
}: {
  overview: AdminOverviewData;
  stats: AdminStatsData | undefined;
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

  const menu: AdminTabGroup[] = [
    {
      judul: "Ringkasan",
      items: [
        {
          value: "hari-ini",
          label: "Hari Ini",
          hint: "Ringkasan pekerjaan yang perlu ditindak hari ini.",
          // Sengaja tanpa lencana: satu angka di sini akan mencampur empat
          // metrik berbeda (keputusan, keterlambatan, lokasi, ledger) dan justru
          // melebih-lebihkan — kesalahan yang sama seperti pada R3.
          badge: null,
          hitung: "tidak",
          Icon: LayoutDashboard,
        },
      ],
    },
    {
      judul: "Pengajuan & tindakan",
      items: [
        {
          value: "pinjaman",
          label: "Pinjaman",
          hint: "Tinjau pengajuan pinjaman tunai, atau catat pengajuan yang diterima di luar aplikasi.",
          badge: `${hitungMenunggu(overview.loans, "pinjaman")}`,
          hitung: "menunggu",
          Icon: ClipboardList,
        },
        {
          value: "gadai",
          label: "Gadai",
          hint: "Tinjau pengajuan gadai dan nilai barang jaminan, atau catat pengajuan manual.",
          badge: `${hitungMenunggu(overview.pawns, "gadai")}`,
          hitung: "menunggu",
          Icon: Package,
        },
        {
          value: "kredit",
          label: "Kredit Barang",
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
      ],
    },
    {
      judul: "Pemantauan",
      items: [
        {
          value: "lokasi",
          label: "Peta Live Location",
          hint: "Peta titik lokasi terakhir yang dilaporkan perangkat peminjam.",
          // Notifikasi lokasi: pola koordinat dicurigai, pola lokasi ditandai,
          // peringatan belum diakui, dan pinjaman tanpa titik perangkat.
          badge: stats ? `${jumlahPerhatianLokasi(stats)}` : null,
          hitung: "menunggu",
          Icon: MapIcon,
        },
        {
          value: "dpd",
          label: "Tanggal acuan",
          hint: "Pinjaman yang melewati tanggal acuan pelunasan.",
          badge: stats ? `${stats.pinjamanTerlambat}` : null,
          hitung: "menunggu",
          Icon: BellRing,
        },
        {
          value: "lelang",
          label: "Kalkulator lelang jaminan",
          hint: "Kalkulator nilai lelang untuk barang jaminan.",
          badge: null,
          hitung: "tidak",
          Icon: Gavel,
        },
      ],
    },
    {
      judul: "Nasabah & penyedia dana",
      items: [
        {
          value: "plafon",
          label: "Plafon Nasabah",
          hint: "Atur plafon pinjaman per nasabah.",
          badge: null,
          hitung: "tidak",
          Icon: SlidersHorizontal,
        },
        {
          value: "akses",
          label: "Kelola Penyedia Dana",
          hint: "Kelola akses dan posisi penyedia dana.",
          badge: null,
          hitung: "tidak",
          Icon: Wallet,
        },
      ],
    },
    {
      judul: "Komunikasi",
      items: [
        {
          value: "pengumuman",
          label: "Pengumuman",
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
      ],
    },
    {
      judul: "Sistem & keamanan",
      items: [
        {
          value: "config",
          label: "Pengaturan Sistem",
          hint: "Kebijakan sistem: bunga, potongan admin atas uang yang kembali, mode pemeliharaan.",
          badge: null,
          hitung: "tidak",
          Icon: Settings2,
        },
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
          label: "Landing Page · Template 3D",
          hint: "Pratinjau dan aktifkan salah satu dari enam template landing page 3D.",
          badge: null,
          hitung: "tidak",
          Icon: Sparkles,
        },
        {
          value: "aplikasi",
          label: "Aplikasi Android",
          hint: "Ganti splash screen, logo di dalam aplikasi, nama, dan warna tanpa build ulang.",
          badge: null,
          hitung: "tidak",
          Icon: Smartphone,
        },
        {
          value: "loglogin",
          label: "Keamanan Login",
          hint: "Riwayat login dan status verifikasi TOTP.",
          badge: null,
          hitung: "tidak",
          Icon: ShieldCheck,
        },
        {
          value: "bi",
          label: "BI & Kesehatan",
          hint: "Metrik bisnis yang siap dihitung dan sinyal kesehatan sistem.",
          badge: null,
          hitung: "tidak",
          Icon: Activity,
        },
        {
          value: "audit",
          label: "Audit Trail",
          hint: "Jejak seluruh tindakan admin.",
          badge: null,
          hitung: "tidak",
          Icon: Lock,
        },
        {
          value: "backup",
          label: "Backup & Keamanan",
          hint: "Cadangan data dan pemulihan sistem.",
          badge: null,
          hitung: "tidak",
          Icon: Database,
        },
      ],
    },
  ];

  /** Grup sidebar yang sedang dibuka — bisa dibuka-tutup bebas oleh admin. */
  const [grupTerbuka, setGrupTerbuka] = useState<string[]>([menu[0].judul]);

  /** Pindah menu sekaligus pastikan grupnya terbuka, agar item aktif selalu terlihat
   *  di sidebar (mis. setelah memilih menu lewat select di layar kecil). */
  const pilihMenu = (value: NilaiModulAdmin) => {
    setActiveTab(value);
    const grup = menu.find((g) => g.items.some((item) => item.value === value));
    if (grup) setGrupTerbuka((sebelumnya) => (sebelumnya.includes(grup.judul) ? sebelumnya : [...sebelumnya, grup.judul]));
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


  /** Isi setiap menu — satu entri per nilai tab. */
  // `Record<NilaiModulAdmin, ReactNode>` yang ekshaustif: menambah nilai modul
  // tanpa isinya langsung menjadi galat kompilasi — menutup R2 di akarnya.
  const panel: Record<NilaiModulAdmin, ReactNode> = {
    "hari-ini": (
      <MejaKerja overview={overview} stats={stats} onBukaModul={pilihMenu} />
    ),
    pinjaman: <LoanQueueSection loans={overview.loans} onOpen={onOpenLoan} />,
    gadai: <PawnQueueSection pawns={overview.pawns} onOpen={onOpenPawn} />,
    kredit: <KreditQueuePanel />,
    kyc: <KycPanel />,
    alokasi: <LoanAllocationQueueTab onOpen={onOpenLoan} />,
    lokasi: <LiveLocationMap />,
    dpd: <DpdTab />,
    lelang: <LelangTab />,
    plafon: <PlafonPanel />,
    akses: <AksesPenyediaDanaPanel />,
    pengumuman: <AnnouncementCms />,
    whatsapp: <WhatsAppPanel />,
    config: <SystemConfigPanel />,
    template: <WebsiteTemplatePanel />,
    landing: <LandingTemplatePanel />,
    aplikasi: <AplikasiAndroidPanel />,
    loglogin: <LoginSecurityPanel onOpenSetup={onOpenSetup} />,
    bi: <PanelBiKesehatan />,
    audit: <AuditTrailPanel />,
    backup: <BackupPanel />,
  };

  return (
    <div className="mt-4 flex min-w-0 flex-col gap-4 sm:mt-6 sm:gap-5 lg:flex-row lg:items-start lg:gap-6">
      {/* Layar kecil: bilah bawah + strip chip modul + sheet pencarian.
          Menggantikan `<select>` 17 opsi yang menyembunyikan isi tiap menu. */}
      <AdminNav menu={menu} activeTab={activeTab} onPilih={pilihMenu} />

      {/* Desktop: sidebar accordion — setiap grup menu bisa dibuka-tutup sendiri. */}
      <nav
        aria-label="Navigasi panel admin"
        className="animate-masuk hidden lg:sticky lg:top-20 lg:z-30 lg:block lg:max-h-[calc(100vh-6rem)] lg:w-64 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-2"
      >
        <Accordion
          type="multiple"
          value={grupTerbuka}
          onValueChange={setGrupTerbuka}
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
      </nav>

      <div className="min-w-0 flex-1 space-y-4 sm:space-y-5">
        {aktif && (
          <div className="animate-masuk flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <aktif.Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">{aktif.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{aktif.hint}</p>
            </div>
          </div>
        )}

        {/* R4: panel menunjuk balik ke tombolnya (`aria-labelledby`) sekaligus
            tetap punya `aria-label` sebagai cadangan. */}
        <div
          key={activeTab}
          id={`panel-${aktif?.value}`}
          role="region"
          aria-label={aktif?.label}
          aria-labelledby={aktif ? `tab-${aktif.value}` : undefined}
          className="min-w-0 animate-masuk"
        >
          {panel[activeTab]}
        </div>
      </div>
    </div>
  );
}
