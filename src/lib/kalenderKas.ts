/**
 * Kalender kas 30 hari — proyeksi uang masuk dan keluar per hari WIB.
 *
 * Sumber yang dihitung (dan hanya ini, supaya angka tidak menipu):
 *  - angsuran pinjaman yang belum dibayar dan jatuh tempo dalam rentang;
 *  - siklus pendana berstatus berjalan yang jatuh tempo dalam rentang;
 *  - biaya operasional berulang yang diisi admin (tanggal 1–31 tiap bulan,
 *    tanggal 31 digeser ke hari terakhir bulan pendek).
 *
 * Belum termasuk gadai, kredit barang, akad syariah, dan denda — barisnya tidak
 * menyimpan tanggal jatuh tempo yang bisa diproyeksikan. Panel menyebutkan
 * cakupan itu apa adanya; kalender ini alat perencanaan, bukan laporan laba rugi.
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
  jumlahBiaya: number;
};

/** Biaya operasional berulang: nominal tetap pada satu tanggal tiap bulan. */
export type BiayaBulanan = {
  /** Tanggal 1–31; 31 dipakai pada hari terakhir bulan yang lebih pendek. */
  hariDalamBulan: number;
  nominal: number;
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
  /** Biaya berulang; opsional agar pemanggil lama tidak berubah. */
  biayaBulanan?: readonly BiayaBulanan[];
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
  biayaBulanan = [],
}: MasukanKalender): HasilKalenderKas {
  const jumlahHari = Math.min(60, Math.max(1, Math.trunc(hari)));
  const mulai = awalHariKasWIB(sekarang);
  const baris: BarisKalenderKas[] = Array.from({ length: jumlahHari }, (_, i) => ({
    tanggal: mulai + i * HARI_MS,
    masuk: 0,
    keluar: 0,
    jumlahAngsuran: 0,
    jumlahSiklus: 0,
    jumlahBiaya: 0,
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

  // Biaya berulang jatuh pada tanggal kalender WIB. Tanggal 29–31 digeser ke
  // hari terakhir bulan yang lebih pendek supaya biaya tidak hilang di Februari.
  for (const entri of baris) {
    const tanggal = new Date(entri.tanggal + OFFSET_WIB_MS);
    const hariBulan = tanggal.getUTCDate();
    const hariTerakhir = new Date(
      Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth() + 1, 0),
    ).getUTCDate();
    for (const biaya of biayaBulanan) {
      const target = Math.min(Math.max(1, Math.trunc(biaya.hariDalamBulan)), hariTerakhir);
      if (hariBulan !== target) continue;
      entri.keluar += biaya.nominal;
      entri.jumlahBiaya += 1;
    }
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
