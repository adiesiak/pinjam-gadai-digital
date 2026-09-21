import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Loader2,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Pendana() {
  const { user, isLoading } = useAuth();
  const role = user?.role;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Link to="/dashboard" className="text-sm font-semibold tracking-[0.18em]">
            PINJAM GADAI DIGITAL
          </Link>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Coins className="size-3.5" />
            Ruang Pendana
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {role === "pendana" ? (
          <PendanaWorkspace />
        ) : role === "admin" ? (
          <Notice
            title="Akun tim tidak dapat menjadi Pendana"
            body="Panel admin dan peran Pendana dipisahkan demi kepatuhan. Gunakan akun terpisah untuk mendanai."
          />
        ) : (
          <Onboarding />
        )}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          Pendana menyediakan dana melalui skema Alokasi Dana dan menerima Imbal
          Hasil 30% dari pokok sebagai hak finansialnya.
        </div>
      </footer>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-border/60 p-8 text-center">
      <Coins className="mx-auto size-5 text-muted-foreground" />
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
    <div className="mx-auto max-w-xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Peran Pendana
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Sediakan dana, terima Imbal Hasil.
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Sebagai Pendana, Anda menyediakan dana untuk pinjaman nasabah yang telah
        disetujui tim kami. Setiap pinjaman terbagi dalam satu atau beberapa
        alokasi Pendana; saat pinjaman terpenuhi, dana bersih (95% dari pokok)
        dicairkan ke nasabah dan Anda menerima hak Imbal Hasil sebesar 30% dari
        porsi pokok yang Anda danai, dibayarkan saat nasabah melunasi total
        kewajiban 130%.
      </p>
      <ul className="mt-6 space-y-3 text-sm">
        {[
          ["Setoran terverifikasi", "Dana Anda masuk dompet setelah tim memverifikasi transfer."],
          ["Alokasi transparan", "Anda melihat sisa kebutuhan tiap pinjaman — tidak ada alokasi ganda."],
          ["Pencatatan ganda", "Setiap pergerakan dana tercatat berpasangan di jurnal append-only."],
        ].map(([t, b]) => (
          <li key={t} className="flex gap-3">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
            <span>
              <span className="font-medium">{t}</span>
              <span className="text-muted-foreground"> — {b}</span>
            </span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-8 rounded-full px-6"
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

function PendanaWorkspace() {
  const wallet = useQuery(api.pendana.myWallet);
  const deposits = useQuery(api.pendana.myDeposits);
  const marketplace = useQuery(api.pendana.marketplace);
  const fundings = useQuery(api.pendana.myFundings);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Ruang Pendana
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Dompet &amp; alokasi</h1>
      </div>

      <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-4">
        {[
          ["Saldo dompet", formatRupiah(wallet?.saldo ?? 0)],
          ["Dana bekerja", formatRupiah(wallet?.danaBekerja ?? 0)],
          ["Posisi alokasi", `${wallet?.posisiAlokasi ?? 0}`],
          ["Imbal hasil diharapkan", formatRupiah(wallet?.imbalHasilDiharapkan ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="bg-background p-5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <h2 className="text-lg font-medium">Setor dana</h2>
          <Separator className="my-5" />
          <DepositForm />
          <h3 className="mt-10 text-sm font-medium">Riwayat setoran</h3>
          <Separator className="my-4" />
          {deposits === undefined ? (
            <Loading />
          ) : deposits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada setoran.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {deposits.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">{formatRupiah(d.jumlah)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {d.nomorReferensi} · ref: {d.referensiTransfer}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.status === "terverifikasi"
                      ? "Terverifikasi"
                      : d.status === "ditolak"
                        ? "Ditolak"
                        : "Menunggu verifikasi"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-3">
          <h2 className="text-lg font-medium">Marketplace pendanaan</h2>
          <Separator className="my-5" />
          {marketplace === undefined ? (
            <Loading />
          ) : marketplace.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-6 py-14 text-center">
              <p className="text-sm font-medium">Belum ada pinjaman terbuka</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                Pinjaman yang telah disetujui tim akan tampil di sini beserta
                sisa kebutuhan pendanaannya.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {marketplace.map((m) => (
                <MarketRow key={m._id} row={m} />
              ))}
            </ul>
          )}

          <h3 className="mt-10 text-sm font-medium">Alokasi saya</h3>
          <Separator className="my-4" />
          {fundings === undefined ? (
            <Loading />
          ) : fundings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada alokasi.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {fundings.map((f) => (
                <li key={f._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatRupiah(f.jumlahAlokasi)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {f.nomorReferensi} → {f.loanRef} · imbal hasil{" "}
                      {formatRupiah(f.imbalHasil)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {f.status === "dialokasikan"
                      ? "Aktif"
                      : f.status === "selesai"
                        ? "Selesai"
                        : "Dibatalkan"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
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
        <div className="relative">
          <Wallet className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="dep-ref"
            value={referensi}
            onChange={(e) => setReferensi(e.target.value)}
            placeholder="Contoh: BCAX0012345678"
            className="pl-9"
            disabled={busy}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Transfer ke rekening platform sesuai instruksi tim, lalu ajukan
          setoran dengan nomor referensi bank. Dana masuk dompet setelah
          diverifikasi.
        </p>
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full rounded-full" disabled={busy}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Ajukan setoran
      </Button>
    </form>
  );
}

function MarketRow({
  row,
}: {
  row: {
    _id: Id<"loans">;
    nomorReferensi: string;
    tujuan: string;
    pokokPinjaman: number;
    terkumpul: number;
    sisaKebutuhan: number;
  };
}) {
  const allocateFunding = useMutation(api.pendana.allocateFunding);
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

  return (
    <li className="rounded-lg border border-border/60 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium tabular-nums">
          {formatRupiah(row.pokokPinjaman)}
        </p>
        <span className="text-xs text-muted-foreground">
          {row.nomorReferensi} · {loanPurposeLabel(row.tujuan)}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground"
          style={{
            width: `${Math.min(100, Math.round((row.terkumpul / row.pokokPinjaman) * 100))}%`,
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        Terkumpul {formatRupiah(row.terkumpul)} · sisa {formatRupiah(row.sisaKebutuhan)}
      </p>

      {!full ? (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (parsed === null) {
              setError("Masukkan jumlah rupiah bulat yang valid.");
              return;
            }
            setBusy(true);
            try {
              await allocateFunding({ loanId: row._id, jumlah: parsed });
              toast.success("Alokasi berhasil dicatat di jurnal.");
              setJumlah("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Alokasi gagal.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              Rp
            </span>
            <Input
              inputMode="numeric"
              className="pl-9 tabular-nums"
              value={jumlah}
              onChange={(e) => setJumlah(e.target.value)}
              placeholder={`Maks ${formatRupiah(row.sisaKebutuhan)}`}
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy} className="rounded-full">
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Danaikan
          </Button>
          {error && (
            <p className="text-xs text-destructive sm:hidden">{error}</p>
          )}
        </form>
      ) : (
        <p className="mt-3 text-xs font-medium">Terpenuhi penuh oleh Pendana.</p>
      )}
      {error && <p className="mt-2 hidden text-xs text-destructive sm:block">{error}</p>}
    </li>
  );
}
