import { useMutation, useQuery } from "convex/react";
import { Activity, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { TotpGate, TotpSetupDialog } from "@/components/TotpGate";
import { AppraisalDialog } from "@/components/admin/AppraisalDialog";
import { LoanReviewDialog } from "@/components/admin/LoanReviewDialog";
import { PawnReviewDialog } from "@/components/admin/PawnReviewDialog";
import { SecurityBar, type LoanRow, type PawnRow } from "@/components/admin/admin-shared";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROUTE } from "@/lib/routes";

import {
  AdminHeader,
  AdminStats,
  BootstrapAdminView,
  NotAdminView,
} from "./admin/admin-shell";
import { AdminTabs } from "./admin/admin-tabs";
import { Button } from "@/components/ui/button";

/**
 * Panel admin — PINDAI.
 * Hanya merangkai modul di ./admin/*; tiap bagian hidup di file sendiri agar
 * mudah disunting dan dirawat.
 */
export default function Admin() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const gate = useQuery(
    api.security.totpGateStatus,
    isAuthenticated ? {} : "skip",
  );
  const adminExistsQ = useQuery(
    api.admin.adminExists,
    isAuthenticated ? {} : "skip",
  );
  const adminVerified = gate?.isAdmin === true && gate.verified;
  const overview = useQuery(api.admin.adminOverview, adminVerified ? {} : "skip");
  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const stats = useQuery(api.admin.adminStats, adminVerified ? {} : "skip");
  const pendingDeposits = useQuery(
    api.admin.pendingDeposits,
    adminVerified ? {} : "skip",
  );
  const pendingWd = useQuery(
    api.admin.pendingWithdrawals,
    adminVerified ? {} : "skip",
  );
  const ledger = useQuery(api.admin.ledgerSummary, adminVerified ? {} : "skip");
  const sysCfg = useQuery(api.system.getStatusPublic, adminVerified ? {} : "skip");
  const setKill = useMutation(api.system.setKillSwitch);
  const [killBusy, setKillBusy] = useState(false);
  const [killConfirm, setKillConfirm] = useState(false);

  const [loanDetail, setLoanDetail] = useState<LoanRow | null>(null);
  const [pawnDetail, setPawnDetail] = useState<PawnRow | null>(null);
  const [appraisePawn, setAppraisePawn] = useState<PawnRow | null>(null);

  const bootstrapAdmin = useMutation(api.admin.bootstrapFirstAdmin);
  const [booting, setBooting] = useState(false);

  if (
    isLoading ||
    (isAuthenticated && (gate === undefined || adminExistsQ === undefined))
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Belum login → pertahankan tujuan menuju jalur admin tersembunyi.
  if (!isAuthenticated) {
    navigate(`/auth?returnTo=${encodeURIComponent(ADMIN_ROUTE)}`);
    return null;
  }

  // Bootstrap admin pertama: belum ada admin + akun ini email terverifikasi
  if (!gate?.isAdmin && adminExistsQ === false) {
    return (
      <BootstrapAdminView
        busy={booting}
        onActivate={async () => {
          setBooting(true);
          try {
            await bootstrapAdmin({});
            toast.success("Panel admin aktif untuk akun ini.");
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Gagal mengaktifkan panel admin.",
            );
          } finally {
            setBooting(false);
          }
        }}
      />
    );
  }

  // Bukan admin (dan admin sudah ada) → tolak dengan jelas
  if (!gate?.isAdmin) {
    return <NotAdminView />;
  }

  // TOTP wajib sebelum data admin diminta. Admin pertama hanya memperoleh
  // akses setup; operasi admin tetap tertutup sampai setup mengikat sesi Auth.
  if (!gate.aktif) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <ShieldCheck className="size-6 text-primary" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
            Aktifkan verifikasi TOTP
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            TOTP wajib sebelum data operasional atau tindakan admin dapat diakses.
            Siapkan aplikasi authenticator untuk melanjutkan.
          </p>
          <Button className="mt-6 w-full rounded-full" onClick={() => setTotpSetupOpen(true)}>
            Siapkan autentikasi dua faktor
          </Button>
        </div>
        <TotpSetupDialog open={totpSetupOpen} onOpenChange={setTotpSetupOpen} />
      </main>
    );
  }
  if (!gate.verified) {
    return <TotpGate />;
  }
  if (overview === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const handleToggleKill = async () => {
    const next = !(sysCfg?.killSwitch === true);
    if (next && !killConfirm) {
      setKillConfirm(true);
      setTimeout(() => setKillConfirm(false), 4000);
      return;
    }
    setKillBusy(true);
    try {
      await setKill({ aktif: next });
      toast.warning(
        next
          ? "KILL SWITCH DARURAT DIAKTIFKAN — semua pengajuan diblokir."
          : "Kill switch dinonaktifkan — sistem normal.",
      );
      setKillConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah kill switch.");
    } finally {
      setKillBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-foreground">
      <SecurityBar seimbang={ledger?.seimbang === true} killSwitch={sysCfg?.killSwitch === true} />
      <AdminHeader
        killSwitch={sysCfg?.killSwitch === true}
        ready={sysCfg !== undefined}
        killBusy={killBusy}
        killConfirm={killConfirm}
        onToggleKill={() => void handleToggleKill()}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 sm:py-8">
        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-3xl sm:p-8">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-50/80 to-transparent" aria-hidden="true" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                <ShieldCheck className="size-4" /> Ruang Operasional Tim
              </p>
              <h1 className="mt-3 text-xl font-semibold tracking-tight text-navy sm:text-3xl">
                Ringkasan sistem hari ini
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Tinjau catatan pengajuan, lihat koordinat yang dilaporkan perangkat, dan kelola status ledger internal.
              </p>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800 sm:text-xs">
              <Activity className="size-3.5" />
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Data internal aplikasi
            </div>
          </div>
        </section>

        {stats && <AdminStats stats={stats} />}

        <AdminTabs
          overview={overview}
          stats={stats}
          ledger={ledger}
          pendingDeposits={pendingDeposits}
          pendingWd={pendingWd}
          onOpenLoan={setLoanDetail}
          onOpenPawn={setPawnDetail}
          onOpenSetup={() => setTotpSetupOpen(true)}
        />
      </main>

      {/* Dialogs */}
      <LoanReviewDialog row={loanDetail} onClose={() => setLoanDetail(null)} />
      <PawnReviewDialog
        row={pawnDetail}
        onClose={() => setPawnDetail(null)}
        onAppraise={() => {
          setAppraisePawn(pawnDetail);
          setPawnDetail(null);
        }}
      />
      <AppraisalDialog pawn={appraisePawn} onClose={() => setAppraisePawn(null)} />
      <TotpSetupDialog open={totpSetupOpen} onOpenChange={setTotpSetupOpen} />
    </div>
  );
}
