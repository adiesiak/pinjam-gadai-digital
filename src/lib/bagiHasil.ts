/**
 * Bagi hasil pinjaman tunai — potongan platform dari TOTAL KEMBALI.
 *
 * KEBIJAKAN PRODUK (keputusan pemilik produk, berlaku untuk skema harian dan
 * bulanan). Contoh pokok Rp1.000.000 dengan bunga 30%:
 *
 * | Tahap | Rumus | Angka |
 * | --- | --- | --- |
 * | Pokok pinjaman | — | Rp1.000.000 |
 * | Potongan di muka 2% (biaya admin) | 2% × pokok | Rp20.000 |
 * | Diterima Peminjam | pokok − potongan di muka | Rp980.000 |
 * | Uang yang kembali | pokok + Imbal Hasil (130%) | Rp1.300.000 |
 * | Potongan platform 5% | 5% × **uang kembali** | Rp65.000 |
 * | Diterima penyedia dana | uang kembali − potongan | Rp1.235.000 |
 * | Keuntungan bersih penyedia dana | diterima − pokok | Rp235.000 |
 *
 * Dasar potongan adalah TOTAL KEMBALI (pokok + Imbal Hasil), sesuai contoh
 * pemilik produk: 5% × Rp1.300.000 = Rp65.000, sehingga pendana menerima
 * Rp1.235.000. Angka ini harus sama dengan `lib/imbalPendana.ts` dan snapshot
 * siklus 30 hari — kalau salah satu sisi berubah sendiri, pengguna melihat
 * janji yang tidak pernah dibayar.
 *
 * Pembulatan mengikuti filosofi PINDAI "pecahan tidak pernah masuk ke kas":
 * potongan platform dibulatkan KE BAWAH (floor), sehingga sisa rupiah selalu
 * menjadi milik penyedia dana.
 *
 * Promo bunga menurunkan bunga yang dibayar Peminjam, bukan hak penyedia dana.
 * Untuk pinjaman berpromo, hak penyedia dihitung dari tarif normal
 * (`promoBungaPersenNormal`), dan selisihnya menjadi `subsidiPromo` yang
 * ditanggung platform dari hasil putar modalnya.
 *
 * Semua nilai adalah rupiah bulat (integer) — tidak ada floating point.
 */
import { hitungSimulasiBulanan } from "./bulanan";
import { percentOf, type Rupiah } from "./money";

/** Potongan admin bawaan bila Pengaturan Sistem belum diubah. */
export const POTONGAN_ADMIN_DEFAULT_PERSEN = 5;

/** Bunga pinjaman tunai bawaan (30% dari pokok) bila Pengaturan Sistem kosong. */
export const BUNGA_PINJAMAN_DEFAULT_PERSEN = 30;

/** Hasil pembagian satu nilai bruto menjadi hak platform dan hak penyedia dana. */
export type BagiImbalHasil = {
  /** Bagian platform atas nilai ini (rupiah bulat, pembulatan ke bawah). */
  potonganAdmin: Rupiah;
  /** Sisa untuk pemilik dana (`bruto − potongan`) — tidak ada rupiah hilang. */
  imbalBersih: Rupiah;
};

/**
 * Potongan platform dari TOTAL KEMBALI (pokok + Imbal Hasil).
 *
 * Kebijakan 5% yang disepakati pemilik produk: Rp1.000.000 dengan bunga 30%
 * kembali Rp1.300.000, dipotong Rp65.000, pendana menerima Rp1.235.000.
 * Pembulatan ke bawah, sehingga sisa rupiah selalu menjadi hak pendana.
 *
 * Persen → basis poin supaya aritmetikanya bilangan bulat, termasuk persentase
 * pecahan seperti 2,5%.
 */
