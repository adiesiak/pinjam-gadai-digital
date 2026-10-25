/**
 * Voucher PINDAI — aturan pemakaian terhadap plafon pembiayaan.
 *
 * Dua peran voucher yang sengaja dipisah:
 *  - `diskon_admin` memotong biaya admin di muka. Pokok yang dipakai plafon
 *    TIDAK berubah: nasabah tetap memakai plafon sebesar pokok yang diajukan,
 *    hanya uang yang diterimanya lebih besar.
 *  - `boost_plafon` menambah batas pengajuan sekali pakai. Ia tidak memotong
 *    biaya apa pun dan hangus setelah satu pengajuan.
 *  - `diskon_bunga` memotong bunga dalam poin persen. Nilainya bukan rupiah:
 *    "5" berarti bunga turun lima poin, bukan potongan Rp5.
 *  - `tambah_tenor` menambah hari jatuh tempo. Nilainya juga bukan rupiah:
 *    "7" berarti tenor bertambah tujuh hari dengan tarif tenor semula.
 *
 * Satuan `nilai` karena itu berbeda per jenis. `satuanVoucher` dan
 * `labelNilaiVoucher` adalah satu-satunya tempat yang boleh menerjemahkan
 * angka itu menjadi teks, supaya panel admin dan layar nasabah tidak
 * menuliskan "Rp5" untuk voucher lima poin bunga.
 *
 * Voucher ujrah/margin adalah aturan akad syariah dan tinggal di
 * `lib/syariah/voucher.ts` — di sini hanya nama jenisnya, supaya satu daftar
 * jenis dipakai server, panel admin, dan layar nasabah.
 *
 * Semua angka rupiah bulat. Tidak ada React, Convex, atau jam perangkat:
 * `sekarang` selalu dikirim pemanggil supaya kelayakan bisa diuji.
 */
import { formatRupiah, type Rupiah } from "./money";
import { OFFSET_WIB_MS, tanggalWIB } from "./waktu";

/** Jenis voucher yang dikenal sistem. */
export type JenisVoucher =
  | "diskon_admin"
  | "diskon_ujrah"
  | "diskon_margin"
  | "boost_plafon"
  | "diskon_bunga"
  | "tambah_tenor";

export const JENIS_VOUCHER: readonly JenisVoucher[] = [
  "diskon_admin",
  "boost_plafon",
  "diskon_bunga",
  "tambah_tenor",
  "diskon_ujrah",
  "diskon_margin",
] as const;

/** Label manusiawi untuk tiap jenis — dipakai panel admin dan kartu nasabah. */
export const LABEL_JENIS_VOUCHER: Record<JenisVoucher, string> = {
  diskon_admin: "Bebas biaya admin",
  boost_plafon: "Tambah limit",
  diskon_bunga: "Potongan bunga",
  tambah_tenor: "Tambah tenor",
  diskon_ujrah: "Potongan ujrah",
  diskon_margin: "Potongan margin",
};

/** Satuan angka `nilai` untuk satu jenis voucher. */
export type SatuanVoucher = "rupiah" | "persen" | "hari";

/**
 * Satuan nilai voucher.
 *
 * Tiga jenis memakai rupiah (potongan biaya/limit), sedangkan potongan bunga
 * memakai poin persen dan tambah tenor memakai hari. Pemanggil WAJIB membaca
 * fungsi ini sebelum memformat angka; mencetak `nilai` sebagai rupiah untuk
 * kedua jenis baru menghasilkan janji yang salah ke nasabah.
 */
export function satuanVoucher(jenis: JenisVoucher): SatuanVoucher {
  if (jenis === "diskon_bunga") return "persen";
  if (jenis === "tambah_tenor") return "hari";
  return "rupiah";
}

/** Batas nilai yang masuk akal untuk tiap jenis voucher. */
export const BATAS_NILAI_VOUCHER: Record<
  JenisVoucher,
  { min: number; max: number }
> = {
  diskon_admin: { min: 1, max: 10_000_000 },
  boost_plafon: { min: 1, max: 10_000_000 },
  diskon_ujrah: { min: 1, max: 10_000_000 },
  diskon_margin: { min: 1, max: 10_000_000 },
  /** Poin persen: 5 berarti bunga turun 5 poin, bukan potongan Rp5. */
  diskon_bunga: { min: 1, max: 25 },
  /** Hari tambahan: 7 berarti jatuh tempo mundur seminggu. */
  tambah_tenor: { min: 1, max: 30 },
};

/** Pesan galat pertama untuk nilai voucher, atau null bila sah. */
export function periksaNilaiVoucher(jenis: JenisVoucher, nilai: number): string | null {
  const batas = BATAS_NILAI_VOUCHER[jenis];
  const satuan = satuanVoucher(jenis);
  if (!Number.isSafeInteger(nilai) || nilai < batas.min || nilai > batas.max) {
    if (satuan === "persen") {
      return `Potongan bunga harus ${batas.min}–${batas.max} poin persen.`;
    }
    if (satuan === "hari") {
      return `Tambahan tenor harus ${batas.min}–${batas.max} hari.`;
    }
    return "Nilai voucher harus rupiah bulat positif.";
  }
  return null;
}

