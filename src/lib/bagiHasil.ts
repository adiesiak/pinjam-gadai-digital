/**
 * Bagi hasil Imbal Hasil — potongan admin atas keuntungan penyedia dana.
 *
 * Kebijakan produk: dari Imbal Hasil (keuntungan) yang menjadi hak penyedia
 * dana, admin mengambil sekian persen. Persentasenya dibaca dari Pengaturan
 * Sistem (`persenAdmin`), bukan ditulis di kode, supaya kebijakan bisa berubah
 * tanpa menyentuh logika uang.
 *
 * Aturan pembulatan mengikuti filosofi PINDAI "pecahan tidak pernah masuk ke
 * kas": potongan admin dibulatkan KE BAWAH (floor), sehingga sisa rupiah selalu
 * menjadi milik penyedia dana. Dengan begitu `potongan + bersih = bruto` tepat,
 * tanpa rupiah yang hilang atau diciptakan.
 *
 * Semua nilai adalah rupiah bulat (integer) — tidak ada floating point.
 */
import { hitungSimulasiBulanan } from "./bulanan";
import { percentOf, type Rupiah } from "./money";

/** Potongan admin bawaan bila Pengaturan Sistem belum diubah. */
export const POTONGAN_ADMIN_DEFAULT_PERSEN = 5;

/** Bunga pinjaman tunai bawaan (30% dari pokok) bila Pengaturan Sistem kosong. */
export const BUNGA_PINJAMAN_DEFAULT_PERSEN = 30;

export type BagiImbalHasil = {
  /** Bagian admin atas keuntungan ini (rupiah bulat, pembulatan ke bawah). */
  potonganAdmin: Rupiah;
  /** Hak penyedia dana setelah potongan (`bruto − potongan`). */
  imbalBersih: Rupiah;
};

/**
 * Hitung potongan admin atas satu Imbal Hasil bruto.
 * Melempar bila masukan bukan rupiah bulat atau persentase di luar 0–100.
 */
