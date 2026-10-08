/**
 * Data grafik per penyedia dana (keuntungan & dana tersalurkan) — fungsi MURNI.
 *
 * Dipisah dari komponennya supaya aturan yang mudah salah bisa diuji sebagai
 * skrip biasa (`bun src/lib/grafikKeuntungan.test.ts`), bukan hanya lewat
 * markup: urutan bar, panjang bar, dan penanganan angka nol.
 *
 * Aturan yang dijaga:
 * - Bar dihitung dari TOTAL keuntungan (sudah cair + masih diperkirakan),
 *   tetapi kedua bagiannya tetap dipisah warnanya — penyedia dana harus bisa
 *   melihat berapa bagian yang benar-benar sudah jadi uang.
 * - Panjang bar selalu relatif terhadap penyedia dengan nilai TERBESAR, bukan
 *   terhadap jumlah semuanya, supaya satu penyedia besar tidak membuat bar
 *   penyedia lain tidak terlihat.
 * - Semua nilai nol berarti tidak ada bar yang digambar (panjang 0), bukan
 *   bar penuh karena pembagian nol.
 */

/** Satu bar grafik: satu penyedia dana. */
export type BarKeuntungan = {
  nama: string;
  /** Keuntungan yang sudah dibukukan (pinjaman lunas). */
  sudahCair: number;
  /** Keuntungan yang masih diperkirakan (pinjaman berjalan). */
  perkiraan: number;
  /** sudahCair + perkiraan. */
  total: number;
  /** Panjang bar untuk `total`, dalam persen (0–100) terhadap nilai terbesar. */
  persen: number;
  /** Porsi bar untuk bagian yang sudah cair, dalam persen (0–`persen`). */
  persenSudahCair: number;
  /**
   * Porsi bar untuk bagian yang masih perkiraan, dalam persen.
   *
   * Dihitung sebagai sisa (`persen` − `persenSudahCair`) lalu dibulatkan di
   * sini, bukan di komponen: kalau komponen yang mengurangkan, hasilnya bisa
   * membawa sisa pecahan biner (mis. `85.71000000000001%`) ke atribut `style`.
   */
  persenPerkiraan: number;
};

/** Masukan minimum — hanya field yang benar-benar dibaca grafik. */
export type SumberBarKeuntungan = {
  nama: string;
  keuntunganPendanaLunas: number;
  keuntunganPendanaBelumLunas: number;
};

/** Bulatkan ke 2 desimal supaya panjang bar stabil saat diuji. */
function bulat2(nilai: number): number {
  return Math.round(nilai * 100) / 100;
}

/** Panjang bar satu nilai relatif terhadap nilai terbesar (0 bila tidak ada). */
function persenTerhadap(nilai: number, terbesar: number): number {
  if (terbesar <= 0 || nilai <= 0) return 0;
  return bulat2((nilai / terbesar) * 100);
}

/**
 * Susun bar grafik dari rekap penyedia dana.
 *
 * Urutan: nilai total terbesar lebih dulu (yang paling perlu dilihat penyedia
 * dana paling atas), lalu nama sebagai pemecah seri supaya urutannya tidak
 * berubah-ubah antar render.
 */
export function barKeuntungan(
  rekap: readonly SumberBarKeuntungan[],
): BarKeuntungan[] {
  const baris = rekap.map((r) => {
    const sudahCair = r.keuntunganPendanaLunas;
    const perkiraan = r.keuntunganPendanaBelumLunas;
    return {
      nama: r.nama,
      sudahCair,
      perkiraan,
      total: sudahCair + perkiraan,
      persen: 0,
      persenSudahCair: 0,
      persenPerkiraan: 0,
    };
  });

  const terbesar = baris.reduce((maks, b) => (b.total > maks ? b.total : maks), 0);

  for (const b of baris) {
    b.persen = persenTerhadap(b.total, terbesar);
    if (b.persen === 0) {
      b.persenSudahCair = 0;
      b.persenPerkiraan = 0;
      continue;
    }
    // Porsi yang sudah cair dihitung dari totalnya sendiri, bukan dari nilai
    // terbesar: bar bagian dalam selalu menggambarkan komposisi penyedia itu.
    b.persenSudahCair = bulat2(b.persen * (b.sudahCair / b.total));
    // Sisanya dibulatkan di sini supaya kedua segmen selalu berjumlah `persen`.
    b.persenPerkiraan = bulat2(b.persen - b.persenSudahCair);
  }

  return baris.sort((a, b) =>
    b.total === a.total ? a.nama.localeCompare(b.nama) : b.total - a.total,
  );
}

/**
 * Masukan minimum bar dana tersalurkan — satu penyedia dana.
 *
 * "Dana tersalurkan" = pokok pinjaman yang sudah cair ke peminjam (status
 * `didanai` dan `lunas`), yaitu `totalDisalurkan` pada rekap. Sisanya
 * (`saldoBerjalan`) adalah pokok yang masih berjalan.
 */
export type SumberDanaTersalurkan = {
  nama: string;
  totalDisalurkan: number;
  saldoBerjalan: number;
  jumlahPinjaman: number;
  jumlahAktif: number;
  jumlahLunas: number;
};

/** Satu bar dana tersalurkan: satu penyedia dana. */
export type BarDanaTersalurkan = {
  nama: string;
  /** Pokok yang sudah tersalurkan (berjalan + lunas). */
  nilai: number;
  /** Bagian dari `nilai` yang pokoknya masih berjalan. */
  berjalan: number;
  jumlahPinjaman: number;
  jumlahAktif: number;
  jumlahLunas: number;
  /** Panjang bar untuk `nilai`, dalam persen (0–100) terhadap nilai terbesar. */
  persen: number;
};

/**
 * Susun bar "dana tersalurkan" per penyedia dana.
 *
 * Aturan sama dengan bar keuntungan: urut dari nilai terbesar (dengan nama
 * sebagai pemecah seri), panjang relatif terhadap yang terbesar, dan nilai nol
 * berarti bar kosong — bukan bar penuh.
 */
export function barDanaTersalurkan(
  rekap: readonly SumberDanaTersalurkan[],
): BarDanaTersalurkan[] {
  const terbesar = rekap.reduce(
    (maks, r) => (r.totalDisalurkan > maks ? r.totalDisalurkan : maks),
    0,
  );

  return rekap
    .map((r) => ({
      nama: r.nama,
      nilai: r.totalDisalurkan,
      berjalan: r.saldoBerjalan,
      jumlahPinjaman: r.jumlahPinjaman,
      jumlahAktif: r.jumlahAktif,
      jumlahLunas: r.jumlahLunas,
      persen: persenTerhadap(r.totalDisalurkan, terbesar),
    }))
    .sort((a, b) =>
      b.nilai === a.nilai ? a.nama.localeCompare(b.nama) : b.nilai - a.nilai,
    );
}