/**
 * Angka voucher dalam satu kalimat siap tampil, mis.
 * "potongan Rp 25.000", "bunga −5%", "tenor +7 hari", "tambah limit Rp 500.000".
 */
export function labelNilaiVoucher(jenis: JenisVoucher, nilai: number): string {
  if (jenis === "diskon_bunga") return `bunga −${nilai}%`;
  if (jenis === "tambah_tenor") return `tenor +${nilai} hari`;
  if (jenis === "boost_plafon") return `tambah limit ${formatRupiah(nilai as Rupiah)}`;
  return `potongan ${formatRupiah(nilai as Rupiah)}`;
}

/** Status simpan voucher. `terpakai` dan `dicabut` tidak pernah layak dipakai. */
export type StatusVoucher = "aktif" | "terpakai" | "dicabut";

/**
 * Status yang DIBACA admin: status simpan ditambah `kedaluwarsa`.
 *
 * Masa berlaku lewat tidak mengubah baris di basis data — voucher itu masih
 * `aktif` dan bisa diperpanjang. Panel admin perlu membedakannya supaya voucher
 * yang sudah tidak bisa dipakai nasabah tidak dihitung sebagai "aktif".
 */
export type StatusVoucherTampil = StatusVoucher | "kedaluwarsa";

export const LABEL_STATUS_VOUCHER: Record<StatusVoucherTampil, string> = {
  aktif: "Aktif",
  terpakai: "Habis terpakai",
  dicabut: "Dicabut",
  kedaluwarsa: "Kedaluwarsa",
};

/** Kelas lencana status untuk panel admin (Tailwind, mengikuti token panel). */
export const KELAS_STATUS_VOUCHER: Record<StatusVoucherTampil, string> = {
  aktif: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800",
  terpakai: "border-slate-300 bg-slate-100 text-slate-600",
  dicabut: "border-rose-700/30 bg-rose-700/10 text-rose-800",
  kedaluwarsa: "border-amber-700/30 bg-amber-700/10 text-amber-800",
};

