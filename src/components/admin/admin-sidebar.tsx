import { PanelLeft } from "lucide-react";
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent } from "react";

import { LencanaTab } from "@/components/admin/admin-shared";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VaultLogo } from "@/components/VaultLogo";
import type { BobotGrup, NilaiModulAdmin } from "@/lib/admin-queue";
import { muatModulAdmin } from "@/lib/admin-panel-malas";
import { cn } from "@/lib/utils";

/**
 * Sidebar panel admin: kolom tetap di layar lebar, laci di layar kecil.
 *
 * Dua keadaan lebar — 240px (ikon + label) dan 72px (hanya ikon, rata tengah).
 * Lebarnya dianimasikan lewat kelas `.sidebar-admin` / `.kolom-admin` di
 * `src/index.css`, satu-satunya gerak di PINDAI yang menggerakkan properti tata
 * letak; diminta pemilik secara eksplisit dan mati saat prefers-reduced-motion.
 *
 * Di bawah `lg` kolom ini tidak dirender sama sekali; modulnya dibuka lewat laci
 * dari kiri yang dipicu tombol di kepala panel (lihat `AdminHeader`). Isi laci
 * selalu ikon + label, apa pun pilihan petugas di layar lebar — pilihan
 * menyempit itu milik layar lebar, bukan keputusan untuk ponsel.
 */

/** Satu menu operasional: nilai tab, label, penjelasan, lencana, dan ikon. */
export type ItemSidebar = {
  value: NilaiModulAdmin;
  label: string;
  /** Penjelasan satu baris — muncul sebagai tooltip menu. */
  hint: string;
  badge: string | null;
  /**
   * Bobot lencana untuk ringkasan grup. Hanya `"menunggu"` yang dijumlahkan
   * saat grup diringkas; lencana informasi (mis. pinjaman yang sudah disetujui)
   * tidak boleh membuat grup tampak penuh pekerjaan.
   */
  hitung: BobotGrup;
  Icon: ComponentType<{ className?: string }>;
};

/** Satu seksi menu beserta judulnya. */
export type GrupSidebar = {
  judul: string;
  items: ItemSidebar[];
};

/**
 * Lebar dua keadaan, dipakai bersama oleh kolom sidebar dan geseran kolom
 * konten supaya keduanya tidak mungkin menyimpang: `w-60` = 15rem = 240px,
 * `w-[4.5rem]` = 72px (bukan kelipatan skala Tailwind terdekat, jadi ditulis
 * eksplisit).
 */
export const KELAS_LEBAR_SIDEBAR = {
  terbuka: "lg:w-60 lg:px-3",
  tertutup: "lg:w-[4.5rem] lg:px-2",
} as const;

/** Geseran kolom konten agar selebar sidebar yang sedang berlaku. */
export const KELAS_GESER_KONTEN = {
  terbuka: "lg:pl-60",
  tertutup: "lg:pl-[4.5rem]",
} as const;

/**
 * Ambang yang sama dengan `lg`: di bawahnya kolom sidebar tidak dirender dan
 * jenis menunya berpindah ke laci. Dipakai untuk memilih apa yang diubah
 * pintasan Ctrl+B — bukan untuk mengganti gaya, itu tetap urusan CSS.
 */
export const KUERI_LAYAR_SIDEBAR = "(min-width: 1024px)";

/** Kunci penyimpanan pilihan petugas: "0" = menyempit, selain itu = lebar. */
export const KUNCI_SIDEBAR_ADMIN = "pindai.admin.sidebar-terbuka";

/**
 * Pilihan sidebar yang tersimpan petugas. Bawaannya (belum pernah memilih,
 * atau `localStorage` ditolak seperti di mode privat) adalah TERBUKA.
 */
export function bacaSidebarTerbuka(): boolean {
  try {
    return window.localStorage.getItem(KUNCI_SIDEBAR_ADMIN) !== "0";
  } catch {
    return true;
  }
}

