/**
 * Angka utama tiap kartu layanan beranda.
 *
 * Kartu layanan sebelumnya hanya berisi judul, ringkasan, dan satu baris kecil
 * berisi tenor, sehingga tiga kartu tampak seragam padahal isinya berbeda
 * tajam. Angka besar di kartu diambil dari konstanta mesin yang sama dengan
 * formulir dan kalkulator, bukan ditulis ulang di komponen: kalau tenor atau
 * LTV berubah, kartu ikut berubah tanpa ada klaim yang tertinggal.
 */
import { TENOR_BULANAN_OPTIONS } from "./bulanan";
import { GADAI_PRICING } from "./gadai";
import { KREDIT_TENOR_PENGAJUAN_OPTIONS } from "./kredit";
import { TENOR_HARIAN_MAKS, TENOR_OPTIONS } from "./loan";

export type SorotanLayanan = {
  /** Angka besar, mis. `7–50` atau `70%`. */
  angka: string;
  /** Satuan yang menempel pada angka besar. */
  satuan: string;
  /** Satu label pendek yang menerangkan angka itu. */
  label: string;
};

const TENOR_HARIAN = `${TENOR_OPTIONS[0]}–${TENOR_HARIAN_MAKS}`;
const TENOR_BULANAN = TENOR_BULANAN_OPTIONS.join("/");
const TENOR_KREDIT = KREDIT_TENOR_PENGAJUAN_OPTIONS.join("/");

/** Urutannya sejajar dengan `HREF_LAYANAN` dan `KONTEN_LANDING_DEFAULT.layanan`. */
export const SOROTAN_LAYANAN: readonly SorotanLayanan[] = [
  {
    angka: TENOR_HARIAN,
    satuan: "hari",
    label: `Tenor harian, atau ${TENOR_BULANAN} bulan`,
  },
  {
    angka: `${GADAI_PRICING.ltvMaxPercent}%`,
    satuan: "harga pasar",
    label: `Sewa modal ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per ${GADAI_PRICING.periodeHari} hari`,
  },
  {
    angka: TENOR_KREDIT,
    satuan: "bulan",
    label: "Tenor cicilan barang",
  },
];
