/**
 * Kalender kas 30 hari — proyeksi uang masuk dan keluar per hari WIB.
 *
 * Sumber yang dihitung (dan hanya ini, supaya angka tidak menipu):
 *  - angsuran pinjaman yang belum dibayar dan jatuh tempo dalam rentang;
 *  - siklus pendana berstatus berjalan yang jatuh tempo dalam rentang.
 *
 * Belum termasuk gadai, kredit barang, akad syariah, denda, dan belanja
 * operasional. Panel menyebutkan cakupan itu apa adanya; kalender ini alat
 * perencanaan, bukan laporan laba rugi.
 *
 * Murni tanpa Convex/React; `sekarang` dikirim pemanggil supaya bisa diuji.
 */
import { OFFSET_WIB_MS } from "./waktu";

export const HARI_MS = 86_400_000;

export type EntriKas = {
  /** Jatuh tempo, milidetik. */
  jatuhTempoPada: number;
  /** Rupiah bulat. */
  nominal: number;
};

export type BarisKalenderKas = {
  /** Awal hari WIB, milidetik. */
  tanggal: number;
  masuk: number;
  keluar: number;
  jumlahAngsuran: number;
  jumlahSiklus: number;
};

export type HasilKalenderKas = {
  baris: BarisKalenderKas[];
  totalMasuk: number;
  totalKeluar: number;
  /** Hari dengan arus keluar terbesar; null bila tidak ada. */
  hariTerberat: { tanggal: number; keluar: number } | null;
};

/** Awal hari WIB yang memuat `ms`. */
export function awalHariKasWIB(ms: number): number {
  return Math.floor((ms + OFFSET_WIB_MS) / HARI_MS) * HARI_MS - OFFSET_WIB_MS;
}

/** Akhir hari WIB yang memuat `ms` (23.59.59.999). */
export function akhirHariKasWIB(ms: number): number {
  return awalHariKasWIB(ms) + HARI_MS - 1;
}

type MasukanKalender = {
  sekarang: number;
  /** Jumlah hari, termasuk hari ini. */
  hari: number;
  angsuran: readonly EntriKas[];
  siklus: readonly EntriKas[];
};

/**
 * Susun baris harian lengkap (termasuk hari tanpa transaksi) agar grafik dan
 * tabel tidak bolong. Entri di luar rentang diabaikan, bukan digeser ke tepi.
 */
export function susunKalenderKas({
  sekarang,
  hari,
  angsuran,
  siklus,
}: MasukanKalender): HasilKalenderKas {
  const jumlahHari = Math.min(60, Math.max(1, Math.trunc(hari)));
  const mulai = awalHariKasWIB(sekarang);
  const baris: BarisKalenderKas[] = Array.from({ length: jumlahHari }, (_, i) => ({
    tanggal: mulai + i * HARI_MS,
    masuk: 0,
    keluar: 0,
    jumlahAngsuran: 0,
    jumlahSiklus: 0,
  }));

  const indeks = (jatuhTempoPada: number): number =>
    Math.floor((jatuhTempoPada - mulai) / HARI_MS);

  for (const entri of angsuran) {
    const i = indeks(entri.jatuhTempoPada);
    if (i < 0 || i >= jumlahHari) continue;
    baris[i].masuk += entri.nominal;
    baris[i].jumlahAngsuran += 1;
  }

  for (const entri of siklus) {
    const i = indeks(entri.jatuhTempoPada);
    if (i < 0 || i >= jumlahHari) continue;
    baris[i].keluar += entri.nominal;
    baris[i].jumlahSiklus += 1;
  }

  let totalMasuk = 0;
  let totalKeluar = 0;
  let hariTerberat: HasilKalenderKas["hariTerberat"] = null;
  for (const entri of baris) {
    totalMasuk += entri.masuk;
    totalKeluar += entri.keluar;
    if (entri.keluar > 0 && (hariTerberat === null || entri.keluar > hariTerberat.keluar)) {
      hariTerberat = { tanggal: entri.tanggal, keluar: entri.keluar };
    }
  }

  return { baris, totalMasuk, totalKeluar, hariTerberat };
}

/**
 * Saldo proyeksi berjalan dari saldo kas awal. Nilai negatif berarti kas
 * tidak cukup pada hari itu — itulah peringatan yang dicari admin.
 */
export function saldoProyeksi(
  baris: readonly BarisKalenderKas[],
  saldoAwal: number,
): number[] {
  let saldo = saldoAwal;
  return baris.map((entri) => {
    saldo += entri.masuk - entri.keluar;
    return saldo;
  });
}
