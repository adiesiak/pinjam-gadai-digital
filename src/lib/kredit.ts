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
 *  - Sisa harga dibiayai Pendana = pokok dibiayai; skema bulanan memakai
 *    angsuran pokok tetap dan bunga menurun.
 *  - Imbal Hasil Pendana pada skema bulanan mengikuti bunga menurun dari
 *    saldo pokok; tenor 12/24 memakai margin flat per bulan. Bagian Pendana
 *    proporsional dengan porsi pendanaannya (Alokasi Dana).
 *  - Tenor 3/6 bulan memakai biaya admin 5% + platform 2% dari pokok yang
 *    diangsur; tenor 1 bulan tetap layanan 3%. Tenor 12/24 tetap biaya layanan
 *    3% di muka.
 */
import { isRupiah, percentOf, type Rupiah } from "./money";
import {
  hitungSimulasiBulanan,
  TENOR_BULANAN_OPTIONS,
  type CicilanBulananRow,
} from "./bulanan";

/** Batas pokok dibiayai untuk setiap pengajuan baru kredit barang. */
export const KREDIT_BARANG_POKOK_MAKS = 10_000_000 as Rupiah;

/** Tenor yang boleh dipilih untuk pengajuan baru; kontrak 12/24 bulan lama tetap didukung engine. */
export const KREDIT_TENOR_PENGAJUAN_OPTIONS = [1, 3, 6] as const;
export const KREDIT_TENOR_MAKS_BULAN = 6;

/** Apakah pokok kredit barang baru rupiah bulat positif dan dalam batas tetap. */
export function pokokKreditBarangDalamBatas(pokok: number): boolean {
  return Number.isSafeInteger(pokok) && pokok > 0 && pokok <= KREDIT_BARANG_POKOK_MAKS;
}

export const KREDIT_PRICING = {
  /** Uang muka minimum (% dari harga barang). */
  dpMinPersen: 10,
  /** Uang muka maksimum (% dari harga barang). */
  dpMaxPersen: 50,
  /**
   * Pilihan tenor kredit barang (bulan) — tenor 1/3/6 bulan memakai skema
   * bulanan (DP 0%, biaya 7% pada tenor 3/6 dan layanan 3% tenor 1, bunga
   * 30/25/20% per bulan sesuai tenor dari saldo pokok); tenor 12/24 bulan
   * memakai skema DP + margin flat.
   */
  tenorBulanOptions: [1, ...TENOR_BULANAN_OPTIONS.slice(1), 12, 24],
  /** Imbal Hasil minimum per bulan (% dari pokok dibiayai). */
  marginMinPersenPerBulan: 2.5,
  /** Imbal Hasil maksimum per bulan (% dari pokok dibiayai). */
  marginMaxPersenPerBulan: 5,
  /** Biaya layanan platform untuk tenor 12/24, dibayar di muka dalam model. */
  biayaLayananPersen: 3,
  /** Harga barang terendah yang dapat dibiayai. */
  minHargaBarang: 1_000_000,
  /** Harga barang tertinggi yang dapat dibiayai. */
  maxHargaBarang: 100_000_000,
  /** Porsi pendanaan terendah untuk satu Pendana (%). */
  minPorsiPendanaPersen: 10,
} as const;

/** Asumsi awal yang dipakai tampilan & contoh katalog. */
export const KREDIT_ASUMSI_AWAL = {
  dpPersen: 0,
  tenorBulan: 6,
  marginPersenPerBulan: 3.5,
  porsiPendanaPersen: 100,
} as const;

export interface KreditBarangInput {
  /** Harga barang di merchant mitra. */
  hargaBarang: Rupiah;
  /** Uang muka Konsumen (% harga barang, 10–50). */
  dpPersen: number;
  /** Tenor cicilan dalam bulan (3/6/12/24). */
  tenorBulan: number;
  /**
   * Imbal Hasil Pendana per bulan (% dari pokok dibiayai) — hanya dipakai
   * tenor 12/24 bulan (skema DP + margin flat). Tenor 1/3/6 bulan (skema
   * bulanan) mengabaikan nilai ini: bunga mengikuti tenor secara otomatis.
   */
  marginPersenPerBulan: number;
  /** Porsi pokok yang didanai Pendana (%, 10–100). Default 100. */
  porsiPendanaPersen?: number;
}

