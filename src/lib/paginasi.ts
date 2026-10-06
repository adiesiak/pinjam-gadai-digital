/**
 * Paginasi daftar admin — 10 baris per halaman.
 *
 * Panel admin menampilkan daftar panjang (nasabah, antrean, jejak audit). Satu
 * halaman berisi 10 baris supaya tiap baris tetap terbaca tanpa menggulir jauh,
 * sedangkan nomor halaman menunjukkan sisa pekerjaannya.
 *
 * Fungsi ini murni (tanpa React) dan sengaja tidak menyimpan halaman di dalam
 * state tersembunyi: komponen boleh memegang `halaman` apa pun (mis. setelah
 * pencarian mempersingkat daftar), lalu nilai yang dikembalikan selalu halaman
 * yang benar-benar ada. Itu menghindari `setState` di dalam `useEffect` saat
 * daftar berubah — aturan `react-hooks` repo ini melarangnya.
 */

/** Jumlah baris yang ditampilkan per halaman di seluruh panel admin. */
export const BARIS_PER_HALAMAN = 10;

export type HalamanBaris<T> = {
  /** Halaman yang benar-benar dipakai (sudah dijepit ke rentang yang ada). */
  halaman: number;
  /** Jumlah halaman, minimal 1 walau daftarnya kosong. */
  totalHalaman: number;
  /** Indeks 0-based baris pertama halaman ini untuk label "1–10 dari 18". */
  awal: number;
  /** Baris milik halaman ini. */
  baris: readonly T[];
};

/**
 * Ambil potongan satu halaman dari sebuah daftar.
 *
 * Nomor halaman di luar rentang dijepit (bukan melempar): daftar yang menyusut
 * karena pencarian atau penghapusan tidak boleh menampilkan halaman kosong.
 * Nomor pecahan dipotong ke bawah (1.6 → halaman 1), dan nilai yang benar-benar
 * tidak sah (negatif, NaN, tak hingga) jatuh ke halaman pertama. `perHalaman`
 * yang tidak sah (0, negatif, NaN) jatuh ke bawaan 10.
 */
export function potongHalaman<T>(
  semua: readonly T[],
  halaman: number,
  perHalaman: number = BARIS_PER_HALAMAN,
): HalamanBaris<T> {
  const per =
    Number.isFinite(perHalaman) && perHalaman >= 1
      ? Math.floor(perHalaman)
      : BARIS_PER_HALAMAN;
  const totalHalaman = Math.max(1, Math.ceil(semua.length / per));
  // Halaman pecahan dipotong ke bawah supaya pemanggil yang menghitung sendiri
  // (mis. `n / per`) tidak tiba-tiba terlempar ke halaman pertama.
  const diminta = Number.isFinite(halaman) ? Math.max(0, Math.floor(halaman)) : 0;
  const aktif = Math.min(diminta, totalHalaman - 1);
  const awal = aktif * per;
  return { halaman: aktif, totalHalaman, awal, baris: semua.slice(awal, awal + per) };
}

/** Label rentang baris yang sedang tampil, mis. "Menampilkan 11–18 dari 18". */
export function labelRentang(
  halaman: HalamanBaris<unknown>,
  total: number,
): string {
  if (total === 0) return "Tidak ada data";
  const akhir = halaman.awal + halaman.baris.length;
  return `Menampilkan ${halaman.awal + 1}–${akhir} dari ${total}`;
}
