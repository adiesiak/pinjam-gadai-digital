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
 *  - Tenor 3 dan 6 bulan: biaya admin 2% + platform 3% dari pokok,
 *    DIPOTONG DI MUKA dari dana yang diterima (tidak diamortisasi ke cicilan).
 *    Tenor lain memakai biaya layanan 3%, juga dipotong di muka.
 *  - Bunga/margin (hak Pendana) — FLAT dari pokok penuh, sama besar setiap
 *    bulan (tidak menurun dari sisa pokok):
 *      tenor 1 bulan  → 30% / bulan
 *      tenor 3 bulan  → 25% / bulan
 *      tenor ≥ 6 bln  → 20% / bulan
 *  - Cicilan = angsuran pokok + bunga bulan itu (tanpa biaya). Karena bunga
 *    flat, cicilan bulanan rata (bulan terakhir hanya menyerap pembulatan
 *    pokok).
 *  - Dana diterima Peminjam = pokok − potongan di muka.
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
  /** Biaya layanan untuk tenor selain 3 dan 6 bulan (dipotong di muka). */
  biayaLayananPersen: 3,
  /** Biaya admin untuk tenor 3 dan 6 bulan (dipotong di muka). */
  biayaAdminPersenTenor3_6: 2,
  /** Biaya platform untuk tenor 3 dan 6 bulan (dipotong di muka). */
  biayaPlatformPersenTenor3_6: 3,
  /** Total biaya tenor 3/6 = admin 2% + platform 3% = 5%, dipotong di muka. */
  biayaTenor3_6Persen: 5,
  /** Bunga tenor 1 bulan (%/bulan, flat dari pokok penuh). */
  bungaTenor1PersenPerBulan: 30,
  /** Bunga tenor 3–5 bulan (%/bulan, flat dari pokok penuh). */
  bungaTenor3_5PersenPerBulan: 25,
  /** Bunga tenor ≥ 6 bulan (%/bulan, flat dari pokok penuh). */
  bungaMin6PersenPerBulan: 20,
  /** Batas profit total terhadap pokok untuk tenor resmi. */
  maxProfitTotalPersen: 130,
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

/**
 * Metode bunga menurut tenor. Seluruh tenor resmi (1, 3, dan 6 bulan) memakai
 * bunga FLAT dari pokok penuh — 30%/25%/20% per bulan sesuai tenor — sehingga
 * cicilan rata dan bukan menurun dari sisa pokok.
 *
 * Fungsi ini tetap ada sebagai satu titik kebijakan: bila suatu saat ada tenor
 * yang kembali memakai bunga menurun dari sisa pokok, cukup ubah nilai balik
 * di sini (mesin jadwal sudah menangani kedua metode).
 */
export function metodeBungaBulanan(tenorBulan: number): "menurun" | "flat" {
  if (!Number.isSafeInteger(tenorBulan) || tenorBulan <= 0) {
    throw new Error("Tenor harus bilangan bulan positif.");
  }
  return "flat";
}

