/**
 * PINDAI — Engine Skema C: KREDIT BARANG (elektronik & marketplace).
 *
 * Guardrail Rule 3: semua uang integer rupiah, pembulatan HALF-UP via percentOf
 * (BigInt) — tanpa floating-point error.
 * Guardrail Rule 2: hak finansial penyedia dana disebut "Imbal Hasil" — bukan
 * ROI/return/investasi.
 *
 * Aturan skema (dipakai kalkulator pendanaan):
 *  - Konsumen membeli barang dari merchant mitra (marketplace / toko
 *    elektronik) dengan uang muka (DP) 10–50% dari harga barang.
 *  - Sisa harga dibiayai penyedia dana = pokok dibiayai; skema bulanan memakai
 *    angsuran pokok tetap dan bunga flat dari pokok penuh (cicilan rata).
 *  - Imbal Hasil penyedia dana pada skema bulanan dihitung FLAT dari pokok penuh
 *    (30% tenor 1 bulan, 25% tenor 3 bulan, 20% tenor 6 bulan per bulan).
 *    Skema DP + margin flat 12/24 bulan hanya untuk kontrak warisan (tidak
 *    ditawarkan lagi). Bagian penyedia dana proporsional dengan porsi pendanaannya.
 *  - Seluruh tenor resmi (1/3/6 bulan) memakai biaya admin 2% (platform 0%)
 *    dari pokok, DIPOTONG DI MUKA (= 2%); setiap pembayaran bulanan juga dikenai
 *    biaya admin cicilan 2% dari nominal cicilan. Kontrak lama 12/24 tetap
 *    layanan 3% dan tanpa biaya admin cicilan.
 */
import { isRupiah, percentOf, type Rupiah } from "./money";
import {
  hitungSimulasiBulanan,
  tarifBulananAman,
  TENOR_BULANAN_OPTIONS,
  type CicilanBulananRow,
  type TarifBulanan,
} from "./bulanan";

/** Batas pokok dibiayai untuk setiap pengajuan baru kredit barang. */
export const KREDIT_BARANG_POKOK_MAKS = 10_000_000 as Rupiah;

/**
 * Tenor yang boleh dipilih untuk pengajuan baru — 1/3/6 bulan. Pilihan 12/24
 * bulan DIHAPUS; kontrak lama tetap bisa dihitung engine (lihat
 * KREDIT_TENOR_DIDUKUNG_ENGINE) agar data warisan tidak rusak.
 */
export const KREDIT_TENOR_PENGAJUAN_OPTIONS = [1, 3, 6] as const;
export const KREDIT_TENOR_MAKS_BULAN = 6;

/**
 * Tenor yang masih dihitung engine demi kompatibilitas data warisan
 * (kontrak 12/24 bulan sebelum pilihan itu dihapus). Tidak ditawarkan lagi
 * pada pengajuan baru.
 */
export const KREDIT_TENOR_DIDUKUNG_ENGINE = [1, 3, 6, 12, 24] as const;

/**
 * Tenor kredit barang yang dikenai biaya admin 2% (platform 0%) = 2% dari
 * pokok, dipotong di muka — berlaku untuk SELURUH tenor resmi kredit barang
 * (1, 3, dan 6 bulan). Kontrak warisan 12/24 tetap memakai biaya layanan 3%
 * (dibekukan agar angka kontrak lama tidak berubah).
 */
export const KREDIT_TENOR_BIAYA_ADMIN_PLATFORM: readonly number[] =
  KREDIT_TENOR_PENGAJUAN_OPTIONS;

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
   * Pilihan tenor kredit barang (bulan) = KREDIT_TENOR_PENGAJUAN_OPTIONS:
   * 1/3/6 bulan dengan skema bulanan (DP 0%, biaya admin 2% dari pokok untuk
   * SELURUH tenor resmi, dipotong di muka; bunga FLAT dari
   * pokok penuh 30%/35%/30% per bulan sesuai tenor; TAMBAHAN biaya admin
   * cicilan 2% dari nominal cicilan pada setiap pembayaran bulanan). Tenor 12/24 bulan tidak
   * ditawarkan lagi — kontrak warisan itu memakai layanan 3% di muka.
   */
  tenorBulanOptions: KREDIT_TENOR_PENGAJUAN_OPTIONS,
  /** Imbal Hasil minimum per bulan (% dari pokok dibiayai). */
  marginMinPersenPerBulan: 2.5,
  /** Imbal Hasil maksimum per bulan (% dari pokok dibiayai). */
  marginMaxPersenPerBulan: 5,
  /**
   * Biaya layanan untuk kontrak warisan 12/24 (skema DP + margin), dibayar di
   * muka. Sengaja TIDAK ikut turun ke 2%: angka kontrak lama harus tetap
   * seperti saat ditandatangani, sedangkan pengajuan baru 1/3/6 bulan memakai
   * biaya admin 2% dari mesin bulanan.
   */
  biayaLayananPersen: 3,
  /** Harga barang terendah yang dapat dibiayai. */
  minHargaBarang: 1_000_000,
  /** Harga barang tertinggi yang dapat dibiayai. */
  maxHargaBarang: 100_000_000,
  /** Porsi pendanaan terendah untuk satu penyedia dana (%). */
  minPorsiDanaPersen: 10,
} as const;

