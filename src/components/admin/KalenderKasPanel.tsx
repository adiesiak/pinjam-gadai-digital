/**
 * Kalender kas admin — 30 hari uang masuk dan keluar.
 *
 * Dua seri saja: angsuran pinjaman yang jatuh tempo dan siklus pendana yang
 * harus dicairkan. Saldo awal diisi admin (tidak disimpan) supaya proyeksi
 * saldo tidak berpura-pura tahu kas yang tidak dicatat sistem.
 */
import { useQuery } from "convex/react";
import { CalendarRange, Info, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { saldoProyeksi } from "@/lib/kalenderKas";
import { formatRupiahAman, kelompokkanDigit } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

const PILIHAN_HARI = [14, 30, 60] as const;

function angkaDari(teks: string): number {
  const digit = teks.replace(/\D/g, "");
  return digit === "" ? 0 : Number(digit);
}

export function KalenderKasPanel() {
  const [hari, setHari] = useState<(typeof PILIHAN_HARI)[number]>(30);
  const [saldoAwalTeks, setSaldoAwalTeks] = useState("0");
  const [hanyaAktif, setHanyaAktif] = useState(false);
  const data = useQuery(api.kalenderKas.kalenderKas, { hari });

  if (data === undefined) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p role="status" className="text-sm text-slate-500">
          Menyusun kalender kas…
        </p>
      </section>
    );
  }

  const saldoAwal = angkaDari(saldoAwalTeks);
  const saldo = saldoProyeksi(data.baris, saldoAwal);
  const saldoTerendah = saldo.length > 0 ? Math.min(...saldo) : saldoAwal;
  const arusBersih = data.totalMasuk - data.totalKeluar;
  const barisTampil = hanyaAktif
    ? data.baris.map((baris, i) => ({ baris, saldo: saldo[i] })).filter(
        ({ baris }) => baris.masuk !== 0 || baris.keluar !== 0,
      )
    : data.baris.map((baris, i) => ({ baris, saldo: saldo[i] }));

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
            <CalendarRange className="size-4 text-primary" aria-hidden="true" />
            Kalender kas
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Proyeksi uang masuk dari angsuran dan uang keluar untuk pencairan siklus pendana.
            Masukkan saldo kas hari ini untuk melihat hari yang berpotensi minus.
          </p>
        </div>
        <div className="flex gap-1">
          {PILIHAN_HARI.map((nilai) => (
            <Button
              key={nilai}
              type="button"
              size="sm"
              variant={hari === nilai ? "default" : "outline"}
              onClick={() => setHari(nilai)}
            >
              {nilai} hari
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="kalender-saldo-awal">Saldo kas saat ini</Label>
          <Input
            id="kalender-saldo-awal"
            inputMode="numeric"
            className="mt-1 w-44 tabular-nums"
            value={saldoAwalTeks}
            onChange={(e) => setSaldoAwalTeks(kelompokkanDigit(e.target.value))}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Hanya untuk proyeksi di layar ini, tidak disimpan.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setHanyaAktif((sebelumnya) => !sebelumnya)}
          className="mb-5"
        >
          {hanyaAktif ? "Tampilkan semua hari" : "Hanya hari bertransaksi"}
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kotak
          label={`Masuk ${data.hari} hari`}
          nilai={formatRupiahAman(data.totalMasuk)}
          detail={`${data.cakupan.angsuran} angsuran`}
          Icon={TrendingUp}
          warna="emerald"
        />
        <Kotak
          label={`Keluar ${data.hari} hari`}
          nilai={formatRupiahAman(data.totalKeluar)}
          detail={`${data.cakupan.siklus} siklus pendana`}
          Icon={TrendingDown}
          warna="rose"
        />
        <Kotak
          label="Arus bersih"
          nilai={formatRupiahAman(arusBersih)}
          detail={arusBersih >= 0 ? "surplus" : "defisit"}
          Icon={Wallet}
          warna={arusBersih >= 0 ? "emerald" : "rose"}
        />
        <Kotak
          label="Saldo terendah"
          nilai={formatRupiahAman(saldoTerendah)}
          detail={
            saldoTerendah < 0
              ? "kas tidak cukup pada satu hari"
              : "masih positif sepanjang rentang"
          }
          Icon={CalendarRange}
          warna={saldoTerendah < 0 ? "rose" : "slate"}
        />
      </dl>

      {data.hariTerberat !== null && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Hari terberat: {formatTanggalWIB(data.hariTerberat.tanggal)} dengan kewajiban{" "}
            {formatRupiahAman(data.hariTerberat.keluar)}. Siapkan dana sebelum tanggal itu.
          </span>
        </p>
      )}

      <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[34rem] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Tanggal</th>
              <th className="px-3 py-2 text-right font-semibold">Masuk</th>
              <th className="px-3 py-2 text-right font-semibold">Keluar</th>
              <th className="px-3 py-2 text-right font-semibold">Net</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo proyeksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {barisTampil.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Tidak ada jadwal masuk atau keluar dalam rentang ini.
                </td>
              </tr>
            ) : (
              barisTampil.map(({ baris, saldo: saldoHari }, i) => {
                const net = baris.masuk - baris.keluar;
                const minus = saldoHari < 0;
                return (
                  <tr
                    key={baris.tanggal}
                    className={cn(
                      "transition-colors hover:bg-slate-50/70",
                      minus && "bg-rose-50/60",
                      i === 0 && "font-medium",
                    )}
                  >
                    <td className="px-3 py-2 text-slate-800">
                      {formatTanggalWIB(baris.tanggal, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      {(baris.jumlahAngsuran > 0 || baris.jumlahSiklus > 0) && (
                        <span className="ml-1.5 text-[10px] text-slate-500">
                          {baris.jumlahAngsuran > 0 ? `${baris.jumlahAngsuran} angsuran` : ""}
                          {baris.jumlahAngsuran > 0 && baris.jumlahSiklus > 0 ? " · " : ""}
                          {baris.jumlahSiklus > 0 ? `${baris.jumlahSiklus} siklus` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800">
                      {baris.masuk > 0 ? formatRupiahAman(baris.masuk) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-800">
                      {baris.keluar > 0 ? formatRupiahAman(baris.keluar) : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        net < 0 ? "text-rose-800" : "text-slate-700",
                      )}
                    >
                      {net === 0 ? "—" : formatRupiahAman(net)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-semibold tabular-nums",
                        minus ? "text-rose-800" : "text-slate-900",
                      )}
                    >
                      {formatRupiahAman(saldoHari)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-5 text-slate-500">
        Cakupan: angsuran pinjaman tunai yang belum dibayar dan siklus pendana berstatus
        berjalan. Belum termasuk gadai, kredit barang, akad syariah, denda, dan pengeluaran
        operasional.
        {data.dibatasi
          ? " Sebagian data melewati batas baca; angka bisa lebih besar dari yang tampil."
          : ""}
      </p>
    </section>
  );
}

function Kotak({
  label,
  nilai,
  detail,
  Icon,
  warna,
}: {
  label: string;
  nilai: string;
  detail: string;
  Icon: typeof Wallet;
  warna: "emerald" | "rose" | "slate";
}) {
  const kelas =
    warna === "emerald"
      ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
      : warna === "rose"
        ? "border-rose-200 bg-rose-50/70 text-rose-900"
        : "border-slate-200 bg-slate-50 text-slate-800";
  return (
    <div className={cn("rounded-xl border px-3 py-2", kelas)}>
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">{nilai}</dd>
      <p className="mt-0.5 text-[10px] opacity-70">{detail}</p>
    </div>
  );
}
