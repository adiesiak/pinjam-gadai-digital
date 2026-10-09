/**
 * Deteksi nasabah KEMBAR (duplikat) dari data lama — logika murni, tanpa React
 * dan tanpa Convex, supaya bisa diuji sebagai skrip biasa
 * (`bun src/lib/duplikatNasabah.test.ts`).
 *
 * Kenapa berkas ini ada: sebelum pencatatan manual menolak NIK/WhatsApp yang
 * sudah terpakai (lihat `cariNasabahKembar` di lib/pengajuanManual.ts), data
 * yang dipindahkan dari buku/berkas kantor bisa membuat akun KEDUA untuk orang
 * yang sama. Akun kembar memecah riwayat pinjaman, jadi perlu alat untuk
 * MENEMUKANnya dahulu, baru menggabungkan atau menghapus yang berlebih.
 *
 * Aturan pengelompokan:
 *  - Dua baris dianggap orang yang sama bila NIK-nya sama ATAU nomor
 *    WhatsApp-nya sama. WhatsApp ikut diperiksa karena NIK yang diketik ulang
 *    sering salah satu digit.
 *  - Perbandingan memakai DIGIT saja (spasi/tanda hubung diabaikan), dan kolom
 *    identitas yang kosong tidak pernah mencocokkan apa pun — dua nasabah tanpa
 *    NIK bukan berarti orang yang sama.
 *  - Pengelompokan bersifat TRANSITIF: A sepakat NIK dengan B, B sepakat
 *    WhatsApp dengan C → ketiganya satu kelompok.
 *
 * Hasilnya sudah diurutkan: kelompok yang paling banyak berkasnya lebih dulu,
 * dan di dalam kelompok akun yang paling layak jadi tujuan gabung di depan.
 */

/** Bidang identitas yang bisa membuat dua nasabah dianggap sama. */
export type SebabKembar = "nik" | "whatsapp";

/** Bidang identitas minimum yang dibutuhkan pengelompokan. */
export type IdentitasKembar = {
  readonly nik?: string | null;
  readonly nomorWhatsApp?: string | null;
};

/** Satu baris nasabah yang ikut diperiksa. */
export type BarisKembar = IdentitasKembar & {
  readonly userId: string;
  readonly nama: string;
  /** Jumlah berkas (pinjaman + gadai + kredit barang) milik akun ini. */
  readonly jumlahBerkas: number;
  /** true bila akun dibuat admin tanpa kredensial (akun pencatatan data lama). */
  readonly dibuatAdmin: boolean;
};

/** Sekelompok baris yang dianggap orang yang sama beserta sebabnya. */
export type KelompokKembar<T extends BarisKembar> = {
  readonly baris: T[];
  readonly sebab: SebabKembar[];
};

/** Digit saja, TANPA validasi — baris warisan boleh memuat spasi/tanda hubung. */
function digitSaja(nilai: string | null | undefined): string {
  return (nilai ?? "").replace(/\D/g, "");
}

/** Urutkan baris satu kelompok: akun nyata dulu, lalu yang paling banyak berkas. */
function urutkanUtama<T extends BarisKembar>(baris: readonly T[]): T[] {
  return [...baris].sort((a, b) => {
    if (a.dibuatAdmin !== b.dibuatAdmin) return a.dibuatAdmin ? 1 : -1;
    if (a.jumlahBerkas !== b.jumlahBerkas) return b.jumlahBerkas - a.jumlahBerkas;
    const nama = a.nama.localeCompare(b.nama, "id");
    if (nama !== 0) return nama;
    return a.userId.localeCompare(b.userId, "id");
  });
}

/** true bila ada dua baris (atau lebih) dengan nilai identitas non-kosong yang sama. */
function adaNilaiSama<T extends BarisKembar>(
  baris: readonly T[],
  ambil: (row: T) => string | null | undefined,
): boolean {
  const jumlah = new Map<string, number>();
  for (const row of baris) {
    const nilai = digitSaja(ambil(row));
    if (nilai === "") continue;
    const baru = (jumlah.get(nilai) ?? 0) + 1;
    if (baru >= 2) return true;
    jumlah.set(nilai, baru);
  }
  return false;
}

/** Sebab yang benar-benar mengikat satu kelompok (bisa keduanya). */
function sebabKelompok<T extends BarisKembar>(baris: readonly T[]): SebabKembar[] {
  const sebab: SebabKembar[] = [];
  if (adaNilaiSama(baris, (r) => r.nik)) sebab.push("nik");
  if (adaNilaiSama(baris, (r) => r.nomorWhatsApp)) sebab.push("whatsapp");
  return sebab;
}

/**
 * Kelompokkan baris nasabah menjadi kelompok kembar (≥2 baris). Baris tanpa
 * kembaran tidak dikembalikan. Urutan hasil stabil agar panel tidak berubah
 * susunan setiap kali dibuka.
 */
export function kelompokkanKembar<T extends BarisKembar>(
  baris: readonly T[],
): KelompokKembar<T>[] {
  const induk = baris.map((_, i) => i);
  const cari = (i: number): number => {
    let akar = i;
    while (induk[akar] !== akar) {
      induk[akar] = induk[induk[akar]];
      akar = induk[akar];
    }
    return akar;
  };
  const gabung = (a: number, b: number): void => {
    const akarA = cari(a);
    const akarB = cari(b);
    if (akarA !== akarB) induk[Math.max(akarA, akarB)] = Math.min(akarA, akarB);
  };

  const terakhirPerNik = new Map<string, number>();
  const terakhirPerWa = new Map<string, number>();
  baris.forEach((row, i) => {
    const nik = digitSaja(row.nik);
    if (nik !== "") {
      const lain = terakhirPerNik.get(nik);
      if (lain === undefined) terakhirPerNik.set(nik, i);
      else gabung(lain, i);
    }
    const wa = digitSaja(row.nomorWhatsApp);
    if (wa !== "") {
      const lain = terakhirPerWa.get(wa);
      if (lain === undefined) terakhirPerWa.set(wa, i);
      else gabung(lain, i);
    }
  });

  const perAkar = new Map<number, T[]>();
  baris.forEach((row, i) => {
    const akar = cari(i);
    const daftar = perAkar.get(akar);
    if (daftar === undefined) perAkar.set(akar, [row]);
    else daftar.push(row);
  });

  const hasil: KelompokKembar<T>[] = [];
  for (const daftar of perAkar.values()) {
    if (daftar.length < 2) continue;
    hasil.push({ baris: urutkanUtama(daftar), sebab: sebabKelompok(daftar) });
  }
  hasil.sort((a, b) => {
    const berkasA = a.baris.reduce((total, row) => total + row.jumlahBerkas, 0);
    const berkasB = b.baris.reduce((total, row) => total + row.jumlahBerkas, 0);
    if (berkasA !== berkasB) return berkasB - berkasA;
    return a.baris[0].nama.localeCompare(b.baris[0].nama, "id");
  });
  return hasil;
}

/**
 * Akun yang disarankan jadi tujuan penggabungan: akun nyata (bukan buatan
 * admin) dengan berkas terbanyak. Panel tetap membiarkan admin memilih lain.
 */
export function pilihUtama<T extends BarisKembar>(baris: readonly T[]): T {
  const urut = urutkanUtama(baris);
  if (urut.length === 0) {
    throw new Error("Tidak ada baris nasabah untuk dipilih sebagai utama.");
  }
  return urut[0];
}
