/**
 * Bagi hasil pinjaman tunai — marjin dibagi 47 : 13.
 *
 * KEBIJAKAN PRODUK (berlaku untuk skema harian, bulanan, dan seluruh produk
 * yang didanai penyedia dana):
 *
 * | Tahap | Rumus | Contoh pokok Rp1.000.000, bunga 30% |
 * | --- | --- | --- |
 * | Pokok pinjaman | — | Rp1.000.000 |
 * | Biaya admin di muka 2% (terpisah) | 2% × pokok | Rp20.000 |
 * | Diterima Peminjam | pokok − biaya admin | Rp980.000 |
 * | Uang yang kembali | pokok + Imbal Hasil | Rp1.300.000 |
 * | Marjin | uang kembali − pokok | Rp300.000 |
 * | Porsi penyedia dana (47/60) | 78,33% × marjin | Rp235.000 |
 * | Porsi platform (13/60) | 21,67% × marjin | Rp65.000 |
 * | Diterima penyedia dana | pokok + porsi pendana | Rp1.235.000 |
 *
 * Biaya admin, biaya layanan, dan biaya admin cicilan adalah pos TERPISAH:
 * uang itu sudah menjadi pendapatan platform dan tidak pernah ikut dibagi
 * 47 : 13. Dasar pembagian hanya marjin pinjaman.
 *
 * Pembulatan: porsi platform dihitung dengan pembagian bilangan bulat 13/60
 * dan dibulatkan KE BAWAH; sisa rupiah selalu menjadi milik penyedia dana.
 * Tidak ada rupiah yang hilang atau diciptakan.
 *
 * Promo bunga menurunkan bunga yang dibayar Peminjam, bukan hak penyedia dana.
 * Untuk pinjaman berpromo, hak penyedia dihitung dari tarif normal
 * (`promoBungaPersenNormal`), dan selisihnya menjadi `subsidiPromo` yang
 * ditanggung platform.
 *
 * Semua nilai adalah rupiah bulat (integer) — tidak ada floating point.
 */
import { hitungSimulasiBulanan } from "./bulanan";
import { bagiMargin } from "./kebijakanPinjaman";
import { percentOf, type Rupiah } from "./money";

/** Bunga pinjaman tunai bawaan (30% dari pokok) bila Pengaturan Sistem kosong. */
export const BUNGA_PINJAMAN_DEFAULT_PERSEN = 30;

/** Bentuk minimal satu pinjaman yang dibutuhkan perhitungan bagi hasil. */
export type PinjamanBagiHasil = {
  pokokPinjaman: Rupiah;
  /** Kosong/null = skema harian; terisi = skema bulanan (lihat lib/bulanan.ts). */
  tenorBulan?: number | null;
  /** Snapshot bunga (persen). Kosong = tarif bawaan skema. */
  persenBunga?: number | null;
  /**
   * Tarif matriks asal untuk pinjaman berpromo. Promo menurunkan bunga yang
   * dibayar Peminjam, TIDAK menurunkan hak penyedia dana: penyedia tetap
   * dihitung dengan tarif normal ini, dan selisihnya ditanggung platform.
   */
  promoBungaPersenNormal?: number | null;
  /** State perpanjangan: bunga yang sudah dibayar + bunga periode berjalan. */
  bungaTerbayar?: number | null;
  nextInterestAmount?: number | null;
};

