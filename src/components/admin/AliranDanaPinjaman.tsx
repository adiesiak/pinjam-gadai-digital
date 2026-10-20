import { Coins } from "lucide-react";

import { IstilahBantuan } from "@/components/penyediaDana/IstilahBantuan";
import { MetrikKartu } from "./admin-shared";
import { formatRupiah } from "@/lib/money";
import {
  barisRincianAliran,
  labelPotonganRincian,
  rincianPinjamanNyata,
} from "@/lib/rincianAliranDana";

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
 * Tata letak: matriksnya RAPAT empat kolom di desktop (dua di ponsel) tanpa
 * gulir horizontal, dan setiap kartu memakai permukaan kaca yang menyala tepinya
 * saat disorot — angka yang paling sering dibandingkan admin jadi mudah
 * dipindai mata.
 */
export function AliranDanaPinjaman({
  pokokPinjaman,
  tenorBulan = null,
  tenorHari = null,
  persenBunga = null,
  sudahLunas = false,
  persenPotonganPenyedia,
}: {
  pokokPinjaman: number;
  /** Terisi = skema bulanan; Imbal Hasil dihitung dari tenor penuhnya. */
  tenorBulan?: number | null;
  tenorHari?: number | null;
  persenBunga?: number | null;
  /** Pinjaman sudah dilunasi → angka ini yang dibukukan, bukan proyeksi. */
  sudahLunas?: boolean;
  persenPotonganPenyedia?: number;
}) {
  const rincian = rincianPinjamanNyata(
    { pokokPinjaman, tenorBulan, persenBunga },
    persenPotonganPenyedia,
  );
  const baris = barisRincianAliran(rincian, { tenorBulan });
  const skema =
    tenorBulan === null
      ? `skema harian${tenorHari === null ? "" : ` ${tenorHari} hari`}`
      : `skema bulanan ${tenorBulan} bulan`;

  return (
    <section
      aria-label="Aliran uang pinjaman ini"
      className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-xs backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">Aliran uang pinjaman ini</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Pokok {formatRupiah(rincian.pokok)} · {skema} · dipotong admin{" "}
            {rincian.persenPotonganDiMuka}%{tenorBulan === null ? " + biaya ekspres" : ""} di muka
            <IstilahBantuan
              istilah="potongan di muka"
              penjelasan="Dipotong sekali di awal dari pokok pinjaman (biaya admin, plus biaya pencairan ekspres pada pinjaman harian), sehingga dana yang cair ke peminjam lebih kecil dari pokok."
            />
            , lalu {rincian.persenPotonganPenyedia}% dari uang yang kembali.
          </p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
          <Coins className="size-4" />
        </span>
      </div>

      <dl className="mb-6 mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {baris.map((b) => (
          <MetrikKartu
            key={b.label}
            // Permukaan kaca di atas latar buram modal; tepinya menyala emerald
            // saat disorot supaya kartu yang sedang dibaca jelas.
            className="border-slate-200/80 bg-white/80 shadow-xs backdrop-blur-md transition-all duration-[var(--motion-normal)] hover:border-emerald-500/40"
            label={b.label}
            nilai={
              b.arah === "potongan" ? (
                <span className="text-amber-700">{labelPotonganRincian(b.nilai)}</span>
              ) : (
                formatRupiah(b.nilai)
              )
            }
          />
        ))}
      </dl>

      <p className="text-[11px] leading-4 text-muted-foreground">
        {sudahLunas
          ? "Pinjaman sudah lunas: angka ini yang dicatat internal saat pelunasan."
          : "Proyeksi kebijakan yang berlaku; yang dicatat internal adalah angka saat pelunasan."}
      </p>
    </section>
  );
}
