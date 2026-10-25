/**
 * Kebijakan pinjaman PINDAI: pembagian marjin dan syarat pengajuan.
 *
 * Satu tempat untuk dua aturan yang dipakai mesin harga, kontrak, ruang
 * pendana, dan gerbang pengajuan:
 *
 *  1. Marjin yang dibayar peminjam dibagi antara pendana dan platform dengan
 *     porsi 47 : 13 dari 60 (78,333…% : 21,666…%). Rasio disimpan sebagai
 *     pembilang/penyebut, bukan persen desimal, supaya Rp300.000 terbagi tepat
 *     Rp235.000 / Rp65.000. Pembagian memakai bilangan bulat; sisa pembulatan
 *     selalu jatuh ke platform agar pendana tidak pernah menerima lebih dari
 *     porsinya.
 *
 *  2. Marjin tenor bulanan adalah marjin TOTAL sepanjang tenor, bukan per
 *     bulan: 1 bulan 30%, 3 bulan 60%, 6 bulan 72%. Nilainya dibaca dari tarif
 *     bawaan `lib/bulanan` supaya tidak ada angka kedua yang bisa berbeda.
 *     Tenor 3 dan 6 bulan hanya untuk pokok mulai Rp3.000.000.
 *
 * Syarat dokumen mengikuti risiko: tenor 1 bulan cukup KTP, selfie, dan KK;
 * tenor 3/6 bulan atau pokok ≥ Rp3.000.000 menambah bukti domisili, bukti
 * penghasilan, dan penitipan kartu ATM. PIN tidak pernah diminta atau disimpan:
 * yang dicatat hanya nomor tanda terima penitipan.
 */
/**
 * Marjin per bulan menurut kebijakan tenor. Marjin TOTAL satu tenor adalah
 * angka ini dikali jumlah bulan: 1 bulan 30%, 3 bulan 60%, 6 bulan 72%.
 *
 * Angka ini adalah kebijakan produk. Tarif bawaan mesin bulanan
 * (`BULANAN_PRICING`) menyamakan nilainya, sehingga perhitungan, kontrak, dan
 * proyeksi pendana memakai marjin yang sama dengan gerbang syarat di sini.
 */
export const MARJIN_PER_BULAN: Readonly<Record<number, number>> = {
  1: 30,
  3: 20,
  6: 12,
};

/** Porsi marjin: pendana 47/60, platform 13/60. */
export const PORSI_MARGIN = {
  pendanaPembilang: 47,
  platformPembilang: 13,
  penyebut: 60,
} as const;

/** Persen porsi pendana untuk ditampilkan (78,333…). */
export const PERSEN_PORSI_PENDANA =
  (PORSI_MARGIN.pendanaPembilang / PORSI_MARGIN.penyebut) * 100;

/** Persen porsi platform untuk ditampilkan (21,666…). */
export const PERSEN_PORSI_PLATFORM =
  (PORSI_MARGIN.platformPembilang / PORSI_MARGIN.penyebut) * 100;

export type BagiMargin = {
  /** Bagian pendana; dibulatkan ke bawah. */
  pendana: number;
  /** Sisa marjin untuk platform; tidak ada rupiah yang hilang. */
  platform: number;
};

/**
 * Bagi satu marjin (bunga/margin pinjaman) menjadi hak pendana dan platform.
 *
 * `Math.floor` dipakai lewat BigInt untuk nominal besar, sehingga hasilnya
 * bilangan bulat dan tidak ada rupiah yang diciptakan. Platform menerima sisa
 * pembulatan, bukan pendana.
 */
export function bagiMargin(margin: number): BagiMargin {
  if (!Number.isSafeInteger(margin) || margin < 0) {
    throw new Error(`Marjin harus rupiah bulat non-negatif: ${margin}`);
  }
  const pendana = Number(
    (BigInt(margin) * BigInt(PORSI_MARGIN.pendanaPembilang)) /
      BigInt(PORSI_MARGIN.penyebut),
  );
  return { pendana, platform: margin - pendana };
}

/**
 * Bagi marjin satu bagian alokasi dari marjin pinjaman penuh.
 *
 * Dipakai saat satu pinjaman didanai beberapa pendana: marjin dibagi menurut
 * porsi pokok alokasi lebih dulu, lalu tiap bagian dibagi 47 : 13. Pembulatan
 * ke bawah pada pembagian porsi menjaga total bagian tidak melebihi marjin.
 */