/** Asumsi awal yang dipakai tampilan & contoh katalog. */
export const KREDIT_ASUMSI_AWAL = {
  dpPersen: 0,
  tenorBulan: 6,
  marginPersenPerBulan: 3.5,
  porsiDanaPersen: 100,
} as const;

export interface KreditBarangInput {
  /** Harga barang di merchant mitra. */
  hargaBarang: Rupiah;
  /** Uang muka Konsumen (% harga barang, 10–50). */
  dpPersen: number;
  /** Tenor cicilan dalam bulan (1/3/6 untuk pengajuan baru; 12/24 warisan). */
  tenorBulan: number;
  /**
   * Imbal Hasil penyedia dana per bulan (% dari pokok dibiayai) — hanya dipakai
   * kontrak warisan 12/24 bulan (skema DP + margin flat). Tenor 1/3/6 bulan
   * (skema bulanan) mengabaikan nilai ini: bunga mengikuti tenor otomatis.
   */
  marginPersenPerBulan: number;
  /** Porsi pokok yang didanai penyedia dana (%, 10–100). Default 100. */
  porsiDanaPersen?: number;
  /**
   * Tarif bulanan yang berlaku (Pengaturan Sistem). Hanya dipakai tenor
   * 1/3/6 bulan; kosong = tarif bawaan.
   */
  tarif?: Partial<TarifBulanan> | null;
}

export interface KreditBarangJadwalRow {
  bulan: number;
  /** Cicilan pokok pada bulan ini. */
  pokok: Rupiah;
  /** Imbal Hasil bulan ini. */
  margin: Rupiah;
  /** Biaya layanan tenor pada baris ini — selalu nol (biaya dipotong di muka). */
  biayaLayanan: Rupiah;
  /**
   * Biaya admin cicilan 2% dari nominal cicilan baris ini — dibayar bersama
   * setiap cicilan pada tenor resmi (1, 3, 6 bulan); nol pada tenor warisan.
   */
  biayaAdmin: Rupiah;
  /** Porsi biaya platform pada baris ini — nol, dipotong di muka. */
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
  /** Total biaya admin 2% dari pokok (seluruh tenor resmi); dipotong di muka. */
  biayaAdmin: Rupiah;
  /** Total biaya platform (0% — dihapus) dari pokok; field dipertahankan agar
   * rincian di UI/kontrak tetap punya satu nilai eksplisit. */
  biayaPlatform: Rupiah;
  /** Total biaya admin cicilan 2% (semua tenor resmi); nol pada tenor warisan. */
  biayaAdminCicilanTotal: Rupiah;
  /** Imbal Hasil bulan pertama (skema bulanan) atau margin bulanan flat. */
  marginPerBulan: Rupiah;
  /** Total Imbal Hasil selama tenor. */
  marginTotal: Rupiah;
  /** Cicilan bulan pertama dari mesin bulanan, termasuk biaya tenor. */
  cicilanPerBulan: Rupiah;
  /** Cicilan terakhir (menyerap pembulatan pokok). */
  cicilanTerakhir: Rupiah;
  /** Tarif bulanan yang dipakai hitungan (snapshot untuk kontrak & tampilan). */
  tarifBulanan: TarifBulanan;
  /** DP + seluruh biaya model + pokok dibiayai + total Imbal Hasil. */
  totalDibayarKonsumen: Rupiah;
  jadwal: KreditBarangJadwalRow[];

