import { LayoutDashboard, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_ROUTE } from "@/lib/routes";

import { DashboardTabNav, type TabBadge } from "./dashboard-tab-nav";

/**
 * Sisi kiri dashboard nasabah: kartu profil (sapaan, avatar, status KTP,
 * tautan peran, keluar) lalu navigasi tab vertikal.
 */
export function DashboardSidebar({
  greetingName,
  role,
  badges,
  activeTab,
  onTabChange,
  onSignOut,
}: {
  greetingName: string;
  role?: string;
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
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
            <p className="truncate text-sm font-semibold">Halo, {greetingName}</p>
            <Badge className="mt-1 border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
              <ShieldCheck className="mr-1 size-3" /> Identitas tidak diverifikasi
            </Badge>
          </div>
        </div>

        {(role === "admin" || role === "pendana") && (
          <div className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3">
            {role === "admin" && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="justify-start gap-2 text-xs text-muted-foreground"
              >
                <Link to={ADMIN_ROUTE}>
                  <LayoutDashboard className="size-3.5" /> Panel Admin
                </Link>
              </Button>
            )}
            {role === "pendana" && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="justify-start gap-2 text-xs text-muted-foreground"
              >
                <Link to="/pendana">
                  <Wallet className="size-3.5" /> Ruang Pendana
                </Link>
              </Button>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-start gap-2 text-xs text-muted-foreground"
          onClick={onSignOut}
        >
          <LogOut className="size-3.5" /> Keluar
        </Button>
      </div>

      <DashboardTabNav badges={badges} activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}
