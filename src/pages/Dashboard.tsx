import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CalendarClock,
  FileText,
  Landmark,
  Loader2,
  LogOut,
  MapPin,
  Package,
  ScrollText,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import SignaturePad from "signature_pad";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ContractPrintButton } from "@/components/EContract";
import {
  buildPinjamanContract,
  judulContract,
  nomorContract,
} from "@/lib/contract";
import {
  LOAN_PURPOSE_OPTIONS,
  loanPurposeLabel,
  loanStatusMeta,
  quoteLoan,
  TENOR_OPTIONS,
} from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";
import { KYC_FILES, MAX_FILE_BYTES, validateKycInput, type KycFileKey } from "@/lib/kyc";
import {
  COLLATERAL_CATEGORIES,
  LTV_HINTS,
  pawnStatusMeta,
  type CollateralCategory,
  type PawnStatus,
} from "@/lib/pawn";
import { DEFAULT_CONFIG } from "@/lib/system-config";
import {
  proyeksiJadwalGadai,
  sewaModalBerikutnya,
} from "@/lib/gadai";

// PINDAI — dashboard nasabah
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
/** Basemap cadangan bila tile OSM tidak dapat dimuat dari jaringan pengguna. */
const FALLBACK_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Baris jadwal pinjaman dari server (myLoanSchedule) — tipe bersama UI. */
type LoanScheduleRow = {
  _id: Id<"loans">;
  nomorReferensi: string;
  pokokPinjaman: number;
  status: string;
  tenorHari: number;
  didanaiPada: number | null;
  quote: ReturnType<typeof quoteLoan>;
  pelunasan: {
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
    totalKewajibanDenganPenalti: number;
  } | null;
};

// =====================================================================
// Ikon halaman memakai ikon garis lucide yang diimpor di atas.
// =====================================================================

// =====================================================================
// Status pill (LUNAS / MENUNGGU / OVERDUE / JATUH TEMPO) sesuai semantik
// warna spesifikasi: mint sukses, amber menunggu, coral merah.
// =====================================================================