  // ===== Sisi penyedia dana (terminologi: Imbal Hasil) =====
  porsiDanaPersen: number;
  /** Pokok yang didanai penyedia dana pada alokasi ini. */
  porsiDana: Rupiah;
  /** Imbal Hasil bulan pertama milik penyedia dana (proporsional porsi). */
  imbalHasilPerBulan: Rupiah;
  /** Total Imbal Hasil milik penyedia dana selama tenor (proporsional bunga total). */
  imbalHasil: Rupiah;
  /** Porsi pokok + total Imbal Hasil yang diterima penyedia dana. */
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
 * True bila tenor memakai skema bulanan (1/3/6 bulan): DP 0%, biaya 2%
 * (admin 2%, platform dihapus) dari pokok untuk seluruh tenor resmi — dipotong
 * di muka, setiap pembayaran menambah biaya admin cicilan 2% — dan bunga flat per
 * tenor; input DP/margin manual diabaikan engine.
 * Dipakai UI agar slider yang tidak berpengaruh disembunyikan.
 */
export function skemaBulananKredit(tenorBulan: number): boolean {
  return (TENOR_BULANAN_OPTIONS as readonly number[]).includes(tenorBulan);
}

/**
 * Quote kredit barang — memvalidasi seluruh batas skema lalu menghitung
 * rincian Konsumen, jadwal cicilan, dan hak Imbal Hasil penyedia dana.
 *
 * Identitas yang dijamin (diuji di kredit.test.ts):
 *  - dp + pokokDibiayai = hargaBarang
 *  - Σ jadwal.pokok = pokokDibiayai · Σ jadwal.margin = marginTotal
 *  - imbalHasil = porsi penyedia dana × Σ Imbal Hasil pada jadwal (menurun/flat)
 *  - totalDiterima = porsiDana + imbalHasil
 */
export function quoteKreditBarang(input: KreditBarangInput): KreditBarangQuote {
  const { hargaBarang, dpPersen, tenorBulan, marginPersenPerBulan } = input;
  const porsiDanaPersen = input.porsiDanaPersen ?? 100;

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
  // validasi keduanya dilewati; skema DP + margin (warisan 12/24) tetap ketat.
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
  if (
    !(KREDIT_TENOR_DIDUKUNG_ENGINE as readonly number[]).includes(tenorBulan)
  ) {
    throw new Error(
      `Tenor harus salah satu dari ${KREDIT_TENOR_DIDUKUNG_ENGINE.join(" / ")} bulan.`,
    );
  }
  if (
    !Number.isFinite(porsiDanaPersen) ||
    porsiDanaPersen < KREDIT_PRICING.minPorsiDanaPersen ||
    porsiDanaPersen > 100
  ) {
    throw new Error(
      `Porsi pendanaan harus ${KREDIT_PRICING.minPorsiDanaPersen}–100%.`,
    );
  }

  // ===== Skema bulanan (tenor 1/3/6 bulan): DP 0%, fee sesuai tenor
  // dipotong di muka, bunga menurun — mesin bulanan yang sama dengan pinjaman tunai.
  // bunga = Imbal Hasil penyedia dana.
  if (skemaBulanan) {
    // Skema kredit menyeragamkan biaya admin 2% di semua tenor resminya
    // (termasuk tenor 1 bulan) — potongan di muka 2%, dana diterima 98%.
    const sim = hitungSimulasiBulanan(hargaBarang, tenorBulan, {
      tenorBiayaAdminPlatform: KREDIT_TENOR_BIAYA_ADMIN_PLATFORM,
      tarif: input.tarif ?? null,
    });
    const jadwal: KreditBarangJadwalRow[] = sim.jadwal.map(
      (r: CicilanBulananRow) => ({
        bulan: r.bulan,
        pokok: r.pokok,
        margin: r.bunga,
        biayaLayanan: r.biayaLayanan,
        biayaAdmin: r.biayaAdminCicilan,
        biayaPlatform: r.biayaPlatform,
        total: r.total,
        sisaPokok: r.sisaPokok,
      }),
    );

    // ===== Hak penyedia dana: proporsional terhadap porsi pendanaan =====
    // (DP 0% → pokok dibiayai = harga barang.)
    const porsiDanaBulanan = percentOf(hargaBarang, porsiDanaPersen);
    const imbalHasilPerBulanBulanan = percentOf(sim.bungaPerBulan, porsiDanaPersen);
    const imbalHasilBulanan = percentOf(sim.bungaTotal, porsiDanaPersen);
    const persenImbalHasilBulanan =
      porsiDanaBulanan > 0
        ? bulatDuaDesimal((imbalHasilBulanan / porsiDanaBulanan) * 100)
        : 0;

    return {
      hargaBarang,
      dp: sim.dp,
      pokokDibiayai: sim.pokokDibiayai,
      biayaLayanan: sim.biayaLayananTotal,
      biayaAdmin: sim.biayaAdminTotal,
      biayaPlatform: sim.biayaPlatformTotal,
      biayaAdminCicilanTotal: sim.biayaAdminCicilanTotal,
      marginPerBulan: sim.bungaPerBulan,
      marginTotal: sim.bungaTotal,
      cicilanPerBulan: sim.cicilanPerBulan,
      cicilanTerakhir: sim.cicilanTerakhir,
      tarifBulanan: sim.tarif,
      // Konsumen membayar cicilan (pokok + Imbal Hasil) PLUS biaya di muka.
      totalDibayarKonsumen: sim.totalPengembalian + sim.potonganDiMuka,
      jadwal,
      porsiDanaPersen,
      porsiDana: porsiDanaBulanan,
      imbalHasilPerBulan: imbalHasilPerBulanBulanan,
      imbalHasil: imbalHasilBulanan,
      totalDiterima: porsiDanaBulanan + imbalHasilBulanan,
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

  // ===== Hak penyedia dana: proporsional terhadap porsi pendanaan.
  const porsiDana = percentOf(pokokDibiayai, porsiDanaPersen);
  const imbalHasilPerBulan = percentOf(marginPerBulan, porsiDanaPersen);
  const imbalHasil = imbalHasilPerBulan * tenorBulan;
  const persenImbalHasil =
    porsiDana > 0 ? bulatDuaDesimal((imbalHasil / porsiDana) * 100) : 0;

  return {
    hargaBarang,
    dp,
    pokokDibiayai,
    biayaLayanan,
    biayaAdmin: 0,
    biayaPlatform: 0,
    biayaAdminCicilanTotal: 0,
    marginPerBulan,
    marginTotal,
    cicilanPerBulan: pokokPerBulan + marginPerBulan,
    cicilanTerakhir: jadwal[jadwal.length - 1].total,
    // Kontrak warisan 12/24 bulan tidak memakai tarif bulanan; nilai bawaan
    // dikirim agar bentuk hasilnya tetap satu.
    tarifBulanan: tarifBulananAman(input.tarif),
    totalDibayarKonsumen: dp + biayaLayanan + pokokDibiayai + marginTotal,
    jadwal,
    porsiDanaPersen,
    porsiDana,
    imbalHasilPerBulan,
    imbalHasil,
    totalDiterima: porsiDana + imbalHasil,
    persenImbalHasil,
    persenImbalHasilTahunan: bulatDuaDesimal(
      (persenImbalHasil * 12) / tenorBulan,
    ),
  };
}

/** Porsi satu cicilan milik seorang penyedia dana. */
export interface PorsiCicilan {
  /** Bagian pokok yang kembali ke penyedia dana ini. */
  pokok: Rupiah;
  /** Bagian Imbal Hasil bulan ini untuk penyedia dana ini. */
  margin: Rupiah;
  /** Total penerimaan penyedia dana bulan ini = pokok + margin. */
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
    throw new Error("Tidak ada posisi dana untuk dibagi.");
  }
  if (alokasi.some((a) => !isRupiah(a) || a <= 0)) {
    throw new Error("Setiap alokasi dana harus rupiah bulat positif.");
  }
  if (alokasi.reduce((acc, a) => acc + a, 0) !== pokokDibiayai) {
    throw new Error(
      "Total Alokasi Dana tidak sama dengan pokok dibiayai — pendanaan belum penuh.",
    );
  }
}

/**
 * Bagi satu cicilan (pokok + Imbal Hasil) ke porsi tiap penyedia dana secara
 * proporsional terhadap Alokasi Dana mereka.
 *
 * Identitas yang dijamin (diuji di kredit.test.ts):
 *  - Σ hasil.pokok = pokok                       (tanpa kehilangan satu rupiah)
 *  - Σ hasil.margin = margin
 *  - bila `konteks` kumulatif disertakan: saat tenor selesai setiap penyedia dana
 *    menerima pokok TEPAT sebesar Alokasi Dananya dan Imbal Hasil tepat
 *    sebesar haknya — pembulatan per bulan tidak menumpuk jadi drift.
 *
 * Semua alokasi dibulatkan ke bawah (selisih floor kumulatif), lalu selisih
 * pembulatan (dust) ditanggung alokasi terbesar — pola yang sama dengan
 * distribusi pelunasan pinjaman tunai.
 */
export function bagiCicilanKeDana(
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
 * memakai konvensi yang sama dengan bagiCicilanKeDana: semua alokasi
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

/** Contoh barang merchant mitra untuk kalkulator. */
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
