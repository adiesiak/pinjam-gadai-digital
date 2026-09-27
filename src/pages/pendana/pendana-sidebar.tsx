import { ArrowLeft, BadgeCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { PendanaTabNav, type TabBadge } from "./pendana-tab-nav";

/**
 * Sisi kiri ruang Pendana: kartu profil (sapaan, avatar, status verifikasi,
 * keluar) lalu navigasi tab vertikal.
 */
export function PendanaSidebar({
  greetingName,
  badges,
  onSignOut,
}: {
  greetingName: string;
  badges?: Partial<Record<string, TabBadge>>;
  onSignOut: () => void;
}) {
  const initial = greetingName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Halo, {greetingName} 👋</p>
            <Badge className="mt-1 border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
              <BadgeCheck className="mr-1 size-3" /> Akun Verifikasi Aktif
            </Badge>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-start gap-2 text-xs text-muted-foreground"
          onClick={onSignOut}
        >
          <ArrowLeft className="size-3.5" /> Keluar
        </Button>
      </div>

      <PendanaTabNav badges={badges} />
    </div>
  );
}
