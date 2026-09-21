import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  FileText,
  Loader2,
  LogOut,
  Package,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { StatusBadge } from "@/components/StatusBadge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  LOAN_PURPOSE_OPTIONS,
  loanPurposeLabel,
  loanStatusMeta,
  quoteLoan,
  TENOR_OPTIONS,
  type LoanStatus,
} from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";
import {
  COLLATERAL_CATEGORIES,
  LTV_HINTS,
  pawnStatusMeta,
  type CollateralCategory,
  type PawnStatus,
} from "@/lib/pawn";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const loans = useQuery(api.loans.listMyLoans);
  const summary = useQuery(api.loans.myLoanSummary);
  const pawns = useQuery(api.loans.listMyPawns);
  const pawnSummary = useQuery(api.loans.myPawnSummary);
  const dueReminder = useQuery(api.loans.dueReminder);

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
    pawnSummary === undefined ||
    dueReminder === undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Link to="/dashboard" className="text-sm font-semibold tracking-[0.18em]">
            PINJAM GADAI DIGITAL
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {user?.role === "admin" && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                <Link to="/admin">Panel Tim</Link>
              </Button>
            )}
            {user?.role === "pendana" && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                <Link to="/pendana">Ruang Pendana</Link>
              </Button>
            )}
            <span className="hidden max-w-48 truncate text-muted-foreground sm:block">
              {user?.email ?? user?.name ?? "Nasabah"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              Keluar
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Ruang Nasabah
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Selamat datang{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ajukan pinjaman tunai atau gadai barang melalui satu akun. Setiap
            pengajuan diperiksa tim kami sebelum dana dicairkan.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat data Anda…
          </div>
        ) : (
          <>
            {/* Pengingat jatuh tempo — ditampilkan di atas semua tab. */}
            {dueReminder !== null && (
              <DueReminderBanner reminder={dueReminder} />
            )}
            <Tabs defaultValue="pinjaman" className="mt-8">
            <TabsList className="bg-transparent p-0">
              <TabsTrigger
                value="pinjaman"
                className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Pinjaman
              </TabsTrigger>
              <TabsTrigger
                value="gadai"
                className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Gadai Barang
              </TabsTrigger>
            </TabsList>

            {/* ---------------- PINJAMAN ---------------- */}
            <TabsContent value="pinjaman" className="mt-8">
              <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-4">
                {[
                  ["Total pengajuan", `${summary?.totalAplikasi ?? 0}`],
                  ["Menunggu / direview", `${(summary?.diajukan ?? 0) + (summary?.direview ?? 0)}`],
                  ["Disetujui / didanai", `${(summary?.disetujui ?? 0)}`],
                  ["Nilai disetujui", formatRupiah(summary?.disetujuiRupiah ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-background p-5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </section>

              <div className="mt-10 grid gap-10 lg:grid-cols-5">
                <section className="lg:col-span-2">
                  <h2 className="text-lg font-medium">Ajukan pinjaman</h2>
                  <Separator className="my-5" />
                  <LoanForm
                    onCreated={(ref) => {
                      toast.success(`Pengajuan terkirim — nomor referensi ${ref}`);
                    }}
                  />
                </section>

                <section className="lg:col-span-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-medium">Pengajuan saya</h2>
                    <span className="text-xs text-muted-foreground">
                      {loans?.length ?? 0} data
                    </span>
                  </div>
                  <Separator className="my-5" />

                  {loans !== undefined && loans.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title="Belum ada pengajuan pinjaman"
                      body="Pengajuan Anda akan tampil di sini setelah form di samping dikirim. Kami tidak menampilkan data contoh."
                    />
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                      {loans?.map((loan) => (
                        <li key={loan._id}>
                          <button
                            type="button"
                            onClick={() => setLoanDetailId(loan._id)}
                            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium tabular-nums">
                                {formatRupiah(loan.pokokPinjaman)}
                              </p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {loan.nomorReferensi} · {loanPurposeLabel(loan.tujuan)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <StatusBadge status={loan.status} kind="loan" />
                              <ArrowRight className="size-3.5 text-muted-foreground" />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </TabsContent>

            {/* ---------------- GADAI ---------------- */}
            <TabsContent value="gadai" className="mt-8">
              <section className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60">
                {[
                  ["Total pengajuan", `${pawnSummary?.totalGadai ?? 0}`],
                  ["Dalam penilaian", `${pawnSummary?.dinilai ?? 0}`],
                  ["Disetujui", `${pawnSummary?.disetujui ?? 0}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-background p-5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </section>

              <div className="mt-10 grid gap-10 lg:grid-cols-5">
                <section className="lg:col-span-2">
                  <h2 className="text-lg font-medium">Gadaikan barang</h2>
                  <Separator className="my-5" />
                  <PawnForm
                    onCreated={() => {
                      toast.success("Pengajuan gadai terkirim — tim kami akan menghubungi Anda untuk penjadwalan pemeriksaan.");
                    }}
                  />
                </section>

                <section className="lg:col-span-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-medium">Pengajuan gadai saya</h2>
                    <span className="text-xs text-muted-foreground">
                      {pawns?.length ?? 0} data
                    </span>
                  </div>
                  <Separator className="my-5" />

                  {pawns !== undefined && pawns.length === 0 ? (
                    <EmptyState
                      icon={Package}
                      title="Belum ada pengajuan gadai"
                      body="Ajukan barang Anda melalui form di samping. Petugas berwenang akan melakukan pemeriksaan di lokasi dengan pencatatan lokasi langsung."
                    />
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                      {pawns?.map((pawn) => (
                        <li key={pawn._id}>
                          <button
                            type="button"
                            onClick={() => setPawnDetailId(pawn._id)}
                            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {pawn.deskripsiBarang}
                              </p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {pawn.nomorReferensi} · {pawn.kategori}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <StatusBadge status={pawn.status} kind="pawn" />
                              <ArrowRight className="size-3.5 text-muted-foreground" />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </TabsContent>
          </Tabs>
          </>
        )}
      </main>

      <LoanDetailDialog loanId={loanDetailId} onClose={() => setLoanDetailId(null)} />
      <PawnDetailDialog pawnId={pawnDetailId} onClose={() => setPawnDetailId(null)} />

      <footer className="border-t border-border/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          Pinjam Gadai Digital — platform pinjaman dan penggadaian barang bagi
          nasabah, didanai oleh Pendana terverifikasi.
        </div>
      </footer>
    </div>
  );
}

// =====================================================================
// Pengingat jatuh tempo — banner live di atas ruang nasabah
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
      className={`rounded-lg border px-5 py-4 ${
        terlambat
          ? "border-destructive/40 bg-destructive/5"
          : "border-border/60 bg-muted/40"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p
            className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
              terlambat ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {terlambat
              ? `Terlambat ${reminder.hariTerlambat} hari — denda berjalan`
              : reminder.sisaHari === 0
                ? "Jatuh tempo hari ini"
                : `Jatuh tempo ${reminder.sisaHari} hari lagi`}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Pinjaman {reminder.nomorReferensi} wajib dilunasi paling lambat{" "}
            <span className="font-medium text-foreground">
              {formatDate(reminder.jatuhTempoPada)}
            </span>
            . Keterlambatan dikenakan denda 0,5% per hari dari pokok
            (maksimum 15%).
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total kewajiban saat ini</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatRupiah(reminder.totalKewajibanDenganPenalti)}
          </p>
          {terlambat && (
            <p className="mt-0.5 text-xs tabular-nums text-destructive">
              termasuk denda {formatRupiah(reminder.dendaTerlambat)}
            </p>
          )}
        </div>
      </div>
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
    <div className="rounded-lg border border-dashed border-border/60 px-6 py-14 text-center">
      <Icon className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

// =====================================================================
// Loan application form
// =====================================================================

function LoanForm({ onCreated }: { onCreated: (ref: string) => void }) {
  const [pokokInput, setPokokInput] = useState("");
  const [tenorHari, setTenorHari] = useState<string>("30");
  const [tujuan, setTujuan] = useState<string>("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLoan = useMutation(api.loans.createLoanApplication);

  const parsed = useMemo<Rupiah | null>(() => {
    try {
      return parseRupiah(pokokInput);
    } catch {
      return null;
    }
  }, [pokokInput]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    let pokok: Rupiah;
    try {
      pokok = parseRupiah(pokokInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jumlah tidak valid.");
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

    setSubmitting(true);
    try {
      const result = await createLoan({
        pokokPinjaman: pokok,
        tenorHari: Number(tenorHari),
        tujuan,
        namaLengkap,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
      });
      onCreated(result.nomorReferensi);
      setPokokInput("");
      setTujuan("");
      setNamaLengkap("");
      setNomorRekening("");
      setCatatanPeminjam("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan.");
    } finally {
      setSubmitting(false);
    }
  };

  const q = parsed !== null ? quoteLoan(parsed) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="pokok">Pokok pinjaman</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            Rp
          </span>
          <Input
            id="pokok"
            inputMode="numeric"
            placeholder="10.000.000"
            className="pl-9 tabular-nums"
            value={pokokInput}
            onChange={(e) => setPokokInput(e.target.value)}
            onBlur={() => {
              if (parsed !== null) setPokokInput(formatRupiah(parsed).replace("Rp ", ""));
            }}
            disabled={submitting}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Antara Rp 100.000 dan Rp 500.000.000, rupiah bulat.
        </p>
      </div>

      {q && (
        <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Rincian biaya — final
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {([
              ["Biaya Admin (3%)", formatRupiah(q.biayaAdmin), false],
              ["Biaya Platform (2%)", formatRupiah(q.biayaPlatform), false],
              ["Dana bersih diterima", formatRupiah(q.danaBersihDitransfer), true],
              ["Bunga (30%)", formatRupiah(q.bunga), false],
              ["Total kewajiban pelunasan", formatRupiah(q.totalKewajibanPelunasan), true],
            ] as Array<[string, string, boolean]>).map(([label, value, strong]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className={strong ? "font-medium" : "text-muted-foreground"}>
                  {label}
                </dt>
                <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

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
        <p className="text-xs text-muted-foreground">
          Jatuh tempo pelunasan dihitung dari tanggal pendanaan penuh + tenor.
          Lewat jatuh tempo dikenakan denda 0,5% per hari dari pokok,
          maksimum 15%.
        </p>
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

      <div className="space-y-2">
        <Label htmlFor="nama">Nama lengkap (sesuai KTP)</Label>
        <Input
          id="nama"
          value={namaLengkap}
          onChange={(e) => setNamaLengkap(e.target.value)}
          placeholder="Nama sesuai identitas"
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rekening">Nomor rekening tujuan</Label>
        <div className="relative">
          <Wallet className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="rekening"
            inputMode="numeric"
            value={nomorRekening}
            onChange={(e) => setNomorRekening(e.target.value)}
            placeholder="1234567890"
            className="pl-9 tabular-nums"
            disabled={submitting}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Dana bersih (95% dari pokok) akan ditransfer ke rekening ini.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catatan">Catatan untuk reviewer (opsional)</Label>
        <Textarea
          id="catatan"
          value={catatanPeminjam}
          onChange={(e) => setCatatanPeminjam(e.target.value)}
          placeholder="Jelaskan singkat rencana penggunaan dana…"
          rows={3}
          disabled={submitting}
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full rounded-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Mengirim…
          </>
        ) : (
          <>
            Kirim pengajuan
            <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Dengan mengirim, Anda menyatakan data yang diisi benar dan menyetujui
        struktur biaya: potongan di muka 5%, bunga 30%, total kewajiban 130%.
      </p>
    </form>
  );
}

// =====================================================================
// Pawn (gadai) application form
// =====================================================================

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
        <Textarea
          id="barang"
          value={deskripsiBarang}
          onChange={(e) => setDeskripsiBarang(e.target.value)}
          placeholder="Contoh: iPhone 14 Pro 256 GB, warna titanium, kelengkapan dus lengkap…"
          rows={3}
          disabled={submitting}
        />
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
        <Textarea
          id="alamat"
          value={alamatPenilaian}
          onChange={(e) => setAlamatPenilaian(e.target.value)}
          placeholder="Alamat lengkap tempat barang berada saat pemeriksaan…"
          rows={2}
          disabled={submitting}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Pemeriksaan dilakukan petugas berwenang di lokasi dengan pencatatan
          lokasi langsung (live location) yang wajib — lokasi kunjungan terekam
          sebagai bagian dari kepatuhan layanan.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nama-gadai">Nama lengkap (sesuai KTP)</Label>
        <Input
          id="nama-gadai"
          value={namaLengkap}
          onChange={(e) => setNamaLengkap(e.target.value)}
          placeholder="Nama sesuai identitas"
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rekening-gadai">Nomor rekening tujuan</Label>
        <div className="relative">
          <Wallet className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="rekening-gadai"
            inputMode="numeric"
            value={nomorRekening}
            onChange={(e) => setNomorRekening(e.target.value)}
            placeholder="1234567890"
            className="pl-9 tabular-nums"
            disabled={submitting}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Dana gadai yang disetujui akan ditransfer ke rekening ini.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catatan-gadai">Catatan tambahan (opsional)</Label>
        <Textarea
          id="catatan-gadai"
          value={catatanPeminjam}
          onChange={(e) => setCatatanPeminjam(e.target.value)}
          placeholder="Kondisi barang, kelengkapan, atau jadwal yang sesuai…"
          rows={2}
          disabled={submitting}
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full rounded-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Mengirim…
          </>
        ) : (
          <>
            Kirim pengajuan gadai
            <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Nilai taksiran ditetapkan oleh petugas berwenang saat pemeriksaan, bukan
        oleh nasabah. Barang disimpan dengan jaminan keamanan hingga pelunasan.
      </p>
    </form>
  );
}

// =====================================================================
// Detail dialogs
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
            <DialogDescription>
              Data ini mungkin bukan milik akun Anda.
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="tabular-nums">
                  {formatRupiah(loan.pokokPinjaman)}
                </DialogTitle>
                <StatusBadge status={loan.status} kind="loan" />
              </div>
              <DialogDescription className="tabular-nums">
                {loan.nomorReferensi} · {formatDate(loan._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {loanStatusMeta(loan.status).description}
            </p>

            <dl className="divide-y divide-border/60 rounded-lg border border-border/60">
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
                className={`rounded-lg border p-4 ${
                  loan.pelunasan.hariTerlambat > 0
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border/60"
                }`}
              >
                <p className="text-sm font-medium">Lunasi pinjaman</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Jatuh tempo</dt>
                    <dd className="tabular-nums">
                      {formatDate(loan.pelunasan.jatuhTempoPada)}
                    </dd>
                  </div>
                  {loan.pelunasan.hariTerlambat > 0 ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-destructive">
                        Terlambat {loan.pelunasan.hariTerlambat} hari
                      </dt>
                      <dd className="tabular-nums text-destructive">
                        +{formatRupiah(loan.pelunasan.dendaTerlambat)}
                      </dd>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Sisa waktu</dt>
                      <dd className="tabular-nums">
                        {loan.pelunasan.sisaHari === 0
                          ? "Hari ini"
                          : `${loan.pelunasan.sisaHari} hari`}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Bayar total kewajiban — pokok, imbal hasil Pendana, dan denda
                  (bila terlambat) otomatis tercatat di jurnal. Aksi ini tidak
                  dapat dibatalkan.
                </p>
                <Button
                  className="mt-3 w-full rounded-full"
                  disabled={repaying}
                  onClick={handleRepay}
                >
                  {repaying ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Memproses…
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
            <DialogDescription>
              Data ini mungkin bukan milik akun Anda.
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="max-w-64 text-base leading-snug">
                  {pawn.deskripsiBarang}
                </DialogTitle>
                <StatusBadge status={pawn.status} kind="pawn" />
              </div>
              <DialogDescription className="tabular-nums">
                {pawn.nomorReferensi} · {formatDate(pawn._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {pawnStatusMeta(pawn.status as PawnStatus).description}
            </p>

            <dl className="divide-y divide-border/60 rounded-lg border border-border/60">
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
              <div className="rounded-lg border border-border/60 p-4">
                <p className="text-sm font-medium">Ajukan pelepasan barang</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Setelah kewajiban gadai Anda lunas, ajukan pelepasan dan
                  petugas akan mengonfirmasi pengembalian barang Anda.
                </p>
                <Button
                  className="mt-3 w-full rounded-full"
                  disabled={requesting}
                  onClick={handleRequestRelease}
                >
                  {requesting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Mengirim…
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
