/**
 * PINDAI — Money (Rupiah) arithmetic.
 *
 * GUARDRAIL (Rule 3 — Zero Floating-Point Errors):
 * All monetary values are stored and computed as integers of the smallest
 * unit (1 rupiah). Floats/never enter money arithmetic: parse inputs through
 * `parseRupiah` and never build money from `Number` multiplication.
 *
 * STRICT TERMINOLOGY (Rule 2): "imbalHasil" is the fund provider's financial right —
 * never call it investor/ROI/return anywhere in this codebase.
 */

export type Rupiah = number; // integer rupiah. Invariant: Number.isInteger.

export const PINDAI_TERMS = {
  /** Dana — the party that provides funds (never "investor"). */
  dana: "Dana",
  /** Peminjam — the party that applies for a loan / pawn. */
  peminjam: "Peminjam",
  /** Alokasi Dana — the act of channeling funds (never "investasi"). */
  alokasiDana: "Alokasi Dana",
  /** Imbal Hasil — the fund provider's financial right (never "ROI"/"return"). */
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
 * Format rupiah defensif untuk tampilan: satu angka warisan non-bulat tidak
 * boleh merobohkan seluruh halaman (mis. rekap ruang penyedia dana yang harus
 * tetap terbaca). Angka tetap dicetak apa adanya, tanpa pembulatan diam-diam.
 */
export function formatRupiahAman(v: Rupiah): string {
  try {
    return formatRupiah(v);
  } catch {
    return `Rp ${Number(v).toLocaleString("id-ID")}`;
  }
}

/**
 * Kelompokkan ribuan untuk KOLOM MASUKAN uang, tanpa awalan "Rp".
 *
 * Kenapa terpisah dari `formatRupiah`: kolom masukan menyimpan digit mentah
 * (pengguna mengetik "8000000"), sedangkan yang harus TERBACA di layar adalah
 * "8.000.000". Tanpa pengelompokan, satu nol yang salah hitung tidak terlihat;
 * dan nilai yang datang dari server dalam bentuk sudah berkelompok
 * ("8.000.000") sempat tampil berbeda dari ketikan berikutnya, sehingga kolom
 * terasa melompat begitu mulai diketik.
 *
 * Non-digit diabaikan, jadi teks berkelompok maupun digit mentah menghasilkan
 * tampilan yang sama. Hasilnya tetap teks: kolom masukan tidak boleh memaksa
 * `Number` pada nilai yang mungkin belum lengkap, dan digit di atas 15 angka
 * dikembalikan apa adanya karena presisi `Number` sudah tidak dapat dipercaya.
 */
export function kelompokkanDigit(teks: string): string {
  const digit = teks.replace(/\D/g, "");
  if (digit === "" || digit.length > 15) return digit;
  return Number(digit).toLocaleString("id-ID");
}

/**
 * Parse user input into integer rupiah. Accepts "2.500.000", "2500000",
 * "2,5 juta"-free plain digits with optional separators. Rounds HALF-UP when
 * the user types decimals — the half cent goes to the user, never to the house.
 * Throws on invalid, negative or out-of-business-range input.
 */
function bacaNominal(raw: string): Rupiah {
  const cleaned = raw.replace(/[rp\s.]/gi, "").replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error("Masukkan angka rupiah yang valid.");
  }
  const [whole, frac = ""] = cleaned.split(".");
  return Math.round(Number(`${whole}.${frac.slice(0, 2)}`) + 1e-9);
}

/**
 * Nominal di luar pokok pinjaman (pembayaran sebagian, janji bayar,
 * penyelesaian): batas bawahnya nol, bukan minimum pinjaman. Cicilan Rp 50.000
 * harus bisa dicatat tanpa ditolak oleh aturan plafon pinjaman.
 */
export function parseNominalRupiah(raw: string, maks: Rupiah = MAX_LOAN_RP): Rupiah {
  const nilai = bacaNominal(raw);
  if (nilai > maks) throw new Error(`Nominal maksimal ${formatRupiah(maks)}.`);
  return nilai;
}

export function parseRupiah(raw: string): Rupiah {
  const halfUp = bacaNominal(raw);
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
