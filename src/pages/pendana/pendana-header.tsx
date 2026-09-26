import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Header ruang Pendana: brand, sapaan, dan keluar. */
export function PendanaHeader({
  greetingName,
  onSignOut,
}: {
  greetingName: string;
  onSignOut: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/pendana" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            P
          </span>
          <span className="hidden text-sm font-semibold tracking-[0.14em] sm:block">PINDAI</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold">Halo, {greetingName} 👋</p>
            <Badge className="mt-0.5 hidden border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100 sm:inline-flex">
              <BadgeCheck className="mr-1 size-3" /> Akun Verifikasi Aktif
            </Badge>
          </div>
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {greetingName.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onSignOut}>
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
