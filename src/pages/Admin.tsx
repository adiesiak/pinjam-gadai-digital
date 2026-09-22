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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

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
import { DEFAULT_CONFIG } from "@/lib/system-config";
import { getSessionId } from "@/lib/session";
import { EContractWidget } from "@/components/EContract";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
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
  if (!overview.isAdmin) {    return (
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
            {[
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
            ].map(([value, label, badge, Icon]) => (
              <TabsTrigger
                key={value as string}
                value={value as string}
                className="tab-pill gap-1.5 rounded-full border border-sky-100 bg-white px-4 py-2 text-xs font-medium text-navy shadow-[0_8px_18px_-12px_oklch(0.55_0.12_240/0.4)] transition-all data-[state=active]:gradient-primary data-[state=active]:border-0 data-[state=active]:text-white hover:-translate-y-0.5"
              >
                {/* @ts-expect-error ikon dinamis bertipe komponen lucide */}
                <Icon className="size-3.5" />
                {label as string}
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
                    {badge as string}
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
            <Separator className="my-4" />
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

        <EContractWidget kind="loan" loanId={row._id} />

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
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["KTP", urls.ktpUrl],
              ["Selfie + KTP", urls.selfieUrl],
              ["Slip gaji", urls.slipUrl],
            ] as const).map(([label, url]) =>
              url ? (
                <WatermarkedDoc key={label} src={url} label={label} />
              ) : (
                <span
                  key={label}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 px-3 py-6 text-xs text-muted-foreground"
                >
                  {label} tidak tersedia
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
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gradient-primary rounded-full border-0"
                disabled={waBusy}
                onClick={kirim}
              >
                {waBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-3.5" />}
                Kirim pengingat WhatsApp
              </Button>
              <a
                href={`https://wa.me/${row.nomorWhatsApp}?text=${encodeURIComponent(
                  `Halo ${row.namaLengkap}, kami dari PINDAI (Pinjam & Gadai Digital). Pinjaman Anda ${row.nomorReferensi} memiliki total kewajiban ${formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}${(row.hariTerlambat ?? 0) > 0 ? ` (termasuk denda keterlambatan ${formatRupiah(row.dendaTerlambat ?? 0)})` : ""}. Mohon lakukan pelunasan tepat waktu. Terima kasih.`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_oklch(0.7_0.15_160/0.6)] transition-transform hover:-translate-y-0.5 hover:bg-emerald-600"
              >
                <Send className="size-3.5" /> Kirim Tagihan WA
              </a>
            </div>
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

function VaultLogo3D({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="vaultBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="55%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <radialGradient id="vaultDial" cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#A7F3D0" />
          <stop offset="60%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </radialGradient>
      </defs>
      <rect x="4" y="8" width="56" height="46" rx="12" fill="url(#vaultBody)" />
      <rect x="12" y="16" width="40" height="30" rx="8" fill="#0C4A6E" opacity="0.25" />
      <circle cx="32" cy="31" r="10" fill="url(#vaultDial)" />
      <circle cx="32" cy="31" r="4" fill="#065F46" opacity="0.55" />
      <rect x="29" y="29" width="6" height="3" rx="1.5" fill="#F0FDF4" />
      <rect x="14" y="54" width="8" height="6" rx="2" fill="#0284C7" />
      <rect x="42" y="54" width="8" height="6" rx="2" fill="#0284C7" />
      <ellipse cx="24" cy="14" rx="10" ry="3" fill="white" opacity="0.35" />
    </svg>
  );
}

function SecurityBar({ seimbang, killSwitch }: { seimbang: boolean; killSwitch: boolean }) {
  return (
    <div className={`overflow-hidden border-b ${killSwitch ? "border-red-200 bg-red-50" : "border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50"}`}>
      <div className="animate-marquee flex w-max items-center gap-8 py-1.5 text-[11px] font-medium text-navy">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex items-center gap-8 pr-8" aria-hidden={dup === 1}>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-600" /> SSL Active
            </span>
            <span className="flex items-center gap-1.5">
              {seimbang ? (
                <><Lock className="size-3.5 text-emerald-600" /> Ledger Balanced</>
              ) : (
                <><ShieldAlert className="size-3.5 animate-pulse text-amber-600" /> Ledger menunggu transaksi</>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5 text-sky-600" /> Backup Ready
            </span>
            <span className="text-muted-foreground">
              Pengumuman sistem: semua aksi admin tercatat di audit trail.
            </span>
            {killSwitch && (
              <span className="flex items-center gap-1.5 font-bold text-red-600">
                <ShieldAlert className="size-3.5 animate-pulse" /> KILL SWITCH AKTIF — pengajuan diblokir
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveLocationMap() {
  const data = useQuery(api.admin.petaPeminjam);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
      [DEFAULT_CONFIG.vaultLat, DEFAULT_CONFIG.vaultLng],
      11,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || data === undefined) return;
    layer.clearLayers();
    L.circleMarker([data.vault.lat, data.vault.lng], {
      radius: 10,
      color: "#0EA5E9",
      fillColor: "#38BDF8",
      fillOpacity: 0.9,
      weight: 3,
    })
      .bindTooltip("Gudang Brankas PINDAI", { direction: "top" })
      .addTo(layer);
    L.circle([data.vault.lat, data.vault.lng], {
      radius: data.gpsMismatchKm * 1000,
      color: "#38BDF8",
      fillColor: "#38BDF8",
      fillOpacity: 0.05,
      weight: 1,
      dashArray: "6 6",
    }).addTo(layer);
    const bounds = L.latLngBounds([L.latLng(data.vault.lat, data.vault.lng)]);
    for (const r of data.rows) {
      if (!r.posisi) continue;
      bounds.extend([r.posisi.lat, r.posisi.lng]);
      const warna = r.mismatch ? "#EF4444" : "#10B981";
      L.circleMarker([r.posisi.lat, r.posisi.lng], {
        radius: 7,
        color: warna,
        fillColor: warna,
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindTooltip(
          `<strong>${r.namaLengkap}</strong><br/>${r.nomorReferensi} · ${r.statusPinjaman}<br/>` +
            (r.mismatch ? `GPS MISMATCH` : r.jarakVaultKm !== null ? `${r.jarakVaultKm.toFixed(1)} km dari vault` : ""),
          { direction: "top" },
        )
        .addTo(layer);
    }
    map.fitBounds(bounds.pad(0.25));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Peta live OpenStreetMap (gratis) — posisi peminjam, gudang brankas, dan radius mismatch {data?.gpsMismatchKm ?? 50} km.
        </p>
        <div className="flex items-center gap-2 text-xs">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Dalam radius</Badge>
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">GPS Mismatch</Badge>
        </div>
      </div>
      {data === undefined ? (
        <div className="flex h-[420px] items-center justify-center rounded-2xl border border-sky-100 bg-white">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div ref={containerRef} className="z-0 h-[420px] overflow-hidden rounded-2xl border border-sky-100 shadow-[0_14px_30px_-20px_oklch(0.55_0.12_240/0.35)]" />
      )}
      {data !== undefined && (
        <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
          {data.rows.filter((r) => r.mismatch).map((r) => (
            <li key={r.userId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 truncate">
                <Badge className="mr-2 bg-red-100 text-red-700 hover:bg-red-100">GPS Mismatch</Badge>
                {r.namaLengkap} · {r.nomorReferensi}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {r.jarakVaultKm !== null ? `${r.jarakVaultKm.toFixed(1)} km dari vault` : ""}
              </span>
            </li>
          ))}
          {data.rows.every((r) => !r.mismatch) && (
            <li className="px-5 py-3 text-sm text-muted-foreground">Tidak ada peminjam di luar radius — semua posisi aman.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function PencairanTab({ onOpen }: { onOpen: (l: LoanRow) => void }) {
  const overview = useQuery(api.admin.adminOverview);
  if (overview === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const antrean = overview.loans.filter((l) => l.status === "disetujui");
  if (antrean.length === 0) {
    return <EmptyQueue icon={Wallet} title="Tidak ada pinjaman menunggu pencairan" />;
  }
  return (
    <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
      {antrean.map((l) => (
        <li key={l._id}>
          <QueueRow
            reference={l.nomorReferensi}
            date={formatDate(l._creationTime)}
            title={formatRupiah(l.pokokPinjaman)}
            subtitle={`${l.namaLengkap} · dana bersih ${formatRupiah(Math.round(l.pokokPinjaman * 0.95))} ke ${l.nomorRekening}`}
            status={<StatusBadge status={l.status} kind="loan" />}
            onOpen={() => onOpen(l)}
          />
        </li>
      ))}
    </ul>
  );
}

function DpdTab() {
  const overview = useQuery(api.admin.adminOverview);
  if (overview === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const terlambat = overview.loans.filter((l) => l.status === "didanai" && (l.hariTerlambat ?? 0) > 0);
  if (terlambat.length === 0) {
    return <EmptyQueue icon={BellRing} title="Tidak ada pinjaman terlambat — koleksi bersih" />;
  }
  return (
    <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
      {terlambat.map((l) => {
        const waText = encodeURIComponent(
          `Halo ${l.namaLengkap}, pengingat PINDAI untuk pinjaman ${l.nomorReferensi}. Total kewajiban Anda saat ini ${formatRupiah(l.totalKewajibanDenganPenalti ?? 0)} (terlambat ${l.hariTerlambat ?? 0} hari, termasuk denda ${formatRupiah(l.dendaTerlambat ?? 0)}). Mohon segera lakukan pelunasan. Terima kasih.`,
        );
        const waNomor = l.nomorWhatsApp ?? "";
        return (
          <li key={l._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.namaLengkap} — {formatRupiah(l.pokokPinjaman)}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {l.nomorReferensi} · terlambat <span className="font-semibold text-red-600">{l.hariTerlambat} hari</span> · denda {formatRupiah(l.dendaTerlambat ?? 0)} · total {formatRupiah(l.totalKewajibanDenganPenalti ?? 0)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {waNomor && (
                <a
                  href={`https://wa.me/${waNomor}?text=${waText}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_oklch(0.7_0.15_160/0.6)] transition-transform hover:-translate-y-0.5 hover:bg-emerald-600"
                >
                  <Send className="size-3.5" /> Kirim Tagihan WA
                </a>
              )}
              <StatusBadge status={l.status} kind="loan" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LelangTab() {
  const overview = useQuery(api.admin.adminOverview);
  const [nilaiLelang, setNilaiLelang] = useState<Record<string, string>>({});
  if (overview === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const kandidat = overview.pawns.filter((p) => p.status === "aktif" && (p.nilaiTaksiran ?? 0) > 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Simulasi lelang barang jaminan wanprestasi: masukkan harga lelang untuk menghitung sisa hasil setelah pemenuhan kewajiban (pokok + imbal hasil Pendana). Sisa dikembalikan ke Peminjam.
      </p>
      {kandidat.length === 0 ? (
        <EmptyQueue icon={Gavel} title="Belum ada barang gadai aktif untuk simulasi lelang" />
      ) : (
        <ul className="space-y-3">
          {kandidat.map((p) => {
            const input = nilaiLelang[p._id] ?? "";
            let hasil: string | null = null;
            try {
              const v = input.trim() === "" ? 0 : parseRupiah(input);
              const kewajiban = Math.round((p.nilaiTaksiran ?? 0) * 1.3);
              const sisa = v - kewajiban;
              hasil = v <= 0 ? null : sisa >= 0 ? `Sisa hasil lelang ${formatRupiah(sisa)} dikembalikan ke Peminjam.` : `Kekurangan ${formatRupiah(-sisa)} — kewajiban belum tertutup penuh.`;
            } catch {
              hasil = "Nominal tidak valid.";
            }
            return (
              <li key={p._id} className="rounded-2xl border border-sky-100 bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.deskripsiBarang}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.nomorReferensi} · {p.kategori} · taksiran {formatRupiah(p.nilaiTaksiran ?? 0)} · rak {p.kodeRakVault ?? "—"}
                    </p>
                  </div>
                  <Input
                    value={input}
                    onChange={(e) => setNilaiLelang((m) => ({ ...m, [p._id]: e.target.value }))}
                    placeholder="Harga lelang (mis. 8.000.000)"
                    className="w-56 rounded-full"
                  />
                </div>
                {hasil && <p className="mt-2 text-xs font-medium text-navy">{hasil}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LedgerTab() {
  const summary = useQuery(api.admin.ledgerSummary);
  const rows = useQuery(api.admin.ledgerRows);
  const [q, setQ] = useState("");
  if (summary === undefined || rows === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const filtered = q.trim()
    ? rows.filter(
        (r) =>
          r.groupId.includes(q.trim()) ||
          r.akun.toLowerCase().includes(q.trim().toLowerCase()) ||
          r.keterangan.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : rows;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Total Debit", formatRupiah(summary.totalDebit)],
          ["Total Kredit", formatRupiah(summary.totalKredit)],
          ["Jumlah Entri", `${summary.entryCount}`],
          ["Status", summary.seimbang ? "SEIMBANG" : "TIDAK SEIMBANG"],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${label === "Status" ? (summary.seimbang ? "text-emerald-600" : "text-red-600") : "text-navy"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari akun / grup / keterangan…" className="rounded-full" />
      <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-sky-100 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-secondary/70 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Waktu</th>
              <th className="px-4 py-2.5">Grup</th>
              <th className="px-4 py-2.5">Akun</th>
              <th className="px-4 py-2.5">Arah</th>
              <th className="px-4 py-2.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.slice(0, 200).map((r) => (
              <tr key={r._id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(r.waktu).toLocaleString("id-ID")}</td>
                <td className="max-w-32 truncate px-4 py-2 text-muted-foreground">{r.groupId}</td>
                <td className="px-4 py-2 font-medium">{r.akun}</td>
                <td className="px-4 py-2">
                  <span className={r.arah === "debit" ? "text-emerald-600" : "text-sky-600"}>{r.arah}</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatRupiah(r.jumlah)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BackupPanel() {
  const snapshot = useQuery(api.system.snapshotData);
  const ledgerRows = useQuery(api.admin.ledgerRows);
  const auditData = useQuery(api.system.getConfigAdmin);
  const catat = useMutation(api.system.catatBackup);
  const [busy, setBusy] = useState<string | null>(null);

  const unduhFile = (nama: string, isi: string, mime: string) => {
    const blob = new Blob([isi], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    a.click();
    URL.revokeObjectURL(url);
  };

  const unduhJson = async () => {
    if (!snapshot) return;
    setBusy("json");
    try {
      unduhFile(`pindai-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), "application/json");
      await catat({ jenis: "snapshot-json" });
      toast.success("Snapshot JSON terunduh & tercatat di audit.");
    } finally {
      setBusy(null);
    }
  };

  const unduhCsv = async () => {
    if (!ledgerRows) return;
    setBusy("csv");
    try {
      const head = "waktu,grup,akun,arah,jumlah,jenis,keterangan,aktor";
      const baris = ledgerRows
        .map((r) => `${new Date(r.waktu).toISOString()},${r.groupId},"${r.akun}",${r.arah},${r.jumlah},${r.jenis},"${r.keterangan}","${r.aktor}"`)
        .join("\n");
      unduhFile(`pindai-ledger-${new Date().toISOString().slice(0, 10)}.csv`, `${head}\n${baris}`, "text/csv");
      await catat({ jenis: "ledger-csv" });
      toast.success("Export CSV ledger terunduh.");
    } finally {
      setBusy(null);
    }
  };

  const unduhAuditPdf = async () => {
    if (!auditData) return;
    setBusy("pdf");
    try {
      const log = auditData.auditTerbaru;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Audit Trail PINDAI</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#0F172A}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}</style></head><body><h1>Audit Trail — Pinjam Gadai Digital</h1><p>Dicetak: ${new Date().toLocaleString("id-ID")}</p><table><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Target</th><th>Detail</th></tr>${log
        .map((a) => `<tr><td>${new Date(a.waktu).toLocaleString("id-ID")}</td><td>${a.aktorLabel}</td><td>${a.aksi}</td><td>${a.target ?? "-"}</td><td>${a.detail ?? "-"}</td></tr>`)
        .join("")}</table></body></html>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.print();
      }
      await catat({ jenis: "audit-pdf" });
      toast.success("Audit log dikirim ke dialog cetak PDF.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Database className="size-4 text-sky-600" /> Backup Data 1-Click
        </p>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start rounded-2xl" disabled={busy !== null || !snapshot} onClick={unduhJson}>
            {busy === "json" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-sky-600" />}
            Download Database Snapshot (.JSON)
          </Button>
          <Button variant="outline" className="w-full justify-start rounded-2xl" disabled={busy !== null || !ledgerRows} onClick={unduhCsv}>
            {busy === "csv" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-emerald-600" />}
            Export Ledger & Mutasi (.CSV)
          </Button>
          <Button variant="outline" className="w-full justify-start rounded-2xl" disabled={busy !== null || !auditData} onClick={unduhAuditPdf}>
            {busy === "pdf" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-amber-600" />}
            Export Audit Log (.PDF)
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Snapshot memuat seluruh pinjaman, gadai, setoran, pendanaan, dan pengguna (email disamarkan). Semua unduhan tercatat di audit trail.
        </p>
      </div>
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Lock className="size-4 text-emerald-600" /> Proteksi Data
        </p>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-sm font-medium">Auto-Watermark KTP</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Setiap dokumen KYC yang dibuka reviewer diberi overlay transparan VERIFIKASI PINDAI — mencegah penyalahgunaan foto identitas.
          </p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-sm font-medium">Session Timeout Admin</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Logout otomatis saat admin pasif diatur di tab Pengaturan System (default 30 menit).</p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-sm font-medium">Backup Ready</p>
          <p className="mt-1 text-xs leading-5 text-emerald-700">
            Snapshot siap: {snapshot ? `${snapshot.jumlah.loans} pinjaman, ${snapshot.jumlah.pawns} gadai` : "—"} · database dapat dipulihkan dari file JSON.
          </p>
        </div>
      </div>
    </div>
  );
}

function SystemConfigPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  const save = useMutation(api.system.saveConfig);
  const [form, setForm] = useState<typeof DEFAULT_CONFIG | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  if (form === null) setForm({ ...DEFAULT_CONFIG, ...data.config });
  if (form === null) return null;
  const upd = <K extends keyof typeof DEFAULT_CONFIG>(k: K, v: (typeof DEFAULT_CONFIG)[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Settings2 className="size-4 text-sky-600" /> Persentase Biaya & Bunga
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(["persenAdmin", "persenPlatform", "persenBunga"] as const).map((k) => (
            <div key={k}>
              <Label htmlFor={`cfg-${k}`}>{k === "persenAdmin" ? "Biaya admin %" : k === "persenPlatform" ? "Biaya platform %" : "Bunga %"}</Label>
              <Input
                id={`cfg-${k}`}
                type="number"
                min={0}
                value={form[k]}
                onChange={(e) => upd(k, Math.max(0, Number(e.target.value) || 0))}
                className="tabular-nums"
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-ltv">Maks LTV gadai (%)</Label>
            <Input id="cfg-ltv" type="number" min={1} max={100} value={form.maxLtvPersen} onChange={(e) => upd("maxLtvPersen", Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-session">Session timeout (menit, 0 = off)</Label>
            <Input id="cfg-session" type="number" min={0} value={form.sessionTimeoutMenit} onChange={(e) => upd("sessionTimeoutMenit", Math.max(0, Number(e.target.value) || 0))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-mismatch">Radius mismatch GPS (km)</Label>
            <Input id="cfg-mismatch" type="number" min={1} value={form.gpsMismatchKm} onChange={(e) => upd("gpsMismatchKm", Math.max(1, Number(e.target.value) || 1))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-vaultkm">Radius pencairan maks (km)</Label>
            <Input id="cfg-vaultkm" type="number" min={1} value={form.pencairanMaxKm} onChange={(e) => upd("pencairanMaxKm", Math.max(1, Number(e.target.value) || 1))} className="tabular-nums" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Maintenance Mode</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Situs menampilkan pengumuman perawatan untuk nasabah.</p>
          </div>
          <Switch checked={form.maintenanceMode} onCheckedChange={(v) => upd("maintenanceMode", v)} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-red-700">Kill Switch</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Memblokir seluruh pengajuan pinjaman & gadai seketika.</p>
          </div>
          <Switch checked={form.killSwitch} onCheckedChange={(v) => upd("killSwitch", v)} />
        </div>
        {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button
          className="gradient-primary rounded-full border-0"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await save({ ...form });
              toast.success("Konfigurasi sistem tersimpan.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Simpan konfigurasi
        </Button>
      </div>
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <MapPin className="size-4 text-emerald-600" /> Lokasi Gudang Brankas
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-vlat">Latitude vault</Label>
            <Input id="cfg-vlat" type="number" step="any" value={form.vaultLat} onChange={(e) => upd("vaultLat", Number(e.target.value) || 0)} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-vlng">Longitude vault</Label>
            <Input id="cfg-vlng" type="number" step="any" value={form.vaultLng} onChange={(e) => upd("vaultLng", Number(e.target.value) || 0)} className="tabular-nums" />
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Koordinat ini menjadi pusat peta Live Location dan acuan perhitungan jarak GPS mismatch peminjam.
        </p>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Terakhir diubah oleh</p>
          <p className="mt-1 text-sm font-medium text-navy">{data.diperbaruiOleh}</p>
        </div>
      </div>
    </div>
  );
}

function AuditTrailPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  if (data === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  return (
    <div className="rounded-2xl border border-sky-100 bg-white">
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-sm font-semibold text-navy">Rekam jejak aktivitas admin</p>
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{data.auditTerbaru.length} entri terbaru</Badge>
      </div>
      <ul className="divide-y divide-border/40">
        {data.auditTerbaru.map((a) => (
          <li key={a._id} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-semibold text-navy">{a.aktorLabel}</span>{" "}
                <Badge variant="outline" className="mx-1 text-[10px] uppercase">{a.aksi}</Badge>{" "}
                <span className="text-muted-foreground">{a.target ?? ""}</span>
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">{new Date(a.waktu).toLocaleString("id-ID")}</span>
            </div>
            {a.detail && <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>}
          </li>
        ))}
        {data.auditTerbaru.length === 0 && (
          <li className="px-5 py-6 text-sm text-muted-foreground">Belum ada aktivitas tercatat.</li>
        )}
      </ul>
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

        <EContractWidget kind="pawn" pawnId={row._id} pawnRef={row.nomorReferensi} />

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
  const [hargaPasar, setHargaPasar] = useState("");
  const [kondisi, setKondisi] = useState("");
  const [rak, setRak] = useState("");
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
  const parsedPasar = (() => {
    if (hargaPasar.trim() === "") return null;
    try {
      return parseRupiah(hargaPasar);
    } catch {
      return null;
    }
  })();
  const hint =
    LTV_HINTS[pawn.kategori as CollateralCategory] ??
    "hingga 60% dari nilai taksiran";

  const ltvPersen =
    parsedPasar !== null && parsedPasar > 0 && parsed !== null
      ? Math.round((parsed / parsedPasar) * 100)
      : null;
  const ltvMelebihi = ltvPersen !== null && ltvPersen > 70;

  const submit = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan nilai taksiran rupiah bulat yang valid.");
      return;
    }
    if (ltvMelebihi) {
      setError("LTV " + ltvPersen + "% melebihi batas maksimum 70% dari harga pasar.");
      return;
    }
    setBusy(true);
    try {
      await approvePawn({
        pawnId: pawn._id,
        nilaiTaksiran: parsed,
        ...(parsedPasar !== null ? { hargaPasar: parsedPasar } : {}),
        ...(kondisi.trim() ? { kondisiFisik: kondisi.trim() } : {}),
        ...(rak.trim() ? { kodeRakVault: rak.trim().toUpperCase() } : {}),
      });
      toast.success("Appraisal tersimpan & gadai disetujui.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan taksiran.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Appraisal gadai</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {pawn.deskripsiBarang}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="harga-pasar">Harga pasar (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                <Input
                  id="harga-pasar"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={hargaPasar}
                  onChange={(e) => setHargaPasar(e.target.value)}
                  onBlur={() => {
                    if (parsedPasar !== null) setHargaPasar(formatRupiah(parsedPasar).replace("Rp ", ""));
                  }}
                  placeholder="12.000.000"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taksiran">Nilai taksiran (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
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
            </div>
          </div>
          {ltvPersen !== null && (
            <p className={ltvMelebihi ? "text-xs font-medium text-destructive" : "text-xs font-medium text-emerald-600"}>
              LTV otomatis: {ltvPersen}% dari harga pasar (maksimum 70%).
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kondisi">Kondisi fisik</Label>
              <Input
                id="kondisi"
                value={kondisi}
                onChange={(e) => setKondisi(e.target.value)}
                placeholder="Mis. 95% mulus, dus + charger lengkap"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rak">Kode rak brankas</Label>
              <Input
                id="rak"
                value={rak}
                onChange={(e) => setRak(e.target.value)}
                placeholder="Mis. A-12"
                disabled={busy}
              />
            </div>
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

// =====================================================================
// Panel Keamanan Login — log login append-only + sesi aktif + 2FA admin
// =====================================================================

function LoginSecurityPanel({ onOpenSetup }: { onOpenSetup: () => void }) {
  const logs = useQuery(api.security.getLoginLogs, {});
  const overviewKeam = useQuery(api.security.getSecurityOverview, {});
  const sessions = useQuery(api.security.mySessions, {});
  const totpStatus = useQuery(api.security.myTotpStatus, {});

  return (
    <div className="space-y-6">
      {/* Ringkasan 24 jam */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Login 24 jam", overviewKeam?.totalBaru ?? 0, "sky"],
          ["Gagal", overviewKeam?.gagal ?? 0, "amber"],
          ["Diblokir (rate limit)", overviewKeam?.diblokir ?? 0, "red"],
          ["Anomali IP baru", overviewKeam?.anomali ?? 0, "red"],
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
                  : tone === "amber"
                    ? "text-amber-600"
                    : "text-navy"
              }`}
            >
              {value as number}
            </p>
          </div>
        ))}
      </section>

      {/* 2FA admin */}
      <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Two-Factor Authentication (TOTP)</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Wajib untuk Super Admin — kode 6 digit dari Google Authenticator/Authy
              diminta setiap sesi browser baru sebelum panel terbuka.
            </p>
          </div>
          {totpStatus?.aktif ? (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <ShieldCheck className="mr-1 size-3" /> 2FA Aktif
            </Badge>
          ) : (
            <Button size="sm" className="rounded-full" onClick={onOpenSetup}>
              <ShieldCheck className="mr-1.5 size-3.5" /> Aktifkan 2FA
            </Button>
          )}
        </div>
      </section>

      {/* Sesi aktif */}
      <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <h3 className="text-sm font-semibold">Sesi aktif (single active session)</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Login di perangkat baru otomatis menggugurkan sesi lama. Admin dengan 2FA
          wajib lolos verifikasi TOTP untuk mengaktifkan sesi.
        </p>
        {sessions === undefined ? (
          <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Tidak ada sesi aktif.</p>
        ) : (
          <ul className="mt-4 divide-y divide-sky-100">
            {sessions.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.perangkat}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    IP {s.ip} · mulai {formatDate(s.waktuMulai)}
                  </p>
                </div>
                <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  Aktif
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Log login append-only */}
      <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Log login (append-only)</h3>
          <Badge variant="outline" className="text-[10px]">
            100 entri terakhir
          </Badge>
        </div>
        {logs === undefined ? (
          <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />
        ) : logs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Belum ada aktivitas login tercatat.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-sky-100 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Metode</th>
                  <th className="py-2 pr-3 font-medium">IP</th>
                  <th className="py-2 font-medium">Perangkat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">
                {logs.map((l) => (
                  <tr key={l._id} className="align-top">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs tabular-nums text-muted-foreground">
                      {new Date(l.waktu).toLocaleString("id-ID")}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          l.status === "berhasil"
                            ? "bg-emerald-100 text-emerald-700"
                            : l.status === "diblokir"
                              ? "bg-red-100 text-red-700"
                              : l.status === "dipertanyakan"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-50 text-red-600"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">{l.metode}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{l.ip}</td>
                    <td className="max-w-40 truncate py-2.5 text-xs text-muted-foreground" title={l.userAgent}>
                      {l.userAgent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
