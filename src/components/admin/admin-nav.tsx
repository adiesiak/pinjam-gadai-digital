import {
  ClipboardList,
  LayoutDashboard,
  LayoutTemplate,
  LineChart,
  Search,
  Settings2,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

import { LencanaTab } from "@/components/admin/admin-shared";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  GRUP_NAV,
  grupDariModul,
  ringkasGrup,
  saringModul,
  type BobotGrup,
  type NilaiModulAdmin,
} from "@/lib/admin-queue";
import { muatModulAdmin } from "@/lib/admin-panel-malas";
import { cn } from "@/lib/utils";

/**
 * Navigasi panel admin untuk layar kecil: bilah bawah 5 tab, strip chip modul,
 * dan sheet "Cari menu". Menggantikan `<select>` berisi puluhan opsi, yang
 * menyembunyikan isi tiap menu dan memotong lencana di dalam `<option>`.
 *
 * Strip chip digeser mendatar satu baris, bukan dibungkus. Membungkus dulu
 * membuat grup "Sistem" setinggi empat baris (label sepanjang "Ledger Internal
 * & Kesehatan Sistem"), sehingga bilah sticky menutupi hampir separuh layar.
 *
 * Sidebar desktop tidak diubah dan tetap dipakai di `admin-tabs.tsx`.
 *
 * Jalur yang dijamin: setiap modul terjangkau dalam <= 2 ketukan (1 tab + 1
 * chip); modul mana pun juga terjangkau lewat pencarian di sheet.
 */

/** Bagian item menu yang dibutuhkan navigasi. */
export type ItemNav = {
  value: NilaiModulAdmin;
  label: string;
  hint: string;
  badge: string | null;
  /** Bobot lencana — dipakai `ringkasGrup` untuk lencana tab bawah. */
  hitung: BobotGrup;
  Icon: ComponentType<{ className?: string }>;
};

/** Satu grup menu beserta itemnya. */
export type GrupNavData = {
  judul: string;
  items: ItemNav[];
};

/** Item menu yang sudah dilengkapi nama grupnya, untuk pencarian. */
type ItemRata = ItemNav & { grup: string };

/** Ikon tab bawah per id grup — satu ikon untuk masing-masing lima kategori. */
const IKON_GRUP: Record<string, ComponentType<{ className?: string }>> = {
  "hari-ini": LayoutDashboard,
  operasional: ClipboardList,
  pemantauan: LineChart,
  konten: LayoutTemplate,
  sistem: Settings2,
};

/** Ratakan grup menjadi daftar item + nama grup (yang dicari `saringModul`). */
function rata(menu: readonly GrupNavData[]): ItemRata[] {
  return menu.flatMap((grup) =>
    grup.items.map((item) => ({ ...item, grup: grup.judul })),
  );
}

/**
 * Isi sheet "Cari menu". Dipisah dari `AdminNav` agar bisa dirender langsung
 * oleh harness SSR — Radix tidak memasang portal saat sheet tertutup.
 */
export function IsiCariMenu({
  menu,
  activeTab,
  terakhir = [],
  onPilih,
}: {
  menu: readonly GrupNavData[];
  activeTab: NilaiModulAdmin;
  terakhir?: readonly NilaiModulAdmin[];
  onPilih: (value: NilaiModulAdmin) => void;
}) {
  const [kueri, setKueri] = useState("");
  const hasil = saringModul(rata(menu), kueri);
  const itemPerId = new Map(rata(menu).map((item) => [item.value, item] as const));
  const itemTerakhir = terakhir
    .map((value) => itemPerId.get(value))
    .filter((item): item is ItemRata => item !== undefined);

  return (
    // `shouldFilter={false}`: penyaringan memakai `saringModul` yang sudah diuji
    // (cocok pada label, nama grup, dan hint), bukan pencocokan kabur cmdk.
    <Command shouldFilter={false} className="bg-card">
      <CommandInput
        autoFocus
        value={kueri}
        onValueChange={setKueri}
        aria-label="Cari menu"
        placeholder="Cari menu, mis. keamanan, plafon, gadai…"
      />
      <CommandList className="max-h-[60dvh]">
        {kueri.trim() === "" && itemTerakhir.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Terakhir dibuka
            </p>
            {itemTerakhir.map((item) => (
              <CommandItem
                key={`terakhir-${item.value}`}
                value={`terakhir-${item.value}`}
                onSelect={() => onPilih(item.value)}
                className={cn("gap-2.5 px-3 py-2.5", item.value === activeTab && "text-primary")}
              >
                <item.Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{item.grup}</span>
              </CommandItem>
            ))}
            <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Semua menu
            </p>
          </>
        )}
        {hasil.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Tidak ada menu yang cocok dengan “{kueri.trim()}”.
          </p>
        ) : (
          hasil.map((item) => (
            <CommandItem
              key={item.value}
              value={item.value}
              onSelect={() => onPilih(item.value)}
              className={cn(
                "gap-2.5 px-3 py-2.5",
                item.value === activeTab && "text-primary",
              )}
            >
              <item.Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{item.grup}</span>
              <LencanaTab badge={item.badge} />
            </CommandItem>
          ))
        )}
      </CommandList>
    </Command>
  );
}

