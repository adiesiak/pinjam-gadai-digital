/**
 * SIKLUS PENEMPATAN PENDANA — 30 hari, satu pembayaran per siklus.
 *
 * Aturan produk yang dijaga di sini:
 *  - Pokok ditempatkan untuk satu siklus 30 hari.
 *  - Imbal hasil bruto 30% dari pokok, tidak mengikuti tenor pinjaman nasabah.
 *  - Marjin itu dibagi 47 : 13 dari 60: 78,33% pendana, 21,67% platform.
 *    Porsi platform dipotong sekali per siklus, bukan biaya layanan terpisah.
 *  - Total yang wajib dibayar pada jatuh tempo = pokok + porsi pendana.
 *
 * Angka ini murni: tidak membaca database, waktu, atau tenor pinjaman. Server
 * menyimpan hasilnya sebagai snapshot di `siklusPendana`, jadi perubahan tarif
 * di kemudian hari tidak mengubah siklus yang sudah berjalan.
 *
 * Satu siklus 30 hari boleh memutar modalnya lebih dari sekali. Modal pokok
 * yang kembali dari pinjaman 7/14/21 hari ditempatkan lagi ke pinjaman lain
 * selama siklus masih berjalan. Hak pendana TIDAK bertambah: total cair tetap
 * angka snapshot di awal siklus, sedangkan seluruh hasil putaran berikutnya
 * menjadi pendapatan platform. Lihat `potonganPutaran`.
 *
 * Contoh Rp1.000.000:
 *   imbal      = Rp300.000
 *   potongan   = Rp65.000 (13/60 marjin)
 *   total cair = Rp1.235.000 (keuntungan bersih Rp235.000)
 *
 * Pada skema acuan 30%, porsi platform 13/60 marjin kebetulan sama dengan 5%
 * dari total kembali (Rp65.000). Angkanya dihitung dari pembagian marjin,
 * bukan dari persentase biaya, supaya produk dengan marjin berbeda tetap
 * memakai aturan 47 : 13 yang sama.
 */
import { bagiMargin } from "./kebijakanPinjaman";

/** Panjang satu siklus penempatan pendana. */
export const SIKLUS_PENDANA_HARI = 30;

/** Imbal hasil bruto per siklus, dalam persen dari pokok. */
export const PERSEN_IMBAL_SIKLUS = 30;

/** Satu hari dalam milidetik. */
export const HARI_MS = 86_400_000;

export type HitunganSiklus = {
  pokok: number;
  imbal: number;
  potongan: number;
  totalCair: number;
  jatuhTempoHari: number;
};

function validasiPokok(pokok: number): void {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error(`Pokok siklus harus rupiah bulat positif: ${pokok}`);
  }
}

/**
 * Hitung hak satu siklus dari pokok penempatan.
 * Semua pembulatan ke bawah supaya tidak ada rupiah yang diciptakan.
 */
export function hitungSiklusPendana(pokok: number): HitunganSiklus {
  validasiPokok(pokok);
  const imbal = Math.floor((pokok * PERSEN_IMBAL_SIKLUS) / 100);
  // Porsi platform selalu 13/60 marjin. Pembulatan ke bawah; sisa rupiah
  // menjadi milik pendana, jadi tidak ada rupiah yang hilang atau diciptakan.
  const potongan = bagiMargin(imbal).platform;
  return {
    pokok,
    imbal,
    potongan,
    totalCair: pokok + imbal - potongan,
    jatuhTempoHari: SIKLUS_PENDANA_HARI,
  };
}

/**
 * Porsi platform satu putaran modal, mengikuti snapshot siklus.
 *
 * Tarif siklus disimpan sebagai rupiah (`potongan` atas `pokokSiklus`), bukan
 * persen, supaya perubahan pengaturan tidak mengubah siklus yang berjalan.
 * Proporsi dipakai agar putaran sebagian tidak menagih porsi penuh.
 */
export function potonganPutaran(
  potonganSiklus: number,
  pokokSiklus: number,
  jumlahPutaran: number,
): number {
  if (!Number.isSafeInteger(jumlahPutaran) || jumlahPutaran <= 0) {
    throw new Error(`Jumlah putaran harus rupiah bulat positif: ${jumlahPutaran}`);
  }
  if (pokokSiklus <= 0) return 0;
  return Math.floor((potonganSiklus * jumlahPutaran) / pokokSiklus);
}

/** Waktu jatuh tempo dari awal siklus. */
export function jatuhTempoSiklus(mulaiPada: number): number {
  return mulaiPada + SIKLUS_PENDANA_HARI * HARI_MS;
}

/** Sisa hari menuju jatuh tempo; 0 atau negatif berarti sudah jatuh tempo. */
export function sisaHariSiklus(jatuhTempoPada: number, sekarang: number): number {
  return Math.ceil((jatuhTempoPada - sekarang) / HARI_MS);
}

export type StatusSiklus =
  | "berjalan"
  | "dicairkan"
  | "diputar_ulang"
  | "dibatalkan";

/** Label status yang dibaca pendana dan admin. */
export function labelStatusSiklus(status: StatusSiklus): string {
  if (status === "dicairkan") return "Dicairkan";
  if (status === "diputar_ulang") return "Diputar ulang";
  if (status === "dibatalkan") return "Dibatalkan";
  return "Berjalan";
}

/** Pilihan pendana pada saat jatuh tempo. */
export type PilihanSiklus = "cairkan" | "putar_ulang";

/** Label pilihan; pendana yang belum memilih dianggap mencairkan. */
export function labelPilihanSiklus(
  pilihan: PilihanSiklus | undefined,
): string {
  return pilihan === "putar_ulang" ? "Putar lagi 30 hari" : "Cairkan ke rekening";
}

/**
 * Pokok siklus berikutnya saat pendana memilih "putar lagi".
 * Seluruh hak siklus — pokok + Imbal Hasil − porsi platform — ikut bekerja lagi, jadi
 * tidak ada rupiah yang menganggur di dompet selama siklus berikutnya.
 * Pembulatan ke bawah menjaga total kewajiban tidak melebihi uang yang ada.
 */
export function pokokPutarUlang(totalCair: number): number {
  if (!Number.isSafeInteger(totalCair) || totalCair <= 0) {
    throw new Error(`Total cair siklus harus rupiah bulat positif: ${totalCair}`);
  }
  return totalCair;
}
