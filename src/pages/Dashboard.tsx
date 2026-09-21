import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  FileText,
  Loader2,
  LogOut,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  LOAN_PURPOSE_OPTIONS,
  loanPurposeLabel,
  loanStatusMeta,
  quoteLoan,
  type LoanStatus,
} from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

function StatusBadge({ status }: { status: LoanStatus }) {
  const meta = loanStatusMeta(status);
  if (status === "disetujui") {
    return <Badge className="bg-foreground text-background hover:bg-foreground">{meta.label}</Badge>;
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">{meta.label}</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">{meta.label}</Badge>;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const loans = useQuery(api.loans.listMyLoans);
  const summary = useQuery(api.loans.myLoanSummary);

  const [detailId, setDetailId] = useState<Id<"loans"> | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isLoading = loans === undefined || summary === undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Link to="/dashboard" className="text-sm font-semibold tracking-[0.18em]">
            PINDAI
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden max-w-48 truncate text-muted-foreground sm:block">
              {user?.email ?? user?.name ?? "Peminjam"}
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
            Ruang Peminjam
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Selamat datang{user?.name ? `, ${user.name}` : ""}
          </h1>
        </div>

        {isLoading ? (
          <div className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat data Anda…
          </div>
        ) : (
          <>
            {/* Honest summary — zeros when there is no data yet */}
            <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-4">
              {[
                ["Total aplikasi", `${summary?.totalAplikasi ?? 0}`],
                ["Diajukan", `${summary?.diajukan ?? 0}`],
                ["Disetujui", `${summary?.disetujui ?? 0}`],
                ["Nilai disetujui", formatRupiah(summary?.disetujuiRupiah ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="bg-background p-5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </section>

            <div className="mt-10 grid gap-10 lg:grid-cols-5">
              {/* Application form */}
              <section className="lg:col-span-2">
                <h2 className="text-lg font-medium">Ajukan pinjaman</h2>
                <Separator className="my-5" />
                <LoanForm
                  onCreated={(ref) => {
                    toast.success(`Aplikasi terkirim — nomor referensi ${ref}`);
                  }}
                />
              </section>

              {/* Application list */}
              <section className="lg:col-span-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-medium">Aplikasi saya</h2>
                  <span className="text-xs text-muted-foreground">
                    {loans?.length ?? 0} data
                  </span>
                </div>
                <Separator className="my-5" />

                {loans !== undefined && loans.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 px-6 py-14 text-center">
                    <FileText className="mx-auto size-5 text-muted-foreground" />
                    <p className="mt-4 text-sm font-medium">Belum ada aplikasi</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                      Data Anda akan tampil di sini setelah aplikasi pertama
                      dikirim. PINDAI tidak menampilkan data contoh.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                    {loans?.map((loan) => (
                      <li key={loan._id}>
                        <button
                          type="button"
                          onClick={() => setDetailId(loan._id)}
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
                            <StatusBadge status={loan.status} />
                            <ArrowRight className="size-3.5 text-muted-foreground" />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <LoanDetailDialog loanId={detailId} onClose={() => setDetailId(null)} />

      <footer className="border-t border-border/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          PINDAI — Pinjam &amp; Gadai Digital. Versi 1: pengajuan pinjaman Peminjam.
        </div>
      </footer>
    </div>
  );
}

function LoanForm({ onCreated }: { onCreated: (ref: string) => void }) {
  const [pokokInput, setPokokInput] = useState("");
  const [tujuan, setTujuan] = useState<string>("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLoan = useMutation(api.loans.createLoanApplication);

  // Live quote — same integer engine the server uses.
  const quote = useMemo<Rupiah | null>(() => {
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
      setError(err instanceof Error ? err.message : "Gagal mengirim aplikasi.");
    } finally {
      setSubmitting(false);
    }
  };

  const q = quote !== null ? quoteLoan(quote) : null;

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
              if (quote !== null) setPokokInput(formatRupiah(quote).replace("Rp ", ""));
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
            Kirim aplikasi
            <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Dengan mengirim, Anda menyatakan data yang diisi benar dan setuju pada
        struktur biaya: potongan di muka 5%, bunga 30%, total kewajiban 130%.
      </p>
    </form>
  );
}

function LoanDetailDialog({
  loanId,
  onClose,
}: {
  loanId: Id<"loans"> | null;
  onClose: () => void;
}) {
  const loan = useQuery(api.loans.getMyLoan, loanId ? { loanId } : "skip");

  return (
    <Dialog open={loanId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {loan === undefined ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : loan === null ? (
          <DialogHeader>
            <DialogTitle>Aplikasi tidak ditemukan</DialogTitle>
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
                <StatusBadge status={loan.status} />
              </div>
              <DialogDescription className="tabular-nums">
                {loan.nomorReferensi} ·{" "}
                {new Date(loan._creationTime).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
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
                [
                  "Total kewajiban pelunasan",
                  formatRupiah(loan.quote.totalKewajibanPelunasan),
                ],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 px-4 py-3"
                >
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd
                    className={`text-sm tabular-nums ${
                      index === 2 || index === 6 ? "font-semibold" : ""
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {loan.catatanReview && (
              <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Catatan review
                </p>
                <p className="mt-1 text-sm">{loan.catatanReview}</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
