/**
 * PINDAI — Skema Bulanan: KREDIT & PINJAMAN DI LUAR 1 JT / 30 HARI.
 *
 * Formula simulasi kredit bulanan (tenor 1, 3, 6 bulan — dst) dengan
 * pembulatan integer rupiah HALF-UP. Dipakai untuk kredit barang maupun
 * pinjaman tunai yang tenornya bukan skema 1 juta / 30 hari.
 *
 * Aturan skema:
 *  - Uang muka (DP) 0% → pokok dibiayai = harga/pokok penuh.
 *  - Angsuran pokok per bulan = pokok ÷ tenor (bulan terakhir menyerap sisa).
 *  - Biaya layanan platform 3% dari pokok, diamortisasi rata per bulan
 *    (= pendapatan platform, bukan hak Pendana).
 *  - Bunga/margin dihitung dari sisa pokok pada awal setiap bulan (hak Pendana):
 *      tenor 1 bulan  → 30% / bulan
 *      tenor 3–5 bln  → 25% / bulan
 *      tenor ≥ 6 bln  → 20% / bulan
 *  - Cicilan menurun = angsuran pokok + bunga atas sisa pokok + biaya layanan.
 *  - Tenor 6 bulan menghasilkan total bunga sekitar 70% pokok + biaya layanan 3%.
 *
 * Guardrail Rule 3: semua uang integer rupiah — pembagian pokok memakai
 * pola floor-split (bulan terakhir menyerap sisa) sehingga Σ jadwal TEPAT
 * sama dengan total kewajiban, tanpa floating-point error.
 */
import { isRupiah, percentOf, type Rupiah } from "./money";

/** Pilihan tenor bulanan resmi skema ini (bulan). */
export const TENOR_BULANAN_OPTIONS = [1, 3, 6] as const;

export const BULANAN_PRICING = {
  /** Uang muka 0% — seluruh harga/pokok dibiayai. */
  dpPersen: 0,
  /** Biaya layanan platform 3% dari pokok (diamortisasi rata per bulan). */
  biayaLayananPersen: 3,
  /** Bunga tenor 1 bulan (%/bulan). */
  bungaTenor1PersenPerBulan: 30,
  /** Bunga tenor 3–5 bulan (%/bulan). */
  bungaTenor3_5PersenPerBulan: 25,
  /** Bunga tenor ≥ 6 bulan (%/bulan). */
  bungaMin6PersenPerBulan: 20,
  /** Batas profit total terhadap pokok untuk tenor resmi. */
  maxProfitTotalPersen: 125,
} as const;

/** Batas pokok/harga untuk skema bulanan (di luar skema 1 jt/30 hari). */
export const BULANAN_LIMITS = {
  minPokok: 100_000,
  maxPokok: 500_000_000,
} as const;

/** Tarif bunga per bulan (% dari sisa pokok) sesuai tenor. */
export function persenBungaPerBulan(tenorBulan: number): number {
  if (!Number.isSafeInteger(tenorBulan) || tenorBulan <= 0) {
    throw new Error("Tenor harus bilangan bulan positif.");
  }
  if (tenorBulan >= 6) return BULANAN_PRICING.bungaMin6PersenPerBulan;
  if (tenorBulan >= 3) return BULANAN_PRICING.bungaTenor3_5PersenPerBulan;
  return BULANAN_PRICING.bungaTenor1PersenPerBulan;
}

/** Satu baris jadwal cicilan bulanan. */
export interface CicilanBulananRow {
  /** Bulan ke-n (1..tenorBulan). */
  bulan: number;
  /** Angsuran pokok bulan ini. */
  pokok: Rupiah;
  /** Bunga/margin bulan ini (hak Pendana). */
  bunga: Rupiah;
  /** Biaya layanan bulan ini (pendapatan platform). */
  biayaLayanan: Rupiah;
  /** Cicilan bulan ini = pokok + bunga + biayaLayanan. */
  total: Rupiah;
  /** Sisa pokok setelah cicilan bulan ini. */
  sisaPokok: Rupiah;
}

export interface SimulasiBulanan {
  /** Pokok pinjaman / harga barang (DP 0% → pokok dibiayai = nilai ini). */
  pokok: Rupiah;
  /** Uang muka — selalu 0 pada skema ini. */
  dp: Rupiah;
  /** Pokok dibiayai = pokok − DP. */
  pokokDibiayai: Rupiah;
  /** Tenor dalam bulan. */
  tenorBulan: number;
  /** Tarif bunga per bulan (% dari sisa pokok) sesuai tenor. */
  persenBungaPerBulan: number;
  /** Total biaya layanan platform (3% dari pokok). */
  biayaLayananTotal: Rupiah;
  /** Biaya layanan per bulan (diamortisasi rata; bulan terakhir menyerap sisa). */
  biayaLayananPerBulan: Rupiah;
  /** Bunga bulan pertama, dihitung atas seluruh pokok. */
  bungaPerBulan: Rupiah;
  /** Cicilan bulan pertama (terbesar pada jadwal pokok tetap). */
  cicilanPerBulan: Rupiah;
  /** Cicilan bulan terakhir (termasuk sisa pembulatan pokok/layanan). */
  cicilanTerakhir: Rupiah;
  /** Bunga/margin total selama tenor (hak Pendana). */
  bungaTotal: Rupiah;
  /** Total yang dibayar Konsumen/Peminjam = Σ cicilan. */
  totalPengembalian: Rupiah;
  /** totalPengembalian − pokok (bunga + biaya layanan). */
  totalKeuntunganBersih: Rupiah;
  /** Keuntungan bersih sebagai persen pokok (1 desimal, gaya Indonesia). */
  persentaseProfitTotal: number;
  /** Jadwal cicilan per bulan — Σ pokok = pokokDibiayai, Σ total = totalPengembalian. */
  jadwal: CicilanBulananRow[];
}

