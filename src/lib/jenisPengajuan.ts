/**
 * Daftar jenis pengajuan Peminjam — satu sumber untuk menu dropdown dan
 * pemilihan formulir di halaman pengajuan.
 *
 * Murni data dan fungsi tanpa hook React/Convex, sejalan dengan `admin-queue.ts`
 * dan `rincianAliranDana.ts`: halaman pengajuan tetap bisa diuji tanpanya.
 * Ikon sengaja tidak di sini supaya berkas ini tidak menyentuh React; ikon
 * dipetakan di komponennya.
 *
 * Keterangan tiap jenis tidak memuat angka biaya: nominal, bunga, dan cicilan
 * selalu dihitung mesin dari data yang diisi Peminjam.
 */

/** Tiga jenis pengajuan yang bisa dibuat dari halaman pengajuan. */
export type JenisPengajuan = "pinjaman" | "gadai" | "kredit";

export type BarisJenisPengajuan = {
  id: JenisPengajuan;
  /** Teks pada menu dropdown. */
  label: string;
  /** Judul formulir yang tampil setelah jenis ini dipilih. */
  judul: string;
  /** Keterangan singkat tentang apa yang dicatat formulir ini. */
  hint: string;
  /** Teks tombol yang membuka formulir jenis ini dari tab lain. */
  cta: string;
};

/** Urutan tampil di dropdown: pinjaman → gadai → kredit barang. */
export const JENIS_PENGAJUAN: ReadonlyArray<BarisJenisPengajuan> = [
  {
    id: "pinjaman",
    label: "Pinjaman tunai",
    judul: "Form pengajuan pinjaman",
    hint: "Skema harian atau bulanan; bunga, biaya, dan cicilan dihitung aplikasi dari nominal serta tenor yang Anda pilih.",
    cta: "Buat pengajuan pinjaman",
  },
  {
    id: "gadai",
    label: "Gadai barang",
    judul: "Gadai barang jaminan",
    hint: "Catat deskripsi barang dan alamat penilaian; nilai taksiran diisi tim PINDAI saat peninjauan.",
    cta: "Buat pengajuan gadai",
  },
  {
    id: "kredit",
    label: "Kredit barang",
    judul: "Pengajuan kredit barang",
    hint: "Barang elektronik atau mitra; DP, tenor, dan cicilan dihitung aplikasi dari harga barang yang diajukan.",
    cta: "Buat pengajuan kredit barang",
  },
];

/** Jenis bawaan saat halaman pengajuan dibuka pertama kali. */
export const JENIS_PENGAJUAN_AWAL: JenisPengajuan = "pinjaman";

/** Sakelar ketersediaan tiap produk, dibaca dari `system.getProdukAktif`. */
export type ProdukAktif = Record<JenisPengajuan, boolean>;

/** Sebelum konfigurasi dimuat, semua produk dianggap terbuka. */
export const PRODUK_AKTIF_BAWAAN: ProdukAktif = {
  pinjaman: true,
  gadai: true,
  kredit: true,
};

/**
 * Jenis pengajuan yang boleh dipilih sekarang, dengan urutan tampil yang sama.
 * Produk yang dimatikan admin hilang dari menu dropdown, bukan sekadar
 * dinonaktifkan, supaya tidak ada formulir yang bisa diisi lalu ditolak server.
 */
export function jenisPengajuanTersedia(
  produk: ProdukAktif,
): ReadonlyArray<BarisJenisPengajuan> {
  return JENIS_PENGAJUAN.filter((jenis) => produk[jenis.id]);
}

/** Nilai dropdown → jenis yang sah; `null` bila nilainya tidak dikenal. */
export function jenisPengajuanDari(nilai: string): JenisPengajuan | null {
  return JENIS_PENGAJUAN.some((jenis) => jenis.id === nilai)
    ? (nilai as JenisPengajuan)
    : null;
}

/**
 * Baris jenis yang cocok dengan sebuah nilai; jatuh ke jenis pertama supaya
 * pemilih tidak pernah menampilkan keadaan kosong.
 */
export function jenisPengajuanAktif(nilai: string): BarisJenisPengajuan {
  return JENIS_PENGAJUAN.find((jenis) => jenis.id === nilai) ?? JENIS_PENGAJUAN[0];
}

/**
 * Tab dashboard → jenis pengajuan yang paling masuk akal dibuka lebih dulu
 * lewat tombol "Buat pengajuan baru" di tab itu. Tab catatan pinjaman dan jadwal
 * angsuran sama-sama mengarah ke pinjaman tunai. Tab yang tidak punya padanan
 * (kontrak, riwayat, form itu sendiri) mengembalikan `null` sehingga pemanggil
 * memakai jenis bawaan — begitu pula tab yang sudah dihapus, seperti "kredit".
 */
const JENIS_PENGAJUAN_PER_TAB: Partial<Record<string, JenisPengajuan>> = {
  pinjaman: "pinjaman",
  jadwal: "pinjaman",
  gadai: "gadai",
};

/** Jenis pengajuan untuk sebuah tab dashboard; `null` bila tab tidak relevan. */
export function jenisPengajuanUntukTab(tab: string): JenisPengajuan | null {
  return JENIS_PENGAJUAN_PER_TAB[tab] ?? null;
}
