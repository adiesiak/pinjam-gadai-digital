/**
 * Simulasi terakhir dari kalkulator publik.
 *
 * Disimpan di `sessionStorage`, bukan URL: tujuannya hanya membawa pilihan
 * pengunjung melewati halaman masuk dalam tab yang sama. Nilai tetap divalidasi
 * sebelum dipakai, karena isi storage bisa saja rusak atau diubah pengguna.
 */
import { BULANAN_LIMITS, TENOR_BULANAN_OPTIONS } from "./bulanan";
import {
  LOAN_LIMITS,
  TENOR_HARIAN_MAKS,
  TENOR_OPTIONS,
  tenorHarianEfektif,
} from "./loan";
import { PLAFON_BATAS } from "./plafon";

const KUNCI = "pindai:simulasi-pengajuan";

export type SimulasiPengajuan = {
  skema: "harian" | "bulanan";
  pokok: number;
  tenorHari: number;
  tenorBulan: number;
};

function penyimpanan(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function objek(nilai: unknown): Record<string, unknown> | null {
  return typeof nilai === "object" && nilai !== null
    ? (nilai as Record<string, unknown>)
    : null;
}

/**
 * Validasi bentuk dan batas bisnis. Mengembalikan null bila ada satu bagian
 * yang tidak sah; pemanggil lalu memakai nilai bawaan formulir.
 */
export function validasiSimulasiPengajuan(
  nilai: unknown,
): SimulasiPengajuan | null {
  const data = objek(nilai);
  if (data === null) return null;

  const skema = data.skema;
  if (skema !== "harian" && skema !== "bulanan") return null;

  const pokok = data.pokok;
  if (!Number.isSafeInteger(pokok) || (pokok as number) <= 0) return null;

  if (skema === "bulanan") {
    const tenorBulan = data.tenorBulan;
    if (
      !Number.isSafeInteger(tenorBulan) ||
      !(TENOR_BULANAN_OPTIONS as readonly number[]).includes(
        tenorBulan as number,
      )
    ) {
      return null;
    }
    const maks = Math.min(BULANAN_LIMITS.maxPokok, PLAFON_BATAS.maks);
    if ((pokok as number) < BULANAN_LIMITS.minPokok || (pokok as number) > maks) {
      return null;
    }
    return {
      skema,
      pokok: pokok as number,
      tenorHari: 30,
      tenorBulan: tenorBulan as number,
    };
  }

  const tenorHari = data.tenorHari;
  if (
    !Number.isSafeInteger(tenorHari) ||
    (tenorHari as number) < TENOR_OPTIONS[0] ||
    (tenorHari as number) > TENOR_HARIAN_MAKS
  ) {
    return null;
  }
  if (
    (pokok as number) < LOAN_LIMITS.minPokok ||
    (pokok as number) > LOAN_LIMITS.maxPokok
  ) {
    return null;
  }

  return {
    skema,
    pokok: pokok as number,
    tenorHari: tenorHarianEfektif(pokok as number, tenorHari as number),
    tenorBulan: 3,
  };
}

export function simpanSimulasiPengajuan(
  nilai: SimulasiPengajuan,
  storage: Storage | null = penyimpanan(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(KUNCI, JSON.stringify(nilai));
  } catch {
    // Storage penuh/diblokir bukan alasan menggagalkan navigasi.
  }
}

export function bacaSimulasiPengajuan(
  storage: Storage | null = penyimpanan(),
): SimulasiPengajuan | null {
  if (storage === null) return null;
  try {
    const mentah = storage.getItem(KUNCI);
    return mentah === null ? null : validasiSimulasiPengajuan(JSON.parse(mentah));
  } catch {
    return null;
  }
}

export function hapusSimulasiPengajuan(
  storage: Storage | null = penyimpanan(),
): void {
  if (storage === null) return;
  try {
    storage.removeItem(KUNCI);
  } catch {
    // Sama seperti penyimpanan: kegagalan pembersihan tidak perlu terlihat.
  }
}
