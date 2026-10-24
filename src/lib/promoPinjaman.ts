/**
 * Aturan kampanye promo pinjaman yang dipakai server, panel admin, dan banner.
 *
 * Satu sumber untuk nama penempatan, batas panjang teks, dan konversi tanggal
 * WIB ke milidetik. Server tetap memeriksa ulang lewat `periksaIsiPromo`, jadi
 * panel hanya perlu menampilkan pesan yang sama, bukan aturan kedua.
 */
import { OFFSET_WIB_MS, tanggalWIB } from "./waktu";

export const PENEMPATAN_PROMO = [
  { id: "beranda", label: "Beranda publik" },
  { id: "dashboard", label: "Dashboard nasabah" },
  { id: "promo", label: "Halaman /promo", catatan: "hanya terlihat admin" },
  { id: "pengajuan", label: "Form pengajuan" },
] as const;

export type PenempatanPromo = (typeof PENEMPATAN_PROMO)[number]["id"];

export const BATAS_PROMO = {
  badge: 24,
  judul: 70,
  deskripsi: 200,
} as const;

/** Isi kampanye seperti yang dikirim panel ke server. */
export type IsiPromoPinjaman = {
  badge: string;
  judul: string;
  deskripsi: string;
  /** Awal hari pertama masa berlaku (00.00 WIB), dalam milidetik. */
  mulai: number;
  /** Akhir hari terakhir masa berlaku (23.59.59.999 WIB). */
  selesai: number;
  penempatan: readonly PenempatanPromo[];
  aktif: boolean;
};

/** Data yang cukup untuk menggambar banner tanpa membocorkan kolom admin. */
export type DataPromoPinjaman = Pick<
  IsiPromoPinjaman,
  "badge" | "judul" | "deskripsi" | "mulai" | "selesai"
>;

/**
 * Preset kampanye teks yang sering dipakai admin.
 *
 * Template hanya mengisi badge, judul, deskripsi, dan tempat tampil — tanggal
 * tetap milik admin, dan semua teks masih bisa disunting sebelum disimpan. Ia
 * ada supaya kampanye rutin tidak ditulis ulang dari nol dan supaya janji yang
 * dilarang (mis. bunga pasti turun) tidak muncul karena kekeliruan ketik.
 */
export type TemplatePromoPinjaman = {
  id: string;
  label: string;
  badge: string;
  judul: string;
  deskripsi: string;
  penempatan: readonly PenempatanPromo[];
};

export const TEMPLATE_PROMO_PINJAMAN: readonly TemplatePromoPinjaman[] = [
  {
    id: "bunga-promo",
    label: "Bunga promo",
    badge: "BUNGA PROMO",
    judul: "Bunga lebih ringan untuk tenor pilihan",
    deskripsi:
      "Promo bunga sedang berjalan untuk tenor tertentu. Angka final dihitung sistem dari tenor dan nominal yang Anda pilih di formulir pengajuan.",
    penempatan: ["dashboard", "pengajuan", "promo"],
  },
  {
    id: "cair-cepat",
    label: "Cair hari ini",
    badge: "CAIR CEPAT",
    judul: "Dana ditransfer hari yang sama",
    deskripsi:
      "Pengajuan yang lengkap dan disetujui sebelum pukul 15.00 WIB diproses pada hari yang sama. Status pencairan selalu terlihat di dashboard.",
    penempatan: ["beranda", "dashboard", "pengajuan"],
  },
  {
    id: "tenor-pendek",
    label: "Tenor 7 hari",
    badge: "TENOR PENDEK",
    judul: "Pinjam 7 hari, bayar sekali",
    deskripsi:
      "Cocok untuk kebutuhan yang dekat: satu kali bayar di akhir tenor, tanpa cicilan bulanan. Bunga mengikuti tenor dan nominal yang dipilih.",
    penempatan: ["beranda", "dashboard", "pengajuan"],
  },
  {
    id: "voucher-biaya",
    label: "Voucher biaya",
    badge: "VOUCHER",
    judul: "Cek voucher di formulir pengajuan",
    deskripsi:
      "Voucher potongan biaya admin dan tambah limit tampil di formulir bila akun Anda memilikinya. Voucher hanya berlaku untuk pemiliknya.",
    penempatan: ["dashboard", "pengajuan"],
  },
  {
    id: "undian",
    label: "Undian",
    badge: "UNDIAN",
    judul: "Ikut undian doorprize",
    deskripsi:
      "Setiap pelunasan tepat waktu menambah kesempatan pada undian triwulanan. Pemenang diundi dari catatan PINDAI dan diumumkan di aplikasi.",
    penempatan: ["beranda", "dashboard", "promo"],
  },
] as const;

export function labelPenempatan(id: PenempatanPromo): string {
  return PENEMPATAN_PROMO.find((p) => p.id === id)?.label ?? id;
}

export function penempatanSah(nilai: string): nilai is PenempatanPromo {
  return PENEMPATAN_PROMO.some((p) => p.id === nilai);
}