/** Satu baris jadwal cicilan bulanan. */
export interface CicilanBulananRow {
  /** Bulan ke-n (1..tenorBulan). */
  bulan: number;
  /** Angsuran pokok bulan ini. */
  pokok: Rupiah;
  /** Bunga/margin bulan ini (hak Pendana). */
  bunga: Rupiah;
  /** Porsi biaya admin pada baris ini — selalu nol (biaya dipotong di muka). */
  biayaAdmin: Rupiah;
  /** Porsi biaya platform pada baris ini — selalu nol (biaya dipotong di muka). */
  biayaPlatform: Rupiah;
  /** Porsi biaya tenor pada baris ini — selalu nol (biaya dipotong di muka). */
  biayaLayanan: Rupiah;
  /** Cicilan bulan ini = pokok + bunga. */
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
  /** Tarif bunga per bulan (% dari sisa pokok atau pokok penuh) sesuai tenor. */
  persenBungaPerBulan: number;
  /** Metode bunga: menurun dari sisa pokok, atau flat dari pokok penuh. */
  metodeBunga: "menurun" | "flat";
  /** Total biaya admin (2% pada tenor 3/6; nol selainnya) — dipotong di muka. */
  biayaAdminTotal: Rupiah;
  /** Total biaya platform (3% pada tenor 3/6; nol selainnya) — dipotong di muka. */
  biayaPlatformTotal: Rupiah;
  /** Total biaya tenor: admin + platform (3/6) atau layanan (tenor lain). */
  biayaLayananTotal: Rupiah;
  /** Biaya yang dipotong di muka dari dana yang diterima = biayaLayananTotal. */
  potonganDiMuka: Rupiah;
  /** Dana yang diterima Peminjam = pokok − potonganDiMuka. */
  danaDiterima: Rupiah;
  /** Porsi biaya tenor per bulan — nol: biaya dipotong di muka, bukan diangsur. */
  biayaLayananPerBulan: Rupiah;
  /** Porsi biaya admin per bulan — nol: biaya dipotong di muka. */
  biayaAdminPerBulan: Rupiah;
  /** Porsi biaya platform per bulan — nol: biaya dipotong di muka. */
  biayaPlatformPerBulan: Rupiah;
  /** Bunga setiap bulan — tetap sama karena bunga flat dari pokok penuh. */
  bungaPerBulan: Rupiah;
  /** Cicilan bulan pertama (terbesar pada jadwal pokok tetap). */
  cicilanPerBulan: Rupiah;
  /** Cicilan bulan terakhir (termasuk sisa pembulatan pokok). */
  cicilanTerakhir: Rupiah;
  /** Bunga/margin total selama tenor (hak Pendana). */
  bungaTotal: Rupiah;
  /** Total cicilan yang dibayar Peminjam = Σ cicilan = pokok + bunga. */
  totalPengembalian: Rupiah;
  /** Total biaya Peminjam = potongan di muka + bunga (di luar pengembalian pokok). */
  totalKeuntunganBersih: Rupiah;
  /** Biaya total sebagai persen pokok (1 desimal, gaya Indonesia). */
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
 *  - Tenor 3/6 mengenakan admin 2% + platform 3% (total 5%), tenor lain 3%
 *  - Seluruh biaya dipotong di muka: danaDiterima = pokok − potonganDiMuka
 *  - Jadwal hanya berisi pokok + bunga (Σ jadwal.total = totalPengembalian)
 *  - seluruh tenor resmi memakai bunga flat dari pokok penuh (30%/25%/20%
 *    per bulan sesuai tenor) sehingga cicilan rata
 *  - cicilanPerBulan = cicilan bulan pertama; cicilanTerakhir = cicilan terakhir
 *  - totalKeuntunganBersih = potonganDiMuka + bungaTotal
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
  const metode = metodeBungaBulanan(tenorBulan);

  // Komponen biaya — semua HALF-UP per rupiah via percentOf (BigInt), dan
  // seluruhnya dipotong di muka (tidak pernah masuk ke cicilan).
  const pokokPerBulan = Math.floor(pokokDibiayai / tenorBulan);
  // Tenor flat: bunga selalu dihitung dari pokok penuh.
  const bungaPerBulan = percentOf(pokokDibiayai, persen);
  const bungaFlatPerBulan = metode === "flat" ? bungaPerBulan : 0;
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
  const potonganDiMuka = biayaLayananTotal;
  const danaDiterima = pokokDibiayai - potonganDiMuka;

  // ===== Jadwal: hanya pokok + bunga =====
  const jadwal: CicilanBulananRow[] = [];
  let sisaPokok = pokokDibiayai;
  for (let bulan = 1; bulan <= tenorBulan; bulan += 1) {
    const terakhir = bulan === tenorBulan;
    const rowPokok = terakhir ? sisaPokok : pokokPerBulan;
    const rowBunga =
      bungaFlatPerBulan > 0 ? bungaFlatPerBulan : percentOf(sisaPokok, persen);
    sisaPokok -= rowPokok;
    jadwal.push({
      bulan,
      pokok: rowPokok,
      bunga: rowBunga,
      biayaAdmin: 0,
      biayaPlatform: 0,
      biayaLayanan: 0,
      total: rowPokok + rowBunga,
      sisaPokok,
    });
  }

  const cicilanPerBulan = jadwal[0].total;
  const cicilanTerakhir = jadwal[jadwal.length - 1].total;
  const totalPengembalian = jadwal.reduce((acc, r) => acc + r.total, 0);
  const bungaTotal = jadwal.reduce((acc, r) => acc + r.bunga, 0);
  // Seluruh biaya peminjam = potongan di muka + bunga selama tenor.
  const totalKeuntunganBersih = potonganDiMuka + bungaTotal;
  // Satu desimal (48.0 bukan 48) — mengikuti output formula referensi.
  const persentaseProfitTotal =
    Math.round((totalKeuntunganBersih / pokok) * 1000) / 10;

  return {
    pokok,
    dp,
    pokokDibiayai,
    tenorBulan,
    persenBungaPerBulan: persen,
    metodeBunga: metode,
    biayaAdminTotal,
    biayaPlatformTotal,
    biayaLayananTotal,
    potonganDiMuka,
    danaDiterima,
    biayaLayananPerBulan: 0,
    biayaAdminPerBulan: 0,
    biayaPlatformPerBulan: 0,
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
