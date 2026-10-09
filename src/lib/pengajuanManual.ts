/**
 * Pencatatan pengajuan manual oleh admin — logika murni.
 *
 * Admin kadang menerima pengajuan di luar aplikasi (nasabah datang ke kantor,
 * data lama dipindahkan dari buku, atau pengajuan dicatat atas permintaan
 * nasabah). Berkas ini menampung aturan bentuk & normalisasi untuk ketiga
 * produk (pinjaman tunai, gadai, kredit barang) supaya formulir panel admin dan
 * mutation server memakai aturan yang sama — bukan dua salinan yang bisa
 * berbeda diam-diam.
 *
 * Yang TIDAK ada di sini: harga, bunga, cicilan, dan plafon. Semua angka uang
 * tetap dihitung mesin masing-masing di server (lib/loan.ts, lib/bulanan.ts,
 * lib/kredit.ts) dan plafon diperiksa di mutation, karena hanya server yang
 * membaca riwayat dan Pengaturan Sistem.
 *
 * Murni: tanpa React, tanpa Convex runtime — bisa diuji sebagai skrip biasa
 * (`bun src/lib/pengajuanManual.test.ts`).
 */
import type { Id } from "../convex/_generated/dataModel";
import { assertSimulasiBulananValid, TENOR_BULANAN_OPTIONS } from "./bulanan";
import { KREDIT_PRICING, KREDIT_TENOR_PENGAJUAN_OPTIONS } from "./kredit";
import type { JenisPengajuan } from "./jenisPengajuan";
import { assertPokokPinjamanValid, LOAN_PURPOSE_OPTIONS, TENOR_OPTIONS } from "./loan";
import { parseRupiah } from "./money";
import { namaHurufBesar } from "./nama";
import { COLLATERAL_CATEGORIES } from "./pawn";

/** Satu nasabah yang bisa dipilih sebagai pemilik pengajuan manual. */
export type NasabahManual = {
  userId: Id<"users">;
  nama: string;
  email: string | null;
  kodePeminjam: string | null;
  /** true bila data diri (NIK/WhatsApp) sudah tersimpan untuk nasabah ini. */
  adaDataDiri: boolean;
  /** Nama bank/e-wallet terakhir yang tersimpan di data diri, bila ada. */
  namaBank: string | null;
  /** Nomor rekening terakhir yang tersimpan di data diri, bila ada. */
  nomorRekening: string | null;
  /**
   * true bila akun ini DIBUAT ADMIN untuk pemohon yang belum punya akun
   * (walk-in); akun begini tidak punya kredensial masuk.
   */
  dibuatAdmin: boolean;
};

/** Label & awalan nomor referensi tiap produk untuk formulir manual. */
export const JENIS_MANUAL: Record<
  JenisPengajuan,
  { judul: string; deskripsi: string; cta: string; awalan: string }
> = {
  pinjaman: {
    judul: "Catat pengajuan pinjaman",
    deskripsi:
      "Mencatat pengajuan pinjaman tunai yang diterima di luar aplikasi. Bunga, biaya, dan kewajiban dihitung server; keputusannya tetap lewat antrean review.",
    cta: "Catat pengajuan pinjaman",
    awalan: "PGD",
  },
  gadai: {
    judul: "Catat pengajuan gadai",
    deskripsi:
      "Mencatat pengajuan gadai yang diterima di luar aplikasi. Nilai taksiran tetap diisi tim saat penilaian.",
    cta: "Catat pengajuan gadai",
    awalan: "PGD",
  },
  kredit: {
    judul: "Catat pengajuan kredit barang",
    deskripsi:
      "Mencatat pengajuan kredit barang yang diterima di luar aplikasi. DP, cicilan, dan Imbal Hasil dihitung server dari harga barang dan tenor.",
    cta: "Catat pengajuan kredit barang",
    awalan: "KRD",
  },
};

/**
 * Nomor referensi untuk pengajuan yang dicatat admin — formatnya sama dengan
 * nomor yang diterbitkan jalur nasabah (`PGD-YYYYMMDD-XXXX` / `KRD-…`) supaya
 * pencarian dan pengurutan antrean tidak perlu tahu siapa yang mencatat.
 */
export function nomorReferensiManual(jenis: JenisPengajuan, now: number): string {
  const tanggal = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `${JENIS_MANUAL[jenis].awalan}-${tanggal}-${suffix}`;
}

