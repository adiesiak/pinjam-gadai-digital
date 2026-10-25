/**
 * Referral nasabah — kode ajak teman dan hadiah setelah pinjaman lunas.
 *
 * Dua sisi:
 *  - perujuk mendapat kode tetap dari namanya; kode itu dibagikan ke calon
 *    peminjam lain;
 *  - pengundang memasukkan kode sebelum punya pinjaman. Hadiah untuk kedua
 *    pihak baru terbit saat pinjaman pertama pengundang LUNAS — bukan saat
 *    mendaftar — supaya kode tidak bisa dipanen dengan akun kosong.
 *
 * Hadiahnya voucher biaya admin, bukan uang tunai: memakai mekanisme voucher
 * yang sudah ada (batas pemakaian, masa berlaku, pencabutan admin), sehingga
 * tidak lahir jalur pencairan dana baru.
 */
import { LOAN_LIMITS } from "./loan";
import type { Rupiah } from "./money";

export const REFERRAL = {
  /** Voucher untuk pemilik kode, sekali per pengundang yang lunas. */
  hadiahPerujuk: 50_000 as Rupiah,
  /** Voucher untuk pengundang, sekali saat pinjaman pertamanya lunas. */
  hadiahPengundang: 25_000 as Rupiah,
  /** Pokok minimum pinjaman yang menghitung sebagai referral berhasil. */
  minimalPokok: LOAN_LIMITS.minPokok,
  /** Masa berlaku voucher hadiah. */
  berlakuHari: 30,
  /** Kode tidak pernah lebih panjang dari ini. */
  panjangMaks: 12,
} as const;

export type StatusKlaimReferral = "menunggu_lunas" | "hadiah_diberikan" | "batal";

export const LABEL_STATUS_REFERRAL: Record<StatusKlaimReferral, string> = {
  menunggu_lunas: "Menunggu pinjaman lunas",
  hadiah_diberikan: "Hadiah diberikan",
  batal: "Dibatalkan",
};

/** Huruf/angka saja, huruf besar. Pengguna boleh mengetik spasi atau tanda hubung. */
export function normalisasiKodeReferral(teks: string): string {
  return teks.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, REFERRAL.panjangMaks);
}

/**
 * Bentuk kode: awalan nama (3–8 huruf) + tiga karakter sidik akun.
 *
 * Awalan membuat kode mudah diingat dan diucapkan; sidik akun membuat dua
 * "Budi" tidak berebut kode yang sama tanpa perlu menambah angka berurutan
 * yang bisa ditebak.
 */
export function buatKodeReferral(nama: string, userId: string): string {
  const awalan =
    nama
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 8) || "TEMAN";
  return `${awalan}${sidikAkun(userId)}`;
}

/** Tiga karakter base36 dari FNV-1a — cukup untuk membedakan akun. */
function sidikAkun(userId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0")
    .slice(-3);
}

/** Kode yang boleh disimpan: 4–12 karakter, diawali huruf. */
export function kodeReferralValid(kode: string): boolean {
  return /^[A-Z][A-Z0-9]{3,11}$/.test(kode);
}

/**
 * Periksa satu klaim sebelum disimpan. Mengembalikan pesan galat atau `null`.
 *
 * Semua alasan ditolak disebut apa adanya supaya layar bisa menampilkan pesan
 * yang sama dengan yang dipakai server — bukan aturan kedua di klien.
 */
export function periksaKlaimReferral(masukan: {
  kode: string;
  kodeSendiri: string | null;
  sudahPernahKlaim: boolean;
  sudahPunyaPinjaman: boolean;
}): string | null {
  const kode = normalisasiKodeReferral(masukan.kode);
  if (!kodeReferralValid(kode)) return "Kode referral tidak valid.";
  if (masukan.kodeSendiri !== null && kode === normalisasiKodeReferral(masukan.kodeSendiri)) {
    return "Kode milik sendiri tidak bisa dipakai.";
  }
  if (masukan.sudahPernahKlaim) return "Akun ini sudah memakai kode referral.";
  if (masukan.sudahPunyaPinjaman) {
    return "Kode referral hanya bisa dipakai sebelum pinjaman pertama.";
  }
  return null;
}

export type KlaimReferralRingkas = {
  status: StatusKlaimReferral;
  /** Nama pemilik kode; kosong bila data akun sudah dihapus. */
  namaPerujuk?: string;
  diklaimPada: number;
};

export type RingkasanReferral = {
  menunggu: number;
  berhasil: number;
  totalHadiah: Rupiah;
};

/** Hitungan untuk kartu nasabah: hanya klaim yang menghasilkan voucher dihitung hadiah. */
export function ringkasReferral(klaim: readonly KlaimReferralRingkas[]): RingkasanReferral {
  let menunggu = 0;
  let berhasil = 0;
  for (const satu of klaim) {
    if (satu.status === "menunggu_lunas") menunggu += 1;
    else if (satu.status === "hadiah_diberikan") berhasil += 1;
  }
  return {
    menunggu,
    berhasil,
    totalHadiah: (berhasil * REFERRAL.hadiahPerujuk) as Rupiah,
  };
}

/** Kode aman dibagikan sebagai teks WhatsApp. */
export function pesanBagikanReferral(kode: string, tautan: string): string {
  return [
    `Halo! Saya pakai PINDAI untuk pinjaman cepat.`,
    `Masukkan kode referral saya *${kode}* saat mendaftar, lalu ajukan pinjaman pertamamu.`,
    tautan,
  ].join("\n");
}
