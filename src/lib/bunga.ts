/**
 * Bunga pinjaman per nasabah.
 *
 * Bunga dasar mengikuti Pengaturan Sistem (`persenBunga`, default 30%).
 * Admin boleh menetapkan persentase berbeda untuk satu Peminjam; override itu
 * menang atas default global dan disimpan sebagai snapshot pada tiap pinjaman
 * agar angka sebuah pinjaman tidak berubah setelah dana cair.
 *
 * Interpretasi persen mengikuti skema masing-masing (satu angka yang sama):
 *  - skema harian (1 juta / 30 hari): persen bunga FLAT atas pokok;
 *  - skema bulanan: persen bunga per bulan (flat dari pokok penuh).
 */
import { BUNGA_PINJAMAN_DEFAULT_PERSEN } from "./bagiHasil";

/** Rentang bunga per-nasabah yang sah (persen). */
export const BUNGA_BATAS = { min: 0, maks: 100 } as const;

/** Langkah perubahan bunga di UI (persen). */
export const BUNGA_LANGKAH = 0.5;

/** Bunga bawaan bila override maupun Pengaturan Sistem kosong. */
export const BUNGA_DEFAULT_PERSEN = BUNGA_PINJAMAN_DEFAULT_PERSEN;

/** Jepit persen ke rentang sah; nilai tidak valid jatuh ke default. */
export function clampPersenBunga(nilai: number): number {
  if (!Number.isFinite(nilai)) return BUNGA_DEFAULT_PERSEN;
  const dibulatkan = Math.round(nilai * 100) / 100;
  return Math.min(BUNGA_BATAS.maks, Math.max(BUNGA_BATAS.min, dibulatkan));
}

/**
 * Bunga efektif satu Peminjam — override per-nasabah menang atas default global.
 * `globalDefault` berasal dari Pengaturan Sistem; kosong = default 30%.
 */
export function persenBungaEfektif(
  override: number | null | undefined,
  globalDefault?: number,
): number {
  if (override !== null && override !== undefined) return clampPersenBunga(override);
  if (globalDefault !== undefined && Number.isFinite(globalDefault)) {
    return clampPersenBunga(globalDefault);
  }
  return BUNGA_DEFAULT_PERSEN;
}