export interface KreditBarangJadwalRow {
  bulan: number;
  /** Cicilan pokok pada bulan ini. */
  pokok: Rupiah;
  /** Imbal Hasil bulan ini. */
  margin: Rupiah;
  /** Biaya layanan/admin tenor pada baris ini, bila diamortisasi. */
  biayaLayanan: Rupiah;
  /** Porsi biaya admin yang diamortisasi (tenor 3/6). */
  biayaAdmin: Rupiah;
  /** Porsi biaya platform yang diamortisasi (tenor 3/6). */
  biayaPlatform: Rupiah;
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
  /** Total admin tenor 3/6 (5%); nol untuk tenor lain. */
  biayaAdmin: Rupiah;
  /** Total platform tenor 3/6 (2%); nol untuk tenor lain. */
  biayaPlatform: Rupiah;
  /** Imbal Hasil bulan pertama (skema bulanan) atau margin bulanan flat. */
  marginPerBulan: Rupiah;
  /** Total Imbal Hasil selama tenor. */
  marginTotal: Rupiah;
  /** Cicilan bulan pertama dari mesin bulanan, termasuk biaya tenor. */
  cicilanPerBulan: Rupiah;
  /** Cicilan terakhir (menyerap pembulatan pokok). */
  cicilanTerakhir: Rupiah;
  /** DP + seluruh biaya model + pokok dibiayai + total Imbal Hasil. */
  totalDibayarKonsumen: Rupiah;
  jadwal: KreditBarangJadwalRow[];

