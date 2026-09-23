import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Coins,
  FileText,
  Landmark,
  Loader2,
  Plus,
  QrCode,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ContractPrintButton } from "@/components/EContract";
import { DashboardShell, type DockTab, type SummaryCard } from "@/components/DashboardShell";
import { WaOtpDialog } from "@/components/WaOtpDialog";
import { judulContract, nomorContract } from "@/lib/contract";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";
import { ShieldCheck, TrendingUp, Store } from "lucide-react";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// =====================================================================
// Ikonografi 3D cartoon (SVG clay) — dompet pertumbuhan, grafis imbal
// hasil, sertifikat, pasar pinjaman, brankas.
// =====================================================================

function VaultLogo3D({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="pVaultBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="55%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <radialGradient id="pVaultDial" cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#A7F3D0" />
          <stop offset="60%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </radialGradient>
      </defs>
      <rect x="4" y="8" width="56" height="46" rx="12" fill="url(#pVaultBody)" />
      <rect x="12" y="16" width="40" height="30" rx="8" fill="#0C4A6E" opacity="0.25" />
      <circle cx="32" cy="31" r="10" fill="url(#pVaultDial)" />
      <circle cx="32" cy="31" r="4" fill="#065F46" opacity="0.55" />
      <rect x="29" y="29" width="6" height="3" rx="1.5" fill="#F0FDF4" />
      <rect x="14" y="54" width="8" height="6" rx="2" fill="#0284C7" />
      <rect x="42" y="54" width="8" height="6" rx="2" fill="#0284C7" />
      <ellipse cx="24" cy="14" rx="10" ry="3" fill="white" opacity="0.35" />
    </svg>
  );
}

function WalletGrowth3D({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="pWalletBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect x="6" y="18" width="52" height="36" rx="10" fill="url(#pWalletBody)" />
      <rect x="6" y="18" width="52" height="11" rx="5.5" fill="#0284C7" opacity="0.5" />
      <rect x="40" y="31" width="16" height="11" rx="5.5" fill="#F0FDFA" />
      <circle cx="46" cy="36.5" r="2.4" fill="#10B981" />
      <path d="M18 14l8-8 7 5 9-9" stroke="#10B981" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M38 1h5v5" stroke="#10B981" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <ellipse cx="26" cy="21" rx="12" ry="3" fill="white" opacity="0.4" />
    </svg>
  );
}

function YieldChart3D({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="6" y="10" width="52" height="46" rx="10" fill="#F0F9FF" stroke="#7DD3FC" strokeWidth="2" />
      <rect x="14" y="38" width="8" height="12" rx="2.5" fill="#38BDF8" />
      <rect x="26" y="30" width="8" height="20" rx="2.5" fill="#0EA5E9" />
      <rect x="38" y="20" width="8" height="30" rx="2.5" fill="#10B981" />
      <path d="M16 26c8-4 12-10 20-13" stroke="#F59E0B" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1 5" fill="none" />
      <circle cx="44" cy="12" r="3.4" fill="#F59E0B" />
    </svg>
  );
}

function Certificate3D({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="10" y="8" width="44" height="48" rx="8" fill="#F0F9FF" stroke="#7DD3FC" strokeWidth="2" />
      <rect x="16" y="16" width="22" height="3.5" rx="1.75" fill="#38BDF8" />
      <rect x="16" y="24" width="32" height="3" rx="1.5" fill="#BAE6FD" />
      <rect x="16" y="30" width="28" height="3" rx="1.5" fill="#BAE6FD" />
      <rect x="16" y="36" width="24" height="3" rx="1.5" fill="#BAE6FD" />
      <circle cx="44" cy="46" r="8" fill="#10B981" />
      <path d="M40 46l3 3 5.5-6" stroke="#F0FDF4" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M41 52l-2 7 5-3 5 3-2-7" fill="#059669" />
    </svg>
  );
}

function Market3D({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <path d="M8 22l4-12h40l4 12" fill="#38BDF8" />
      <rect x="8" y="22" width="48" height="8" rx="4" fill="#0EA5E9" />
      <rect x="12" y="30" width="40" height="26" rx="6" fill="#F0F9FF" stroke="#7DD3FC" strokeWidth="2" />
      <rect x="26" y="14" width="12" height="9" rx="2" fill="#FDE68A" />
      <path d="M26 23l-4 0 8 8 8-8-4 0z" fill="#F59E0B" opacity="0.7" />
      <rect x="20" y="38" width="24" height="4" rx="2" fill="#BAE6FD" />
      <rect x="20" y="46" width="16" height="4" rx="2" fill="#BAE6FD" />
    </svg>
  );
}

function History3D({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="14" y="10" width="36" height="44" rx="8" fill="#FDE68A" />
      <rect x="14" y="10" width="36" height="9" rx="4" fill="#F59E0B" />
      <rect x="20" y="26" width="24" height="3" rx="1.5" fill="#92400E" opacity="0.6" />
      <rect x="20" y="33" width="20" height="3" rx="1.5" fill="#92400E" opacity="0.45" />
      <rect x="20" y="40" width="24" height="3" rx="1.5" fill="#92400E" opacity="0.3" />
    </svg>
  );
}

function VaultBox3D({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="10" y="14" width="44" height="38" rx="9" fill="#0F172A" opacity="0.85" />
      <rect x="14" y="18" width="36" height="30" rx="7" fill="#1E293B" />
      <circle cx="32" cy="32" r="8" fill="#38BDF8" />
      <circle cx="32" cy="32" r="3" fill="#0C4A6E" />
      <rect x="30" y="8" width="4" height="8" rx="2" fill="#38BDF8" />
      <ellipse cx="24" cy="17" rx="8" ry="2.5" fill="white" opacity="0.25" />
    </svg>
  );
}

export default function Pendana() {
  const { user, isLoading } = useAuth();
  const role = user?.role;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F0F9FF]">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const greetingName = user?.name ?? user?.email?.split("@")[0] ?? "Pendana";

  if (role !== "pendana") {
    return (
      <DashboardShell
        greeting={greetingName}
        subGreeting={
          role === "admin"
            ? "Akun tim tidak dapat menjadi Pendana — gunakan akun terpisah demi kepatuhan."
            : "Aktifkan peran Pendana untuk mulai menyediakan dana & menerima Imbal Hasil."
        }
        quickActions={<></>}
        summary={[]}
        tabs={[]}
        reminder={null}
        footer={
          <p className="mt-10 border-t border-sky-100 pt-6 text-xs leading-5 text-muted-foreground">
            PINDAI — Pendana menyediakan dana melalui skema Alokasi Dana dan menerima
            Imbal Hasil 30% dari pokok sebagai hak finansialnya. Setiap pergerakan dana
            tercatat berpasangan di jurnal append-only.
          </p>
        }
      >
        {role === "admin" ? (
          <Notice
            title="Akun tim tidak dapat menjadi Pendana"
            body="Panel admin dan peran Pendana dipisahkan demi kepatuhan. Gunakan akun terpisah untuk mendanai."
          />
        ) : (
          <Onboarding />
        )}
      </DashboardShell>
    );
  }

  return <PendanaWorkspace greetingName={greetingName} />;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="card-lift mx-auto max-w-md rounded-2xl border border-sky-100 bg-white p-8 text-center shadow-md shadow-sky-100">
      <Coins className="mx-auto size-5 text-sky-400" />
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      <Button asChild variant="outline" className="mt-6 rounded-full">
        <Link to="/dashboard">
          <ArrowLeft className="mr-2 size-4" />
          Kembali
        </Link>
      </Button>
    </div>
  );
}