export function bagiMarginBagian(
  marginTotal: number,
  pokokBagian: number,
  pokokTotal: number,
): BagiMargin {
  if (!Number.isSafeInteger(marginTotal) || marginTotal < 0) {
    throw new Error(`Marjin total harus rupiah bulat non-negatif: ${marginTotal}`);
  }
  if (
    !Number.isSafeInteger(pokokBagian) ||
    !Number.isSafeInteger(pokokTotal) ||
    pokokBagian < 0 ||
    pokokTotal <= 0 ||
    pokokBagian > pokokTotal
  ) {
    throw new Error(
      `Porsi pokok tidak valid: bagian ${pokokBagian} dari ${pokokTotal}`,
    );
  }
  if (pokokBagian === pokokTotal) return bagiMargin(marginTotal);
  const marginBagian = Number(
    (BigInt(marginTotal) * BigInt(pokokBagian)) / BigInt(pokokTotal),
  );
  return bagiMargin(marginBagian);
}

/** Marjin total tenor bulanan menurut kebijakan (30%, 60%, 72%). */
export function marjinTotalTenor(tenorBulan: number): number {
  return (MARJIN_PER_BULAN[tenorBulan] ?? 0) * tenorBulan;
}

/** Pokok minimum per tenor bulanan. Tenor tanpa entri tidak punya minimum. */
export const MINIMUM_POKOK_TENOR: Readonly<Record<number, number>> = {
  3: 3_000_000,
  6: 3_000_000,
};

/** Pokok minimum untuk tenor bulanan; 0 bila tenor tidak dibatasi. */
export function minimumPokokTenor(tenorBulan: number): number {
  return MINIMUM_POKOK_TENOR[tenorBulan] ?? 0;
}

/**
 * Periksa pokok terhadap minimum tenor. Mengembalikan pesan siap tampil, atau
 * `null` bila lolos. Dipakai server dan formulir dengan pesan yang sama.
 */
export function periksaMinimumPokok(
  pokok: number,
  tenorBulan: number,
): string | null {
  const minimum = minimumPokokTenor(tenorBulan);
  if (minimum === 0 || pokok >= minimum) return null;
  return `Tenor ${tenorBulan} bulan minimal pokok ${minimum.toLocaleString(
    "id-ID",
  )} rupiah.`;
}

export type SyaratUnderwriting = {
  /** Foto Kartu Keluarga: berlaku untuk semua tenor. */
  kartuKeluarga: boolean;
  /** Bukti domisili (tagihan PLN/PDAM). */
  buktiDomisili: boolean;
  /** Surat kontrak kerja atau slip gaji tiga bulan terakhir. */
  buktiPenghasilan: boolean;
  /**
   * Penitipan fisik kartu ATM beserta nomor tanda terima. PIN TIDAK diminta
   * dan tidak pernah disimpan.
   */
  penitipanAtm: boolean;
  /** Kalimat ringkas untuk ditampilkan di formulir dan ruang pendana. */
  ringkas: readonly string[];
};

/**
 * Syarat dokumen satu pengajuan.
 *
 * Tenor 1 bulan: KTP, selfie KTP, dan KK. Tenor 3/6 bulan ATAU pokok
 * Rp3.000.000 ke atas menambah bukti domisili, bukti penghasilan, dan
 * penitipan ATM.
 */
export function syaratUnderwriting({
  tenorBulan,
  pokok,
}: {
  /** Kosong = skema harian (7/14/21/28 hari). */
  tenorBulan?: number | null;
  pokok: number;
}): SyaratUnderwriting {
  const tenorPanjang =
    tenorBulan !== undefined && tenorBulan !== null && tenorBulan >= 3;
  const nominalBesar = pokok >= 3_000_000;
  const perluJaminanTambahan = tenorPanjang || nominalBesar;

  const ringkas: string[] = [];
  ringkas.push("Foto KTP dan selfie dengan KTP");
  ringkas.push("Foto Kartu Keluarga");
  if (perluJaminanTambahan) {
    ringkas.push("Bukti domisili (tagihan PLN atau PDAM)");
    ringkas.push("Surat kontrak kerja atau slip gaji 3 bulan terakhir");
    ringkas.push("Penitipan kartu ATM dan nomor tanda terima (tanpa PIN)");
  }

  return {
    kartuKeluarga: true,
    buktiDomisili: perluJaminanTambahan,
    buktiPenghasilan: perluJaminanTambahan,
    penitipanAtm: perluJaminanTambahan,
    ringkas,
  };
}
