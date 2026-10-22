/**
 * Voucher PINDAI — aturan pemakaian terhadap plafon pembiayaan.
 *
 * Dua peran voucher yang sengaja dipisah:
 *  - `diskon_admin` memotong biaya admin di muka. Pokok yang dipakai plafon
 *    TIDAK berubah: nasabah tetap memakai plafon sebesar pokok yang diajukan,
 *    hanya uang yang diterimanya lebih besar.
 *  - `boost_plafon` menambah batas pengajuan sekali pakai. Ia tidak memotong
 *    biaya apa pun dan hangus setelah satu pengajuan.
 *
 * Voucher ujrah/margin adalah aturan akad syariah dan tinggal di
 * `lib/syariah/voucher.ts` — di sini hanya nama jenisnya, supaya satu daftar
 * jenis dipakai server, panel admin, dan layar nasabah.
 *
 * Semua angka rupiah bulat. Tidak ada React, Convex, atau jam perangkat:
 * `sekarang` selalu dikirim pemanggil supaya kelayakan bisa diuji.
 */
import { formatRupiah, type Rupiah } from "./money";

/** Jenis voucher yang dikenal sistem. */
export type JenisVoucher =
  | "diskon_admin"
  | "diskon_ujrah"
  | "diskon_margin"
  | "boost_plafon";

export const JENIS_VOUCHER: readonly JenisVoucher[] = [
  "diskon_admin",
  "diskon_ujrah",
  "diskon_margin",
  "boost_plafon",
] as const;

/** Label manusiawi untuk tiap jenis — dipakai panel admin dan kartu nasabah. */
export const LABEL_JENIS_VOUCHER: Record<JenisVoucher, string> = {
  diskon_admin: "Bebas biaya admin",
  diskon_ujrah: "Potongan ujrah",
  diskon_margin: "Potongan margin",
  boost_plafon: "Tambah limit",
};

/** Status simpan voucher. `terpakai` dan `dicabut` tidak pernah layak dipakai. */
export type StatusVoucher = "aktif" | "terpakai" | "dicabut";

/** Satu voucher seperti yang dikirim server ke layar nasabah. */
export type VoucherRingkas = {
  _id: string;
  kode: string;
  jenis: JenisVoucher;
  judul: string;
  /** Rupiah: nilai potongan, atau tambahan limit untuk `boost_plafon`. */
  nilai: Rupiah;
  /** Pokok pengajuan minimum agar voucher ini boleh dipakai. */
  minPokok: Rupiah;
  batasPemakaian: number;
  terpakai: number;
  status: StatusVoucher;
  berlakuSampai: number;
};

/** Alasan voucher belum/tidak bisa dipakai, siap tampil apa adanya. */
export type KelayakanVoucher = {
  layak: boolean;
  alasan: string | null;
};

/** Sisa kuota pemakaian; tidak pernah negatif. */
export function sisaKuota(voucher: Pick<VoucherRingkas, "batasPemakaian" | "terpakai">): number {
  const batas = Number.isSafeInteger(voucher.batasPemakaian)
    ? Math.max(0, voucher.batasPemakaian)
    : 0;
  const dipakai = Number.isSafeInteger(voucher.terpakai) ? Math.max(0, voucher.terpakai) : 0;
  return Math.max(0, batas - dipakai);
}

/**
 * Apakah voucher boleh dipakai untuk pengajuan sekarang.
 *
 * `batasPengajuan` adalah angka SERVER: plafon tersedia ditambah boost voucher
 * itu sendiri bila jenisnya boost. Voucher dengan `minPokok` di atas batas
 * ditolak dengan kalimat yang menyebut kedua angkanya, bukan alasan samar.
 */
export function kelayakanVoucher(
  voucher: Pick<
    VoucherRingkas,
    "jenis" | "minPokok" | "status" | "berlakuSampai" | "batasPemakaian" | "terpakai"
  >,
  opsi: { batasPengajuan: Rupiah; sekarang: number },
): KelayakanVoucher {
  if (voucher.status !== "aktif") {
    return { layak: false, alasan: "Voucher sudah tidak aktif." };
  }
  if (sisaKuota(voucher) <= 0) {
    return { layak: false, alasan: "Kuota voucher ini sudah habis." };
  }
  if (!Number.isSafeInteger(voucher.berlakuSampai) || voucher.berlakuSampai < opsi.sekarang) {
    return { layak: false, alasan: "Masa berlaku voucher sudah lewat." };
  }
  const batas = Math.max(0, Math.floor(opsi.batasPengajuan));
  if (voucher.minPokok > batas) {
    return {
      layak: false,
      alasan: `Minimal pengajuan ${formatRupiah(voucher.minPokok)} (Limit Anda saat ini ${formatRupiah(batas)})`,
    };
  }
  return { layak: true, alasan: null };
}

/**
 * Batas pengajuan untuk satu voucher.
 *
 * Voucher boost ikut menaikkan batas yang dipakai memeriksa `minPokok`-nya
 * sendiri — kalau tidak, voucher "+Rp500.000 dengan minimal Rp1.500.000" tidak
 * akan pernah layak untuk nasabah berlimit Rp1.000.000, padahal justru itu
 * gunanya. Voucher diskon tidak menaikkan batas apa pun.
 */