/** Bilah bawah + strip chip + sheet pencarian. Hanya tampil di bawah `lg`. */
export function AdminNav({
  menu,
  activeTab,
  terakhir = [],
  onPilih,
}: {
  menu: readonly GrupNavData[];
  activeTab: NilaiModulAdmin;
  terakhir?: readonly NilaiModulAdmin[];
  onPilih: (value: NilaiModulAdmin) => void;
}) {
  const [cariTerbuka, setCariTerbuka] = useState(false);

  /** Deret chip digeser ke chip aktif, termasuk saat modul dibuka dari bilah
   *  bawah atau sheet pencarian. `block: "nearest"` mencegah lompatan vertikal;
   *  kehalusan geseran mengikuti `motion-safe:scroll-smooth` di wadahnya. */
  useEffect(() => {
    document
      .getElementById(`chip-modul-${activeTab}`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeTab]);

  const itemPerId = new Map(rata(menu).map((item) => [item.value, item]));
  const grupAktif = grupDariModul(activeTab) ?? GRUP_NAV[0].id;
  const grup = GRUP_NAV.find((satu) => satu.id === grupAktif) ?? GRUP_NAV[0];
  const itemGrup = grup.modul
    .map((modul) => itemPerId.get(modul))
    .filter((item): item is ItemRata => item !== undefined);

  /** Lencana satu tab bawah — aturan yang sama dengan ringkasan grup sidebar. */
  const lencanaGrup = (grupNav: (typeof GRUP_NAV)[number]): string | null =>
    ringkasGrup(
      grupNav.modul
        .map((modul) => itemPerId.get(modul))
        .filter((item): item is ItemRata => item !== undefined),
    );

  return (
    <>
      {/* Strip chip: modul milik tab yang sedang aktif, satu baris yang digeser
          mendatar. Chip aktif selalu digulirkan ke dalam pandangan, dan pintu
          "Cari…" duduk tetap di kanan agar pencarian tidak pernah jauh. */}
      <div className="animate-masuk sticky top-14 z-30 -mx-3 border-y border-border bg-card sm:-mx-6 sm:top-16 lg:hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 sm:px-6 sm:py-2">
          <div
            role="group"
            aria-label="Pilih modul"
            className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto py-0.5 motion-safe:scroll-smooth"
          >
            {itemGrup.map((item) => {
              const aktif = item.value === activeTab;
              return (
                <button
                  key={item.value}
                  id={`chip-modul-${item.value}`}
                  type="button"
                  aria-pressed={aktif}
                  aria-label={`${item.label}${item.badge !== null && item.badge !== "0" && item.badge !== "OK" ? `, ${item.badge} menunggu` : ""}`}
                  title={item.hint}
                  onClick={() => onPilih(item.value)}
                  onPointerEnter={() => muatModulAdmin(item.value)}
                  onFocus={() => muatModulAdmin(item.value)}
                  className={cn(
                    // Lebar dibatasi supaya satu chip tidak menelan seluruh
                    // baris; label panjang dipotong dan teks penuhnya tetap
                    // terbaca di kartu judul modul tepat di bawah deret ini.
                    "flex min-h-11 max-w-[16rem] shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition-colors",
                    aktif
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary",
                  )}
                >
                  <item.Icon className="size-3.5 shrink-0" />
                  <span className="truncate leading-4">{item.label}</span>
                  <LencanaTab badge={item.badge} />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setCariTerbuka(true)}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary"
          >
            <Search className="size-3.5 shrink-0" />
            Cari…
          </button>
        </div>
      </div>

      {/* Bilah bawah: 5 tab kategori. Sengaja bukan `role="tablist"` — ini pintu
          masuk navigasi, bukan penyaring satu daftar (lihat `SubTabFilter`). */}
      <nav
        aria-label="Menu operasi"
        className="fixed bottom-0 left-[env(safe-area-inset-left)] right-[env(safe-area-inset-right)] z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex w-full max-w-7xl items-stretch">
          {GRUP_NAV.map((grupNav) => {
            const aktif = grupNav.id === grupAktif;
            const Icon = IKON_GRUP[grupNav.id] ?? LayoutDashboard;
            const lencana = lencanaGrup(grupNav);
            return (
              <button
                key={grupNav.id}
                type="button"
                aria-current={aktif ? "page" : undefined}
                aria-label={`${grupNav.label}${lencana !== null && lencana !== "OK" ? `, ${lencana} perlu ditinjau` : ""}`}
                // Tab yang sudah aktif tidak direset ke modul default — berpindah
                // modul dilakukan lewat chip, agar tidak ada perpindahan diam-diam.
                onClick={() => {
                  if (!aktif) onPilih(grupNav.default);
                }}
                className={cn(
                  "m-1 flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[10px] font-semibold transition-colors sm:m-1.5 sm:px-1 sm:text-[11px]",
                  aktif
                    ? "gradient-primary text-white"
                    : "text-slate-500 hover:bg-slate-50 hover:text-navy",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex items-center gap-1">
                  {grupNav.label}
                  {/* Lencana disembunyikan saat tab aktif: chip di atasnya sudah
                      menampilkan rincian per modul, dan lencana kuning di atas
                      latar gradien sulit dibaca. */}
                  {!aktif && <LencanaTab badge={lencana} />}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={cariTerbuka} onOpenChange={setCariTerbuka}>
        <SheetContent side="bottom" className="z-50 max-h-[85dvh] gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b border-border px-4 py-3 pr-12 text-left">
            <SheetTitle className="text-sm text-navy">Cari menu</SheetTitle>
          </SheetHeader>
          <IsiCariMenu
            menu={menu}
            activeTab={activeTab}
            terakhir={terakhir}
            onPilih={(nilai) => {
              onPilih(nilai);
              setCariTerbuka(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
