/**
 * Doorprize triwulanan PINDAI — aturan murni, tanpa React maupun Convex.
 *
 * Undian berjalan tiga bulan sekali. Tiket yang terkumpul selama satu kuartal
 * hanya diundi pada akhir kuartal itu; kuartal berikutnya mulai dari nol karena
 * tiket dipisahkan oleh kode periode (`2026-Q4`), bukan dihapus.
 *
 * Sumber tiket tidak berubah:
 * - Peminjam: +1 tiket untuk setiap pinjaman yang dilunasi PENUH paling lambat
 *   pada tanggal jatuh tempo (tenor 7, 14, maupun 28 hari).
 * - Pendana: +1 tiket untuk setiap kelipatan Rp1.000.000 penempatan dana.
 *
 * Batas waktu memakai kalender WIB (UTC+7, tanpa DST). `endDate` adalah
 * 23.59.59.999 WIB pada hari terakhir kuartal; pengundian resmi dibuka sejak
 * awal hari itu.
 */

/** Batas atas nilai hadiah satu kuartal (eksklusif): di bawah Rp1.000.000. */
export const BATAS_NILAI_HADIAH_DOORPRIZE = 1_000_000;

/** Nilai hadiah terendah yang masuk akal untuk satu pemenang. */
export const NILAI_HADIAH_MINIMUM = 10_000;

/** Kelipatan penempatan dana yang menghasilkan satu tiket pendana. */
export const KELIPATAN_TIKET_PENDANA = 1_000_000;

/** Teks kanonik yang wajib sama di panel admin dan dashboard pengguna. */
export const TEKS_KETENTUAN_DOORPRIZE =
  "Tiket diterbitkan secara otomatis dari pelunasan tepat waktu (peminjam tenor 7, 14, & 28 hari) serta penempatan dana aktif pendana selama periode 3 bulan. Pengundian pemenang utama dilakukan pada akhir setiap kuartal.";

/** Catatan anggaran untuk admin — hadiah sengaja dijaga di bawah Rp1 juta. */
export const CATATAN_ANGGARAN_DOORPRIZE =
  "Pengundian dilakukan 3 bulan sekali. Alokasikan hadiah hemat anggaran (< Rp1.000.000) untuk menjaga margin operasional platform.";

export type KategoriHadiah = "GOLD" | "ELECTRONICS" | "VOUCHER" | "OTHER";

export type PresetHadiah = {
  kategori: KategoriHadiah;
  nama: string;
  /** Nilai perkiraan dalam rupiah; selalu di bawah BATAS_NILAI_HADIAH. */
  nilai: number;
  /** Keterangan singkat yang dibaca admin saat memilih preset. */
  ringkas: string;
};

