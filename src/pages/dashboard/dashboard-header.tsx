import { Link } from "react-router";

import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";

/** Bar atas dashboard nasabah: brand + penanda ruang. */
export function DashboardHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            P
          </span>
          <span className="hidden text-sm font-semibold tracking-[0.14em] sm:block">
            PINDAI
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:inline-flex">
            Dashboard Peminjam
          </span>
          <RoleDashboardMenu />
        </div>
      </div>
    </header>
  );
}
