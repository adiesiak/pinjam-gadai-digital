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
import type { Rupiah } from "./money";

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

export type BagiHasilPinjaman = {
  /** Bunga pinjaman = pokok × persen bunga (pembulatan ke bawah). */
  bunga: Rupiah;
  /** Total kewajiban Peminjam = pokok + bunga (mis. Rp1jt → Rp1,3jt). */
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
 * (mis. pokok Rp1.000.000 + bunga 30% = Rp1.300.000), lalu admin mengambil
 * potongan dari TOTAL kewajiban itu; sisanya menjadi hak penyedia dana. Semua
 * persen dibaca dari Pengaturan Sistem, bukan ditulis di kode.
 *
 * Pembulatan selalu KE BAWAH supaya sisa rupiah tidak pernah masuk ke kas
 * admin, dan `potonganAdmin + pendanaTerima = totalLunas` tepat tanpa rupiah
 * yang hilang atau diciptakan. Semua nilai rupiah bulat (integer).
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
  const basisBunga = BigInt(Math.round(persenBunga * 100));
  const bunga = basisBunga === 0n ? 0 : Number((BigInt(pokok) * basisBunga) / 10_000n);
  const totalLunas = pokok + bunga;
  const basisAdmin = BigInt(Math.round(persenPotonganAdmin * 100));
  const potonganAdmin =
    basisAdmin === 0n ? 0 : Number((BigInt(totalLunas) * basisAdmin) / 10_000n);
  const pendanaTerima = totalLunas - potonganAdmin;
  return {
    bunga,
    totalLunas,
    potonganAdmin,
    pendanaTerima,
    keuntunganPendana: pendanaTerima - pokok,
    keuntunganAdmin: potonganAdmin,
  };
}
