import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CheckCircle2,
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

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
  const cairkan = useMutation(api.siklusPendana.cairkanSiklus);
  const putarUlang = useMutation(api.siklusPendana.putarUlangSiklus);
  const [busyId, setBusyId] = useState<string | null>(null);

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
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <CalendarClock className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Siklus Pendana 30 Hari
            </h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              Pokok dan Imbal Hasil pendana dikunci satu siklus. Cairkan hanya
              setelah jatuh tempo; pinjaman yang lunas lebih awal tidak
              mempercepat pencairan. Siklus yang dipilih pendana untuk diputar
              lagi dibuka sebagai siklus baru 30 hari, bukan transfer.
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

      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
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
      </dl>

      {daftar.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-4 text-xs leading-5 text-muted-foreground">
          Belum ada siklus pendana berjalan. Siklus dibuat otomatis saat
          pendana menempatkan dana.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {daftar.map((row) => (
            <li
              key={row._id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {row.pendanaNama}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                  Pokok {formatRupiah(row.pokok)} · Imbal{" "}
                  {formatRupiah(row.imbal)} · Biaya{" "}
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
                {row.kurang > 0 && (
                  <p className="mt-0.5 text-[11px] font-medium leading-5 text-amber-800">
                    Baru masuk {formatRupiah(row.totalMasuk)}; kurang{" "}
                    {formatRupiah(row.kurang)} ditutup jaminan platform.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
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
                <Button
                  size="sm"
                  className={
                    row.pilihanPendana === "putar_ulang"
                      ? "gap-1.5 rounded-xl bg-[#0F3D3A] text-white hover:bg-[#0b2d2b]"
                      : "gap-1.5 rounded-xl bg-[#064E3B] text-white hover:bg-[#04361f]"
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
