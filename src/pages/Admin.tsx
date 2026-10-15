import { useMutation, useQuery } from "convex/react";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toast } from "sonner";

import { TotpGate, TotpSetupDialog } from "@/components/TotpGate";
import { AppraisalDialog } from "@/components/admin/AppraisalDialog";
import { LoanReviewDialog } from "@/components/admin/LoanReviewDialog";
import { PawnReviewDialog } from "@/components/admin/PawnReviewDialog";
import { type LoanRow, type PawnRow } from "@/components/admin/admin-shared";
import { KerangkaAdmin } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { hitungMenunggu } from "@/lib/admin-queue";
import { ADMIN_ROUTE } from "@/lib/routes";

import { AdminHeader, BootstrapAdminView, NotAdminView } from "./admin/admin-shell";
import { AdminTabs } from "./admin/admin-tabs";
import { Button } from "@/components/ui/button";

/**
 * Panel admin — PINDAI.
 * Hanya merangkai modul di ./admin/*; tiap bagian hidup di file sendiri agar
 * mudah disunting dan dirawat.
 */
export default function Admin() {
  const { isLoading, isAuthenticated } = useAuth();
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
  const ledger = useQuery(api.admin.ledgerSummary, adminVerified ? {} : "skip");
  const sysCfg = useQuery(api.system.getStatusPublic, adminVerified ? {} : "skip");
  // Cacah antrean verifikasi identitas untuk lencana menu. Hanya dihitung saat
  // sesi admin sudah terverifikasi TOTP; sebelum itu query dilewati.
  const kycAntrean = useQuery(api.kyc.daftarKycAdmin, adminVerified ? {} : "skip");

  const [loanDetail, setLoanDetail] = useState<LoanRow | null>(null);
  const [pawnDetail, setPawnDetail] = useState<PawnRow | null>(null);
  const [appraisePawn, setAppraisePawn] = useState<PawnRow | null>(null);

  const bootstrapAdmin = useMutation(api.admin.bootstrapFirstAdmin);
  const [booting, setBooting] = useState(false);

  if (
    isLoading ||
    (isAuthenticated && (gate === undefined || adminExistsQ === undefined))
  ) {
    return <LoadingScreen label="Memeriksa akses admin…" />;
  }

  // Belum login → pertahankan tujuan menuju jalur admin tersembunyi.
  if (!isAuthenticated) {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(ADMIN_ROUTE)}`} replace />;
  }

  // Bootstrap admin pertama: belum ada admin + akun ini email terverifikasi
  if (!gate?.isAdmin && adminExistsQ === false) {
    return (
      <BootstrapAdminView
        busy={booting}
        onActivate={async (secret?: string) => {
          setBooting(true);
          try {
            await bootstrapAdmin({ secret: secret ?? "" });
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
        <div className="animate-masuk w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
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
  // Pemuatan pertama panel admin memakai RANGKA, bukan layar penuh bermerek:
  // satu permintaan data tidak boleh menutupi seluruh halaman, dan bentuk
  // rangkanya sudah mengikuti susunan panel sehingga tidak ada lompatan tata
  // letak saat angka-angka asli menggantikannya.
  if (overview === undefined) {
    return <KerangkaAdmin />;
  }

  /**
   * Cacah pengajuan yang belum diputuskan per produk, untuk KPI Ringkasan.
   * Memakai `hitungMenunggu` yang sama dengan lencana menu, jadi angka KPI dan
   * lencana tidak bisa berbeda.
   */
  const menunggu = {
    pinjaman: hitungMenunggu(overview.loans, "pinjaman"),
    gadai: hitungMenunggu(overview.pawns, "gadai"),
    kredit: hitungMenunggu(overview.kredit, "kredit"),
  };

  return (
    <div className="min-h-screen bg-slate-50 text-foreground">
      <AdminTabs
        header={(judul, menuPonsel) => (
          <AdminHeader
            judul={judul}
            killSwitch={sysCfg?.killSwitch}
            seimbang={ledger?.seimbang}
            menuPonsel={menuPonsel}
          />
        )}
        overview={overview}
        stats={stats}
        menunggu={menunggu}
        onOpenLoan={setLoanDetail}
        onOpenPawn={setPawnDetail}
        onOpenSetup={() => setTotpSetupOpen(true)}
        kycMenunggu={kycAntrean === undefined ? null : (kycAntrean.cacah.PENDING_REVIEW ?? 0)}
      />

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
