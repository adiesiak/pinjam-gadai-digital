import { useMutation } from "convex/react";
import { ArrowRight, CalendarClock, Loader2, Send, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { EmptyState } from "./empty-state";
import { formatDate, type LoanScheduleRow } from "./shared";

/** Status pill (Lunas / Menunggu / Terlambat) sesuai semantik warna. */
function ScheduleBadge({ state }: { state: "lunas" | "menunggu" | "overdue" }) {
  if (state === "lunas") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Lunas
      </Badge>
    );
  }
  if (state === "overdue") {
    return (
      <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">Terlambat</Badge>
    );
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Menunggu</Badge>
  );
}

/** Satu baris rincian biaya pinjaman (label kiri, nilai kanan). */
function RincianBaris({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "muted" | "net" | "total";
}) {
  if (tone === "net") {
    return (
      <div className="flex flex-col gap-1 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <dt className="text-sm font-semibold text-emerald-800">{label}</dt>
        <dd className="break-words text-left text-sm font-semibold tabular-nums text-emerald-700 sm:text-right">{value}</dd>
      </div>
    );
  }
  if (tone === "total") {
    return (
      <div className="flex flex-col gap-1 bg-slate-50 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <dt className="text-sm font-semibold">{label}</dt>
        <dd className="break-words text-left text-sm font-semibold tabular-nums sm:text-right">{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`break-words text-left text-sm tabular-nums sm:text-right ${tone === "muted" ? "text-muted-foreground" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Tab 1 — Pinjaman aktif dengan rincian transparansi finansial presisi. */
export function ActiveLoanSection({
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
        body="Pinjaman yang sudah didanai Pendana akan tampil di sini. Mulai dari tab Form Pengajuan Baru."
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
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
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
  const bulanan = loan.tenorBulan !== null;
  const terlambat = (loan.pelunasan?.hariTerlambat ?? 0) > 0;
  const [payOpen, setPayOpen] = useState(false);

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Nomor Referensi{" "}
            <span className="font-mono font-semibold text-navy">{loan.nomorReferensi}</span>
          </p>
          <h3 className="mt-1 text-lg font-semibold">Pinjaman Tunai Digital</h3>
        </div>
        <div className="flex items-center gap-2">
          {terlambat ? (
            <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">
              Terlambat
            </Badge>
          ) : (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Aktif
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onOpenDetail(loan._id)}>
            Detail <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
        {bulanan ? (
          <>
            <RincianBaris label="Pokok pengajuan" value={formatRupiah(loan.pokokPinjaman)} />
            <RincianBaris label="Uang muka (DP 0%)" value={formatRupiah(0)} tone="muted" />
            <RincianBaris
              label="Biaya layanan (3% dari pokok)"
              value={formatRupiah(
                loan.totalKewajiban - loan.pokokPinjaman - loan.imbalHasilTotal,
              )}
              tone="muted"
            />
            <RincianBaris
              label="Dana diterima penuh"
              value={formatRupiah(loan.pokokPinjaman)}
              tone="net"
            />
            <RincianBaris
              label="Bunga menurun (hak Pendana)"
              value={formatRupiah(loan.imbalHasilTotal)}
            />
            <RincianBaris
              label={`Total pengembalian (${loan.tenorBulan} bulan)`}
              value={formatRupiah(loan.totalKewajiban)}
              tone="total"
            />
          </>
        ) : (
          <>
            <RincianBaris label="Pokok pengajuan" value={formatRupiah(q.pokok)} />
            <RincianBaris
              label="Biaya admin (3%)"
              value={`- ${formatRupiah(q.biayaAdmin)}`}
              tone="muted"
            />
            <RincianBaris
              label="Biaya platform (2%)"
              value={`- ${formatRupiah(q.biayaPlatform)}`}
              tone="muted"
            />
            <RincianBaris
              label="Dana bersih diterima (95%)"
              value={formatRupiah(q.danaBersihDitransfer)}
              tone="net"
            />
            <RincianBaris label="Bunga pinjaman (30%)" value={formatRupiah(q.bunga)} />
            <RincianBaris
              label="Total pelunasan (130%)"
              value={formatRupiah(q.totalKewajibanPelunasan)}
              tone="total"
            />
          </>
        )}
      </dl>

      {loan.pelunasan && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
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
            value={
              terlambat
                ? 100
                : Math.max(
                    4,
                    100 -
                      Math.round(
                        (loan.pelunasan.sisaHari / Math.max(1, loan.pelunasan.sisaHari + 1)) * 100,
                      ),
                  )
            }
          />
          {terlambat && (
            <p className="mt-2 text-xs text-destructive">
              Denda berjalan: {formatRupiah(loan.pelunasan.dendaTerlambat)} (0,5%/hari, maks 15%)
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => setPayOpen(true)}>
          <Wallet className="mr-1.5 size-4" />
          Bayar Angsuran / Pelunasan
        </Button>
        <Button asChild variant="outline">
          <a
            href="https://wa.me/6281234567890?text=Halo%20CS%20PINDAI%2C%20saya%20ingin%20bertanya%20tentang%20pinjaman%20saya."
            target="_blank"
            rel="noreferrer"
          >
            <Send className="mr-1.5 size-4" /> Chat CS
          </a>
        </Button>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bayar Angsuran / Pelunasan</DialogTitle>
            <DialogDescription>
              Pilih metode pembayaran simulasi — QRIS atau Virtual Account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-xs text-muted-foreground">Total kewajiban saat ini</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatRupiah(loan.pelunasan?.totalKewajibanDenganPenalti ?? loan.totalKewajiban)}
              </p>
              {terlambat && (
                <p className="mt-1 text-xs text-destructive">
                  termasuk denda {formatRupiah(loan.pelunasan?.dendaTerlambat ?? 0)}
                </p>
              )}
            </div>
            <PaySimTabs
              total={loan.pelunasan?.totalKewajibanDenganPenalti ?? loan.totalKewajiban}
              loanRef={loan.nomorReferensi}
            />
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
      <TabsList className="grid w-full grid-cols-2 rounded-full bg-slate-100 p-1">
        <TabsTrigger value="qris" className="rounded-full text-xs">
          QRIS
        </TabsTrigger>
        <TabsTrigger value="va" className="rounded-full text-xs">
          Virtual Account
        </TabsTrigger>
      </TabsList>
      <TabsContent value="qris" className="mt-4">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-5">
          <QrSim total={total} />
          <p className="text-xs text-muted-foreground">
            Pindai QR simulasi ini — pembayaran nyata dicatat saat tim mengonfirmasi.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="va" className="mt-4">
        <div className="rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-muted-foreground">Nomor Virtual Account (simulasi)</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wider">{vaNumber}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
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

/** Deret pseudo-acak deterministik (LCG) — murni, tanpa state global. */
function pseudoRandomGrid(rows: number, cols: number, seed: number): boolean[][] {
  let state = seed;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rand() > 0.5),
  );
}

/** QR dekoratif deterministik (simulasi) — murni visual, tanpa pustaka eksternal. */
function QrSim({ total }: { total: number }) {
  const cells = 21;
  const seed = total % 2147483647 || 1;
  const grid = pseudoRandomGrid(cells, cells, seed);
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
    <svg
      width={216}
      height={216}
      viewBox={`0 0 ${cells * size} ${cells * size}`}
      className="rounded-xl bg-white p-1"
      role="img"
      aria-label="QRIS simulasi"
    >
      {grid.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={c * size}
              y={r * size}
              width={size}
              height={size}
              fill="#1c1a15"
              rx={1.5}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** Tab 2 — Jadwal angsuran. */
export function ScheduleSection({ schedule }: { schedule: LoanScheduleRow[] }) {
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
        body="Setelah pinjaman Anda didanai, tagihan dan tanggal jatuh tempo tampil di sini otomatis."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {schedule.map((l, idx) => {
        const lunas = l.status === "lunas";
        const overdue = !lunas && (l.pelunasan?.hariTerlambat ?? 0) > 0;
        const state: "lunas" | "menunggu" | "overdue" = lunas
          ? "lunas"
          : overdue
            ? "overdue"
            : "menunggu";
        return (
          <li
            key={l._id}
            className={`card-lift rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
              overdue ? "border-red-200" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  Angsuran #{idx + 1} —{" "}
                  <span className="font-mono text-xs text-muted-foreground">{l.nomorReferensi}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pokok {formatRupiah(l.pokokPinjaman)} · Bunga{" "}
                  {l.tenorBulan !== null ? "menurun" : "(30%)"}{" "}
                  {formatRupiah(l.imbalHasilTotal)} · tenor{" "}
                  {l.tenorBulan !== null ? `${l.tenorBulan} bulan` : `${l.tenorHari} hari`}
                </p>
              </div>
              <ScheduleBadge state={state} />
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <dt className="text-muted-foreground">Jatuh tempo</dt>
                <dd className="tabular-nums">
                  {l.pelunasan ? formatDate(l.pelunasan.jatuhTempoPada) : "—"}
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <dt className="text-muted-foreground">Total pembayaran</dt>
                <dd className="font-semibold tabular-nums">
                  {formatRupiah(
                    lunas
                      ? l.totalKewajiban
                      : (l.pelunasan?.totalKewajibanDenganPenalti ?? l.totalKewajiban),
                  )}
                </dd>
              </div>
              {!lunas && l.pelunasan && l.pelunasan.dendaTerlambat > 0 && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <dt className="text-destructive">Denda keterlambatan</dt>
                  <dd className="tabular-nums text-destructive">
                    +{formatRupiah(l.pelunasan.dendaTerlambat)}
                  </dd>
                </div>
              )}
              {!lunas && l.pelunasan && !overdue && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
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
                className="mt-4"
                disabled={busyId !== null}
                onClick={() => void bayar(l._id)}
              >
                {busyId === l._id ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                Bayar Sekarang
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
