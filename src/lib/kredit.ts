/**
 * PINDAI — Engine Skema C: KREDIT BARANG (elektronik & marketplace).
 *
 * Guardrail Rule 3: semua uang integer rupiah, pembulatan HALF-UP via percentOf
 * (BigInt) — tanpa floating-point error.
 * Guardrail Rule 2: hak finansial Pendana disebut "Imbal Hasil" — bukan
 * ROI/return/investasi.
 *
 * Aturan skema (dipakai kalkulator pendanaan):
 *  - Konsumen membeli barang dari merchant mitra (marketplace / toko
 *    elektronik) dengan uang muka (DP) 10–50% dari harga barang.
 *  - Sisa harga dibiayai Pendana = pokok dibiayai, dicicil bulanan flat.
 *  - Imbal Hasil Pendana = margin flat per bulan (% dari pokok dibiayai),
 *    dibayarkan selama tenor; bagian Pendana proporsional dengan porsi
 *    pendanaannya (Alokasi Dana).
 *  - Biaya layanan platform 1% dari pokok dibiayai, dibayar Konsumen di muka.
 */
import { isRupiah, percentOf, type Rupiah } from "./money";

export const KREDIT_PRICING = {
  /** Uang muka minimum (% dari harga barang). */
  dpMinPersen: 10,
  /** Uang muka maksimum (% dari harga barang). */
  dpMaxPersen: 50,
  /** Pilihan tenor kredit barang (bulan). */
  tenorBulanOptions: [3, 6, 12, 24],
  /** Imbal Hasil minimum per bulan (% dari pokok dibiayai). */
  marginMinPersenPerBulan: 1.5,
  /** Imbal Hasil maksimum per bulan (% dari pokok dibiayai). */
  marginMaxPersenPerBulan: 4,
  /** Biaya layanan platform, % dari pokok dibiayai (dibayar Konsumen). */
  biayaLayananPersen: 1,
  /** Harga barang terendah yang dapat dibiayai. */
  minHargaBarang: 1_000_000,
  /** Harga barang tertinggi yang dapat dibiayai. */
  maxHargaBarang: 100_000_000,
  /** Porsi pendanaan terendah untuk satu Pendana (%). */
  minPorsiPendanaPersen: 10,
} as const;

/** Asumsi awal yang dipakai tampilan & contoh katalog. */
export const KREDIT_ASUMSI_AWAL = {
  dpPersen: 20,
  tenorBulan: 12,
  marginPersenPerBulan: 2.5,
  porsiPendanaPersen: 100,
} as const;

export interface KreditBarangInput {
  /** Harga barang di merchant mitra. */
  hargaBarang: Rupiah;
  /** Uang muka Konsumen (% harga barang, 10–50). */
  dpPersen: number;
  /** Tenor cicilan dalam bulan (3/6/12/24). */
  tenorBulan: number;
  /** Imbal Hasil Pendana per bulan (% dari pokok dibiayai, 1,5–4). */
  marginPersenPerBulan: number;
  /** Porsi pokok yang didanai Pendana (%, 10–100). Default 100. */
  porsiPendanaPersen?: number;
}

export interface KreditBarangJadwalRow {
  bulan: number;
  /** Cicilan pokok pada bulan ini. */
  pokok: Rupiah;
  /** Imbal Hasil bulan ini (flat selama tenor). */
  margin: Rupiah;
  /** Total cicilan bulan ini. */
  total: Rupiah;
  /** Sisa pokok dibiayai setelah cicilan bulan ini. */
  sisaPokok: Rupiah;
}

export interface KreditBarangQuote {
  // ===== Sisi Konsumen =====
  hargaBarang: Rupiah;
  dp: Rupiah;
  pokokDibiayai: Rupiah;
  biayaLayanan: Rupiah;
  /** Imbal Hasil per bulan (flat). */
  marginPerBulan: Rupiah;
  /** Total Imbal Hasil selama tenor. */
  marginTotal: Rupiah;
  /** Cicilan bulanan normal = pokok/tenor + Imbal Hasil bulanan. */
  cicilanPerBulan: Rupiah;
  /** Cicilan terakhir (menyerap pembulatan pokok). */
  cicilanTerakhir: Rupiah;
  /** DP + biaya layanan + pokok dibiayai + total Imbal Hasil. */
  totalDibayarKonsumen: Rupiah;
  jadwal: KreditBarangJadwalRow[];

  // ===== Sisi Pendana (terminologi: Imbal Hasil) =====
  porsiPendanaPersen: number;
  /** Pokok yang didanai Pendana pada alokasi ini. */
  porsiPendana: Rupiah;
  /** Imbal Hasil bulanan milik Pendana (proporsional porsi). */
  imbalHasilPerBulan: Rupiah;
  /** Total Imbal Hasil milik Pendana selama tenor. */
  imbalHasil: Rupiah;
  /** Porsi pokok + total Imbal Hasil yang diterima Pendana. */
  totalDiterima: Rupiah;
  /** Imbal Hasil sebagai persen dari porsi pendanaan (2 desimal). */
  persenImbalHasil: number;
  /** Setara persen Imbal Hasil per tahun (2 desimal). */
  persenImbalHasilTahunan: number;
}

