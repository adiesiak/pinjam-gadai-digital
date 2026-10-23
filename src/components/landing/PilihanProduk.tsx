/**
 * Dua pilihan produk: konvensional dan syariah.
 *
 * Komponen ini dipakai di beranda (dengan kepala bagian) dan di dashboard
 * peminjam (tanpa kepala). Tujuannya satu: pemisahan jalur yang tegas sebelum
 * pengguna masuk ke formulir, supaya tidak ada pencampuran istilah dan angka.
 *
 * Di dashboard, kartu yang sama menjadi tombol pemilih jalur: peminjam memilih
 * konvensional atau syariah sebelum formulirnya muncul. Di beranda dan ruang
 * pendana, kartunya tetap menjadi tautan bacaan.
 */
import { ArrowRight, HandCoins, Info, Package, Wallet } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

const SOROTAN_KONVENSIONAL = [
  "Tenor harian 7, 14, atau 28 hari",
  "Cicilan bulanan 1, 3, atau 6 bulan",
  "Biaya admin 2% dipotong di muka",
];

const AKAD_SYARIAH = [
  { ikon: Package, judul: "Murabahah", isi: "Kredit barang, margin 85 : 15" },
  {
    ikon: HandCoins,
    judul: "Rahn",
    isi: "Gadai, ujrah 2% per 30 hari",
  },
  { ikon: Wallet, judul: "Qardh", isi: "Pinjaman kebajikan, margin 0%" },
];

export function PilihanProduk({
  className,
  ringkas = false,
  aktif,
  onPilih,
}: {
  className?: string;
  /** Versi untuk dashboard: satu kalimat per produk, tanpa daftar rinci. */
  ringkas?: boolean;
  /** Jalur yang sedang dipakai formulir; hanya berarti bila `onPilih` diisi. */
  aktif?: "konvensional" | "syariah";
  /** Bila diisi, kartu menjadi tombol pemilih jalur, bukan tautan bacaan. */
  onPilih?: (jalur: "konvensional" | "syariah") => void;
}) {
  return (
    <div className={cn("grid gap-3 md:grid-cols-2", className)}>
      <article
        className={cn(
          "flex h-full flex-col rounded-kartu border border-emerald-200 bg-white p-4 sm:p-5",
          onPilih !== undefined &&
            aktif === "konvensional" &&
            "border-emerald-700 ring-2 ring-emerald-700/15",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <Wallet className="size-4" aria-hidden />
          </span>
          <h3 className="text-base font-semibold text-navy">
            Pembiayaan konvensional
          </h3>
        </div>
        <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
          Bunga flat dan biaya di muka yang tertera sebelum akad.
        </p>
        {ringkas ? (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Harian 7/14/28 hari atau cicilan 1/3/6 bulan.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {SOROTAN_KONVENSIONAL.map((baris) => (
              <li
                key={baris}
                className="flex items-start gap-2 text-xs leading-5 text-slate-700"
              >
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-700"
                />
                {baris}
              </li>
            ))}
          </ul>
        )}
        {onPilih === undefined ? (
          <Link
            to="/pinjaman/konvensional"
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:text-emerald-900 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Lihat produk konvensional
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            aria-pressed={aktif === "konvensional"}
            onClick={() => onPilih("konvensional")}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg text-sm font-semibold text-emerald-800 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {aktif === "konvensional" ? "Jalur konvensional dipilih" : "Pilih konvensional"}
            <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </article>

      <article
        className={cn(
          "flex h-full flex-col rounded-kartu border border-[#c9a86a]/50 bg-[#fbf7ec] p-4 sm:p-5",
          onPilih !== undefined &&
            aktif === "syariah" &&
            "border-amber-700 ring-2 ring-amber-700/20",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
            <HandCoins className="size-4" aria-hidden />
          </span>
          <h3 className="text-base font-semibold text-navy">
            Pembiayaan syariah
          </h3>
        </div>
        <p className="mt-2 flex-1 text-sm leading-6 text-slate-700">
          Tiga akad dengan margin dan ujrah yang disepakati.
        </p>
        {ringkas ? (
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Murabahah, Rahn, dan Qardh.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {AKAD_SYARIAH.map((akad) => (
              <li
                key={akad.judul}
                className="flex items-start gap-2 text-xs leading-5 text-slate-700"
              >
                <akad.ikon className="mt-0.5 size-3.5 shrink-0 text-amber-800" aria-hidden />
                <span>
                  <strong className="font-semibold text-slate-900">
                    {akad.judul}
                  </strong>
                  {": "}
                  {akad.isi}
                </span>
              </li>
            ))}
          </ul>
        )}
        {onPilih === undefined ? (
          <Link
            to="/pinjaman/syariah"
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-amber-900 hover:text-amber-950 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Baca akad syariah
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            aria-pressed={aktif === "syariah"}
            onClick={() => onPilih("syariah")}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg text-sm font-semibold text-amber-900 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {aktif === "syariah" ? "Jalur syariah dipilih" : "Pilih syariah"}
            <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
        {!ringkas && onPilih === undefined && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-amber-900/80">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            Pengajuan akad syariah dibuka dari dashboard setelah Anda masuk.
          </p>
        )}
      </article>
    </div>
  );
}

/** Bagian beranda: kepala singkat, lalu dua kartu produk. */
export function PilihanProdukSection() {
  return (
    <section
      aria-labelledby="pilihan-produk-title"
      className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="pilihan-produk-title"
            className="text-2xl font-semibold tracking-tight text-navy"
          >
            Dua jalur pembiayaan, dipisah sejak awal
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Produk konvensional dan syariah punya aturan, dokumen, dan
            kalkulator sendiri. Pilih jalurnya sebelum mengajukan.
          </p>
        </div>
        <Link
          to="/biaya"
          className="min-h-11 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Bandingkan biaya
        </Link>
      </div>
      <PilihanProduk className="mt-5" />
    </section>
  );
}