function Onboarding() {
  const becomePendana = useMutation(api.pendana.becomePendana);
  const [busy, setBusy] = useState(false);

  return (
    <div className="card-lift mx-auto max-w-xl rounded-2xl border border-sky-100 bg-white p-8 shadow-md shadow-sky-100">
      <VaultLogo3D size={52} />
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Peran Pendana
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Sediakan dana, terima Imbal Hasil.</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Sebagai Pendana, Anda menyediakan dana untuk pinjaman nasabah yang telah
        disetujui tim kami. Setiap pinjaman terbagi dalam satu atau beberapa alokasi
        Pendana; saat pinjaman terpenuhi, dana bersih (95% dari pokok) dicairkan ke
        nasabah dan Anda menerima hak Imbal Hasil sebesar 30% dari porsi pokok yang
        Anda danai, dibayarkan saat nasabah melunasi total kewajiban 130%.
      </p>
      <ul className="mt-6 space-y-3 text-sm">
        {[
          ["Setoran terverifikasi", "Dana Anda masuk dompet setelah tim memverifikasi transfer."],
          ["Alokasi transparan", "Anda melihat sisa kebutuhan tiap pinjaman — tidak ada alokasi ganda."],
          ["Pencatatan ganda", "Setiap pergerakan dana tercatat berpasangan di jurnal append-only."],
        ].map(([t, b]) => (
          <li key={t} className="flex gap-3">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-500" />
            <span>
              <span className="font-medium">{t}</span>
              <span className="text-muted-foreground"> — {b}</span>
            </span>
          </li>
        ))}
      </ul>

      <Button
        className="gradient-primary shadow-glow mt-8 rounded-full border-0 px-6 font-medium transition-transform hover:-translate-y-0.5"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await becomePendana({});
            toast.success("Selamat — Anda kini Pendana. Mulai dengan menyetor dana.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal mengubah peran.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Jadi Pendana
        <ArrowRight className="ml-1 size-4" />
      </Button>
    </div>
  );
}

// =====================================================================
// Workspace utama Pendana — kerangka DashboardShell 3D Claymorphism
// =====================================================================

function PendanaWorkspace({ greetingName }: { greetingName: string }) {
  const wallet = useQuery(api.pendana.myWallet);
  const portfolio = useQuery(api.pendana.myPortfolio);
  const [tab, setTab] = useState("marketplace");
  const [depositOpen, setDepositOpen] = useState(false);

  const summaryCards: SummaryCard[] = [
    {
      label: "Total Saldo Dompet",
      nilai: wallet?.saldo ?? 0,
      keterangan: "Tersedia untuk alokasi pendanaan & penarikan.",
      tone: "sky",
      icon: <WalletGrowth3D size={22} />,
    },
    {
      label: "Total Dana Dialokasikan",
      nilai: wallet?.danaBekerja ?? 0,
      keterangan: `Tersebar di ${wallet?.posisiAlokasi ?? 0} proyek pinjaman/gadai berjalan.`,
      tone: "amber",
      icon: <Store className="size-5" />,
    },
    {
      label: "Estimasi Imbal Hasil Bunga",
      nilai: wallet?.imbalHasilDiharapkan ?? 0,
      keterangan: "Proyeksi bunga 30% dari porsi pokok saat Peminjam melunasi.",
      tone: "mint",
      icon: <YieldChart3D size={22} />,
    },
  ];

  const dockTabs: DockTab[] = [
    {
      key: "marketplace",
      label: "Marketplace Pinjaman & Gadai",
      shortLabel: "Pasar",
      icon: <Market3D size={18} />,
      onSelect: () => setTab("marketplace"),
      active: tab === "marketplace",
    },
    {
      key: "portofolio",
      label: "Portofolio Pendanaan Saya",
      shortLabel: "Portofolio",
      icon: <WalletGrowth3D size={18} />,
      badge: wallet?.posisiAlokasi,
      onSelect: () => setTab("portofolio"),
      active: tab === "portofolio",
    },
    {
      key: "kontrak",
      label: "E-Contract Pendanaan",
      shortLabel: "Kontrak",
      icon: <Certificate3D size={18} />,
      onSelect: () => setTab("kontrak"),
      active: tab === "kontrak",
    },
    {
      key: "dompet",
      label: "Dompet & Penarikan",
      shortLabel: "Dompet",
      icon: <YieldChart3D size={18} />,
      onSelect: () => setTab("dompet"),
      active: tab === "dompet",
    },
    {
      key: "riwayat",
      label: "Riwayat Transaksi",
      shortLabel: "Riwayat",
      icon: <History3D size={18} />,
      onSelect: () => setTab("riwayat"),
      active: tab === "riwayat",
    },
  ];

  return (
    <DashboardShell
      greeting={greetingName}
      subGreeting="Ruang Pendana — alokasikan dana, pantau portofolio, cairkan Imbal Hasil."
      quickActions={
        <Button
          className="clay-btn-blue clay-shine relative px-5 font-semibold text-white"
          onClick={() => setDepositOpen(true)}
        >
          <Plus className="mr-1 size-4" /> Deposit Saldo
        </Button>
      }
      summary={summaryCards}
      tabs={dockTabs}
      reminder={null}
      footer={
        <p className="mt-10 border-t border-sky-100 pt-6 text-center text-xs leading-5 text-muted-foreground">
          PINDAI — Pendana menyediakan dana melalui skema Alokasi Dana dan menerima
          Imbal Hasil 30% dari pokok sebagai hak finansialnya. Setiap pergerakan dana
          tercatat berpasangan di jurnal append-only.
        </p>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="mt-2">
        <TabsList className="hidden">
          {/* Trigger disembunyikan — navigasi via dock 3D */}
          {dockTabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ============ TAB 1: MARKETPLACE ============ */}
        <TabsContent value="marketplace" className="mt-6">
          <MarketplaceSection />
        </TabsContent>

        {/* ============ TAB 2: PORTOFOLIO ============ */}
        <TabsContent value="portofolio" className="mt-6">
          <PortfolioSection portfolio={portfolio} />
        </TabsContent>

        {/* ============ TAB 3: E-CONTRACT ============ */}
        <TabsContent value="kontrak" className="mt-6">
          <FundingContractsSection />
        </TabsContent>

        {/* ============ TAB 4: DOMPET & PENARIKAN ============ */}
        <TabsContent value="dompet" className="mt-6">
          <WalletSection onDepositRequested={() => setDepositOpen(true)} />
        </TabsContent>

        {/* ============ TAB 5: RIWAYAT ============ */}
        <TabsContent value="riwayat" className="mt-6">
          <HistorySection />
        </TabsContent>
      </Tabs>

      {/* Dialog deposit simulasi (dibuka dari tombol header/kartu) */}
      <DepositSimDialog open={depositOpen} onClose={() => setDepositOpen(false)} />
    </DashboardShell>
  );
}

// =====================================================================
// Tab 1 — Marketplace pinjaman & gadai
// =====================================================================

function MarketplaceSection() {
  const marketplace = useQuery(api.pendana.marketplace);

  return (
    <div>
      {marketplace === undefined ? (
        <Loading />
      ) : marketplace.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Belum ada peluang pendanaan"
          body="Pinjaman yang telah disetujui tim akan tampil di sini beserta sisa kebutuhan pendanaannya. Semua peminjam sudah lolos verifikasi KYC."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {marketplace.map((m) => (
            <MarketCard key={m._id} row={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketCard({
  row,
}: {
  row: {
    _id: Id<"loans">;
    nomorReferensi: string;
    tujuan: string;
    pokokPinjaman: number;
    tenorHari: number;
    terkumpul: number;
    sisaKebutuhan: number;
    danaBersih: number;
    bunga: number;
    gadai: {
      deskripsiBarang: string;
      kategori: string;
      nilaiTaksiran: number;
      ltvPersen: number;
      kodeRakVault: string | null;
    } | null;
  };
}) {
  const allocateFunding = useMutation(api.pendana.allocateFunding);
  const waOtpStatus = useQuery(api.security.myWaOtpStatus, {});
  const [open, setOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [waNomorPendana, setWaNomorPendana] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Rupiah | null>(() => {
    try {
      return parseRupiah(jumlah);
    } catch {
      return null;
    }
  }, [jumlah]);

  const full = row.sisaKebutuhan <= 0;
  const pct = Math.min(100, Math.round((row.terkumpul / row.pokokPinjaman) * 100));

  const alokasikan = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan jumlah rupiah bulat yang valid.");
      return;
    }
    // OTP WA wajib — buka dialog verifikasi dulu; transaksi lanjut di callback.
    if (waOtpStatus?.aktif) {
      if (waNomorPendana.replace(/\D/g, "").length < 8) {
        setError("Masukkan nomor WhatsApp Anda (format 62…) untuk menerima kode OTP.");
        return;
      }
      setOtpOpen(true);
      return;
    }
    await eksekusiAlokasi();
  };

  const eksekusiAlokasi = async () => {
    setBusy(true);
    try {
      await allocateFunding({ loanId: row._id, jumlah: parsed! });
      toast.success("Alokasi berhasil dicatat di jurnal.");
      setOpen(false);
      setOtpOpen(false);
      setJumlah("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alokasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card-lift rounded-2xl border border-sky-100 bg-white p-5 shadow-md shadow-sky-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gradient-primary border-0 text-[10px] text-primary-foreground">
              Pinjaman Tunai
            </Badge>
            {row.gadai && (
              <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
                Gadai Digital — {row.gadai.kategori}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums">{formatRupiah(row.pokokPinjaman)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.nomorReferensi} · {loanPurposeLabel(row.tujuan)}
          </p>
        </div>
      </div>

      {/* Info jaminan gadai bila ada */}
      {row.gadai && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
          <VaultBox3D size={34} />
          <div className="min-w-0 text-xs">
            <p className="truncate font-medium text-emerald-900">{row.gadai.deskripsiBarang}</p>
            <p className="mt-0.5 tabular-nums text-emerald-700">
              Taksiran {formatRupiah(row.gadai.nilaiTaksiran)} · LTV {row.gadai.ltvPersen}%
              {row.gadai.kodeRakVault ? ` · rak ${row.gadai.kodeRakVault}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Rincian transparansi */}
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-sky-100 bg-secondary/40 px-3 py-2.5 text-center text-xs">
        <div>
          <dt className="text-muted-foreground">Tenor</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{row.tenorHari} hari</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Skor risiko admin</dt>
          <dd className="mt-0.5 font-semibold text-emerald-600">Terverifikasi KYC</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hak bunga (30%)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatRupiah(row.bunga)}
          </dd>
        </div>
      </dl>

      {/* Progress pendanaan */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">Dana terkumpul</span>
          <span className="tabular-nums text-muted-foreground">
            {formatRupiah(row.terkumpul)} / {formatRupiah(row.pokokPinjaman)}
          </span>
        </div>
        <Progress className="mt-1.5 h-2.5" value={pct} />
        <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
          Sisa kebutuhan {formatRupiah(row.sisaKebutuhan)} · dana bersih Peminjam{" "}
          {formatRupiah(row.danaBersih)} (95%)
        </p>
      </div>

      {full ? (
        <Badge className="mt-4 border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <BadgeCheck className="mr-1 size-3.5" /> Terpenuhi penuh oleh Pendana
        </Badge>
      ) : (
        <Button
          className="gradient-primary shadow-glow mt-4 w-full rounded-full border-0 font-medium transition-transform hover:-translate-y-0.5"
          onClick={() => setOpen(true)}
        >
          <Coins className="mr-1.5 size-4" />
          Alokasikan Dana Sekarang
        </Button>
      )}

      {/* Dialog alokasi — dilindungi anti-overfunding server-side */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alokasikan Dana</DialogTitle>
            <DialogDescription>
              {row.nomorReferensi} · sisa kebutuhan {formatRupiah(row.sisaKebutuhan)}. Alokasi
              melebihi sisa akan ditolak server (anti-overfunding).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="alo-jumlah">Jumlah alokasi</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="alo-jumlah"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  onBlur={() => {
                    if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
                  }}
                  placeholder={`Maks ${formatRupiah(row.sisaKebutuhan)}`}
                  disabled={busy}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Estimasi imbal hasil Anda:{" "}
                <span className="font-semibold tabular-nums text-emerald-700">
                  {formatRupiah(
                    parsed !== null && parsed > 0
                      ? Math.floor((row.bunga * Math.min(parsed, row.sisaKebutuhan)) / row.pokokPinjaman)
                      : 0,
                  )}
                </span>{" "}
                (30% proporsional)
              </p>
            </div>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {waOtpStatus?.aktif && (
              <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                <Label htmlFor="alo-wa">Nomor WhatsApp verifikasi (62…)</Label>
                <Input
                  id="alo-wa"
                  inputMode="tel"
                  value={waNomorPendana}
                  onChange={(e) => setWaNomorPendana(e.target.value)}
                  placeholder="628123456789"
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  Proteksi transaksi aktif — kode OTP dikirim ke nomor ini sebelum
                  alokasi diproses (5 menit, sekali pakai).
                </p>
              </div>
            )}
            <Button
              className="gradient-primary w-full rounded-full border-0"
              disabled={busy || parsed === null}
              onClick={alokasikan}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Konfirmasi Alokasi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {waNomorPendana && (
        <WaOtpDialog
          open={otpOpen}
          onOpenChange={setOtpOpen}
          tujuan={waNomorPendana.replace(/\D/g, "")}
          alasan={`Alokasi Dana ${row.nomorReferensi}`}
          onVerified={() => void eksekusiAlokasi()}
        />
      )}
    </article>
  );
}

// =====================================================================
// Tab 2 — Portofolio pendanaan saya
// =====================================================================

type PortfolioRow = {
  _id: Id<"fundings">;
  nomorReferensi: string;
  loanRef: string;
  tujuan: string;
  peminjamInisial: string;
  jumlahAlokasi: number;
  imbalHasil: number;
  statusAlokasi: string;
  statusPinjaman: string;
  statusPelunasan: "lancar" | "berjalan" | "menunggak";
  tenorHari: number;
  pelunasan: {
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
  } | null;
  jaminan: {
    deskripsiBarang: string;
    kategori: string;
    nilaiTaksiran: number | null;
    kodeRakVault: string | null;
  } | null;
};

function PortfolioSection({ portfolio }: { portfolio: PortfolioRow[] | undefined }) {
  if (portfolio === undefined) return <Loading />;
  if (portfolio.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Belum ada posisi pendanaan"
        body="Alokasikan dana di Marketplace — posisi pinjaman yang Anda danai tampil di sini lengkap dengan status pelunasannya."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {portfolio.map((f) => (
        <li
          key={f._id}
          className={`card-lift rounded-2xl border bg-white p-5 shadow-md shadow-sky-100 ${
            f.statusPelunasan === "menunggak" ? "border-red-200" : "border-sky-100"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Peminjam {f.peminjamInisial}{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  · {f.loanRef} / {f.nomorReferensi}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loanPurposeLabel(f.tujuan)} · tenor {f.tenorHari} hari
              </p>
            </div>
            <PortfolioStatusBadge state={f.statusPelunasan} />
          </div>

          <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Dana dialokasikan</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(f.jumlahAlokasi)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Estimasi imbal hasil</dt>
              <dd className="font-medium tabular-nums text-emerald-700">{formatRupiah(f.imbalHasil)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Jatuh tempo</dt>
              <dd className={`tabular-nums ${f.statusPelunasan === "menunggak" ? "text-red-600" : ""}`}>
                {f.pelunasan ? formatDate(f.pelunasan.jatuhTempoPada) : "Menunggu pendanaan penuh"}
              </dd>
            </div>
          </dl>

          {f.pelunasan && f.pelunasan.hariTerlambat > 0 && (
            <p className="mt-2 text-xs text-red-600">
              Terlambat {f.pelunasan.hariTerlambat} hari — denda berjalan{" "}
              {formatRupiah(f.pelunasan.dendaTerlambat)} ditambahkan ke kewajiban Peminjam.
            </p>
          )}

          {/* Widget pelacakan jaminan gadai */}
          {f.jaminan && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
              <VaultBox3D size={34} />
              <div className="min-w-0 text-xs">
                <p className="font-medium text-emerald-900">
                  Jaminan: {f.jaminan.deskripsiBarang}
                </p>
                <p className="mt-0.5 text-emerald-700">
                  {f.jaminan.kategori} · taksiran{" "}
                  {f.jaminan.nilaiTaksiran !== null ? formatRupiah(f.jaminan.nilaiTaksiran) : "—"} ·
                  tersimpan di Gudang Brankas PINDAI
                  {f.jaminan.kodeRakVault ? `, rak ${f.jaminan.kodeRakVault}` : ""} — terisolasi aman.
                </p>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function PortfolioStatusBadge({ state }: { state: "lancar" | "berjalan" | "menunggak" }) {
  if (state === "lancar") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Lancar</Badge>
    );
  }
  if (state === "menunggak") {
    return (
      <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">Menunggak</Badge>
    );
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Berjalan</Badge>
  );
}

// =====================================================================
// Tab 3 — E-Contract Pendanaan
// =====================================================================

function FundingContractsSection() {
  const contracts = useQuery(api.pendana.myFundingContracts);

  if (contracts === undefined) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Memuat dokumen…
      </div>
    );
  }
  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Belum ada perjanjian pendanaan"
        body="Perjanjian pendanaan digital tampil di sini setelah alokasi Anda tercatat pada pinjaman yang disetujui."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {contracts.map((c) => {
        const html = buildFundingContractHtml(c);
        return (
          <li
            key={c._id}
            className="card-lift rounded-2xl border border-sky-100 bg-white p-5 shadow-md shadow-sky-100"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{judulContract("pendanaan")}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="font-mono">{nomorContract("pendanaan", c.nomorReferensi)}</span> ·{" "}
                  {loanPurposeLabel(c.tujuan)} · alokasi {formatRupiah(c.jumlahAlokasi)} · hak bunga{" "}
                  {formatRupiah(c.imbalHasil)} (30%)
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pinjaman {c.loanRef} · pokok {formatRupiah(c.pokokPinjaman)} · tenor {c.tenorHari} hari ·{" "}
                  {formatDate(c.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ContractPreviewButton html={html} />
                <ContractPrintButton html={html} label="Unduh PDF" />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Rangkai HTML perjanjian pendanaan dari data milik Pendana sendiri. */
function buildFundingContractHtml(c: {
  nomorReferensi: string;
  loanRef: string;
  tujuan: string;
  jumlahAlokasi: number;
  imbalHasil: number;
  statusPinjaman: string;
  tenorHari: number;
  pokokPinjaman: number;
  createdAt: number;
}): string {
  const tgl = new Date(c.createdAt).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `
  <div class="contract">
    <h1>${judulContract("pendanaan")}</h1>
    <p class="nomor">Nomor: ${nomorContract("pendanaan", c.nomorReferensi)}</p>

    <p>Perjanjian penyediaan dana ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — penyelenggara layanan pinjam-gadai digital;</p>
    <p>dan</p>
    <p><strong>PENDANA</strong> pemegang nomor alokasi <strong>${c.nomorReferensi}</strong> ("Pendana").</p>

    <h2>Pasal 1 — Objek Pendanaan</h2>
    <ol>
      <li>Pendana menyediakan dana sebesar <strong>${formatRupiah(c.jumlahAlokasi)}</strong> untuk pinjaman ${c.loanRef} (tujuan: ${loanPurposeLabel(c.tujuan)}).</li>
      <li>Pokok pinjaman: ${formatRupiah(c.pokokPinjaman)} · tenor ${c.tenorHari} hari.</li>
      <li>Dana bersih (95% dari pokok) dicairkan ke Peminjam setelah pendanaan penuh.</li>
    </ol>

    <h2>Pasal 2 — Hak Imbal Hasil</h2>
    <ol>
      <li>Pendana menerima hak Imbal Hasil (Bunga) sebesar 30% dari porsi pokok yang didanai: <strong>${formatRupiah(c.imbalHasil)}</strong>.</li>
      <li>Imbal hasil dibayarkan penuh saat Peminjam melunasi total kewajiban 130% dari pokok.</li>
      <li>Total penerimaan Pendana saat pelunasan: <strong>${formatRupiah(c.jumlahAlokasi + c.imbalHasil)}</strong>.</li>
    </ol>

    <h2>Pasal 3 — Pencatatan</h2>
    <p>Setiap pergerakan dana dicatat berpasangan pada jurnal append-only Platform dan dapat diaudit kapan saja. Status perjanjian ini mengikuti status pinjaman: <strong>${c.statusPinjaman}</strong>.</p>

    <h2>Pasal 4 — Keabsahan Digital</h2>
    <p>Perjanjian ini dihasilkan otomatis oleh sistem dengan timestamp <strong>${new Date(c.createdAt).toLocaleString("id-ID")}</strong> dan dianggap sah oleh kedua belah pihak.</p>

    <div class="ttd">
      <div>
        <p class="garis">Pendana ${c.nomorReferensi}</p>
        <p>Pendana</p>
      </div>
      <div>
        <p class="garis">Pinjam Gadai Digital</p>
        <p>Platform</p>
      </div>
    </div>
  </div>`;
}

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
      <FileText className="mr-1.5 size-3.5" /> Lihat E-Contract
    </Button>
  );
}

// =====================================================================
// Tab 4 — Dompet & Penarikan
// =====================================================================

function WalletSection({ onDepositRequested }: { onDepositRequested: () => void }) {
  const wallet = useQuery(api.pendana.myWallet);
  const deposits = useQuery(api.pendana.myDeposits);
  const withdrawals = useQuery(api.pendana.myWithdrawals);
  const requestWithdrawal = useMutation(api.pendana.requestWithdrawal);
  const cancelWithdrawal = useMutation(api.pendana.cancelWithdrawal);

  const [jumlah, setJumlah] = useState("");
  const [namaBank, setNamaBank] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Rupiah | null>(() => {
    try {
      return parseRupiah(jumlah);
    } catch {
      return null;
    }
  }, [jumlah]);

  const ajukanPenarikan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (parsed === null) {
      setError("Masukkan jumlah rupiah bulat yang valid (min Rp 100.000).");
      return;
    }
    if (namaBank.trim().length < 2) {
      setError("Nama bank wajib diisi (mis. BCA, Mandiri).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    setBusy(true);
    try {
      await requestWithdrawal({
        jumlah: parsed,
        namaBank,
        nomorRekening,
      });
      toast.success("Permintaan penarikan terkirim — tim akan memprosesnya segera.");
      setJumlah("");
      setNamaBank("");
      setNomorRekening("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim permintaan penarikan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* ===== Setor / tambah saldo ===== */}
      <section className="card-lift rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Tambah Saldo (Deposit)</h3>
          <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <Wallet className="mr-1 size-3" /> Saldo {formatRupiah(wallet?.saldo ?? 0)}
          </Badge>
        </div>
        <Separator className="my-4" />
        <p className="text-xs leading-5 text-muted-foreground">
          Transfer ke rekening platform sesuai instruksi tim, atau gunakan simulasi
          QRIS / Virtual Account di bawah. Lalu ajukan setoran dengan nomor
          referensi bank — dana masuk dompet setelah diverifikasi tim.
        </p>
        <div className="mt-4">
          <DepositForm />
        </div>
        <Separator className="my-5" />
        <Button
          variant="outline"
          className="w-full rounded-full"
          onClick={onDepositRequested}
        >
          <QrCode className="mr-1.5 size-4" /> Lihat simulasi QRIS / Virtual Account
        </Button>
      </section>

      {/* ===== Penarikan ===== */}
      <section className="card-lift rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <h3 className="text-sm font-semibold">Penarikan Dana ke Rekening Pribadi</h3>
        <Separator className="my-4" />
        <form onSubmit={ajukanPenarikan} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wd-jumlah">Jumlah penarikan</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                Rp
              </span>
              <Input
                id="wd-jumlah"
                inputMode="numeric"
                className="pl-9 tabular-nums"
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
                onBlur={() => {
                  if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
                }}
                placeholder="2.500.000"
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wd-bank">Nama bank</Label>
              <Input
                id="wd-bank"
                value={namaBank}
                onChange={(e) => setNamaBank(e.target.value)}
                placeholder="BCA"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wd-rek">Nomor rekening</Label>
              <Input
                id="wd-rek"
                inputMode="numeric"
                value={nomorRekening}
                onChange={(e) => setNomorRekening(e.target.value)}
                placeholder="1234567890"
                className="tabular-nums"
                disabled={busy}
              />
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
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Ajukan Penarikan
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Dana diterima ke rekening Anda setelah tim memproses permintaan. Saldo
            dipotong dari ledger saat diproses — bukan saat diajukan.
          </p>
        </form>

        {/* Riwayat penarikan */}
        <Separator className="my-5" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Riwayat penarikan
        </h4>
        {withdrawals === undefined ? (
          <Loading />
        ) : withdrawals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Belum ada penarikan.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sky-100">
            {withdrawals.map((w) => (
              <li key={w._id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(w.jumlah)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {w.nomorReferensi} · {w.namaBank} {w.nomorRekening}
                    {w.catatanAdmin ? ` · ${w.catatanAdmin}` : ""}
                  </p>
                </div>
                <WithdrawalBadge status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Proteksi transaksi — OTP WhatsApp */}
      <section className="card-lift rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100 lg:col-span-2">
        <WaOtpProtectionCard />
      </section>

      {/* Riwayat setoran */}
      <section className="card-lift rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100 lg:col-span-2">
        <h3 className="text-sm font-semibold">Riwayat setoran</h3>
        <Separator className="my-4" />
        {deposits === undefined ? (
          <Loading />
        ) : deposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada setoran.</p>
        ) : (
          <ul className="divide-y divide-sky-100">
            {deposits.map((d) => (
              <li key={d._id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {d.nomorReferensi} · ref: {d.referensiTransfer}
                  </p>
                </div>
                <DepositBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// =====================================================================
// Kartu proteksi transaksi — aktif/nonaktifkan OTP WhatsApp wajib
// =====================================================================

function WaOtpProtectionCard() {
  const status = useQuery(api.security.myWaOtpStatus, {});
  const setWajib = useMutation(api.security.setWaOtpRequired);
  const [busy, setBusy] = useState(false);

  const toggle = async (wajib: boolean) => {
    setBusy(true);
    try {
      await setWajib({ wajib });
      toast.success(
        wajib
          ? "Proteksi OTP WhatsApp aktif — setiap alokasi/penarikan wajib verifikasi."
          : "Proteksi OTP WhatsApp dinonaktifkan.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah proteksi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Proteksi transaksi — OTP WhatsApp</h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            Aktifkan agar setiap alokasi dana dan penarikan meminta kode 6 digit
            yang dikirim ke WhatsApp Anda (berlaku 5 menit, sekali pakai).
            Percobaan verifikasi terbatas 5x per 15 menit.
          </p>
        </div>
      </div>
      {status?.aktif ? (
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => void toggle(false)}>
          Nonaktifkan
        </Button>
      ) : (
        <Button className="gradient-primary rounded-full border-0" disabled={busy} onClick={() => void toggle(true)}>
          Aktifkan proteksi
        </Button>
      )}
    </div>
  );
}

function WithdrawalBadge({ status }: { status: string }) {
  if (status === "diproses") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Diproses
      </Badge>
    );
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">Dibatalkan / Ditolak</Badge>;
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
      Menunggu Diproses
    </Badge>
  );
}

function DepositBadge({ status }: { status: string }) {
  if (status === "terverifikasi") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Terverifikasi
      </Badge>
    );
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">Ditolak</Badge>;
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
      Menunggu Verifikasi
    </Badge>
  );
}

/** Dialog simulasi QRIS / VA untuk deposit — murni visual, tanpa aset eksternal. */
function DepositSimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simulasi Deposit — QRIS / Virtual Account</DialogTitle>
          <DialogDescription>
            Salurkan dana lewat salah satu saluran simulasi, lalu ajukan setoran
            dengan nomor referensi transfer Anda.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="qris">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-sky-50 p-1">
            <TabsTrigger value="qris" className="rounded-full text-xs">QRIS</TabsTrigger>
            <TabsTrigger value="va" className="rounded-full text-xs">Virtual Account</TabsTrigger>
          </TabsList>
          <TabsContent value="qris" className="mt-4">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-sky-100 p-5">
              <QrSim />
              <p className="text-xs text-muted-foreground">
                Pindai QR simulasi — dana masuk dompet setelah tim memverifikasi transfer.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="va" className="mt-4">
            <div className="rounded-2xl border border-sky-100 p-4 text-center">
              <p className="text-xs text-muted-foreground">Nomor Virtual Account (simulasi)</p>
              <p className="mt-1 font-mono text-lg font-bold tracking-wider">880801000000000</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 rounded-full"
                onClick={() => {
                  void navigator.clipboard.writeText("880801000000000");
                  toast.success("Nomor VA disalin.");
                }}
              >
                Salin nomor
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** QR dekoratif deterministik (simulasi) — murni visual. */
function QrSim() {
  const cells = 21;
  const size = 9;
  let state = 987654321;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const grid: boolean[][] = Array.from({ length: cells }, () =>
    Array.from({ length: cells }, () => rand() > 0.5),
  );
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
  return (
    <svg
      width={200}
      height={200}
      viewBox={`0 0 ${cells * size} ${cells * size}`}
      className="rounded-xl bg-white p-1"
      role="img"
      aria-label="QRIS simulasi"
    >
      {grid.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect key={`${r}-${c}`} x={c * size} y={r * size} width={size} height={size} fill="#0F172A" rx={1.5} />
          ) : null,
        ),
      )}
    </svg>
  );
}

// =====================================================================
// Tab 5 — Riwayat transaksi
// =====================================================================

function HistorySection() {
  const fundings = useQuery(api.pendana.myFundings);
  const deposits = useQuery(api.pendana.myDeposits);
  const withdrawals = useQuery(api.pendana.myWithdrawals);

  if (fundings === undefined || deposits === undefined || withdrawals === undefined) {
    return <Loading />;
  }
  const kosong = fundings.length === 0 && deposits.length === 0 && withdrawals.length === 0;
  if (kosong) {
    return (
      <EmptyState
        icon={Landmark}
        title="Belum ada transaksi"
        body="Semua alokasi, setoran, dan penarikan Anda tercatat di sini."
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <section>
        <h3 className="text-sm font-semibold">Alokasi pendanaan</h3>
        {fundings.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
            {fundings.map((f) => (
              <li key={f._id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(f.jumlahAlokasi)}</p>
                  <FundingStatusBadge status={f.status} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {f.nomorReferensi} → {f.loanRef} · imbal hasil {formatRupiah(f.imbalHasil)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Setoran</h3>
        {deposits.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
            {deposits.map((d) => (
              <li key={d._id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                  <DepositBadge status={d.status} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {d.nomorReferensi} · ref {d.referensiTransfer}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Penarikan</h3>
        {withdrawals.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
            {withdrawals.map((w) => (
              <li key={w._id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium tabular-nums">{formatRupiah(w.jumlah)}</p>
                  <WithdrawalBadge status={w.status} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {w.nomorReferensi} · {w.namaBank} {w.nomorRekening}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FundingStatusBadge({ status }: { status: string }) {
  if (status === "selesai") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Imbal Hasil Cair
      </Badge>
    );
  }
  if (status === "dibatalkan") {
    return <Badge variant="destructive">Dibatalkan</Badge>;
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
      Dalam Pendanaan Berjalan
    </Badge>
  );
}

// =====================================================================
// Setoran (form asli — verifikasi admin) + shared UI
// =====================================================================

function DepositForm() {
  const requestDeposit = useMutation(api.pendana.requestDeposit);
  const [jumlah, setJumlah] = useState("");
  const [referensi, setReferensi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Rupiah | null>(() => {
    try {
      return parseRupiah(jumlah);
    } catch {
      return null;
    }
  }, [jumlah]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (parsed === null) {
          setError("Masukkan jumlah rupiah bulat yang valid (min Rp 100.000).");
          return;
        }
        if (referensi.trim().length < 4) {
          setError("Nomor referensi transfer wajib diisi.");
          return;
        }
        setBusy(true);
        try {
          await requestDeposit({ jumlah: parsed, referensiTransfer: referensi });
          toast.success("Setoran diajukan — menunggu verifikasi tim.");
          setJumlah("");
          setReferensi("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal mengirim setoran.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="dep-jumlah">Jumlah setoran</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            Rp
          </span>
          <Input
            id="dep-jumlah"
            inputMode="numeric"
            className="pl-9 tabular-nums"
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
            onBlur={() => {
              if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
            }}
            placeholder="5.000.000"
            disabled={busy}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dep-ref">Nomor referensi transfer</Label>
        <Input
          id="dep-ref"
          value={referensi}
          onChange={(e) => setReferensi(e.target.value)}
          placeholder="Contoh: BCAX0012345678"
          disabled={busy}
        />
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="gradient-primary shadow-glow w-full rounded-full border-0 font-medium transition-transform hover:-translate-y-0.5"
        disabled={busy}
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        <Plus className="mr-1 size-4" />
        Ajukan setoran
      </Button>
    </form>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Memuat…
    </div>
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