/** Preset terkurasi di bawah Rp1 juta — bukan katalog bebas. */
export const PRESET_HADIAH_DOORPRIZE: readonly PresetHadiah[] = [
  {
    kategori: "GOLD",
    nama: "Emas Antam 0,5 gram",
    nilai: 850_000,
    ringkas: "Logam mulia bersertifikat, pilihan paling tahan nilai.",
  },
  {
    kategori: "GOLD",
    nama: "Lotus Archi 0,5 gram",
    nilai: 780_000,
    ringkas: "Alternatif logam mulia bersertifikat dengan selisih harga yang lebih ringan.",
  },
  {
    kategori: "GOLD",
    nama: "Emas Antam 0,25 gram",
    nilai: 450_000,
    ringkas: "Nominal lebih ringan untuk anggaran kuartal yang ketat.",
  },
  {
    kategori: "GOLD",
    nama: "Lotus Archi 0,25 gram",
    nilai: 390_000,
    ringkas: "Pecahan kecil logam mulia; tetap mudah dikirim.",
  },
  {
    kategori: "GOLD",
    nama: "Emas Antam 0,1 gram",
    nilai: 190_000,
    ringkas: "Hadiah emas termurah; tetap benda fisik bernilai.",
  },
  {
    kategori: "GOLD",
    nama: "Lotus Archi 0,1 gram",
    nilai: 175_000,
    ringkas: "Pilihan paling hemat untuk kuartal yang anggarannya tipis.",
  },
  {
    kategori: "ELECTRONICS",
    nama: "Smartwatch / Fitness Band",
    nilai: 750_000,
    ringkas: "Dipakai harian, mudah dikirim, tidak butuh setup rumit.",
  },
  {
    kategori: "ELECTRONICS",
    nama: "TWS Earbuds Premium",
    nilai: 450_000,
    ringkas: "Pilihan gadget dengan harga tengah dan daya tarik luas.",
  },
  {
    kategori: "ELECTRONICS",
    nama: "Air Fryer Mini",
    nilai: 600_000,
    ringkas: "Peralatan rumah tangga yang berguna untuk keluarga.",
  },
  {
    kategori: "VOUCHER",
    nama: "Saldo E-Wallet Rp500.000",
    nilai: 500_000,
    ringkas: "Paling cepat diserahkan; tidak ada biaya pengiriman.",
  },
  {
    kategori: "VOUCHER",
    nama: "Saldo E-Wallet Rp250.000",
    nilai: 250_000,
    ringkas: "Nilai tengah dengan proses penyerahan instan.",
  },
  {
    kategori: "VOUCHER",
    nama: "Saldo E-Wallet Rp100.000",
    nilai: 100_000,
    ringkas: "Hadiah hiburan termurah untuk kuartal berjalan.",
  },
  {
    kategori: "OTHER",
    nama: "Voucher belanja daring Rp300.000",
    nilai: 300_000,
    ringkas: "Alternatif non-e-wallet bila pemenang tidak memakainya.",
  },
];

/** Preset bawaan saat admin belum menyimpan hadiah untuk kuartal berjalan. */
export const HADIAH_DOORPRIZE_BAWAAN: PresetHadiah = PRESET_HADIAH_DOORPRIZE[0];

/** Label kategori untuk pilihan admin dan lencana di dashboard. */
export const LABEL_KATEGORI_HADIAH: Record<KategoriHadiah, string> = {
  GOLD: "Emas / logam mulia",
  ELECTRONICS: "Gadget & elektronik",
  VOUCHER: "Saldo digital",
  OTHER: "Lainnya",
};

const DAY_MS = 86_400_000;
/** WIB = UTC+7, tanpa DST. */
const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export type Kuartal = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
};

/** Kuartal yang memuat satu waktu (epoch ms) menurut kalender WIB. */
export function kuartalDariWaktu(waktu: number): Kuartal {
  if (!Number.isSafeInteger(waktu) || waktu <= 0) {
    throw new Error("Waktu periode undian tidak valid.");
  }
  const wib = new Date(waktu + OFFSET_WIB_MS);
  const year = wib.getUTCFullYear();
  const quarter = (Math.floor(wib.getUTCMonth() / 3) + 1) as Kuartal["quarter"];
  return { year, quarter };
}

/** Kode periode yang disimpan pada tiket dan catatan undian, mis. `2026-Q4`. */
export function kodeKuartal(kuartal: Kuartal): string {
  return `${kuartal.year}-Q${kuartal.quarter}`;
}

/** Baca kembali kode kuartal; menolak bentuk asing alih-alih menebak. */
export function bacaKodeKuartal(kode: string): Kuartal {
  const cocok = /^(\d{4})-Q([1-4])$/.exec(kode);
  if (cocok === null) throw new Error("Kode periode kuartal harus berbentuk YYYY-Q1…Q4.");
  return { year: Number(cocok[1]), quarter: Number(cocok[2]) as Kuartal["quarter"] };
}

/** Bulan pertama kuartal dalam indeks 0–11. */
export function bulanAwalKuartal(quarter: Kuartal["quarter"]): number {
  return (quarter - 1) * 3;
}

/** Awal kuartal (00.00 WIB hari pertama), epoch ms. */
export function awalKuartal(kuartal: Kuartal): number {
  return Date.UTC(kuartal.year, bulanAwalKuartal(kuartal.quarter), 1) - OFFSET_WIB_MS;
}