/** Teks wajib: dipangkas, dibatasi panjang, dan ditolak bila terlalu pendek. */
export function normalisasiTeks(
  nilai: string,
  label: string,
  min: number,
  maks: number,
): string {
  const teks = nilai.trim();
  if (teks.length < min) {
    throw new Error(`${label} wajib diisi (minimal ${min} karakter).`);
  }
  if (teks.length > maks) {
    throw new Error(`${label} maksimal ${maks} karakter.`);
  }
  return teks;
}

/** Teks opsional: kosong menjadi `undefined`, tidak pernah string kosong. */
export function normalisasiTeksOpsional(
  nilai: string | undefined,
  label: string,
  maks: number,
): string | undefined {
  if (nilai === undefined) return undefined;
  const teks = nilai.trim();
  if (teks === "") return undefined;
  if (teks.length > maks) {
    throw new Error(`${label} maksimal ${maks} karakter.`);
  }
  return teks;
}

/**
 * Nama pemohon selalu disimpan HURUF BESAR agar seragam dengan data pinjaman
 * di ruang penyedia dana (satu tempat aturannya: `lib/nama.ts`).
 */
export function normalisasiNamaPanjang(nilai: string): string {
  return normalisasiTeks(namaHurufBesar(nilai), "Nama lengkap", 3, 120);
}

/** Nama bank/e-wallet tujuan pencairan. */
export function normalisasiNamaBank(nilai: string): string {
  return normalisasiTeks(nilai, "Nama bank atau e-wallet tujuan", 2, 60);
}

/** Rekening/e-wallet: hanya digit, 6–20 angka (aturan yang sama dengan jalur nasabah). */
export function normalisasiRekening(nilai: string): string {
  const bersih = nilai.trim().replace(/\s+/g, "");
  if (!/^\d{6,20}$/.test(bersih)) {
    throw new Error("Nomor rekening/akun e-wallet harus 6–20 digit angka.");
  }
  return bersih;
}

/** NIK: 16 digit angka. */
export function normalisasiNik(nilai: string): string {
  const bersih = nilai.replace(/\s+/g, "");
  if (!/^\d{16}$/.test(bersih)) {
    throw new Error("NIK harus 16 digit angka sesuai KTP.");
  }
  return bersih;
}

/** Nomor WhatsApp format internasional 62… tanpa tanda plus/spasi. */
export function normalisasiNomorWhatsApp(nilai: string): string {
  const bersih = nilai.replace(/[\s+-]/g, "");
  if (!/^62\d{8,13}$/.test(bersih)) {
    throw new Error(
      "Nomor WhatsApp wajib format internasional 62… (mis. 6281234567890).",
    );
  }
  return bersih;
}

/** Tautan barang (opsional) — hanya http/https. */
export function normalisasiTautan(
  nilai: string | undefined,
  label = "Tautan barang",
): string | undefined {
  const teks = nilai?.trim();
  if (teks === undefined || teks === "") return undefined;
  if (!/^https?:\/\/\S+$/i.test(teks)) {
    throw new Error(`${label} harus diawali http:// atau https://.`);
  }
  if (teks.length > 500) {
    throw new Error(`${label} maksimal 500 karakter.`);
  }
  return teks;
}

/**
 * Angka rupiah dari input teks formulir, atau `null` bila belum bisa dibaca.
 * Dipakai formulir panel admin untuk menampilkan pratinjau tanpa melempar
 * galat saat admin masih mengetik.
 */
export function rupiahDariTeks(teks: string): number | null {
  try {
    return parseRupiah(teks);
  } catch {
    return null;
  }
}

/** Apakah pokok pinjaman bulanan berada di batas mesin skema bulanan. */
export function tenorBulananManualSah(tenorBulan: number): boolean {
  return (TENOR_BULANAN_OPTIONS as readonly number[]).includes(tenorBulan);
}

// =====================================================================
// Pinjaman tunai
// =====================================================================

export type PinjamanManualInput = {
  pokokPinjaman: number;
  /** Skema harian: salah satu TENOR_OPTIONS. */
  tenorHari?: number;
  /** Skema bulanan: salah satu TENOR_BULANAN_OPTIONS (menang atas tenorHari). */
  tenorBulan?: number;
  tujuan: string;
  namaLengkap: string;
  namaBank: string;
  nomorRekening: string;
  catatanPeminjam?: string;
};

export type PinjamanManualBersih = {
  pokokPinjaman: number;
  tenorHari: number;
  tenorBulan: number | undefined;
  tujuan: string;
  namaLengkap: string;
  namaBank: string;
  nomorRekening: string;
  catatanPeminjam: string | undefined;
};