function bulatDuaDesimal(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Quote kredit barang — memvalidasi seluruh batas skema lalu menghitung
 * rincian Konsumen, jadwal cicilan, dan hak Imbal Hasil Pendana.
 *
 * Identitas yang dijamin (diuji di kredit.test.ts):
 *  - dp + pokokDibiayai = hargaBarang
 *  - Σ jadwal.pokok = pokokDibiayai · Σ jadwal.margin = marginTotal
 *  - imbalHasil = imbalHasilPerBulan × tenorBulan
 *  - totalDiterima = porsiPendana + imbalHasil
 */
export function quoteKreditBarang(input: KreditBarangInput): KreditBarangQuote {
  const { hargaBarang, dpPersen, tenorBulan, marginPersenPerBulan } = input;
  const porsiPendanaPersen = input.porsiPendanaPersen ?? 100;

  if (
    !isRupiah(hargaBarang) ||
    hargaBarang < KREDIT_PRICING.minHargaBarang ||
    hargaBarang > KREDIT_PRICING.maxHargaBarang
  ) {
    throw new Error(
      `Harga barang harus antara ${KREDIT_PRICING.minHargaBarang} dan ${KREDIT_PRICING.maxHargaBarang} rupiah.`,
    );
  }
  if (
    !Number.isFinite(dpPersen) ||
    dpPersen < KREDIT_PRICING.dpMinPersen ||
    dpPersen > KREDIT_PRICING.dpMaxPersen
  ) {
    throw new Error(
      `Uang muka (DP) harus ${KREDIT_PRICING.dpMinPersen}–${KREDIT_PRICING.dpMaxPersen}% dari harga barang.`,
    );
  }
  if (!(KREDIT_PRICING.tenorBulanOptions as readonly number[]).includes(tenorBulan)) {
    throw new Error(
      `Tenor harus salah satu dari ${KREDIT_PRICING.tenorBulanOptions.join(" / ")} bulan.`,
    );
  }
  if (
    !Number.isFinite(marginPersenPerBulan) ||
    marginPersenPerBulan < KREDIT_PRICING.marginMinPersenPerBulan ||
    marginPersenPerBulan > KREDIT_PRICING.marginMaxPersenPerBulan
  ) {
    throw new Error(
      `Imbal Hasil harus ${KREDIT_PRICING.marginMinPersenPerBulan}–${KREDIT_PRICING.marginMaxPersenPerBulan}% per bulan.`,
    );
  }
  if (
    !Number.isFinite(porsiPendanaPersen) ||
    porsiPendanaPersen < KREDIT_PRICING.minPorsiPendanaPersen ||
    porsiPendanaPersen > 100
  ) {
    throw new Error(
      `Porsi pendanaan harus ${KREDIT_PRICING.minPorsiPendanaPersen}–100%.`,
    );
  }

  const dp = percentOf(hargaBarang, dpPersen);
  const pokokDibiayai = hargaBarang - dp;
  if (pokokDibiayai <= 0) {
    throw new Error("Uang muka tidak boleh menutup seluruh harga barang.");
  }
  const biayaLayanan = percentOf(pokokDibiayai, KREDIT_PRICING.biayaLayananPersen);
  const marginPerBulan = percentOf(pokokDibiayai, marginPersenPerBulan);
  const marginTotal = marginPerBulan * tenorBulan;

  // ===== Jadwal cicilan: pokok dibagi rata, sisa pembulatan di bulan terakhir.
  const pokokPerBulan = Math.floor(pokokDibiayai / tenorBulan);
  const jadwal: KreditBarangJadwalRow[] = [];
  let sisa = pokokDibiayai;
  for (let bulan = 1; bulan <= tenorBulan; bulan += 1) {
    const pokok = bulan === tenorBulan ? sisa : pokokPerBulan;
    sisa -= pokok;
    jadwal.push({
      bulan,
      pokok,
      margin: marginPerBulan,
      total: pokok + marginPerBulan,
      sisaPokok: sisa,
    });
  }

  // ===== Hak Pendana: proporsional terhadap porsi pendanaan.
  const porsiPendana = percentOf(pokokDibiayai, porsiPendanaPersen);
  const imbalHasilPerBulan = percentOf(marginPerBulan, porsiPendanaPersen);
  const imbalHasil = imbalHasilPerBulan * tenorBulan;
  const persenImbalHasil =
    porsiPendana > 0 ? bulatDuaDesimal((imbalHasil / porsiPendana) * 100) : 0;

  return {
    hargaBarang,
    dp,
    pokokDibiayai,
    biayaLayanan,
    marginPerBulan,
    marginTotal,
    cicilanPerBulan: pokokPerBulan + marginPerBulan,
    cicilanTerakhir: jadwal[jadwal.length - 1].total,
    totalDibayarKonsumen: dp + biayaLayanan + pokokDibiayai + marginTotal,
    jadwal,
    porsiPendanaPersen,
    porsiPendana,
    imbalHasilPerBulan,
    imbalHasil,
    totalDiterima: porsiPendana + imbalHasil,
    persenImbalHasil,
    persenImbalHasilTahunan: bulatDuaDesimal(
      (persenImbalHasil * 12) / tenorBulan,
    ),
  };
}

/** Porsi satu cicilan milik seorang Pendana. */
export interface PorsiCicilan {
  /** Bagian pokok yang kembali ke Pendana ini. */
  pokok: Rupiah;
  /** Bagian Imbal Hasil bulan ini untuk Pendana ini. */
  margin: Rupiah;
  /** Total penerimaan Pendana bulan ini = pokok + margin. */
  total: Rupiah;
}

/**
 * Bagi satu cicilan (pokok + Imbal Hasil) ke porsi tiap Pendana secara
 * proporsional terhadap Alokasi Dana mereka.
 *
 * Identitas yang dijamin (diuji di kredit.test.ts):
 *  - Σ hasil.pokok = pokok          (tanpa kehilangan satu rupiah pun)
 *  - Σ hasil.margin = margin
 * Pembagian dibulatkan ke bawah per alokasi; selisih pembulatan (dust)
 * diberikan ke alokasi terbesar — pemegang porsi terbesar menyerap dust,
 * pola yang sama dengan distribusi pelunasan pinjaman tunai.
 */
export function bagiCicilanKePendana(
  pokok: Rupiah,
  margin: Rupiah,
  pokokDibiayai: Rupiah,
  alokasi: readonly Rupiah[],
): PorsiCicilan[] {
  if (!isRupiah(pokok) || pokok <= 0 || !isRupiah(margin) || margin < 0) {
    throw new Error("Cicilan pokok & Imbal Hasil harus rupiah bulat (pokok > 0).");
  }
  if (!isRupiah(pokokDibiayai) || pokokDibiayai <= 0) {
    throw new Error("Pokok dibiayai harus rupiah bulat positif.");
  }
  if (alokasi.length === 0) {
    throw new Error("Tidak ada posisi Pendana untuk dibagi.");
  }
  if (alokasi.some((a) => !isRupiah(a) || a <= 0)) {
    throw new Error("Setiap alokasi Pendana harus rupiah bulat positif.");
  }
  const totalAlokasi = alokasi.reduce((acc, a) => acc + a, 0);
  if (totalAlokasi !== pokokDibiayai) {
    throw new Error(
      "Total Alokasi Dana Pendana tidak sama dengan pokok dibiayai — pendanaan belum penuh.",
    );
  }

  const hasil: PorsiCicilan[] = alokasi.map((a) => ({
    pokok: Math.floor((pokok * a) / pokokDibiayai),
    margin: Math.floor((margin * a) / pokokDibiayai),
    total: 0,
  }));
  const dustPokok = pokok - hasil.reduce((acc, x) => acc + x.pokok, 0);
  const dustMargin = margin - hasil.reduce((acc, x) => acc + x.margin, 0);

  // Alokasi terbesar menyerap dust (selalu >= 0 dan < jumlah Pendana).
  let idxTerbesar = 0;
  for (let i = 1; i < alokasi.length; i += 1) {
    if (alokasi[i] > alokasi[idxTerbesar]) idxTerbesar = i;
  }
  hasil[idxTerbesar].pokok += dustPokok;
  hasil[idxTerbesar].margin += dustMargin;

  for (const x of hasil) x.total = x.pokok + x.margin;
  return hasil;
}

/** Contoh barang merchant mitra untuk simulasi kalkulator. */
export interface ContohBarang {
  nama: string;
  kategori: string;
  sumber: string;
  harga: Rupiah;
}

export const KATALOG_CONTOH: readonly ContohBarang[] = [
  {
    nama: "Smartphone kelas menengah",
    kategori: "Elektronik",
    sumber: "Marketplace mitra",
    harga: 4_500_000,
  },
  {
    nama: "Smartphone flagship",
    kategori: "Elektronik",
    sumber: "Marketplace mitra",
    harga: 14_000_000,
  },
  {
    nama: "Laptop kerja & edukasi",
    kategori: "Elektronik",
    sumber: "Toko elektronik mitra",
    harga: 9_500_000,
  },
  {
    nama: "TV LED 43 inci",
    kategori: "Elektronik",
    sumber: "Marketplace mitra",
    harga: 5_500_000,
  },
  {
    nama: "Mesin cuci 1 tabung",
    kategori: "Peralatan rumah",
    sumber: "Toko elektronik mitra",
    harga: 3_900_000,
  },
  {
    nama: "Sepeda listrik",
    kategori: "Kendaraan ringan",
    sumber: "Marketplace mitra",
    harga: 6_800_000,
  },
] as const;
