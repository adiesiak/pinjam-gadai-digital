import { NILAI_MODUL_ADMIN, type NilaiModulAdmin } from "./admin-queue";

/** Jumlah modul yang diingat; cukup untuk jalur kerja harian, tidak menutupi menu. */
export const MAKS_MODUL_TERAKHIR = 4;

const KUNCI = "pindai.admin.modul-terakhir";

/** Daftar kosong bila perangkat memblokir penyimpanan atau data lama rusak. */
export function bacaModulTerakhir(): NilaiModulAdmin[] {
  if (typeof window === "undefined") return [];
  try {
    const mentah = window.localStorage.getItem(KUNCI);
    if (mentah === null) return [];
    const nilai: unknown = JSON.parse(mentah);
    if (!Array.isArray(nilai)) return [];
    return nilai
      .filter(
        (item): item is NilaiModulAdmin =>
          typeof item === "string" &&
          (NILAI_MODUL_ADMIN as readonly string[]).includes(item),
      )
      .slice(0, MAKS_MODUL_TERAKHIR);
  } catch {
    return [];
  }
}

/**
 * Catat satu modul yang baru dibuka, paling baru di depan.
 *
 * Kegagalan menyimpan tidak boleh menggagalkan perpindahan modul; nilai yang
 * dikembalikan tetap dipakai untuk sesi ini.
 */
export function catatModulTerakhir(value: NilaiModulAdmin): NilaiModulAdmin[] {
  const baru = [value, ...bacaModulTerakhir().filter((item) => item !== value)].slice(
    0,
    MAKS_MODUL_TERAKHIR,
  );
  try {
    window.localStorage.setItem(KUNCI, JSON.stringify(baru));
  } catch {
    // Mode privat: daftar tetap berlaku sampai halaman ditutup.
  }
  return baru;
}
