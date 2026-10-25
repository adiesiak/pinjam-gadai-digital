/**
 * Minggu kalender WIB untuk tren promo.
 *
 * Satu minggu dimulai Senin pukul 00.00 WIB dan berakhir Minggu 23.59 WIB.
 * Server dan grafik memakai fungsi ini, jadi batas minggu tidak bergeser
 * karena zona waktu perangkat admin.
 *
 * Murni tanpa React/Convex supaya bisa diuji.
 */
import { OFFSET_WIB_MS } from "./waktu";

export const HARI_MS = 86_400_000;

/** Awal hari WIB yang memuat `ms`. */
function awalHariWIB(ms: number): number {
  return Math.floor((ms + OFFSET_WIB_MS) / HARI_MS) * HARI_MS - OFFSET_WIB_MS;
}

/** Senin 00.00 WIB pada minggu yang memuat `ms`. */
export function awalMingguWIB(ms: number): number {
  const hari = new Date(awalHariWIB(ms) + OFFSET_WIB_MS).getUTCDay(); // 0 = Minggu
  const mundur = hari === 0 ? 6 : hari - 1;
  return awalHariWIB(ms) - mundur * HARI_MS;
}

/** Akhir minggu (Minggu 23.59.59.999 WIB) dari awal minggu. */
export function akhirMingguWIB(mulaiMinggu: number): number {
  return mulaiMinggu + 7 * HARI_MS - 1;
}

export type TrenMingguan = {
  /** Senin 00.00 WIB, dalam milidetik. */
  mulai: number;
  pinjaman: number;
  subsidi: number;
};

/**
 * Gabungkan baris pinjaman menjadi tren per minggu, urut naik.
 * Minggu tanpa pinjaman tidak dibuat: grafik tidak menggambar batang nol palsu
 * untuk minggu yang belum tentu masuk rentang laporan.
 */
export function kelompokkanMingguan(
  baris: readonly { waktu: number; subsidi: number }[],
): TrenMingguan[] {
  const peta = new Map<number, TrenMingguan>();
  for (const entri of baris) {
    const mulai = awalMingguWIB(entri.waktu);
    const sekarang = peta.get(mulai) ?? { mulai, pinjaman: 0, subsidi: 0 };
    sekarang.pinjaman += 1;
    sekarang.subsidi += entri.subsidi;
    peta.set(mulai, sekarang);
  }
  return [...peta.values()].sort((a, b) => a.mulai - b.mulai);
}
