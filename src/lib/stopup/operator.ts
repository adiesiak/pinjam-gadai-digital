/**
 * STOP-UP! — Auto-Detect Operator
 *
 * Deteksi operator dari 4 digit prefix nomor HP. Dipakai di Page 1 terminal
 * untuk menampilkan badge operator berpendar dan mengarahkan katalog produk.
 *
 * Prefix mengikuti penomoran seluler Indonesia (Kominfo).
 */

export type KodeOperator =
  | "TELKOMSEL"
  | "INDOSAT"
  | "XL"
  | "AXIS"
  | "TRI"
  | "SMARTFREN";

export type Operator = {
  kode: KodeOperator;
  /**
   * Kode brand di katalog (`suBrands.code`). WAJIB dipakai untuk smart routing
   * operator → katalog: kode brand sengaja lebih pendek (TSEL, ISAT) daripada
   * kode operator deteksi (TELKOMSEL, INDOSAT), jadi keduanya tidak boleh
   * dibandingkan langsung.
   */
  brandCode: string;
  nama: string;
  /** Emoji/warna aksen untuk badge berpendar di layar sentuh. */
  icon: string;
  warna: string;
  /** Prefix 4 digit yang terdaftar. */
  prefix: string[];
};

export const OPERATOR_LIST: Operator[] = [
  {
    kode: "TELKOMSEL",
    brandCode: "TSEL",
    nama: "Telkomsel",
    icon: "🔴",
    warna: "#e11d48",
    prefix: [
      "0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853",
    ],
  },
  {
    kode: "INDOSAT",
    brandCode: "ISAT",
    nama: "Indosat Ooredoo",
    icon: "🟡",
    warna: "#eab308",
    prefix: [
      "0814", "0815", "0816", "0855", "0856", "0857", "0858",
    ],
  },
  {
    kode: "XL",
    brandCode: "XL",
    nama: "XL Axiata",
    icon: "🔵",
    warna: "#2563eb",
    prefix: ["0817", "0818", "0819", "0859", "0877", "0878"],
  },
  {
    kode: "AXIS",
    brandCode: "AXIS",
    nama: "Axis",
    icon: "🟣",
    warna: "#7c3aed",
    prefix: ["0831", "0832", "0833", "0838"],
  },
  {
    kode: "TRI",
    brandCode: "TRI",
    nama: "Tri (3)",
    icon: "🟠",
    warna: "#f97316",
    prefix: ["0895", "0896", "0897", "0898", "0899"],
  },
  {
    kode: "SMARTFREN",
    brandCode: "SMART",
    nama: "Smartfren",
    icon: "🟢",
    warna: "#16a34a",
    prefix: [
      "0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889",
    ],
  },
];

/** Cari operator dari nomor HP (menerima 08…/62…/+62…/8…). */
export function deteksiOperator(nomor: string): Operator | null {
  const digit = (nomor ?? "").replace(/\D/g, "");
  if (digit.length < 4) return null;
  let nomorLokal = digit;
  if (nomorLokal.startsWith("62")) nomorLokal = `0${nomorLokal.slice(2)}`;
  else if (nomorLokal.startsWith("8")) nomorLokal = `0${nomorLokal}`;
  const prefix = nomorLokal.slice(0, 4);
  return OPERATOR_LIST.find((op) => op.prefix.includes(prefix)) ?? null;
}

/** Validasi ketat nomor HP: 10–13 digit dan wajib diawali `08`. */
export function validasiNomorHp(nomor: string): { valid: boolean; pesan?: string } {
  const digit = (nomor ?? "").replace(/\D/g, "");
  if (digit.length === 0) return { valid: false, pesan: "Masukkan nomor HP" };
  if (!digit.startsWith("08")) return { valid: false, pesan: "Nomor wajib diawali 08" };
  if (digit.length < 10) return { valid: false, pesan: "Nomor minimal 10 digit" };
  if (digit.length > 13) return { valid: false, pesan: "Nomor maksimal 13 digit" };
  return { valid: true };
}
