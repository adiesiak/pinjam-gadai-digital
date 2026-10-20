/**
 * Bagi hasil pinjaman tunai — potongan platform atas uang yang kembali dari
 * Peminjam.
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
 * | Potongan platform 5% | 5% × **uang yang kembali** | Rp65.000 |
 * | Diterima penyedia dana | uang kembali − potongan | Rp1.235.000 |
 * | Keuntungan bersih penyedia dana | diterima − pokok | Rp235.000 |
 *
 * Sebelumnya potongan dihitung dari Imbal Hasil saja (5% × Rp300.000 =
 * Rp15.000). Dasar itu diganti: potongan diambil dari seluruh uang yang
 * kembali ke sistem, bukan hanya dari keuntungan penyedia dana. Persentasenya
 * tetap dibaca dari Pengaturan Sistem (`persenAdmin`), bukan ditulis di kode.
 *
 * Pembulatan mengikuti filosofi PINDAI "pecahan tidak pernah masuk ke kas":
 * potongan platform dibulatkan KE BAWAH (floor), sehingga sisa rupiah selalu
 * menjadi milik penyedia dana. Dengan begitu `potongan + hak penyedia = uang
 * yang kembali` tepat, tanpa rupiah yang hilang atau diciptakan.
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
 * Bagi satu nilai bruto menjadi potongan platform + sisa untuk penyedia dana.
 *
 * Nama historisnya "Imbal Hasil" karena dulu bruto berarti Imbal Hasil; sejak
 * kebijakan baru pemanggilnya adalah `bagiHasilPinjaman` dengan bruto = uang
 * yang kembali, dan `convex/loans.ts` dengan bruto = bagian satu penyedia dana
 * (`alokasi + Imbal Hasil bagian`) agar urutan pendaftaran penyedia dana tidak
 * mengubah hak siapa pun.
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
  /** Bagian platform = uang yang kembali × persen potongan (pembulatan ke bawah). */
  potonganAdmin: Rupiah;
  /** Yang benar-benar diterima penyedia dana = uang kembali − potongan. */
  pendanaTerima: Rupiah;
  /** Keuntungan bersih penyedia dana = yang diterima − pokok. */
  keuntunganPendana: Rupiah;
  /** Keuntungan admin atas pinjaman ini (sama dengan `potonganAdmin`). */
  keuntunganAdmin: Rupiah;
};

/**
 * Perhitungan bagi hasil SATU pinjaman harian (model 1 pinjaman = 1 pendana).
 *
 * Fungsi ini SENGAJA menyusun angkanya dari dua fungsi lain, bukan menghitung
 * ulang, supaya tidak pernah ada dua jawaban untuk pinjaman yang sama:
 *  - `percentOf` (lib/money.ts) untuk bunga — pembulatan HALF-UP yang sama
 *    dengan `quoteLoan`/`quotePinjaman`, sehingga angkanya identik dengan
 *    kewajiban yang ditagih ke Peminjam;
 *  - `bagiImbalHasil` untuk potongan — pembulatan KE BAWAH yang sama dengan
 *    yang dibukukan `convex/loans.ts` saat pelunasan.
 *
 * Identitas yang selalu berlaku: `potonganAdmin + pendanaTerima = totalLunas`
 * dan `keuntunganPendana = bunga − potonganAdmin`. Semua nilai rupiah bulat.
 */
export function bagiHasilPinjaman(
  pokok: Rupiah,
  persenBunga: number,
  persenPotonganAdmin: number,
): BagiHasilPinjaman {
  if (!Number.isInteger(pokok) || !Number.isSafeInteger(pokok) || pokok < 0) {
    throw new Error(`Pokok pinjaman harus rupiah bulat non-negatif: ${pokok}`);
  }
  if (!Number.isFinite(persenBunga) || persenBunga < 0 || persenBunga > 100) {
    throw new Error(`Bunga harus di antara 0–100: ${persenBunga}`);
  }
  const bunga = percentOf(pokok, persenBunga);
  const totalLunas = pokok + bunga;
  const { potonganAdmin, imbalBersih } = bagiImbalHasil(
    totalLunas,
    persenPotonganAdmin,
  );
  return {
    bunga,
    totalLunas,
    potonganAdmin,
    pendanaTerima: imbalBersih,
    keuntunganPendana: imbalBersih - pokok,
    keuntunganAdmin: potonganAdmin,
  };
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
    const { potonganAdmin, imbalBersih } = bagiImbalHasil(
      totalLunas,
      persenPotonganAdmin,
    );
    return {
      bunga,
      totalLunas,
      potonganAdmin,
      pendanaTerima: imbalBersih,
      keuntunganPendana: imbalBersih - pinjaman.pokokPinjaman,
      keuntunganAdmin: potonganAdmin,
    };
  }

  if (tenorBulan === null) {
    return bagiHasilPinjaman(
      pinjaman.pokokPinjaman,
      persenBunga ?? BUNGA_PINJAMAN_DEFAULT_PERSEN,
      persenPotonganAdmin,
    );
  }

  const simulasi = hitungSimulasiBulanan(
    pinjaman.pokokPinjaman,
    tenorBulan,
    persenBunga === null ? {} : { persenBungaPerBulan: persenBunga },
  );
  // `totalPengembalian` = seluruh kas yang dibayar Peminjam, termasuk biaya
  // admin cicilan tiap pembayaran bulanan. Dasar potongan mengeluarkan biaya itu lebih dulu:
  // ia sudah menjadi pendapatan platform, jadi tidak boleh ikut dipotong lagi
  // (dasar = pokok + Imbal Hasil seluruh tenor, sama dengan yang dijurnal
  // ledger sebagai total kewajiban penyedia dana).
  const dasarPotongan = simulasi.totalPengembalian - simulasi.biayaAdminCicilanTotal;
  const { potonganAdmin, imbalBersih } = bagiImbalHasil(
    dasarPotongan,
    persenPotonganAdmin,
  );
  return {
    bunga: simulasi.bungaTotal,
    totalLunas: simulasi.totalPengembalian,
    potonganAdmin,
    pendanaTerima: imbalBersih,
    keuntunganPendana: imbalBersih - pinjaman.pokokPinjaman,
    keuntunganAdmin: potonganAdmin,
  };
}
