import { useMutation, useQuery } from "convex/react";
import { ArrowRight, CalendarClock, Send, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  JatuhTempoBadge,
  StatusBadge,
  statusTagihanDari,
  type StatusTagihan,
} from "@/components/StatusBadge";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Id } from "@/convex/_generated/dataModel";
import { ringkasJatuhTempo } from "@/lib/jatuhTempo";
import { urlChatCs } from "@/lib/kontak";
import { LATE_FEE_POLICY } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { bolehDibatalkan } from "@/lib/statusPinjaman";
import { EmptyState } from "./empty-state";
import { formatDate, type LoanScheduleRow } from "./shared";

/**
 * Tombol pembatalan pengajuan milik peminjam sendiri.
 *
 * Konfirmasi dua langkah (bukan dialog) supaya tidak ada aksi tak sengaja, dan
 * tanpa menambah state di komponen induk. Server tetap penjaga: pengajuan yang
 * sudah punya alokasi dana atau sudah tersalurkan ditolak dengan alasannya
 * (`loans.batalkanPengajuan`).
 */
function TombolBatalkan({ loanId }: { loanId: Id<"loans"> }) {
  const batalkan = useMutation(api.loans.batalkanPengajuan);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!konfirmasi) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 rounded-full text-destructive hover:text-destructive"
        onClick={() => setKonfirmasi(true)}
      >
        Batalkan
      </Button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await batalkan({ loanId });
            toast.success("Pengajuan dibatalkan. Batas pinjaman Anda tidak berubah.");
            setKonfirmasi(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Pengajuan gagal dibatalkan.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Ya, batalkan
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setKonfirmasi(false)}
      >
        Tidak
      </Button>
    </span>
  );
}

/** Satu baris rincian biaya pinjaman (label kiri, nilai kanan). */
/**
 * Judul kelompok baris rincian. Dipakai memisahkan "yang Anda bayar" dari
 * "potongan di muka" supaya pembaca tahu baris mana yang dijumlahkan.
 */
