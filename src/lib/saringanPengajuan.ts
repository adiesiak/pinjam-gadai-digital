/**
 * Penyaring daftar pengajuan di ruang penyedia dana — murni, tanpa React.
 *
 * Halaman /penyedia-dana punya dua saringan di atas tabel:
 *  1. `cari` — nama peminjam, kode pseudonim, atau nomor referensi (tanpa peduli
 *     huruf besar/kecil; spasi berlebih disamakan).
 *  2. `pendana` — nama penyedia dana pemilik pinjaman ("" = semua).
 *
 * Fungsi di sini tidak menyentuh DOM maupun Convex supaya bisa diuji langsung
 * (`src/lib/saringanPengajuan.test.ts`) — halaman itu sendiri butuh klien Convex
 * dan Leaflet, jadi tidak bisa dirender di luar aplikasi.
 */

export type FilterPengajuan = {
  /** Kata kunci bebas; "" berarti tanpa saringan nama. */
  cari: string;
  /** Nama pendana terpilih; "" berarti semua pendana. */
  pendana: string;
};

/** Keadaan awal saringan — juga dipakai tombol "Kosongkan filter". */
export const FILTER_PENGAJUAN_KOSONG: FilterPengajuan = { cari: "", pendana: "" };

/** Kolom identitas minimum yang dibutuhkan penyaring. */
type BarisBernama = {
  namaLengkap: string;
  kodePeminjam: string | null;
  nomorReferensi: string;
  pendana?: string | null;
};

function normalisasi(teks: string): string {
  return teks.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Apakah `cari` kosong, atau cocok dengan salah satu nilai baris. */
export function cocokCari(cari: string, nilai: Array<string | null | undefined>): boolean {
  const kunci = normalisasi(cari);
  if (kunci === "") return true;
  return nilai.some((n) => typeof n === "string" && normalisasi(n).includes(kunci));
}

/**
 * Nama pendana unik dari baris yang ada — urut abjad, tanpa duplikat walau
 * beda huruf besar/kecil. Nama kosong / `null` dilewati (pinjaman yang belum
 * punya pendana tidak boleh mengisi pilihan dengan "").
 */
export function daftarPendana(baris: Array<{ pendana?: string | null }>): string[] {
  const peta = new Map<string, string>();
  for (const b of baris) {
    const nama = b.pendana?.trim();
    if (nama === undefined || nama === "") continue;
    const kunci = normalisasi(nama);
    if (!peta.has(kunci)) peta.set(kunci, nama);
  }
  return [...peta.values()].sort((a, b) => a.localeCompare(b, "id"));
}

/**
 * Saring baris pinjaman/kredit dengan nama + pendana sekaligus.
 *
 * Saat pendana dipilih, baris yang belum punya pendana (`null`) gugur — bukan
 * dianggap cocok, supaya "belum didanai" tidak ikut muncul dalam saringan
 * seorang penyedia dana.
 */
export function saringPengajuan<T extends BarisBernama>(
  baris: T[],
  filter: FilterPengajuan,
): T[] {
  const pendana = normalisasi(filter.pendana);
  return baris.filter((b) => {
    if (!cocokCari(filter.cari, [b.namaLengkap, b.kodePeminjam, b.nomorReferensi])) return false;
    if (pendana === "") return true;
    return b.pendana !== null && b.pendana !== undefined && normalisasi(b.pendana) === pendana;
  });
}

/** Saringan nama saja — untuk daftar yang tidak punya kolom pendana (gadai). */
export function saringNama<T extends BarisBernama>(baris: T[], cari: string): T[] {
  return baris.filter((b) => cocokCari(cari, [b.namaLengkap, b.kodePeminjam, b.nomorReferensi]));
}

/** Ada saringan aktif? Dipakai memutuskan pesan keadaan kosong. */
export function adaFilter(filter: FilterPengajuan): boolean {
  return normalisasi(filter.cari) !== "" || normalisasi(filter.pendana) !== "";
}

/** Jumlah yang tampil dibanding total — "Menampilkan 2 dari 13 pengajuan". */
export function ringkasJumlah(tampil: number, total: number): string {
  return `Menampilkan ${tampil} dari ${total} pengajuan`;
}