export function potonganDariKembali(
  totalKembali: Rupiah,
  persenPotonganAdmin: number,
): Rupiah {
  if (
    !Number.isInteger(totalKembali) ||
    !Number.isSafeInteger(totalKembali) ||
    totalKembali < 0
  ) {
    throw new Error(`Total kembali harus rupiah bulat non-negatif: ${totalKembali}`);
  }
  if (
    !Number.isFinite(persenPotonganAdmin) ||
    persenPotonganAdmin < 0 ||
    persenPotonganAdmin > 100
  ) {
    throw new Error(
      `Persentase potongan admin harus di antara 0–100: ${persenPotonganAdmin}`,
    );
  }
  const basisPoin = BigInt(Math.round(persenPotonganAdmin * 100));
  return basisPoin === 0n
    ? 0
    : Number((BigInt(totalKembali) * basisPoin) / 10_000n);
}

/**
 * Bagi satu nilai bruto menjadi potongan platform + sisa untuk penyedia dana.
 *
 * Dipakai jalur pinjaman & pendana lewat `potonganDariKembali`: dasarnya
 * total uang yang kembali, bukan pokok.
 *
 * Melempar bila masukan bukan rupiah bulat atau persentase di luar 0–100.
 */
export function bagiImbalHasil(
  bruto: Rupiah,
  persenPotonganAdmin: number,
): BagiImbalHasil {
  if (!Number.isInteger(bruto) || !Number.isSafeInteger(bruto) || bruto < 0) {
    throw new Error(`Nilai bruto harus rupiah bulat non-negatif: ${bruto}`);
  }
  if (
    !Number.isFinite(persenPotonganAdmin) ||
    persenPotonganAdmin < 0 ||
    persenPotonganAdmin > 100
  ) {
    throw new Error(
      `Persentase potongan admin harus di antara 0–100: ${persenPotonganAdmin}`,
    );
  }
  // Persen → basis poin (1% = 100 bp) supaya aritmetikanya bilangan bulat.
  const basisPoin = BigInt(Math.round(persenPotonganAdmin * 100));
  const potonganAdmin =
    basisPoin === 0n ? 0 : Number((BigInt(bruto) * basisPoin) / 10_000n);
  return { potonganAdmin, imbalBersih: bruto - potonganAdmin };
}

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
  /** Imbal Hasil pinjaman = pokok × persen bunga (pembulatan ke bawah). */
  bunga: Rupiah;
  /**
   * Kas yang dikembalikan Peminjam: pokok + Imbal Hasil. Biaya admin cicilan
   * tiap pembayaran bulanan dibayar Peminjam di luar angka ini (biaya itu
   * sudah milik platform, jadi bukan bagian dari uang yang dipotong).
   */
  totalLunas: Rupiah;
  /** Bagian platform = TOTAL KEMBALI × persen potongan (pembulatan ke bawah). */
  potonganAdmin: Rupiah;
  /** Yang benar-benar diterima penyedia dana = uang kembali − potongan. */
  pendanaTerima: Rupiah;
  /** Keuntungan bersih penyedia dana = yang diterima − pokok. */
  keuntunganPendana: Rupiah;
  /** Keuntungan admin atas pinjaman ini (sama dengan `potonganAdmin`). */
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
 * tanpa promo, jadi identitas lama tetap berlaku: potongan + diterima =
 * uang kembali. Pada pinjaman berpromo, selisihnya menjadi `subsidiPromo`.
 */
function rakitBagiHasil(args: {
  pokok: Rupiah;
  bunga: Rupiah;
  bungaPendana: Rupiah;
  totalLunas: Rupiah;
  potonganAdmin: Rupiah;
}): BagiHasilPinjaman {
  const pendanaTerima = args.pokok + args.bungaPendana - args.potonganAdmin;
  return {
    bunga: args.bunga,
    totalLunas: args.totalLunas,
    potonganAdmin: args.potonganAdmin,
    pendanaTerima,
    keuntunganPendana: args.bungaPendana - args.potonganAdmin,
    keuntunganAdmin: args.potonganAdmin,
    bungaPendana: args.bungaPendana,
    subsidiPromo: args.bungaPendana - args.bunga,
  };
}

