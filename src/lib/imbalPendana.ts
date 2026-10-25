/**
 * Skema imbal hasil PENYEDIA DANA — tetap, terpisah dari skema nasabah.
 *
 * Keputusan produk: setiap pendanaan memakai tenor acuan 30 hari dan imbal
 * hasil 30% flat dari pokok yang didanai. Angkanya TIDAK mengikuti tenor,
 * bunga, perpanjangan, atau cicilan pokok di sisi peminjam. Karena itu hak
 * pendana bisa dicatat sekali saat alokasi dan tidak berubah ketika admin
 * mengubah kontrak nasabah.
 *
 * Rumus:
 *   Imbal Hasil     = pokok × 30%
 *   Total kembali   = pokok + Imbal Hasil (130%)
 *   Biaya platform  = total kembali × tarif (5% bawaan)
 *   Diterima        = total kembali - biaya platform
 *
 * Biaya platform dihitung dari TOTAL KEMBALI. Dengan tarif 5%, Rp1.000.000
 * menghasilkan imbal Rp300.000, biaya Rp65.000, dan total cair Rp1.235.000
 * (keuntungan bersih Rp235.000). Yang fixed adalah HAK BRUTO pendana; angkanya
 * tidak diturunkan dari bunga pinjaman nasabah.
 *
 * Semua nilai rupiah bulat; pembulatan imbal hasil ke bawah agar tidak ada
 * rupiah yang diciptakan.
 */
import type { Rupiah } from "./money";
import { bagiHasilPinjamanDari, type PinjamanBagiHasil } from "./bagiHasil";
import { bagiMargin, bagiMarginBagian } from "./kebijakanPinjaman";

/** Tenor acuan pendana untuk semua portofolio. */
export const TENOR_PENDANA_HARI = 30;

/** Imbal hasil bruto pendana per siklus tenor, dalam persen. */
export const PERSEN_IMBAL_PENDANA = 30;

/** Label tenor yang dipakai tabel dan kalkulator. */
export const LABEL_TENOR_PENDANA = "30 Hari";

/** Label yield yang dipakai tabel dan kalkulator. */
export const LABEL_YIELD_PENDANA = "30% p.p.";

function validasiPokok(pokok: number): void {
  if (!Number.isInteger(pokok) || !Number.isSafeInteger(pokok) || pokok < 0) {
    throw new Error(`Pokok pendanaan harus rupiah bulat non-negatif: ${pokok}`);
  }
}

/** Imbal hasil bruto pendana: pokok × 30%, dibulatkan ke bawah. */
export function imbalPendana(pokok: number): Rupiah {
  validasiPokok(pokok);
  return Math.floor((pokok * PERSEN_IMBAL_PENDANA) / 100);
}

/** Total pengembalian bruto ke pendana: pokok + imbal hasil tetap. */
export function totalPengembalianPendana(pokok: number): Rupiah {
  return pokok + imbalPendana(pokok);
}

/**
 * Hak pendana atas satu alokasi, dihitung dari marjin pinjaman yang didanai.
 *
 * Kebijakan 47 : 13 dari 60 (78,333…% untuk pendana, 21,666…% untuk platform)
 * diterapkan pada marjin pinjaman penuh, lalu dibagi menurut porsi pokok
 * alokasi. Promo bunga tidak menurunkan angka ini karena marjinnya diambil dari
 * tarif normal pinjaman.
 *
 * `imbal` adalah hak BRUTO bagian pendana (porsi pendana + porsi platform);
 * `potonganAdmin` adalah bagian platform yang dipotong dari pembayaran, dan
 * `keuntungan` adalah sisanya. Dengan marjin 30%, Rp1.000.000 menghasilkan
 * imbal Rp300.000, potongan Rp65.000, dan keuntungan Rp235.000 — angka yang
 * sama dengan skema biaya 5% dari total kembali.
 */
export type HakPendana = {
  /** Marjin pinjaman penuh (tarif normal, sebelum promo). */
  marginTotal: Rupiah;
  /** Hak bruto bagian ini: pokok alokasi + imbal. */
  imbal: Rupiah;
  /** Bagian platform atas marjin bagian ini. */
  potonganAdmin: Rupiah;
  /** Imbal bersih yang diterima pendana. */
  keuntungan: Rupiah;
  /** Yield bruto terhadap pokok alokasi, dalam persen. */
  rate: number;
};

export function hakPendana(
  pokok: number,
  pinjaman: PinjamanBagiHasil,
): HakPendana {
  validasiPokok(pokok);
  if (
    !Number.isSafeInteger(pinjaman.pokokPinjaman) ||
    pinjaman.pokokPinjaman <= 0 ||
    pokok > pinjaman.pokokPinjaman
  ) {
    throw new Error(
      `Porsi alokasi tidak valid: ${pokok} dari ${pinjaman.pokokPinjaman}`,
    );
  }
  const marginTotal = bagiHasilPinjamanDari(pinjaman, 0).bungaPendana;
  const bagian = bagiMarginBagian(marginTotal, pokok, pinjaman.pokokPinjaman);
  const imbal = bagian.pendana + bagian.platform;
  return {
    marginTotal,
    imbal,
    potonganAdmin: bagian.platform,
    keuntungan: bagian.pendana,
    rate: pokok > 0 ? (imbal / pokok) * 100 : 0,
  };
}

