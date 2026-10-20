/**
 * Doorprize Emas bulanan — aturan tiket yang murni dan bisa diuji.
 *
 * Tiket diterbitkan otomatis, tanpa klaim manual:
 * - Peminjam: +1 tiket setiap pinjaman tunai dilunasi PENUH paling lambat pada
 *   tanggal jatuh tempo (bukan sekadar berstatus lunas).
 * - Pendana: +1 tiket setiap kelipatan Rp1.000.000 dana yang selesai satu
 *   siklus 30 hari. Alokasi Rp2.500.000 menghasilkan 2 tiket, bukan 3.
 *
 * Periode undian memakai bulan kalender WIB; pengundian dilakukan pada akhir
 * bulan, dan tiket bulan lalu tidak ikut diundi lagi.
 */

export const HADIAH_UTAMA_DOORPRIZE = "Emas 1 gram";
export const HADIAH_HIBURAN_DOORPRIZE = "Saldo dompet Rp100.000";

/** Kelipatan pendanaan yang menghasilkan satu tiket pendana. */
export const KELIPATAN_TIKET_PENDANA = 1_000_000;

const DAY_MS = 86_400_000;
/** WIB = UTC+7, tanpa DST. */
const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

/** Kunci periode `YYYY-MM` menurut kalender WIB. */
export function periodeUndian(waktu: number): string {
  if (!Number.isSafeInteger(waktu) || waktu <= 0) {
    throw new Error("Waktu periode undian tidak valid.");
  }
  const wib = new Date(waktu + OFFSET_WIB_MS);
  const bulan = String(wib.getUTCMonth() + 1).padStart(2, "0");
  return `${wib.getUTCFullYear()}-${bulan}`;
}

/**
 * Batas akhir periode (awal bulan berikutnya, WIB) sebagai epoch ms.
 * Inilah saat pemenang diundi; widget memakai angka ini untuk hitung mundur.
 */
export function akhirPeriodeUndian(periode: string): number {
  const cocok = /^(\d{4})-(\d{2})$/.exec(periode);
  if (cocok === null) throw new Error("Format periode undian harus YYYY-MM.");
  const tahun = Number(cocok[1]);
  const bulan = Number(cocok[2]);
  if (bulan < 1 || bulan > 12) throw new Error("Bulan periode undian tidak valid.");
  return Date.UTC(tahun, bulan, 1) - OFFSET_WIB_MS;
}

/** Tanggal pengundian yang bisa dibaca manusia, mis. "31 Oktober 2026". */
export function labelTanggalUndian(periode: string): string {
  const akhir = akhirPeriodeUndian(periode) - DAY_MS;
  return new Date(akhir + OFFSET_WIB_MS).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Jumlah tiket pendana untuk satu alokasi yang selesai satu siklus. */
export function tiketPendana(jumlahAlokasi: number): number {
  if (!Number.isSafeInteger(jumlahAlokasi) || jumlahAlokasi <= 0) return 0;
  return Math.floor(jumlahAlokasi / KELIPATAN_TIKET_PENDANA);
}

/** Tiket peminjam: satu per pinjaman yang lunas tepat waktu. */
export function tiketPeminjam(lunasTepatWaktu: boolean): number {
  return lunasTepatWaktu ? 1 : 0;
}
