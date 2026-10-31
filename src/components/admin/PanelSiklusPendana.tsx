import { useMutation, useQuery } from "convex/react";
import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Tenor pinjaman dalam hari, dipakai untuk menyaring putaran yang muat. */
function tenorHariPinjaman(p: {
  tenorHari: number | null;
  tenorBulan: number | null;
}): number {
  return p.tenorBulan !== null ? p.tenorBulan * 30 : (p.tenorHari ?? 7);
}

/**
 * Antrean pencairan siklus pendana 30 hari.
 *
 * Siklus hanya bisa dicairkan pada/setelah jatuh tempo. Bila uang dari
 * pinjaman belum kembali penuh, selisihnya ditutup akun jaminan platform —
 * pendana tetap menerima pokok + Imbal Hasil sesuai kontrak siklus.
 */
export function PanelSiklusPendana() {
  const daftar = useQuery(api.siklusPendana.daftarSiklus, {
    hanyaJatuhTempo: false,
  });
  const pinjamanTerbuka = useQuery(api.alokasiDana.pinjamanTerbukaAdmin, {});
  const cairkan = useMutation(api.siklusPendana.cairkanSiklus);
  const putarUlang = useMutation(api.siklusPendana.putarUlangSiklus);
  const putarModal = useMutation(api.alokasiDana.putarModalSiklus);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyPutar, setBusyPutar] = useState<string | null>(null);
  const [bukaPutar, setBukaPutar] = useState<string | null>(null);

  if (daftar === undefined) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          Memuat siklus pendana…
        </div>
      </section>
    );
  }

  const jatuhTempo = daftar.filter((row) => row.jatuhTempo);
  const totalCair = daftar.reduce((total, row) => total + row.totalCair, 0);
  const totalKurang = daftar.reduce((total, row) => total + row.kurang, 0);
  const totalSiapPutar = daftar.reduce(
    (total, row) => total + row.modalSiapPutar,
    0,
  );

  const salurkanPutaran = async (
    row: { _id: Id<"siklusPendana">; modalSiapPutar: number },
    loan: {
      _id: Id<"loans">;
      nomorReferensi: string;
      sisaKebutuhan: number;
    },
  ) => {
    const jumlah = Math.min(row.modalSiapPutar, loan.sisaKebutuhan);
    if (jumlah <= 0) return;
    setBusyPutar(loan._id);
    try {
      await putarModal({ siklusId: row._id, loanId: loan._id, jumlah });
      toast.success(
        `Modal ${formatRupiah(jumlah)} diputar ke ${loan.nomorReferensi}.`,
      );
      setBukaPutar(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memutar modal siklus.",
      );
    } finally {
      setBusyPutar(null);
    }
  };

  const proses = async (row: {
    _id: Id<"siklusPendana">;
    pilihanPendana: "cairkan" | "putar_ulang";
  }) => {
    setBusyId(row._id);
    try {
      if (row.pilihanPendana === "putar_ulang") {
        const hasil = await putarUlang({ siklusId: row._id });
        toast.success(
          `Siklus diputar lagi. Pokok baru ${formatRupiah(hasil.pokokBaru)} untuk 30 hari berikutnya.`,
        );
      } else {
        const hasil = await cairkan({ siklusId: row._id });
        toast.success(
          hasil.kurang > 0
            ? `Siklus dicairkan. Jaminan platform menutup ${formatRupiah(hasil.kurang)}.`
            : "Siklus dicairkan ke dompet pendana.",
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memproses siklus.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <CalendarClock className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Siklus Pendana 30 Hari
            </h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              Pokok dan Imbal Hasil pendana dikunci satu siklus. Pinjaman tenor
              pendek yang lunas lebih awal tidak mempercepat pencairan, tetapi
              pokoknya bisa diputar lagi ke pinjaman lain selama siklus masih
              berjalan. Hak pendana tidak bertambah; hasil putaran menjadi
              pendapatan platform.
            </p>
          </div>
        </div>
        <Badge
          className={
            jatuhTempo.length > 0
              ? "border-0 bg-amber-100 text-amber-900 hover:bg-amber-100"
              : "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
          }
        >
          {jatuhTempo.length} jatuh tempo
        </Badge>
      </header>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Siklus berjalan
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {daftar.length}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Total kewajiban
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {formatRupiah(totalCair)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <ShieldCheck className="size-3" /> Ditutup jaminan
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-amber-800">
            {formatRupiah(totalKurang)}
          </dd>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
            Modal siap diputar
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-emerald-900">
            {formatRupiah(totalSiapPutar)}
          </dd>
        </div>
      </dl>

      {daftar.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-4 text-xs leading-5 text-muted-foreground">
          Belum ada siklus pendana berjalan. Siklus dibuat otomatis saat
          pendana menempatkan dana.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {daftar.map((row) => {
            // Hanya pinjaman yang tenornya selesai sebelum siklus berakhir.
            const pinjamanCocok = (pinjamanTerbuka ?? [])
              .filter((p) => tenorHariPinjaman(p) <= row.sisaHari)
              .slice(0, 6);
            return (
            <li key={row._id} className="py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {row.pendanaNama}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                    Pokok {formatRupiah(row.pokok)} · Marjin{" "}
                    {formatRupiah(row.imbal)} · Porsi platform{" "}
                    {formatRupiah(row.potongan)} · Jatuh tempo{" "}
                    {tanggal(row.jatuhTempoPada)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-5 text-muted-foreground">
                    <Badge
                      className={
                        row.pilihanPendana === "putar_ulang"
                          ? "border-0 bg-sky-100 text-sky-900 hover:bg-sky-100"
                          : "border-0 bg-slate-100 text-slate-700 hover:bg-slate-100"
                      }
                    >
                      {row.pilihanLabel}
                    </Badge>
                    {row.belumMemilih && (
                      <span className="text-slate-500">
                        belum memilih, bawaan cairkan
                      </span>
                    )}
                  </p>
                  {(row.modalSiapPutar > 0 || row.jumlahPutaran > 0) && (
                    <p className="mt-1 text-[11px] font-medium leading-5 text-emerald-900">
                      Modal siap diputar {formatRupiah(row.modalSiapPutar)} ·
                      bekerja {formatRupiah(row.modalDikerjakan)} ·{" "}
                      {row.jumlahPutaran} putaran · untung platform{" "}
                      {formatRupiah(row.totalKeuntunganPutaran)}
                    </p>
                  )}
                  {row.kurang > 0 && (
                    <p className="mt-0.5 text-[11px] font-medium leading-5 text-amber-800">
                      Baru masuk {formatRupiah(row.totalMasuk)}; kurang{" "}
                      {formatRupiah(row.kurang)} ditutup jaminan platform.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-emerald-800">
                      {formatRupiah(row.totalCair)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.jatuhTempo
                        ? "Siap diproses"
                        : `${row.sisaHari} hari lagi`}
                    </p>
                  </div>
                  {row.modalSiapPutar > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                      disabled={!row.bisaPutar || busyPutar !== null}
                      aria-expanded={bukaPutar === row._id}
                      onClick={() =>
                        setBukaPutar(bukaPutar === row._id ? null : row._id)
                      }
                    >
                      <ArrowRightLeft className="size-3.5" />
                      Putar modal
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform",
                          bukaPutar === row._id && "rotate-180",
                        )}
                      />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className={
                      row.pilihanPendana === "putar_ulang"
                        ? "gap-1.5 rounded-xl bg-[#0F3D3A] text-white hover:bg-[#0b2d2b]"
                        : "gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                    }
                    disabled={!row.jatuhTempo || busyId !== null}
                    onClick={() => void proses(row)}
                  >
                    {busyId === row._id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : row.pilihanPendana === "putar_ulang" ? (
                      <RotateCcw className="size-3.5" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    {row.pilihanPendana === "putar_ulang"
                      ? "Putar 30 hari"
                      : "Cairkan"}
                  </Button>
                </div>
              </div>

              {bukaPutar === row._id && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[11px] leading-5 text-slate-600">
                    Pilih pinjaman yang masih menunggu dana. Yang disalurkan
                    hanya pokok siklus yang sudah kembali, dan angka siklus
                    pendana tidak berubah.
                  </p>
                  {pinjamanTerbuka === undefined ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> Memuat
                      pinjaman terbuka…
                    </p>
                  ) : pinjamanCocok.length === 0 ? (
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      Belum ada pinjaman disetujui yang tenornya selesai sebelum
                      siklus berakhir. Putaran bisa dilakukan setelah pengajuan
                      berikutnya disetujui.
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-slate-200">
                      {pinjamanCocok.map((p) => {
                        const jumlah = Math.min(
                          row.modalSiapPutar,
                          p.sisaKebutuhan,
                        );
                        return (
                          <li
                            key={p._id}
                            className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {p.nomorReferensi}
                                {p.kodePeminjam ? ` · ${p.kodePeminjam}` : ""}
                              </p>
                              <p className="text-[11px] leading-5 text-muted-foreground">
                                {p.tujuan} ·{" "}
                                {p.tenorBulan
                                  ? `${p.tenorBulan} bulan`
                                  : `${p.tenorHari ?? 7} hari`}{" "}
                                · sisa {formatRupiah(p.sisaKebutuhan)}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/5"
                              disabled={busyPutar !== null}
                              onClick={() =>
                                void salurkanPutaran(row, p)
                              }
                            >
                              {busyPutar === p._id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ArrowRightLeft className="size-3.5" />
                              )}
                              Putar {formatRupiah(jumlah)}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