/**
 * Validasi bentuk pengajuan pinjaman manual. Batas pokok memakai aturan resmi
 * masing-masing skema (harian ≤ Rp 1 juta; bulanan lewat mesin bulanan).
 * Plafon per nasabah SENGAJA tidak diperiksa di sini MAUPUN di mutation:
 * jalur ini memindahkan pengajuan yang sudah terjadi di luar aplikasi, jadi
 * batas kredit dalam aplikasi bukan syaratnya (lihat convex/adminPengajuan.ts).
 */
export function validasiPinjamanManual(
  input: PinjamanManualInput,
): PinjamanManualBersih {
  const bulanan = input.tenorBulan !== undefined;
  if (bulanan) {
    if (!tenorBulananManualSah(input.tenorBulan as number)) {
      throw new Error(
        `Tenor bulanan harus salah satu dari ${TENOR_BULANAN_OPTIONS.join(" / ")} bulan.`,
      );
    }
    assertSimulasiBulananValid(input.pokokPinjaman, input.tenorBulan as number);
  } else {
    assertPokokPinjamanValid(input.pokokPinjaman);
    if (!(TENOR_OPTIONS as readonly number[]).includes(input.tenorHari ?? 0)) {
      throw new Error(
        `Tenor harus salah satu dari ${TENOR_OPTIONS.join(" / ")} hari (maksimal 30 hari).`,
      );
    }
  }
  if (!LOAN_PURPOSE_OPTIONS.some((o) => o.value === input.tujuan)) {
    throw new Error("Pilih keperluan pinjaman yang valid.");
  }
  return {
    pokokPinjaman: input.pokokPinjaman,
    // Tenor harian selalu tersimpan (skema lama membacanya); bulanan menandai
    // bahwa jadwal pinjaman ini memakai mesin bulanan.
    tenorHari: bulanan ? 30 : (input.tenorHari as number),
    tenorBulan: bulanan ? (input.tenorBulan as number) : undefined,
    tujuan: input.tujuan,
    namaLengkap: normalisasiNamaPanjang(input.namaLengkap),
    namaBank: normalisasiNamaBank(input.namaBank),
    nomorRekening: normalisasiRekening(input.nomorRekening),
    catatanPeminjam: normalisasiTeksOpsional(
      input.catatanPeminjam,
      "Catatan pengajuan",
      500,
    ),
  };
}

// =====================================================================
// Gadai
// =====================================================================

export type GadaiManualInput = {
  deskripsiBarang: string;
  kategori: string;
  alamatPenilaian: string;
  namaLengkap: string;
  namaBank: string;
  nomorRekening: string;
  catatanPeminjam?: string;
};

export type GadaiManualBersih = {
  deskripsiBarang: string;
  kategori: string;
  alamatPenilaian: string;
  namaLengkap: string;
  namaBank: string;
  nomorRekening: string;
  catatanPeminjam: string | undefined;
};

/** Validasi bentuk pengajuan gadai manual — penilaian tetap milik reviewer. */
export function validasiGadaiManual(input: GadaiManualInput): GadaiManualBersih {
  if (!(COLLATERAL_CATEGORIES as readonly string[]).includes(input.kategori)) {
    throw new Error("Pilih kategori barang yang valid.");
  }
  return {
    deskripsiBarang: normalisasiTeks(
      input.deskripsiBarang,
      "Deskripsi barang",
      10,
      1000,
    ),
    kategori: input.kategori,
    alamatPenilaian: normalisasiTeks(
      input.alamatPenilaian,
      "Alamat lokasi barang",
      10,
      300,
    ),
    namaLengkap: normalisasiNamaPanjang(input.namaLengkap),
    namaBank: normalisasiNamaBank(input.namaBank),
    nomorRekening: normalisasiRekening(input.nomorRekening),
    catatanPeminjam: normalisasiTeksOpsional(
      input.catatanPeminjam,
      "Catatan pengajuan",
      500,
    ),
  };
}

// =====================================================================
// Kredit barang
// =====================================================================

export type KreditManualInput = {
  namaBarang: string;
  kategori: string;
  merchant: string;
  tautanBarang?: string;
  hargaBarang: number;
  /** 1/3/6 bulan (skema bulanan: DP 0% dan margin mengikuti tenor). */
  tenorBulan: number;
  /** Rekening tujuan — sisa identitas pemohon dari data diri nasabah. */
  nomorRekening: string;
  catatanPeminjam?: string;
};

export type KreditManualBersih = {
  namaBarang: string;
  kategori: string;
  merchant: string;
  tautanBarang: string | undefined;
  hargaBarang: number;
  tenorBulan: number;
  nomorRekening: string;
  catatanPeminjam: string | undefined;
};