/** Simpan pilihan petugas; gagal menyimpan tidak boleh menggagalkan tindakan. */
export function simpanSidebarTerbuka(terbuka: boolean): void {
  try {
    window.localStorage.setItem(KUNCI_SIDEBAR_ADMIN, terbuka ? "1" : "0");
  } catch {
    // Mode privat: pilihan tetap berlaku untuk sesi ini, hanya tidak diingat.
  }
}

/** Ctrl+B (⌘B di Mac) tanpa modifier lain — pintasan buka/tutup sidebar. */
export function pintasanSidebar(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  return e.key.toLowerCase() === "b";
}

/** Kelas bersama tombol menu (bagian yang tidak berubah saat aktif). */
const KELAS_ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:text-sm";
const KELAS_ITEM_IDLE = "text-navy hover:bg-slate-50";
// Menu aktif mengikuti pola konsol: pil lembut, bukan blok gelap yang berat.
// Warna tetap dari aksen PINDAI, bukan biru SaaS generik.
const KELAS_ITEM_AKTIF = "bg-sky-50 font-semibold text-sky-900 ring-1 ring-inset ring-sky-100";

/**
 * Tombol buka/tutup sidebar. Satu ikon panel yang berputar mengikuti keadaan,
 * bukan dua ikon berbeda, supaya terbaca sebagai satu kontrol yang sama.
 */
export function TombolToggleSidebar({
  terbuka,
  onToggle,
  className,
}: {
  terbuka: boolean;
  onToggle: () => void;
  /** Ukuran tombol — laci ponsel memakainya lebih besar (sasaran jempol). */
  className?: string;
}) {
  const label = terbuka ? "Tutup menu" : "Buka menu";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={terbuka}
      aria-label={label}
      title={`${label} (Ctrl+B)`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-slate-300 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className ?? "size-9",
      )}
    >
      <PanelLeft
        className={cn(
          "size-4 shrink-0 motion-safe:transition-transform motion-safe:duration-200",
          !terbuka && "rotate-180",
        )}
        aria-hidden
      />
    </button>
  );
}

/**
 * Baris kepala sidebar: tombol buka/tutup berdampingan dengan lambang & nama
 * aplikasi. Saat sidebar menyempit (72px) keduanya tidak muat sebaris, jadi
 * lambangnya tetap di atas dan tombol tepat di bawahnya — masih satu blok di
 * puncak sidebar, dan lebar 72px tidak dipakai untuk label yang tak terbaca.
 */
function KepalaSidebar({
  tertutup,
  onToggle,
  ukuranTombol,
}: {
  tertutup: boolean;
  onToggle: () => void;
  ukuranTombol?: string;
}) {
  const tombol = (
    <TombolToggleSidebar terbuka={!tertutup} onToggle={onToggle} className={ukuranTombol} />
  );

  if (tertutup) {
    return (
      <div className="flex flex-col items-center gap-2 pb-3">
        <VaultLogo size={28} className="size-7 shrink-0" />
        {tombol}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
      <VaultLogo size={36} className="size-9 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold tracking-[0.12em] text-navy">
          PINDAI
        </span>
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Panel admin
        </span>
      </span>
      {tombol}
    </div>
  );
}

/** Panah di dalam satu seksi memindahkan fokus; pemilihan tetap milik klik/Enter. */
function pindahFokus(
  e: ReactKeyboardEvent<HTMLButtonElement>,
  items: readonly ItemSidebar[],
  value: NilaiModulAdmin,
  awalanId: string,
): void {
  const urut = items.map((item) => item.value);
  const sekarang = urut.indexOf(value);
  if (sekarang === -1) return;

  let tujuan: NilaiModulAdmin | null = null;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    tujuan = urut[(sekarang + 1) % urut.length] ?? null;
  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    tujuan = urut[(sekarang - 1 + urut.length) % urut.length] ?? null;
  } else if (e.key === "Home") {
    tujuan = urut[0] ?? null;
  } else if (e.key === "End") {
    tujuan = urut[urut.length - 1] ?? null;
  }
  if (tujuan === null || tujuan === value) return;

  e.preventDefault();
  document.getElementById(`${awalanId}-${tujuan}`)?.focus();
}