/**
 * Siklus hak pendana yang disimpan bersama setiap alokasi.
 *
 * `expectedReturnRate` memakai tarif normal pinjaman (30% untuk satu bulan),
 * sedangkan `lenderProfit` adalah bagian pendana yang sudah dibagi 47 : 13.
 */
export type SiklusPendanaan = {
  periodDuration: number;
  expectedReturnRate: number;
  lenderProfit: Rupiah;
  /** Imbal bruto yang dibayar bersama pokok (porsi pendana + platform). */
  imbalHasil: Rupiah;
  /** Bagian platform yang dipotong dari pembayaran itu. */
  potonganAdmin: Rupiah;
};

/**
 * Siklus 30 hari untuk satu alokasi.
 *
 * Tanpa `pinjaman` (mis. simulasi 30 hari), yang dipakai adalah marjin acuan
 * 30% dari pokok penempatan. Dengan `pinjaman`, marjin diambil dari tenor dan
 * tarif pinjaman yang benar-benar didanai.
 */
export function siklusPendanaan(
  pokok: number,
  pinjaman?: PinjamanBagiHasil,
): SiklusPendanaan {
  // Data warisan dengan pokok tidak masuk akal tidak boleh merobohkan satu
  // halaman portofolio: jatuh ke skema acuan 30% alih-alih melempar.
  if (
    pinjaman === undefined ||
    !Number.isSafeInteger(pinjaman.pokokPinjaman) ||
    pinjaman.pokokPinjaman <= 0 ||
    pokok > pinjaman.pokokPinjaman
  ) {
    const imbal = imbalPendana(pokok);
    return {
      periodDuration: TENOR_PENDANA_HARI,
      expectedReturnRate: PERSEN_IMBAL_PENDANA,
      lenderProfit: imbal,
      imbalHasil: imbal,
      potonganAdmin: 0,
    };
  }
  const hak = hakPendana(pokok, pinjaman);
  return {
    periodDuration: TENOR_PENDANA_HARI,
    expectedReturnRate:
      pinjaman.pokokPinjaman > 0
        ? (hak.marginTotal / pinjaman.pokokPinjaman) * 100
        : 0,
    lenderProfit: hak.keuntungan,
    imbalHasil: hak.imbal,
    potonganAdmin: hak.potonganAdmin,
  };
}

export type BagiHasilPendana = {
  /** Imbal hasil bruto (pokok × 30% pada skema acuan). */
  imbal: Rupiah;
  /** Pokok + imbal hasil, sebelum biaya platform. */
  total: Rupiah;
  /** Porsi platform atas marjin (bukan lagi 5% dari total kembali). */
  potonganAdmin: Rupiah;
  /** Uang yang benar-benar masuk dompet pendana. */
  diterima: Rupiah;
  /** Imbal hasil bersih setelah porsi platform. */
  keuntungan: Rupiah;
};

/**
 * Bagi hasil satu penempatan 30 hari pada marjin acuan 30%.
 *
 * `persenPotonganAdmin` tidak lagi menentukan angkanya: porsi platform tetap
 * 13/60 dari marjin (21,666…%), yang pada marjin 30% sama dengan biaya 5% dari
 * total kembali. Parameter dipertahankan agar pemanggil lama dan pengaturan
 * yang sudah tersimpan tidak perlu diubah.
 */
export function bagiHasilPendana(
  pokok: number,
  _persenPotonganAdmin: number,
  pinjaman?: PinjamanBagiHasil,
): BagiHasilPendana {
  const hak =
    pinjaman === undefined ? null : hakPendana(pokok, pinjaman);
  const imbal = hak === null ? imbalPendana(pokok) : hak.imbal;
  const total = pokok + imbal;
  const potonganAdmin =
    hak === null ? bagiMargin(imbal).platform : hak.potonganAdmin;
  const diterima = total - potonganAdmin;
  return {
    imbal,
    total,
    potonganAdmin,
    diterima,
    keuntungan: diterima - pokok,
  };
}

/** Status pendanaan yang dibaca pendana di tabel portofolio. */
export type StatusPendanaan = "Aktif" | "Berjalan" | "Selesai" | "Cair";

/**
 * Terjemahkan status alokasi + status pinjaman menjadi satu label pendanaan.
 *
 * "Aktif"   = alokasi sudah tercatat, pinjaman belum berjalan.
 * "Berjalan"= dana sudah cair ke peminjam.
 * "Selesai" = pinjaman lunas atau alokasi selesai.
 * "Cair"    = alokasi dibatalkan dan dana kembali ke dompet pendana.
 */
export function statusPendanaan(
  statusAlokasi: string,
  statusPinjaman: string,
): StatusPendanaan {
  if (statusAlokasi === "dibatalkan") return "Cair";
  if (statusAlokasi === "selesai" || statusPinjaman === "lunas") return "Selesai";
  if (statusPinjaman === "didanai") return "Berjalan";
  return "Aktif";
}
