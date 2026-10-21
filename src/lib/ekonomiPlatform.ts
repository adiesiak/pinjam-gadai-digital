/**
 * Ekonomi platform PINDAI — biaya di muka, roll-over, dan dana proteksi risiko.
 *
 * Semua angka di sini adalah kebijakan PRODUK yang dipakai bersama oleh mesin
 * harga (`lib/loan`), pencairan (`convex/alokasiDana`), perpanjangan
 * (`convex/perpanjanganPinjaman`), dan tampilan nasabah. Tidak ada komponen
 * yang boleh menulis ulang angkanya.
 *
 * - Biaya admin di muka: 2% dari pokok (kebijakan berjalan, lihat
 *   `PINDAI_PRICING`). Tetap menjadi pendapatan platform.
 * - Biaya pencairan ekspres: Rp5.000–Rp10.000, sekali per pinjaman baru pada
 *   skema harian. Biaya ini bukan bunga: ia tidak menambah kewajiban nasabah.
 * - Biaya roll-over: flat Rp5.000 setiap kali nasabah memilih "bayar bunga
 *   saja". Cicil pokok dan pelunasan total tidak dikenai biaya ini.
 * - Dana proteksi risiko: 2,5% dari margin spread platform (bukan dari hak
 *   penyedia dana) disisihkan ke akun ledger terpisah.
 */
import { formatRupiah, type Rupiah } from "./money";

/** Batas tier biaya ekspres mengikuti tier nominal pinjaman harian. */
export const BIAYA_EKSPRES_TIER = [
  { batasBawah: 100_000, batasAtas: 499_999, biaya: 5_000 },
  { batasBawah: 500_000, batasAtas: 999_999, biaya: 7_500 },
  { batasBawah: 1_000_000, batasAtas: 1_000_000, biaya: 10_000 },
] as const;

/**
 * Nominal biaya ekspres per tier — bentuknya bisa diubah admin dari
 * Pengaturan Parameter Bisnis. Batas tier-nya tetap seperti `BIAYA_EKSPRES_TIER`.
 */
export type TarifEkspres = {
  tier1: Rupiah;
  tier2: Rupiah;
  tier3: Rupiah;
};

export const TARIF_EKSPRES_DEFAULT: TarifEkspres = {
  tier1: 5_000 as Rupiah,
  tier2: 7_500 as Rupiah,
  tier3: 10_000 as Rupiah,
};

/** Biaya roll-over flat untuk mode "bayar bunga saja". */
export const BIAYA_ROLLOVER: Rupiah = 5_000 as Rupiah;

/** Porsi margin spread platform yang disisihkan ke dana proteksi risiko (%). */
export const PERSEN_DANA_PROTEKSI_RISIKO = 2.5;

/**
 * Biaya pencairan ekspres untuk satu pokok pinjaman harian.
 *
 * Nominal di atas tier tertinggi memakai tarif tertinggi (Rp10.000), bukan
 * melempar: pinjaman warisan/gadai bisa lebih besar dari plafon tunai dan tetap
 * harus bisa ditampilkan. Nominal tidak sah tetap ditolak.
 */
export function biayaEkspres(
  pokok: Rupiah,
  tarif: TarifEkspres = TARIF_EKSPRES_DEFAULT,
): Rupiah {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error(
      `Biaya ekspres tidak tersedia untuk pokok ${formatRupiah(pokok)}.`,
    );
  }
  // Di bawah pokok minimum tunai tidak ada pencairan nyata: data warisan/uji
  // kecil tidak dikenai biaya ekspres supaya potongan tidak melebihi pokok.
  if (pokok < 100_000) return 0 as Rupiah;
  if (pokok >= 1_000_000) return tarif.tier3;
  if (pokok >= 500_000) return tarif.tier2;
  return tarif.tier1;
}

/** Biaya roll-over flat; nol untuk mode lain. */
export function biayaRollover(mode: "pelunasan_total" | "bunga_saja" | "cicil_pokok"): Rupiah {
  return mode === "bunga_saja" ? BIAYA_ROLLOVER : (0 as Rupiah);
}

/**
 * Porsi margin spread yang masuk `RISK_PROTECTION_POOL`.
 * Pembulatan ke bawah: sisa rupiah tetap menjadi margin platform.
 */
export function porsiDanaProteksiRisiko(margin: Rupiah): Rupiah {
  if (!Number.isSafeInteger(margin) || margin <= 0) return 0 as Rupiah;
  return Math.floor((margin * PERSEN_DANA_PROTEKSI_RISIKO) / 100) as Rupiah;
}