export function bagiImbalHasil(
  imbalBruto: Rupiah,
  persenPotonganAdmin: number,
): BagiImbalHasil {
  if (!Number.isInteger(imbalBruto) || !Number.isSafeInteger(imbalBruto) || imbalBruto < 0) {
    throw new Error(`Imbal Hasil harus rupiah bulat non-negatif: ${imbalBruto}`);
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
    basisPoin === 0n ? 0 : Number((BigInt(imbalBruto) * basisPoin) / 10_000n);
  return { potonganAdmin, imbalBersih: imbalBruto - potonganAdmin };
}

/** Bentuk minimal satu pinjaman yang dibutuhkan perhitungan bagi hasil. */
export type PinjamanBagiHasil = {
  pokokPinjaman: Rupiah;
  /** Kosong/null = skema harian; terisi = skema bulanan (lihat lib/bulanan.ts). */
  tenorBulan?: number | null;
  /** Snapshot bunga (persen). Kosong = tarif bawaan skema. */
  persenBunga?: number | null;
};

export type BagiHasilPinjaman = {
  /** Bunga pinjaman = pokok × persen bunga (pembulatan ke bawah). */
  bunga: Rupiah;
  /**
   * Total kas yang dikembalikan Peminjam = pokok + bunga, ditambah biaya admin
   * cicilan pada skema bulanan tenor 3/6 (biaya itu dibayar bersama cicilan,
   * bukan dipotong di muka).
   */
  totalLunas: Rupiah;
  /** Bagian admin = total kewajiban × persen potongan (pembulatan ke bawah). */
  potonganAdmin: Rupiah;
  /** Yang benar-benar diterima penyedia dana = total − potongan admin. */
  pendanaTerima: Rupiah;
  /** Keuntungan bersih penyedia dana = yang diterima − pokok. */
  keuntunganPendana: Rupiah;
  /** Keuntungan admin atas pinjaman ini (sama dengan `potonganAdmin`). */
  keuntunganAdmin: Rupiah;
};

/**
 * Perhitungan bagi hasil SATU pinjaman (model 1 pinjaman = 1 pendana).
 *
 * Kebijakan produk: pokok ditambah bunga sekian persen menjadi total kewajiban
 * (mis. pokok Rp1.000.000 + bunga 30% = Rp1.300.000). Potongan admin diambil
 * dari IMBAL HASIL — keuntungan penyedia dana — bukan dari total kewajiban;
 * pokok selalu kembali utuh ke penyedia dana. Semua persen dibaca dari
 * Pengaturan Sistem, bukan ditulis di kode.
 *
 * Fungsi ini SENGAJA menyusun angkanya dari dua fungsi lain, bukan menghitung
 * ulang, supaya tidak pernah ada dua jawaban untuk pinjaman yang sama:
 *  - `percentOf` (lib/money.ts) untuk bunga — pembulatan HALF-UP yang sama
 *    dengan yang dipakai `quoteLoan`/`quotePinjaman`, sehingga angkanya identik
 *    dengan kewajiban yang ditagih ke Peminjam;
 *  - `bagiImbalHasil` untuk potongan admin — pembulatan KE BAWAH yang sama
 *    dengan yang dibukukan `convex/loans.ts` saat pelunasan, sehingga angka
 *    yang dilihat admin/penyedia dana sama dengan yang benar-benar ada di
 *    ledger.
 *
 * Identitas yang selalu berlaku: `potonganAdmin + pendanaTerima = totalLunas`
 * dan `keuntunganPendana + keuntunganAdmin = bunga` — tanpa rupiah yang hilang
 * atau diciptakan. Semua nilai rupiah bulat (integer).
 */
export function bagiHasilPinjaman(
  pokok: Rupiah,
  persenBunga: number,
  persenPotonganAdmin: number,
): BagiHasilPinjaman {
  if (!Number.isInteger(pokok) || !Number.isSafeInteger(pokok) || pokok < 0) {
    throw new Error(`Pokok pinjaman harus rupiah bulat non-negatif: ${pokok}`);
  }
  for (const [label, persen] of [
    ["Bunga", persenBunga],
    ["Potongan admin", persenPotonganAdmin],
  ] as const) {
    if (!Number.isFinite(persen) || persen < 0 || persen > 100) {
      throw new Error(`${label} harus di antara 0–100: ${persen}`);
    }
  }
  const bunga = percentOf(pokok, persenBunga);
  const { potonganAdmin, imbalBersih } = bagiImbalHasil(bunga, persenPotonganAdmin);
  const pendanaTerima = pokok + imbalBersih;
  return {
    bunga,
    totalLunas: pokok + bunga,
    potonganAdmin,
    pendanaTerima,
    keuntunganPendana: imbalBersih,
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
 * dari `hitungSimulasiBulanan` — bukan satu bulan. Ini penting karena panel ini
 * yang dipakai admin untuk mencatat transfer keuntungan penyedia dana: memakai
 * bunga satu bulan membuat angka yang dipindahkan berbeda dari yang dibukukan
 * ledger saat pelunasan (convex/loans.ts memakai `simulasiBulananPinjaman`).
 *
 * `totalLunas` selalu berarti total kas yang dikembalikan Peminjam; pada tenor
 * 3/6 biaya admin cicilan ikut di dalamnya karena dibayar bersama cicilan,
 * sehingga identitas `potonganAdmin + pendanaTerima = totalLunas` hanya pas
 * untuk skema harian. Yang selalu pas di kedua skema: keuntungan penyedia dana
 * = bunga − potonganAdmin, dan pendanaTerima = pokok + keuntungan penyedia.
 */
export function bagiHasilPinjamanDari(
  pinjaman: PinjamanBagiHasil,
  persenPotonganAdmin: number,
): BagiHasilPinjaman {
  const tenorBulan = pinjaman.tenorBulan ?? null;
  const persenBunga = pinjaman.persenBunga ?? null;

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
  const { potonganAdmin, imbalBersih } = bagiImbalHasil(
    simulasi.bungaTotal,
    persenPotonganAdmin,
  );
  return {
    bunga: simulasi.bungaTotal,
    totalLunas: simulasi.totalPengembalian,
    potonganAdmin,
    pendanaTerima: pinjaman.pokokPinjaman + imbalBersih,
    keuntunganPendana: imbalBersih,
    keuntunganAdmin: potonganAdmin,
  };
}