/**
 * Perhitungan bagi hasil SATU pinjaman harian (model 1 pinjaman = 1 pendana).
 *
 * Fungsi ini SENGAJA menyusun angkanya dari dua fungsi lain, bukan menghitung
 * ulang, supaya tidak pernah ada dua jawaban untuk pinjaman yang sama:
 *  - `percentOf` (lib/money.ts) untuk bunga — pembulatan HALF-UP yang sama
 *    dengan `quoteLoan`/`quotePinjaman`, sehingga angkanya identik dengan
 *    kewajiban yang ditagih ke Peminjam;
 *  - `potonganDariKembali` untuk potongan — pembulatan KE BAWAH yang sama
 *    dengan yang dibukukan `convex/loans.ts` saat pelunasan.
 *
 * Identitas yang selalu berlaku: `potonganAdmin + pendanaTerima = totalLunas`
 * dan `keuntunganPendana = bunga − potonganAdmin`. Semua nilai rupiah bulat.
 */
export function bagiHasilPinjaman(
  pokok: Rupiah,
  persenBunga: number,
  persenPotonganAdmin: number,
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
  // Biaya platform dihitung dari hak pendana (pokok + Imbal Hasil), supaya
  // promo yang menurunkan tagihan Peminjam tidak ikut menurunkan biaya.
  const potonganAdmin = potonganDariKembali(pokok + bungaPendana, persenPotonganAdmin);
  return rakitBagiHasil({
    pokok,
    bunga,
    bungaPendana,
    totalLunas,
    potonganAdmin,
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
 * biaya admin cicilan), sedangkan dasarnya potongan adalah pokok + Imbal Hasil.
 * Karena itu identitasnya menjadi
 * `potonganAdmin + pendanaTerima + biayaAdminCicilan = totalLunas` — biaya
 * cicilan memang pendapatan platform, bukan bagian penyedia dana.
 */
export function bagiHasilPinjamanDari(
  pinjaman: PinjamanBagiHasil,
  persenPotonganAdmin: number,
): BagiHasilPinjaman {
  const tenorBulan = pinjaman.tenorBulan ?? null;
  const persenBunga = pinjaman.persenBunga ?? null;

  // Pinjaman yang sudah diperpanjang punya beberapa periode bunga. Imbal Hasil
  // penyedia dana adalah AKUMULASI bunga yang sudah dibayar + bunga periode
  // berjalan, sedangkan pokok kontraknya tetap pokok awal.
  if (
    pinjaman.bungaTerbayar !== undefined ||
    pinjaman.nextInterestAmount !== undefined
  ) {
    const bunga =
      Math.max(0, pinjaman.bungaTerbayar ?? 0) +
      Math.max(0, pinjaman.nextInterestAmount ?? 0);
    const totalLunas = pinjaman.pokokPinjaman + bunga;
    const potonganAdmin = potonganDariKembali(
      pinjaman.pokokPinjaman + bunga,
      persenPotonganAdmin,
    );
    return rakitBagiHasil({
      pokok: pinjaman.pokokPinjaman,
      bunga,
      bungaPendana: bunga,
      totalLunas,
      potonganAdmin,
    });
  }

  if (tenorBulan === null) {
    return bagiHasilPinjaman(
      pinjaman.pokokPinjaman,
      persenBunga ?? BUNGA_PINJAMAN_DEFAULT_PERSEN,
      persenPotonganAdmin,
      pinjaman.promoBungaPersenNormal ?? null,
    );
  }

  const simulasi = hitungSimulasiBulanan(
    pinjaman.pokokPinjaman,
    tenorBulan,
    persenBunga === null ? {} : { persenBungaPerBulan: persenBunga },
  );
  // `totalPengembalian` = seluruh kas yang dibayar Peminjam, termasuk biaya
  // admin cicilan tiap pembayaran bulanan. Dasar pembayaran pendana mengeluarkan
  // biaya itu lebih dulu: ia sudah menjadi pendapatan platform, jadi tidak boleh
  // ikut menjadi hak pendana (dasar = pokok + Imbal Hasil seluruh tenor).
  const potonganAdmin = potonganDariKembali(
    pinjaman.pokokPinjaman + simulasi.bungaTotal,
    persenPotonganAdmin,
  );
  return rakitBagiHasil({
    pokok: pinjaman.pokokPinjaman,
    bunga: simulasi.bungaTotal,
    bungaPendana: simulasi.bungaTotal,
    totalLunas: simulasi.totalPengembalian,
    potonganAdmin,
  });
}