  // ===== Sisi Pendana (terminologi: Imbal Hasil) =====
  porsiPendanaPersen: number;
  /** Pokok yang didanai Pendana pada alokasi ini. */
  porsiPendana: Rupiah;
  /** Imbal Hasil bulan pertama milik Pendana (proporsional porsi). */
  imbalHasilPerBulan: Rupiah;
  /** Total Imbal Hasil milik Pendana selama tenor (proporsional bunga total). */
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
 * True bila tenor memakai skema bulanan (1/3/6 bulan): DP 0%, biaya tenor
 * 3/6 sebesar 7% (admin+platform) atau layanan 3% (tenor 1), diamortisasi,
 * dan bunga menurun per tenor — input DP/margin manual diabaikan engine.
 * Dipakai UI agar slider yang tidak berpengaruh disembunyikan.
 */
export function skemaBulananKredit(tenorBulan: number): boolean {
  return (TENOR_BULANAN_OPTIONS as readonly number[]).includes(tenorBulan);
}

/**
 * Quote kredit barang — memvalidasi seluruh batas skema lalu menghitung
 * rincian Konsumen, jadwal cicilan, dan hak Imbal Hasil Pendana.
 *
 * Identitas yang dijamin (diuji di kredit.test.ts):
 *  - dp + pokokDibiayai = hargaBarang
 *  - Σ jadwal.pokok = pokokDibiayai · Σ jadwal.margin = marginTotal
 *  - imbalHasil = porsi Pendana × Σ Imbal Hasil pada jadwal (bunga menurun)
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
  // Tenor 1/3/6 bulan (skema bulanan) tidak memakai DP & margin flat —
  // validasi keduanya dilewati; skema DP + margin (12/24 bulan) tetap ketat.
  const skemaBulanan = (TENOR_BULANAN_OPTIONS as readonly number[]).includes(tenorBulan);
  if (
    !skemaBulanan &&
    (!Number.isFinite(dpPersen) ||
      dpPersen < KREDIT_PRICING.dpMinPersen ||
      dpPersen > KREDIT_PRICING.dpMaxPersen)
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
    !Number.isFinite(porsiPendanaPersen) ||
    porsiPendanaPersen < KREDIT_PRICING.minPorsiPendanaPersen ||
    porsiPendanaPersen > 100
  ) {
    throw new Error(
      `Porsi pendanaan harus ${KREDIT_PRICING.minPorsiPendanaPersen}–100%.`,
    );
  }

  // ===== Skema bulanan (tenor 1/3/6 bulan): DP 0%, fee sesuai tenor
  // diamortisasi, bunga menurun — mesin bulanan yang sama dengan pinjaman tunai.
  // bunga = Imbal Hasil Pendana.
  if (skemaBulanan) {
    const sim = hitungSimulasiBulanan(hargaBarang, tenorBulan);
    const jadwal: KreditBarangJadwalRow[] = sim.jadwal.map(
      (r: CicilanBulananRow) => ({
        bulan: r.bulan,
        pokok: r.pokok,
        margin: r.bunga,
        biayaLayanan: r.biayaLayanan,
        biayaAdmin: r.biayaAdmin,
        biayaPlatform: r.biayaPlatform,
        total: r.total,
        sisaPokok: r.sisaPokok,
      }),
    );

    // ===== Hak Pendana: proporsional terhadap porsi pendanaan =====
    // (DP 0% → pokok dibiayai = harga barang.)
    const porsiPendanaBulanan = percentOf(hargaBarang, porsiPendanaPersen);
    const imbalHasilPerBulanBulanan = percentOf(sim.bungaPerBulan, porsiPendanaPersen);
    const imbalHasilBulanan = percentOf(sim.bungaTotal, porsiPendanaPersen);
    const persenImbalHasilBulanan =
      porsiPendanaBulanan > 0
        ? bulatDuaDesimal((imbalHasilBulanan / porsiPendanaBulanan) * 100)
        : 0;

    return {
      hargaBarang,
      dp: sim.dp,
      pokokDibiayai: sim.pokokDibiayai,
      biayaLayanan: sim.biayaLayananTotal,
      biayaAdmin: sim.biayaAdminTotal,
      biayaPlatform: sim.biayaPlatformTotal,
      marginPerBulan: sim.bungaPerBulan,
      marginTotal: sim.bungaTotal,
      cicilanPerBulan: sim.cicilanPerBulan,
      cicilanTerakhir: sim.cicilanTerakhir,
      totalDibayarKonsumen: sim.totalPengembalian,
      jadwal,
      porsiPendanaPersen,
      porsiPendana: porsiPendanaBulanan,
      imbalHasilPerBulan: imbalHasilPerBulanBulanan,
      imbalHasil: imbalHasilBulanan,
      totalDiterima: porsiPendanaBulanan + imbalHasilBulanan,
      persenImbalHasil: persenImbalHasilBulanan,
      persenImbalHasilTahunan: bulatDuaDesimal(
        (persenImbalHasilBulanan * 12) / tenorBulan,
      ),
    };
  }
  if (
    !skemaBulanan &&
    (!Number.isFinite(marginPersenPerBulan) ||
      marginPersenPerBulan < KREDIT_PRICING.marginMinPersenPerBulan ||
      marginPersenPerBulan > KREDIT_PRICING.marginMaxPersenPerBulan)
  ) {
    throw new Error(
      `Imbal Hasil harus ${KREDIT_PRICING.marginMinPersenPerBulan}–${KREDIT_PRICING.marginMaxPersenPerBulan}% per bulan.`,
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
      biayaLayanan: 0,
      biayaAdmin: 0,
      biayaPlatform: 0,
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
    biayaAdmin: 0,
    biayaPlatform: 0,
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

/** Konteks kumulatif pembagian cicilan — dipakai untuk menghapus drift. */
export interface KreditDistribusiKonteks {
  /** Total pokok cicilan yang sudah dibagikan pada bulan-bulan sebelumnya. */
  pokokSebelumnya: Rupiah;
  /** Total Imbal Hasil yang sudah dibagikan pada bulan-bulan sebelumnya. */
  marginSebelumnya: Rupiah;
}

/** Indeks alokasi terbesar — pemegang porsi ini menanggung pembulatan. */
function indeksAlokasiTerbesar(alokasi: readonly Rupiah[]): number {
  let idx = 0;
  for (let i = 1; i < alokasi.length; i += 1) {
    if (alokasi[i] > alokasi[idx]) idx = i;
  }
  return idx;
}

/** Validasi umum: pokok dibiayai = Σ alokasi, semua rupiah bulat positif. */
function validasiAlokasi(pokokDibiayai: Rupiah, alokasi: readonly Rupiah[]): void {
  if (!isRupiah(pokokDibiayai) || pokokDibiayai <= 0) {
    throw new Error("Pokok dibiayai harus rupiah bulat positif.");
  }
  if (alokasi.length === 0) {
    throw new Error("Tidak ada posisi Pendana untuk dibagi.");
  }
  if (alokasi.some((a) => !isRupiah(a) || a <= 0)) {
    throw new Error("Setiap alokasi Pendana harus rupiah bulat positif.");
  }
  if (alokasi.reduce((acc, a) => acc + a, 0) !== pokokDibiayai) {
    throw new Error(
      "Total Alokasi Dana Pendana tidak sama dengan pokok dibiayai — pendanaan belum penuh.",
    );
  }
}

/**
 * Bagi satu cicilan (pokok + Imbal Hasil) ke porsi tiap Pendana secara
 * proporsional terhadap Alokasi Dana mereka.
 *
 * Identitas yang dijamin (diuji di kredit.test.ts):
 *  - Σ hasil.pokok = pokok                       (tanpa kehilangan satu rupiah)
 *  - Σ hasil.margin = margin
 *  - bila `konteks` kumulatif disertakan: saat tenor selesai setiap Pendana
 *    menerima pokok TEPAT sebesar Alokasi Dananya dan Imbal Hasil tepat
 *    sebesar haknya — pembulatan per bulan tidak menumpuk jadi drift.
 *
 * Semua alokasi dibulatkan ke bawah (selisih floor kumulatif), lalu selisih
 * pembulatan (dust) ditanggung alokasi terbesar — pola yang sama dengan
 * distribusi pelunasan pinjaman tunai.
 */
export function bagiCicilanKePendana(
  pokok: Rupiah,
  margin: Rupiah,
  pokokDibiayai: Rupiah,
  alokasi: readonly Rupiah[],
  konteks?: KreditDistribusiKonteks,
): PorsiCicilan[] {
  if (!isRupiah(pokok) || pokok <= 0 || !isRupiah(margin) || margin < 0) {
    throw new Error("Cicilan pokok & Imbal Hasil harus rupiah bulat (pokok > 0).");
  }
  validasiAlokasi(pokokDibiayai, alokasi);

  const sebelum = konteks ?? { pokokSebelumnya: 0, marginSebelumnya: 0 };
  if (
    !isRupiah(sebelum.pokokSebelumnya) ||
    sebelum.pokokSebelumnya < 0 ||
    !isRupiah(sebelum.marginSebelumnya) ||
    sebelum.marginSebelumnya < 0
  ) {
    throw new Error("Konteks pembagian harus rupiah bulat non-negatif.");
  }

  const idxTerbesar = indeksAlokasiTerbesar(alokasi);
  const bagianKumulatif = (cumSebelum: Rupiah, cumSesudah: Rupiah, i: number) =>
    Math.floor((cumSesudah * alokasi[i]) / pokokDibiayai) -
    Math.floor((cumSebelum * alokasi[i]) / pokokDibiayai);

  const hasil: PorsiCicilan[] = alokasi.map((_, i) =>
    i === idxTerbesar
      ? { pokok: 0, margin: 0, total: 0 }
      : {
          pokok: bagianKumulatif(
            sebelum.pokokSebelumnya,
            sebelum.pokokSebelumnya + pokok,
            i,
          ),
          margin: bagianKumulatif(
            sebelum.marginSebelumnya,
            sebelum.marginSebelumnya + margin,
            i,
          ),
          total: 0,
        },
  );

  // Alokasi terbesar = sisa cicilan bulan ini; selalu >= 0 karena hanya
  // porsi terbesar yang porsinya tidak dibulatkan ke bawah.
  hasil[idxTerbesar].pokok = pokok - hasil.reduce((acc, x) => acc + x.pokok, 0);
  hasil[idxTerbesar].margin = margin - hasil.reduce((acc, x) => acc + x.margin, 0);

  for (const x of hasil) x.total = x.pokok + x.margin;
  return hasil;
}

/**
 * Hak Imbal Hasil tiap alokasi atas seluruh Imbal Hasil satu pengajuan,
 * memakai konvensi yang sama dengan bagiCicilanKePendana: semua alokasi
 * dibulatkan ke bawah, alokasi terbesar menyerap selisih — sehingga
 * Σ hak = marginTotal tepat dan hak tersimpan = hak yang diterima saat lunas.
 */
export function hakImbalHasilPerAlokasi(
  marginTotal: Rupiah,
  pokokDibiayai: Rupiah,
  alokasi: readonly Rupiah[],
): Rupiah[] {
  if (!isRupiah(marginTotal) || marginTotal < 0) {
    throw new Error("Total Imbal Hasil harus rupiah bulat non-negatif.");
  }
  validasiAlokasi(pokokDibiayai, alokasi);

  const idxTerbesar = indeksAlokasiTerbesar(alokasi);
  const hak = alokasi.map((a, i) =>
    i === idxTerbesar ? 0 : Math.floor((marginTotal * a) / pokokDibiayai),
  );
  hak[idxTerbesar] = marginTotal - hak.reduce((acc, x) => acc + x, 0);
  return hak;
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
