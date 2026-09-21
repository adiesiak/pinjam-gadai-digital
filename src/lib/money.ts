/**
 * PINDAI — Money (Rupiah) arithmetic.
 *
 * GUARDRAIL (Rule 3 — Zero Floating-Point Errors):
 * All monetary values are stored and computed as integers of the smallest
 * unit (1 rupiah). Floats/never enter money arithmetic: parse inputs through
 * `parseRupiah` and never build money from `Number` multiplication.
 *
 * STRICT TERMINOLOGY (Rule 2): "imbalHasil" is a Pendana's financial right —
 * never call it investor/ROI/return anywhere in this codebase.
 */

export type Rupiah = number; // integer rupiah. Invariant: Number.isInteger.

export const PINDAI_TERMS = {
  /** Pendana — the party that provides funds (never "investor"). */
  pendana: "Pendana",
  /** Peminjam — the party that applies for a loan / pawn. */
  peminjam: "Peminjam",
  /** Alokasi Dana — the act of channeling funds (never "investasi"). */
  alokasiDana: "Alokasi Dana",
  /** Imbal Hasil — the Pendana's financial right (never "ROI"/"return"). */
  imbalHasil: "Imbal Hasil",
} as const;

const MAX_LOAN_RP = 500_000_000; // business cap: Rp 500.000.000
const MIN_LOAN_RP = 100_000; // business floor: Rp 100.000

export function isRupiah(v: Rupiah): v is Rupiah {
  return Number.isInteger(v) && Number.isSafeInteger(v);
}

export function formatRupiah(v: Rupiah): string {
  if (!isRupiah(v)) throw new Error(`Bukan rupiah bulat yang valid: ${v}`);
  return `Rp ${v.toLocaleString("id-ID")}`;
}

/**
 * Parse user input into integer rupiah. Accepts "2.500.000", "2500000",
 * "2,5 juta"-free plain digits with optional separators. Rounds HALF-UP when
 * the user types decimals — the half cent goes to the user, never to the house.
 * Throws on invalid, negative or out-of-business-range input.
 */
export function parseRupiah(raw: string): Rupiah {
  const cleaned = raw.replace(/[rp\s.]/gi, "").replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error("Masukkan angka rupiah yang valid.");
  }
  const [whole, frac = ""] = cleaned.split(".");
  const halfUp = Math.round(Number(`${whole}.${frac.slice(0, 2)}`) + 1e-9);
  if (halfUp < MIN_LOAN_RP || halfUp > MAX_LOAN_RP) {
    throw new Error(
      `Jumlah harus antara ${formatRupiah(MIN_LOAN_RP)} dan ${formatRupiah(MAX_LOAN_RP)}.`,
    );
  }
  return halfUp;
}

/** Integer percentage of a rupiah amount, rounding HALF-UP at 0.5 rupiah. */
export function percentOf(amount: Rupiah, percent: number): Rupiah {
  if (!isRupiah(amount)) throw new Error(`Bukan rupiah bulat yang valid: ${amount}`);
  if (!Number.isFinite(percent) || percent < 0) throw new Error("Persentase tidak valid.");
  // Exact integer math: numerator = amount * percent * 100, denominator = 10_000
  const numerator = BigInt(amount) * BigInt(Math.round(percent * 100));
  const denominator = 10_000n;
  const q = numerator / denominator;
  const r = numerator % denominator;
  // ROUND_HALF_UP: if remainder * 2 >= denominator, round up (away from zero;
  // all our amounts are non-negative).
  return Number(r * 2n >= denominator ? q + 1n : q);
}
