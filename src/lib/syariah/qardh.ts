/**
 * Akad QARDH (pinjaman kebajikan).
 *
 * Aturan produk:
 *  - Margin keuntungan 0%. Tidak ada bunga, tidak ada denda.
 *  - Pendana menerima kembali pokok 100% utuh.
 *  - Setiap kelipatan Rp1.000.000 dana aktif menghasilkan satu tiket doorprize
 *    triwulanan. Aturannya memakai konstanta yang sama dengan
 *    `lib/doorprize.ts`, jadi tiket di halaman ini tidak bisa berbeda dari
 *    tiket yang terbit di server.
 *
 * Semua nilai rupiah bulat.
 */
import { KELIPATAN_TIKET_PENDANA } from "../doorprize";
import type { Rupiah } from "../money";
import { pastikanRupiah } from "./nisbah";

export type BagiHasilQardh = {
  /** Dana yang dipinjamkan tanpa margin. */
  pokok: Rupiah;
  /** Selalu nol: akad kebajikan tidak mengambil margin. */
  marginTotal: Rupiah;
  /** Pokok kembali 100%. */
  pendanaTerima: Rupiah;
  /** Platform tidak mengambil bagian dari akad ini. */
  platformTerima: Rupiah;
  /** Tiket doorprize dari kelipatan penempatan dana. */
  tiketDoorprize: number;
  /** Kelipatan yang dipakai, agar keterangan di layar tidak menulis ulang. */
  kelipatanTiket: Rupiah;
};

/** Jumlah tiket doorprize untuk satu penempatan dana Qardh. */
export function tiketQardh(pokok: Rupiah): number {
  pastikanRupiah(pokok, "Pokok Qardh");
  return Math.floor(pokok / KELIPATAN_TIKET_PENDANA);
}

/** Hitung akad Qardh: tanpa margin, pokok utuh, plus tiket doorprize. */
export function bagiHasilQardh(pokok: Rupiah): BagiHasilQardh {
  pastikanRupiah(pokok, "Pokok Qardh");
  if (pokok <= 0) {
    throw new Error(`Pokok Qardh harus lebih dari nol: ${pokok}`);
  }
  return {
    pokok,
    marginTotal: 0,
    pendanaTerima: pokok,
    platformTerima: 0,
    tiketDoorprize: tiketQardh(pokok),
    kelipatanTiket: KELIPATAN_TIKET_PENDANA,
  };
}
