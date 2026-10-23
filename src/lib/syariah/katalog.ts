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
 * Berkas ini adalah DAFTAR AWAL (seed) sekaligus sumber istilah bersama:
 * kategori, label jenis barang, nomor tujuan, dan aturan pengiriman. Harga yang
 * dilihat peminjam dibaca dari tabel `katalogBarang` yang dikelola admin;
 * daftar di bawah dipakai untuk mengisi tabel itu lewat "Muat katalog awal"
 * dan sebagai cadangan bila satu kode belum sempat dimuat. Setiap harga wajib
 * berada di rentang akad (MIN_AKAD_SYARIAH–MAX_AKAD_SYARIAH) — dijaga uji.
 */
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
  /** Kode stabil; disimpan pada pengajuan agar barangnya tetap terlacak. */
  kode: string;
  nama: string;
  kategori: KategoriKatalog;
  jenisBarang: JenisBarangKatalog;
  /** Harga pokok dari mitra, rupiah bulat. */
  harga: Rupiah;
};

export const KATALOG_MURABAHAH: readonly BarangKatalog[] = [
  // ===== Elektronik =====
  {
    kode: "el-smartphone-128",
    nama: "Smartphone 4G 128 GB",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 2_100_000,
  },
  {
    kode: "el-laptop-14",
    nama: "Laptop kerja 14 inci",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 6_500_000,
  },
  {
    kode: "el-tv-32",
    nama: "TV LED 32 inci",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 2_400_000,
  },
  {
    kode: "el-kulkas-2-pintu",
    nama: "Kulkas 2 pintu 200 L",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 3_300_000,
  },
  {
    kode: "el-mesin-cuci",
    nama: "Mesin cuci 1 tabung 7 kg",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 2_900_000,
  },
  {
    kode: "el-setrika-uap",
    nama: "Setrika uap 1.800 W",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 350_000,
  },
  {
    kode: "el-rice-cooker",
    nama: "Rice cooker 1,8 L",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 425_000,
  },
  {
    kode: "el-kipas-dinding",
    nama: "Kipas angin dinding",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 275_000,
  },
  {
    kode: "el-mixer-300",
    nama: "Mixer dapur 300 W",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 325_000,
  },
  {
    kode: "el-speaker-bluetooth",
    nama: "Speaker bluetooth 20 W",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 399_000,
  },
  {
    kode: "el-kipas-berdiri",
    nama: "Kipas angin berdiri 18 inci",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 450_000,
  },
  {
    kode: "el-kompor-indulsi",
    nama: "Kompor induksi 1 tungku",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 550_000,
  },
  {
    kode: "el-oven-listrik",
    nama: "Oven listrik 25 L",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 675_000,
  },
  {
    kode: "el-dispenser-air",
    nama: "Dispenser air panas-dingin",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 875_000,
  },
  {
    kode: "el-smartphone-64",
    nama: "Smartphone 4G 64 GB",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 1_450_000,
  },
  {
    kode: "el-printer-allinone",
    nama: "Printer inkjet all-in-one",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 1_650_000,
  },
  {
    kode: "el-monitor-24",
    nama: "Monitor LED 24 inci",
    kategori: "Elektronik",
    jenisBarang: "fisik",
    harga: 1_750_000,
  },

  // ===== Peralatan usaha =====
  {
    kode: "us-mesin-jahit",
    nama: "Mesin jahit industri",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 3_200_000,
  },
  {
    kode: "us-freezer-display",
    nama: "Freezer display 300 L",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 4_700_000,
  },
  {
    kode: "us-etalase",
    nama: "Etalase kaca 120 cm",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 1_800_000,
  },
  {
    kode: "us-blender-heavy",
    nama: "Blender heavy duty",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 1_250_000,
  },
  {
    kode: "us-timbangan-digital",
    nama: "Timbangan digital 30 kg",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 350_000,
  },
  {
    kode: "us-chopper-2l",
    nama: "Chopper dapur 2 L",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 425_000,
  },
  {
    kode: "us-kursi-lipat",
    nama: "Kursi lipat usaha (4 unit)",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 480_000,
  },
  {
    kode: "us-rak-toko",
    nama: "Rak toko 4 tingkat",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 750_000,
  },
  {
    kode: "us-meja-kasir",
    nama: "Meja kasir 120 cm",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 1_350_000,
  },
  {
    kode: "us-pompa-air",
    nama: "Pompa air jet pump 125 W",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 1_750_000,
  },
  {
    kode: "us-genset-1000",
    nama: "Genset 1.000 W",
    kategori: "Peralatan usaha",
    jenisBarang: "fisik",
    harga: 1_950_000,
  },

  // ===== Perabot rumah =====
  {
    kode: "pr-spring-bed",
    nama: "Spring bed 120 x 200",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 2_700_000,
  },
  {
    kode: "pr-lemari-3-pintu",
    nama: "Lemari pakaian 3 pintu",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 2_200_000,
  },
  {
    kode: "pr-meja-belajar",
    nama: "Meja belajar dan kursi",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 1_150_000,
  },
  {
    kode: "pr-lemari-plastik",
    nama: "Lemari plastik 3 susun",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 275_000,
  },
  {
    kode: "pr-karpet-2x3",
    nama: "Karpet ruang tamu 2 x 3 m",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 325_000,
  },
  {
    kode: "pr-kompor-gas",
    nama: "Kompor gas 2 tungku",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 385_000,
  },
  {
    kode: "pr-rak-buku",
    nama: "Rak buku 3 tingkat",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 450_000,
  },
  {
    kode: "pr-kasur-busa",
    nama: "Kasur busa 90 x 200",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 650_000,
  },
  {
    kode: "pr-meja-rias",
    nama: "Meja rias dan cermin",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 875_000,
  },
  {
    kode: "pr-lemari-2-pintu",
    nama: "Lemari pakaian 2 pintu",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 1_550_000,
  },
  {
    kode: "pr-meja-makan",
    nama: "Meja makan 4 kursi",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 1_650_000,
  },
  {
    kode: "pr-kursi-tamu",
    nama: "Set kursi tamu 4 dudukan",
    kategori: "Perabot rumah",
    jenisBarang: "fisik",
    harga: 1_850_000,
  },

  // ===== Kendaraan =====
  {
    kode: "kd-sepeda-listrik",
    nama: "Sepeda listrik 350 W",
    kategori: "Kendaraan",
    jenisBarang: "fisik",
    harga: 5_900_000,
  },
  {
    kode: "kd-motor-bebek",
    nama: "Motor bebek 110 cc (unit mitra)",
    kategori: "Kendaraan",
    jenisBarang: "fisik",
    harga: 9_500_000,
  },
  {
    kode: "kd-helm-sni",
    nama: "Helm standar SNI",
    kategori: "Kendaraan",
    jenisBarang: "fisik",
    harga: 175_000,
  },
  {
    kode: "kd-ban-motor",
    nama: "Ban motor tubeless (sepasang)",
    kategori: "Kendaraan",
    jenisBarang: "fisik",
    harga: 480_000,
  },
  {
    kode: "kd-sepeda-gunung",
    nama: "Sepeda gunung 26 inci",
    kategori: "Kendaraan",
    jenisBarang: "fisik",
    harga: 1_850_000,
  },

  // ===== Pulsa & data (non-ewallet) =====
  {
    kode: "pl-pulsa-100",
    nama: "Pulsa 100.000",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 100_000,
  },
  {
    kode: "pl-pulsa-200",
    nama: "Pulsa 200.000",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 200_000,
  },
  {
    kode: "pl-paket-data-100",
    nama: "Paket data 100 GB / 30 hari",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 150_000,
  },
  {
    kode: "pl-paket-data-30",
    nama: "Paket data 30 GB / 30 hari",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 105_000,
  },
  {
    kode: "pl-pulsa-150",
    nama: "Pulsa 150.000",
    kategori: "Pulsa & data",
    jenisBarang: "digital",
    harga: 150_000,
  },

  // ===== Token & tagihan (non-ewallet) =====
  {
    kode: "tl-token-200",
    nama: "Token listrik 200.000",
    kategori: "Token & tagihan",
    jenisBarang: "digital",
    harga: 200_000,
  },
  {
    kode: "tl-token-500",
    nama: "Token listrik 500.000",
    kategori: "Token & tagihan",
    jenisBarang: "digital",
    harga: 500_000,
  },
  {
    kode: "tl-token-100",
    nama: "Token listrik 100.000",
    kategori: "Token & tagihan",
    jenisBarang: "digital",
    harga: 100_000,
  },
  {
    kode: "tl-token-300",
    nama: "Token listrik 300.000",
    kategori: "Token & tagihan",
    jenisBarang: "digital",
    harga: 300_000,
  },
] as const;

