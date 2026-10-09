/**
 * Mesin pengingat jatuh tempo (Payment Due Alert) — fungsi MURNI.
 *
 * Tujuan satu-satunya: memutuskan **tingkat** sebuah pengingat jatuh tempo
 * (aman / segera / hari ini / terlambat) dan menyusun hitung mundurnya, supaya
 * kartu pengingat di dashboard Peminjam dan penanda di ruang penyedia dana
 * memakai ambang yang sama.
 *
 * Batas yang dijaga:
 * - **Status TIDAK ditentukan di sini.** Tingkat hanyalah NADA VISUAL dari
 *   angka jatuh tempo yang sudah dihitung server (`lib/loan`, `lib/jatuhTempo`).
 *   Hitung mundur murni dekoratif: ia tidak pernah mengubah status, denda, atau
 *   kewajiban.
 * - Ambang "segera" memakai `AMBANG_SEGERA_HARI` dari `lib/jatuhTempo` — satu
 *   angka untuk tabel admin, ruang penyedia dana, dan dashboard.
 * - Tanpa React, tanpa Convex, tanpa DOM, tanpa `Date.now()` di dalam: waktu
 *   "sekarang" selalu datang dari pemanggil, jadi bisa diuji sebagai skrip
 *   biasa (`bun src/lib/pengingatJatuhTempo.test.ts`).
 */
import {
  AMBANG_SEGERA_HARI,
  HITUNG_HARI_INI,
  type NadaJatuhTempo,
  type TampilanJatuhTempo,
} from "./jatuhTempo";

/** Tingkat pengingat — inilah empat "level visual" yang diminta produk. */
export type TingkatPengingat = "aman" | "segera" | "hari_ini" | "terlambat";

/**
 * Tingkat dari angka hari yang sudah dihitung server.
 * `sisaHari === 0` berarti jatuh tempo hari ini.
 */
export function tingkatPengingat(sisaHari: number, hariTerlambat: number): TingkatPengingat {
  if (hariTerlambat > 0) return "terlambat";
  if (sisaHari <= 0) return "hari_ini";
  if (sisaHari <= AMBANG_SEGERA_HARI) return "segera";
  return "aman";
}

/**
 * Tingkat dari tampilan jatuh tempo `lib/jatuhTempo` (dipakai ruang penyedia
 * dana, yang membaca baris pinjaman lewat modul yang sama dengan tabelnya).
 * Pinjaman lunas / belum didanai tidak punya kewajiban mendesak.
 */
export function tingkatDariTampilan(
  tampilan: Pick<TampilanJatuhTempo, "nada" | "hitung">,
): TingkatPengingat {
  if (tampilan.nada === "lunas" || tampilan.nada === "belum_didanai") return "aman";
  if (tampilan.nada === "terlambat") return "terlambat";
  if (tampilan.nada === "segera") {
    return tampilan.hitung === HITUNG_HARI_INI ? "hari_ini" : "segera";
  }
  return "aman";
}

/** Judul pengingat sesuai tingkat — satu kalimat yang bisa dibaca apa adanya. */
export function judulPengingat(
  tingkat: TingkatPengingat,
  sisaHari: number,
  hariTerlambat: number,
): string {
  switch (tingkat) {
    case "terlambat":
      return `Pembayaran Terlambat ${hariTerlambat} Hari`;
    case "hari_ini":
      return "Pembayaran Jatuh Tempo Hari Ini";
    case "segera":
      return `Pembayaran Jatuh Tempo ${sisaHari} Hari Lagi`;
    default:
      return `Pembayaran Jatuh Tempo ${sisaHari} Hari Lagi`;
  }
}

/** Hitung mundur terurai: hari / jam / menit, membulat ke bawah. */
export type HitungMundur = {
  hari: number;
  jam: number;
  menit: number;
  /** Total menit tersisa — nol atau negatif berarti sudah lewat. */
  totalMenit: number;
};

/**
 * Hitung mundur menuju `jatuhTempoPada`. Tidak pernah negatif: setelah lewat,
 * nilainya nol (yang menandai "lewat" tetap status dari server, bukan angka ini).
 */
export function hitungMundur(jatuhTempoPada: number, sekarang: number): HitungMundur {
  const sisaMenit = Math.max(0, Math.floor((jatuhTempoPada - sekarang) / 60_000));
  return {
    totalMenit: sisaMenit,
    hari: Math.floor(sisaMenit / 1440),
    jam: Math.floor((sisaMenit % 1440) / 60),
    menit: sisaMenit % 60,
  };
}

/**
 * Kalimat hitung mundur: "3 hari 12 jam 25 menit". Bagian bernilai nol di depan
 * dilewati supaya tidak berbunyi "0 hari 1 jam 9 menit".
 */
export function teksHitungMundur(h: HitungMundur): string {
  if (h.totalMenit <= 0) return "kurang dari 1 menit";
  const bagian: string[] = [];
  if (h.hari > 0) bagian.push(`${h.hari} hari`);
  if (h.jam > 0) bagian.push(`${h.jam} jam`);
  bagian.push(`${h.menit} menit`);
  return bagian.join(" ");
}

/**
 * Efek "napas" (bayangan yang pelan membesar-mengecil) — dipakai semua tingkat
 * MENDESAK, termasuk yang sudah terlambat. Terlambat butuh terlihat jelas,
 * tetapi tetap tenang: napas pelan, bukan denyut cepat.
 */
export function perluNapas(tingkat: TingkatPengingat): boolean {
  return tingkat !== "aman";
}

/**
 * Efek denyut aktif (cincin melebar + lencana membesar-mengecil). Hanya untuk
 * yang mendesak dan BELUM lewat — saat sudah terlambat, yang dibutuhkan angka
 * yang tenang, bukan gerakan yang menagih.
 */
export function perluDenyut(tingkat: TingkatPengingat): boolean {
  return tingkat === "segera" || tingkat === "hari_ini";
}

/** Nada dasar sebuah tingkat — dipakai komponen memilih palet warna. */
export function nadaVisual(tingkat: TingkatPengingat): "netral" | "segera" | "terlambat" {
  if (tingkat === "terlambat") return "terlambat";
  if (tingkat === "aman") return "netral";
  return "segera";
}

/** Nama tingkatan untuk pembaca layar (bukan warna saja). */
export const LABEL_TINGKAT: Record<TingkatPengingat, string> = {
  aman: "aman",
  segera: "segera jatuh tempo",
  hari_ini: "jatuh tempo hari ini",
  terlambat: "terlambat",
};

/** Dipakai uji & pemanggil yang butuh daftar nada jatuh tempo valid. */
export type { NadaJatuhTempo };
