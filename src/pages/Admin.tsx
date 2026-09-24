import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  ClipboardList,
  Coins,
  Database,
  Gavel,
  Landmark,
  Loader2,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Package,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { GadaiPendanaanPanel } from "@/components/GadaiPendanaanPanel";
import {
  AnnouncementCms,
  LoginSecurityPanel,
} from "@/components/admin/ContentPanels";
import {
  DpdTab,
  LedgerTab,
  LiveLocationMap,
  LelangTab,
  PencairanTab,
} from "@/components/admin/OperationsTabs";
import {
  AppraisalDialog,
  LoanReviewDialog,
  PawnReviewDialog,
} from "@/components/admin/ReviewDialogs";
import {
  AuditTrailPanel,
  BackupPanel,
  SystemConfigPanel,
  WhatsAppPanel,
} from "@/components/admin/SystemPanels";
import {
  EmptyQueue,
  QueueRow,
  SecurityBar,
  VaultLogo3D,
  formatDate,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { StatusBadge } from "@/components/StatusBadge";
import { TotpGate, TotpSetupDialog } from "@/components/TotpGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { formatRupiah } from "@/lib/money";
import { loanPurposeLabel } from "@/lib/loan";
import { getSessionId } from "@/lib/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabIcon = typeof ClipboardList;

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
  const stats = useQuery(
    api.admin.adminStats,
    overview?.isAdmin ? {} : "skip",
  );
  const adminExistsQ = useQuery(api.admin.adminExists);
  const pendingDeposits = useQuery(
    api.admin.pendingDeposits,
    overview?.isAdmin ? {} : "skip",
  );
  const pendingWd = useQuery(
    api.admin.pendingWithdrawals,
    overview?.isAdmin ? {} : "skip",
  );
  const processWd = useMutation(api.admin.processWithdrawal);
  const rejectWd = useMutation(api.admin.rejectWithdrawal);
  const ledger = useQuery(api.admin.ledgerSummary, overview?.isAdmin ? {} : "skip");
  const sysCfg = useQuery(api.system.getStatusPublic, overview?.isAdmin ? {} : "skip");
  const setKill = useMutation(api.system.setKillSwitch);
  const [killBusy, setKillBusy] = useState(false);
  const [killConfirm, setKillConfirm] = useState(false);

  const [loanDetail, setLoanDetail] = useState<LoanRow | null>(null);
  const [pawnDetail, setPawnDetail] = useState<PawnRow | null>(null);
  const [appraisePawn, setAppraisePawn] = useState<PawnRow | null>(null);

  const bootstrapAdmin = useMutation(api.admin.bootstrapFirstAdmin);
  const confirmDeposit = useMutation(api.admin.confirmDeposit);
  const rejectDeposit = useMutation(api.admin.rejectDeposit);
  const [booting, setBooting] = useState(false);
  const [rejectingDeposit, setRejectingDeposit] = useState<{ id: Id<"deposits">; ref: string } | null>(null);
  const [depositReason, setDepositReason] = useState("");
  const [rejectingWd, setRejectingWd] = useState<{ id: Id<"withdrawals">; ref: string } | null>(null);
  const [wdReason, setWdReason] = useState("");

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
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-lg border border-border/60 p-8">
          <ShieldCheck className="size-5 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            Setup tim PINDAI
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Belum ada admin di sistem. Masuk dengan email terverifikasi
            (bukan akun tamu), lalu aktifkan panel admin dari halaman ini.
          </p>
          <Button
            className="mt-6 w-full rounded-full"
            disabled={booting}
            onClick={async () => {
              setBooting(true);
              try {
                await bootstrapAdmin({});
                toast.success("Panel admin aktif untuk akun ini.");
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : "Gagal mengaktifkan panel admin.",
                );
              } finally {
                setBooting(false);
              }
            }}
          >
            {booting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Mengaktifkan…
              </>
            ) : (
              <>
                <BadgeCheck className="mr-2 size-4" />
                Aktifkan panel admin
              </>
            )}
          </Button>
          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
            Tombol ini hanya berfungsi untuk akun email terverifikasi dan hanya
            selama belum ada admin. Setelah itu, admin baru hanya bisa
            ditambahkan oleh admin yang ada.
          </p>
        </div>
      </main>
    );
  }

  // Bukan admin (dan admin sudah ada) → tolak dengan jelas
  if (!overview.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <ShieldCheck className="mx-auto size-5 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            Akses khusus tim
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Halaman ini hanya untuk tim Pinjam Gadai Digital. Silakan kembali
            ke ruang nasabah.
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-full">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 size-4" />
              Ke ruang nasabah
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  // 2FA TOTP gate — sesi browser baru wajib satu kali verifikasi.
  if (gate !== undefined && gate.aktif && gate.butuh && !gateVerified) {
    return <TotpGate onVerified={() => setGateVerified(true)} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SecurityBar seimbang={ledger?.seimbang === true} killSwitch={sysCfg?.killSwitch === true} />

      <header className="border-b border-sky-100 bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6">
          <div className="flex min-w-0 items-center gap-3">
            <VaultLogo3D size={38} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-[0.14em] text-navy">PANEL ADMIN</p>
              <p className="truncate text-[11px] text-muted-foreground">PINDAI · Pinjam & Gadai Digital</p>
            </div>
            <Badge className="hidden bg-emerald-100 text-emerald-800 hover:bg-emerald-100 sm:inline-flex">
              <ShieldCheck className="mr-1 size-3" /> Super Admin (Full Access)
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className={
                killConfirm
                  ? "rounded-full border-0 bg-red-600 text-white shadow-[0_10px_22px_-8px_oklch(0.62_0.19_25/0.55)] hover:bg-red-700"
                  : "rounded-full border-0 bg-red-500/95 text-white shadow-[0_10px_22px_-8px_oklch(0.62_0.19_25/0.45)] hover:bg-red-600"
              }
              disabled={killBusy || sysCfg === undefined}
              onClick={async () => {
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
                    next ? "EMERGENCY KILL SWITCH DIAKTIFKAN — semua pengajuan diblokir." : "Kill switch dinonaktifkan — sistem normal.",
                  );
                  setKillConfirm(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal mengubah kill switch.");
                } finally {
                  setKillBusy(false);
                }
              }}
            >
              {killBusy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ShieldAlert className="mr-2 size-4" />
              )}
              {sysCfg?.killSwitch === true
                ? "Matikan Kill Switch"
                : killConfirm
                  ? "Klik lagi untuk konfirmasi!"
                  : "Emergency Kill Switch"}
            </Button>
            <Link
              to="/dashboard"
              className="flex size-9 items-center justify-center rounded-full border border-sky-100 bg-secondary/60 text-xs font-bold text-navy"
              title="Profil & kembali ke ruang nasabah"
            >
              A
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
            Ruang Operasional Tim
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">
            Ringkasan sistem hari ini
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tindak setiap pengajuan, pantau lokasi, kelola pencairan dan
            keamanan data — semua keputusan tercatat di audit trail.
          </p>
        </div>

        {stats && (
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Pinjaman Baru", `${stats.pinjamanBaru}`, "amber"],
              ["Gadai Diproses", `${stats.gadaiProses}`, "amber"],
              ["Total Pinjaman", `${stats.totalPinjaman}`, "sky"],
              ["Total Gadai", `${stats.totalGadai}`, "sky"],
              ["Antrean Pencairan", `${stats.antreanPencairan}`, "sky"],
              ["Wanprestasi / DPD", `${stats.pinjamanTerlambat}`, "red"],
              ["Taksiran Disetujui", formatRupiah(stats.nilaiTaksiranDisetujui), "mint"],
              ["GPS Mismatch Alert", `${stats.gpsMismatch}`, stats.gpsMismatch > 0 ? "red" : "mint"],
            ].map(([label, value, tone]) => (
              <div
                key={label as string}
                className="card-lift rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-[0_14px_30px_-20px_oklch(0.55_0.12_240/0.35)]"
              >
                <p className="text-xs text-muted-foreground">{label as string}</p>
                <p
                  className={`mt-2 text-lg font-semibold tabular-nums ${
                    tone === "red"
                      ? "text-red-600"
                      : tone === "mint"
                        ? "text-emerald-600"
                        : tone === "amber"
                          ? "text-amber-600"
                          : "text-navy"
                  }`}
                >
                  {value as string}
                </p>
              </div>
            ))}
          </section>
        )}

        <Tabs defaultValue="pinjaman" className="mt-8">
          <TabsList className="flex w-full flex-wrap gap-2 overflow-x-auto rounded-none bg-transparent p-0">
            {([
              ["pinjaman", "Pinjaman", `${overview.loans.filter((l) => l.status === "diajukan").length}`, ClipboardList],
              ["gadai", "Gadai", `${overview.pawns.filter((p) => p.status === "diajukan" || p.status === "sedang_dinilai").length}`, Package],
              ["lokasi", "Live Location Map", null, MapIcon],
              ["pencairan", "Pencairan", stats ? `${stats.antreanPencairan}` : null, Wallet],
              ["dpd", "Koleksi / DPD", stats ? `${stats.pinjamanTerlambat}` : null, BellRing],
              ["lelang", "Lelang Jaminan", null, Gavel],
              ["ledger", "Ledger & Keuangan", ledger?.seimbang ? "OK" : "!", Landmark],
              ["backup", "Backup & Keamanan", null, Database],
              ["config", "Pengaturan System", null, Settings2],
              ["audit", "Audit Trail", null, Lock],
              ["loglogin", "Keamanan Login", null, ShieldCheck],
              ["setoran", "Setoran", `${pendingDeposits?.length ?? 0}`, Coins],
              ["pengumuman", "Pengumuman", null, MessageSquare],
              ["whatsapp", "WhatsApp", null, Send],
            ] as Array<[string, string, string | null, TabIcon]>).map(([value, label, badge, Icon]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="tab-pill gap-1.5 rounded-full border border-sky-100 bg-white px-4 py-2 text-xs font-medium text-navy shadow-[0_8px_18px_-12px_oklch(0.55_0.12_240/0.4)] transition-all data-[state=active]:gradient-primary data-[state=active]:border-0 data-[state=active]:text-white hover:-translate-y-0.5"
              >
                <Icon className="size-3.5" />
                {label}
                {badge !== null && badge !== undefined && badge !== "0" && (
                  <span
                    className={`ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      badge === "OK"
                        ? "bg-emerald-100 text-emerald-700"
                        : badge === "!"
                          ? "animate-pulse bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ---------------- Pinjaman ---------------- */}
          <TabsContent value="pinjaman" className="mt-8">
            {overview.loans.length === 0 ? (
              <EmptyQueue
                icon={ClipboardList}
                title="Belum ada pengajuan pinjaman"
              />
            ) : (
              <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
                {overview.loans.map((l) => (
                  <li key={l._id}>
                    <QueueRow
                      reference={l.nomorReferensi}
                      date={formatDate(l._creationTime)}
                      title={formatRupiah(l.pokokPinjaman)}
                      subtitle={`${l.namaLengkap} · ${l.emailPeminjam ?? "tanpa email"} · ${loanPurposeLabel(l.tujuan)}`}
                      status={<StatusBadge status={l.status} kind="loan" />}
                      onOpen={() => setLoanDetail(l)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ---------------- Gadai ---------------- */}
          <TabsContent value="gadai" className="mt-8">
            {overview.pawns.length === 0 ? (
              <EmptyQueue icon={Package} title="Belum ada pengajuan gadai" />
            ) : (
              <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
                {overview.pawns.map((p) => (
                  <li key={p._id}>
                    <QueueRow
                      reference={p.nomorReferensi}
                      date={formatDate(p._creationTime)}
                      title={p.deskripsiBarang}
                      subtitle={`${p.namaLengkap} · ${p.emailPeminjam ?? "tanpa email"} · ${p.kategori}`}
                      status={<StatusBadge status={p.status} kind="pawn" />}
                      onOpen={() => setPawnDetail(p)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <GadaiPendanaanPanel pawns={overview.pawns} />
          </TabsContent>

          {/* ---------------- Setoran Pendana ---------------- */}
          <TabsContent value="setoran" className="mt-8">
            {pendingDeposits === undefined ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Memuat…
              </div>
            ) : pendingDeposits.length === 0 ? (
              <EmptyQueue icon={Coins} title="Tidak ada setoran menunggu verifikasi" />
            ) : (
              <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
                {pendingDeposits.map((d) => (
                  <li key={d._id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {d.nomorReferensi} · {d.emailPendana ?? "tanpa email"} · ref transfer: {d.referensiTransfer}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        className="gradient-primary rounded-full border-0"
                        onClick={async () => {
                          try {
                            await confirmDeposit({ depositId: d._id });
                            toast.success("Setoran terverifikasi & tercatat di jurnal.");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Gagal konfirmasi.");
                          }
                        }}
                      >
                        <BadgeCheck className="mr-1 size-3.5" />
                        Verifikasi
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setRejectingDeposit({ id: d._id, ref: d.nomorReferensi })}
                      >
                        Tolak
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* ---------------- Antrean penarikan Pendana ---------------- */}
            <h3 className="mt-10 text-sm font-semibold text-navy">Antrean penarikan dana</h3>
            {pendingWd === undefined ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Memuat…
              </div>
            ) : pendingWd.length === 0 ? (
              <EmptyQueue icon={Wallet} title="Tidak ada penarikan menunggu diproses" />
            ) : (
              <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
                {pendingWd.map((w) => (
                  <li key={w._id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums">{formatRupiah(w.jumlah)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {w.nomorReferensi} · {w.emailPendana ?? "tanpa email"} · {w.namaBank} {w.nomorRekening}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        className="gradient-primary rounded-full border-0"
                        onClick={async () => {
                          try {
                            await processWd({ withdrawalId: w._id });
                            toast.success("Penarikan diproses & tercatat di jurnal.");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Gagal memproses.");
                          }
                        }}
                      >
                        <BadgeCheck className="mr-1 size-3.5" />
                        Proses
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setRejectingWd({ id: w._id, ref: w.nomorReferensi })}
                      >
                        Tolak
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="clay-card mt-10 p-6">
              <h3 className="text-sm font-semibold text-navy">Kesehatan ledger (double-entry)</h3>
              {ledger === undefined ? (
                <p className="mt-3 text-sm text-muted-foreground">Memuat…</p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      ["Total debit", formatRupiah(ledger.totalDebit)],
                      ["Total kredit", formatRupiah(ledger.totalKredit)],
                      ["Jumlah entri", `${ledger.entryCount}`],
                      ["Status", ledger.seimbang ? "Seimbang ✓" : "TIDAK SEIMBANG"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Jurnal bersifat append-only: entri tidak pernah diubah atau
                    dihapus. Total debit harus selalu sama dengan total kredit.
                  </p>
                </>
              )}
            </div>
          </TabsContent>

          {/* ---------------- CMS Pengumuman ---------------- */}
          <TabsContent value="pengumuman" className="mt-8">
            <AnnouncementCms />
          </TabsContent>

          {/* ---------------- WhatsApp Reminder ---------------- */}
          <TabsContent value="whatsapp" className="mt-8">
            <WhatsAppPanel />
          </TabsContent>

          {/* ---------------- Live Location Map ---------------- */}
          <TabsContent value="lokasi" className="mt-8">
            <LiveLocationMap />
          </TabsContent>

          {/* ---------------- Pencairan ---------------- */}
          <TabsContent value="pencairan" className="mt-8">
            <PencairanTab onOpen={(l) => setLoanDetail(l)} />
          </TabsContent>

          {/* ---------------- Koleksi / DPD ---------------- */}
          <TabsContent value="dpd" className="mt-8">
            <DpdTab />
          </TabsContent>

          {/* ---------------- Lelang Jaminan ---------------- */}
          <TabsContent value="lelang" className="mt-8">
            <LelangTab />
          </TabsContent>

          {/* ---------------- Ledger & Keuangan ---------------- */}
          <TabsContent value="ledger" className="mt-8">
            <LedgerTab />
          </TabsContent>

          {/* ---------------- Backup & Keamanan ---------------- */}
          <TabsContent value="backup" className="mt-8">
            <BackupPanel />
          </TabsContent>

          {/* ---------------- Pengaturan System ---------------- */}
          <TabsContent value="config" className="mt-8">
            <SystemConfigPanel />
          </TabsContent>

          {/* ---------------- Audit Trail ---------------- */}
          <TabsContent value="audit" className="mt-8">
            <AuditTrailPanel />
          </TabsContent>

          {/* ---------------- Keamanan Login ---------------- */}
          <TabsContent value="loglogin" className="mt-8">
            <LoginSecurityPanel onOpenSetup={() => setTotpSetupOpen(true)} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialogs */}
      <LoanReviewDialog
        row={loanDetail}
        onClose={() => setLoanDetail(null)}
      />
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

      <Dialog open={rejectingDeposit !== null} onOpenChange={(open) => !open && setRejectingDeposit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak setoran</DialogTitle>
            <DialogDescription>
              {rejectingDeposit?.ref} — alasan wajib diisi dan akan tercatat.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={depositReason}
            onChange={(e) => setDepositReason(e.target.value)}
            placeholder="Contoh: bukti transfer tidak dapat diverifikasi…"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRejectingDeposit(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!depositReason.trim()}
              onClick={async () => {
                if (!rejectingDeposit) return;
                try {
                  await rejectDeposit({ depositId: rejectingDeposit.id, reason: depositReason });
                  toast.success("Setoran ditolak.");
                  setRejectingDeposit(null);
                  setDepositReason("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menolak setoran.");
                }
              }}
            >
              Tolak setoran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectingWd !== null} onOpenChange={(open) => !open && setRejectingWd(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak penarikan</DialogTitle>
            <DialogDescription>
              {rejectingWd?.ref} — alasan wajib diisi dan akan tercatat di audit.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={wdReason}
            onChange={(e) => setWdReason(e.target.value)}
            placeholder="Contoh: rekening tujuan tidak cocok dengan identitas…"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRejectingWd(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!wdReason.trim()}
              onClick={async () => {
                if (!rejectingWd) return;
                try {
                  await rejectWd({ withdrawalId: rejectingWd.id, reason: wdReason });
                  toast.success("Penarikan ditolak.");
                  setRejectingWd(null);
                  setWdReason("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menolak penarikan.");
                }
              }}
            >
              Tolak penarikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
