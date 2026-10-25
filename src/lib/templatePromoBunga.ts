/**
 * Template bunga promo yang siap dipakai admin.
 *
 * Satu template hanya mengisi empat hal: nama kampanye, bunga pengganti, tenor
 * yang mendapatkannya, dan rentang tanggal. Tidak ada efek tersembunyi — panel
 * tetap membuka formulir yang bisa disunting, dan server tetap memeriksa isian
 * lewat `periksaIsiPromoBunga` sebelum menyimpan.
 *
 * Tanggal dihitung dari `sekarang` yang dikirim pemanggil, menurut kalender
 * WIB: kampanye "hari ini" harus berakhir pukul 23.59 WIB, bukan 23.59 UTC.
 * Murni tanpa React/Convex supaya bisa diuji pada tanggal mana pun.
 */
import { TENOR_OPTIONS, type Tenor } from "./loan";
import { OFFSET_WIB_MS } from "./waktu";

const HARI_MS = 86_400_000;

export type RentangPromo = { mulai: number; selesai: number };

export type TemplatePromoBunga = {
  id: string;
  /** Nama pendek di kartu template. */
  label: string;
  /** Satu kalimat: kapan berlaku dan untuk siapa. */
  keterangan: string;
  /** Nama kampanye yang tersimpan pada pinjaman yang memakainya. */
  nama: string;
  persenBunga: number;
  tenor: readonly Tenor[];
  rentang: (sekarang: number) => RentangPromo;
};

/** Awal hari WIB yang memuat `ms`. */
function awalHariWIB(ms: number): number {
  return Math.floor((ms + OFFSET_WIB_MS) / HARI_MS) * HARI_MS - OFFSET_WIB_MS;
}

/** Akhir hari WIB yang memuat `ms` (23.59.59.999). */
function akhirHariWIB(ms: number): number {
  return awalHariWIB(ms) + HARI_MS - 1;
}

/** Hari dalam pekan menurut WIB: 0 = Minggu, 6 = Sabtu. */
function hariPekanWIB(ms: number): number {
  return new Date(ms + OFFSET_WIB_MS).getUTCDay();
}

/** Tanggal 25 bulan berjalan sampai akhir bulan berjalan, WIB. */
function rentangGajian(ms: number): RentangPromo {
  const tanggal = new Date(ms + OFFSET_WIB_MS);
  const tahun = tanggal.getUTCFullYear();
  const bulan = tanggal.getUTCMonth();
  return {
    mulai: Date.UTC(tahun, bulan, 25) - OFFSET_WIB_MS,
    selesai: Date.UTC(tahun, bulan + 1, 1) - OFFSET_WIB_MS - 1,
  };
}

/**
 * Sabtu–Minggu terdekat. Bila hari ini Sabtu atau Minggu, akhir pekan yang
 * sedang berjalan yang dipakai; hari kerja lainnya memakai akhir pekan
 * berikutnya, bukan yang sudah lewat.
 */
function rentangAkhirPekan(ms: number): RentangPromo {
  const hari = hariPekanWIB(ms);
  // Minggu masih bagian akhir pekan yang mulai kemarin; hari lain menunggu
  // Sabtu berikutnya.
  const geserKeSabtu = hari === 0 ? -1 : (6 - hari + 7) % 7;
  const sabtu = awalHariWIB(ms) + geserKeSabtu * HARI_MS;
  return { mulai: sabtu, selesai: sabtu + 2 * HARI_MS - 1 };
}

export const TEMPLATE_PROMO_BUNGA: readonly TemplatePromoBunga[] = [
  {
    id: "hari-ini",
    label: "Hanya hari ini",
    keterangan: "Bunga 15% tenor 7 hari, berlaku sampai pukul 23.59 WIB hari ini.",
    nama: "Bunga 15% tenor 7 hari — hanya hari ini",
    persenBunga: 15,
    tenor: [7],
    rentang: (sekarang) => ({
      mulai: awalHariWIB(sekarang),
      selesai: akhirHariWIB(sekarang),
    }),
  },
  {
    id: "tiga-hari",
    label: "Tiga hari",
    keterangan: "Bunga 20% tenor 7 hari selama tiga hari, termasuk hari ini.",
    nama: "Bunga 20% tenor 7 hari — 3 hari",
    persenBunga: 20,
    tenor: [7],
    rentang: (sekarang) => ({
      mulai: awalHariWIB(sekarang),
      selesai: akhirHariWIB(sekarang + 2 * HARI_MS),
    }),
  },
  {
    id: "akhir-pekan",
    label: "Akhir pekan",
    keterangan: "Bunga 20% tenor 7 dan 14 hari, Sabtu sampai Minggu.",
    nama: "Bunga 20% tenor 7 & 14 hari — akhir pekan",
    persenBunga: 20,
    tenor: [7, 14],
    rentang: rentangAkhirPekan,
  },
  {
    id: "semua-tenor",
    label: "Semua tenor",
    keterangan: "Bunga 15% untuk seluruh tenor selama sepekan.",
    nama: "Bunga 15% semua tenor — sepekan",
    persenBunga: 15,
    tenor: TENOR_OPTIONS,
    rentang: (sekarang) => ({
      mulai: awalHariWIB(sekarang),
      selesai: akhirHariWIB(sekarang + 6 * HARI_MS),
    }),
  },
  {
    id: "gajian",
    label: "Tanggal gajian",
    keterangan: "Bunga 20% tenor 14 dan 21 hari, tanggal 25 sampai akhir bulan.",
    nama: "Bunga 20% tenor 14 & 21 hari — gajian",
    persenBunga: 20,
    tenor: [14, 21],
    rentang: rentangGajian,
  },
] as const;

/** Isian formulir promo dari satu template pada satu titik waktu. */
export function isiTemplatePromoBunga(
  template: TemplatePromoBunga,
  sekarang: number,
): {
  nama: string;
  persenBunga: number;
  tenor: Tenor[];
  mulai: number;
  selesai: number;
} {
  return {
    nama: template.nama,
    persenBunga: template.persenBunga,
    tenor: [...template.tenor],
    ...template.rentang(sekarang),
  };
}
