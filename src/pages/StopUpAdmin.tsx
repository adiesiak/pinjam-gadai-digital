/**
 * STOP-UP! — Panel Admin (Layout Left Sidebar Navigation)
 *
 * Bagian: Overview · Transaksi · Katalog & Harga · Supplier H2H ·
 *         Terminal Monitor · Payment Gateway · User Management
 *
 * Semua angka berasal dari agregasi database sungguhan (tidak ada data dummy).
 */
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowDownToLine,
  BarChart3,
  CheckCircle2,
  Gauge,
  Globe2,
  LayoutGrid,
  Loader2,
  MonitorSmartphone,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { LogoStopUp } from "@/components/LogoStopUp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { labelJamWib } from "@/lib/stopup/waktu";

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

type Bagian =
  | "overview"
  | "transaksi"
  | "katalog"
  | "supplier"
  | "terminal"
  | "gateway"
  | "pengguna";

const NAV: Array<{ id: Bagian; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Overview", icon: <Gauge className="size-4" /> },
  { id: "transaksi", label: "Transaksi", icon: <BarChart3 className="size-4" /> },
  { id: "katalog", label: "Katalog & Harga", icon: <LayoutGrid className="size-4" /> },
  { id: "supplier", label: "Supplier H2H", icon: <Package className="size-4" /> },
  { id: "terminal", label: "Terminal Monitor", icon: <MonitorSmartphone className="size-4" /> },
  { id: "gateway", label: "Payment Gateway", icon: <Globe2 className="size-4" /> },
  { id: "pengguna", label: "User Management", icon: <Users className="size-4" /> },
];

function badgeWarna(status: string) {
  const peta: Record<string, string> = {
    SUCCESS: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
    PROCESSING: "bg-sky-500/15 text-sky-300 border-sky-400/40",
    PENDING: "bg-amber-500/15 text-amber-300 border-amber-400/40",
    FAILED: "bg-rose-500/15 text-rose-300 border-rose-400/40",
    EXPIRED: "bg-slate-500/15 text-slate-300 border-slate-400/40",
    AKTIF: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
    NONAKTIF: "bg-slate-500/15 text-slate-300 border-slate-400/40",
    production: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
    sandbox: "bg-amber-500/15 text-amber-300 border-amber-400/40",
  };
  return peta[status] ?? "bg-slate-500/15 text-slate-300 border-slate-400/40";
}

function Chip({ children, status }: { children: React.ReactNode; status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badgeWarna(status)}`}
    >
      {children}
    </span>
  );
}

function Memuat() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-sky-400" />
    </div>
  );
}

/** Panel gelap khas City Night untuk seluruh isi admin. */
function Panel({
  judul,
  aksi,
  children,
  keterangan,
}: {
  judul: string;
  aksi?: React.ReactNode;
  children: React.ReactNode;
  keterangan?: string;
}) {
  return (
    <Card className="border-slate-700/50 bg-slate-900/60 text-slate-100">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base font-bold">{judul}</CardTitle>
          {keterangan ? (
            <p className="mt-1 text-xs text-slate-400">{keterangan}</p>
          ) : null}
        </div>
        {aksi}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ============================== SHELL ============================== */

export default function StopUpAdmin() {
  const { user, isLoading } = useAuth();
  const [bagian, setBagian] = useState<Bagian>("overview");
  const boleh = user?.role === "admin" || user?.role === "supervisor";

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#090d16]">
        <Loader2 className="size-6 animate-spin text-sky-400" />
      </div>
    );
  }

  if (!boleh) return <GerbangAkses role={user?.role ?? "member"} />;

  return (
    <div className="kiosk-night flex min-h-dvh text-slate-100">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-700/40 bg-slate-950/60 p-5 lg:flex">
        <Link to="/" className="mb-6 block">
          <LogoStopUp size={26} tagline taglineClassName="!tracking-[0.18em]" />
        </Link>
        <nav className="flex flex-col gap-1.5">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setBagian(n.id)}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                bagian === n.id
                  ? "bg-sky-500/90 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800/70"
              }`}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3 text-xs text-slate-500">
          <Separator className="bg-slate-700/50" />
          <p>
            Masuk sebagai{" "}
            <span className="font-semibold text-slate-300">
              {user?.name ?? user?.email ?? "operator"}
            </span>
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200"
          >
            ← Buka layar terminal
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-2 overflow-x-auto border-b border-slate-700/40 p-3 lg:hidden">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setBagian(n.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${
                bagian === n.id
                  ? "bg-sky-500 text-slate-950"
                  : "border border-slate-700/60 text-slate-300"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>

        <main className="kiosk-scroll flex-1 space-y-5 p-5 lg:p-7">
          {bagian === "overview" ? <BagianOverview /> : null}
          {bagian === "transaksi" ? <BagianTransaksi /> : null}
          {bagian === "katalog" ? <BagianKatalog /> : null}
          {bagian === "supplier" ? <BagianSupplier /> : null}
          {bagian === "terminal" ? <BagianTerminal /> : null}
          {bagian === "gateway" ? <BagianGateway /> : null}
          {bagian === "pengguna" ? <BagianPengguna /> : null}
        </main>
      </div>
    </div>
  );
}

/**
 * Gerbang akses panel: bila belum ada admin sama sekali, tawarkan bootstrap
 * admin pertama (akun email terverifikasi). Setelah itu promosi peran
 * berikutnya dilakukan dari bagian User Management.
 */
