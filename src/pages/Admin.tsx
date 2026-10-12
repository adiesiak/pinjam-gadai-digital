import { useMutation, useQuery } from "convex/react";
import { Activity, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toast } from "sonner";

import { TotpGate, TotpSetupDialog } from "@/components/TotpGate";
import { AppraisalDialog } from "@/components/admin/AppraisalDialog";
import { LoanReviewDialog } from "@/components/admin/LoanReviewDialog";
import { PawnReviewDialog } from "@/components/admin/PawnReviewDialog";
import { SecurityBar, type LoanRow, type PawnRow } from "@/components/admin/admin-shared";
import { DialogBekukan } from "@/components/admin/KillSwitchPanel";
import { KerangkaAdmin, SkeletonKartu } from "@/components/ui/loading";
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
  const setKill = useMutation(api.system.setKillSwitch);
  const [killBusy, setKillBusy] = useState(false);
  /**
   * Pengaman ganda kill switch: menyalakannya wajib lewat dialog yang meminta
   * admin mengetik `BEKUKAN`. Mematikannya tidak — pemulihan harus cepat.
   */
  const [konfirmasiKill, setKonfirmasiKill] = useState(false);
  const killAktif = sysCfg?.killSwitch === true;

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

  /** Jalankan perubahan kill switch (dipakai tombol header maupun panel). */
  const jalankanKill = async (nilai: boolean) => {
    setKillBusy(true);
    try {
      await setKill({ aktif: nilai });
      toast.warning(
        nilai
          ? "KILL SWITCH DARURAT DIAKTIFKAN — semua pengajuan diblokir."
          : "Kill switch dinonaktifkan — sistem normal.",
      );
      setKonfirmasiKill(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah kill switch.");
    } finally {
      setKillBusy(false);
    }
  };

  /** Tombol header: menyalakan → dialog pengaman ganda; mematikan → langsung. */
  const handleToggleKill = () => {
    if (killAktif) {
      void jalankanKill(false);
      return;
    }
    setKonfirmasiKill(true);
  };

  return (
    <div className="bg-ambient-glass flex min-h-screen flex-col text-foreground">
      <SecurityBar seimbang={ledger?.seimbang === true} killSwitch={sysCfg?.killSwitch === true} />
      <AdminHeader
        killSwitch={killAktif}
        ready={sysCfg !== undefined}
        killBusy={killBusy}
        onToggleKill={handleToggleKill}
      />

      {/* Pengaman ganda kill switch — wajib mengetik BEKUKAN. */}
      <DialogBekukan
        open={konfirmasiKill}
        onOpenChange={setKonfirmasiKill}
        busy={killBusy}
        onKonfirmasi={() => void jalankanKill(true)}
      />

      {/* `pb-24` menyisakan ruang untuk bilah navigasi bawah (hanya < lg),
          agar baris terakhir tidak tertutup. `lg:pb-8` mengembalikannya. */}
      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-24 sm:px-6 sm:py-8 sm:pb-24 lg:pb-8"
      >
        {/* Panel judul sengaja dibuat SLIM dan pekat emerald: ia pengingat
            konteks, bukan panggung — sehingga tabel kerja tetap bagian paling
            terang di layar. Identitas PINDAI Green tetap terjaga. */}
        <section className="animate-masuk relative overflow-hidden rounded-2xl bg-emerald-950 p-4 text-white shadow-sm sm:rounded-3xl sm:px-6 sm:py-5">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500/0 via-emerald-400/70 to-emerald-500/0"
          />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                <ShieldCheck className="size-3.5" /> Ruang Operasional Tim
              </p>
              <h1 className="mt-1.5 text-lg font-semibold tracking-tight sm:text-xl">
                Ringkasan sistem hari ini
              </h1>
              <p className="mt-1 text-xs leading-5 text-emerald-100/75 sm:text-sm">
                Tinjau catatan pengajuan, lihat koordinat yang dilaporkan perangkat, dan kelola status data nasabah.
              </p>
            </div>
            <div className="flex w-fit shrink-0 items-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-900/60 px-3 py-1.5 text-[11px] font-medium text-emerald-100">
              <Activity className="size-3.5" />
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              Data internal aplikasi
            </div>
          </div>
        </section>

        {/* Statistik datang lebih lambat dari antrean pada sebagian sesi. Kartu
            rangka memakai tinggi & kisi yang sama supaya panel tidak melompat
            saat angkanya menggantikan rangka. */}
        {stats ? (
          <AdminStats stats={stats} />
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 grid grid-cols-1 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3"
          >
            <span className="sr-only">Memuat statistik operasional…</span>
            {[0, 1, 2].map((i) => (
              <SkeletonKartu key={i} className="rounded-xl p-3 sm:rounded-2xl sm:p-5" />
            ))}
          </div>
        )}

        <AdminTabs
          overview={overview}
          stats={stats}
          onOpenLoan={setLoanDetail}
          onOpenPawn={setPawnDetail}
          onOpenSetup={() => setTotpSetupOpen(true)}
          kycMenunggu={kycAntrean === undefined ? null : (kycAntrean.cacah.PENDING_REVIEW ?? 0)}
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