function ScheduleBadge({
  state,
}: {
  state: "lunas" | "menunggu" | "overdue";
}) {
  if (state === "lunas") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        LUNAS
      </Badge>
    );
  }
  if (state === "overdue") {
    return (
      <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">
        OVERDUE
      </Badge>
    );
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
      MENUNGGU
    </Badge>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const loans = useQuery(api.loans.listMyLoans);
  const summary = useQuery(api.loans.myLoanSummary);
  const pawns = useQuery(api.loans.listMyPawns);
  const dueReminder = useQuery(api.loans.dueReminder);
  const schedule = useQuery(api.loans.myLoanSchedule);
  const contracts = useQuery(api.loans.myContracts);

  const [loanDetailId, setLoanDetailId] = useState<Id<"loans"> | null>(null);
  const [pawnDetailId, setPawnDetailId] = useState<Id<"pawns"> | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isLoading =
    loans === undefined ||
    summary === undefined ||
    pawns === undefined ||
    dueReminder === undefined ||
    schedule === undefined ||
    contracts === undefined;

  // ===== Ringkasan keuangan (3 kartu utama) =====
  const danaBersihTotal = useMemo(
    () => (schedule ?? []).reduce((acc, l) => acc + l.quote.danaBersihDitransfer, 0),
    [schedule],
  );
  const totalKewajiban = useMemo(
    () => (schedule ?? []).reduce((acc, l) => acc + l.quote.totalKewajibanPelunasan, 0),
    [schedule],
  );
  const sisaTagihan = useMemo(() => {
    const aktif = (schedule ?? []).filter((l) => l.status === "didanai");
    return aktif.reduce((acc, l) => acc + (l.pelunasan?.totalKewajibanDenganPenalti ?? 0), 0);
  }, [schedule]);
  const jatuhTempoTerdekat = useMemo(() => {
    const aktif = (schedule ?? []).filter((l) => l.status === "didanai" && l.pelunasan);
    if (aktif.length === 0) return null;
    return aktif.reduce((min, l) =>
      (l.pelunasan?.jatuhTempoPada ?? Infinity) < (min.pelunasan?.jatuhTempoPada ?? Infinity) ? l : min,
    );
  }, [schedule]);

  const greetingName = user?.name ?? user?.email?.split("@")[0] ?? "Nasabah";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Header ===== */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#2563eb] text-sm font-bold text-white">
              P
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.14em] sm:block">
              PINDAI
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-semibold">Halo, {greetingName} 👋</p>
              <Badge className="mt-0.5 hidden border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100 sm:inline-flex">
                <ShieldCheck className="mr-1 size-3" /> KTP Terverifikasi
              </Badge>
            </div>
            <div className="gradient-primary flex size-9 items-center justify-center rounded-full text-sm font-bold text-primary-foreground shadow-glow">
              {greetingName.charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {user?.role === "admin" && (
              <Button asChild variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex">
                <Link to="/admin">Panel Admin</Link>
              </Button>
            )}
            {user?.role === "pendana" && (
              <Button asChild variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex">
                <Link to="/pendana">Ruang Pendana</Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {isLoading ? (
          <div className="mt-20 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat data Anda…
          </div>
        ) : (
          <>
            {/* Pengingat jatuh tempo live */}
            {dueReminder !== null && <DueReminderBanner reminder={dueReminder} />}

            {/* Persetujuan pelacakan lokasi (opt-in, dapat dicabut) */}
            <LocationConsentCard />

            {/* ===== Ringkasan keuangan ===== */}
            <section className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Dana Bersih Diterima</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600">
                      {formatRupiah(danaBersihTotal)}
                    </p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Wallet className="size-5" strokeWidth={2} />
                  </span>
                </div>
              </div>

              <div className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Kewajiban Pelunasan</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatRupiah(totalKewajiban)}
                    </p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <CalendarClock className="size-5" strokeWidth={2} />
                  </span>
                </div>
              </div>

              <div className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Sisa Tagihan Berjalan</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-destructive">
                      {formatRupiah(sisaTagihan)}
                    </p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Package className="size-5" strokeWidth={2} />
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {jatuhTempoTerdekat
                    ? `Jatuh tempo ${jatuhTempoTerdekat.pelunasan?.hariTerlambat && jatuhTempoTerdekat.pelunasan.hariTerlambat > 0 ? `terlambat ${jatuhTempoTerdekat.pelunasan.hariTerlambat} hari` : `${jatuhTempoTerdekat.pelunasan?.sisaHari ?? 0} hari lagi`}`
                    : "Tidak ada tagihan aktif saat ini."}
                </p>
              </div>
            </section>

            {/* ===== Tab navigasi floating pills ===== */}
            <Tabs defaultValue="pinjaman" className="mt-8">
              <TabsList className="flex w-full flex-wrap gap-2 overflow-x-auto bg-transparent p-0">
                {(
                  [
                    ["pinjaman", "Pinjaman Aktif", <Wallet key="i" className="size-4" />],
                    ["jadwal", "Jadwal Angsuran", <CalendarClock key="i" className="size-4" />],
                    ["gadai", "Jaminan Gadai Saya", <Package key="i" className="size-4" />],
                    ["kontrak", "E-Contract Saya", <FileText key="i" className="size-4" />],
                    ["form", "Form Pengajuan Baru", <Send key="i" className="size-4" />],
                    ["riwayat", "Riwayat Transaksi", <ScrollText key="i" className="size-4" />],
                  ] as Array<[string, string, React.ReactNode]>
                ).map(([value, label, icon]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium shadow-sm transition-all data-[state=active]:border-0 data-[state=active]:shadow-glow"
                  >
                    <span className="mr-1.5 inline-flex align-middle">{icon}</span>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* ============ TAB 1: PINJAMAN AKTIF ============ */}
              <TabsContent value="pinjaman" className="mt-8">
                <ActiveLoanSection
                  schedule={schedule ?? []}
                  onOpenDetail={setLoanDetailId}
                />
              </TabsContent>

              {/* ============ TAB 2: JADWAL ANGSURAN ============ */}
              <TabsContent value="jadwal" className="mt-8">
                <ScheduleSection schedule={schedule ?? []} />
              </TabsContent>

              {/* ============ TAB 3: JAMINAN GADAI ============ */}
              <TabsContent value="gadai" className="mt-8">
                <div className="space-y-8">
                  <GadaiBillingSection pawns={pawns ?? []} />
                  <PawnVaultSection pawns={pawns ?? []} onOpenDetail={setPawnDetailId} />
                </div>
              </TabsContent>

              {/* ============ TAB 4: E-CONTRACT ============ */}
              <TabsContent value="kontrak" className="mt-8">
                <MyContractsSection contracts={contracts} />
              </TabsContent>

              {/* ============ TAB 5: FORM PENGAJUAN ============ */}
              <TabsContent value="form" className="mt-8">
                <div className="grid gap-8 lg:grid-cols-2">
                  <section>
                    <h2 className="text-lg font-semibold">Form Pengajuan Pinjaman</h2>
                    <Separator className="my-4" />
                    <LoanForm
                      onCreated={(ref) =>
                        toast.success(`Pengajuan terkirim — nomor referensi ${ref}`)
                      }
                    />
                  </section>
                  <section>
                    <h2 className="text-lg font-semibold">Gadaikan Barang</h2>
                    <Separator className="my-4" />
                    <PawnForm
                      onCreated={() =>
                        toast.success(
                          "Pengajuan gadai terkirim — tim kami akan menghubungi Anda untuk penjadwalan pemeriksaan.",
                        )
                      }
                    />
                  </section>
                </div>
              </TabsContent>

              {/* ============ TAB 6: RIWAYAT ============ */}
              <TabsContent value="riwayat" className="mt-8">
                <HistorySection loans={loans ?? []} pawns={pawns ?? []} onOpenLoan={setLoanDetailId} onOpenPawn={setPawnDetailId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <LoanDetailDialog loanId={loanDetailId} onClose={() => setLoanDetailId(null)} />
      <PawnDetailDialog pawnId={pawnDetailId} onClose={() => setPawnDetailId(null)} />

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-xs leading-5 text-muted-foreground">
          PINDAI — Pinjam & Gadai Digital. Dana bersih 95%, total kewajiban 130%,
          didanai oleh Pendana terverifikasi. Pengajuan memerlukan verifikasi KTP
          dan lokasi real.
        </div>
      </footer>
    </div>
  );
}

// =====================================================================
// Tab 1 — Pinjaman aktif dengan rincian transparansi finansial presisi
// =====================================================================

function ActiveLoanSection({
  schedule,
  onOpenDetail,
}: {
  schedule: Array<LoanScheduleRow>;
  onOpenDetail: (id: Id<"loans">) => void;
}) {
  const aktif = schedule.filter((l) => l.status === "didanai");
  const lainnya = schedule.filter((l) => l.status !== "didanai" && l.status !== "lunas");

  if (aktif.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Belum ada pinjaman berjalan"
        body="Pinjaman yang sudah didanai Pendana akan tampil di sini lengkap dengan rincian biayanya. Mulai dari tab Form Pengajuan Baru."
      />
    );
  }

  return (
    <div className="space-y-6">
      {aktif.map((l) => (
        <ActiveLoanCard key={l._id} loan={l} onOpenDetail={onOpenDetail} />
      ))}
      {lainnya.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Sedang diproses</h3>
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {lainnya.map((l) => (
              <li key={l._id}>
                <button
                  type="button"
                  onClick={() => onOpenDetail(l._id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-sky-50/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tabular-nums">
                      {formatRupiah(l.pokokPinjaman)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{l.nomorReferensi}</p>
                  </div>
                  <StatusBadge status={l.status} kind="loan" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ActiveLoanCard({
  loan,
  onOpenDetail,
}: {
  loan: LoanScheduleRow;
  onOpenDetail: (id: Id<"loans">) => void;
}) {
  const q = loan.quote;
  const terlambat = (loan.pelunasan?.hariTerlambat ?? 0) > 0;
  const [payOpen, setPayOpen] = useState(false);

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Nomor Referensi <span className="font-mono font-semibold text-navy">{loan.nomorReferensi}</span>
          </p>
          <h3 className="mt-1 text-lg font-bold">Pinjaman Tunai Digital</h3>
        </div>
        <div className="flex items-center gap-2">
          {terlambat ? (
            <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">JATUH TEMPO TERLEWAT</Badge>
          ) : (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">AKTIF</Badge>
          )}
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onOpenDetail(loan._id)}>
            Detail <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </div>
      </div>

      {/* Rincian transparansi presisi */}
      <dl className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
        {[
          ["Pokok Pengajuan", formatRupiah(q.pokok), ""],
          ["Biaya Admin (3%)", `- ${formatRupiah(q.biayaAdmin)}`, "text-muted-foreground"],
          ["Biaya Platform (2%)", `- ${formatRupiah(q.biayaPlatform)}`, "text-muted-foreground"],
        ].map(([label, value, extra]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 bg-white px-4 py-2.5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className={`text-sm tabular-nums ${extra}`}>{value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 bg-emerald-50 px-4 py-3">
          <dt className="text-sm font-semibold text-emerald-800">DANA BERSIH DITERIMA (95%)</dt>
          <dd className="text-sm font-bold tabular-nums text-emerald-700">
            {formatRupiah(q.danaBersihDitransfer)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 bg-white px-4 py-2.5">
          <dt className="text-sm text-muted-foreground">Bunga Pinjaman (30%)</dt>
          <dd className="text-sm tabular-nums">{formatRupiah(q.bunga)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 bg-sky-50 px-4 py-3">
          <dt className="text-sm font-semibold">TOTAL REPAYMENT (130%)</dt>
          <dd className="text-sm font-bold tabular-nums">{formatRupiah(q.totalKewajibanPelunasan)}</dd>
        </div>
      </dl>

      {/* Progress pelunasan */}
      {loan.pelunasan && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">
              {terlambat
                ? `Terlambat ${loan.pelunasan.hariTerlambat} hari`
                : loan.pelunasan.sisaHari === 0
                  ? "Jatuh tempo hari ini"
                  : `${loan.pelunasan.sisaHari} hari menuju jatuh tempo`}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatDate(loan.pelunasan.jatuhTempoPada)}
            </span>
          </div>
          <Progress
            className="mt-2 h-2.5"
            value={terlambat ? 100 : Math.max(4, 100 - Math.round((loan.pelunasan.sisaHari / Math.max(1, loan.pelunasan.sisaHari + 1)) * 100))}
          />
          {terlambat && (
            <p className="mt-2 text-xs text-destructive">
              Denda berjalan: {formatRupiah(loan.pelunasan.dendaTerlambat)} (0,5%/hari, maks 15%)
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          className="gradient-primary shadow-glow rounded-full border-0 font-medium transition-transform hover:-translate-y-0.5"
          onClick={() => setPayOpen(true)}
        >
          <Wallet className="mr-1.5 size-4" />
          Bayar Angsuran / Pelunasan
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <a
            href="https://wa.me/6281234567890?text=Halo%20CS%20PINDAI%2C%20saya%20ingin%20bertanya%20tentang%20pinjaman%20saya."
            target="_blank"
            rel="noreferrer"
          >
            <Send className="mr-1.5 size-4" /> Buka Chat WA CS
          </a>
        </Button>
      </div>

      {/* Dialog QRIS / VA simulasi */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bayar Angsuran / Pelunasan</DialogTitle>
            <DialogDescription>
              Pilih metode pembayaran simulasi — QRIS atau Virtual Account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-sky-50/60 p-4 text-center">
              <p className="text-xs text-muted-foreground">Total kewajiban saat ini</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {formatRupiah(loan.pelunasan?.totalKewajibanDenganPenalti ?? q.totalKewajibanPelunasan)}
              </p>
              {terlambat && (
                <p className="mt-1 text-xs text-destructive">
                  termasuk denda {formatRupiah(loan.pelunasan?.dendaTerlambat ?? 0)}
                </p>
              )}
            </div>
            <PaySimTabs total={loan.pelunasan?.totalKewajibanDenganPenalti ?? q.totalKewajibanPelunasan} loanRef={loan.nomorReferensi} />
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

/** Simulasi pembayaran: QRIS + Virtual Account (angka simulasi, tanpa aset). */
function PaySimTabs({ total, loanRef }: { total: number; loanRef: string }) {
  const vaNumber = `8808${loanRef.replace(/\D/g, "").slice(-8).padStart(8, "0")}`;
  return (
    <Tabs defaultValue="qris">
      <TabsList className="grid w-full grid-cols-2 rounded-full bg-sky-50 p-1">
        <TabsTrigger value="qris" className="rounded-full text-xs">QRIS</TabsTrigger>
        <TabsTrigger value="va" className="rounded-full text-xs">Virtual Account</TabsTrigger>
      </TabsList>
      <TabsContent value="qris" className="mt-4">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-5">
          {/* QRIS simulasi — pola QR deterministik dari jumlah (dekoratif). */}
          <QrSim total={total} />
          <p className="text-xs text-muted-foreground">
            Pindai QR simulasi ini — pembayaran nyata dicatat saat tim mengonfirmasi.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="va" className="mt-4">
        <div className="rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-muted-foreground">Nomor Virtual Account (simulasi)</p>
          <p className="mt-1 font-mono text-lg font-bold tracking-wider">{vaNumber}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 rounded-full"
            onClick={() => {
              void navigator.clipboard.writeText(vaNumber);
              toast.success("Nomor VA disalin.");
            }}
          >
            Salin nomor
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}

/** QR dekoratif deterministik (simulasi) — murni visual, tanpa pustaka eksternal. */
function QrSim({ total }: { total: number }) {
  const cells = 21;
  const seed = total % 2147483647 || 1;
  let state = seed;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const grid: boolean[][] = Array.from({ length: cells }, () =>
    Array.from({ length: cells }, () => rand() > 0.5),
  );
  // Corner finder patterns agar terlihat seperti QR.
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = edge || core;
      }
  };
  finder(0, 0);
  finder(0, cells - 7);
  finder(cells - 7, 0);
  const size = 9;
  return (
    <svg width={216} height={216} viewBox={`0 0 ${cells * size} ${cells * size}`} className="rounded-xl bg-white p-1" role="img" aria-label="QRIS simulasi">
      {grid.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c * size} y={r * size} width={size} height={size} fill="#0F172A" rx={1.5} /> : null,
        ),
      )}
    </svg>
  );
}

// =====================================================================
// Tab 2 — Jadwal angsuran
// =====================================================================

function ScheduleSection({
  schedule,
}: {
  schedule: LoanScheduleRow[];
}) {
  const repayLoan = useMutation(api.loans.repayLoan);
  const [busyId, setBusyId] = useState<Id<"loans"> | null>(null);

  const bayar = async (id: Id<"loans">) => {
    setBusyId(id);
    try {
      const r = await repayLoan({ loanId: id });
      toast.success(
        r.dendaTerlambat > 0
          ? `Pelunasan tercatat — total dibayar ${formatRupiah(r.totalDibayar)} (termasuk denda ${formatRupiah(r.dendaTerlambat)}).`
          : `Pelunasan tercatat — total dibayar ${formatRupiah(r.totalDibayar)}. Terima kasih!`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pelunasan gagal.");
    } finally {
      setBusyId(null);
    }
  };

  if (schedule.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Belum ada jadwal angsuran"
        body="Setelah pinjaman Anda didanai, tagihan dan tanggal jatuh tempo tampil di sini secara otomatis."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {schedule.map((l, idx) => {
        const lunas = l.status === "lunas";
        const overdue = !lunas && (l.pelunasan?.hariTerlambat ?? 0) > 0;
        const state: "lunas" | "menunggu" | "overdue" = lunas ? "lunas" : overdue ? "overdue" : "menunggu";
        return (
          <li
            key={l._id}
            className={`card-lift rounded-2xl border bg-white p-5 shadow-sm ${
              overdue ? "border-red-200" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  Angsuran #{idx + 1} — <span className="font-mono text-xs text-muted-foreground">{l.nomorReferensi}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pokok {formatRupiah(l.pokokPinjaman)} · Bunga (30%) {formatRupiah(l.quote.bunga)} ·
                  tenor {l.tenorHari} hari
                </p>
              </div>
              <ScheduleBadge state={state} />
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Jatuh tempo</dt>
                <dd className="tabular-nums">
                  {l.pelunasan ? formatDate(l.pelunasan.jatuhTempoPada) : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Total pembayaran</dt>
                <dd className="font-semibold tabular-nums">
                  {formatRupiah(
                    lunas
                      ? l.quote.totalKewajibanPelunasan
                      : (l.pelunasan?.totalKewajibanDenganPenalti ?? l.quote.totalKewajibanPelunasan),
                  )}
                </dd>
              </div>
              {!lunas && l.pelunasan && l.pelunasan.dendaTerlambat > 0 && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-destructive">Denda keterlambatan</dt>
                  <dd className="tabular-nums text-destructive">
                    +{formatRupiah(l.pelunasan.dendaTerlambat)}
                  </dd>
                </div>
              )}
              {!lunas && l.pelunasan && !overdue && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Sisa waktu</dt>
                  <dd className="tabular-nums">
                    {l.pelunasan.sisaHari === 0 ? "Hari ini" : `${l.pelunasan.sisaHari} hari`}
                  </dd>
                </div>
              )}
            </dl>
            {!lunas && (
              <Button
                size="sm"
                className="gradient-primary mt-4 rounded-full border-0"
                disabled={busyId !== null}
                onClick={() => void bayar(l._id)}
              >
                {busyId === l._id ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                Bayar Sekarang
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// =====================================================================
// Tab 3a — Tagihan Gadai (Skema B): sewa modal menurun + cicil pokok
// =====================================================================

/** Parse input cicilan menjadi rupiah bulat positif (tanpa null/float). */
function parseCicilan(raw: string): Rupiah | null {
  const cleaned = raw.replace(/[rp\s.]/gi, "").replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const v = Math.round(Number(cleaned));
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

function GadaiBillingSection({
  pawns,
}: {
  pawns: Array<{
    _id: Id<"pawns">;
    nomorReferensi: string;
    deskripsiBarang: string;
    status: string;
    pokokGadai?: number;
    sisaPokok?: number;
    persenSewaModal?: number;
  }>;
}) {
  const bayarGadai = useMutation(api.gadai.bayarGadai);
  const [busyId, setBusyId] = useState<Id<"pawns"> | null>(null);

  // Zero Fake Data: hanya gadai dengan pokok sah (ditetapkan admin) yang
  // menampilkan tagihan. Gadai belum dinilai tidak membuat kartu kosong.
  const berjalan = pawns.filter((p) => {
    const pokok = p.pokokGadai ?? 0;
    const sisa = p.sisaPokok ?? pokok;
    return pokok > 0 && sisa > 0 && p.status === "aktif";
  });
  const siapDiambil = pawns.filter(
    (p) =>
      (p.pokokGadai ?? 0) > 0 &&
      (p.sisaPokok ?? 0) <= 0 &&
      p.status === "menunggu_pelepasan",
  );

  /** Jalankan pembayaran via mutation; true bila berhasil (append-only). */
  const handleBayar = async (
    pawnId: Id<"pawns">,
    cicilPokok: number,
    bayarHanyaSewa: boolean,
  ): Promise<boolean> => {
    setBusyId(pawnId);
    try {
      const r = await bayarGadai({ pawnId, cicilPokok, bayarHanyaSewa });
      if (r.custody === "SIAP_DIAMBIL") {
        toast.success(
          "Lunas! Sisa pokok Rp0 — barang Anda SIAP_DIAMBIL dari Vault Custody.",
        );
      } else {
        toast.success(
          `Bayar ${formatRupiah(r.totalBayar)} — sisa pokok ${formatRupiah(r.sisaPokokSetelah)}, sewa berikutnya ${formatRupiah(r.sewaModalBerikut)} (otomatis turun).`,
        );
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pembayaran gadai gagal.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  if (berjalan.length === 0 && siapDiambil.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold">Tagihan Gadai — Sewa Modal Menurun</h2>
      <Separator className="my-4" />
      <div className="space-y-4">
        {siapDiambil.map((p) => (
          <div
            key={p._id}
            className="card-lift rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.deskripsiBarang}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.nomorReferensi}</p>
              </div>
              <Badge className="border-0 bg-emerald-500 text-white hover:bg-emerald-500">
                SIAP_DIAMBIL
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-emerald-800">
              Sisa pokok <b>Rp0</b> — seluruh kewajiban lunas. Barang Anda bebas
              diambil dari Gudang Brankas PINDAI; ajukan pelepasan pada kartu di
              bawah dan petugas akan mengonfirmasi pengembalian.
            </p>
          </div>
        ))}
        {berjalan.map((p) => (
          <GadaiBillingCard
            key={p._id}
            pawn={{
              _id: p._id,
              nomorReferensi: p.nomorReferensi,
              deskripsiBarang: p.deskripsiBarang,
              pokokGadai: p.pokokGadai ?? 0,
              sisaPokok: p.sisaPokok ?? p.pokokGadai ?? 0,
              persenSewaModal: p.persenSewaModal ?? 5,
            }}
            busy={busyId === p._id}
            onBayar={handleBayar}
          />
        ))}
      </div>
    </section>
  );
}

function GadaiBillingCard({
  pawn,
  busy,
  onBayar,
}: {
  pawn: {
    _id: Id<"pawns">;
    nomorReferensi: string;
    deskripsiBarang: string;
    pokokGadai: number;
    sisaPokok: number;
    persenSewaModal: number;
  };
  busy: boolean;
  onBayar: (
    pawnId: Id<"pawns">,
    cicilPokok: number,
    bayarHanyaSewa: boolean,
  ) => Promise<boolean>;
}) {
  const [cicil, setCicil] = useState("");
  const sisa = pawn.sisaPokok;
  const persen = pawn.persenSewaModal;
  const sewaSekarang = sewaModalBerikutnya(sisa, persen);

  // Simulasi live (mesin yang sama dengan server — integer exact):
  const cicilSim = useMemo(() => {
    const v = parseCicilan(cicil);
    if (v === null || v > sisa) return null;
    return v;
  }, [cicil, sisa]);
  const sewaSetelah =
    cicilSim !== null ? sewaModalBerikutnya(sisa - cicilSim, persen) : null;
  const proyeksi = useMemo(
    () =>
      cicilSim !== null ? proyeksiJadwalGadai(sisa, persen, cicilSim, 6) : [],
    [cicilSim, sisa, persen],
  );

  const tercicil = pawn.pokokGadai - sisa;
  const persenTercicil = Math.min(
    100,
    Math.round((tercicil / Math.max(1, pawn.pokokGadai)) * 100),
  );

  return (
    <div className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{pawn.deskripsiBarang}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{pawn.nomorReferensi}</p>
        </div>
        <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          DALAM_VAULT
        </Badge>
      </div>

      <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Sisa pokok berjalan</dt>
          <dd className="font-semibold tabular-nums">{formatRupiah(sisa)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Sewa modal berikutnya</dt>
          <dd className="tabular-nums">
            {formatRupiah(sewaSekarang)}{" "}
            <span className="text-xs text-muted-foreground">
              ({persen}% × sisa pokok, per 30 hari)
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>Pokok tercicil</span>
          <span className="tabular-nums">
            {formatRupiah(tercicil)} / {formatRupiah(pawn.pokokGadai)}
          </span>
        </div>
        <Progress value={persenTercicil} className="mt-1.5" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`cicil-${pawn._id}`}>Cicil pokok (opsional)</Label>
          <Input
            id={`cicil-${pawn._id}`}
            inputMode="numeric"
            placeholder="Mis. 1000000"
            value={cicil}
            onChange={(e) => setCicil(e.target.value)}
            className="tabular-nums"
            disabled={busy}
          />
          {cicilSim !== null && sewaSetelah !== null && (
            <p className="mt-1.5 text-xs text-emerald-700">
              Setelah cicil {formatRupiah(cicilSim)}: sewa berikutnya turun ke{" "}
              <b className="tabular-nums">{formatRupiah(sewaSetelah)}</b>.
            </p>
          )}
          {cicilSim === null && cicil.trim() !== "" && (
            <p className="mt-1.5 text-xs text-destructive">
              Masukkan rupiah bulat, maksimal sisa pokok {formatRupiah(sisa)}.
            </p>
          )}
        </div>
        <div className="flex flex-col justify-end gap-2">
          <Button
            className="gradient-primary rounded-full border-0"
            disabled={busy || cicilSim === null}
            onClick={() => {
              if (cicilSim === null) return;
              void onBayar(pawn._id, cicilSim, false).then((ok) => {
                if (ok) setCicil("");
              });
            }}
          >
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Bayar Cicilan + Sewa{" "}
            <span className="tabular-nums">
              ({formatRupiah((cicilSim ?? 0) + sewaSekarang)})
            </span>
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={busy}
            onClick={() => void onBayar(pawn._id, 0, true)}
          >
            Perpanjang tenor — sewa saja ({formatRupiah(sewaSekarang)})
          </Button>
        </div>
      </div>

      {proyeksi.length > 1 && (
        <div className="mt-4 rounded-xl bg-sky-50 p-3">
          <p className="text-xs font-semibold text-sky-900">
            Proyeksi sewa menurun bila konsisten cicil {formatRupiah(cicilSim ?? 0)}/periode:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {proyeksi.map((row) => (
              <span
                key={row.periode}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium tabular-nums text-sky-800"
              >
                P{row.periode}: sewa {formatRupiah(row.sewaModal)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Tab 3 — Jaminan gadai (vault custody monitor) + peta vault Leaflet
// =====================================================================

function PawnVaultSection({
  pawns,
  onOpenDetail,
}: {
  pawns: Array<{
    _id: Id<"pawns">;
    _creationTime: number;
    nomorReferensi: string;
    deskripsiBarang: string;
    kategori: string;
    status: string;
    nilaiTaksiran?: number;
    catatanReview?: string;
    /** Skema B — kewajiban gadai berjalan (decreasing principal). */
    pokokGadai?: number;
    sisaPokok?: number;
    persenSewaModal?: number;
  }>;
  onOpenDetail: (id: Id<"pawns">) => void;
}) {
  if (pawns.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Belum ada jaminan gadai"
        body="Ajukan barang Anda melalui tab Form Pengajuan Baru. Petugas berwenang melakukan pemeriksaan di lokasi dengan pencatatan lokasi langsung."
      />
    );
  }

  return (
    <div className="space-y-6">
      <VaultMapCard />
      <ul className="space-y-3">
        {pawns.map((p) => {
          const meta = pawnStatusMeta(p.status as PawnStatus);
          const dalamVault = p.status === "aktif" || p.status === "menunggu_pelepasan";
          return (
            <li key={p._id} className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Package className="size-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.deskripsiBarang}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.kategori} · {p.nomorReferensi}
                    </p>
                  </div>
                </div>
                <StatusBadge status={p.status} kind="pawn" />
              </div>
              <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Status barang</dt>
                  <dd className="text-right">{meta.label}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Nilai taksiran resmi</dt>
                  <dd className="tabular-nums">
                    {p.nilaiTaksiran !== undefined ? formatRupiah(p.nilaiTaksiran) : "Menunggu appraisal"}
                  </dd>
                </div>
                {p.nilaiTaksiran !== undefined && (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Maksimal limit pinjaman (LTV 70%)</dt>
                    <dd className="font-medium tabular-nums text-emerald-700">
                      {formatRupiah(Math.round(p.nilaiTaksiran * 0.7))}
                    </dd>
                  </div>
                )}
                {dalamVault && (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Lokasi penyimpanan</dt>
                    <dd>Gudang Brankas PINDAI — terisolasi aman</dd>
                  </div>
                )}
              </dl>
              <Button size="sm" variant="ghost" className="mt-3 rounded-full" onClick={() => onOpenDetail(p._id)}>
                Detail & pelepasan <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Peta OpenStreetMap (Leaflet, gratis) lokasi gudang brankas. */
function VaultMapCard() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Radix Tabs meng-unmount konten tab non-aktif, sehingga Leaflet pernah
  // dibuat pada kontainer berukuran 0 × 0 px → peta tampil blank. Peta baru
  // dibuat setelah kontainer benar-benar terlihat dan terukur.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let disposed = false;

    const ensureMap = () => {
      if (disposed || mapRef.current !== null) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        const map = L.map(container, { scrollWheelZoom: false }).setView(
          [DEFAULT_CONFIG.vaultLat, DEFAULT_CONFIG.vaultLng],
          14,
        );
        let tiles = L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(map);
        // OSM sesekali memblokir/limiting tile dari sebagian jaringan. Bila tile
        // gagal berulang, pindah ke basemap cadangan agar peta tidak tinggal
        // abu-abu tanpa isi.
        let tileErrors = 0;
        let switched = false;
        tiles.on("tileerror", () => {
          if (switched) return;
          tileErrors += 1;
          console.warn(`Tile peta gagal dimuat (${tileErrors}×)`);
          if (tileErrors < 4) return;
          switched = true;
          const pengganti = L.tileLayer(FALLBACK_TILE_URL, {
            attribution: `${OSM_ATTRIBUTION} &copy; CARTO`,
            maxZoom: 19,
          }).addTo(map);
          map.removeLayer(tiles);
          tiles = pengganti;
        });
        L.circleMarker([DEFAULT_CONFIG.vaultLat, DEFAULT_CONFIG.vaultLng], {
          radius: 10,
          color: "#0EA5E9",
          fillColor: "#38BDF8",
          fillOpacity: 0.9,
          weight: 3,
        })
          .bindTooltip("Gudang Brankas PINDAI — barang jaminan tersimpan di sini", {
            direction: "top",
          })
          .addTo(map);
        mapRef.current = map;
        requestAnimationFrame(() => {
          if (disposed) return;
          mapRef.current?.invalidateSize({ pan: false });
        });
      } catch (error) {
        console.error("Gagal menginisialisasi peta gudang", error);
        mapRef.current = null;
      }
    };

    ensureMap();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        ensureMap();
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          mapRef.current?.invalidateSize({ pan: false });
        }
      });
      resizeObserver.observe(container);
    }
    // Jaring pengaman tambahan saat tab baru dibuka/ditampilkan kembali.
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) ensureMap();
      });
      intersectionObserver.observe(container);
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      const map = mapRef.current;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  return (
    <section className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Lokasi Gudang Brankas (Vault Custody)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Peta OpenStreetMap gratis — barang jaminan disimpan terisolasi di brankas.
          </p>
        </div>
        <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <ShieldCheck className="mr-1 size-3" /> Brankas Custody
        </Badge>
      </div>
      <div
        className="relative mt-4 h-[260px] min-h-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-sky-50"
        style={{ height: 260, minHeight: 260 }}
      >
        <div
          ref={containerRef}
          role="region"
          aria-label="Peta lokasi gudang brankas"
          className="absolute inset-0 z-0 bg-[#ddd]"
        />
      </div>
    </section>
  );
}

// =====================================================================
// Tab 4 — E-Contract Saya
// =====================================================================

function MyContractsSection({
  contracts,
}: {
  contracts:
    | {
        pinjaman: Array<{
          _id: Id<"loans">;
          nomorReferensi: string;
          pokokPinjaman: number;
          tenorHari: number;
          status: string;
          tandaTanganAda: boolean;
          tandaTanganPada: number | null;
          createdAt: number;
          nik: string | null;
          namaLengkap: string;
          nomorRekening: string;
          lokasiAjukan: { lat: number; lng: number } | null;
        }>;
        gadai: Array<{
          _id: Id<"pawns">;
          nomorReferensi: string;
          deskripsiBarang: string;
          kategori: string;
          status: string;
          nilaiTaksiran?: number;
          createdAt: number;
        }>;
      }
    | undefined;
}) {
  if (contracts === undefined) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Memuat dokumen…
      </div>
    );
  }
  const total = contracts.pinjaman.length + contracts.gadai.length;
  if (total === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Belum ada dokumen perjanjian"
        body="Surat perjanjian pinjaman dan akad gadai tampil di sini setelah pengajuan Anda disetujui tim."
      />
    );
  }
  return (
    <div className="space-y-6">
      {contracts.pinjaman.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Surat Perjanjian Pinjaman</h3>
          <ul className="mt-3 space-y-3">
            {contracts.pinjaman.map((c) => (
              <li key={c._id}>
                <LoanContractCard c={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {contracts.gadai.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Akad Gadai Digital</h3>
          <ul className="mt-3 space-y-3">
            {contracts.gadai.map((c) => (
              <li key={c._id} className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.deskripsiBarang}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Akad {c.nomorReferensi} · taksiran{" "}
                      {c.nilaiTaksiran !== undefined ? formatRupiah(c.nilaiTaksiran) : "—"}
                    </p>
                  </div>
                  <PawnContractActions pawnId={c._id} pawnRef={c.nomorReferensi} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LoanContractCard({
  c,
}: {
  c: {
    _id: Id<"loans">;
    nomorReferensi: string;
    pokokPinjaman: number;
    tenorHari: number;
    status: string;
    tandaTanganAda: boolean;
    tandaTanganPada: number | null;
    createdAt: number;
    nik: string | null;
    namaLengkap: string;
    nomorRekening: string;
    lokasiAjukan: { lat: number; lng: number } | null;
  };
}) {
  const q = quoteLoan(c.pokokPinjaman);
  const html = useMemo(
    () =>
      buildPinjamanContract(
        { namaLengkap: c.namaLengkap, nomorRekening: c.nomorRekening, nik: c.nik, email: null },
        q,
        {
          nomorReferensi: c.nomorReferensi,
          lokasi: c.lokasiAjukan,
          timestampPada: c.tandaTanganPada ?? c.createdAt,
        },
        c.tenorHari,
      ),
    [c, q],
  );

  return (
    <div className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{judulContract("pinjaman")}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="font-mono">{nomorContract("pinjaman", c.nomorReferensi)}</span> · pokok{" "}
            {formatRupiah(c.pokokPinjaman)} · net {formatRupiah(q.danaBersihDitransfer)} (95%) · total{" "}
            {formatRupiah(q.totalKewajibanPelunasan)} (130%)
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.lokasiAjukan
              ? `GPS ${c.lokasiAjukan.lat.toFixed(4)}, ${c.lokasiAjukan.lng.toFixed(4)}`
              : "GPS —"}{" "}
            · {c.tandaTanganAda ? "ditandatangani elektronik" : "menunggu tanda tangan"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ContractPrintButton html={html} label="Unduh PDF E-Contract" />
          <ContractPreviewButton html={html} />
        </div>
      </div>
    </div>
  );
}

/** Preview kontrak di tab baru (HTML) — gratis, tanpa renderer PDF eksternal. */
function ContractPreviewButton({ html }: { html: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      onClick={() => {
        const w = window.open("", "_blank");
        if (!w) {
          toast.error("Popup diblokir browser — izinkan popup untuk melihat dokumen.");
          return;
        }
        w.document.write(
          `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Dokumen PINDAI</title></head><body>${html}</body></html>`,
        );
        w.document.close();
      }}
    >
      <FileText className="mr-1.5 size-3.5" /> Lihat Dokumen
    </Button>
  );
}

function PawnContractActions({
  pawnId,
  pawnRef,
}: {
  pawnId: Id<"pawns">;
  pawnRef: string;
}) {
  // Akad gadai dirangkai client-side dari data milik sendiri (getMyPawn
  // sudah dipakai di dialog detail) — untuk daftar, cukup tautan cetak.
  const detail = useQuery(api.loans.getMyPawn, { pawnId });
  if (detail === undefined) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }
  if (detail === null || detail.nilaiTaksiran === undefined) {
    return <span className="text-xs text-muted-foreground">Menunggu taksiran resmi</span>;
  }
  const html = buildGadaiContractMilikSendiri(detail);
  return (
    <div className="flex shrink-0 gap-2">
      <ContractPrintButton html={html} label="Unduh Akad PDF" />
      <ContractPreviewButton html={html} />
      <span className="sr-only">{pawnRef}</span>
    </div>
  );
}

/** Rangkai akad gadai dari data milik peminjam sendiri. */
function buildGadaiContractMilikSendiri(detail: {
  nomorReferensi: string;
  namaLengkap: string;
  nomorRekening: string;
  deskripsiBarang: string;
  kategori: string;
  nilaiTaksiran?: number;
  hargaPasar?: number;
  kondisiFisik?: string;
  kodeRakVault?: string;
  _creationTime: number;
}): string {
  return buildGadaiContractSafe(
    {
      namaLengkap: detail.namaLengkap,
      nomorRekening: detail.nomorRekening,
      nik: null,
      email: null,
    },
    {
      deskripsiBarang: detail.deskripsiBarang,
      kategori: detail.kategori,
      nilaiTaksiran: detail.nilaiTaksiran ?? 0,
      hargaPasar: detail.hargaPasar ?? 0,
      ltvPersen: 70,
      kodeRakVault: detail.kodeRakVault ?? "—",
      kondisiFisik: detail.kondisiFisik ?? "dinilai petugas",
    },
    {
      nomorReferensi: detail.nomorReferensi,
      lokasi: null,
      timestampPada: detail._creationTime,
    },
  );
}

// Import builder akad — dipisah agar tree-shaking tetap rapi.
import { buildGadaiContract as buildGadaiContractSafe } from "@/lib/contract";

// =====================================================================
// Tab 5 — Form pengajuan (pinjaman + gadai)
// =====================================================================

function LoanForm({ onCreated }: { onCreated: (ref: string) => void }) {
  const [pokok, setPokok] = useState<number>(10_000_000);
  const [tenorHari, setTenorHari] = useState<string>("30");
  const [tujuan, setTujuan] = useState<string>("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ===== Tanda tangan canvas =====
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#0f172a",
      minWidth: 1.2,
      maxWidth: 2.4,
    });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, []);

  // ===== KYC =====
  const [nik, setNik] = useState("");
  const [nomorWhatsApp, setNomorWhatsApp] = useState("");
  const [penghasilan, setPenghasilan] = useState<number>(5_000_000);
  const [sumberPenghasilan, setSumberPenghasilan] = useState("");
  const [dok, setDok] = useState<
    Record<KycFileKey, { id: Id<"_storage"> | null; name: string; busy: boolean }>
  >({
    ktp: { id: null, name: "", busy: false },
    selfie: { id: null, name: "", busy: false },
    slip: { id: null, name: "", busy: false },
  });

  // ===== Lokasi real (GPS) =====
  const [lokasi, setLokasi] = useState<{
    lat: number;
    lng: number;
    akurasi: number;
    waktu: number;
  } | null>(null);
  const [lokBusy, setLokBusy] = useState(false);

  const createLoan = useMutation(api.loans.createLoanApplication);
  const generateUploadUrl = useMutation(api.loans.generateKycUploadUrl);

  const captureLokasi = () => {
    if (!("geolocation" in navigator)) {
      setError("Perangkat Anda tidak mendukung GPS.");
      return;
    }
    setLokBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLokasi({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          akurasi: pos.coords.accuracy,
          waktu: Date.now(),
        });
        setLokBusy(false);
      },
      (err) => {
        setError(`Gagal mengambil lokasi: ${err.message}. Izinkan akses lokasi di browser.`);
        setLokBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  // Minta izin GPS otomatis saat form dibuka.
  useEffect(() => {
    captureLokasi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (key: KycFileKey, label: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`${label} maksimal 5 MB.`);
      return;
    }
    setDok((p) => ({ ...p, [key]: { ...p[key], busy: true, name: file.name } }));
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const json = (await res.json()) as { storageId?: Id<"_storage"> };
      if (!res.ok || !json.storageId) throw new Error(`Unggah ${label} gagal.`);
      setDok((p) => ({ ...p, [key]: { id: json.storageId ?? null, name: file.name, busy: false } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unggah ${label} gagal.`);
      setDok((p) => ({ ...p, [key]: { ...p[key], busy: false } }));
    }
  };

  const q = quoteLoan(pokok);
  const MIN = 100_000;
  const MAX = 500_000_000;
  const STEP = 100_000;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (pokok < MIN || pokok > MAX || !Number.isInteger(pokok)) {
      setError("Nominal harus antara Rp 100.000 dan Rp 500.000.000 (rupiah bulat).");
      return;
    }
    if (!tenorHari) {
      setError("Pilih tenor pinjaman.");
      return;
    }
    if (!tujuan) {
      setError("Pilih keperluan pinjaman.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    const kycError = validateKycInput({
      nik,
      nomorWhatsApp,
      penghasilanBulanan: penghasilan,
      sumberPenghasilan,
    });
    if (kycError) {
      setError(kycError);
      return;
    }
    if (!dok.ktp.id || !dok.selfie.id || !dok.slip.id) {
      setError("Unggah ketiga dokumen: KTP, selfie dengan KTP, dan slip gaji.");
      return;
    }
    if (lokasi === null) {
      setError("Lokasi real belum terkunci — izinkan akses GPS lalu klik 'Ambil lokasi'.");
      return;
    }

    setSubmitting(true);
    try {
      const ttdDataUrl = padRef.current && !padRef.current.isEmpty()
        ? padRef.current.toDataURL("image/png")
        : undefined;
      const result = await createLoan({
        pokokPinjaman: pokok,
        tenorHari: Number(tenorHari),
        tujuan,
        namaLengkap,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
        tandaTangan: ttdDataUrl,
        nik: nik.replace(/\s+/g, ""),
        nomorWhatsApp: nomorWhatsApp.replace(/[\s+-]/g, ""),
        penghasilanBulanan: penghasilan,
        sumberPenghasilan,
        dokKtpId: dok.ktp.id,
        dokSelfieKtpId: dok.selfie.id,
        dokSlipGajiId: dok.slip.id,
        lokasiAjukan: lokasi,
      });
      onCreated(result.nomorReferensi);
      setTujuan("");
      setNamaLengkap("");
      setNomorRekening("");
      setCatatanPeminjam("");
      padRef.current?.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Slider nominal */}
      <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-md shadow-sky-100">
        <div className="flex items-baseline justify-between">
          <Label>Nominal pinjaman</Label>
          <span className="text-lg font-bold tabular-nums text-sky-600">{formatRupiah(pokok)}</span>
        </div>
        <Slider
          className="mt-4"
          value={[pokok]}
          min={MIN}
          max={MAX}
          step={STEP}
          onValueChange={(v) => setPokok(v[0] ?? MIN)}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>Rp 100 rb</span>
          <span>Rp 500 jt</span>
        </div>

        {/* Live financial breakdown */}
        <dl className="mt-4 divide-y divide-sky-100 overflow-hidden rounded-xl border border-sky-100">
          {[
            ["Potongan Admin (3%)", `- ${formatRupiah(q.biayaAdmin)}`],
            ["Potongan Platform (2%)", `- ${formatRupiah(q.biayaPlatform)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between bg-white px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between bg-emerald-50 px-3 py-2.5 text-sm">
            <dt className="font-semibold text-emerald-800">Dana Bersih (95%)</dt>
            <dd className="font-bold tabular-nums text-emerald-700">{formatRupiah(q.danaBersihDitransfer)}</dd>
          </div>
          <div className="flex items-baseline justify-between bg-white px-3 py-2 text-sm">
            <dt className="text-muted-foreground">Bunga (30%)</dt>
            <dd className="tabular-nums">{formatRupiah(q.bunga)}</dd>
          </div>
          <div className="flex items-baseline justify-between bg-sky-50 px-3 py-2.5 text-sm">
            <dt className="font-semibold">Total Kewajiban (130%)</dt>
            <dd className="font-bold tabular-nums">{formatRupiah(q.totalKewajibanPelunasan)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tenor pinjaman</Label>
          <Select value={tenorHari} onValueChange={setTenorHari} disabled={submitting}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih tenor" />
            </SelectTrigger>
            <SelectContent>
              {TENOR_OPTIONS.map((t) => (
                <SelectItem key={t} value={String(t)}>
                  {t} hari
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Keperluan</Label>
          <Select value={tujuan} onValueChange={setTujuan} disabled={submitting}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih keperluan pinjaman" />
            </SelectTrigger>
            <SelectContent>
              {LOAN_PURPOSE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama lengkap (sesuai KTP)</Label>
          <Input id="nama" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Nama sesuai identitas" disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening">Nomor rekening tujuan</Label>
          <Input id="rekening" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" disabled={submitting} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catatan">Catatan untuk reviewer (opsional)</Label>
        <Textarea id="catatan" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Jelaskan singkat rencana penggunaan dana…" rows={2} disabled={submitting} />
      </div>

      {/* Tanda tangan canvas */}
      <div className="rounded-2xl border border-sky-100 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Tanda tangan digital (canvas)
        </p>
        <canvas
          ref={canvasRef}
          className="mt-2 h-24 w-full touch-none rounded-xl border border-dashed border-sky-200 bg-white"
        />
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => padRef.current?.clear()}>
            Bersihkan
          </Button>
        </div>
      </div>

      {/* KYC */}
      <div className="rounded-2xl border border-sky-100 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Verifikasi identitas (wajib)
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nik">NIK (16 digit)</Label>
            <Input id="nik" inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))} placeholder="3204xxxxxxxxxxxx" className="tabular-nums" disabled={submitting} />
          </div>
          <div>
            <Label htmlFor="wa">Nomor WhatsApp</Label>
            <Input id="wa" inputMode="numeric" value={nomorWhatsApp} onChange={(e) => setNomorWhatsApp(e.target.value.replace(/[^\d+]/g, ""))} placeholder="6281234567890" className="tabular-nums" disabled={submitting} />
          </div>
          <div>
            <Label>Penghasilan per bulan</Label>
            <Slider
              className="mt-3"
              value={[penghasilan]}
              min={500_000}
              max={100_000_000}
              step={100_000}
              onValueChange={(v) => setPenghasilan(v[0] ?? 500_000)}
            />
            <p className="mt-1 text-sm font-semibold tabular-nums text-sky-600">
              {formatRupiah(penghasilan)}
            </p>
          </div>
          <div>
            <Label htmlFor="sumber">Sumber penghasilan</Label>
            <Input id="sumber" value={sumberPenghasilan} onChange={(e) => setSumberPenghasilan(e.target.value)} placeholder="Gaji, usaha, dll." disabled={submitting} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {KYC_FILES.map(({ key, label, accept }) => (
            <div key={key} className="rounded-xl border border-sky-100 bg-secondary/40 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor={`dok-${key}`}>{label}</Label>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {dok[key].busy ? "Mengunggah…" : dok[key].name ? dok[key].name : "Maks. 5 MB — gambar atau PDF"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={submitting || dok[key].busy} onClick={() => document.getElementById(`dok-${key}`)?.click()}>
                  {dok[key].busy ? <Loader2 className="size-3.5 animate-spin" /> : "Pilih file"}
                </Button>
              </div>
              <input
                id={`dok-${key}`}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  void handleFile(key, label, f);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Lokasi real */}
      <div className="rounded-2xl border border-sky-100 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lokasi real saat pengajuan (GPS wajib)
            </p>
            {lokasi ? (
              <p className="mt-1 text-sm tabular-nums">
                <MapPin className="mr-1 inline size-4 text-emerald-600" />
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {lokBusy ? "Mengunci posisi GPS…" : "Belum terkunci — izinkan akses lokasi di browser."}
              </p>
            )}
          </div>
          <Button type="button" variant="outline" className="rounded-full" disabled={lokBusy || submitting} onClick={captureLokasi}>
            {lokBusy ? <Loader2 className="size-4 animate-spin" /> : "Ambil lokasi"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="gradient-primary shadow-glow w-full rounded-full border-0 font-medium transition-transform hover:-translate-y-0.5"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
          </>
        ) : (
          <>
            Kirim Pengajuan <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Dengan mengirim, Anda menyatakan data yang diisi benar dan menyetujui struktur
        biaya: potongan di muka 5%, bunga 30%, total kewajiban 130%.
      </p>
    </form>
  );
}

function PawnForm({ onCreated }: { onCreated: () => void }) {
  const [deskripsiBarang, setDeskripsiBarang] = useState("");
  const [kategori, setKategori] = useState<string>("");
  const [alamatPenilaian, setAlamatPenilaian] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPawn = useMutation(api.loans.createPawnApplication);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (deskripsiBarang.trim().length < 10) {
      setError("Deskripsi barang wajib diisi (minimal 10 karakter).");
      return;
    }
    if (!kategori) {
      setError("Pilih kategori barang.");
      return;
    }
    if (alamatPenilaian.trim().length < 10) {
      setError("Alamat lokasi barang wajib diisi untuk penjadwalan pemeriksaan.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    setSubmitting(true);
    try {
      await createPawn({
        deskripsiBarang,
        kategori,
        alamatPenilaian,
        namaLengkap,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
      });
      onCreated();
      setDeskripsiBarang("");
      setKategori("");
      setAlamatPenilaian("");
      setNamaLengkap("");
      setNomorRekening("");
      setCatatanPeminjam("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan gadai.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="barang">Deskripsi barang</Label>
        <Textarea id="barang" value={deskripsiBarang} onChange={(e) => setDeskripsiBarang(e.target.value)} placeholder="Contoh: iPhone 14 Pro 256 GB, warna titanium, kelengkapan dus lengkap…" rows={3} disabled={submitting} />
      </div>
      <div className="space-y-2">
        <Label>Kategori</Label>
        <Select value={kategori} onValueChange={setKategori} disabled={submitting}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pilih kategori barang" />
          </SelectTrigger>
          <SelectContent>
            {COLLATERAL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kategori && (
          <p className="text-xs text-muted-foreground">
            Perkiraan plafon dana: {LTV_HINTS[kategori as CollateralCategory]}.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="alamat">Alamat lokasi barang</Label>
        <Textarea id="alamat" value={alamatPenilaian} onChange={(e) => setAlamatPenilaian(e.target.value)} placeholder="Alamat lengkap tempat barang berada saat pemeriksaan…" rows={2} disabled={submitting} />
        <p className="text-xs leading-5 text-muted-foreground">
          Pemeriksaan dilakukan petugas berwenang di lokasi dengan pencatatan lokasi
          langsung (live location) yang wajib — lokasi kunjungan terekam sebagai
          bagian dari kepatuhan layanan.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama-gadai">Nama lengkap (sesuai KTP)</Label>
          <Input id="nama-gadai" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Nama sesuai identitas" disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening-gadai">Nomor rekening tujuan</Label>
          <Input id="rekening-gadai" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" disabled={submitting} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="catatan-gadai">Catatan tambahan (opsional)</Label>
        <Textarea id="catatan-gadai" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Kondisi barang, kelengkapan, atau jadwal yang sesuai…" rows={2} disabled={submitting} />
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="gradient-gold shadow-glow-gold w-full rounded-full border-0 font-medium text-gold-foreground transition-transform hover:-translate-y-0.5"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
          </>
        ) : (
          <>
            Kirim pengajuan gadai <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Nilai taksiran ditetapkan oleh petugas berwenang saat pemeriksaan, bukan oleh
        nasabah. Barang disimpan dengan jaminan keamanan hingga pelunasan.
      </p>
    </form>
  );
}

// =====================================================================
// Tab 6 — Riwayat transaksi
// =====================================================================

function HistorySection({
  loans,
  pawns,
  onOpenLoan,
  onOpenPawn,
}: {
  loans: Array<{
    _id: Id<"loans">;
    _creationTime: number;
    nomorReferensi: string;
    pokokPinjaman: number;
    tujuan: string;
    status: string;
  }>;
  pawns: Array<{
    _id: Id<"pawns">;
    _creationTime: number;
    nomorReferensi: string;
    deskripsiBarang: string;
    kategori: string;
    status: string;
  }>;
  onOpenLoan: (id: Id<"loans">) => void;
  onOpenPawn: (id: Id<"pawns">) => void;
}) {
  if (loans.length === 0 && pawns.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Belum ada transaksi"
        body="Semua pengajuan pinjaman dan gadai Anda tercatat di sini, termasuk yang sudah selesai."
      />
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold">Pinjaman</h3>
        {loans.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
            {loans.map((l) => (
              <li key={l._id}>
                <button
                  type="button"
                  onClick={() => onOpenLoan(l._id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-sky-50/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tabular-nums">{formatRupiah(l.pokokPinjaman)}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {l.nomorReferensi} · {loanPurposeLabel(l.tujuan)} · {formatDate(l._creationTime)}
                    </p>
                  </div>
                  <StatusBadge status={l.status} kind="loan" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Gadai</h3>
        {pawns.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
            {pawns.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => onOpenPawn(p._id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-sky-50/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.deskripsiBarang}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.nomorReferensi} · {p.kategori} · {formatDate(p._creationTime)}
                    </p>
                  </div>
                  <StatusBadge status={p.status} kind="pawn" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// =====================================================================
// Banner pengingat jatuh tempo + pelacakan lokasi (opt-in, dipertahankan)
// =====================================================================

function DueReminderBanner({
  reminder,
}: {
  reminder: {
    loanId: Id<"loans">;
    nomorReferensi: string;
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
    totalKewajibanDenganPenalti: number;
    totalKewajibanPelunasan: number;
  };
}) {
  const terlambat = reminder.hariTerlambat > 0;
  return (
    <section
      className={`card-lift mt-6 rounded-2xl border px-5 py-4 shadow-md shadow-sky-100 ${
        terlambat ? "border-red-200 bg-red-50/70" : "border-sky-100 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className={`text-[11px] font-medium uppercase tracking-[0.18em] ${terlambat ? "text-red-600" : "text-muted-foreground"}`}>
            {terlambat
              ? `Terlambat ${reminder.hariTerlambat} hari — denda berjalan`
              : reminder.sisaHari === 0
                ? "Jatuh tempo hari ini"
                : `Jatuh tempo ${reminder.sisaHari} hari lagi`}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Pinjaman {reminder.nomorReferensi} wajib dilunasi paling lambat{" "}
            <span className="font-medium text-foreground">{formatDate(reminder.jatuhTempoPada)}</span>.
            Keterlambatan dikenakan denda 0,5% per hari dari pokok (maksimum 15%).
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total kewajiban saat ini</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatRupiah(reminder.totalKewajibanDenganPenalti)}
          </p>
          {terlambat && (
            <p className="mt-0.5 text-xs tabular-nums text-red-600">
              termasuk denda {formatRupiah(reminder.dendaTerlambat)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function LocationConsentCard() {
  const status = useQuery(api.tracking.getStatus);
  const setuju = useMutation(api.tracking.setuju);
  const cabut = useMutation(api.tracking.cabut);
  const pushTitik = useMutation(api.tracking.pushTitik);
  const [busy, setBusy] = useState(false);

  const watchRef = useRef<number | null>(null);
  const lastPushRef = useRef(0);
  const pushRef = useRef(pushTitik);
  pushRef.current = pushTitik;

  useEffect(() => {
    const stopWatch = () => {
      if (watchRef.current !== null) {
        navigator.geolocation?.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
    if (status?.aktif !== true || !navigator.geolocation) {
      stopWatch();
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPushRef.current < 45_000) return;
        lastPushRef.current = now;
        void pushRef
          .current({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            akurasi: pos.coords.accuracy,
          })
          .catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 25_000 },
    );
    return stopWatch;
  }, [status?.aktif]);

  const statusText =
    status === undefined
      ? "Memuat status pelacakan…"
      : status.aktif
        ? "AKTIF — posisi Anda dikirim berkala selama persetujuan berlaku sebagai bagian kepatuhan layanan. Nonaktifkan kapan saja."
        : "Belum aktif. Aktifkan hanya jika Anda bersedia membagikan posisi real secara berkala (dapat dicabut kapan saja).";

  return (
    <section className="card-lift mt-6 flex flex-col gap-3 rounded-2xl border border-sky-100 bg-white px-5 py-4 shadow-md shadow-sky-100 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-primary" />
          Pelacakan lokasi berkelanjutan
        </p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{statusText}</p>
      </div>
      {status?.aktif ? (
        <Button
          variant="outline"
          className="rounded-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await cabut();
              toast.info("Pelacakan lokasi dinonaktifkan.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal menonaktifkan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Nonaktifkan"}
        </Button>
      ) : (
        <Button
          className="gradient-primary rounded-full border-0"
          disabled={busy || status === undefined}
          onClick={async () => {
            setBusy(true);
            try {
              await setuju();
              toast.success("Terima kasih — pelacakan lokasi kini aktif.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal mengaktifkan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Izinkan pelacakan"}
        </Button>
      )}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-sky-200 bg-white/60 px-6 py-14 text-center">
      <Icon className="mx-auto size-5 text-sky-400" />
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

// =====================================================================
// Detail dialogs (dipertahankan dari versi lama, tema clay)
// =====================================================================

function LoanDetailDialog({
  loanId,
  onClose,
}: {
  loanId: Id<"loans"> | null;
  onClose: () => void;
}) {
  const loan = useQuery(api.loans.getMyLoan, loanId ? { loanId } : "skip");
  const repayLoan = useMutation(api.loans.repayLoan);
  const [repaying, setRepaying] = useState(false);

  const handleRepay = async () => {
    if (!loan) return;
    setRepaying(true);
    try {
      const r = await repayLoan({ loanId: loan._id });
      toast.success(
        r.dendaTerlambat > 0
          ? `Pelunasan tercatat — total dibayar ${formatRupiah(r.totalDibayar)} (termasuk denda ${formatRupiah(r.dendaTerlambat)} untuk ${r.hariTerlambat} hari keterlambatan).`
          : `Pelunasan tercatat — total dibayar ${formatRupiah(r.totalDibayar)}. Terima kasih!`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pelunasan gagal.");
    } finally {
      setRepaying(false);
    }
  };

  return (
    <Dialog open={loanId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {loan === undefined ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : loan === null ? (
          <DialogHeader>
            <DialogTitle>Pengajuan tidak ditemukan</DialogTitle>
            <DialogDescription>Data ini mungkin bukan milik akun Anda.</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="tabular-nums">{formatRupiah(loan.pokokPinjaman)}</DialogTitle>
                <StatusBadge status={loan.status} kind="loan" />
              </div>
              <DialogDescription className="tabular-nums">
                {loan.nomorReferensi} · {formatDate(loan._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {loanStatusMeta(loan.status).description}
            </p>

            <dl className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
              {[
                ["Keperluan", loanPurposeLabel(loan.tujuan)],
                ["Pokok pinjaman", formatRupiah(loan.quote.pokok)],
                ["Biaya Admin (3%)", formatRupiah(loan.quote.biayaAdmin)],
                ["Biaya Platform (2%)", formatRupiah(loan.quote.biayaPlatform)],
                ["Dana bersih diterima", formatRupiah(loan.quote.danaBersihDitransfer)],
                ["Bunga (30%)", formatRupiah(loan.quote.bunga)],
                ["Total kewajiban pelunasan", formatRupiah(loan.quote.totalKewajibanPelunasan)],
              ].map(([label, value], index) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className={`text-sm tabular-nums ${index === 2 || index === 6 ? "font-semibold" : ""}`}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {loan.catatanReview && (
              <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan review</p>
                <p className="mt-1 text-sm">{loan.catatanReview}</p>
              </div>
            )}

            {loan.status === "didanai" && loan.pelunasan && (
              <div
                className={`rounded-2xl border p-4 ${
                  loan.pelunasan.hariTerlambat > 0 ? "border-red-200 bg-red-50/60" : "border-sky-100"
                }`}
              >
                <p className="text-sm font-medium">Lunasi pinjaman</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Jatuh tempo</dt>
                    <dd className="tabular-nums">{formatDate(loan.pelunasan.jatuhTempoPada)}</dd>
                  </div>
                  {loan.pelunasan.hariTerlambat > 0 ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-red-600">Terlambat {loan.pelunasan.hariTerlambat} hari</dt>
                      <dd className="tabular-nums text-red-600">+{formatRupiah(loan.pelunasan.dendaTerlambat)}</dd>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Sisa waktu</dt>
                      <dd className="tabular-nums">
                        {loan.pelunasan.sisaHari === 0 ? "Hari ini" : `${loan.pelunasan.sisaHari} hari`}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Bayar total kewajiban — pokok, imbal hasil Pendana, dan denda (bila
                  terlambat) otomatis tercatat di jurnal. Aksi ini tidak dapat dibatalkan.
                </p>
                <Button
                  className="gradient-primary shadow-glow mt-3 w-full rounded-full border-0 font-medium transition-transform hover:-translate-y-0.5"
                  disabled={repaying}
                  onClick={handleRepay}
                >
                  {repaying ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Memproses…
                    </>
                  ) : (
                    `Lunasi ${formatRupiah(loan.pelunasan.totalKewajibanDenganPenalti)}`
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PawnDetailDialog({
  pawnId,
  onClose,
}: {
  pawnId: Id<"pawns"> | null;
  onClose: () => void;
}) {
  const pawn = useQuery(api.loans.getMyPawn, pawnId ? { pawnId } : "skip");
  const requestPawnRelease = useMutation(api.loans.requestPawnRelease);
  const [requesting, setRequesting] = useState(false);

  const handleRequestRelease = async () => {
    if (!pawn) return;
    setRequesting(true);
    try {
      await requestPawnRelease({ pawnId: pawn._id });
      toast.success("Permintaan pelepasan terkirim — petugas akan mengonfirmasi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim permintaan.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Dialog open={pawnId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {pawn === undefined ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : pawn === null ? (
          <DialogHeader>
            <DialogTitle>Pengajuan tidak ditemukan</DialogTitle>
            <DialogDescription>Data ini mungkin bukan milik akun Anda.</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="max-w-64 text-base leading-snug">{pawn.deskripsiBarang}</DialogTitle>
                <StatusBadge status={pawn.status} kind="pawn" />
              </div>
              <DialogDescription className="tabular-nums">
                {pawn.nomorReferensi} · {formatDate(pawn._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {pawnStatusMeta(pawn.status as PawnStatus).description}
            </p>

            <dl className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
              {[
                ["Kategori", pawn.kategori],
                ["Alamat penilaian", pawn.alamatPenilaian],
                [
                  "Nilai taksiran",
                  pawn.nilaiTaksiran !== undefined
                    ? formatRupiah(pawn.nilaiTaksiran)
                    : "Menunggu pemeriksaan petugas",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-right text-sm">{value}</dd>
                </div>
              ))}
            </dl>

            {pawn.catatanReview && (
              <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan penilaian</p>
                <p className="mt-1 text-sm">{pawn.catatanReview}</p>
              </div>
            )}

            {pawn.status === "aktif" && (
              <div className="rounded-2xl border border-sky-100 bg-white p-4">
                <p className="text-sm font-medium">Ajukan pelepasan barang</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Setelah kewajiban gadai Anda lunas, ajukan pelepasan dan petugas akan
                  mengonfirmasi pengembalian barang Anda.
                </p>
                <Button
                  className="gradient-primary mt-3 w-full rounded-full border-0"
                  disabled={requesting}
                  onClick={handleRequestRelease}
                >
                  {requesting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
                    </>
                  ) : (
                    "Ajukan pelepasan"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
