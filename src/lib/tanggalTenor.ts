/**
 * Tanggal jatuh tempo untuk tenor harian (7–50 hari).
 *
 * Kalender pemilih tanggal bekerja dengan tanggal kalender WIB, bukan jam:
 * "jatuh tempo 17 November" berarti tanggal itu di WIB, bukan 24 jam setelah
 * pengajuan. Karena itu semua hitungan di sini menormalkan sisi kiri dan kanan
 * ke tengah malam lebih dulu, memakai `awalHariWIB` yang sama dengan mesin
 * tagihan.
 */
import { TENOR_OPTIONS, TENOR_PERPANJANGAN, tenorHarianSah } from "./loan";
import { awalHariWIB, OFFSET_WIB_MS } from "./waktu";

const HARI_MS = 86_400_000;

/**
 * Tanggal kalender WIB hari ini, diletakkan sebagai tengah malam LOKAL.
 *
 * Tanggalnya dibaca dari WIB lalu dibentuk ulang dengan komponen lokal supaya
 * perbandingan tanggal di kalender (yang juga lokal) tidak bergeser satu hari
 * ketika peramban berada di zona waktu lain.
 */
export function hariIniLokal(sekarang = Date.now()): Date {
  const wib = new Date(awalHariWIB(sekarang) + OFFSET_WIB_MS);
  return new Date(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate());
}

/** Tambah/kurangi hari pada tanggal kalender; bulan dan tahun ikut menyesuaikan. */
export function tambahHari(tanggal: Date, hari: number): Date {
  return new Date(
    tanggal.getFullYear(),
    tanggal.getMonth(),
    tanggal.getDate() + hari,
  );
}

/** Selisih hari kalender, `sampai` dikurangi `dari`. */
export function selisihHari(dari: Date, sampai: Date): number {
  return Math.round(
    (Date.UTC(sampai.getFullYear(), sampai.getMonth(), sampai.getDate()) -
      Date.UTC(dari.getFullYear(), dari.getMonth(), dari.getDate())) /
      HARI_MS,
  );
}

/** Tanggal jatuh tempo untuk satu tenor, dihitung dari hari ini (WIB). */
export function tanggalJatuhTempo(tenor: number, sekarang = Date.now()): Date {
  return tambahHari(hariIniLokal(sekarang), tenor);
}

/**
 * Tenor (hari) untuk tanggal yang dipilih, atau `null` bila tanggalnya di luar
 * 7–50 hari dari hari ini atau tidak sah untuk nominal tersebut.
 */
export function tenorDariTanggal(
  tanggal: Date,
  pokok: number,
  sekarang = Date.now(),
): number | null {
  const tenor = selisihHari(hariIniLokal(sekarang), tanggal);
  if (tenor < TENOR_OPTIONS[0] || tenor > TENOR_PERPANJANGAN.maks) return null;
  return tenorHarianSah(pokok, tenor) ? tenor : null;
}

/** Rentang tanggal yang boleh dipilih untuk satu nominal. */
export function rentangTanggalTenor(sekarang = Date.now()): {
  min: Date;
  maks: Date;
} {
  return {
    min: tanggalJatuhTempo(TENOR_OPTIONS[0], sekarang),
    maks: tanggalJatuhTempo(TENOR_PERPANJANGAN.maks, sekarang),
  };
}

/**
 * Tengah hari WIB untuk satu tanggal kalender, dipakai saat memformat tanggal
 * dengan `formatTanggalWIB` supaya zona waktu peramban tidak menggeser harinya.
 */
export function tengahHariWIB(tanggal: Date): number {
  return Date.UTC(
    tanggal.getFullYear(),
    tanggal.getMonth(),
    tanggal.getDate(),
    5,
  );
}
