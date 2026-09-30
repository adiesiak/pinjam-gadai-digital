/**
 * PINDAI — Kalkulator skema gadai internal (jaminan / LTV 70%).
 *
 * Guardrail Rule 3: semua uang integer rupiah, pembulatan HALF-UP via
 * percentOf (BigInt) — tanpa floating-point error.
 *
 * Aturan bisnis (MASTER PROMPT §2 SKEMA B):
 *  - Batas pinjaman = LTV maks 70% dari harga pasar second.
 *  - Potongan muka 1% (bukan penerimaan atau biaya aktual).
 *  - Nilai bersih = 99% dari pokok acuan gadai.
 *  - Sewa modal 5%-10% per 30 hari, dihitung dari sisa pokok
 *    terbaru (decreasing principal basis): cicil pokok → sewa bulan
 *    berikutnya otomatis turun.
 *  - Sisa pokok = Rp0 → status internal SIAP_DIAMBIL (bukan bukti penyimpanan/pengembalian barang).
 */
import { percentOf, type Rupiah } from "./money";

export const GADAI_PRICING = {
  /** Potongan muka internal: 1%. */
  upfrontDeductionPercent: 1,
  /** Nilai bersih: 99% dari pokok acuan. */
  netDisbursementPercent: 99,
  /** Sewa modal minimum per 30 hari (% dari sisa pokok). */
  sewaModalMinPercent: 5,
  /** Sewa modal maksimum per 30 hari (% dari sisa pokok). */
  sewaModalMaxPercent: 10,
  /** LTV maksimum dari harga pasar second. */
  ltvMaxPercent: 70,
  /** Hari satu periode sewa modal. */
  periodeHari: 30,
} as const;

/** Batas hitung internal gadai = 70% harga pasar yang dicantumkan (rupiah bulat). */
export function limitPinjamanGadai(hargaPasar: Rupiah): Rupiah {
  return percentOf(hargaPasar, GADAI_PRICING.ltvMaxPercent);
}

export interface GadaiQuote {
  /** Pokok acuan gadai. */
  pokok: Rupiah;
  /** Potongan muka 1%. */
  potonganDiMuka: Rupiah;
  /** Nilai bersih: 99%. */
  danaBersihDitransfer: Rupiah;
  /** Sewa modal periode pertama: persen × pokok acuan. */
  sewaModalPeriode: Rupiah;
  /** Persen sewa modal yang dipakai (5–10). */
  persenSewaModal: number;
  /** Total kewajiban awal = pokok acuan + sewa modal periode pertama. */
  totalKewajibanAwal: Rupiah;
}

/** Quote gadai — validasi persen sewa 5–10 & pokok positif. */
export function quoteGadai(pokok: Rupiah, persenSewaModal: number): GadaiQuote {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error("Pokok gadai harus rupiah bulat positif.");
  }
  if (
    !Number.isFinite(persenSewaModal) ||
    persenSewaModal < GADAI_PRICING.sewaModalMinPercent ||
    persenSewaModal > GADAI_PRICING.sewaModalMaxPercent
  ) {
    throw new Error(
      `Sewa modal harus ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per 30 hari.`,
    );
  }
  const potonganDiMuka = percentOf(pokok, GADAI_PRICING.upfrontDeductionPercent);
  const danaBersihDitransfer = pokok - potonganDiMuka;
  const sewaModalPeriode = percentOf(pokok, persenSewaModal);
  return {
    pokok,
    potonganDiMuka,
    danaBersihDitransfer,
    sewaModalPeriode,
    persenSewaModal,
    totalKewajibanAwal: pokok + sewaModalPeriode,
  };
}

/**
 * Sewa modal periode berikutnya — DECREASING PRINCIPAL BASIS:
 * dihitung dari sisa pokok TERBARU, bukan pokok awal. Cicil pokok,
 * sewa otomatis menurun. Sisa pokok 0 → sewa 0 (status ledger lunas).
 */
export function sewaModalBerikutnya(
  sisaPokok: Rupiah,
  persenSewaModal: number,
): Rupiah {
  if (sisaPokok === 0) return 0;
  if (!Number.isSafeInteger(sisaPokok) || sisaPokok < 0) {
    throw new Error("Sisa pokok tidak valid.");
  }
  if (
    !Number.isFinite(persenSewaModal) ||
    persenSewaModal < GADAI_PRICING.sewaModalMinPercent ||
    persenSewaModal > GADAI_PRICING.sewaModalMaxPercent
  ) {
    throw new Error(
      `Sewa modal harus ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per 30 hari.`,
    );
  }
  return percentOf(sisaPokok, persenSewaModal);
}

