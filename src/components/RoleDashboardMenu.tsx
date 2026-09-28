import { ChevronDown, LayoutDashboard, ShieldCheck, Wallet } from "lucide-react";
import { Link } from "react-router";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Pintasan ke ruang kerja yang tersedia untuk peran akun saat ini. */
export function RoleDashboardMenu() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const role = user?.role;

  const spaces =
    role === "admin"
      ? [
          {
            href: "/admin",
            label: "Panel Admin",
            description: "Operasional dan pengelolaan sistem",
            icon: ShieldCheck,
          },
          {
            href: "/dashboard",
            label: "Dashboard Peminjam",
            description: "Pantau pinjaman dan pengajuan",
            icon: LayoutDashboard,
          },
        ]
      : role === "pendana"
        ? [
            {
              href: "/pendana",
              label: "Dashboard Pendana",
              description: "Kelola dana, setoran, dan alokasi",
              icon: Wallet,
            },
          ]
        : [
            {
              href: "/dashboard",
              label: "Dashboard Peminjam",
              description: "Pantau pinjaman dan pengajuan",
              icon: LayoutDashboard,
            },
            {
              href: "/pendana",
              label: "Daftar sebagai Pendana",
              description: "Buka ruang khusus pengelolaan dana",
              icon: Wallet,
            },
          ];

  if (isLoading || !isAuthenticated) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Akses dashboard PINDAI"
          className="h-9 gap-1.5 rounded-full px-3"
        >
          <LayoutDashboard className="size-4" />
          <span className="hidden md:inline">Akses Dashboard</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Ruang PINDAI
        </DropdownMenuLabel>
        {spaces.map(({ href, label, description, icon: Icon }) => {
          return (
            <DropdownMenuItem key={href} asChild className="cursor-pointer px-3 py-2.5">
              <Link to={href} className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
