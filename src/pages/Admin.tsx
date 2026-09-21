import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  ClipboardList,
  Coins,
  Database,
  ExternalLink,
  FileDown,
  Gavel,
  Landmark,
  Loader2,
  Lock,
  MapPin,
  Map as MapIcon,
  MessageSquare,
  Package,
  Settings2,
  Send,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { StatusBadge } from "@/components/StatusBadge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel, quoteLoan } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";
import { LTV_HINTS, type CollateralCategory } from "@/lib/pawn";
import { CMS_DEFAULTS } from "@/lib/cms-defaults";
import { jarakKm } from "@/lib/geo";
import {
  buildGadaiContract,
  buildPinjamanContract,
  nomorContract,
} from "@/lib/contract";
import { DEFAULT_CONFIG } from "@/convex/system";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

type LoanRow = {
  _id: Id<"loans">;
  _creationTime: number;
  nomorReferensi: string;
  pokokPinjaman: number;
  tujuan: string;
  status: "diajukan" | "sedang_direview" | "disetujui" | "ditolak" | "didanai" | "lunas";
  catatanReview?: string;
  namaLengkap: string;
  nomorRekening: string;
  catatanPeminjam?: string;
  emailPeminjam: string | null;
  userIdPeminjam: Id<"users">;
  tenorHari: number | null;
  nik: string | null;
  nomorWhatsApp: string | null;
  penghasilanBulanan: number | null;
  sumberPenghasilan: string | null;
  dokKtpId: Id<"_storage"> | null;
  dokSelfieKtpId: Id<"_storage"> | null;
  dokSlipGajiId: Id<"_storage"> | null;
  lokasiAjukan: { lat: number; lng: number; akurasi: number } | null;
  jatuhTempoPada: number | null;
  sisaHari: number | null;
  hariTerlambat: number | null;
  dendaTerlambat: number | null;
  totalKewajibanDenganPenalti: number | null;
};

type PawnRow = {
  _id: Id<"pawns">;
  _creationTime: number;
  nomorReferensi: string;
  deskripsiBarang: string;
  kategori: string;
  alamatPenilaian: string;
  status: "diajukan" | "sedang_dinilai" | "disetujui" | "ditolak" | "aktif" | "menunggu_pelepasan" | "lunas_dilepas";
  nilaiTaksiran?: number;
  hargaPasar: number | null;
  kondisiFisik: string | null;
  kodeRakVault: string | null;
  catatanReview?: string;
  namaLengkap: string;
  nomorRekening: string;
  catatanPeminjam?: string;
  emailPeminjam: string | null;
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Admin() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const overview = useQuery(api.admin.adminOverview);
  const stats = useQuery(
    api.admin.adminStats,
    overview?.isAdmin ? {} : "skip",
  );
  const adminExistsQ = useQuery(api.admin.adminExists);
  const pendingDeposits = useQuery(
    api.admin.pendingDeposits,
    overview?.isAdmin ? {} : "skip",
  );
  const ledger = useQuery(api.admin.ledgerSummary, overview?.isAdmin ? {} : "skip");

  const [loanDetail, setLoanDetail] = useState<LoanRow | null>(null);
  const [pawnDetail, setPawnDetail] = useState<PawnRow | null>(null);
  const [appraisePawn, setAppraisePawn] = useState<PawnRow | null>(null);

  const bootstrapAdmin = useMutation(api.admin.bootstrapFirstAdmin);
  const confirmDeposit = useMutation(api.admin.confirmDeposit);
  const rejectDeposit = useMutation(api.admin.rejectDeposit);
  const [booting, setBooting] = useState(false);
  const [rejectingDeposit, setRejectingDeposit] = useState<{ id: Id<"deposits">; ref: string } | null>(null);
  const [depositReason, setDepositReason] = useState("");

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
    const canBootstrap = true; // akun tamu akan ditolak server saat mencoba
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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.18em]"
          >
            <span className="gradient-primary flex size-8 items-center justify-center rounded-lg font-bold text-primary-foreground">
              P
            </span>
            PINJAM GADAI DIGITAL
          </Link>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Panel Tim
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Panel Admin
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Antrean pengajuan
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tindak setiap pengajuan: review, taksiran gadai, dan keputusan
            dengan alasan. Semua keputusan tercatat.
          </p>
        </div>

        {stats && (
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Pinjaman baru", `${stats.pinjamanBaru}`],
              ["Gadai diproses", `${stats.gadaiProses}`],
              ["Total pinjaman", `${stats.totalPinjaman}`],
              ["Total gadai", `${stats.totalGadai}`],
              ["Taksiran disetujui", formatRupiah(stats.nilaiTaksiranDisetujui)],
              [
                "Terlambat / denda",
                `${stats.pinjamanTerlambat} · ${formatRupiah(stats.totalDendaBerjalan)}`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-[0_10px_26px_-18px_oklch(0.55_0.12_240/0.3)]"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-navy">{value}</p>
              </div>
            ))}
          </section>
        )}

        <Tabs defaultValue="pinjaman" className="mt-8">
          <TabsList className="bg-transparent p-0">
            <TabsTrigger
              value="pinjaman"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Pinjaman ({overview.loans.filter((l) => l.status === "diajukan").length})
            </TabsTrigger>
            <TabsTrigger
              value="gadai"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Gadai ({overview.pawns.filter((p) => p.status !== "disetujui" && p.status !== "ditolak").length})
            </TabsTrigger>
            <TabsTrigger
              value="setoran"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Setoran ({pendingDeposits?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger
              value="pengumuman"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Pengumuman
            </TabsTrigger>
            <TabsTrigger
              value="whatsapp"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              WhatsApp
            </TabsTrigger>
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
    </div>
  );
}

