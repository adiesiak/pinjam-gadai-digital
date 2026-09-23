/**
 * STOP-UP! — Kalkulasi Harga, Margin & Bulk Price Management
 *
 * SEMUA angka uang adalah rupiah BULAT (integer). Tidak ada float di jalur
 * transaksi: setiap pembagian dibulatkan eksplisit dengan Math.round.
 */

export type HargaProduk = {
  hppPrice: number;
  sellPrice: number;
  discountPrice?: number;
  isDiscountActive: boolean;
};

export type Rounding = "none" | "ratus" | "ribu";

/** Harga jual yang benar-benar dipakai di layar (promo menang bila aktif). */
export function hargaJualAktif(p: HargaProduk): number {
  if (
    p.isDiscountActive &&
    typeof p.discountPrice === "number" &&
    p.discountPrice > 0 &&
    p.discountPrice < p.sellPrice
  ) {
    return p.discountPrice;
  }
  return p.sellPrice;
}

/** Laba kotor per unit (rupiah bulat, boleh negatif bila salah harga). */
export function labaPerUnit(p: HargaProduk): number {
  return Math.round(hargaJualAktif(p) - p.hppPrice);
}

/** Persentase margin terhadap harga jual (1 desimal). */
export function persenMargin(p: HargaProduk): number {
  const jual = hargaJualAktif(p);
  if (jual <= 0) return 0;
  return Math.round(((jual - p.hppPrice) / jual) * 1000) / 10;
}

/** Pembulatan ke kelipatan ratusan/ribuan terdekat. */
export function bulatkan(harga: number, rounding: Rounding): number {
  if (rounding === "ratus") return Math.round(harga / 100) * 100;
  if (rounding === "ribu") return Math.round(harga / 1000) * 1000;
  return Math.round(harga);
}

export type FormulaBulk = {
  /** Tambah tetap per produk (rupiah). */
  fixedAdd?: number;
  /** Tambah persen dari harga saat ini (mis. 5 = +5%). */
  persenAdd?: number;
  /** Pembulatan hasil akhir. */
  rounding?: Rounding;
};

/**
 * Terapkan formula penyesuaian harga massal pada satu harga.
 * Fixed Add-on diterapkan lebih dulu, lalu Percentage Add-on — urutannya
 * tetap dan terdokumentasi agar hasil bisa direproduksi.
 */
export function terapkanFormulaBulk(hargaSaatIni: number, formula: FormulaBulk): number {
  const fixed = formula.fixedAdd ?? 0;
  const persen = formula.persenAdd ?? 0;
  const setelahFixed = hargaSaatIni + fixed;
  const setelahPersen = setelahFixed + (setelahFixed * persen) / 100;
  return bulatkan(setelahPersen, formula.rounding ?? "none");
}

export type BulkTarget = "sell" | "discount";

export type BarisBulk = {
  productId: string;
  nama: string;
  hpp: number;
  sebelum: number;
  sesudah: number;
  labaSebelum: number;
  labaSesudah: number;
  /** true bila hasil akhir di bawah HPP sehingga DILEWATI (dijaga). */
  dilewati: boolean;
};

export type HasilBulk = {
  baris: BarisBulk[];
  diubah: number;
  dilewati: number;
};

export type KriteriaBulk = {
  target: BulkTarget;
  formula: FormulaBulk;
  /** Laba minimum yang harus tetap ada setelah penyesuaian (rupiah). */
  minLaba?: number;
};

/**
 * Hitung pratinjau penyesuaian harga massal untuk sekumpulan produk.
 * Produk yang harganya jatuh di bawah HPP (atau di bawah laba minimum)
 * DILEWATI, bukan dinaikkan diam-diam — supaya tidak pernah jual rugi.
 */
export function hitungBulk(
  produk: Array<{ id: string; nama: string; hppPrice: number; sellPrice: number; discountPrice?: number }>,
  kriteria: KriteriaBulk,
): HasilBulk {
  const minLaba = kriteria.minLaba ?? 0;
  const baris: BarisBulk[] = [];
  let diubah = 0;
  let dilewati = 0;

  for (const p of produk) {
    const hargaSaatIni =
      kriteria.target === "discount" ? (p.discountPrice ?? p.sellPrice) : p.sellPrice;
    const sesudah = terapkanFormulaBulk(hargaSaatIni, kriteria.formula);
    const labaSebelum = Math.round(hargaSaatIni - p.hppPrice);
    const labaSesudah = Math.round(sesudah - p.hppPrice);
    const dilewatiBaris = labaSesudah < minLaba;
    if (dilewatiBaris) dilewati += 1;
    else diubah += 1;
    baris.push({
      productId: p.id,
      nama: p.nama,
      hpp: p.hppPrice,
      sebelum: hargaSaatIni,
      sesudah,
      labaSebelum,
      labaSesudah,
      dilewati: dilewatiBaris,
    });
  }

  return { baris, diubah, dilewati };
}
