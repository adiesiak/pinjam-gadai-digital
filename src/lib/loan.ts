/**
 * PINDAI — Loan Pricing Engine (pure functions, integer rupiah only).
 *
 * Rule 3 of the guardrails: no float money math. Every derived value is an
 * exact integer rupiah computed with BigInt half-up rounding.
 */
import { percentOf, type Rupiah } from "./money";

export const PINDAI_PRICING = {
  adminFeePercent: 3,
  platformFeePercent: 2,
  /** Total upfront deduction = Admin 3% + Platform 2% = 5%. */
  upfrontDeductionPercent: 5,
  /** Net disbursement is 95% of principal. */
  netDisbursementPercent: 95,
  /** Bunga (Imbal Hasil Pendana) is 30% of principal. */
  bungaPercent: 30,
  /** Total repayment obligation = 130% of principal. */
  totalRepaymentPercent: 130,
} as const;

export interface LoanQuote {
  /** Pokok Pinjaman */
  pokok: Rupiah;
  /** Biaya Admin — 3% dari pokok */
  biayaAdmin: Rupiah;
  /** Biaya Layanan Platform — 2% dari pokok */
  biayaPlatform: Rupiah;
  /** Total Potongan di Muka — 5% */
  totalPotonganDiMuka: Rupiah;
  /** Dana Bersih Ditransfer — 95% */
  danaBersihDitransfer: Rupiah;
  /** Bunga Pinjaman — 30% (hak finansial Pendana) */
  bunga: Rupiah;
  /** Total Kewajiban Pelunasan — 130% */
  totalKewajibanPelunasan: Rupiah;
}

export function quoteLoan(pokok: Rupiah): LoanQuote {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error("Pokok pinjaman harus rupiah bulat positif.");
  }
  const biayaAdmin = percentOf(pokok, PINDAI_PRICING.adminFeePercent);
  const biayaPlatform = percentOf(pokok, PINDAI_PRICING.platformFeePercent);
  const totalPotonganDiMuka = biayaAdmin + biayaPlatform;
  const danaBersihDitransfer = pokok - totalPotonganDiMuka;
  const bunga = percentOf(pokok, PINDAI_PRICING.bungaPercent);
  const totalKewajibanPelunasan = pokok + bunga;

  return {
    pokok,
    biayaAdmin,
    biayaPlatform,
    totalPotonganDiMuka,
    danaBersihDitransfer,
    bunga,
    totalKewajibanPelunasan,
  };
}

/**
 * Re-derive a quote from a stored principal. Used by getLoan / listMyLoans to
 * avoid storing duplicated fee fields; pricing is computed, never guessed.
 */
export function requote(pokok: Rupiah): LoanQuote {
  return quoteLoan(pokok);
}

/** File a borrower chooses on the application form. */
export const LOAN_PURPOSE_OPTIONS = [
  { value: "modal_usaha", label: "Modal usaha" },
  { value: "kebutuhan_pribadi", label: "Kebutuhan pribadi" },
  { value: "pendidikan", label: "Pendidikan" },
  { value: "kesehatan", label: "Kesehatan" },
  { value: "renovasi_rumah", label: "Renovasi rumah" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export type LoanPurpose = (typeof LOAN_PURPOSE_OPTIONS)[number]["value"];

export function loanPurposeLabel(v: string): string {
  return LOAN_PURPOSE_OPTIONS.find((o) => o.value === v)?.label ?? "Lainnya";
}

export const LOAN_STATUS_FLOW = [
  "diajukan",
  "sedang_direview",
  "disetujui",
  "ditolak",
] as const;

export type LoanStatus = (typeof LOAN_STATUS_FLOW)[number];

export function loanStatusMeta(status: LoanStatus): {
  label: string;
  description: string;
} {
  switch (status) {
    case "diajukan":
      return {
        label: "Diajukan",
        description: "Aplikasi Anda masuk antrean review tim PINDAI.",
      };
    case "sedang_direview":
      return {
        label: "Sedang Direview",
        description: "Tim PINDAI sedang menelaah dokumen dan data aplikasi Anda.",
      };
    case "disetujui":
      return {
        label: "Disetujui",
        description:
          "Aplikasi disetujui. Pencairan dana bersih akan diproses ke rekening Anda.",
      };
    case "ditolak":
      return {
        label: "Ditolak",
        description: "Aplikasi tidak dapat dilanjutkan. Anda dapat mengajukan ulang.",
      };
  }
}