/** Satu voucher seperti yang dikirim server ke layar nasabah. */
export type VoucherRingkas = {
  _id: string;
  kode: string;
  jenis: JenisVoucher;
  judul: string;
  /**
   * Angka sesuai `satuanVoucher`: rupiah untuk potongan biaya/limit, poin
   * persen untuk potongan bunga, dan hari untuk tambah tenor.
   */
  nilai: number;
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

/**
 * Tambahan limit TERBESAR dari satu voucher boost yang masih bisa dipakai.
 *
 * Satu pengajuan hanya memakai satu voucher, jadi boost beberapa voucher tidak
 * pernah berlaku sekaligus. Menjumlahkannya akan membuat kartu limit menjanjikan
 * batas yang tidak bisa diterima server saat pengajuan dikirim.
 */
export function boostTersedia(
  vouchers: readonly VoucherRingkas[],
  opsi: { tersedia: Rupiah; sekarang: number },
): Rupiah {
  let terbesar = 0;
  for (const voucher of vouchers) {
    if (voucher.jenis !== "boost_plafon") continue;
    const layak = kelayakanVoucher(voucher, {
      batasPengajuan: batasUntukVoucher(voucher, opsi.tersedia),
      sekarang: opsi.sekarang,
    });
    if (layak.layak) terbesar = Math.max(terbesar, Math.max(0, Math.floor(voucher.nilai)));
  }
  return terbesar as Rupiah;
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

/**
 * Ubah tanggal input `YYYY-MM-DD` (kalender WIB) menjadi akhir hari itu.
 *
 * Voucher berlaku SAMPAI AKHIR tanggal yang tertulis, bukan pukul 00.00 di
 * awalnya: admin yang menulis "31 Desember" mengharapkan voucher masih bisa
 * dipakai sepanjang hari itu. Teks yang bukan tanggal valid menghasilkan null,
 * bukan tanggal salah yang diam-diam tersimpan.
 */
export function akhirHariVoucher(teks: string): number | null {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks.trim());
  if (cocok === null) return null;
  const [, tahun, bulan, hari] = cocok;
  const tengahMalamWIB = Date.UTC(Number(tahun), Number(bulan) - 1, Number(hari));
  const cek = new Date(tengahMalamWIB);
  // Tanggal mustahil (31 Februari) digulirkan JavaScript; tolak alih-alih
  // menyimpan tanggal lain dari yang diketik.
  if (cek.getUTCFullYear() !== Number(tahun)) return null;
  if (cek.getUTCMonth() !== Number(bulan) - 1 || cek.getUTCDate() !== Number(hari)) {
    return null;
  }
  return tengahMalamWIB - OFFSET_WIB_MS + 86_400_000 - 1;
}

/** Kebalikan `akhirHariVoucher`: ms → `YYYY-MM-DD` kalender WIB untuk kolom isian. */
export function tanggalInputVoucher(ms: number): string {
  return tanggalWIB(ms);
}

/**
 * Status yang dibaca admin untuk satu voucher.
 * `sekarang` dikirim pemanggil supaya bisa diuji tanpa jam perangkat.
 */
export function statusTampilVoucher(
  voucher: Pick<VoucherRingkas, "status" | "berlakuSampai">,
  sekarang: number,
): StatusVoucherTampil {
  if (voucher.status === "aktif" && voucher.berlakuSampai < sekarang) return "kedaluwarsa";
  return voucher.status;
}

/** Sisa hari masa berlaku; 0 berarti berakhir hari ini atau sudah lewat. */
export function sisaHariVoucher(berlakuSampai: number, sekarang: number): number {
  if (!Number.isSafeInteger(berlakuSampai)) return 0;
  return Math.max(0, Math.ceil((berlakuSampai - sekarang) / 86_400_000));
}

/** Hitungan yang ditampilkan di kepala panel voucher admin. */
export type RingkasanVoucherAdmin = {
  total: number;
  aktif: number;
  terpakai: number;
  dicabut: number;
  kedaluwarsa: number;
  /** Jumlah nilai voucher yang masih bisa dipakai (hanya yang aktif). */
  nilaiAktif: Rupiah;
  /** Voucher aktif yang berakhir dalam 7 hari — perlu diperpanjang atau dibiarkan habis. */
  hampirBerakhir: number;
};

/**
 * Ringkas daftar voucher untuk panel admin. Murni: menerima baris apa adanya
 * dan `sekarang`, tanpa membaca jam atau basis data.
 */
export function ringkasVoucherAdmin(
  baris: readonly Pick<
    VoucherRingkas,
    "status" | "berlakuSampai" | "nilai" | "jenis"
  >[],
  sekarang: number,
): RingkasanVoucherAdmin {
  const ringkas: RingkasanVoucherAdmin = {
    total: baris.length,
    aktif: 0,
    terpakai: 0,
    dicabut: 0,
    kedaluwarsa: 0,
    nilaiAktif: 0 as Rupiah,
    hampirBerakhir: 0,
  };
  for (const voucher of baris) {
    const status = statusTampilVoucher(voucher, sekarang);
    ringkas[status] += 1;
    if (status !== "aktif") continue;
    // Hanya voucher berharga rupiah yang boleh dijumlahkan. Menambahkan poin
    // bunga atau hari tenor ke total rupiah menghasilkan angka yang tidak
    // berarti apa pun di kepala panel.
    if (satuanVoucher(voucher.jenis) !== "rupiah") continue;
    ringkas.nilaiAktif = (ringkas.nilaiAktif + Math.max(0, Math.floor(voucher.nilai))) as Rupiah;
    if (sisaHariVoucher(voucher.berlakuSampai, sekarang) <= 7) ringkas.hampirBerakhir += 1;
  }
  return ringkas;
}

/** Batas atas kuota pemakaian satu voucher. */
export const BATAS_PEMAKAIAN_MAKS = 10;

/**
 * Periksa isian yang boleh diubah admin atas voucher yang sudah terbit.
 *
 * Jenis, nilai, pemilik, dan minimal pokok sengaja TIDAK bisa disunting: angka
 * itu sudah dibaca nasabah dan bisa sudah tercatat di pengajuan. Yang boleh
 * diubah hanya teks judul, sisa kuota, dan masa berlaku. Mengembalikan kalimat
 * galat pertama, atau null bila isian sah — server memakai fungsi yang sama,
 * jadi pesan di layar tidak pernah berbeda dari penolakan server.
 */
export function periksaUbahVoucher(masukan: {
  judul?: string;
  batasPemakaian?: number;
  berlakuSampai?: number;
  terpakai: number;
  sekarang: number;
}): string | null {
  if (masukan.judul !== undefined) {
    const judul = masukan.judul.trim();
    if (judul.length < 3 || judul.length > 80) {
      return "Judul voucher harus 3–80 karakter.";
    }
  }
  if (masukan.batasPemakaian !== undefined) {
    const batas = masukan.batasPemakaian;
    if (!Number.isSafeInteger(batas) || batas < 1 || batas > BATAS_PEMAKAIAN_MAKS) {
      return `Batas pemakaian harus 1 sampai ${BATAS_PEMAKAIAN_MAKS} kali.`;
    }
    if (batas < masukan.terpakai) {
      return `Voucher ini sudah dipakai ${masukan.terpakai} kali, jadi batasnya tidak bisa diturunkan ke ${batas}.`;
    }
  }
  if (masukan.berlakuSampai !== undefined) {
    if (
      !Number.isSafeInteger(masukan.berlakuSampai) ||
      masukan.berlakuSampai <= masukan.sekarang
    ) {
      return "Masa berlaku voucher harus di masa depan.";
    }
  }
  return null;
}

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
 * Nilai voucher apresiasi untuk satu pinjaman yang sudah lunas.
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