/** Satu menu versi ikon saja: tooltip di sisi kanan, lencana di pojok kanan atas. */
function ItemIkon({
  item,
  aktif,
  onPilih,
}: {
  item: ItemSidebar;
  aktif: boolean;
  onPilih: (value: NilaiModulAdmin) => void;
}) {
  const { value, label, badge, Icon } = item;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            id={`tab-ikon-${value}`}
            onClick={() => onPilih(value)}
            // Sorotan atau fokus mulai mengunduh potongan panelnya, jadi klik
            // berikutnya tidak perlu menunggu unduhan.
            onPointerEnter={() => muatModulAdmin(value)}
            onFocus={() => muatModulAdmin(value)}
            aria-current={aktif ? "page" : undefined}
            aria-controls={`panel-${value}`}
            aria-label={`${label}${badge !== null && badge !== "0" && badge !== "OK" ? `, ${badge} menunggu` : ""}`}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              aktif ? KELAS_ITEM_AKTIF : KELAS_ITEM_IDLE,
            )}
          >
            <Icon className="size-4 shrink-0" />
            {badge !== null && badge !== "0" && (
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 rounded-full px-1 text-[9px] font-semibold tabular-nums",
                  aktif ? "bg-primary text-primary-foreground" : "bg-amber-100 text-amber-900",
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
}

/**
 * Isi menu sidebar.
 *
 * Menyempit: daftar rata tanpa judul seksi — judulnya diganti garis pemisah
 * tipis, karena 72px tidak cukup untuk teks seksi dan label menu hilangnya
 * sudah diganti tooltip di sisi setiap ikon.
 *
 * Melebar: seluruh menu terlihat sekaligus di bawah judul seksinya. Sebelumnya
 * tiap seksi adalah accordion yang hanya membuka satu kelompok; semua menu
 * sekarang bisa dijangkau berurutan dengan Tab (syarat aksesibilitas), jadi
 * kelompoknya tampil apa adanya, bukan disembunyikan di balik klik.
 */
function DaftarMenu({
  menu,
  activeTab,
  tertutup,
  terakhir = [],
  onPilih,
  awalanId,
}: {
  menu: readonly GrupSidebar[];
  activeTab: NilaiModulAdmin;
  tertutup: boolean;
  /** Modul yang baru dibuka; ditampilkan hanya saat sidebar melebar. */
  terakhir?: readonly NilaiModulAdmin[];
  onPilih: (value: NilaiModulAdmin) => void;
  /** Awalan id tombol: kolom tetap dan laci hidup bersamaan, id tidak boleh bentrok. */
  awalanId: string;
}) {
  const itemPerId = new Map(
    menu.flatMap((grup) => grup.items.map((item) => [item.value, item] as const)),
  );
  const itemTerakhir = terakhir
    .map((value) => itemPerId.get(value))
    .filter((item): item is ItemSidebar => item !== undefined);

  if (tertutup) {
    return (
      <div className="flex flex-col items-center">
        {menu.map((grup, indeks) => (
          <div
            key={grup.judul}
            className={cn(
              "flex flex-col items-center gap-0.5",
              indeks > 0 && "mt-1.5 w-full border-t border-slate-100 pt-1.5",
            )}
          >
            {grup.items.map((item) => (
              <ItemIkon
                key={item.value}
                item={item}
                aktif={item.value === activeTab}
                onPilih={onPilih}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {itemTerakhir.length > 0 && (
        <section aria-label="Terakhir dibuka">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Terakhir dibuka
          </p>
          <div className="flex flex-col gap-1">
            {itemTerakhir.map(({ value, label, hint, badge, Icon }) => {
              const iniAktif = value === activeTab;
              return (
                <button
                  key={`terakhir-${value}`}
                  type="button"
                  onClick={() => onPilih(value)}
                  onPointerEnter={() => muatModulAdmin(value)}
                  onFocus={() => muatModulAdmin(value)}
                  title={hint}
                  aria-current={iniAktif ? "page" : undefined}
                  aria-label={`${label}${badge !== null && badge !== "0" && badge !== "OK" ? `, ${badge} menunggu` : ""}`}
                  className={cn(KELAS_ITEM, iniAktif ? KELAS_ITEM_AKTIF : KELAS_ITEM_IDLE)}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left leading-5">{label}</span>
                  <LencanaTab badge={badge} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {menu.map((grup) => (
        <section key={grup.judul} aria-label={grup.judul}>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {grup.judul}
          </p>
          <div className="flex flex-col gap-0.5">
            {grup.items.map(({ value, label, hint, badge, Icon }) => {
              const iniAktif = value === activeTab;
              return (
                <button
                  key={value}
                  type="button"
                  id={`${awalanId}-${value}`}
                  onClick={() => onPilih(value)}
                  onPointerEnter={() => muatModulAdmin(value)}
                  onFocus={() => muatModulAdmin(value)}
                  onKeyDown={(e) => pindahFokus(e, grup.items, value, awalanId)}
                  title={hint}
                  aria-current={iniAktif ? "page" : undefined}
                  aria-label={`${label}${badge !== null && badge !== "0" && badge !== "OK" ? `, ${badge} menunggu` : ""}`}
                  // Tombol menu dan panelnya saling menunjuk, jadi pembaca layar
                  // tahu tombol mana yang mengendalikan isi mana.
                  aria-controls={`panel-${value}`}
                  className={cn(KELAS_ITEM, iniAktif ? KELAS_ITEM_AKTIF : KELAS_ITEM_IDLE)}
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
        </section>
      ))}
    </div>
  );
}

/**
 * Sidebar lengkap: kolom tetap (`lg` ke atas) + laci dari kiri di bawahnya.
 *
 * Laci memakai `Sheet` (Radix Dialog) supaya lapisan gelap di belakang, kunci
 * fokus, tombol Esc, dan klik-di-luar sudah benar tanpa ditulis ulang; lebar
 * 288px cukup untuk label terpanjang menu ini tanpa membungkus ke tiga baris.
 */
export function SidebarAdmin({
  menu,
  activeTab,
  terakhir = [],
  onPilih,
  terbuka,
  onToggle,
  drawerTerbuka,
  onUbahDrawer,
}: {
  menu: readonly GrupSidebar[];
  activeTab: NilaiModulAdmin;
  terakhir?: readonly NilaiModulAdmin[];
  onPilih: (value: NilaiModulAdmin) => void;
  terbuka: boolean;
  onToggle: (terbuka: boolean) => void;
  drawerTerbuka: boolean;
  onUbahDrawer: (terbuka: boolean) => void;
}) {
  return (
    <>
      <nav
        aria-label="Navigasi panel admin"
        className={cn(
          "sidebar-admin hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-border lg:bg-card lg:py-3",
          terbuka ? KELAS_LEBAR_SIDEBAR.terbuka : KELAS_LEBAR_SIDEBAR.tertutup,
        )}
      >
        <KepalaSidebar tertutup={!terbuka} onToggle={() => onToggle(!terbuka)} />
        <DaftarMenu
          menu={menu}
          activeTab={activeTab}
          tertutup={!terbuka}
          terakhir={terakhir}
          onPilih={onPilih}
          awalanId="tab"
        />
      </nav>

      <Sheet open={drawerTerbuka} onOpenChange={onUbahDrawer}>
        <SheetContent
          side="left"
          id="menu-panel-admin"
          // `laci-admin` hanya jadi kait CSS: `prefers-reduced-motion` mematikan
          // animasi geser masuk bawaan Radix lewat kelas ini.
          className="laci-admin w-72 max-w-[85vw] gap-0 border-r border-border p-0"
        >
          <SheetHeader className="border-b border-border px-3 pt-3 pr-14 pb-0 text-left">
            <SheetTitle className="sr-only">Menu panel admin</SheetTitle>
            <KepalaSidebar
              tertutup={false}
              onToggle={() => onUbahDrawer(false)}
              ukuranTombol="size-11"
            />
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-6">
            <DaftarMenu
              menu={menu}
              activeTab={activeTab}
              tertutup={false}
              terakhir={terakhir}
              onPilih={onPilih}
              awalanId="laci"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