function GerbangAkses({ role }: { role: string }) {
  const adaAdmin = useQuery(api.admin.adminExists, {});
  const bootstrap = useMutation(api.admin.bootstrapFirstAdmin);
  const [memproses, setMemproses] = useState(false);

  return (
    <div className="kiosk-night flex min-h-dvh items-center justify-center px-6">
      <Card className="w-full max-w-md border-slate-700/60 bg-slate-900/70 text-slate-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-rose-300" />
            Akses Terbatas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <p>
            Panel ini hanya untuk peran <b>admin</b> atau <b>supervisor</b>. Akun Anda
            saat ini: <span className="font-mono text-amber-200">{role}</span>.
          </p>

          {adaAdmin === false ? (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-xs text-amber-100">
              Sistem ini belum memiliki admin sama sekali. Anda bisa menjadi
              admin utama — akses panel, katalog, harga, dan supplier akan
              terbuka. Diperlukan akun email terverifikasi (bukan akun tamu).
            </div>
          ) : null}

          {adaAdmin === false ? (
            <Button
              className="w-full"
              disabled={memproses}
              onClick={async () => {
                setMemproses(true);
                try {
                  await bootstrap({});
                  toast.success("Anda kini admin utama STOP-UP!.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal bootstrap admin.");
                } finally {
                  setMemproses(false);
                }
              }}
            >
              {memproses ? "Memproses…" : "Jadikan saya admin utama"}
            </Button>
          ) : null}

          <Button asChild variant="secondary" className="w-full">
            <Link to="/">Kembali ke layar terminal</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================== OVERVIEW ============================== */

function Kpi({
  label,
  nilai,
  catatan,
  aksen,
}: {
  label: string;
  nilai: string;
  catatan?: string;
  aksen: string;
}) {
  return (
    <Card className="border-slate-700/50 bg-slate-900/60 text-slate-100">
      <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-widest text-slate-500">{label}</p>
        <p className={`mt-2 font-mono text-2xl font-black ${aksen}`}>{nilai}</p>
        {catatan ? <p className="mt-1 text-[11px] text-slate-400">{catatan}</p> : null}
      </CardContent>
    </Card>
  );
}

function BagianOverview() {
  const d = useQuery(api.stopup.settings.adminOverview, {});
  const sync = useMutation(api.stopup.suppliers.syncCatalog);

  if (!d) return <Memuat />;

  const maks = Math.max(1, ...d.seri7Hari.map((s) => s.omzet));
  const rasio =
    d.hariIni.transaksi > 0
      ? Math.round((d.hariIni.sukses / d.hariIni.transaksi) * 100)
      : 0;

  const jalankanSync = async () => {
    try {
      const hasil = await sync({});
      toast.success(
        `Sync katalog (${hasil.mode}): ${hasil.baru} produk baru, ${hasil.diperbarui} diperbarui.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync gagal.");
    }
  };

  return (
    <>
      {d.totalProduk === 0 ? (
        <Card className="border-amber-400/40 bg-amber-400/10 text-amber-50">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-bold">Katalog masih kosong</p>
                <p className="text-xs text-amber-100/80">
                  Tekan One-Click Catalog Sync untuk menarik katalog SKU dari
                  supplier H2H (atau katalog acuan dalam Mode Simulasi).
                </p>
              </div>
            </div>
            <Button onClick={jalankanSync} className="gap-2">
              <RefreshCw className="size-4" /> Sync Katalog
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Omzet hari ini" nilai={rupiah(d.hariIni.omzet)} aksen="text-emerald-300" catatan={`${d.hariIni.sukses} transaksi sukses`} />
        <Kpi label="Laba hari ini" nilai={rupiah(d.hariIni.laba)} aksen="text-sky-300" catatan="Harga jual − HPP supplier" />
        <Kpi label="Transaksi hari ini" nilai={String(d.hariIni.transaksi)} aksen="text-slate-100" catatan={`${d.hariIni.pending} menunggu · ${d.hariIni.gagal} gagal`} />
        <Kpi label="Tingkat sukses" nilai={`${rasio}%`} aksen={rasio >= 90 ? "text-emerald-300" : "text-amber-300"} catatan={`${d.totalProdukAktif} dari ${d.totalProduk} produk aktif`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel judul="Omzet 7 Hari Terakhir" keterangan="Zona waktu WIB">
          <div className="flex h-52 items-end gap-3">
            {d.seri7Hari.map((s) => (
              <div key={s.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-slate-400">
                  {s.omzet > 0 ? `${Math.round(s.omzet / 1000)}k` : "-"}
                </span>
                <div className="flex h-32 w-full items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-sky-600/60 to-sky-400"
                    style={{ height: `${Math.max(3, (s.omzet / maks) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          judul="Status Operasional"
          keterangan={`Ambang saldo rendah ${rupiah(d.ambangSaldo)}`}
        >
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Terminal online</span>
              <span className="font-mono">
                {d.terminal.online} / {d.terminal.total}
              </span>
            </div>
            {d.supplier.length === 0 ? (
              <p className="text-xs text-amber-200">
                Belum ada supplier H2H terdaftar.
              </p>
            ) : (
              d.supplier.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-slate-300">{s.name}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xs ${s.rendah ? "text-rose-300" : "text-slate-200"}`}
                    >
                      {rupiah(s.balance)}
                    </span>
                    {s.rendah ? <Chip status="FAILED">RENDAH</Chip> : <Chip status="SUCCESS">OK</Chip>}
                  </span>
                </div>
              ))
            )}
            {d.terminal.bermasalah.length > 0 ? (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                <p className="font-bold">Perangkat bermasalah</p>
                <ul className="mt-1 space-y-0.5">
                  {d.terminal.bermasalah.map((t) => (
                    <li key={t.code}>
                      • {t.code}: kertas {t.paperStatus}
                      {t.printerConnected ? "" : " · printer terputus"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.supplier.length === 0 || d.totalProduk === 0 ? (
              <Button onClick={jalankanSync} variant="secondary" className="w-full gap-2">
                <RefreshCw className="size-4" /> One-Click Catalog Sync
              </Button>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel judul="Produk Terlaris (7 hari)">
          {d.produkTerlaris.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada transaksi sukses.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50">
                  <TableHead className="text-slate-400">Produk</TableHead>
                  <TableHead className="text-right text-slate-400">Terjual</TableHead>
                  <TableHead className="text-right text-slate-400">Omzet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.produkTerlaris.map((p) => (
                  <TableRow key={p.nama} className="border-slate-800/60">
                    <TableCell className="text-slate-200">{p.nama}</TableCell>
                    <TableCell className="text-right font-mono">{p.jumlah}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-300">
                      {rupiah(p.omzet)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel judul="Transaksi Terbaru">
          {d.terbaru.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada transaksi 7 hari terakhir.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50">
                  <TableHead className="text-slate-400">Jam</TableHead>
                  <TableHead className="text-slate-400">Produk</TableHead>
                  <TableHead className="text-slate-400">Tujuan</TableHead>
                  <TableHead className="text-right text-slate-400">Nilai</TableHead>
                  <TableHead className="text-right text-slate-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.terbaru.map((t) => (
                  <TableRow key={t.invoiceId} className="border-slate-800/60">
                    <TableCell className="font-mono text-xs text-slate-400">{t.jam}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-slate-200">
                      {t.icon} {t.produk}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{t.targetNo}</TableCell>
                    <TableCell className="text-right font-mono">{rupiah(t.sellPrice)}</TableCell>
                    <TableCell className="text-right">
                      <Chip status={t.status}>{t.status}</Chip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ============================== TRANSAKSI ============================== */

function BagianTransaksi() {
  const [status, setStatus] = useState<string>("SEMUA");
  const [cari, setCari] = useState("");
  const [hariIni, setHariIni] = useState(false);
  const ulangi = useMutation(api.stopup.transactions.ulangiTransaksi);

  const args = {
    status: status === "SEMUA" ? undefined : (status as "PENDING"),
    cari: cari.trim() || undefined,
    hanyaHariIni: hariIni,
    limit: 200,
  };
  const rows = useQuery(api.stopup.transactions.listTransactions, args);

  return (
    <Panel
      judul="Riwayat Transaksi"
      keterangan="Snapshot harga tersimpan per struk — aman dari perubahan katalog"
      aksi={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Invoice / nomor tujuan / voucher"
              className="h-9 w-64 border-slate-700/60 bg-slate-950/60 pl-9 text-sm"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-36 border-slate-700/60 bg-slate-950/60 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["SEMUA", "PENDING", "PROCESSING", "SUCCESS", "FAILED", "EXPIRED"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <Switch checked={hariIni} onCheckedChange={setHariIni} />
            Hari ini
          </label>
        </div>
      }
    >
      {!rows ? (
        <Memuat />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Belum ada transaksi pada filter ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50">
                <TableHead className="text-slate-400">Invoice</TableHead>
                <TableHead className="text-slate-400">Produk</TableHead>
                <TableHead className="text-slate-400">Tujuan</TableHead>
                <TableHead className="text-slate-400">Terminal</TableHead>
                <TableHead className="text-right text-slate-400">Jual</TableHead>
                <TableHead className="text-right text-slate-400">Laba</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} className="border-slate-800/60">
                  <TableCell className="font-mono text-xs text-slate-300">
                    {t.invoiceId}
                    <span className="block text-[10px] text-slate-500">
                      {labelJamWib(t.createdAt)} WIB
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[220px] text-slate-200">
                    <span className="block truncate">
                      {t.icon} {t.produk}
                    </span>
                    <span className="text-[10px] text-slate-500">{t.brand}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-300">
                    {t.targetNo}
                    {t.accountNameMasked ? (
                      <span className="block text-[10px] text-slate-500">
                        {t.accountNameMasked}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{t.terminal}</TableCell>
                  <TableCell className="text-right font-mono">{rupiah(t.sellPrice)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-300">
                    {rupiah(t.profit)}
                  </TableCell>
                  <TableCell>
                    <Chip status={t.status}>{t.status}</Chip>
                    {t.voucherCode ? (
                      <span className="mt-1 block font-mono text-[10px] text-amber-200">
                        {t.voucherCode}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {t.status === "FAILED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5"
                        onClick={async () => {
                          try {
                            await ulangi({ transactionId: t.id as never });
                            toast.success("Transaksi dikirim ulang ke supplier.");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Gagal mengulang.");
                          }
                        }}
                      >
                        <RefreshCw className="size-3.5" /> Kirim ulang
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

/* ============================ KATALOG & HARGA ============================ */

type ProdukAdmin = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string | null;
  badgeLabel: string | null;
  kategori: string;
  brand: string;
  supplier: string;
  hppPrice: number;
  sellPrice: number;
  discountPrice: number | null;
  isDiscountActive: boolean;
  hargaJual: number;
  laba: number;
  marginPersen: number;
  deliveryType: string;
  status: string;
};

function BagianKatalog() {
  const katalog = useQuery(api.stopup.catalog.adminCatalog, {});
  const updateProduct = useMutation(api.stopup.catalog.updateProduct);
  const bulkPrice = useMutation(api.stopup.catalog.bulkPriceUpdate);

  const [cari, setCari] = useState("");
  const [filterKategori, setFilterKategori] = useState("SEMUA");
  const [edit, setEdit] = useState<ProdukAdmin | null>(null);

  // --- Bulk price ---
  const [bulkKategori, setBulkKategori] = useState("SEMUA");
  const [bulkMode, setBulkMode] = useState<"fixed" | "percent">("percent");
  const [bulkValue, setBulkValue] = useState("5");
  const [bulkRounding, setBulkRounding] = useState<"none" | "ratus" | "ribu">("ratus");
  const [bulkMinLaba, setBulkMinLaba] = useState("500");
  const [pratinjau, setPratinjau] = useState<
    Array<{ productId: string; nama: string; sebelum: number; sesudah: number; dilewati: boolean }>
  >([]);

  if (!katalog) return <Memuat />;

  const kata = cari.trim().toLowerCase();
  const produkTampil: ProdukAdmin[] = katalog.produk.filter(
    (p) =>
      (filterKategori === "SEMUA" || p.kategori === filterKategori) &&
      (kata === "" ||
        p.name.toLowerCase().includes(kata) ||
        p.code.toLowerCase().includes(kata) ||
        p.brand.toLowerCase().includes(kata)),
  );

  const jalankanBulk = async (dryRun: boolean) => {
    const nilai = Number(bulkValue) || 0;
    const minLaba = Number(bulkMinLaba) || 0;
    const rumus = { target: "sell" as const, mode: bulkMode, value: nilai, rounding: bulkRounding, categoryCode: bulkKategori === "SEMUA" ? undefined : katalog.kategori.find((k) => k.name === bulkKategori)?.code, minLaba, dryRun };
    try {
      const hasil = await bulkPrice({ ...rumus });
      setPratinjau(
        hasil.baris.slice(0, 40).map((b) => ({
          productId: b.productId,
          nama: b.nama,
          sebelum: b.sebelum,
          sesudah: b.sesudah,
          dilewati: b.dilewati,
        })),
      );
      if (dryRun) {
        toast.message(`Pratinjau: ${hasil.diubah} produk akan diubah, ${hasil.dilewati} dilewati.`);
      } else {
        toast.success(`${hasil.diubah} harga diperbarui, ${hasil.dilewati} dilewati.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk price gagal.");
    }
  };

  return (
    <>
      <Panel
        judul="Katalog Produk"
        keterangan="Atur nama, ikon, badge, harga, dan status produk"
        aksi={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari produk / kode / brand"
                className="h-9 w-64 border-slate-700/60 bg-slate-950/60 pl-9 text-sm"
              />
            </div>
            <Select value={filterKategori} onValueChange={setFilterKategori}>
              <SelectTrigger className="h-9 w-40 border-slate-700/60 bg-slate-950/60 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEMUA">Semua kategori</SelectItem>
                {katalog.kategori.map((k) => (
                  <SelectItem key={k.id} value={k.name}>
                    {k.icon} {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <div className="max-h-[460px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50">
                <TableHead className="text-slate-400">Produk</TableHead>
                <TableHead className="text-slate-400">Kategori</TableHead>
                <TableHead className="text-right text-slate-400">HPP</TableHead>
                <TableHead className="text-right text-slate-400">Jual</TableHead>
                <TableHead className="text-right text-slate-400">Laba</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produkTampil.slice(0, 300).map((p) => (
                <TableRow key={p.id} className="border-slate-800/60">
                  <TableCell className="max-w-[280px]">
                    <span className="block truncate text-slate-200">
                      {p.icon} {p.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">{p.code}</span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {p.kategori}
                    <span className="block text-[10px] text-slate-500">{p.brand}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{rupiah(p.hppPrice)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {rupiah(p.hargaJual)}
                    {p.isDiscountActive && p.discountPrice ? (
                      <span className="block text-[10px] text-amber-300">PROMO</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-300">
                    {rupiah(p.laba)}
                    <span className="block text-[10px] text-slate-500">{p.marginPersen}%</span>
                  </TableCell>
                  <TableCell>
                    <Chip status={p.status}>{p.status}</Chip>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {produkTampil.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Tidak ada produk cocok.</p>
        ) : null}
      </Panel>

      <Panel
        judul="Bulk Price Management"
        keterangan="Fixed add-on, percentage add-on, dan auto-rounding ke ratusan/ribuan"
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Kategori</Label>
            <Select value={bulkKategori} onValueChange={setBulkKategori}>
              <SelectTrigger className="border-slate-700/60 bg-slate-950/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEMUA">Semua kategori</SelectItem>
                {katalog.kategori.map((k) => (
                  <SelectItem key={k.id} value={k.name}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Formula</Label>
            <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as "fixed" | "percent")}>
              <SelectTrigger className="border-slate-700/60 bg-slate-950/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage add-on (%)</SelectItem>
                <SelectItem value="fixed">Fixed add-on (Rp)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">
              Nilai {bulkMode === "percent" ? "(%)" : "(Rp)"}
            </Label>
            <Input
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              inputMode="numeric"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Auto-rounding</Label>
            <Select
              value={bulkRounding}
              onValueChange={(v) => setBulkRounding(v as "none" | "ratus" | "ribu")}
            >
              <SelectTrigger className="border-slate-700/60 bg-slate-950/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Tanpa pembulatan</SelectItem>
                <SelectItem value="ratus">Ke ratusan terdekat</SelectItem>
                <SelectItem value="ribu">Ke ribuan terdekat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Laba minimum (Rp)</Label>
            <Input
              value={bulkMinLaba}
              onChange={(e) => setBulkMinLaba(e.target.value)}
              inputMode="numeric"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => jalankanBulk(true)}>
            Pratinjau
          </Button>
          <Button onClick={() => jalankanBulk(false)}>Terapkan ke semua</Button>
        </div>

        {pratinjau.length > 0 ? (
          <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-700/50">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50">
                  <TableHead className="text-slate-400">Produk</TableHead>
                  <TableHead className="text-right text-slate-400">Sebelum</TableHead>
                  <TableHead className="text-right text-slate-400">Sesudah</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pratinjau.map((b) => (
                  <TableRow key={b.productId} className="border-slate-800/60">
                    <TableCell className="max-w-[320px] truncate text-slate-200">{b.nama}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {rupiah(b.sebelum)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{rupiah(b.sesudah)}</TableCell>
                    <TableCell>
                      {b.dilewati ? (
                        <Chip status="FAILED">DILEWATI (rugi)</Chip>
                      ) : (
                        <Chip status="SUCCESS">DIUBAH</Chip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </Panel>

      <DialogProduk
        produk={edit}
        onTutup={() => setEdit(null)}
        onSimpan={async (patch) => {
          try {
            await updateProduct({ productId: edit?.id as never, ...patch });
            toast.success("Produk diperbarui.");
            setEdit(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
          }
        }}
      />
    </>
  );
}

function DialogProduk({
  produk,
  onTutup,
  onSimpan,
}: {
  produk: ProdukAdmin | null;
  onTutup: () => void;
  onSimpan: (patch: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "",
    iconUrl: "",
    badgeLabel: "",
    hppPrice: "0",
    sellPrice: "0",
    discountPrice: "",
    isDiscountActive: false,
    status: "AKTIF",
    deliveryType: "INJECT_PHONE",
  });
  const [siap, setSiap] = useState<string | null>(null);

  // Isi form saat produk berubah (key-based remount ringan).
  if (produk && siap !== produk.id) {
    setSiap(produk.id);
    setForm({
      name: produk.name,
      description: produk.description,
      icon: produk.icon,
      iconUrl: produk.iconUrl ?? "",
      badgeLabel: produk.badgeLabel ?? "",
      hppPrice: String(produk.hppPrice),
      sellPrice: String(produk.sellPrice),
      discountPrice: produk.discountPrice ? String(produk.discountPrice) : "",
      isDiscountActive: produk.isDiscountActive,
      status: produk.status,
      deliveryType: produk.deliveryType,
    });
  }

  if (!produk) return null;

  const hpp = Number(form.hppPrice) || 0;
  const jual = Number(form.sellPrice) || 0;
  const promo = Number(form.discountPrice) || 0;
  const hargaAkhir = form.isDiscountActive && promo > 0 && promo < jual ? promo : jual;

  return (
    <Dialog open onOpenChange={(o) => (!o ? onTutup() : undefined)}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto border-slate-700/60 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Edit Produk</DialogTitle>
          <DialogDescription className="text-slate-400">
            {produk.code} · {produk.kategori} · {produk.brand}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Nama produk</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Deskripsi</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Ikon (emoji)</Label>
            <Input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label>URL ikon (PNG/SVG transparan)</Label>
            <Input
              value={form.iconUrl}
              onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
              placeholder="https://…/icon.png"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Badge custom</Label>
            <Input
              value={form.badgeLabel}
              onChange={(e) => setForm({ ...form, badgeLabel: e.target.value })}
              placeholder="BEST SELLER / PROMO"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipe pengiriman</Label>
            <Select
              value={form.deliveryType}
              onValueChange={(v) => setForm({ ...form, deliveryType: v })}
            >
              <SelectTrigger className="border-slate-700/60 bg-slate-950/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INJECT_PHONE">INJECT_PHONE</SelectItem>
                <SelectItem value="INJECT_EMAIL">INJECT_EMAIL</SelectItem>
                <SelectItem value="VOUCHER_CODE">VOUCHER_CODE</SelectItem>
                <SelectItem value="PPOB_INQUIRY">PPOB_INQUIRY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>HPP (Rp)</Label>
            <Input
              value={form.hppPrice}
              onChange={(e) => setForm({ ...form, hppPrice: e.target.value })}
              inputMode="numeric"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Harga jual normal (Rp)</Label>
            <Input
              value={form.sellPrice}
              onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
              inputMode="numeric"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Harga promo / coret (Rp)</Label>
            <Input
              value={form.discountPrice}
              onChange={(e) => setForm({ ...form, discountPrice: e.target.value })}
              inputMode="numeric"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="border-slate-700/60 bg-slate-950/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AKTIF">AKTIF</SelectItem>
                <SelectItem value="NONAKTIF">NONAKTIF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-3 sm:col-span-2">
            <Switch
              checked={form.isDiscountActive}
              onCheckedChange={(v) => setForm({ ...form, isDiscountActive: v })}
            />
            <span className="text-sm text-slate-300">Aktifkan harga promo</span>
          </label>

          <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4 text-xs sm:col-span-2">
            <p className="text-slate-400">Harga jual aktif</p>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-300">
              {rupiah(hargaAkhir)}
            </p>
            <p className="mt-1 text-slate-400">
              Laba per unit{" "}
              <span className="font-mono text-slate-200">
                {rupiah(hargaAkhir - hpp)}
              </span>{" "}
              {hargaAkhir < hpp ? (
                <span className="text-rose-300">— di bawah HPP, akan ditolak sistem</span>
              ) : null}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onTutup}>
            Batal
          </Button>
          <Button
            onClick={() =>
              onSimpan({
                name: form.name,
                description: form.description,
                icon: form.icon,
                iconUrl: form.iconUrl || undefined,
                badgeLabel: form.badgeLabel || undefined,
                hppPrice: hpp,
                sellPrice: jual,
                discountPrice: promo > 0 ? promo : null,
                isDiscountActive: form.isDiscountActive,
                status: form.status,
                deliveryType: form.deliveryType,
              })
            }
          >
            Simpan Produk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= SUPPLIER H2H ============================= */

function BagianSupplier() {
  const supplier = useQuery(api.stopup.suppliers.listSuppliers, {});
  const pratinjau = useQuery(api.stopup.suppliers.syncPreview, {});
  const simpan = useMutation(api.stopup.suppliers.saveSupplier);
  const toggle = useMutation(api.stopup.suppliers.setSupplierActive);
  const topUp = useMutation(api.stopup.suppliers.topUpSupplierBalance);
  const sync = useMutation(api.stopup.suppliers.syncCatalog);

  const [edit, setEdit] = useState<{
    id?: string;
    code: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    secretKey: string;
    mode: "sandbox" | "production";
    priority: string;
    isActive: boolean;
  } | null>(null);
  const [topUpJumlah, setTopUpJumlah] = useState("1000000");
  const [topUpTarget, setTopUpTarget] = useState<string | null>(null);

  if (!supplier || !pratinjau) return <Memuat />;

  const jalankanSync = async () => {
    try {
      const hasil = await sync({});
      toast.success(
        `Sync ${hasil.mode}: ${hasil.baru} produk baru, ${hasil.diperbarui} diperbarui.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync gagal.");
    }
  };

  return (
    <>
      <Panel
        judul="Supplier H2H"
        keterangan="Pemetaan kunci: Digiflazz → API key + username · Tripay → API key + private key"
        aksi={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setEdit({
                  code: "",
                  name: "",
                  baseUrl: "https://api.digiflazz.com/v1",
                  apiKey: "",
                  secretKey: "",
                  mode: "sandbox",
                  priority: String(supplier.length + 1),
                  isActive: true,
                })
              }
            >
              Tambah Supplier
            </Button>
            <Button className="gap-2" onClick={jalankanSync}>
              <RefreshCw className="size-4" /> One-Click Catalog Sync
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {supplier.length === 0 ? (
            <p className="text-sm text-slate-400">
              Belum ada supplier. Tambahkan konfigurasi H2H untuk mulai.
            </p>
          ) : null}
          {supplier.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-100">{s.name}</p>
                  <p className="font-mono text-[11px] text-slate-500">
                    {s.code} · prioritas {s.priority}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Chip status={s.mode}>{s.mode.toUpperCase()}</Chip>
                  <Chip status={s.isActive ? "AKTIF" : "NONAKTIF"}>
                    {s.isActive ? "AKTIF" : "MATI"}
                  </Chip>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                <p>
                  Saldo deposit:{" "}
                  <span className="font-mono text-slate-200">{rupiah(s.balance)}</span>
                </p>
                <p>
                  API key: {s.adaApiKey ? "tersimpan ✓" : "belum ada"} · secret key:{" "}
                  {s.adaSecretKey ? "tersimpan ✓" : "belum ada"}
                </p>
                <p>{s.baseUrl || "base URL belum diisi"}</p>
                <p>
                  Terakhir sync:{" "}
                  {s.lastSyncAt ? `${new Date(s.lastSyncAt).toLocaleString("id-ID")} (${s.lastSyncCount ?? 0} SKU)` : "belum pernah"}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setEdit({
                      id: s.id,
                      code: s.code,
                      name: s.name,
                      baseUrl: s.baseUrl,
                      apiKey: "",
                      secretKey: "",
                      mode: s.mode,
                      priority: String(s.priority),
                      isActive: s.isActive,
                    })
                  }
                >
                  Kelola kunci
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await toggle({ supplierId: s.id as never, isActive: !s.isActive });
                      toast.success(s.isActive ? "Supplier dimatikan." : "Supplier diaktifkan.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Gagal.");
                    }
                  }}
                >
                  {s.isActive ? "Matikan" : "Aktifkan"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => {
                    setTopUpTarget(s.id);
                    setTopUpJumlah("1000000");
                  }}
                >
                  <ArrowDownToLine className="size-3.5" /> Setor saldo
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        judul="Pratinjau Katalog Acuan"
        keterangan="Sumber data saat supplier belum punya API key (Mode Simulasi)"
      >
        <p className="text-sm text-slate-300">
          {pratinjau.produk} SKU · {pratinjau.brand} brand · {pratinjau.kategori} kategori
          {pratinjau.target ? (
            <>
              {" "}
              — target sync:{" "}
              <span className="font-semibold text-sky-300">
                {pratinjau.target.name} ({pratinjau.target.mode})
              </span>
            </>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {pratinjau.perKategori.map((k) => (
            <span
              key={k.code}
              className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-300"
            >
              {k.name}: <span className="font-mono">{k.jumlah}</span>
            </span>
          ))}
        </div>
      </Panel>

      {/* Dialog konfigurasi supplier */}
      <Dialog open={edit !== null} onOpenChange={(o) => (!o ? setEdit(null) : undefined)}>
        <DialogContent className="max-w-xl border-slate-700/60 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Kelola Supplier" : "Tambah Supplier H2H"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              API key & secret key disimpan di server dan tidak pernah dikirim ke browser.
              Kosongkan bila tidak ingin mengubah kunci yang tersimpan.
            </DialogDescription>
          </DialogHeader>
          {edit ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Kode</Label>
                <Input
                  value={edit.code}
                  onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  placeholder="digiflazz"
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2">
                <Label>Nama</Label>
                <Input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Base URL</Label>
                <Input
                  value={edit.baseUrl}
                  onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })}
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  value={edit.apiKey}
                  onChange={(e) => setEdit({ ...edit, apiKey: e.target.value })}
                  placeholder="•••• tersimpan"
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2">
                <Label>Secret / Username</Label>
                <Input
                  value={edit.secretKey}
                  onChange={(e) => setEdit({ ...edit, secretKey: e.target.value })}
                  placeholder="•••• tersimpan"
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select
                  value={edit.mode}
                  onValueChange={(v) => setEdit({ ...edit, mode: v as "sandbox" | "production" })}
                >
                  <SelectTrigger className="border-slate-700/60 bg-slate-950/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">sandbox</SelectItem>
                    <SelectItem value="production">production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioritas</Label>
                <Input
                  value={edit.priority}
                  onChange={(e) => setEdit({ ...edit, priority: e.target.value })}
                  inputMode="numeric"
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <label className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  checked={edit.isActive}
                  onCheckedChange={(v) => setEdit({ ...edit, isActive: v })}
                />
                <span className="text-sm text-slate-300">Aktifkan supplier</span>
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Batal
            </Button>
            <Button
              onClick={async () => {
                if (!edit) return;
                try {
                  await simpan({
                    supplierId: (edit.id ?? undefined) as never,
                    code: edit.code,
                    name: edit.name,
                    baseUrl: edit.baseUrl,
                    apiKey: edit.apiKey,
                    secretKey: edit.secretKey,
                    mode: edit.mode,
                    priority: Number(edit.priority) || 1,
                    isActive: edit.isActive,
                  });
                  toast.success("Konfigurasi supplier disimpan.");
                  setEdit(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
                }
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog setor saldo */}
      <Dialog open={topUpTarget !== null} onOpenChange={(o) => (!o ? setTopUpTarget(null) : undefined)}>
        <DialogContent className="max-w-md border-slate-700/60 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle>Setor Saldo Supplier</DialogTitle>
            <DialogDescription className="text-slate-400">
              Penyesuaian saldo deposit manual. Nilai negatif berarti pengurangan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nominal (Rp)</Label>
            <Input
              value={topUpJumlah}
              onChange={(e) => setTopUpJumlah(e.target.value)}
              inputMode="numeric"
              className="border-slate-700/60 bg-slate-950/60"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {[500_000, 1_000_000, 5_000_000].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant="secondary"
                  onClick={() => setTopUpJumlah(String(n))}
                >
                  {rupiah(n)}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTopUpTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={async () => {
                if (!topUpTarget) return;
                try {
                  const hasil = await topUp({
                    supplierId: topUpTarget as never,
                    jumlah: Number(topUpJumlah) || 0,
                  });
                  toast.success(`Saldo supplier kini ${rupiah(hasil.balance)}.`);
                  setTopUpTarget(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menyetor.");
                }
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* =========================== TERMINAL MONITOR =========================== */

function BagianTerminal() {
  const terminals = useQuery(api.stopup.terminals.listTerminals, {});
  const simpan = useMutation(api.stopup.terminals.saveTerminal);
  const [edit, setEdit] = useState<{
    id?: string;
    code: string;
    name: string;
    location: string;
    pinAdmin: string;
    aktif: boolean;
  } | null>(null);

  if (!terminals) return <Memuat />;

  return (
    <>
      <Panel
        judul="Terminal Monitor"
        keterangan="Heartbeat, status kertas printer, dan performa hari ini"
        aksi={
          <Button
            onClick={() =>
              setEdit({
                code: "",
                name: "",
                location: "",
                pinAdmin: "1234",
                aktif: true,
              })
            }
          >
            Daftarkan Terminal
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {terminals.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada terminal terdaftar.</p>
          ) : null}
          {terminals.map((t) => {
            const online = Date.now() - t.lastHeartbeat < 5 * 60 * 1000;
            return (
              <div key={t.id} className="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-100">{t.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {t.code} · v{t.version}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{t.location}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Chip status={online ? "SUCCESS" : "FAILED"}>
                      {online ? "ONLINE" : "OFFLINE"}
                    </Chip>
                    <Chip status={t.aktif ? "AKTIF" : "NONAKTIF"}>
                      {t.aktif ? "AKTIF" : "MATI"}
                    </Chip>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <p>
                    Kertas:{" "}
                    <span
                      className={
                        t.paperStatus === "OK" ? "text-emerald-300" : "text-rose-300"
                      }
                    >
                      {t.paperStatus}
                    </span>
                  </p>
                  <p>
                    Printer:{" "}
                    <span
                      className={
                        t.printerConnected ? "text-emerald-300" : "text-rose-300"
                      }
                    >
                      {t.printerConnected ? "terhubung" : "terputus"}
                    </span>
                  </p>
                  <p>
                    Transaksi hari ini:{" "}
                    <span className="font-mono text-slate-200">{t.transaksiHariIni}</span>
                  </p>
                  <p>
                    Omzet hari ini:{" "}
                    <span className="font-mono text-slate-200">{rupiah(t.omzetHariIni)}</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() =>
                    setEdit({
                      id: t.id,
                      code: t.code,
                      name: t.name,
                      location: t.location,
                      pinAdmin: "",
                      aktif: t.aktif,
                    })
                  }
                >
                  Ubah
                </Button>
              </div>
            );
          })}
        </div>
      </Panel>

      <Dialog open={edit !== null} onOpenChange={(o) => (!o ? setEdit(null) : undefined)}>
        <DialogContent className="max-w-lg border-slate-700/60 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Ubah Terminal" : "Daftarkan Terminal"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              PIN admin dipakai membuka menu teknis dari layar sentuh.
            </DialogDescription>
          </DialogHeader>
          {edit ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Kode terminal</Label>
                <Input
                  value={edit.code}
                  onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })}
                  placeholder="SU-01"
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2">
                <Label>Nama</Label>
                <Input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2">
                <Label>Lokasi</Label>
                <Input
                  value={edit.location}
                  onChange={(e) => setEdit({ ...edit, location: e.target.value })}
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <div className="space-y-2">
                <Label>PIN admin</Label>
                <Input
                  value={edit.pinAdmin}
                  onChange={(e) => setEdit({ ...edit, pinAdmin: e.target.value })}
                  placeholder="••••"
                  className="border-slate-700/60 bg-slate-950/60"
                />
              </div>
              <label className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  checked={edit.aktif}
                  onCheckedChange={(v) => setEdit({ ...edit, aktif: v })}
                />
                <span className="text-sm text-slate-300">Terminal aktif</span>
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Batal
            </Button>
            <Button
              onClick={async () => {
                if (!edit) return;
                try {
                  await simpan({
                    terminalId: (edit.id ?? undefined) as never,
                    code: edit.code,
                    name: edit.name,
                    location: edit.location,
                    pinAdmin: edit.pinAdmin || "1234",
                    aktif: edit.aktif,
                  });
                  toast.success("Terminal disimpan.");
                  setEdit(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
                }
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormPerilakuTerminal />
    </>
  );
}

/** Pengaturan perilaku layar terminal + identitas struk. */
function FormPerilakuTerminal() {
  const pengaturan = useQuery(api.stopup.settings.getSettings, {});
  const update = useMutation(api.stopup.settings.updateSettings);
  const [terisi, setTerisi] = useState(false);
  const [form, setForm] = useState({
    idleResetDetik: "45",
    idleWarningDetik: "15",
    supplierTimeoutDetik: "25",
    namaMerchantStruk: "",
    alamatStruk: "",
    footerStruk: "",
    autoReloadJamWib: "3",
    printerAktif: true,
    simulasiPending: false,
  });

  if (pengaturan && !terisi) {
    setTerisi(true);
    setForm({
      idleResetDetik: String(pengaturan.idleResetDetik),
      idleWarningDetik: String(pengaturan.idleWarningDetik),
      supplierTimeoutDetik: String(pengaturan.supplierTimeoutDetik),
      namaMerchantStruk: pengaturan.namaMerchantStruk,
      alamatStruk: pengaturan.alamatStruk,
      footerStruk: pengaturan.footerStruk,
      autoReloadJamWib: String(pengaturan.autoReloadJamWib),
      printerAktif: pengaturan.printerAktif,
      simulasiPending: pengaturan.simulasiPending,
    });
  }

  if (!pengaturan) return null;

  return (
    <Panel
      judul="Perilaku Terminal & Struk"
      keterangan="Auto-reset idle, batas tunggu supplier, auto-reload harian, dan identitas struk"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Idle reset (detik)</Label>
          <Input
            value={form.idleResetDetik}
            onChange={(e) => setForm({ ...form, idleResetDetik: e.target.value })}
            inputMode="numeric"
            className="border-slate-700/60 bg-slate-950/60"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Peringatan idle (detik)</Label>
          <Input
            value={form.idleWarningDetik}
            onChange={(e) => setForm({ ...form, idleWarningDetik: e.target.value })}
            inputMode="numeric"
            className="border-slate-700/60 bg-slate-950/60"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Batas tunggu supplier (detik)</Label>
          <Input
            value={form.supplierTimeoutDetik}
            onChange={(e) => setForm({ ...form, supplierTimeoutDetik: e.target.value })}
            inputMode="numeric"
            className="border-slate-700/60 bg-slate-950/60"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Nama merchant (struk)</Label>
          <Input
            value={form.namaMerchantStruk}
            onChange={(e) => setForm({ ...form, namaMerchantStruk: e.target.value })}
            className="border-slate-700/60 bg-slate-950/60"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Alamat (struk)</Label>
          <Input
            value={form.alamatStruk}
            onChange={(e) => setForm({ ...form, alamatStruk: e.target.value })}
            className="border-slate-700/60 bg-slate-950/60"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Footer struk</Label>
          <Input
            value={form.footerStruk}
            onChange={(e) => setForm({ ...form, footerStruk: e.target.value })}
            className="border-slate-700/60 bg-slate-950/60"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Auto-reload harian (jam WIB)</Label>
          <Input
            value={form.autoReloadJamWib}
            onChange={(e) => setForm({ ...form, autoReloadJamWib: e.target.value })}
            inputMode="numeric"
            className="border-slate-700/60 bg-slate-950/60"
          />
        </div>
        <label className="flex items-center gap-3">
          <Switch
            checked={form.printerAktif}
            onCheckedChange={(v) => setForm({ ...form, printerAktif: v })}
          />
          <span className="text-sm text-slate-300">Printer thermal aktif</span>
        </label>
        <label className="flex items-center gap-3">
          <Switch
            checked={form.simulasiPending}
            onCheckedChange={(v) => setForm({ ...form, simulasiPending: v })}
          />
          <span className="text-sm text-slate-300">
            Mode simulasi PENDING (uji struk sementara)
          </span>
        </label>
      </div>
      <Button
        className="mt-5"
        onClick={async () => {
          try {
            await update({
              idleResetDetik: Number(form.idleResetDetik) || 45,
              idleWarningDetik: Number(form.idleWarningDetik) || 15,
              supplierTimeoutDetik: Number(form.supplierTimeoutDetik) || 25,
              namaMerchantStruk: form.namaMerchantStruk,
              alamatStruk: form.alamatStruk,
              footerStruk: form.footerStruk,
              autoReloadJamWib: Number(form.autoReloadJamWib) || 3,
              printerAktif: form.printerAktif,
              simulasiPending: form.simulasiPending,
            });
            toast.success("Pengaturan terminal disimpan.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
          }
        }}
      >
        Simpan Pengaturan
      </Button>
    </Panel>
  );
}

/* ========================== PAYMENT GATEWAY ========================== */

function BagianGateway() {
  const pengaturan = useQuery(api.stopup.settings.getSettings, {});
  const update = useMutation(api.stopup.settings.updateSettings);
  const [terisi, setTerisi] = useState(false);
  const [form, setForm] = useState({
    qrisProvider: "",
    qrisMerchantId: "",
    qrisMerchantName: "",
    qrisApiKey: "",
    qrisWebhookSecret: "",
    telegramBotToken: "",
    telegramChatId: "",
    telegramAlertAktif: false,
    lowBalanceThreshold: "500000",
  });

  if (pengaturan && !terisi) {
    setTerisi(true);
    setForm({
      qrisProvider: pengaturan.qrisProvider,
      qrisMerchantId: pengaturan.qrisMerchantId,
      qrisMerchantName: pengaturan.qrisMerchantName,
      qrisApiKey: "",
      qrisWebhookSecret: "",
      telegramBotToken: "",
      telegramChatId: pengaturan.telegramChatId,
      telegramAlertAktif: pengaturan.telegramAlertAktif,
      lowBalanceThreshold: String(pengaturan.lowBalanceThreshold),
    });
  }

  if (!pengaturan) return <Memuat />;

  const siteUrl = (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ?? "";
  const webhookUrl = siteUrl
    ? `${siteUrl}/stopup/qris/callback`
    : "(VITE_CONVEX_SITE_URL belum terbaca di browser)";

  return (
    <>
      <Panel
        judul="Payment Gateway QRIS"
        keterangan="Kredensial gateway disimpan di server; nilai yang tersimpan tidak pernah dikirim ke browser"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Nama penyedia</Label>
            <Input
              value={form.qrisProvider}
              onChange={(e) => setForm({ ...form, qrisProvider: e.target.value })}
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Merchant / NMID</Label>
            <Input
              value={form.qrisMerchantId}
              onChange={(e) => setForm({ ...form, qrisMerchantId: e.target.value })}
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Nama merchant di aplikasi pembayar</Label>
            <Input
              value={form.qrisMerchantName}
              onChange={(e) => setForm({ ...form, qrisMerchantName: e.target.value })}
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">
              API key {pengaturan.adaQrisApiKey ? "(tersimpan — isi untuk mengganti)" : ""}
            </Label>
            <Input
              value={form.qrisApiKey}
              onChange={(e) => setForm({ ...form, qrisApiKey: e.target.value })}
              placeholder="••••"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label className="text-xs text-slate-400">
              Webhook secret (HMAC-SHA256){" "}
              {pengaturan.adaWebhookSecret ? "(tersimpan — isi untuk mengganti)" : ""}
            </Label>
            <Input
              value={form.qrisWebhookSecret}
              onChange={(e) => setForm({ ...form, qrisWebhookSecret: e.target.value })}
              placeholder="••••"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">URL callback untuk gateway</p>
          <p className="mt-1 break-all font-mono text-sky-300">{webhookUrl}</p>
          <ul className="mt-2 space-y-1">
            <li>• Kirim header <span className="font-mono">X-Signature</span> = HMAC-SHA256(body mentah, webhook secret) dalam hex.</li>
            <li>• Body JSON: <span className="font-mono">{`{ invoiceId, eventId, status: "PAID", amount, timestamp }`}</span></li>
            <li>• Timestamp wajib dalam ±5 menit (anti replay) dan <span className="font-mono">eventId</span> harus unik (idempotensi).</li>
          </ul>
        </div>
      </Panel>

      <Panel
        judul="Telegram Alert"
        keterangan="Notifikasi otomatis saat saldo deposit supplier menipis atau printer bermasalah"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">
              Bot token {pengaturan.adaTelegramToken ? "(tersimpan — isi untuk mengganti)" : ""}
            </Label>
            <Input
              value={form.telegramBotToken}
              onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
              placeholder="123456:ABC…"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Chat ID admin</Label>
            <Input
              value={form.telegramChatId}
              onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Ambang saldo rendah (Rp)</Label>
            <Input
              value={form.lowBalanceThreshold}
              onChange={(e) => setForm({ ...form, lowBalanceThreshold: e.target.value })}
              inputMode="numeric"
              className="border-slate-700/60 bg-slate-950/60"
            />
          </div>
          <label className="flex items-center gap-3 lg:col-span-3">
            <Switch
              checked={form.telegramAlertAktif}
              onCheckedChange={(v) => setForm({ ...form, telegramAlertAktif: v })}
            />
            <span className="text-sm text-slate-300">
              Kirim alert Telegram tiap 30 menit
            </span>
          </label>
        </div>
      </Panel>

      <Button
        onClick={async () => {
          try {
            await update({
              qrisProvider: form.qrisProvider,
              qrisMerchantId: form.qrisMerchantId,
              qrisMerchantName: form.qrisMerchantName,
              qrisApiKey: form.qrisApiKey,
              qrisWebhookSecret: form.qrisWebhookSecret,
              telegramBotToken: form.telegramBotToken,
              telegramChatId: form.telegramChatId,
              telegramAlertAktif: form.telegramAlertAktif,
              lowBalanceThreshold: Number(form.lowBalanceThreshold) || 500000,
            });
            toast.success("Pengaturan gateway disimpan.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
          }
        }}
      >
        Simpan Pengaturan Gateway
      </Button>
    </>
  );
}

/* =========================== USER MANAGEMENT =========================== */

function BagianPengguna() {
  const pengguna = useQuery(api.stopup.settings.listPengguna, {});
  const audit = useQuery(api.stopup.settings.auditTrail, { limit: 30 });
  const setPeran = useMutation(api.stopup.settings.setPeranPengguna);

  if (!pengguna) return <Memuat />;

  return (
    <>
      <Panel judul="Pengguna" keterangan="Peran menentukan akses panel: admin, supervisor, member">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700/50">
              <TableHead className="text-slate-400">Nama</TableHead>
              <TableHead className="text-slate-400">Email</TableHead>
              <TableHead className="text-slate-400">WhatsApp</TableHead>
              <TableHead className="text-slate-400">Peran</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pengguna.map((u) => (
              <TableRow key={u.id} className="border-slate-800/60">
                <TableCell className="text-slate-200">{u.name}</TableCell>
                <TableCell className="text-xs text-slate-400">{u.email}</TableCell>
                <TableCell className="font-mono text-xs text-slate-400">{u.whatsapp}</TableCell>
                <TableCell>
                  <Select
                    value={u.role}
                    onValueChange={async (v) => {
                      try {
                        await setPeran({ userId: u.id as never, role: v as "member" });
                        toast.success(`Peran ${u.name} → ${v}`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Gagal mengubah peran.");
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-40 border-slate-700/60 bg-slate-950/60 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["admin", "supervisor", "member", "peminjam", "pendana"].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel judul="Audit Trail" keterangan="Append-only — semua aksi berdampak tercatat">
        {!audit ? (
          <Memuat />
        ) : audit.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada catatan audit.</p>
        ) : (
          <div className="space-y-2 text-xs">
            {audit.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-300" />
                  <span className="font-mono text-slate-200">{a.aksi}</span>
                  <span className="text-slate-400">{a.target}</span>
                </span>
                <span className="text-slate-500">
                  {a.detail} · {labelJamWib(a.waktu)} WIB
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
