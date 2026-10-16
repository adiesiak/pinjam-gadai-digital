/**
 * Kolom angka rekap dana pendana: satu daftar untuk dua permukaan.
 *
 * Tabel perbandingan (dibaca admin dan pemantau kode akses bersama) dan panel
 * portofolio pribadi pendana menamai serta mewarnai angka yang sama; kalau
 * daftarnya ditulis dua kali, keduanya akan berbeda diam-diam.
 *
 * Berkas ini hanya berisi nilai dan fungsi kecil, tanpa komponen: React Fast
 * Refresh hanya bekerja bila satu modul mengekspor komponen saja (pola yang sama
 * dipakai `folio.ts`).
 */
import { KOLOM_PENDANA, type KunciAngka, type KunciUrut } from "@/lib/tabelPendana";

/**
 * Dua gugus kolom.
 *
 * Enam kolom angka sekaligus membuat angka menyebar dan sulit dibandingkan, jadi
 * yang terbuka lebih dulu hanya dua kolom modal (paling lebar dan paling sering
 * dibaca berpasangan). Empat kolom hasil dinyalakan saat hasil memang perlu
 * dibandingkan langsung dengan dananya.
 */
export type Gugus = "dana" | "hasil";

export const GUGUS: readonly { kunci: Gugus; label: string }[] = [
  { kunci: "dana", label: "Dana pendana" },
  { kunci: "hasil", label: "Hasil pendana" },
];

/**
 * Kolom angka beserta gugus dan warnanya.
 *
 * Labelnya tidak ditulis di sini: diambil dari `KOLOM_PENDANA`
 * (`@/lib/tabelPendana`), sumber istilah yang sama dengan kartu ringkasan di
 * halaman, supaya satu angka tidak pernah punya dua nama.
 */
export const KOLOM_ANGKA: readonly { kunci: KunciAngka; gugus: Gugus; kelas: string }[] = [
  { kunci: "tersalurkan", gugus: "dana", kelas: "font-medium text-slate-900" },
  { kunci: "berjalan", gugus: "dana", kelas: "text-slate-900" },
  { kunci: "dibukukan", gugus: "hasil", kelas: "font-semibold text-emerald-700" },
  { kunci: "perkiraan", gugus: "hasil", kelas: "font-medium text-amber-700" },
  { kunci: "total", gugus: "hasil", kelas: "font-semibold text-emerald-800" },
  { kunci: "admin", gugus: "hasil", kelas: "text-slate-900" },
];

/** Empat angka kepala yang ikut dicetak sebagai ringkasan satu baris. */
export const RINGKAS: readonly KunciAngka[] = ["tersalurkan", "dibukukan", "perkiraan", "admin"];

export function labelKolom(kunci: KunciUrut): string {
  return KOLOM_PENDANA.find((k) => k.kunci === kunci)?.label ?? kunci;
}

/** Label kolom tanpa keterangan dalam kurung, untuk ringkasan satu baris. */
export function labelSingkat(kunci: KunciUrut): string {
  return labelKolom(kunci)
    .replace(/ \(.*\)$/, "")
    .toLocaleLowerCase("id-ID");
}

/** Kolom pertama setiap gugus membuka gugusnya, jadi dia yang diberi garis pemisah. */
export function mulaiGugus(kolom: readonly { gugus: Gugus }[], i: number): boolean {
  return i === 0 || kolom[i - 1]?.gugus !== kolom[i].gugus;
}