/** Awal kuartal berikutnya (eksklusif) — batas atas tiket kuartal ini. */
export function awalKuartalBerikutnya(kuartal: Kuartal): number {
  return Date.UTC(kuartal.year, bulanAwalKuartal(kuartal.quarter) + 3, 1) - OFFSET_WIB_MS;
}

/** Momen terakhir kuartal: 23.59.59.999 WIB pada hari terakhir. */
export function akhirKuartal(kuartal: Kuartal): number {
  return awalKuartalBerikutnya(kuartal) - 1;
}

/**
 * Saat pengundian resmi DIBUKA: awal hari terakhir kuartal (00.00 WIB).
 * Tiket yang masuk setelah undian dijalankan tidak lagi ikut kuartal itu.
 */
export function pembukaanUndianKuartal(kuartal: Kuartal): number {
  return akhirKuartal(kuartal) - (DAY_MS - 1);
}

/** Tanggal pengundian yang dibaca manusia, mis. `31 Desember 2026`. */
export function labelTanggalUndianKuartal(kuartal: Kuartal): string {
  return new Date(akhirKuartal(kuartal) + OFFSET_WIB_MS).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Label ringkas periode, mis. `Q4 2026`. */
export function labelPeriodeKuartal(kuartal: Kuartal): string {
  return `Q${kuartal.quarter} ${kuartal.year}`;
}

/** Tiga nama bulan dalam kuartal, urut kalender. */
export function bulanKuartal(kuartal: Kuartal): string[] {
  const awal = bulanAwalKuartal(kuartal.quarter);
  return [NAMA_BULAN[awal], NAMA_BULAN[awal + 1], NAMA_BULAN[awal + 2]];
}

/** Rentang yang dibaca manusia, mis. `Oktober – Desember 2026`. */
export function labelRentangKuartal(kuartal: Kuartal): string {
  const bulan = bulanKuartal(kuartal);
  return `${bulan[0]} – ${bulan[2]} ${kuartal.year}`;
}

/** Judul banner dashboard, mis. `Doorprize Utama Periode Q4 (Oktober – Desember)`. */
export function judulDoorprizeKuartal(kuartal: Kuartal): string {
  const bulan = bulanKuartal(kuartal);
  return `Doorprize Utama Periode Q${kuartal.quarter} (${bulan[0]} – ${bulan[2]})`;
}

/**
 * Kunci tiket yang dihitung untuk satu kuartal.
 *
 * Kunci pertama adalah kode kuartal (`2026-Q4`). Tiga kunci bulanan disertakan
 * sebagai jembatan data lama: tiket yang terbit sebelum aturan triwulanan aktif
 * masih berada di periode `YYYY-MM`, dan tiket bulan pertama kuartal berjalan
 * tidak boleh hilang hanya karena penamaannya berubah.
 */
export function kunciPeriodeKuartal(kuartal: Kuartal): string[] {
  const awal = bulanAwalKuartal(kuartal.quarter);
  const bulanan = [0, 1, 2].map((i) => {
    const nomor = String(awal + i + 1).padStart(2, "0");
    return `${kuartal.year}-${nomor}`;
  });
  return [kodeKuartal(kuartal), ...bulanan];
}

/** Jumlah tiket pendana untuk satu penempatan dana. */
export function tiketPendana(jumlahAlokasi: number): number {
  if (!Number.isSafeInteger(jumlahAlokasi) || jumlahAlokasi <= 0) return 0;
  return Math.floor(jumlahAlokasi / KELIPATAN_TIKET_PENDANA);
}

/** Tiket peminjam: satu per pinjaman yang lunas tepat waktu. */
export function tiketPeminjam(lunasTepatWaktu: boolean): number {
  return lunasTepatWaktu ? 1 : 0;
}

/** Hadiah sah hanya bila nilainya bilangan bulat di bawah Rp1 juta. */
export function nilaiHadiahValid(nilai: number): boolean {
  return (
    Number.isSafeInteger(nilai) &&
    nilai >= NILAI_HADIAH_MINIMUM &&
    nilai < BATAS_NILAI_HADIAH_DOORPRIZE
  );
}
