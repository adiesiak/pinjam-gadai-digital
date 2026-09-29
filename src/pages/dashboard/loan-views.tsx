import { useMutation } from "convex/react";
import { AlertCircle, ArrowRight, CalendarClock, Loader2, Send, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
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
        body="Catatan pinjaman yang status ledger-nya aktif akan tampil di sini. Angka pendanaan dan pelunasan adalah simulasi internal."
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
              label="Pokok acuan simulasi (tidak ditransfer)"
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
              label="Nilai bersih simulasi (95%; tidak ditransfer)"
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

      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Semua nominal, status aktif, dana bersih, dan pelunasan di halaman ini adalah simulasi ledger internal; tidak ada transfer atau pembayaran eksternal. {bulanan ? "Jadwal cicilan bulanan hanya ilustrasi dan sistem mencatat pelunasan penuh sekaligus pada akhir tenor, tanpa pembayaran parsial." : "Tombol pelunasan hanya mencatat kewajiban penuh sekaligus, bukan menerima atau memverifikasi pembayaran."}
      </p>

      {loan.pelunasan && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">              <span className="font-medium">
              {terlambat
                ? `Simulasi terlambat ${loan.pelunasan.hariTerlambat} hari`
                : loan.pelunasan.sisaHari === 0
                  ? "Simulasi jatuh tempo hari ini"
                  : `${loan.pelunasan.sisaHari} hari menuju jatuh tempo simulasi`}
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
              Denda simulasi: {formatRupiah(loan.pelunasan.dendaTerlambat)} (0,5%/hari, maks 15%)
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <RepaymentSimulationAction
          loanId={loan._id}
          total={loan.pelunasan?.totalKewajibanDenganPenalti ?? loan.totalKewajiban}
          denda={loan.pelunasan?.dendaTerlambat ?? 0}
          variant="default"
        />
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


    </article>
  );
}

/** Tombol konfirmasi pencatatan pelunasan simulasi internal PINDAI. */
function RepaymentSimulationAction({
  loanId,
  total,
  denda,
  variant = "outline",
}: {
  loanId: Id<"loans">;
  total: number;
  denda: number;
  variant?: "default" | "outline";
}) {
  const repayLoan = useMutation(api.loans.repayLoan);
  const [busy, setBusy] = useState(false);

  const catatPelunasan = async () => {
    setBusy(true);
    try {
      const hasil = await repayLoan({ loanId });
      toast.success(
        hasil.dendaTerlambat > 0
          ? `Pelunasan simulasi tercatat ${formatRupiah(hasil.totalDibayar)}, termasuk denda ${formatRupiah(hasil.dendaTerlambat)}.`
          : `Pelunasan simulasi tercatat ${formatRupiah(hasil.totalDibayar)}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pencatatan simulasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={variant} disabled={busy}>
          <Wallet className="mr-1.5 size-4" /> Catat pelunasan simulasi
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi pelunasan simulasi</AlertDialogTitle>
          <AlertDialogDescription>
            Ini hanya mengubah status dan jurnal internal PINDAI. Tidak ada transfer bank/e-wallet, QRIS, atau Virtual Account yang dilakukan atau diverifikasi. Tombol ini mencatat seluruh kewajiban sekaligus — bukan cicilan sebagian.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4 shrink-0" /> Aksi simulasi — bukan bukti pembayaran</p>
          <p className="mt-2">Jumlah yang akan dicatat: <strong className="tabular-nums">{formatRupiah(total)}</strong>{denda > 0 ? ` (termasuk denda ${formatRupiah(denda)})` : ""}.</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void catatPelunasan(); }}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Ya, catat pelunasan simulasi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Tab 2 — Jadwal angsuran. */
export function ScheduleSection({ schedule }: { schedule: LoanScheduleRow[] }) {
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
                  Pinjaman #{idx + 1} —{" "}
                  <span className="font-mono text-xs text-muted-foreground">{l.nomorReferensi}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pokok {formatRupiah(l.pokokPinjaman)} · Bunga{" "}
                  {l.tenorBulan !== null ? "menurun (simulasi)" : "flat (30%)"}{" "}
                  {formatRupiah(l.imbalHasilTotal)} · tenor{" "}
                  {l.tenorBulan !== null ? `${l.tenorBulan} bulan` : `${l.tenorHari} hari`}
                </p>
                {l.tenorBulan !== null && (
                  <p className="mt-1 max-w-xl text-xs leading-5 text-amber-800">
                    Jadwal cicilan bulanan yang ditampilkan adalah ilustrasi. Sistem saat ini hanya mencatat pelunasan penuh sekaligus saat jatuh tempo.
                  </p>
                )}
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
              <div className="mt-4">
                <RepaymentSimulationAction
                  loanId={l._id}
                  total={l.pelunasan?.totalKewajibanDenganPenalti ?? l.totalKewajiban}
                  denda={l.pelunasan?.dendaTerlambat ?? 0}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
