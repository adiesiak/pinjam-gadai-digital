import { ArrowRight, CalendarClock, Send, Wallet } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import { ManualPaymentEvidenceForm } from "@/components/ManualPaymentEvidenceForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { EmptyState } from "./empty-state";
import { formatDate, type LoanScheduleRow } from "./shared";

/** Status pill (Lunas / Menunggu / Terlambat) sesuai semantik warna. */
function ScheduleBadge({ state }: { state: "lunas" | "menunggu" | "overdue" }) {
  if (state === "lunas") {
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Lunas (ledger)
      </Badge>
    );
  }
  if (state === "overdue") {
    return (
      <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">Melewati tanggal acuan</Badge>
    );
  }
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Belum dicatat</Badge>
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
    return (        <EmptyState
          icon={Wallet}
          title="Belum ada catatan pinjaman aktif di ledger"
        body="Catatan dengan status internal aktif akan tampil di sini. Angka alokasi dan pelunasan mengikuti pencatatan ledger internal."
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
          <h3 className="text-sm font-semibold">Status catatan lainnya</h3>
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
                    {(l.pokokDiajukan ?? l.pokokPinjaman) !== l.pokokPinjaman && (
                      <p className="mt-1 text-xs text-amber-700">
                        Diajukan {formatRupiah(l.pokokDiajukan ?? l.pokokPinjaman)} · disetujui{" "}
                        {formatRupiah(l.pokokPinjaman)}
                      </p>
                    )}
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
          <h3 className="mt-1 text-lg font-semibold">Catatan pinjaman tunai</h3>
        </div>
        <div className="flex items-center gap-2">
          {terlambat ? (
            <Badge className="border-0 bg-red-100 text-red-700 hover:bg-red-100">
              Melewati tanggal acuan
            </Badge>
          ) : (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Aktif (ledger)
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
            <RincianBaris
              label="Dana bersih setelah potongan di muka (belum dicairkan)"
              value={formatRupiah(loan.simulasiBulanan?.danaDiterima ?? loan.pokokPinjaman)}
              tone="net"
            />
            {loan.simulasiBulanan !== null && (loan.tenorBulan === 3 || loan.tenorBulan === 6) ? (
              <>
                <RincianBaris label="Biaya admin (2%, dipotong di muka)" value={formatRupiah(loan.simulasiBulanan.biayaAdminTotal)} />
                <RincianBaris label="Biaya platform (3%, dipotong di muka)" value={formatRupiah(loan.simulasiBulanan.biayaPlatformTotal)} />
                <RincianBaris label="Biaya admin cicilan (2% per bayar)" value={formatRupiah(loan.simulasiBulanan.biayaAdminCicilanTotal)} />
              </>
            ) : loan.simulasiBulanan !== null ? (
              <RincianBaris label="Biaya layanan (3%, dipotong di muka)" value={formatRupiah(loan.simulasiBulanan.biayaLayananTotal)} />
            ) : null}
            <RincianBaris
              label={`Total pembayaran (${loan.tenorBulan} bulan)`}
              value={formatRupiah(loan.totalKewajiban)}
              tone="total"
            />
          </>
        ) : (
          <>
            <RincianBaris
              label="Nilai bersih (belum ditransfer)"
              value={formatRupiah(q.danaBersihDitransfer)}
              tone="net"
            />
            <RincianBaris
              label="Total pembayaran"
              value={formatRupiah(q.totalKewajibanPelunasan)}
              tone="total"
            />
          </>
        )}
      </dl>

      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Semua nominal, status aktif, dana bersih, dan status pelunasan di halaman ini mengikuti pencatatan ledger internal PINDAI. Pelunasan ditangani di luar aplikasi dan statusnya diperbarui oleh tim PINDAI. {bulanan ? "Jadwal bulanan bersifat ilustrasi." : "Nilai kewajiban mengikuti perhitungan aplikasi."}
      </p>

      {loan.pelunasan && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">
              {terlambat
                ? `Tanggal acuan terlewati ${loan.pelunasan.hariTerlambat} hari`
                : loan.pelunasan.sisaHari === 0
                  ? "Tanggal acuan: hari ini"
                  : `${loan.pelunasan.sisaHari} hari menuju tanggal acuan`}
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
              Denda: {formatRupiah(loan.pelunasan.dendaTerlambat)} (0,5%/hari, maks 15%)
            </p>
          )}
        </div>
      )}

      <ManualPaymentEvidenceForm
        jenis="pinjaman"
        targetId={loan._id}
        reference={loan.nomorReferensi}
        suggestedAmount={loan.pelunasan?.totalKewajibanDenganPenalti ?? loan.totalKewajiban}
      />

      <div className="mt-5 flex flex-wrap gap-2">
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

/** Tab 2 — Jadwal kewajiban pinjaman. */
export function ScheduleSection({ schedule }: { schedule: LoanScheduleRow[] }) {
  if (schedule.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Belum ada jadwal angsuran"
        body="Jadwal angsuran dan tanggal acuan tampil berdasarkan status ledger; ini bukan tagihan atau bukti pencairan dana."
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
                  Nilai bersih{" "}
                  {formatRupiah(
                    l.tenorBulan !== null
                      ? (l.simulasiBulanan?.danaDiterima ?? l.pokokPinjaman)
                      : l.quote.danaBersihDitransfer,
                  )}{" "}
                  · tenor{" "}
                  {l.tenorBulan !== null ? `${l.tenorBulan} bulan` : `${l.tenorHari} hari`}
                </p>
                {l.tenorBulan !== null && (
                  <p className="mt-1 max-w-xl text-xs leading-5 text-amber-800">
                    {l.tenorBulan === 3 || l.tenorBulan === 6
                      ? "Biaya admin 2% + platform 3% dipotong di muka dari dana yang diterima; cicilan berisi pokok dan bunga, ditambah biaya admin cicilan 2% dari nominal cicilan yang dibayar setiap bulan. Jadwal bersifat ilustrasi."
                      : "Biaya layanan 3% dipotong di muka dari dana yang diterima. Jadwal hanya ilustrasi."}
                  </p>
                )}
              </div>
              <ScheduleBadge state={state} />
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <dt className="text-muted-foreground">Tanggal acuan</dt>
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
              {l.simulasiBulanan !== null && (l.tenorBulan === 3 || l.tenorBulan === 6) && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <dt className="text-muted-foreground">Biaya admin 2% + platform 3% (dipotong di muka)</dt>
                  <dd className="tabular-nums">{formatRupiah(l.simulasiBulanan.biayaLayananTotal)}</dd>
                </div>
              )}
              {!lunas && l.pelunasan && l.pelunasan.dendaTerlambat > 0 && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <dt className="text-destructive">Denda</dt>
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
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Pembayaran belum tersedia di aplikasi; statusnya diperbarui oleh tim PINDAI. Tanggal dan nilai di atas mengikuti pencatatan ledger internal.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