/**
 * Validasi pokok + tenor skema bulanan — melempar pesan Indonesia yang jelas.
 * Dipakai server untuk menolak pengajuan di luar rentang sebelum menghitung.
 */
export function assertSimulasiBulananValid(pokok: Rupiah, tenorBulan: number): void {
  hitungSimulasiBulanan(pokok, tenorBulan);
}

/**
 * Simulasi kredit/pinjaman bulanan — mesin yang sama dipakai kalkulator,
 * form pengajuan, dan backend (angka tidak pernah diinput klien).
 *
 * Identitas yang dijamin (diuji di bulanan.test.ts):
 *  - dp = 0 dan pokokDibiayai = pokok
 *  - Σ jadwal.pokok = pokokDibiayai
 *  - Σ jadwal.bunga = bungaTotal, Σ jadwal.biayaLayanan = biayaLayananTotal
 *  - Σ jadwal.total = totalPengembalian
 *  - cicilanPerBulan = cicilan bulan pertama; cicilanTerakhir = cicilan terakhir
 *  - totalKeuntunganBersih = totalPengembalian − pokok
 */
export function hitungSimulasiBulanan(
  pokok: Rupiah,
  tenorBulan: number,
): SimulasiBulanan {
  if (!isRupiah(pokok) || pokok <= 0) {
    throw new Error("Pokok harus rupiah bulat positif (tanpa desimal).");
  }
  if (pokok < BULANAN_LIMITS.minPokok || pokok > BULANAN_LIMITS.maxPokok) {
    throw new Error(
      `Pokok harus antara ${BULANAN_LIMITS.minPokok} dan ${BULANAN_LIMITS.maxPokok} rupiah.`,
    );
  }
  if (!Number.isSafeInteger(tenorBulan) || tenorBulan <= 0) {
    throw new Error("Tenor harus bilangan bulan positif.");
  }

  const dp = 0;
  const pokokDibiayai = pokok - dp;
  const persen = persenBungaPerBulan(tenorBulan);

  // Komponen bulanan — semua HALF-UP per rupiah via percentOf (BigInt).
  const pokokPerBulan = Math.floor(pokokDibiayai / tenorBulan);
  const bungaPerBulan = percentOf(pokokDibiayai, persen);
  const biayaLayananTotal = percentOf(pokokDibiayai, BULANAN_PRICING.biayaLayananPersen);
  const biayaLayananPerBulan = Math.floor(biayaLayananTotal / tenorBulan);

  // ===== Jadwal: bunga atas saldo awal bulan; pokok/biaya terakhir menyerap sisa =====
  const jadwal: CicilanBulananRow[] = [];
  let sisaPokok = pokokDibiayai;
  let sisaLayanan = biayaLayananTotal;
  for (let bulan = 1; bulan <= tenorBulan; bulan += 1) {
    const terakhir = bulan === tenorBulan;
    const rowPokok = terakhir ? sisaPokok : pokokPerBulan;
    const rowBunga = percentOf(sisaPokok, persen);
    const rowLayanan = terakhir ? sisaLayanan : biayaLayananPerBulan;
    sisaPokok -= rowPokok;
    sisaLayanan -= rowLayanan;
    jadwal.push({
      bulan,
      pokok: rowPokok,
      bunga: rowBunga,
      biayaLayanan: rowLayanan,
      total: rowPokok + rowBunga + rowLayanan,
      sisaPokok,
    });
  }

  const cicilanPerBulan = jadwal[0].total;
  const cicilanTerakhir = jadwal[jadwal.length - 1].total;
  const totalPengembalian = jadwal.reduce((acc, r) => acc + r.total, 0);
  const bungaTotal = jadwal.reduce((acc, r) => acc + r.bunga, 0);
  const totalKeuntunganBersih = totalPengembalian - pokok;
  // Satu desimal (48.0 bukan 48) — mengikuti output formula referensi.
  const persentaseProfitTotal =
    Math.round((totalKeuntunganBersih / pokok) * 1000) / 10;

  return {
    pokok,
    dp,
    pokokDibiayai,
    tenorBulan,
    persenBungaPerBulan: persen,
    biayaLayananTotal,
    biayaLayananPerBulan,
    bungaPerBulan,
    cicilanPerBulan,
    cicilanTerakhir,
    bungaTotal,
    totalPengembalian,
    totalKeuntunganBersih,
    persentaseProfitTotal,
    jadwal,
  };
}
