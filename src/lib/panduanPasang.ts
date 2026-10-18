/**
 * Langkah memasang PINDAI ke layar utama — data murni, tanpa React.
 *
 * Kenapa dipisah: halaman beranda tidak boleh menautkan Play Store atau App
 * Store yang belum ada, jadi tombol pemasangan membuka panduan peramban.
 * Langkahnya ditulis di satu tempat supaya teks Android dan iPhone tidak
 * menyimpang satu sama lain, dan bisa diuji tanpa merender komponen.
 *
 * Batas yang disebut apa adanya: PINDAI adalah web app. Tidak ada berkas yang
 * diunduh; pemasangan hanya menambah ikon. Di iPhone hanya Safari yang bisa
 * melakukannya.
 */

export type IdPlatformPasang = "android" | "ios";

export type PanduanPasang = {
  readonly id: IdPlatformPasang;
  /** Nama platform pada label tombol ("Pasang di Android"). */
  readonly label: string;
  /** Peramban yang dipakai pada langkah pertama. */
  readonly peramban: string;
  readonly langkah: readonly string[];
  /** Catatan kecil di bawah langkah — batas atau pengecualian. */
  readonly catatan: string;
};

export const PANDUAN_PASANG: readonly PanduanPasang[] = [
  {
    id: "android",
    label: "Android",
    peramban: "Chrome di Android",
    langkah: [
      "Buka PINDAI di Chrome sampai beranda tampil.",
      "Ketuk menu tiga titik di kanan atas.",
      "Pilih “Instal aplikasi”. Bila tidak muncul, pilih “Tambahkan ke layar utama”.",
      "Ketuk “Instal” — ikon PINDAI muncul di layar utama.",
    ],
    catatan:
      "Di Samsung Internet atau Firefox, nama menunya bisa berbeda; urutan langkahnya sama.",
  },
  {
    id: "ios",
    label: "iPhone",
    peramban: "Safari di iPhone atau iPad",
    langkah: [
      "Buka PINDAI di Safari. Di iPhone, hanya Safari yang bisa memasang web app.",
      "Ketuk tombol Bagikan di bilah bawah.",
      "Gulir daftar, lalu pilih “Tambah ke Layar Utama”.",
      "Ketuk “Tambah” — ikon PINDAI muncul di layar utama.",
    ],
    catatan:
      "Kalau tombol Bagikan belum terlihat, gulir bilah bawah sampai ikonnya muncul.",
  },
];

/** Panduan untuk satu platform; pemanggil hanya boleh memberi id yang sah. */
export function panduanPasang(id: IdPlatformPasang): PanduanPasang {
  const ketemu = PANDUAN_PASANG.find((p) => p.id === id);
  if (ketemu === undefined) {
    throw new Error(`Platform pemasangan tidak dikenal: ${id}`);
  }
  return ketemu;
}