export function batasUntukVoucher(
  voucher: Pick<VoucherRingkas, "jenis" | "nilai">,
  tersedia: Rupiah,
): Rupiah {
  const dasar = Math.max(0, Math.floor(tersedia));
  if (voucher.jenis !== "boost_plafon") return dasar as Rupiah;
  return (dasar + Math.max(0, Math.floor(voucher.nilai))) as Rupiah;
}

/** Total tambahan limit dari voucher boost yang masih bisa dipakai. */
export function boostTersedia(
  vouchers: readonly VoucherRingkas[],
  opsi: { tersedia: Rupiah; sekarang: number },
): Rupiah {
  let total = 0;
  for (const voucher of vouchers) {
    if (voucher.jenis !== "boost_plafon") continue;
    const layak = kelayakanVoucher(voucher, {
      batasPengajuan: batasUntukVoucher(voucher, opsi.tersedia),
      sekarang: opsi.sekarang,
    });
    if (layak.layak) total += Math.max(0, Math.floor(voucher.nilai));
  }
  return total as Rupiah;
}

/**
 * Potongan biaya admin dari voucher.
 *
 * Tidak pernah melebihi biaya admin yang benar-benar ada: voucher Rp50.000
 * pada pinjaman dengan biaya admin Rp20.000 hanya membebaskan Rp20.000, dan
 * sisanya tidak berubah menjadi uang tunai.
 */
export function diskonBiayaAdmin(
  voucher: Pick<VoucherRingkas, "jenis" | "nilai"> | null,
  biayaAdmin: Rupiah,
): Rupiah {
  if (voucher === null || voucher.jenis !== "diskon_admin") return 0 as Rupiah;
  const admin = Math.max(0, Math.floor(biayaAdmin));
  const nilai = Math.max(0, Math.floor(voucher.nilai));
  return Math.min(admin, nilai) as Rupiah;
}

/**
 * Rincian pengajuan setelah voucher — dipakai layar nasabah dan panel admin
 * untuk membaca angka yang sama dengan yang dihitung server saat pengajuan
 * disimpan.
 *
 * Identitas yang selalu berlaku:
 *   `plafonTerpakai = pokok` (voucher tidak mengecilkan pemakaian plafon)
 *   `totalTagihan = pokok + bunga` (diskon admin tidak mengubah kewajiban)
 */
export type RincianVoucherPengajuan = {
  pokok: Rupiah;
  biayaAdmin: Rupiah;
  diskonVoucher: Rupiah;
  biayaAdminSetelahDiskon: Rupiah;
  danaDiterima: Rupiah;
  totalTagihan: Rupiah;
  plafonTerpakai: Rupiah;
  boostLimit: Rupiah;
};

export function rincianVoucherPengajuan(angka: {
  pokok: Rupiah;
  biayaAdmin: Rupiah;
  biayaLain: Rupiah;
  bunga: Rupiah;
  voucher: Pick<VoucherRingkas, "jenis" | "nilai"> | null;
}): RincianVoucherPengajuan {
  const pokok = Math.max(0, Math.floor(angka.pokok));
  const biayaAdmin = Math.max(0, Math.floor(angka.biayaAdmin));
  const biayaLain = Math.max(0, Math.floor(angka.biayaLain));
  const bunga = Math.max(0, Math.floor(angka.bunga));
  const diskonVoucher = diskonBiayaAdmin(angka.voucher, biayaAdmin);
  const biayaAdminSetelahDiskon = (biayaAdmin - diskonVoucher) as Rupiah;
  const boostLimit =
    angka.voucher !== null && angka.voucher.jenis === "boost_plafon"
      ? (Math.max(0, Math.floor(angka.voucher.nilai)) as Rupiah)
      : (0 as Rupiah);

  return {
    pokok: pokok as Rupiah,
    biayaAdmin: biayaAdmin as Rupiah,
    diskonVoucher,
    biayaAdminSetelahDiskon,
    danaDiterima: (pokok - biayaAdminSetelahDiskon - biayaLain) as Rupiah,
    totalTagihan: (pokok + bunga) as Rupiah,
    plafonTerpakai: pokok as Rupiah,
    boostLimit,
  };
}

/** Voucher apresiasi: 1% pokok pelunasan, dibulatkan ke bawah, maksimum Rp25.000. */
export const VOUCHER_APRESIASI_PERSEN = 1;
export const VOUCHER_APRESIASI_MAKS = 25_000;
export const VOUCHER_APRESIASI_MIN = 5_000;
/** Masa berlaku voucher apresiasi, dalam hari. */
export const VOUCHER_APRESIASI_HARI = 90;

/**
 * Nilai voucher apresiasi untuk satu pelunasan tepat waktu.
 *
 * Dihitung dari pokok yang benar-benar dilunasi, 1% dan dibatasi
 * `VOUCHER_APRESIASI_MAKS`. Lantai `VOUCHER_APRESIASI_MIN` menjaga voucher
 * tetap berguna untuk pokok kecil; nilai nol berarti tidak ada voucher.
 */
export function nilaiVoucherApresiasi(pokok: Rupiah): Rupiah {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) return 0 as Rupiah;
  const nilai = Math.floor((pokok * VOUCHER_APRESIASI_PERSEN) / 100);
  return Math.min(VOUCHER_APRESIASI_MAKS, Math.max(VOUCHER_APRESIASI_MIN, nilai)) as Rupiah;
}
