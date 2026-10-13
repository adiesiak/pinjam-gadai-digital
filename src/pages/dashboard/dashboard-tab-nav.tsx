import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  FileText,
  HelpCircle,
  IdCard,
  LayoutGrid,
  Package,
  ScrollText,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  JENIS_PENGAJUAN_AWAL,
  jenisPengajuanUntukTab,
  type JenisPengajuan,
} from "@/lib/jenisPengajuan";
import { DURATION, EASE_OUT, transitionReduced } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Penanda tab aktif yang BERGESER — pill yang meluncur dari tab lama ke tab
 * baru, bukan dua latar yang saling berkedip.
 *
 * Dipasang di sini, bukan di `TabsTrigger` bersama, karena pemanggil inilah yang
 * tahu nilai tab aktif. Semua trigger memakai `layoutId` yang sama sehingga
 * framer-motion memperlakukan pill sebagai SATU elemen yang berpindah tempat.
 * Saat `prefers-reduced-motion`, perpindahannya dibuat seketika.
 *
 * Satu pintu berisi lebih dari satu baris, jadi pill ini juga berpindah dari
 * baris pintu ke baris bagian di bawahnya — itulah sebabnya ia tetap satu
 * elemen, bukan satu penanda per kelompok.
 */
const ID_PENANDA_AKTIF = "tab-dashboard-aktif";

/**
 * Lima PINTU layanan Peminjam — bentuk menu yang dipakai setelah jumlah menu
 * bertambah terus.
 *
 * Kenapa pintu, bukan daftar datar: sembilan tujuan yang berjejer sama rata
 * membuat pemakai baru harus membaca semuanya untuk menemukan satu halaman, dan
 * menu yang paling sering dipakai (catatan pinjaman) tenggelam di antaranya.
 * Di sini tiap pintu adalah satu tujuan yang benar-benar dibuka orang; bagian
 * yang hanya masuk akal dari pintu itu (jadwal angsuran, riwayat ledger, KYC,
 * bantuan) menggantung DI BAWAHNYA dengan huruf lebih kecil dan menjorok ke
 * dalam. Karena pintu memuat tujuannya sendiri sebagai baris pertama, tidak ada
 * tujuan yang dipindahkan ke menu lain dan tidak ada baris yang tampil dua kali.
 *
 * Urutan pintu mengikuti alur pemakaian: lihat pinjaman berjalan → ajukan yang
 * baru → lihat jaminan → ambil dokumennya → urus identitas & bantuan.
 */
const PINTU_LAYANAN: ReadonlyArray<{
  /** Tab yang dibuka pintu ini saat barisnya ditekan. */
  value: string;
  label: string;
  icon: React.ReactNode;
  /** Bagian yang menggantung di pintu ini; kosong = pintu berisi satu baris. */
  anak?: ReadonlyArray<{ value: string; label: string; icon: React.ReactNode }>;
}> = [
  {
    value: "pinjaman",
    label: "Catatan Pinjaman",
    icon: <Wallet className="size-4" />,
    anak: [
      {
        value: "jadwal",
        label: "Jadwal Angsuran",
        icon: <CalendarClock className="size-3.5" />,
      },
    ],
  },
  {
    value: "form",
    label: "Form Pengajuan",
    icon: <Send className="size-4" />,
  },
  {
    value: "gadai",
    label: "Catatan Gadai",
    icon: <Package className="size-4" />,
  },
  {
    value: "kontrak",
    label: "Dokumen Perjanjian",
    icon: <FileText className="size-4" />,
    anak: [
      {
        value: "riwayat",
        label: "Riwayat Ledger",
        icon: <ScrollText className="size-3.5" />,
      },
    ],
  },
  {
    // KYC berdiri sendiri, terpisah dari Data Diri: yang pertama adalah proses
    // verifikasi identitas oleh petugas (punya status & riwayat), yang kedua
    // hanyalah isian data diri yang dipakai mengisi formulir pengajuan. Keduanya
    // tetap satu pintu karena orang mencarinya di tempat yang sama: halaman
    // akunnya. Label pintunya menyebut keduanya supaya tidak ada nama yang
    // hilang dari menu.
    value: "diri",
    label: "Data Diri & KYC",
    icon: <IdCard className="size-4" />,
    anak: [
      {
        value: "kyc",
        label: "Verifikasi KYC",
        icon: <ShieldCheck className="size-3.5" />,
      },
      { value: "bantuan", label: "Bantuan", icon: <HelpCircle className="size-3.5" /> },
    ],
  },
];

