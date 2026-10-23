/**
 * Katalog Murabahah — barang dan layanan yang boleh dibeli PINDAI lebih dulu
 * lalu dijual ke peminjam dengan margin yang disepakati.
 *
 * Isi katalog: barang fisik dan pulsa/PPOB non-ewallet (pulsa, paket data,
 * token listrik). E-wallet dan uang tunai SENGAJA tidak masuk: nilainya setara
 * uang, sedangkan Murabahah harus atas barang atau jasa yang jelas. Karena itu
 * pulsa/PPOB di sini hanya yang diterima sebagai produk dari mitra, bukan saldo
 * dompet yang bisa dicairkan.
 *
 * Harga yang tercatat adalah HARGA POKOK dari mitra — harga beli PINDAI, bukan
 * harga yang dibayar peminjam. Margin ditambahkan mesin akad (`lib/syariah`),
 * jadi katalog tidak pernah menyimpan harga jual.
 *
 * Katalog ini statis dan ikut rilis kode, seperti preset doorprize: harga yang
 * dipakai server adalah harga yang sama dengan yang dilihat peminjam, dan tidak
 * ada panel admin yang bisa membuat keduanya berbeda. Setiap harga wajib berada
 * di rentang akad (MIN_AKAD_SYARIAH–MAX_AKAD_SYARIAH) — dijaga uji.
 */
import { MAX_AKAD_SYARIAH, MIN_AKAD_SYARIAH } from "./akad";
import type { Rupiah } from "../money";

/** Barang berwujud yang dikirim mitra, atau produk digital yang dikirim ke nomor tujuan. */
export type JenisBarangKatalog = "fisik" | "digital";

export const LABEL_JENIS_BARANG: Record<JenisBarangKatalog, string> = {
  fisik: "Barang fisik",
  digital: "Pulsa / PPOB",
};

/** Satu kalimat cara barang sampai ke peminjam — dipakai formulir dan panel admin. */
export const CATATAN_PENGIRIMAN: Record<JenisBarangKatalog, string> = {
  fisik: "Dikirim mitra 2-4 hari setelah akad dicatat.",
  digital: "Dikirim ke nomor tujuan setelah akad dicatat.",
};

export const KATEGORI_KATALOG = [
  "Elektronik",
  "Peralatan usaha",
  "Perabot rumah",
  "Kendaraan",
  "Pulsa & data",
  "Token & tagihan",
] as const;

export type KategoriKatalog = (typeof KATEGORI_KATALOG)[number];

export type BarangKatalog = {
  /** Id stabil; disimpan pada pengajuan agar barangnya tetap terlacak. */
  id: string;
  nama: string;
  kategori: KategoriKatalog;
  jenisBarang: JenisBarangKatalog;
  /** Harga pokok dari mitra, rupiah bulat. */
  harga: Rupiah;
};

