/**
 * PINDAI — Skema Bulanan: KREDIT & PINJAMAN DI LUAR 1 JT / 30 HARI.
 *
 * Formula kredit bulanan (tenor 1, 3, 6 bulan — dst) dengan
 * pembulatan integer rupiah HALF-UP. Dipakai untuk kredit barang maupun
 * pinjaman tunai yang tenornya bukan skema 1 juta / 30 hari.
 *
 * Aturan skema:
 *  - Uang muka (DP) 0% → pokok dibiayai = harga/pokok penuh.
 *  - Angsuran pokok per bulan = pokok ÷ tenor (bulan terakhir menyerap sisa).
 *  - Tenor 3 dan 6 bulan: biaya admin 5% + platform 2% dari pokok,
 *    diamortisasi ke cicilan. Tenor lain tetap memakai biaya layanan 3%.
 *  - Bunga/margin dihitung dari sisa pokok pada awal setiap bulan (hak Pendana):
 *      tenor 1 bulan  → 30% / bulan
 *      tenor 3–5 bln  → 25% / bulan
 *      tenor ≥ 6 bln  → 20% / bulan
 *  - Cicilan menurun = angsuran pokok + bunga atas sisa pokok + biaya layanan.
 *  - Biaya ditambahkan ke cicilan tanpa mengurangi pokok yang diasumsikan diterima.
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
  /** Biaya layanan lama untuk tenor selain 3 dan 6 bulan. */
  biayaLayananPersen: 3,
  /** Biaya admin untuk tenor 3 dan 6 bulan. */
  biayaAdminPersenTenor3_6: 5,
  /** Biaya platform untuk tenor 3 dan 6 bulan. */
  biayaPlatformPersenTenor3_6: 2,
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
  /** Biaya admin bulan ini; nol di luar tenor 3 dan 6 bulan. */
  biayaAdmin: Rupiah;
  /** Biaya platform bulan ini; nol di luar tenor 3 dan 6 bulan. */
  biayaPlatform: Rupiah;
  /** Total biaya tenor bulan ini (dipertahankan untuk konsumen lama). */
  biayaLayanan: Rupiah;
  /** Cicilan bulan ini = pokok + bunga + seluruh biaya tenor. */
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
  /** Total biaya admin (5% pada tenor 3/6; nol selainnya). */
  biayaAdminTotal: Rupiah;
  /** Total biaya platform (2% pada tenor 3/6; nol selainnya). */
  biayaPlatformTotal: Rupiah;
  /** Total biaya tenor: admin + platform (3/6) atau layanan lama (tenor lain). */
  biayaLayananTotal: Rupiah;
  /** Perkiraan pembagian total biaya per bulan; bulan terakhir menyerap sisa. */
  biayaLayananPerBulan: Rupiah;
  /** Perkiraan pembagian biaya admin per bulan. */
  biayaAdminPerBulan: Rupiah;
  /** Perkiraan pembagian biaya platform per bulan. */
  biayaPlatformPerBulan: Rupiah;
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
 * Ringkasan kredit/pinjaman bulanan — mesin yang sama dipakai kalkulator,
 * form pengajuan, dan backend (angka tidak pernah diinput klien).
 *
 * Identitas yang dijamin (diuji di bulanan.test.ts):
 *  - dp = 0 dan pokokDibiayai = pokok
 *  - Σ jadwal.pokok = pokokDibiayai
 *  - Σ jadwal.bunga = bungaTotal, Σ setiap komponen biaya = totalnya
 *  - Tenor 3/6 mengenakan admin 5% + platform 2%; tenor lain layanan 3%
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
  const tenorAdminPlatform = tenorBulan === 3 || tenorBulan === 6;
  const biayaAdminTotal = tenorAdminPlatform
    ? percentOf(pokokDibiayai, BULANAN_PRICING.biayaAdminPersenTenor3_6)
    : 0;
  const biayaPlatformTotal = tenorAdminPlatform
    ? percentOf(pokokDibiayai, BULANAN_PRICING.biayaPlatformPersenTenor3_6)
    : 0;
  const biayaLayananTotal = tenorAdminPlatform
    ? biayaAdminTotal + biayaPlatformTotal
    : percentOf(pokokDibiayai, BULANAN_PRICING.biayaLayananPersen);
  const biayaAdminPerBulan = Math.floor(biayaAdminTotal / tenorBulan);
  const biayaPlatformPerBulan = Math.floor(biayaPlatformTotal / tenorBulan);
  const biayaLayananPerBulan = Math.floor(biayaLayananTotal / tenorBulan);

  // ===== Jadwal: bunga atas saldo awal bulan; setiap biaya terakhir menyerap sisa =====
  const jadwal: CicilanBulananRow[] = [];
  let sisaPokok = pokokDibiayai;
  let sisaAdmin = biayaAdminTotal;
  let sisaPlatform = biayaPlatformTotal;
  let sisaLayanan = tenorAdminPlatform ? 0 : biayaLayananTotal;
  for (let bulan = 1; bulan <= tenorBulan; bulan += 1) {
    const terakhir = bulan === tenorBulan;
    const rowPokok = terakhir ? sisaPokok : pokokPerBulan;
    const rowBunga = percentOf(sisaPokok, persen);
    const rowAdmin = terakhir ? sisaAdmin : biayaAdminPerBulan;
    const rowPlatform = terakhir ? sisaPlatform : biayaPlatformPerBulan;
    const rowLayananLama = terakhir
      ? sisaLayanan
      : tenorAdminPlatform
        ? 0
        : biayaLayananPerBulan;
    const rowLayanan = rowAdmin + rowPlatform + rowLayananLama;
    sisaPokok -= rowPokok;
    sisaAdmin -= rowAdmin;
    sisaPlatform -= rowPlatform;
    sisaLayanan -= rowLayananLama;
    jadwal.push({
      bulan,
      pokok: rowPokok,
      bunga: rowBunga,
      biayaAdmin: rowAdmin,
      biayaPlatform: rowPlatform,
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
    biayaAdminTotal,
    biayaPlatformTotal,
    biayaLayananTotal,
    biayaLayananPerBulan,
    biayaAdminPerBulan,
    biayaPlatformPerBulan,
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