function RincianJudul({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-slate-200 bg-slate-50 px-4 pt-3 pb-1">
      <dt className="w-full text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
        {children}
      </dt>
    </div>
  );
}

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
  batas,
}: {
  schedule: Array<LoanScheduleRow>;
  onOpenDetail: (id: Id<"loans">) => void;
  /**
   * Jumlah kartu yang dirender. Ringkasan memakai `1` supaya hanya kewajiban
   * TERDEKAT yang tampil sebagai kartu; tanpa batas, semua pinjaman aktif
   * dirender (dipakai bila bagian ini dipasang di halaman daftar).
   */
  batas?: number;
}) {
  // Urut dari jatuh tempo paling dekat: "kewajiban terdekat" harus benar-benar
  // yang paling dekat, bukan sekadar baris pertama dari server.
  const aktifTerurut = schedule
    .filter((l) => l.status === "didanai")
    .sort(
      (a, b) =>
        (a.pelunasan?.jatuhTempoPada ?? Number.POSITIVE_INFINITY) -
        (b.pelunasan?.jatuhTempoPada ?? Number.POSITIVE_INFINITY),
    );
  const aktif = batas === undefined ? aktifTerurut : aktifTerurut.slice(0, batas);
  // Daftar "status catatan lainnya" hanya bagian dari halaman daftar; saat
  // kartunya dibatasi (Ringkasan), bagian itu tidak ikut supaya tidak ada
  // catatan yang muncul dua kali di satu layar.
  const lainnya =
    batas === undefined
      ? schedule.filter((l) => l.status !== "didanai" && l.status !== "lunas")
      : [];

  if (aktif.length === 0) {
    return (        <EmptyState
          icon={Wallet}
          title="Belum ada pinjaman aktif"
        body="Pinjaman yang sedang berjalan tampil di sini. Angka alokasi dan pelunasan mengikuti catatan PINDAI."
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
              <li key={l._id} className="flex items-center gap-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => onOpenDetail(l._id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tabular-nums">
                      {formatRupiah(l.pokokPinjaman)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{l.nomorReferensi}</p>
                    {(l.pokokDiajukan ?? l.pokokPinjaman) !== l.pokokPinjaman && (
                      <p className="mt-1 text-xs text-slate-600">
                        Diajukan {formatRupiah(l.pokokDiajukan ?? l.pokokPinjaman)} · disetujui{" "}
                        {formatRupiah(l.pokokPinjaman)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={l.status} kind="loan" />
                </button>
                {bolehDibatalkan(l.status) && <TombolBatalkan loanId={l._id} />}
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
  // Jam dikunci sekali saat kartu dipasang: status tagihan tidak berubah-ubah
  // hanya karena komponen dirender ulang.
  const [sekarang] = useState(() => Date.now());
  // Tarif denda untuk label di bawah angka — mengikuti pengaturan yang berlaku.
  const ketentuanBiaya = useQuery(api.system.getKetentuanBiaya, {});
  // Status tagihan satu-satunya: nada dari `lib/jatuhTempo.ts` diterjemahkan ke
  // kosakata Aman / Segera jatuh tempo / Terlambat / Belum dicairkan.
  const statusTagihan: StatusTagihan = terlambat
    ? "terlambat"
    : statusTagihanDari(ringkasJatuhTempo(loan, sekarang).nada);
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
          <JatuhTempoBadge status={statusTagihan} />
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onOpenDetail(loan._id)}>
            Detail <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
        {bulanan ? (
          <>
            <RincianJudul>Yang Anda bayar</RincianJudul>
            <RincianBaris label="Pokok pinjaman" value={formatRupiah(loan.pokokPinjaman)} />
            {loan.simulasiBulanan !== null ? (
              <RincianBaris
                label="Bunga selama tenor"
                value={formatRupiah(loan.simulasiBulanan.bungaTotal)}
              />
            ) : null}
            {loan.simulasiBulanan !== null ? (
              <RincianBaris
                label="Biaya admin cicilan (2% per bayar)"
                value={formatRupiah(loan.simulasiBulanan.biayaAdminCicilanTotal)}
              />
            ) : null}
            {loan.simulasiBulanan === null && loan.totalKewajiban > loan.pokokPinjaman ? (
              <RincianBaris
                label="Bunga & biaya selama tenor"
                value={formatRupiah(loan.totalKewajiban - loan.pokokPinjaman)}
              />
            ) : null}
            <RincianBaris
              label={`Total yang harus dibayar (${loan.tenorBulan} bulan)`}
              value={formatRupiah(loan.totalKewajiban)}
              tone="total"
            />
            {/* Potongan di muka mengurangi dana yang diterima, jadi tidak ikut
                ditambahkan ke total di atas. Dipisah supaya rinciannya bisa
                dijumlahkan tanpa selisih yang tak dijelaskan. */}
            <RincianJudul>Potongan di muka</RincianJudul>
            {loan.simulasiBulanan !== null ? (
              loan.tenorBulan === 3 || loan.tenorBulan === 6 ? (
                <>
                  <RincianBaris
                    label="Biaya admin (2%, dipotong di muka)"
                    value={formatRupiah(loan.simulasiBulanan.biayaAdminTotal)}
                  />
                  <RincianBaris
                    label="Biaya platform (0%)"
                    value={formatRupiah(loan.simulasiBulanan.biayaPlatformTotal)}
                  />
                </>
              ) : (
                <RincianBaris
                  label="Biaya layanan (2%, dipotong di muka)"
                  value={formatRupiah(loan.simulasiBulanan.biayaLayananTotal)}
                />
              )
            ) : null}
            {loan.simulasiBulanan !== null ? (
              <RincianBaris
                label="Dana bersih yang Anda terima (belum dicairkan)"
                value={formatRupiah(loan.simulasiBulanan.danaDiterima)}
                tone="net"
              />
            ) : null}
          </>
        ) : (
          <>
            <RincianJudul>Yang Anda bayar</RincianJudul>
            <RincianBaris label="Pokok pinjaman" value={formatRupiah(q.pokok)} />
            <RincianBaris label="Bunga pinjaman" value={formatRupiah(q.bunga)} />
            <RincianBaris
              label="Total yang harus dibayar"
              value={formatRupiah(q.totalKewajibanPelunasan)}
              tone="total"
            />
            <RincianJudul>Potongan di muka</RincianJudul>
            <RincianBaris
              label="Biaya admin (2%, dipotong di muka)"
              value={formatRupiah(q.biayaAdmin)}
            />
            <RincianBaris label="Biaya platform (0%)" value={formatRupiah(q.biayaPlatform)} />
            <RincianBaris
              label="Dana bersih yang Anda terima (belum ditransfer)"
              value={formatRupiah(q.danaBersihDitransfer)}
              tone="net"
            />
          </>
        )}
      </dl>

      <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        Semua nominal, status aktif, dana bersih, dan status pelunasan di halaman ini mengikuti catatan PINDAI. Pinjaman harian dapat memilih bayar bunga saja, cicil pokok, atau pelunasan total; status berubah setelah bukti transfer dicocokkan admin. {bulanan ? "Jadwal bulanan bersifat ilustrasi." : "Nilai kewajiban mengikuti perhitungan aplikasi."}
      </p>

      {loan.pelunasan && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">
              {terlambat
                ? `Jatuh tempo terlewati ${loan.pelunasan.hariTerlambat} hari`
                : loan.pelunasan.sisaHari === 0
                  ? "Jatuh tempo: hari ini"
                  : `Jatuh tempo ${loan.pelunasan.sisaHari} hari lagi`}
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
              Denda: {formatRupiah(loan.pelunasan.dendaTerlambat)} (
              {ketentuanBiaya?.persenDendaKeterlambatan ?? LATE_FEE_POLICY.percentPerDay}%/hari,
              maks {ketentuanBiaya?.maksDendaPersen ?? LATE_FEE_POLICY.maxPercent}%)
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onOpenDetail(loan._id)}>
          <CalendarClock className="mr-1.5 size-4" />
          {bulanan ? "Ajukan cicilan" : "Atur pembayaran"}
        </Button>
        <Button asChild variant="outline">
          <a
            href={urlChatCs(
              "Halo CS PINDAI, saya ingin bertanya tentang pinjaman saya.",
            )}
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
  const [sekarang] = useState(() => Date.now());
  if (schedule.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Belum ada jadwal angsuran"
        body="Jadwal angsuran dan jatuh tempo mengikuti catatan PINDAI; ini bukan tagihan atau bukti pencairan dana."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {schedule.map((l, idx) => {
        const lunas = l.status === "lunas";
        const overdue = !lunas && (l.pelunasan?.hariTerlambat ?? 0) > 0;
        const state: StatusTagihan = lunas
          ? "lunas"
          : statusTagihanDari(ringkasJatuhTempo(l, sekarang).nada);
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
                  <p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">
                    {l.tenorBulan === 3 || l.tenorBulan === 6
                      ? "Biaya admin 2% dipotong di muka dari dana yang diterima (platform 0%); cicilan berisi pokok dan bunga, ditambah biaya admin cicilan 2% dari nominal cicilan. Jadwal bersifat ilustrasi."
                      : "Biaya layanan 2% dipotong di muka dari dana yang diterima; setiap cicilan ditambah biaya admin cicilan 2% dari nominal cicilan. Jadwal bersifat ilustrasi."}
                  </p>
                )}
              </div>
              <JatuhTempoBadge status={state} />
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
              {l.simulasiBulanan !== null && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <dt className="text-muted-foreground">
                    {l.tenorBulan === 3 || l.tenorBulan === 6
                      ? "Biaya admin 2% (dipotong di muka)"
                      : "Biaya layanan 2% (dipotong di muka)"}
                  </dt>
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
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                Pinjaman harian dapat memilih bayar bunga saja, cicil pokok, atau
                pelunasan total lewat rincian pinjaman. Perubahan resmi dicatat
                setelah bukti transfer dicocokkan admin.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