export const KATALOG_MURABAHAH: readonly BarangKatalog[] = [
  // ===== Elektronik =====
  {
    id: "el-smartphone-128",
    nama: "Smartphone 4G 128 GB",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 2_100_000,
  },
  {
    id: "el-laptop-14",
    nama: "Laptop kerja 14 inci",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 6_500_000,
  },
  {
    id: "el-tv-32",
    nama: "TV LED 32 inci",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 2_400_000,
  },
  {
    id: "el-kulkas-2-pintu",
    nama: "Kulkas 2 pintu 200 L",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 3_300_000,
  },
  {
    id: "el-mesin-cuci",
    nama: "Mesin cuci 1 tabung 7 kg",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 2_900_000,
  },
  {
    id: "el-setrika-uap",
    nama: "Setrika uap 1.800 W",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 350_000,
  },
  {
    id: "el-rice-cooker",
    nama: "Rice cooker 1,8 L",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 425_000,
  },
  {
    id: "el-kipas-dinding",
    nama: "Kipas angin dinding",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 275_000,
  },

  // ===== Peralatan usaha =====
  {
    id: "us-mesin-jahit",
    nama: "Mesin jahit industri",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 3_200_000,
  },
  {
    id: "us-freezer-display",
    nama: "Freezer display 300 L",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 4_700_000,
  },
  {
    id: "us-etalase",
    nama: "Etalase kaca 120 cm",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 1_800_000,
  },
  {
    id: "us-blender-heavy",
    nama: "Blender heavy duty",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 1_250_000,
  },

  // ===== Perabot rumah =====
  {
    id: "pr-spring-bed",
    nama: "Spring bed 120 x 200",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 2_700_000,
  },
  {
    id: "pr-lemari-3-pintu",
    nama: "Lemari pakaian 3 pintu",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 2_200_000,
  },
  {
    id: "pr-meja-belajar",
    nama: "Meja belajar dan kursi",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 1_150_000,
  },

  // ===== Kendaraan =====
  {
    id: "kd-sepeda-listrik",
    nama: "Sepeda listrik 350 W",
    kategori: "Kendaraan",
    jenisBarang: "fisik",
    harga: 5_900_000,
  },
  {
    id: "kd-motor-bebek",
    nama: "Motor bebek 110 cc (unit mitra)",
    kategori: "Kendaraan",
    jenisBarang: "fisik",
    harga: 9_500_000,
  },

  // ===== Pulsa & data (non-ewallet) =====
  {
    id: "pl-pulsa-100",
    nama: "Pulsa 100.000",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 100_000,
  },
  {
    id: "pl-pulsa-200",
    nama: "Pulsa 200.000",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 200_000,
  },
  {
    id: "pl-paket-data-100",
    nama: "Paket data 100 GB / 30 hari",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 150_000,
  },

  // ===== Token & tagihan (non-ewallet) =====
  {
    id: "tl-token-200",
    nama: "Token listrik 200.000",
    kategori: "Token & tagihan",
    jenisBarang: "digital",
    harga: 200_000,
  },
  {
    id: "tl-token-500",
    nama: "Token listrik 500.000",
    kategori: "Token & tagihan",
    jenisBarang: "digital",
    harga: 500_000,
  },
] as const;

const PETA_KATALOG = new Map(KATALOG_MURABAHAH.map((barang) => [barang.id, barang]));

/** Barang katalog berdasarkan id, atau null bila tidak ada. */
export function barangKatalog(id: string): BarangKatalog | null {
  return PETA_KATALOG.get(id) ?? null;
}

/**
 * Barang katalog yang wajib ada — dipakai server supaya harga dan nama yang
 * dicatat berasal dari katalog ini, bukan dari angka kiriman klien.
 */
export function wajibBarangKatalog(id: string): BarangKatalog {
  const barang = barangKatalog(id);
  if (barang === null) {
    throw new Error("Barang katalog tidak ditemukan. Pilih ulang dari katalog.");
  }
  return barang;
}

/**
 * Saring katalog untuk formulir: kategori, kata kunci (nama/kategori), dan
 * batas harga (mis. sisa plafon). Urutan katalog dipertahankan.
 */
export function cariBarangKatalog({
  kategori,
  kataKunci,
  batasHarga,
}: {
  kategori?: KategoriKatalog;
  kataKunci?: string;
  batasHarga?: number;
} = {}): BarangKatalog[] {
  const needle = kataKunci?.trim().toLowerCase() ?? "";
  return KATALOG_MURABAHAH.filter((barang) => {
    if (kategori !== undefined && barang.kategori !== kategori) return false;
    if (batasHarga !== undefined && barang.harga > batasHarga) return false;
    if (needle === "") return true;
    return `${barang.nama} ${barang.kategori}`
      .toLowerCase()
      .includes(needle);
  });
}

/** Nomor tujuan hanya angka; pemisah spasi/strip dibuang. */
export function rapikanNomorTujuan(nomor: string): string {
  return nomor.replace(/[^0-9]/g, "");
}

/**
 * Nomor tujuan barang digital: nomor HP (pulsa/paket data) atau ID meter/nomor
 * pelanggan (token listrik). Panjangnya 6-20 angka — cukup longgar untuk kedua
 * bentuk, cukup ketat untuk menolak kiriman kosong atau teks bebas.
 */
export function nomorTujuanValid(nomor: string): boolean {
  const angka = rapikanNomorTujuan(nomor);
  return angka.length >= 6 && angka.length <= 20;
}

/** Label kolom nomor tujuan sesuai jenis produk digital. */
export function labelNomorTujuan(barang: BarangKatalog): string {
  return barang.kategori === "Token & tagihan"
    ? "ID meter / nomor pelanggan"
    : "Nomor HP tujuan";
}

/** Batas akad yang juga berlaku untuk harga katalog — dipakai uji invarian. */
export const RENTANG_HARGA_KATALOG = {
  min: MIN_AKAD_SYARIAH,
  max: MAX_AKAD_SYARIAH,
} as const;
