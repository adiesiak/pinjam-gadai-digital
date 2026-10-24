import { Coins } from "lucide-react";

import type { TarifBiaya } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import {
  labelPotonganRincian,
  rincianPinjamanNyata,
} from "@/lib/rincianAliranDana";
import { cn } from "@/lib/utils";

/**
 * Kotak label + nominal untuk satu angka aliran dana.
 * Label selalu kecil & huruf besar, nominal selalu tebal — supaya mata
 * membandingkan angka, bukan membaca kalimat.
 */
function KotakNilai({
  label,
  nilai,
  keterangan,
  kelas,
  kelasLabel,
  kelasNilai,
  kelasKeterangan,
}: {
  label: string;
  nilai: string;
  keterangan?: string;
  kelas?: string;
  kelasLabel?: string;
  kelasNilai?: string;
  kelasKeterangan?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white px-3 py-2.5", kelas)}>
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500",
          kelasLabel,
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-base font-bold leading-tight tabular-nums text-slate-900",
          kelasNilai,
        )}
      >
        {nilai}
      </p>
      {keterangan !== undefined && (
        <p className={cn("mt-0.5 text-[11px] leading-4 text-slate-500", kelasKeterangan)}>
          {keterangan}
        </p>
      )}
    </div>
  );
}

/**
 * Aliran uang satu pinjaman NYATA di detail pinjaman admin.
 *
 * Komponen ini sengaja presentasional: seluruh angkanya datang dari
 * `lib/rincianAliranDana` → `lib/bagiHasil.ts`, mesin yang sama dengan yang
 * menagih Peminjam dan mencatat internal saat pelunasan. Tidak ada rumus uang
 * di dalam JSX, sehingga panel tidak bisa menampilkan angka yang berbeda dari
 * yang benar-benar dibayarkan.
 *
 * Kejujuran status: selama pinjaman belum lunas, angkanya adalah proyeksi
 * kebijakan yang berlaku — bukan dana yang sudah berpindah. Karena itu
 * `sudahLunas` mengubah keterangannya, bukan angkanya.
 *
 * Tata letak: dua grup yang mencerminkan dua sisi transaksi — uang yang masuk
 * ke peminjam, lalu uang yang kembali ke pendana & platform. Dana bersih
 * peminjam adalah satu-satunya kartu pejal (emerald) supaya angka yang paling
 * sering ditanyakan nasabah langsung terlihat; sisanya kartu putih tenang.
 */
export function AliranDanaPinjaman({
  pokokPinjaman,
  tenorBulan = null,
  tenorHari = null,
  persenBunga = null,
  cairEkspres = null,
  tarifBiaya = null,
  sudahLunas = false,
  persenPotonganPenyedia,
}: {
  pokokPinjaman: number;
  /** Centang cair ekspres peminjam; null = data lama (ekspres dipakai). */
  cairEkspres?: boolean | null;
  /** Snapshot tarif potongan di muka; null = tarif bawaan. */
  tarifBiaya?: Partial<TarifBiaya> | null;
  /** Terisi = skema bulanan; Imbal Hasil dihitung dari tenor penuhnya. */
  tenorBulan?: number | null;
  tenorHari?: number | null;
  persenBunga?: number | null;
  /** Pinjaman sudah dilunasi → angka ini yang dibukukan, bukan proyeksi. */
  sudahLunas?: boolean;
  persenPotonganPenyedia?: number;
}) {
  const rincian = rincianPinjamanNyata(
    { pokokPinjaman, tenorBulan, persenBunga, cairEkspres, tarifBiaya },
    persenPotonganPenyedia,
  );
  const skema =
    tenorBulan === null
      ? `harian${tenorHari === null ? "" : ` ${tenorHari} hari`}`
      : `bulanan ${tenorBulan} bulan`;
  const kembali =
    tenorBulan === null
      ? `Imbal Hasil ${rincian.persenImbalHasil}%`
      : `Imbal Hasil ${tenorBulan} bulan @${rincian.persenImbalHasil}%`;

  return (
    <section
      aria-label="Aliran uang pinjaman ini"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
            <Coins className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Aliran uang pinjaman ini</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              Skema {skema} · dipotong admin {rincian.persenPotonganDiMuka}%
              {rincian.adaEkspres ? " + biaya ekspres" : ""} di muka
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            sudahLunas
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-600",
          )}
        >
          {sudahLunas ? "Sudah dibukukan" : "Proyeksi"}
        </span>
      </header>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {/* ── Grup A: uang yang masuk ke peminjam ───────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Sisi peminjam
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <KotakNilai label="Pokok pinjaman" nilai={formatRupiah(rincian.pokok)} />
            <KotakNilai
              label="Potongan di muka"
              nilai={labelPotonganRincian(rincian.potonganDiMuka)}
              keterangan={`Admin ${rincian.persenPotonganDiMuka}%${
                rincian.biayaAsuransi > 0 ? " + asuransi" : ""
              }${rincian.adaEkspres ? " + ekspres" : ""}`}
              kelas="border-red-200/80 bg-red-50/70"
              kelasLabel="text-red-700"
              kelasNilai="text-red-600"
              kelasKeterangan="text-red-700/80"
            />
          </div>
          <div className="mt-2.5 rounded-xl bg-emerald-700 px-4 py-3.5 text-white shadow-sm ring-1 ring-emerald-800/20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-50">
              Dana bersih diterima peminjam
            </p>
            <p className="mt-1 text-2xl font-bold leading-tight tabular-nums">
              {formatRupiah(rincian.diterimaPeminjam)}
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-100">
              Pokok dikurangi potongan di muka
            </p>
          </div>
        </div>

        {/* ── Grup B: uang yang kembali ke pendana & platform ───────────── */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Pelunasan &amp; pendana
          </p>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-700">
              Total pelunasan
            </p>
            <p className="mt-1 text-2xl font-bold leading-tight tabular-nums text-[#0F172A]">
              {formatRupiah(rincian.totalKembali)}
            </p>
            <p className="mt-0.5 text-[11px] text-blue-700/80">
              Pokok + {kembali}
            </p>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <KotakNilai
              label="Diterima pendana"
              nilai={formatRupiah(rincian.diterimaPenyedia)}
              keterangan={`${labelPotonganRincian(rincian.potonganPenyedia)} · potongan ${rincian.persenPotonganPenyedia}% dari pokok`}
            />
            <KotakNilai
              label="Imbal Hasil bersih pendana"
              nilai={formatRupiah(rincian.imbalBersihPenyedia)}
            />
          </div>
          <div className="mt-2.5">
            <KotakNilai
              label="Pendapatan platform"
              nilai={formatRupiah(rincian.pendapatanPlatform)}
              keterangan={`Potongan di muka + potongan ${rincian.persenPotonganPenyedia}%`}
            />
          </div>
        </div>
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] leading-4 text-slate-500">
        {sudahLunas
          ? "Pinjaman sudah lunas: angka ini yang dicatat internal saat pelunasan."
          : "Proyeksi kebijakan yang berlaku; yang dicatat internal adalah angka saat pelunasan."}
        {" "}Pencatatan internal — perpindahan dana ditangani di luar aplikasi.
      </p>
    </section>
  );
}
