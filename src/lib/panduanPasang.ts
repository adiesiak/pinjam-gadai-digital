/**
 * Langkah memasang PINDAI ke layar utama — data murni, tanpa React/DOM.
 *
 * Kenapa dipisah: satu tombol "Pasang aplikasi" harus tahu perangkat apa yang
 * sedang dipakai supaya panduan yang muncul tepat. Deteksi perangkat ditulis
 * sebagai fungsi murni yang menerima user agent + jumlah titik sentuh, jadi
 * bisa diuji tanpa browser.
 *
 * Batas yang disebut apa adanya: PINDAI adalah web app. Tidak ada berkas yang
 * diunduh; pemasangan hanya menambah ikon. iOS tidak mengizinkan pemasangan
 * otomatis — Safari hanya menyediakan menu Tambah ke Layar Utama.
 */

export type IdPlatformPasang = "android" | "ios" | "desktop";

export type PanduanPasang = {
  readonly id: IdPlatformPasang;
  /** Nama platform pada judul dialog ("Pasang di Android"). */
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
      "Apple tidak menyediakan pemasangan otomatis, jadi langkah ini memang harus diketuk sendiri.",
  },
  {
    id: "desktop",
    label: "komputer",
    peramban: "Chrome atau Edge di komputer",
    langkah: [
      "Buka PINDAI di Chrome atau Edge sampai beranda tampil.",
      "Klik ikon “Instal” di ujung kanan bilah alamat.",
      "Bila ikon itu tidak ada, buka menu ⋮ lalu pilih “Instal PINDAI”.",
      "Konfirmasi “Instal” — PINDAI terbuka di jendela sendiri.",
    ],
    catatan:
      "Firefox dan Safari di komputer belum punya tombol pasang; PINDAI tetap bisa dipakai di tab biasa.",
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

/**
 * Perangkat yang sedang dipakai, dari user agent + jumlah titik sentuh.
 *
 * iPadOS 13+ menyamar sebagai macOS pada user agent, jadi jumlah titik sentuh
 * dipakai untuk membedakannya dari Mac sungguhan. Android diperiksa lebih dulu
 * karena beberapa tablet Android juga menyertakan "Linux" dan "Mac" di UA-nya.
 */
export function platformPemasanganDari(
  userAgent: string,
  sentuhanMaks = 0,
): IdPlatformPasang {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipod/i.test(userAgent)) return "ios";
  if (/ipad/i.test(userAgent)) return "ios";
  if (/macintosh/i.test(userAgent) && sentuhanMaks > 1) return "ios";
  return "desktop";
}
