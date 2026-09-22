/**
 * PINDAI — Engine Skema B: GADAI DIGITAL (Berjaminan / LTV 70%).
 *
 * Guardrail Rule 3: semua uang integer rupiah, pembulatan HALF-UP via
 * percentOf (BigInt) — tanpa floating-point error.
 *
 * Aturan bisnis (MASTER PROMPT §2 SKEMA B):
 *  - Batas pinjaman = LTV maks 70% dari harga pasar second.
 *  - Potongan muka Admin/Platform HANYA 1% (bukan 5% seperti Skema A).
 *  - Dana bersih diterima = 99% dari pokok gadai.
 *  - Sewa modal 5%-10% per 30 hari, dihitung DINAMIS dari sisa pokok
 *    terbaru (decreasing principal basis): cicil pokok → sewa bulan
 *    berikutnya otomatis turun.
 *  - Sisa pokok = Rp0 → status barang di Vault Custody: SIAP_DIAMBIL.
 */
import { percentOf, type Rupiah } from "./money";

export const GADAI_PRICING = {
  /** Potongan muka gabungan admin+platform untuk gadai: 1%. */
  upfrontDeductionPercent: 1,
  /** Dana bersih diterima: 99% dari pokok gadai. */
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

/** Batas maksimal pinjaman gadai = 70% harga pasar (integer rupiah). */
export function limitPinjamanGadai(hargaPasar: Rupiah): Rupiah {
  return percentOf(hargaPasar, GADAI_PRICING.ltvMaxPercent);
}

export interface GadaiQuote {
  /** Pokok gadai (jumlah dana yang dipinjam dengan jaminan). */
  pokok: Rupiah;
  /** Potongan muka 1% (admin + platform). */
  potonganDiMuka: Rupiah;
  /** Dana bersih diterima: 99%. */
  danaBersihDitransfer: Rupiah;
  /** Sewa modal periode pertama: persen sewa × pokok. */
  sewaModalPeriode: Rupiah;
  /** Persen sewa modal yang dipakai (5–10). */
  persenSewaModal: number;
  /** Total kewajiban awal = pokok + sewa modal periode pertama. */
  totalKewajibanAwal: Rupiah;
}

/** Quote awal gadai — validasi persen sewa 5–10 & pokok positif. */
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
 * sewa otomatis menurun. Sisa pokok 0 → sewa 0 (barang SIAP_DIAMBIL).
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

/** Status barang gadai di Vault Custody setelah pembayaran. */
export type GadaiCustodyStatus =
  | "DALAM_VAULT" // masih ada sisa pokok
  | "SIAP_DIAMBIL"; // sisa pokok = Rp0

export function statusCustody(sisaPokok: Rupiah): GadaiCustodyStatus {
  return sisaPokok <= 0 ? "SIAP_DIAMBIL" : "DALAM_VAULT";
}

export interface GadaiBayarResult {
  /** Pokok yang dicicil pembayaran ini. */
  pokokDicicil: Rupiah;
  /** Sewa modal yang dibayar pembayaran ini. */
  sewaDibayar: Rupiah;
  /** Total rupiah pembayaran ini. */
  totalBayar: Rupiah;
  /** Sisa pokok setelah pembayaran. */
  sisaPokokSetelah: Rupiah;
  /** Sewa modal periode berikutnya (dari sisa pokok terbaru). */
  sewaModalBerikut: Rupiah;
  /** Status custody setelah pembayaran. */
  custody: GadaiCustodyStatus;
}

/**
 * Rencana pembayaran satu periode gadai:
 * - Bila `bayarHanyaSewa`: bayar sewa modal saja + perpanjang tenor.
 * - Selain itu: `cicilPokok` ditambah sewa modal wajib.
 * Validasi: total cicil pokok tidak boleh melebihi sisa pokok;
 * sewa modal wajib dibayar penuh (half-up rupiah).
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
    throw new Error("Pokok sudah lunas — barang SIAP_DIAMBIL di Vault Custody.");
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
        `Cicilan melebihi sisa pokok ${sisaPokok}. Maksimal cicil ${sisaPokok} (setelah itu barang SIAP_DIAMBIL).`,
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

/** Simulasi tabel angsuran (untuk widget kalkulator & jadwal): N periode. */
export interface GadaiJadwalRow {
  periode: number;
  sisaPokokAwal: Rupiah;
  cicilPokok: Rupiah;
  sewaModal: Rupiah;
  sisaPokokAkhir: Rupiah;
  custody: GadaiCustodyStatus;
}

/**
 * Proyeksi jadwal bila Peminjam mencicil pokok `cicilPerPeriode` setiap
 * 30 hari (berhenti saat lunas). Untuk tampilan edukasi — keputusan nyata
 * tetap per periode nyata oleh Peminjam.
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