export type BagiHasilPinjaman = {
  /** Imbal Hasil pinjaman = pokok × persen bunga (pembulatan HALF-UP). */
  bunga: Rupiah;
  /**
   * Kas yang dikembalikan Peminjam: pokok + Imbal Hasil. Biaya admin cicilan
   * tiap pembayaran bulanan dibayar Peminjam di luar angka ini (biaya itu
   * sudah milik platform, jadi bukan bagian dari uang yang dibagi).
   */
  totalLunas: Rupiah;
  /** Porsi platform = 13/60 dari marjin (pembulatan ke bawah). */
  potonganAdmin: Rupiah;
  /** Yang benar-benar diterima penyedia dana = pokok + porsi pendana. */
  pendanaTerima: Rupiah;
  /** Keuntungan bersih penyedia dana = yang diterima − pokok. */
  keuntunganPendana: Rupiah;
  /** Keuntungan platform atas marjin pinjaman ini (sama dengan `potonganAdmin`). */
  keuntunganAdmin: Rupiah;
  /**
   * Imbal Hasil acuan hak penyedia dana. Tanpa promo sama dengan `bunga`;
   * dengan promo memakai tarif normal, sehingga promo tidak memotong haknya.
   */
  bungaPendana: Rupiah;
  /** Selisih bunga promo yang menjadi beban platform (0 tanpa promo). */
  subsidiPromo: Rupiah;
};

/**
 * Rakit satu hasil bagi hasil dari angka yang sudah dihitung pemanggil.
 *
 * `bunga` adalah yang ditagih ke Peminjam (bisa tarif promo), sedangkan
 * `bungaPendana` adalah dasar hak penyedia dana. Keduanya sama pada pinjaman
 * tanpa promo, jadi identitas lama tetap berlaku: porsi platform + diterima
 * penyedia = uang kembali. Pada pinjaman berpromo, selisihnya menjadi
 * `subsidiPromo`.
 */
function rakitBagiHasil(args: {
  pokok: Rupiah;
  bunga: Rupiah;
  bungaPendana: Rupiah;
  totalLunas: Rupiah;
}): BagiHasilPinjaman {
  const bagi = bagiMargin(args.bungaPendana);
  return {
    bunga: args.bunga,
    totalLunas: args.totalLunas,
    potonganAdmin: bagi.platform,
    pendanaTerima: args.pokok + bagi.pendana,
    keuntunganPendana: bagi.pendana,
    keuntunganAdmin: bagi.platform,
    bungaPendana: args.bungaPendana,
    subsidiPromo: args.bungaPendana - args.bunga,
  };
}

/**
 * Perhitungan bagi hasil SATU pinjaman harian (model 1 pinjaman = 1 pendana).
 *
 * Fungsi ini SENGAJA menyusun bunganya dari `percentOf` (lib/money.ts) —
 * pembulatan HALF-UP yang sama dengan `quoteLoan`/`quotePinjaman` — sehingga
 * angkanya identik dengan kewajiban yang ditagih ke Peminjam. Pembagian
 * 47 : 13 memakai `bagiMargin`, sumber aturan yang sama dengan snapshot
 * alokasi pendana dan pelunasan.
 *
 * Identitas yang selalu berlaku: `potonganAdmin + pendanaTerima = totalLunas`
 * (tanpa promo) dan `keuntunganPendana = porsi pendana atas bungaPendana`.
 */
export function bagiHasilPinjaman(
  pokok: Rupiah,
  persenBunga: number,
  promoBungaPersenNormal?: number | null,
): BagiHasilPinjaman {
  if (!Number.isInteger(pokok) || !Number.isSafeInteger(pokok) || pokok < 0) {
    throw new Error(`Pokok pinjaman harus rupiah bulat non-negatif: ${pokok}`);
  }
  if (!Number.isFinite(persenBunga) || persenBunga < 0 || persenBunga > 100) {
    throw new Error(`Bunga harus di antara 0–100: ${persenBunga}`);
  }
  const bunga = percentOf(pokok, persenBunga);
  const totalLunas = pokok + bunga;
  // Promo hanya boleh MENURUNKAN bunga Peminjam. Tarif normal dipakai untuk
  // hak penyedia dana; nilai yang lebih rendah dari bunga aktual diabaikan
  // supaya data lama tidak pernah "menaikkan" beban platform secara diam-diam.
  const tarifNormal =
    promoBungaPersenNormal !== undefined &&
    promoBungaPersenNormal !== null &&
    Number.isFinite(promoBungaPersenNormal) &&
    promoBungaPersenNormal > persenBunga &&
    promoBungaPersenNormal <= 100
      ? promoBungaPersenNormal
      : null;
  const bungaPendana = tarifNormal === null ? bunga : percentOf(pokok, tarifNormal);
  return rakitBagiHasil({
    pokok,
    bunga,
    bungaPendana,
    totalLunas,
  });
}