/**
 * Validasi bentuk pengajuan kredit barang manual. Harga dan batas pokok
 * pembiayaan mengikuti kebijakan kredit barang; DP/margin tidak diminta karena
 * tenor 1/3/6 bulan memakai skema bulanan (DP 0%, margin dari tenor).
 */
export function validasiKreditManual(input: KreditManualInput): KreditManualBersih {
  if (!(KREDIT_TENOR_PENGAJUAN_OPTIONS as readonly number[]).includes(input.tenorBulan)) {
    throw new Error(
      `Tenor kredit barang harus ${KREDIT_TENOR_PENGAJUAN_OPTIONS.join(" / ")} bulan.`,
    );
  }
  if (
    !Number.isSafeInteger(input.hargaBarang) ||
    input.hargaBarang < KREDIT_PRICING.minHargaBarang ||
    input.hargaBarang > KREDIT_PRICING.maxHargaBarang
  ) {
    throw new Error(
      `Harga barang harus antara ${KREDIT_PRICING.minHargaBarang} dan ${KREDIT_PRICING.maxHargaBarang} rupiah.`,
    );
  }
  return {
    namaBarang: normalisasiTeks(input.namaBarang, "Nama barang", 3, 120),
    kategori: normalisasiTeks(input.kategori, "Kategori barang", 3, 60),
    merchant: normalisasiTeks(input.merchant, "Sumber barang", 3, 80),
    tautanBarang: normalisasiTautan(input.tautanBarang),
    hargaBarang: input.hargaBarang,
    tenorBulan: input.tenorBulan,
    nomorRekening: normalisasiRekening(input.nomorRekening),
    catatanPeminjam: normalisasiTeksOpsional(
      input.catatanPeminjam,
      "Catatan pengajuan",
      500,
    ),
  };
}

/** Identitas minimal untuk mengenali satu orang di `nasabahProfil`. */
export type IdentitasNasabah = {
  readonly nik?: string | null;
  readonly nomorWhatsApp?: string | null;
};

/** Bidang identitas yang membuat dua baris dianggap orang yang sama. */
export type SebabKembar = "nik" | "whatsapp";

export type NasabahKembar<T> = { readonly baris: T; readonly sebab: SebabKembar };

/**
 * Cari nasabah yang SUDAH tercatat untuk identitas ini — lewat NIK **atau**
 * nomor WhatsApp.
 *
 * Kenapa WhatsApp ikut diperiksa: pengajuan yang dicatat dari data luar
 * (koperasi, buku besar, berkas kantor) sering membawa NIK yang salah ketik —
 * satu digit berbeda untuk orang yang sama. Kalau hanya NIK yang dibandingkan,
 * orang itu lolos dan dibuatkan akun KEDUA: dua baris nasabah, dua riwayat
 * pinjaman, dan dua salinan nama yang bisa berbeda tipis (mis. "ALIFAN" vs
 * "ALFIAN RIFKI JUNIAWAN") — persis duplikat yang sulit dilacak asalnya.
 *
 * Nomor WhatsApp lebih stabil daripada NIK yang diketik ulang, jadi kesamaan
 * nomor sudah cukup untuk MENOLAK membuat akun baru. NIK diperiksa lebih dulu
 * supaya pesannya menunjuk sebab yang paling meyakinkan.
 */
export function cariNasabahKembar<T extends IdentitasNasabah>(
  baris: readonly T[],
  calon: IdentitasNasabah,
): NasabahKembar<T> | undefined {
  if (digitSaja(calon.nik) !== "") {
    const nik = digitSaja(calon.nik);
    const cocok = baris.find((satu) => digitSaja(satu.nik) === nik);
    if (cocok !== undefined) return { baris: cocok, sebab: "nik" };
  }
  if (digitSaja(calon.nomorWhatsApp) !== "") {
    const wa = digitSaja(calon.nomorWhatsApp);
    const cocok = baris.find((satu) => digitSaja(satu.nomorWhatsApp) === wa);
    if (cocok !== undefined) return { baris: cocok, sebab: "whatsapp" };
  }
  return undefined;
}

/**
 * Digit saja, TANPA validasi. Dipakai hanya untuk MEMBANDINGKAN identitas:
 * baris warisan bisa memuat spasi/tanda hubung, dan kolom yang tidak sah
 * (mis. NIK belum 16 digit) harus sekadar tidak cocok — bukan melempar galat
 * dari jalur pencarian duplikat.
 */
function digitSaja(nilai: string | null | undefined): string {
  return (nilai ?? "").replace(/\D/g, "");
}