/** Status turunan perhitungan ledger; bukan status penitipan atau kondisi fisik barang. */
export type GadaiCustodyStatus =
  | "DALAM_VAULT" // label historis: masih ada sisa pokok tercatat
  | "SIAP_DIAMBIL"; // label historis saat sisa pokok tercatat Rp0

export function statusCustody(sisaPokok: Rupiah): GadaiCustodyStatus {
  return sisaPokok <= 0 ? "SIAP_DIAMBIL" : "DALAM_VAULT";
}

export interface GadaiBayarResult {
  /** Pokok yang diasumsikan dicicil pada periode ini. */
  pokokDicicil: Rupiah;
  /** Sewa modal pada periode ini. */
  sewaDibayar: Rupiah;
  /** Total rupiah pada periode ini. */
  totalBayar: Rupiah;
  /** Sisa pokok setelah pembayaran. */
  sisaPokokSetelah: Rupiah;
  /** Sewa modal periode berikutnya (dari sisa pokok terbaru). */
  sewaModalBerikut: Rupiah;
  /** Penanda status ledger. */
  custody: GadaiCustodyStatus;
}

/**
 * Kalkulasi satu periode gadai (bukan mutasi atau bukti pembayaran):
 * - Bila `bayarHanyaSewa`: ilustrasikan sewa modal saja + perpanjangan tenor.
 * - Selain itu: ilustrasikan cicil pokok ditambah sewa modal.
 * Validasi: cicilan tidak melebihi sisa pokok tercatat.
 */
export function rencanaBayarGadai(
  sisaPokok: Rupiah,
  persenSewaModal: number,
  opts: { cicilPokok?: Rupiah; bayarHanyaSewa?: boolean },
): GadaiBayarResult {
  if (!Number.isSafeInteger(sisaPokok) || sisaPokok < 0) {
    throw new Error("Sisa pokok tidak valid.");
  }
  if (sisaPokok === 0) {
    throw new Error("Pokok sudah habis pada hitungan; perbarui data pengajuan untuk melanjutkan.");
  }
  const sewa = sewaModalBerikutnya(sisaPokok, persenSewaModal);

  let cicil = 0;
  if (opts.bayarHanyaSewa !== true) {
    const minta = opts.cicilPokok ?? 0;
    if (!Number.isSafeInteger(minta) || minta < 0) {
      throw new Error("Jumlah cicilan pokok tidak valid.");
    }
    if (minta > sisaPokok) {
      throw new Error(
        `Cicilan melebihi sisa pokok ${sisaPokok}. Maksimal ${sisaPokok}.`,
      );
    }
    cicil = minta;
  }

  const sisaPokokSetelah = sisaPokok - cicil;
  return {
    pokokDicicil: cicil,
    sewaDibayar: sewa,
    totalBayar: cicil + sewa,
    sisaPokokSetelah,
    sewaModalBerikut: sewaModalBerikutnya(sisaPokokSetelah, persenSewaModal),
    custody: statusCustody(sisaPokokSetelah),
  };
}

/** Proyeksi tabel (untuk kalkulator/jadwal): N periode, tanpa mutasi ledger. */
export interface GadaiJadwalRow {
  periode: number;
  sisaPokokAwal: Rupiah;
  cicilPokok: Rupiah;
  sewaModal: Rupiah;
  sisaPokokAkhir: Rupiah;
  custody: GadaiCustodyStatus;
}

/**
 * Proyeksi jadwal jika pokok `cicilPerPeriode` diasumsikan berkurang setiap
 * 30 hari (berhenti saat habis). Hanya ilustrasi; bukan tagihan atau rencana
 * pembayaran yang diproses.
 */
export function proyeksiJadwalGadai(
  pokok: Rupiah,
  persenSewaModal: number,
  cicilPerPeriode: Rupiah,
  maxPeriode = 12,
): GadaiJadwalRow[] {
  const rows: GadaiJadwalRow[] = [];
  let sisa = pokok;
  for (let p = 1; p <= maxPeriode && sisa > 0; p++) {
    const cicil = Math.min(cicilPerPeriode, sisa);
    const sewa = sewaModalBerikutnya(sisa, persenSewaModal);
    const akhir = sisa - cicil;
    rows.push({
      periode: p,
      sisaPokokAwal: sisa,
      cicilPokok: cicil,
      sewaModal: sewa,
      sisaPokokAkhir: akhir,
      custody: statusCustody(akhir),
    });
    sisa = akhir;
  }
  return rows;
}
