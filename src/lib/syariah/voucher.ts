/**
 * Voucher akad SYARIAH — potongan ujrah dan margin.
 *
 * Aturan produk:
 *  - Voucher hanya boleh memotong porsi PLATFORM (ujrah pengelola). Hak
 *    Shahibul Maal (pendana) tidak pernah berkurang karena voucher: 85% dari
 *    margin/ujrah tetap dihitung dari nilai SEBELUM potongan, dan potongan
 *    dibatasi maksimum sebesar porsi platform.
 *  - `diskon_margin` memotong margin akad Murabahah/Qardh; `diskon_ujrah`
 *    memotong ujrah Rahn. Voucher biaya admin dan boost limit bukan aturan
 *    syariah dan ditolak di sini.
 *  - Tidak ada bunga atau denda dalam perhitungan ini; istilah yang dipakai
 *    hanya margin, ujrah, dan nisbah.
 *
 * Semua nilai rupiah bulat.
 */
import { formatRupiah, type Rupiah } from "../money";
import {
  bagiNisbah,
  floorPersen,
  NISBAH_PLATFORM_PERSEN,
  pastikanRupiah,
  type BagiNisbah,
} from "./nisbah";
import type { JenisVoucher } from "../voucher";

/** Jenis voucher yang sah untuk akad syariah. */
export const JENIS_VOUCHER_SYARIAH = ["diskon_ujrah", "diskon_margin"] as const;
export type JenisVoucherSyariah = (typeof JENIS_VOUCHER_SYARIAH)[number];

export function apakahVoucherSyariah(jenis: JenisVoucher): jenis is JenisVoucherSyariah {
  return (JENIS_VOUCHER_SYARIAH as readonly string[]).includes(jenis);
}

export type RincianVoucherSyariah = {
  /** Margin akad sebelum potongan. */
  marginTotal: Rupiah;
  /** Ujrah akad sebelum potongan. */
  ujrahTotal: Rupiah;
  /** Dasar yang dipotong: margin atau ujrah. */
  dasar: Rupiah;
  /** Batas potongan: porsi platform (15%) dari dasar. */
  batasPlatform: Rupiah;
  /** Potongan yang benar-benar berlaku. */
  diskon: Rupiah;
  marginSetelah: Rupiah;
  ujrahSetelah: Rupiah;
  /** Hak pendana — dihitung dari nilai SEBELUM potongan. */
  nisbahPendana: Rupiah;
  /** Hak platform setelah menanggung voucher. */
  nisbahPlatform: Rupiah;
  /** Pokok + margin/ujrah setelah potongan. */
  totalKewajiban: Rupiah;
  /** Pokok kembali utuh ke pendana. */
  pendanaTerima: Rupiah;
};

/**
 * Hitung potongan voucher syariah.
 *
 * `nilai` voucher dibatasi `batasPlatform`: voucher Rp100.000 pada akad dengan
 * margin Rp1.000.000 (porsi platform Rp150.000) berlaku penuh, sedangkan pada
 * margin Rp100.000 (porsi platform Rp15.000) hanya Rp15.000 yang terpakai.
 */
export function rincianVoucherSyariah({
  pokok,
  marginTotal = 0,
  ujrahTotal = 0,
  voucher,
}: {
  pokok: Rupiah;
  marginTotal?: Rupiah;
  ujrahTotal?: Rupiah;
  voucher: { jenis: JenisVoucher; nilai: Rupiah } | null;
}): RincianVoucherSyariah {
  pastikanRupiah(pokok, "Pokok");
  pastikanRupiah(marginTotal, "Margin");
  pastikanRupiah(ujrahTotal, "Ujrah");

  const jenis = voucher?.jenis ?? null;
  if (jenis !== null && !apakahVoucherSyariah(jenis)) {
    throw new Error(
      `Voucher ${jenis} bukan voucher akad syariah. Pilih potongan ujrah atau margin.`,
    );
  }

  const dasar =
    jenis === "diskon_margin" ? marginTotal : jenis === "diskon_ujrah" ? ujrahTotal : 0;
  const batasPlatform = floorPersen(dasar, NISBAH_PLATFORM_PERSEN);
  const diminta = voucher === null ? 0 : Math.max(0, Math.floor(voucher.nilai));
  const diskon = Math.min(diminta, batasPlatform) as Rupiah;

  const marginSetelah = (marginTotal - (jenis === "diskon_margin" ? diskon : 0)) as Rupiah;
  const ujrahSetelah = (ujrahTotal - (jenis === "diskon_ujrah" ? diskon : 0)) as Rupiah;

  // Hak pendana dari nilai SEBELUM potongan — voucher dibebankan ke platform.
  const bagiMargin: BagiNisbah = bagiNisbah(marginTotal);
  const bagiUjrah: BagiNisbah = bagiNisbah(ujrahTotal);
  const nisbahPendana = (bagiMargin.nisbahPendana + bagiUjrah.nisbahPendana) as Rupiah;
  const nisbahPlatform = (bagiMargin.nisbahPlatform + bagiUjrah.nisbahPlatform - diskon) as Rupiah;

  return {
    marginTotal,
    ujrahTotal,
    dasar: dasar as Rupiah,
    batasPlatform,
    diskon,
    marginSetelah,
    ujrahSetelah,
    nisbahPendana,
    nisbahPlatform,
    totalKewajiban: (pokok + marginSetelah + ujrahSetelah) as Rupiah,
    pendanaTerima: (pokok + nisbahPendana) as Rupiah,
  };
}

/** Kalimat ringkas untuk layar: berapa yang dipotong dan apa batasnya. */
export function kalimatVoucherSyariah(rincian: RincianVoucherSyariah): string {
  if (rincian.diskon === 0) {
    return "Pilih voucher untuk melihat potongan ujrah atau margin.";
  }
  return `Voucher memotong ${formatRupiah(rincian.diskon)} dari porsi pengelola. Nisbah pendana 85% tetap dihitung dari nilai sebelum potongan.`;
}
