import { Link } from "react-router";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { VaultLogo } from "@/components/VaultLogo";

/** Bar atas dashboard nasabah: brand + penanda ruang. */
export function DashboardHeader() {
  return (
    // `pl/pr` inset takik: pada ponsel lanskap, konten bar atas tidak masuk ke
    // area takik kiri/kanan (nilainya 0 di perangkat tanpa takik).
    <header className="animate-masuk border-b border-slate-200 bg-white/80 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
          <VaultLogo size={32} className="size-8 shrink-0" />
          <span className="hidden text-sm font-semibold tracking-[0.14em] sm:block">
            PINDAI
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:inline-flex">
            Dashboard Peminjam
          </span>
          {/* Lonceng hanya untuk akun terverifikasi (tamu tidak punya catatan
              yang bisa diberitakan). Komponennya sendiri yang memutuskan. */}
          <NotificationBell />
          <RoleDashboardMenu />
        </div>
      </div>
    </header>
  );
}
