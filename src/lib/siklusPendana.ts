/**
 * SIKLUS PENEMPATAN PENDANA — 30 hari, satu pembayaran per siklus.
 *
 * Aturan produk yang dijaga di sini:
 *  - Pokok ditempatkan untuk satu siklus 30 hari.
 *  - Imbal hasil bruto 30% dari pokok, tidak mengikuti tenor pinjaman nasabah.
 *  - Biaya platform 5% dari POKOK, dipotong sekali per siklus.
 *  - Total yang wajib dibayar pada jatuh tempo = pokok + imbal - biaya.
 *
 * Angka ini murni: tidak membaca database, waktu, atau tenor pinjaman. Server
 * menyimpan hasilnya sebagai snapshot di `siklusPendana`, jadi perubahan tarif
 * di kemudian hari tidak mengubah siklus yang sudah berjalan.
 *
 * Contoh Rp1.000.000:
 *   imbal      = Rp300.000
 *   biaya      = Rp50.000
 *   total cair = Rp1.250.000
 */

/** Panjang satu siklus penempatan pendana. */
export const SIKLUS_PENDANA_HARI = 30;

/** Imbal hasil bruto per siklus, dalam persen dari pokok. */
export const PERSEN_IMBAL_SIKLUS = 30;

/** Biaya platform per siklus, dalam persen dari POKOK (bukan dari uang kembali). */
export const PERSEN_POTONGAN_SIKLUS = 5;

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
  const potongan = Math.floor((pokok * PERSEN_POTONGAN_SIKLUS) / 100);
  return {
    pokok,
    imbal,
    potongan,
    totalCair: pokok + imbal - potongan,
    jatuhTempoHari: SIKLUS_PENDANA_HARI,
  };
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
 * Seluruh hak siklus — pokok + Imbal Hasil − biaya — ikut bekerja lagi, jadi
 * tidak ada rupiah yang menganggur di dompet selama siklus berikutnya.
 * Pembulatan ke bawah menjaga total kewajiban tidak melebihi uang yang ada.
 */
export function pokokPutarUlang(totalCair: number): number {
  if (!Number.isSafeInteger(totalCair) || totalCair <= 0) {
    throw new Error(`Total cair siklus harus rupiah bulat positif: ${totalCair}`);
  }
  return totalCair;
}
