import { CalendarClock, FilePlus2, FileText, Home, IdCard } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Lima menu dashboard nasabah — satu menu, satu tujuan.
 *
 * Profil dan KYC digabung menjadi "Akun" karena keduanya menjawab pertanyaan
 * yang sama: siapa saya dan sudah selesai apa identitas saya. Penggabungan ini
 * membuat bilah bawah kembali lima item, sesuai anjuran skill dan ruang jempol
 * di 375px. Deep link lama `?tab=diri` dan `?tab=kyc` tetap diterima, dengan
 * menu Akun yang menyala dan subbagian yang benar.
 *
 * `labelPendek` dipakai bilah navigasi bawah di ponsel. Nama lengkapnya tetap
 * dibacakan lewat `aria-label`, jadi tidak ada informasi yang hilang.
 */
export const MENU_DASHBOARD = [
  { value: "ringkasan", label: "Ringkasan", labelPendek: "Ringkasan", icon: Home },
  { value: "cicilan", label: "Cicilan", labelPendek: "Cicilan", icon: CalendarClock },
  { value: "form", label: "Ajukan Pinjaman", labelPendek: "Ajukan", icon: FilePlus2 },
  { value: "pinjaman", label: "Catatan Pinjaman", labelPendek: "Catatan", icon: FileText },
  { value: "akun", label: "Akun", labelPendek: "Akun", icon: IdCard },
] as const;

/** Apakah satu menu sedang aktif, termasuk alias lama `diri`/`kyc`. */
export function menuAktif(value: string, activeTab: string): boolean {
  if (value === activeTab) return true;
  return value === "akun" && (activeTab === "diri" || activeTab === "kyc");
}

/**
 * Indikator jumlah pada item menu: `neutral` (informasi), `warning` (perlu
 * segera), `danger` (terlambat/menunggak).
 */
export type TabBadge = { count: number; tone?: "neutral" | "warning" | "danger" };

/** Kelas lencana cacah item — dipakai menu sidebar DAN bilah bawah. */
export function badgeToneClass(tone: TabBadge["tone"]): string {
  if (tone === "danger") return "bg-red-100 text-red-700";
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

/** Label satu menu dari nilai tabnya — satu sumber untuk semua wadah menu. */
export function labelTujuan(value: string): string {
  if (value === "diri" || value === "kyc") return "Akun";
  return MENU_DASHBOARD.find((menu) => menu.value === value)?.label ?? "Ringkasan";
}

/** Kelas tombol menu; yang sedang dibuka memakai latar emerald-50 + garis aksen. */
function kelasMenu(aktif: boolean): string {
  return cn(
    "relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2",
    aktif && "bg-emerald-50 font-semibold text-emerald-900 hover:bg-emerald-50",
  );
}

/** Menu dashboard sisi kiri (dipakai pada layar lebar). */
export function DashboardTabNav({
  badges,
  activeTab,
  onTabChange,
}: {
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
}) {
  return (
    <nav aria-label="Menu dashboard" className="rounded-2xl border border-slate-200 bg-white p-1.5">
      <ul className="space-y-1">
        {MENU_DASHBOARD.map((menu) => {
          const aktif = menuAktif(menu.value, activeTab);
          const badge = badges?.[menu.value] ?? (menu.value === "akun" ? badges?.kyc : undefined);
          const Ikon = menu.icon;
          return (
            <li key={menu.value}>
              <button
                type="button"
                onClick={() => onTabChange(menu.value)}
                aria-current={aktif ? "page" : undefined}
                className={kelasMenu(aktif)}
              >
                {aktif && (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-emerald-800"
                  />
                )}
                <Ikon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{menu.label}</span>
                {badge !== undefined && badge.count > 0 && (
                  <span
                    aria-label={`${badge.count} item`}
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                      badgeToneClass(badge.tone),
                    )}
                  >
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Bilah navigasi bawah untuk layar sempit.
 *
 * Menggantikan pengalih menu yang dulu menumpuk di atas konten: di ponsel menu
 * ada di jempol, bukan di puncak halaman. Ikon + label pendek per tombol, dengan
 * nama lengkap di `aria-label`; `aria-current="page"` menandai menu yang dibuka.
 */
export function DashboardBottomNav({
  badges,
  activeTab,
  onTabChange,
}: {
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
}) {
  return (
    <nav
      aria-label="Menu dashboard"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch">
        {MENU_DASHBOARD.map((menu) => {
          const aktif = menuAktif(menu.value, activeTab);
          const badge = badges?.[menu.value] ?? (menu.value === "akun" ? badges?.kyc : undefined);
          const Ikon = menu.icon;
          return (
            <li key={menu.value} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onTabChange(menu.value)}
                aria-current={aktif ? "page" : undefined}
                aria-label={menu.label}
                className={cn(
                  "relative flex min-h-11 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-800",
                  aktif && "text-emerald-900",
                )}
              >
                {aktif && (
                  <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-emerald-800" />
                )}
                <Ikon className="size-5 shrink-0" aria-hidden />
                <span className="w-full truncate text-center">{menu.labelPendek}</span>
                {badge !== undefined && badge.count > 0 && (
                  <span
                    aria-label={`${badge.count} item`}
                    className={cn(
                      "absolute right-0.5 top-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                      badgeToneClass(badge.tone),
                    )}
                  >
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
