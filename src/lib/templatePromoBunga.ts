/**
 * Template bunga promo yang siap dipakai admin.
 *
 * Satu template mengisi jenis manfaat, nama kampanye, angka bunga/potongan,
 * tenor yang mendapatkannya, dan rentang tanggal. Tidak ada efek tersembunyi — panel
 * tetap membuka formulir yang bisa disunting, dan server tetap memeriksa isian
 * lewat `periksaIsiPromoBunga` sebelum menyimpan.
 *
 * Tanggal dihitung dari `sekarang` yang dikirim pemanggil, menurut kalender
 * WIB: kampanye "hari ini" harus berakhir pukul 23.59 WIB, bukan 23.59 UTC.
 * Murni tanpa React/Convex supaya bisa diuji pada tanggal mana pun.
 */
import { TENOR_OPTIONS } from "./loan";
import type { JenisPromoBunga } from "./promoBunga";
import { OFFSET_WIB_MS } from "./waktu";

const HARI_MS = 86_400_000;

/** Tenor 7–30 hari untuk kampanye potongan bunga. */
const TENOR_MAKS_30 = Array.from({ length: 24 }, (_, indeks) => 7 + indeks);

export type RentangPromo = { mulai: number; selesai: number };

export type TemplatePromoBunga = {
  id: string;
  /** Nama pendek di kartu template. */
  label: string;
  /** Satu kalimat: kapan berlaku dan untuk siapa. */
  keterangan: string;
  /** Nama kampanye yang tersimpan pada pinjaman yang memakainya. */
  nama: string;
  /** Kosong = bunga pengganti, untuk template lama. */
  jenis?: JenisPromoBunga;
  persenBunga: number;
  /** Poin potongan untuk template `potongan_bunga`. */
  potonganPersen?: number;
  tenor: readonly number[];
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
  {
    id: "tenor-10",
    label: "Tenor 10 hari",
    keterangan: "Bunga 20% untuk tenor 10 hari selama sepekan.",
    nama: "Bunga 20% tenor 10 hari — sepekan",
    jenis: "bunga_pengganti",
    persenBunga: 20,
    tenor: [10],
    rentang: (sekarang) => ({
      mulai: awalHariWIB(sekarang),
      selesai: akhirHariWIB(sekarang + 6 * HARI_MS),
    }),
  },
  {
    id: "potongan-5",
    label: "Potongan 5 poin",
    keterangan: "Potongan 5 poin bunga untuk tenor 7–30 hari selama sepekan.",
    nama: "Potongan 5 poin — tenor 7–30 hari",
    jenis: "potongan_bunga",
    persenBunga: 0,
    potonganPersen: 5,
    tenor: TENOR_MAKS_30,
    rentang: (sekarang) => ({
      mulai: awalHariWIB(sekarang),
      selesai: akhirHariWIB(sekarang + 6 * HARI_MS),
    }),
  },
  {
    id: "bebas-admin",
    label: "Bebas biaya admin",
    keterangan: "Biaya admin Rp0 untuk tenor standar selama sepekan.",
    nama: "Bebas biaya admin — tenor standar",
    jenis: "bebas_admin",
    persenBunga: 0,
    tenor: TENOR_OPTIONS,
    rentang: (sekarang) => ({
      mulai: awalHariWIB(sekarang),
      selesai: akhirHariWIB(sekarang + 6 * HARI_MS),
    }),
  },
] as const;

/** Isian formulir promo dari satu template pada satu titik waktu. */
export function isiTemplatePromoBunga(
  template: TemplatePromoBunga,
  sekarang: number,
): {
  nama: string;
  jenis: JenisPromoBunga;
  persenBunga: number;
  potonganPersen?: number;
  tenor: number[];
  mulai: number;
  selesai: number;
} {
  return {
    nama: template.nama,
    jenis: template.jenis ?? "bunga_pengganti",
    persenBunga: template.persenBunga,
    ...(template.potonganPersen === undefined
      ? {}
      : { potonganPersen: template.potonganPersen }),
    tenor: [...template.tenor],
    ...template.rentang(sekarang),
  };
}