const PETA_KATALOG = new Map(
  KATALOG_MURABAHAH.map((barang) => [barang.kode, barang]),
);

/** Barang katalog berdasarkan kode, atau null bila tidak ada. */
export function barangKatalog(kode: string): BarangKatalog | null {
  return PETA_KATALOG.get(kode) ?? null;
}

/**
 * Saring daftar katalog untuk formulir: kategori, kata kunci (nama/kategori),
 * dan batas harga. Urutan daftar dipertahankan. Daftar datang dari server
 * (tabel `katalogBarang`) sehingga admin bisa menambah barang tanpa rilis.
 */
export function saringBarangKatalog(
  daftar: readonly BarangKatalog[],
  {
    kategori,
    kataKunci,
    batasHarga,
  }: {
    kategori?: KategoriKatalog;
    kataKunci?: string;
    batasHarga?: number;
  } = {},
): BarangKatalog[] {
  const needle = kataKunci?.trim().toLowerCase() ?? "";
  return daftar.filter((barang) => {
    if (kategori !== undefined && barang.kategori !== kategori) return false;
    if (batasHarga !== undefined && barang.harga > batasHarga) return false;
    if (needle === "") return true;
    return `${barang.nama} ${barang.kategori}`
      .toLowerCase()
      .includes(needle);
  });
}

/** Saringan atas daftar awal — dipakai uji dan sebagai fallback dokumentasi. */
export function cariBarangKatalog(
  opsi: {
    kategori?: KategoriKatalog;
    kataKunci?: string;
    batasHarga?: number;
  } = {},
): BarangKatalog[] {
  return saringBarangKatalog(KATALOG_MURABAHAH, opsi);
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
