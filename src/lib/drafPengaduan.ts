/**
 * Draf pengaduan — persistensi LOKAL yang tidak boleh kehilangan tulisan
 * nasabah saat ia berpindah ke aplikasi lain (WhatsApp, galeri, kamera) atau
 * halaman dimuat ulang.
 *
 * Kenapa ada: laporan nyata yang paling sering pada formulir mobile bukan
 * "tombol tidak jalan", melainkan "tulisan saya hilang setelah pindah aplikasi
 * lalu kembali". `useMobileLifecycle` hanya memberi SINYAL bahwa halaman
 * kembali; ia sengaja tidak menyimpan apa pun. Modul inilah tempat menyimpannya.
 *
 * Batas yang disengaja:
 *  - Hanya memuat NIK/berkas-KTP? **Tidak, sama sekali.** Isinya cuma kategori,
 *    uraian bebas yang ditulis sendiri, dan id catatan pinjaman yang dipilih.
 *  - Disimpan di `sessionStorage` (bukan `localStorage`): draf mati bersama tab,
 *    jadi tidak menetap di perangkat untuk pengguna berikutnya.
 *  - Dianggap SARAN: server tetap memvalidasi ulang setiap isian saat dikirim.
 *    Draf tidak pernah menaikkan apa pun menjadi sah.
 */

const KEY = "pinjai.draf.pengaduan";
/** Versi bentuk data — draf dari versi lain dibuang, bukan ditebak-tebak. */
const VERSI = 1;
/** Umur maksimum draf: 2 jam. Di luar itu dianggap bukan pekerjaan yang sama. */
const UMUR_MAKS_MS = 2 * 60 * 60 * 1000;

export type DrafPengaduan = {
  versi: number;
  /**
   * Jenis pekerjaan pemilik draf. Hanya "pengaduan" untuk sekarang, tetapi
   * disimpan agar draf dari jenis lain tidak pernah salah dipulihkan.
   */
  jenis: "pengaduan";
  kategori: string;
  isi: string;
  /** Id catatan pinjaman (opsional) — teks, karena hanya dipakai mengisi form. */
  loanId: string | null;
  disimpanPada: number;
};

export type DataDrafPengaduan = {
  kategori: string;
  isi: string;
  loanId: string | null;
};

/** Draf hanya berguna bila masih ada isi yang bisa dilanjutkan. */
export function drafBerisi(isi: string): boolean {
  return isi.trim().length > 0;
}

/**
 * Baca draf yang masih berlaku. Mengembalikan null bila tidak ada, rusak,
 * versinya berbeda, jenisnya bukan pengaduan, atau sudah terlalu tua.
 *
 * `sekarang` disuntikkan supaya perilaku umur draf dapat diuji tanpa jam mesin.
 */
export function bacaDrafPengaduan(sekarang: number = Date.now()): DrafPengaduan | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<DrafPengaduan>;
    if (
      data === null ||
      typeof data !== "object" ||
      data.versi !== VERSI ||
      data.jenis !== "pengaduan" ||
      typeof data.kategori !== "string" ||
      typeof data.isi !== "string" ||
      typeof data.disimpanPada !== "number"
    ) {
      return null;
    }
    if (sekarang - data.disimpanPada > UMUR_MAKS_MS) return null;
    if (sekarang < data.disimpanPada) return null;
    return {
      versi: VERSI,
      jenis: "pengaduan",
      kategori: data.kategori,
      isi: data.isi,
      loanId: typeof data.loanId === "string" ? data.loanId : null,
      disimpanPada: data.disimpanPada,
    };
  } catch {
    return null;
  }
}

/**
 * Simpan draf. Gagal menyimpan TIDAK pernah melempar ke pemanggil: pada
 * peramban yang menolak penyimpanan, formulir harus tetap bisa dipakai —
 * nasabah tidak boleh kehilangan kemampuan mengadu karena draf opsional.
 */
export function simpanDrafPengaduan(
  data: DataDrafPengaduan,
  sekarang: number = Date.now(),
): void {
  if (!drafBerisi(data.isi)) return;
  try {
    const draf: DrafPengaduan = {
      versi: VERSI,
      jenis: "pengaduan",
      kategori: data.kategori,
      isi: data.isi,
      loanId: data.loanId,
      disimpanPada: sekarang,
    };
    sessionStorage.setItem(KEY, JSON.stringify(draf));
  } catch {
    // penyimpanan lokal tidak tersedia — draf opsional, formulir tetap jalan.
  }
}

/** Hapus draf (dipanggil setelah pengaduan benar-benar terkirim). */
export function hapusDrafPengaduan(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
