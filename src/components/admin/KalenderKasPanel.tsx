/**
 * Kalender kas admin — 30 hari uang masuk dan keluar.
 *
 * Tiga bagian:
 *  - pengaturan peringatan (saldo kas, ambang, nomor WhatsApp admin);
 *  - kalender proyeksi harian;
 *  - biaya operasional berulang yang ikut dihitung.
 *
 * Saldo kas disimpan bersama waktunya karena cron memakai angka yang sama untuk
 * peringatan otomatis; tanpa waktu pembaruan, pesan bisa dikirim dari saldo basi.
 */
import { useMutation, useQuery } from "convex/react";
import {
  BellRing,
  CalendarRange,
  Info,
  Plus,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { KonfirmasiAksi } from "@/components/admin/KonfirmasiAksi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { saldoProyeksi } from "@/lib/kalenderKas";
import { formatRupiahAman, kelompokkanDigit } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

const PILIHAN_HARI = [14, 30, 60] as const;
const PILIHAN_PERINGATAN = [3, 7, 14, 30] as const;

function angkaDari(teks: string): number {
  const digit = teks.replace(/\D/g, "");
  return digit === "" ? 0 : Number(digit);
}

function teksRupiah(nilai: number): string {
  return nilai <= 0 ? "" : kelompokkanDigit(String(nilai));
}

export function KalenderKasPanel() {
  const [hari, setHari] = useState<(typeof PILIHAN_HARI)[number]>(30);
  const [hanyaAktif, setHanyaAktif] = useState(false);
  const data = useQuery(api.kalenderKas.kalenderKas, { hari });

  const simpanPengaturan = useMutation(api.kalenderKas.simpanPengaturanKas);
  const tambahBiaya = useMutation(api.kalenderKas.tambahBiaya);
  const ubahBiaya = useMutation(api.kalenderKas.ubahBiaya);
  const hapusBiaya = useMutation(api.kalenderKas.hapusBiaya);

  // Isian pengaturan disemai ulang hanya saat server menyimpan versi baru,
  // sehingga mengetik tidak ditimpa oleh pembaruan query.
  const versi = data?.pengaturan.diperbaruiPada ?? null;
  const [aktif, setAktif] = useState(false);
  const [saldoTeks, setSaldoTeks] = useState("");
  const [minimumTeks, setMinimumTeks] = useState("");
  const [hariPeringatan, setHariPeringatan] = useState(7);
  const [nomor, setNomor] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    if (data === undefined) return;
    setAktif(data.pengaturan.aktif);
    setSaldoTeks(teksRupiah(data.pengaturan.saldoKas));
    setMinimumTeks(teksRupiah(data.pengaturan.saldoMinimum));
    setHariPeringatan(data.pengaturan.hariPeringatan);
    setNomor(data.pengaturan.nomorWhatsApp ?? "");
    // `versi` sengaja jadi pemicu: nilainya berubah hanya setelah simpan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versi]);

  const [judulBiaya, setJudulBiaya] = useState("");
  const [nominalBiaya, setNominalBiaya] = useState("");
  const [tanggalBiaya, setTanggalBiaya] = useState("1");
  const [menambahBiaya, setMenambahBiaya] = useState(false);
  const [targetHapus, setTargetHapus] = useState<{
    id: Id<"biayaOperasional">;
    judul: string;
  } | null>(null);
  const [busyHapus, setBusyHapus] = useState(false);

  if (data === undefined) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p role="status" className="text-sm text-slate-500">
          Menyusun kalender kas…
        </p>
      </section>
    );
  }

  const saldo = saldoProyeksi(data.baris, data.pengaturan.saldoKas);
  const saldoTerendah = saldo.length > 0 ? Math.min(...saldo) : data.pengaturan.saldoKas;
  const arusBersih = data.totalMasuk - data.totalKeluar;
  const kritis = saldoTerendah < data.pengaturan.saldoMinimum;
  const barisTampil = hanyaAktif
    ? data.baris.map((baris, i) => ({ baris, saldo: saldo[i] })).filter(
        ({ baris }) => baris.masuk !== 0 || baris.keluar !== 0,
      )
    : data.baris.map((baris, i) => ({ baris, saldo: saldo[i] }));

  const simpan = async () => {
    setMenyimpan(true);
    try {
      await simpanPengaturan({
        aktif,
        saldoKas: angkaDari(saldoTeks),
        saldoMinimum: angkaDari(minimumTeks),
        hariPeringatan,
        nomorWhatsApp: nomor.trim() === "" ? undefined : nomor.trim(),
      });
      toast.success("Pengaturan peringatan kas disimpan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengaturan gagal disimpan.");
    } finally {
      setMenyimpan(false);
    }
  };

  const tambah = async () => {
    setMenambahBiaya(true);
    try {
      await tambahBiaya({
        judul: judulBiaya,
        nominal: angkaDari(nominalBiaya),
        hariDalamBulan: Number(tanggalBiaya),
      });
      setJudulBiaya("");
      setNominalBiaya("");
      toast.success("Biaya operasional ditambahkan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Biaya gagal ditambahkan.");
    } finally {
      setMenambahBiaya(false);
    }
  };

  const ubah = async (baris: (typeof data.biaya)[number], perubahan: Partial<typeof baris>) => {
    try {
      await ubahBiaya({
        biayaId: baris.id as Id<"biayaOperasional">,
        judul: perubahan.judul ?? baris.judul,
        nominal: perubahan.nominal ?? baris.nominal,
        hariDalamBulan: perubahan.hariDalamBulan ?? baris.hariDalamBulan,
        aktif: perubahan.aktif ?? baris.aktif,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Biaya gagal diubah.");
    }
  };

  const hapus = async () => {
    if (targetHapus === null) return;
    setBusyHapus(true);
    try {
      await hapusBiaya({ biayaId: targetHapus.id });
      toast.success("Biaya dihapus.");
      setTargetHapus(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Biaya gagal dihapus.");
    } finally {
      setBusyHapus(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
              <BellRing className="size-4 text-primary" aria-hidden="true" />
              Peringatan kas otomatis
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Cron harian 07.30 WIB memeriksa proyeksi dan mengirim WhatsApp bila saldo
              diperkirakan turun di bawah ambang. Saldo lebih tua dari 3 hari tidak dipakai.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Switch checked={aktif} onCheckedChange={setAktif} aria-label="Aktifkan peringatan kas" />
            {aktif ? "Aktif" : "Nonaktif"}
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="kas-saldo">Saldo kas saat ini</Label>
            <Input
              id="kas-saldo"
              inputMode="numeric"
              className="mt-1 tabular-nums"
              placeholder="0"
              value={saldoTeks}
              onChange={(e) => setSaldoTeks(kelompokkanDigit(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="kas-minimum">Saldo minimum</Label>
            <Input
              id="kas-minimum"
              inputMode="numeric"
              className="mt-1 tabular-nums"
              placeholder="0"
              value={minimumTeks}
              onChange={(e) => setMinimumTeks(kelompokkanDigit(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="kas-hari">Rentang peringatan</Label>
            <Select
              value={String(hariPeringatan)}
              onValueChange={(nilai) => setHariPeringatan(Number(nilai))}
            >
              <SelectTrigger id="kas-hari" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PILIHAN_PERINGATAN.map((nilai) => (
                  <SelectItem key={nilai} value={String(nilai)}>
                    {nilai} hari ke depan
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="kas-nomor">WhatsApp admin</Label>
            <Input
              id="kas-nomor"
              inputMode="tel"
              className="mt-1"
              placeholder="+62 812 3456 7890"
              value={nomor}
              onChange={(e) => setNomor(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={simpan} disabled={menyimpan} className="gap-1.5">
            <Save className="size-4" aria-hidden="true" />
            {menyimpan ? "Menyimpan…" : "Simpan pengaturan"}
          </Button>
          <p className="text-[11px] text-slate-500">
            {data.pengaturan.saldoDiperbaruiPada === null
              ? "Saldo belum pernah disimpan."
              : `Saldo diperbarui ${formatTanggalWIB(data.pengaturan.saldoDiperbaruiPada)}.`}
            {data.peringatan[0] !== undefined
              ? ` Peringatan terakhir ${formatTanggalWIB(data.peringatan[0].tanggalKritis)}${data.peringatan[0].terkirim ? ", WhatsApp terkirim." : ", WhatsApp tidak terkirim."}`
              : ""}
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
              <CalendarRange className="size-4 text-primary" aria-hidden="true" />
              Kalender kas
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Proyeksi uang masuk dari angsuran dan uang keluar untuk siklus pendana serta biaya
              operasional berulang.
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

        {kritis && data.pengaturan.aktif && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900"
          >
            <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Saldo proyeksi turun di bawah minimum {formatRupiahAman(data.pengaturan.saldoMinimum)}{" "}
              dalam {data.hari} hari. Perkiraan terendah {formatRupiahAman(saldoTerendah)}.
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHanyaAktif((sebelumnya) => !sebelumnya)}
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
            detail={`${data.cakupan.siklus} siklus · ${data.cakupan.biaya} biaya`}
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
              saldoTerendah < 0 ? "kas tidak cukup pada satu hari" : "masih positif sepanjang rentang"
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

        {/* Tabel padat di layar lebar; kartu per hari di ponsel — pola yang
            sama dengan daftar nasabah, supaya angka tidak perlu digeser
            mendatar untuk dibaca. */}
        <div className="hidden max-h-[28rem] overflow-auto rounded-xl border border-slate-200 md:block">
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
                        {(baris.jumlahAngsuran > 0 ||
                          baris.jumlahSiklus > 0 ||
                          baris.jumlahBiaya > 0) && (
                          <span className="ml-1.5 text-[10px] text-slate-500">
                            {[
                              baris.jumlahAngsuran > 0 ? `${baris.jumlahAngsuran} angsuran` : "",
                              baris.jumlahSiklus > 0 ? `${baris.jumlahSiklus} siklus` : "",
                              baris.jumlahBiaya > 0 ? `${baris.jumlahBiaya} biaya` : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
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

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 md:hidden">
          {barisTampil.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-slate-500">
              Tidak ada jadwal masuk atau keluar dalam rentang ini.
            </li>
          ) : (
            barisTampil.map(({ baris, saldo: saldoHari }) => {
              const net = baris.masuk - baris.keluar;
              return (
                <li
                  key={baris.tanggal}
                  className={cn("px-3 py-2.5", saldoHari < 0 && "bg-rose-50/60")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">
                      {formatTanggalWIB(baris.tanggal, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        saldoHari < 0 ? "text-rose-800" : "text-slate-900",
                      )}
                    >
                      {formatRupiahAman(saldoHari)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {[
                      baris.jumlahAngsuran > 0 ? `${baris.jumlahAngsuran} angsuran` : "",
                      baris.jumlahSiklus > 0 ? `${baris.jumlahSiklus} siklus` : "",
                      baris.jumlahBiaya > 0 ? `${baris.jumlahBiaya} biaya` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "tanpa transaksi"}
                  </p>
                  <dl className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <dt className="text-slate-500">Masuk</dt>
                      <dd className="tabular-nums text-emerald-800">
                        {baris.masuk > 0 ? formatRupiahAman(baris.masuk) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Keluar</dt>
                      <dd className="tabular-nums text-rose-800">
                        {baris.keluar > 0 ? formatRupiahAman(baris.keluar) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Net</dt>
                      <dd className={cn("tabular-nums", net < 0 ? "text-rose-800" : "text-slate-700")}>
                        {net === 0 ? "—" : formatRupiahAman(net)}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })
          )}
        </ul>

        <p className="text-[11px] leading-5 text-slate-500">
          Cakupan: angsuran pinjaman tunai yang belum dibayar, siklus pendana berstatus berjalan,
          dan biaya operasional aktif. Belum termasuk gadai, kredit barang, akad syariah, dan denda
          — barisnya tidak menyimpan tanggal jatuh tempo.
          {data.dibatasi
            ? " Sebagian data melewati batas baca; angka bisa lebih besar dari yang tampil."
            : ""}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-semibold text-navy">Biaya operasional berulang</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Biaya tetap yang jatuh pada tanggal yang sama tiap bulan. Tanggal 29–31 digeser ke hari
          terakhir bulan pendek. Biaya di sini hanya untuk proyeksi, bukan catatan pembayaran.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_auto]">
          <div>
            <Label htmlFor="biaya-judul" className="text-[11px]">
              Nama biaya
            </Label>
            <Input
              id="biaya-judul"
              value={judulBiaya}
              onChange={(e) => setJudulBiaya(e.target.value)}
              placeholder="Sewa kantor, gaji, server…"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="biaya-nominal" className="text-[11px]">
              Nominal
            </Label>
            <Input
              id="biaya-nominal"
              inputMode="numeric"
              value={nominalBiaya}
              onChange={(e) => setNominalBiaya(kelompokkanDigit(e.target.value))}
              placeholder="0"
              className="mt-1 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="biaya-tanggal" className="text-[11px]">
              Tanggal
            </Label>
            <Input
              id="biaya-tanggal"
              type="number"
              min={1}
              max={31}
              value={tanggalBiaya}
              onChange={(e) => setTanggalBiaya(e.target.value)}
              className="mt-1 tabular-nums"
            />
          </div>
          <Button
            type="button"
            onClick={tambah}
            disabled={menambahBiaya || judulBiaya.trim().length < 3 || angkaDari(nominalBiaya) <= 0}
            className="mt-5 gap-1.5"
          >
            <Plus className="size-4" aria-hidden="true" />
            {menambahBiaya ? "Menambah…" : "Tambah"}
          </Button>
        </div>

        {data.biaya.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
            Belum ada biaya operasional. Proyeksi saat ini hanya memuat angsuran dan siklus pendana.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {data.biaya.map((baris) => (
              <li
                key={baris.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                  {baris.judul}
                </span>
                <span className="tabular-nums text-slate-600">
                  {formatRupiahAman(baris.nominal)}
                </span>
                <span className="text-slate-500">tgl {baris.hariDalamBulan}</span>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <Switch
                    checked={baris.aktif}
                    onCheckedChange={(nilai) => void ubah(baris, { aktif: nilai })}
                    aria-label={`Aktifkan ${baris.judul}`}
                  />
                  {baris.aktif ? "Aktif" : "Nonaktif"}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-rose-700 hover:bg-rose-50"
                  onClick={() =>
                    setTargetHapus({
                      id: baris.id as Id<"biayaOperasional">,
                      judul: baris.judul,
                    })
                  }
                  aria-label={`Hapus ${baris.judul}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <KonfirmasiAksi
        open={targetHapus !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka && !busyHapus) setTargetHapus(null);
        }}
        judul="Hapus biaya operasional?"
        deskripsi={
          <>
            Biaya <strong className="text-navy">{targetHapus?.judul}</strong> akan
            dihapus dari proyeksi kas. Tindakan ini tidak bisa dibatalkan.
          </>
        }
        labelKonfirmasi="Hapus biaya"
        busy={busyHapus}
        onConfirm={() => void hapus()}
      />
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