/**
 * Bagi hasil SATU pinjaman menurut skema tenornya — pintu tunggal untuk panel
 * admin dan ruang penyedia dana.
 *
 * Skema HARIAN: bunga = persen flat dari pokok (satu periode 30/60/90 hari).
 *
 * Skema BULANAN (`tenorBulan` terisi): Imbal Hasil adalah bunga SELAMA TENOR
 * dari `hitungSimulasiBulanan` — bukan satu bulan. Ini penting karena
 * `convex/penyediaDana.ts` dan panel admin memakai fungsi ini untuk mencatat
 * transfer keuntungan penyedia dana: memakai bunga satu bulan membuat angka
 * yang dipindahkan berbeda dari yang dibukukan ledger saat pelunasan
 * (convex/loans.ts memakai `simulasiBulananPinjaman`).
 *
 * Pada skema bulanan, `totalLunas` adalah seluruh kas dari Peminjam (termasuk
 * biaya admin cicilan), sedangkan yang dibagi 47 : 13 hanya marjin. Karena itu
 * identitasnya menjadi
 * `potonganAdmin + pendanaTerima + biayaAdminCicilan = totalLunas` — biaya
 * cicilan memang pendapatan platform, bukan bagian penyedia dana.
 */
export function bagiHasilPinjamanDari(
  pinjaman: PinjamanBagiHasil,
): BagiHasilPinjaman {
  const tenorBulan = pinjaman.tenorBulan ?? null;
  const persenBunga = pinjaman.persenBunga ?? null;

  // Pinjaman yang sudah diperpanjang punya beberapa periode bunga. Imbal Hasil
  // penyedia dana adalah AKUMULASI bunga yang sudah dibayar + bunga periode
  // berjalan, sedangkan pokok kontraknya tetap pokok awal.
  //
  // Nol bukan riwayat: penutupan manual menulis `nextInterestAmount: 0` pada
  // pinjaman biasa. Tanpa penjagaan ini marjinnya terbaca nol dan pendana
  // kehilangan haknya hanya karena pinjaman ditandai lunas.
  const bungaAkumulasi =
    Math.max(0, pinjaman.bungaTerbayar ?? 0) +
    Math.max(0, pinjaman.nextInterestAmount ?? 0);
  if (bungaAkumulasi > 0) {
    const bunga = bungaAkumulasi;
    const totalLunas = pinjaman.pokokPinjaman + bunga;
    return rakitBagiHasil({
      pokok: pinjaman.pokokPinjaman,
      bunga,
      bungaPendana: bunga,
      totalLunas,
    });
  }

  if (tenorBulan === null) {
    return bagiHasilPinjaman(
      pinjaman.pokokPinjaman,
      persenBunga ?? BUNGA_PINJAMAN_DEFAULT_PERSEN,
      pinjaman.promoBungaPersenNormal ?? null,
    );
  }

  const simulasi = hitungSimulasiBulanan(
    pinjaman.pokokPinjaman,
    tenorBulan,
    persenBunga === null ? {} : { persenBungaPerBulan: persenBunga },
  );
  // `totalPengembalian` = seluruh kas yang dibayar Peminjam, termasuk biaya
  // admin cicilan tiap pembayaran bulanan. Biaya itu sudah menjadi pendapatan
  // platform, jadi dasar bagi hasil tetap pokok + Imbal Hasil seluruh tenor.
  return rakitBagiHasil({
    pokok: pinjaman.pokokPinjaman,
    bunga: simulasi.bungaTotal,
    bungaPendana: simulasi.bungaTotal,
    totalLunas: simulasi.totalPengembalian,
  });
}