/** Semua tujuan menu secara datar, mengikuti urutan pintunya. */
const SEMUA_TUJUAN: ReadonlyArray<{ value: string; label: string; pintu: string }> = [
  ...PINTU_LAYANAN.map((pintu) => ({
    value: pintu.value,
    label: pintu.label,
    pintu: pintu.label,
  })),
  ...PINTU_LAYANAN.flatMap((pintu) =>
    (pintu.anak ?? []).map((anak) => ({
      value: anak.value,
      label: anak.label,
      pintu: pintu.label,
    })),
  ),
];

/**
 * Indikator jumlah pada item tab: `neutral` (informasi), `warning` (perlu
 * segera), `danger` (terlambat/menunggak).
 */
export type TabBadge = { count: number; tone?: "neutral" | "warning" | "danger" };

function badgeToneClass(tone: TabBadge["tone"]): string {
  if (tone === "danger") return "bg-red-100 text-red-700";
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

/**
 * Satu baris menu layanan: baris pintu atau bagian yang menggantung di bawahnya.
 *
 * Dipisah menjadi komponen karena kedua bentuk itu harus berbagi penanda aktif
 * yang SAMA (`layoutId` di `ID_PENANDA_AKTIF`): pill meluncur dari pintu ke
 * bagiannya hanya bila keduanya memakai id penanda yang identik.
 */
function BarisLayanan({
  value,
  label,
  icon,
  aktif,
  badge,
  reduce,
  pintu,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  aktif: boolean;
  badge?: TabBadge;
  reduce: boolean;
  /** true = baris pintu (lebih tebal), false = bagian menjorok di bawahnya. */
  pintu: boolean;
}) {
  return (
    <TabsTrigger
      value={value}
      // Penanda geser menggambar latar aktifnya SENDIRI (`bg-primary` pada
      // `motion.span` di bawah), jadi trigger ini wajib dilepas dari aturan
      // global `[data-slot="tabs-trigger"][data-state="active"]` di
      // `src/index.css`. Aturan itu spesifisitasnya (0,3,0) — lebih tinggi
      // daripada utilitas `data-[state=active]:*` pemanggil (0,2,0) — sehingga
      // latar `--primary` tetap dicat walau pemanggil menulis `bg-transparent`,
      // dan penandanya terlihat dobel: satu blok hijau muncul seketika di tab
      // baru, plus satu pill meluncur ke sana. Atribut di bawah inilah
      // pengecualian yang dipakai aturan itu. Karena latarnya kini tidak dicat
      // siapa pun, trigger tidak perlu menulis latar transparan sendiri; yang
      // masih perlu hanya warna huruf di atas pill dan pembatal latar hover
      // warisan.
      data-penanda-gerak=""
      className={cn(
        "group relative isolate h-auto w-auto flex-none shrink-0 justify-start gap-2.5 rounded-xl text-left hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=active]:hover:bg-transparent data-[state=active]:hover:text-primary-foreground",
        pintu ? "px-3 py-2.5 text-xs font-semibold text-slate-700" : "py-2 pr-3 pl-9 text-[11px] font-medium text-slate-600",
        "lg:w-full",
      )}
    >
      {/* Pill penanda: satu elemen yang sama, berpindah antar baris menu. */}
      {aktif && (
        <motion.span
          aria-hidden
          layoutId={ID_PENANDA_AKTIF}
          className="absolute inset-0 rounded-xl bg-primary shadow-sm"
          transition={reduce ? transitionReduced : { duration: DURATION.normal, ease: EASE_OUT }}
        />
      )}
      <span className="relative inline-flex items-center gap-2.5">
        <span className="inline-flex align-middle">{icon}</span>
        <span className="whitespace-nowrap lg:whitespace-normal lg:text-left">{label}</span>
      </span>
      {badge !== undefined && badge.count > 0 && (
        <span
          aria-label={`${badge.count} item`}
          className={cn(
            "relative ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
            badgeToneClass(badge.tone),
            "group-data-[state=active]:bg-white/25 group-data-[state=active]:text-primary-foreground",
          )}
        >
          {badge.count > 99 ? "99+" : badge.count}
        </span>
      )}
    </TabsTrigger>
  );
}

/**
 * Menu layanan dashboard Peminjam (sisi kiri) — dirender di dalam <Tabs>.
 *
 * Layar lebar: lima pintu layanan, dengan bagian yang menggantung di bawah
 * pintunya. Layar sempit: satu kartu menu menonjol berisi pemilih bagian
 * (dropdown) plus pintasan "Buat pengajuan baru", supaya pemakai baru tidak
 * perlu menebak menu mana yang membuka formulir. Dropdown-nya memuat seluruh
 * tujuan dalam urutan pintunya, dan wajahnya menyebut pintu yang sedang dibuka
 * saat bagian yang aktif menggantung di bawah pintu itu — jadi pengelompokannya
 * tetap terbaca tanpa menambah baris menu di layar ponsel.
 *
 * Pintasannya membawa jenis pengajuan yang cocok dengan tab yang sedang dibuka
 * (mis. tab Gadai → Gadai barang sudah terpilih).
 */
export function DashboardTabNav({
  badges,
  activeTab,
  onTabChange,
  onBuatPengajuan,
}: {
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
  /** Buka halaman Form Pengajuan dengan jenis yang cocok untuk tab aktif. */
  onBuatPengajuan: (jenis: JenisPengajuan) => void;
}) {
  const reduce = useReducedMotion() === true;

  // Tujuan yang sedang aktif — dipakai kartu menu layar sempit untuk menyebut
  // menunya, termasuk jumlah item.
  const aktif = SEMUA_TUJUAN.find((tujuan) => tujuan.value === activeTab) ?? null;
  const pintuAktif = aktif === null ? null : (PINTU_LAYANAN.find((p) => p.label === aktif.pintu) ?? null);
  // Saat yang terbuka adalah bagian DI BAWAH sebuah pintu, baris kecil di atas
  // menyebut nama pintunya; saat yang terbuka pintunya sendiri, menyebut pintu
  // itu lagi hanya mengulang baris di bawahnya.
  const labelKelompok = pintuAktif !== null && pintuAktif.value !== activeTab ? pintuAktif.label : "Menu layanan";

  // Teks sebuah menu: label + jumlah item. Dipakai baik oleh isi dropdown
  // maupun wajah trigger-nya, supaya keduanya tidak pernah berbeda.
  const teksMenu = (value: string, label: string) => {
    const jumlah = badges?.[value]?.count;
    if (!jumlah) return label;
    return `${label} · ${jumlah}`;
  };

  return (
    <>
      <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-3 shadow-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LayoutGrid className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">
              {labelKelompok}
            </p>
            <p className="truncate text-sm font-semibold text-slate-900">
              {aktif ? aktif.label : "Pilih menu"}
            </p>
          </div>
        </div>
        <Select value={activeTab} onValueChange={onTabChange}>
          <SelectTrigger
            aria-label="Menu dashboard Peminjam"
            className="mt-3 h-12 w-full rounded-xl border-primary/30 bg-white text-sm font-medium"
          >
            <SelectValue placeholder="Pilih menu">
              {aktif ? teksMenu(aktif.value, aktif.label) : "Pilih menu"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SEMUA_TUJUAN.map((tujuan) => (
              <SelectItem key={tujuan.value} value={tujuan.value}>
                {teksMenu(tujuan.value, tujuan.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeTab !== "form" && (
          <Button
            type="button"
            size="sm"
            className="mt-2 h-10 w-full gap-1.5"
            onClick={() =>
              onBuatPengajuan(jenisPengajuanUntukTab(activeTab) ?? JENIS_PENGAJUAN_AWAL)
            }
          >
            <Send className="size-3.5" aria-hidden /> Buat pengajuan baru
          </Button>
        )}
      </div>
      <LayoutGroup id="tab-dashboard">
        <TabsList
          aria-label="Navigasi dashboard Peminjam"
          className="hidden h-auto w-full flex-col items-stretch justify-start gap-1.5 overflow-visible rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm lg:flex"
        >
          {PINTU_LAYANAN.map((pintu) => (
            // Garis rambut pemisah antar pintu: pintu yang berisi satu baris
            // (Form Pengajuan, Catatan Gadai) tidak punya bagian di bawahnya,
            // jadi tanpa pemisah ia terbaca menyatu dengan pintu sebelumnya.
            // Pintu pertama tidak memakainya supaya tidak ada garis yang
            // menggantung tepat di bawah tepi kotak menu.
            <div
              key={pintu.value}
              className="flex flex-col gap-0.5 border-t border-slate-100 pt-1.5 first:border-t-0 first:pt-0"
            >
              <BarisLayanan
                value={pintu.value}
                label={pintu.label}
                icon={pintu.icon}
                aktif={pintu.value === activeTab}
                badge={badges?.[pintu.value]}
                reduce={reduce}
                pintu
              />
              {(pintu.anak ?? []).map((anak) => (
                <BarisLayanan
                  key={anak.value}
                  value={anak.value}
                  label={anak.label}
                  icon={anak.icon}
                  aktif={anak.value === activeTab}
                  badge={badges?.[anak.value]}
                  reduce={reduce}
                  pintu={false}
                />
              ))}
            </div>
          ))}
        </TabsList>
      </LayoutGroup>
    </>
  );
}