/**
 * Tanggal `YYYY-MM-DD` dari `<input type="date">` menjadi milidetik WIB.
 *
 * `akhirHari` dipakai untuk tanggal selesai supaya kampanye masih tampil pada
 * hari terakhirnya, bukan berhenti pukul 00.00.
 */
export function tanggalKeMsWIB(tanggal: string, akhirHari = false): number | null {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal.trim());
  if (cocok === null) return null;

  const tahun = Number(cocok[1]);
  const bulan = Number(cocok[2]);
  const hari = Number(cocok[3]);
  const utc = Date.UTC(tahun, bulan - 1, hari);
  const cek = new Date(utc);
  // Date.UTC membetulkan 31 Februari menjadi 3 Maret; tanggal seperti itu harus
  // ditolak, bukan disimpan sebagai hari lain.
  if (
    cek.getUTCFullYear() !== tahun ||
    cek.getUTCMonth() !== bulan - 1 ||
    cek.getUTCDate() !== hari
  ) {
    return null;
  }

  return utc - OFFSET_WIB_MS + (akhirHari ? 86_399_999 : 0);
}

/** Nilai untuk `<input type="date">` dari milidetik. */
export function msKeTanggalInput(ms: number): string {
  return tanggalWIB(ms);
}

function bagianTanggal(ms: number): { hari: string; bulan: string; tahun: string } {
  const bagian = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).formatToParts(new Date(ms));

  const ambil = (jenis: Intl.DateTimeFormatPartTypes) =>
    bagian.find((b) => b.type === jenis)?.value ?? "";

  return { hari: ambil("day"), bulan: ambil("month"), tahun: ambil("year") };
}

/** "1–31 Oktober 2026", "28 September – 5 Oktober 2026", atau satu hari. */
export function formatPeriodePromo(mulai: number, selesai: number): string {
  const awal = bagianTanggal(mulai);
  const akhir = bagianTanggal(selesai);

  if (awal.hari === akhir.hari && awal.bulan === akhir.bulan && awal.tahun === akhir.tahun) {
    return `${awal.hari} ${awal.bulan} ${awal.tahun}`;
  }
  if (awal.bulan === akhir.bulan && awal.tahun === akhir.tahun) {
    return `${awal.hari}–${akhir.hari} ${akhir.bulan} ${akhir.tahun}`;
  }
  if (awal.tahun === akhir.tahun) {
    return `${awal.hari} ${awal.bulan} – ${akhir.hari} ${akhir.bulan} ${akhir.tahun}`;
  }
  return `${awal.hari} ${awal.bulan} ${awal.tahun} – ${akhir.hari} ${akhir.bulan} ${akhir.tahun}`;
}

export function promoBerjalan(data: DataPromoPinjaman, sekarang: number): boolean {
  return data.mulai <= sekarang && sekarang <= data.selesai;
}

export type StatusPromo = "nonaktif" | "dijadwalkan" | "berjalan" | "berakhir";

/**
 * Status yang dibaca admin. "Nonaktif" menang atas tanggal: kampanye yang
 * dimatikan tidak akan tampil walau masa berlakunya sedang berjalan.
 */
export function statusPromo(
  data: DataPromoPinjaman & { aktif: boolean },
  sekarang: number,
): StatusPromo {
  if (!data.aktif) return "nonaktif";
  if (sekarang < data.mulai) return "dijadwalkan";
  if (sekarang > data.selesai) return "berakhir";
  return "berjalan";
}

/**
 * Daftar pesan kesalahan; kosong berarti isi siap disimpan.
 *
 * Teks dikembalikan dalam bahasa Indonesia karena panel menampilkannya apa
 * adanya dan server memakai pesan pertama sebagai galat mutation.
 */
export function periksaIsiPromo(isi: IsiPromoPinjaman): string[] {
  const pesan: string[] = [];
  const judul = isi.judul.trim();
  const deskripsi = isi.deskripsi.trim();
  const badge = isi.badge.trim();

  if (judul.length < 4) {
    pesan.push("Judul promo minimal 4 karakter.");
  } else if (judul.length > BATAS_PROMO.judul) {
    pesan.push(`Judul promo maksimal ${BATAS_PROMO.judul} karakter.`);
  }

  if (deskripsi.length < 12) {
    pesan.push("Deskripsi promo minimal 12 karakter.");
  } else if (deskripsi.length > BATAS_PROMO.deskripsi) {
    pesan.push(`Deskripsi promo maksimal ${BATAS_PROMO.deskripsi} karakter.`);
  }

  if (badge.length > BATAS_PROMO.badge) {
    pesan.push(`Label kecil maksimal ${BATAS_PROMO.badge} karakter.`);
  }

  if (!Number.isFinite(isi.mulai) || !Number.isFinite(isi.selesai)) {
    pesan.push("Tanggal mulai dan selesai wajib diisi.");
  } else if (isi.selesai < isi.mulai) {
    pesan.push("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  }

  if (isi.penempatan.length === 0) {
    pesan.push("Pilih minimal satu tempat tampil.");
  } else if (isi.penempatan.some((p) => !penempatanSah(p))) {
    pesan.push("Ada tempat tampil yang tidak dikenal.");
  }

  return pesan;
}