function QueueRow({
  reference,
  date,
  title,
  subtitle,
  status,
  onOpen,
}: {
  reference: string;
  date: string;
  title: string;
  subtitle: string;
  status: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {reference} · {date} · {subtitle}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">{status}</div>
    </button>
  );
}

function EmptyQueue({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-sky-200 bg-white/70 px-6 py-14 text-center">
      <Icon className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        Antrean akan terisi otomatis saat nasabah mengirim pengajuan.
      </p>
    </div>
  );
}

// =====================================================================
// Dialog review pinjaman
// =====================================================================

function LoanReviewDialog({
  row,
  onClose,
}: {
  row: LoanRow | null;
  onClose: () => void;
}) {
  const markInReview = useMutation(api.loans.markLoanInReview);
  const approve = useMutation(api.loans.approveLoan);
  const reject = useMutation(api.loans.rejectLoan);
  const sendWa = useAction(api.whatsapp.sendReminder);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (row === null) return null;
  const q = quoteLoan(row.pokokPinjaman);
  const pending = row.status === "diajukan";
  const inReview = row.status === "sedang_direview";
  const decided = row.status === "disetujui" || row.status === "ditolak";

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Keputusan tersimpan.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="tabular-nums">
              {formatRupiah(row.pokokPinjaman)}
            </DialogTitle>
            <StatusBadge status={row.status} kind="loan" />
          </div>
          <DialogDescription className="tabular-nums">
            {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <LoanKycPanel row={row} />

        <dl className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Rekening tujuan", row.nomorRekening],
            ["Keperluan", loanPurposeLabel(row.tujuan)],
            ["Tenor", row.tenorHari !== null ? `${row.tenorHari} hari` : "—"],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ["Biaya Admin (3%)", formatRupiah(q.biayaAdmin)],
            ["Biaya Platform (2%)", formatRupiah(q.biayaPlatform)],
            ["Dana bersih (95%)", formatRupiah(q.danaBersihDitransfer)],
            ["Bunga (30%)", formatRupiah(q.bunga)],
            ["Total kewajiban (130%)", formatRupiah(q.totalKewajibanPelunasan)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
              <dd className="text-right text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        {row.status === "didanai" && row.jatuhTempoPada !== null && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              (row.hariTerlambat ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-border/60 bg-muted/40"
            }`}
          >
            <p
              className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
                (row.hariTerlambat ?? 0) > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {(row.hariTerlambat ?? 0) > 0
                ? `Terlambat ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Jatuh tempo hari ini"
                  : `Jatuh tempo ${row.sisaHari} hari lagi`}
            </p>
            <p className="mt-1 text-sm">
              Batas {formatDate(row.jatuhTempoPada)} · total dengan denda{" "}
              <span className="font-semibold tabular-nums">
                {formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}
              </span>
              {(row.dendaTerlambat ?? 0) > 0 && (
                <span className="tabular-nums text-destructive">
                  {" "}
                  (denda {formatRupiah(row.dendaTerlambat ?? 0)})
                </span>
              )}
            </p>
          </div>
        )}

        {!decided && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alasan-pinjaman">
                Alasan (wajib untuk penolakan)
              </Label>
              <Textarea
                id="alasan-pinjaman"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: verifikasi dokumen belum lengkap…"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {pending && (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    run("review", () => markInReview({ loanId: row._id }))
                  }
                >
                  {busy === "review" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Mulai review
                </Button>
              )}
              <Button
                className="gradient-primary border-0"
                disabled={busy !== null}
                onClick={() => run("approve", () => approve({ loanId: row._id }))}
              >
                {busy === "approve" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Setujui
              </Button>
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() => run("reject", () => reject({ loanId: row._id, reason }))}
              >
                {busy === "reject" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tolak dengan alasan
              </Button>
            </div>
          </>
        )}

        {row.catatanReview && (
          <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan keputusan</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Panel KYC + lokasi pengajuan + kirim pengingat WhatsApp
// =====================================================================

function LoanKycPanel({ row }: { row: LoanRow }) {
  const urls = useQuery(api.admin.dokumenKycUrls, { loanId: row._id });
  const sendWa = useAction(api.whatsapp.sendReminder);
  const [waBusy, setWaBusy] = useState(false);

  const lokasi = row.lokasiAjukan;
  const petaHref = lokasi
    ? `https://www.openstreetmap.org/?mlat=${lokasi.lat}&mlon=${lokasi.lng}#map=16/${lokasi.lat}/${lokasi.lng}`
    : null;

  const kirim = async () => {
    setWaBusy(true);
    try {
      await sendWa({ loanId: row._id });
      toast.success("Pengingat WhatsApp terkirim & tercatat di log.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pengingat.");
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-sky-100 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Data KYC peminjam
      </p>
      {urls === undefined ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat data KYC…
        </div>
      ) : urls === null ? (
        <p className="text-sm text-muted-foreground">Data KYC tidak ditemukan untuk pinjaman ini.</p>
      ) : (
        <>
          <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <p className="text-muted-foreground">
              NIK: <span className="tabular-nums text-navy">{urls.nik ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              WhatsApp: <span className="tabular-nums text-navy">{urls.nomorWhatsApp ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Penghasilan: <span className="tabular-nums text-navy">{urls.penghasilanBulanan !== null ? formatRupiah(urls.penghasilanBulanan) : "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Sumber: <span className="text-navy">{urls.sumberPenghasilan ?? "—"}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["KTP", urls.ktpUrl],
              ["Selfie + KTP", urls.selfieUrl],
              ["Slip gaji", urls.slipUrl],
            ].map(([label, url]) =>
              url ? (
                <a
                  key={label as string}
                  href={url as string}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-sky-300 hover:bg-secondary"
                >
                  <ExternalLink className="size-3 text-primary" /> {label as string}
                </a>
              ) : (
                <span
                  key={label as string}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground"
                >
                  {label as string} tidak tersedia
                </span>
              ),
            )}
          </div>
          <div className="rounded-xl border border-sky-100 bg-secondary/40 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <MapPin className="size-3.5 text-primary" /> Lokasi saat pengajuan
            </p>
            {lokasi ? (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
                {petaHref && (
                  <>
                    {" · "}
                    <a href={petaHref} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                      Buka peta
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Tidak ada (pengajuan sebelum fitur lokasi).</p>
            )}
          </div>
          <RiwayatLokasiMini userId={row.userIdPeminjam} />
          {row.nomorWhatsApp && (
            <Button
              size="sm"
              className="gradient-primary rounded-full border-0"
              disabled={waBusy}
              onClick={kirim}
            >
              {waBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-3.5" />}
              Kirim pengingat WhatsApp
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/** 5 titik lokasi terakhir peminjam — ringkasan untuk reviewer. */
function RiwayatLokasiMini({ userId }: { userId: Id<"users"> }) {
  const riwayat = useQuery(api.tracking.riwayatAdmin, { userId, limit: 5 });
  if (riwayat === undefined) return null;
  if (riwayat.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Belum ada jejak lokasi berkelanjutan dari peminjam ini.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-sky-100 bg-secondary/40 px-3 py-2.5">
      <p className="text-xs font-medium">Jejak lokasi terakhir ({riwayat.length})</p>
      <ul className="mt-1.5 space-y-1">
        {riwayat.map((t) => (
          <li key={t._id} className="text-xs tabular-nums text-muted-foreground">
            {new Date(t.waktu).toLocaleString("id-ID")} · {t.lat.toFixed(5)}, {t.lng.toFixed(5)} · ±{Math.round(t.akurasi)} m
          </li>
        ))}
      </ul>
    </div>
  );
}

// =====================================================================
// Panel WhatsApp — konfigurasi gateway, template, tes, dan log
// =====================================================================

function WhatsAppPanel() {
  const data = useQuery(api.whatsapp.getAdminConfig);
  const save = useMutation(api.whatsapp.saveConfig);
  const sendTest = useAction(api.whatsapp.sendTest);

  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [authPrefix, setAuthPrefix] = useState<string | null>(null);
  const [fieldNomor, setFieldNomor] = useState<string | null>(null);
  const [fieldPesan, setFieldPesan] = useState<string | null>(null);
  const [aktif, setAktif] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [nomorTes, setNomorTes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat pengaturan WhatsApp…
      </div>
    );
  }

  const cfg = data.config;
  // Inisialisasi form sekali dari data server (state lokal menyusul editor).
  if (apiUrl === null) {
    setApiUrl(cfg.apiUrl ?? "");
    setAuthHeader(cfg.authHeader ?? "Authorization");
    setAuthPrefix(cfg.authPrefix ?? "");
    setFieldNomor(cfg.fieldNomor ?? "target");
    setFieldPesan(cfg.fieldPesan ?? "message");
    setAktif(cfg.aktif === true);
    setTemplate(cfg.templatePengingat ?? "");
  }
  if (apiUrl === null) return null;

  const simpan = async () => {
    if (!apiUrl || !authHeader || !fieldNomor || !fieldPesan || template === null) return;
    setBusy("save");
    setError(null);
    try {
      await save({
        apiUrl,
        authHeader,
        authPrefix: authPrefix ?? "",
        fieldNomor,
        fieldPesan,
        aktif,
        templatePengingat: template,
      });
      toast.success("Konfigurasi WhatsApp tersimpan.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.");
    } finally {
      setBusy(null);
    }
  };

  const tes = async () => {
    setBusy("test");
    setError(null);
    try {
      await sendTest({ nomorTujuan: nomorTes, isiPesan: "Tes integrasi WhatsApp Pinjam Gadai Digital — abaikan pesan ini." });
      toast.success("Pesan tes terkirim.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengiriman tes gagal.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <div>
          <p className="text-sm font-semibold">Koneksi gateway WhatsApp</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Bekerja dengan gateway berbasis token (Fonnte, Wablas, Meta Cloud API,
            dsb). API key diisi di environment variabel <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">WHATSAPP_API_KEY</code> — tidak pernah disimpan di database.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="wa-url">Endpoint (URL https)</Label>
            <Input id="wa-url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.fonnte.com/send" />
          </div>
          <div>
            <Label htmlFor="wa-header">Nama header auth</Label>
            <Input id="wa-header" value={authHeader ?? ""} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Authorization" />
          </div>
          <div>
            <Label htmlFor="wa-prefix">Prefix token (opsional)</Label>
            <Input id="wa-prefix" value={authPrefix ?? ""} onChange={(e) => setAuthPrefix(e.target.value)} placeholder="" />
          </div>
          <div>
            <Label htmlFor="wa-fnomor">Field body untuk nomor</Label>
            <Input id="wa-fnomor" value={fieldNomor ?? ""} onChange={(e) => setFieldNomor(e.target.value)} placeholder="target" />
          </div>
          <div>
            <Label htmlFor="wa-fpesan">Field body untuk pesan</Label>
            <Input id="wa-fpesan" value={fieldPesan ?? ""} onChange={(e) => setFieldPesan(e.target.value)} placeholder="message" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="wa-template">Template pengingat penagihan</Label>
            <Textarea
              id="wa-template"
              rows={4}
              value={template ?? ""}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="{nama}, {ref}, {jumlah}, {tanggal}, {sisa}, {denda}"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Placeholder: <code className="rounded bg-secondary px-1">{"{nama} {ref} {jumlah} {tanggal} {sisa} {denda}"}</code> — wajib memuat <code className="rounded bg-secondary px-1">{"{jumlah}"}</code>.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Aktifkan pengiriman</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saat nonaktif, percobaan kirim tetap tercatat di log dengan status gagal.
            </p>
          </div>
          <Switch checked={aktif} onCheckedChange={setAktif} />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button className="gradient-primary rounded-full border-0" disabled={busy !== null} onClick={simpan}>
          {busy === "save" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Simpan konfigurasi
        </Button>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-sky-100 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="size-4 text-primary" /> Statistik log
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Total", `${data.statistik.total}`],
              ["Terkirim", `${data.statistik.terkirim}`],
              ["Gagal", `${data.statistik.gagal}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-secondary/50 px-2 py-3">
                <p className="text-lg font-semibold tabular-nums text-navy">{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <p className="text-sm font-semibold">Kirim pesan tes</p>
          <div className="mt-2 flex gap-2">
            <Input
              value={nomorTes}
              onChange={(e) => setNomorTes(e.target.value.replace(/[^\d+]/g, ""))}
              placeholder="6281234567890"
              className="tabular-nums"
            />
            <Button variant="outline" disabled={busy !== null || nomorTes.trim().length < 8} onClick={tes}>
              {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : "Tes"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-white p-5">
          <p className="text-sm font-semibold">Log pengiriman (terbaru)</p>
          {data.logs.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Belum ada pengiriman.</p>
          ) : (
            <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {data.logs.map((log) => (
                <li key={log._id} className="rounded-xl border border-border/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium tabular-nums">{log.nomorTujuan}</span>
                    <Badge
                      className={
                        log.status === "terkirim"
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : "bg-red-100 text-red-700 hover:bg-red-100"
                      }
                    >
                      {log.status}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{log.isiPesan}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(log.waktu).toLocaleString("id-ID")} · jenis {log.jenis}
                    {log.respon ? ` · ${log.respon.slice(0, 80)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Dialog review gadai + taksiran
// =====================================================================

function PawnReviewDialog({
  row,
  onClose,
  onAppraise,
}: {
  row: PawnRow | null;
  onClose: () => void;
  onAppraise: () => void;
}) {
  const markInAppraisal = useMutation(api.loans.markPawnInAppraisal);
  const reject = useMutation(api.loans.rejectPawn);
  const activatePawn = useMutation(api.loans.activatePawn);
  const releasePawn = useMutation(api.loans.releasePawn);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (row === null) return null;
  const pending = row.status === "diajukan";
  const inAppraisal = row.status === "sedang_dinilai";
  const decided = row.status === "disetujui" || row.status === "ditolak";

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Keputusan tersimpan.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="max-w-72 text-base leading-snug">
              {row.deskripsiBarang}
            </DialogTitle>
            <StatusBadge status={row.status} kind="pawn" />
          </div>
          <DialogDescription className="tabular-nums">
            {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Rekening tujuan", row.nomorRekening],
            ["Kategori", row.kategori],
            ["Alamat penilaian", row.alamatPenilaian],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            [
              "Nilai taksiran",
              row.nilaiTaksiran !== undefined
                ? formatRupiah(row.nilaiTaksiran)
                : "Belum dinilai",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
              <dd className="text-right text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-4 py-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-5 text-muted-foreground">
            Pemeriksaan wajib dilakukan di lokasi dengan pencatatan live
            location. Catat hasil kunjungan sebelum menetapkan taksiran.
          </p>
        </div>

        {!decided && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alasan-gadai">Alasan (wajib untuk penolakan)</Label>
              <Textarea
                id="alasan-gadai"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: barang tidak dapat diverifikasi kepemilikannya…"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {pending && (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    run("appraisal", () => markInAppraisal({ pawnId: row._id }))
                  }
                >
                  {busy === "appraisal" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Jadwalkan penilaian
                </Button>
              )}
              {inAppraisal && (
                <Button onClick={onAppraise}>
                  <ClipboardList className="mr-2 size-4" />
                  Input taksiran
                </Button>
              )}
              {row.status === "disetujui" && (
                <Button
                  disabled={busy !== null}
                  onClick={() =>
                    run("activate", () => activatePawn({ pawnId: row._id }))
                  }
                >
                  {busy === "activate" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Tandai aktif (dana cair)
                </Button>
              )}
              {row.status === "menunggu_pelepasan" && (
                <Button
                  disabled={busy !== null}
                  onClick={() =>
                    run("release", () => releasePawn({ pawnId: row._id }))
                  }
                >
                  {busy === "release" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Rilis barang
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() => run("reject", () => reject({ pawnId: row._id, reason }))}
              >
                {busy === "reject" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tolak dengan alasan
              </Button>
            </div>
          </>
        )}

        {row.catatanReview && (
          <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan penilaian</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AppraisalDialog({
  pawn,
  onClose,
}: {
  pawn: PawnRow | null;
  onClose: () => void;
}) {
  const approvePawn = useMutation(api.loans.approvePawn);
  const [taksiran, setTaksiran] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pawn === null) return null;

  const parsed = (() => {
    try {
      return parseRupiah(taksiran);
    } catch {
      return null;
    }
  })();
  const hint =
    LTV_HINTS[pawn.kategori as CollateralCategory] ??
    "hingga 60% dari nilai taksiran";

  const submit = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan nilai taksiran rupiah bulat yang valid.");
      return;
    }
    setBusy(true);
    try {
      await approvePawn({ pawnId: pawn._id, nilaiTaksiran: parsed });
      toast.success("Gadai disetujui dengan taksiran tersimpan.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan taksiran.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Input nilai taksiran</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {pawn.deskripsiBarang}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="taksiran">Nilai taksiran (rupiah bulat)</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              Rp
            </span>
            <Input
              id="taksiran"
              inputMode="numeric"
              className="pl-9 tabular-nums"
              value={taksiran}
              onChange={(e) => setTaksiran(e.target.value)}
              onBlur={() => {
                if (parsed !== null) setTaksiran(formatRupiah(parsed).replace("Rp ", ""));
              }}
              placeholder="8.000.000"
              disabled={busy}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Acuan plafon kategori {pawn.kategori}: {hint}. Dana yang dicairkan
            kepada nasabah mengikuti kebijakan LTV yang berlaku.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy || parsed === null}>
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Menyimpan…
              </>
            ) : (
              "Setujui gadai"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Editor CMS landing — semua teks halaman utama & pengumuman (bar berjalan,
 * popup, widget mengambang) diedit tim di sini, langsung tampil publik.
 */
function AnnouncementCms() {
  const row = useQuery(api.announcements.getCmsRow);
  const publik = useQuery(api.announcements.getPublic);
  const save = useMutation(api.announcements.save);
  const reset = useMutation(api.announcements.resetToDefaults);

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null);

  const d = (key: string, fallback: string): string =>
    (draft?.[key] as string | undefined) ?? fallback;
  const db = (key: string, fallback: boolean): boolean =>
    (draft?.[key] as boolean | undefined) ?? fallback;

  if (row === undefined || publik === undefined) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat CMS…
      </p>
    );
  }

  const set = (key: string, value: string | boolean) =>
    setDraft((prev) => ({ ...(prev ?? {}), [key]: value }));

  const simpan = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await save({ ...draft });
      setDraft(null);
      toast.success("Konten tersimpan — halaman utama langsung diperbarui.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const kembalikanDefault = async () => {
    setBusy(true);
    try {
      await reset({});
      setDraft(null);
      toast.success("Semua teks kembali ke default bawaan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal reset.");
    } finally {
      setBusy(false);
    }
  };

  const T = (
    label: string,
    key: string,
    val: string,
    opts?: { area?: boolean; max?: number; placeholder?: string },
  ) => (
    <div>
      <Label htmlFor={`cms-${key}`}>{label}</Label>
      {opts?.area ? (
        <Textarea
          id={`cms-${key}`}
          rows={3}
          className="mt-1.5 rounded-xl"
          maxLength={opts.max}
          value={val}
          placeholder={opts.placeholder}
          onChange={(e) => set(key, e.target.value)}
        />
      ) : (
        <Input
          id={`cms-${key}`}
          className="mt-1.5"
          maxLength={opts?.max}
          value={val}
          placeholder={opts?.placeholder}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </div>
  );

  const Toggle = (label: string, hint: string, key: string, val: boolean) => (
    <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={val} onCheckedChange={(v) => set(key, v)} />
    </div>
  );

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-[0_10px_30px_-18px_oklch(0.55_0.12_240/0.25)]">
      <h3 className="text-sm font-semibold text-navy">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Semua perubahan langsung tampil di halaman utama setelah disimpan.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full" disabled={busy} onClick={kembalikanDefault}>
            Reset ke default
          </Button>
          <Button
            className="gradient-primary rounded-full border-0"
            disabled={!draft || busy}
            onClick={simpan}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Simpan perubahan
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Bar pengumuman berjalan (atas semua halaman)">
          {T("Teks berjalan", "teks", d("teks", publik.barTeks), { area: true, max: 240 })}
          {T("Tautan CTA (opsional)", "tautan", d("tautan", publik.barTautan), { placeholder: "/auth" })}
          {Toggle("Tampilkan bar", "Nonaktif menyembunyikan bar dari semua halaman.", "barAktif", db("barAktif", publik.barAktif))}
          <div className="overflow-hidden rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50/70">
            <div className="animate-marquee flex w-max py-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="mx-4 text-xs font-medium text-sky-900">{d("teks", publik.barTeks)}</span>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Popup pengumuman (muncul 1,5 detik setelah buka)">
          {T("Judul", "popupJudul", d("popupJudul", publik.popupJudul), { max: 80 })}
          {T("Isi", "popupIsi", d("popupIsi", publik.popupIsi), { area: true, max: 500 })}
          {T("Teks tombol CTA", "popupCta", d("popupCta", publik.popupCta), { max: 60 })}
          {Toggle("Tampilkan popup", "Tampil tiap kunjungan halaman utama.", "popupAktif", db("popupAktif", publik.popupAktif))}
        </Section>

        <Section title="Widget pengumuman mengambang (pojok kanan bawah)">
          {T("Judul", "floatJudul", d("floatJudul", publik.floatJudul), { max: 80 })}
          {T("Isi", "floatIsi", d("floatIsi", publik.floatIsi), { area: true, max: 300 })}
          {T("Teks tombol CTA", "floatCta", d("floatCta", publik.floatCta), { max: 60 })}
          {T("Delay kemunculan (detik)", "floatDelayDetik", d("floatDelayDetik", String(publik.floatDelayDetik)))}
          {Toggle("Tampilkan widget", "Muncul otomatis sesuai delay, bisa ditutup.", "floatAktif", db("floatAktif", publik.floatAktif))}
        </Section>

        <Section title="Header & Hero">
          {T("Teks logo", "logoTeks", d("logoTeks", publik.logoTeks), { max: 40 })}
          {T("Menu nav 1", "nav1", d("nav1", publik.nav1), { max: 40 })}
          {T("Menu nav 2", "nav2", d("nav2", publik.nav2), { max: 40 })}
          {T("Menu nav 3", "nav3", d("nav3", publik.nav3), { max: 40 })}
          {T("Menu nav 4", "nav4", d("nav4", publik.nav4), { max: 40 })}
          {T("Badge atas hero", "heroBadge", d("heroBadge", publik.heroBadge), { max: 160 })}
          {T("Judul hero (bagian 1)", "heroJudul", d("heroJudul", publik.heroJudul), { max: 120 })}
          {T("Judul hero (aksen berwarna)", "heroJudul2", d("heroJudul2", CMS_DEFAULTS.hero.judul2), { max: 60 })}
          {T("Sub-judul hero", "heroSub", d("heroSub", publik.heroSub), { area: true, max: 400 })}
          {T("Tombol CTA 1", "heroCta1", d("heroCta1", publik.heroCta1), { max: 40 })}
          {T("Tombol CTA 2", "heroCta2", d("heroCta2", publik.heroCta2), { max: 40 })}
          {T("Chip 1 — label", "chip1Label", d("chip1Label", publik.chip1Label), { max: 40 })}
          {T("Chip 1 — nilai", "chip1Nilai", d("chip1Nilai", publik.chip1Nilai), { max: 40 })}
          {T("Chip 2 — label", "chip2Label", d("chip2Label", publik.chip2Label), { max: 40 })}
          {T("Chip 2 — nilai", "chip2Nilai", d("chip2Nilai", publik.chip2Nilai), { max: 40 })}
        </Section>

        <Section title="Bagian layanan (body)">
          {T("Judul bagian", "layananJudul", d("layananJudul", publik.layananJudul), { max: 120 })}
          {T("Sub-judul bagian", "layananSub", d("layananSub", publik.layananSub), { area: true, max: 300 })}
          {T("Judul kartu Pinjaman", "pinjamanJudul", d("pinjamanJudul", publik.pinjamanJudul), { max: 80 })}
          {T("Isi kartu Pinjaman", "pinjamanIsi", d("pinjamanIsi", publik.pinjamanIsi), { area: true, max: 400 })}
          {T("Tombol kartu Pinjaman", "pinjamanCta", d("pinjamanCta", publik.pinjamanCta), { max: 40 })}
          {T("Judul kartu Gadai", "gadaiJudul", d("gadaiJudul", publik.gadaiJudul), { max: 80 })}
          {T("Isi kartu Gadai", "gadaiIsi", d("gadaiIsi", publik.gadaiIsi), { area: true, max: 400 })}
          {T("Tombol kartu Gadai", "gadaiCta", d("gadaiCta", publik.gadaiCta), { max: 40 })}
        </Section>
      </div>
    </div>
  );
}
