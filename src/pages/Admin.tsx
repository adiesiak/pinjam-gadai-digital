import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { TotpGate, TotpSetupDialog } from "@/components/TotpGate";
import { AppraisalDialog } from "@/components/admin/AppraisalDialog";
import { LoanReviewDialog } from "@/components/admin/LoanReviewDialog";
import { PawnReviewDialog } from "@/components/admin/PawnReviewDialog";
import { SecurityBar, type LoanRow, type PawnRow } from "@/components/admin/admin-shared";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { getSessionId } from "@/lib/session";

import {
  AdminHeader,
  AdminStats,
  BootstrapAdminView,
  NotAdminView,
} from "./admin/admin-shell";
import { AdminTabs } from "./admin/admin-tabs";

/**
 * Panel admin — PINDAI.
 * Hanya merangkai modul di ./admin/*; tiap bagian hidup di file sendiri agar
 * mudah disunting dan dirawat.
 */
export default function Admin() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const overview = useQuery(api.admin.adminOverview);
  const sessionId = useMemo(() => getSessionId(), []);
  const gate = useQuery(
    api.security.totpGateStatus,
    overview?.isAdmin ? { sessionId } : "skip",
  );
  const [gateVerified, setGateVerified] = useState(false);
  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const stats = useQuery(api.admin.adminStats, overview?.isAdmin ? {} : "skip");
  const adminExistsQ = useQuery(api.admin.adminExists);
  const pendingDeposits = useQuery(
    api.admin.pendingDeposits,
    overview?.isAdmin ? {} : "skip",
  );
  const pendingWd = useQuery(
    api.admin.pendingWithdrawals,
    overview?.isAdmin ? {} : "skip",
  );
  const ledger = useQuery(api.admin.ledgerSummary, overview?.isAdmin ? {} : "skip");
  const sysCfg = useQuery(api.system.getStatusPublic, overview?.isAdmin ? {} : "skip");
  const setKill = useMutation(api.system.setKillSwitch);
  const [killBusy, setKillBusy] = useState(false);
  const [killConfirm, setKillConfirm] = useState(false);

  const [loanDetail, setLoanDetail] = useState<LoanRow | null>(null);
  const [pawnDetail, setPawnDetail] = useState<PawnRow | null>(null);
  const [appraisePawn, setAppraisePawn] = useState<PawnRow | null>(null);

  const bootstrapAdmin = useMutation(api.admin.bootstrapFirstAdmin);
  const [booting, setBooting] = useState(false);

  if (isLoading || overview === undefined || adminExistsQ === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Belum login → wajib masuk dengan returnTo ke /admin
  if (!isAuthenticated) {
    navigate("/auth?returnTo=%2Fadmin");
    return null;
  }

  // Bootstrap admin pertama: belum ada admin + akun ini email terverifikasi
  if (!overview.isAdmin && adminExistsQ === false) {
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
  if (!overview.isAdmin) {
    return <NotAdminView />;
  }

  // 2FA TOTP gate — sesi browser baru wajib satu kali verifikasi.
  if (gate !== undefined && gate.aktif && gate.butuh && !gateVerified) {
    return <TotpGate onVerified={() => setGateVerified(true)} />;
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SecurityBar seimbang={ledger?.seimbang === true} killSwitch={sysCfg?.killSwitch === true} />
      <AdminHeader
        killSwitch={sysCfg?.killSwitch === true}
        ready={sysCfg !== undefined}
        killBusy={killBusy}
        killConfirm={killConfirm}
        onToggleKill={() => void handleToggleKill()}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
            Ruang Operasional Tim
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">
            Ringkasan sistem hari ini
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tindak pengajuan, pantau lokasi, dan kelola pencairan.
          </p>
        </div>

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
