import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  ClipboardList,
  Coins,
  Loader2,
  MapPin,
  Package,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { StatusBadge } from "@/components/StatusBadge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel, quoteLoan } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";
import { LTV_HINTS, type CollateralCategory } from "@/lib/pawn";

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
  tenorHari: number | null;
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
          <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-6">
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
              <div key={label} className="bg-background p-5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
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
          </TabsList>

          {/* ---------------- Pinjaman ---------------- */}
          <TabsContent value="pinjaman" className="mt-8">
            {overview.loans.length === 0 ? (
              <EmptyQueue
                icon={ClipboardList}
                title="Belum ada pengajuan pinjaman"
              />
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
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
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
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
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
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

            <div className="mt-10 rounded-lg border border-border/60 p-6">
              <h3 className="text-sm font-medium">Kesehatan ledger (double-entry)</h3>
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
    <div className="rounded-lg border border-dashed border-border/60 px-6 py-14 text-center">
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
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

        <dl className="divide-y divide-border/60 rounded-lg border border-border/60">
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

        <dl className="divide-y divide-border/60 rounded-lg border border-border/60">
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
