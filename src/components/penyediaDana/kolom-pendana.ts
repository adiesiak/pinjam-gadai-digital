/**
 * Kolom angka rekap dana pendana: satu daftar untuk dua permukaan.
 *
 * Tabel perbandingan (dibaca admin dan pemantau kode akses bersama) dan panel
 * portofolio pribadi pendana menamai serta mewarnai angka yang sama; kalau
 * daftarnya ditulis dua kali, keduanya akan berbeda diam-diam. Susunan kolom
 * tabelnya pun tinggal di sini, jadi kepala tabel dan selnya dibaca dari satu
 * daftar yang sama.
 *
 * Berkas ini hanya berisi nilai dan fungsi kecil, tanpa komponen: React Fast
 * Refresh hanya bekerja bila satu modul mengekspor komponen saja (pola yang sama
 * dipakai `folio.ts`).
 */
import { KOLOM_PENDANA, type KunciAngka, type KunciUrut } from "@/lib/tabelPendana";

/**
 * Pita kolom: tiga kelompok pertanyaan yang dibawa pembaca ke tabel ini.
 *
 * Dulu enam kolom angka dinyalakan-matikan lewat tombol gugus, jadi angka hasil
 * bisa tersembunyi dari pembaca yang tidak tahu tombolnya ada, dan mana angka
 * induk mana angka turunan hanya terbaca dari urutannya. Sekarang kolomnya tetap
 * semua, tetapi diberi nama kelompoknya di kepala tabel: apa yang dititipkan
 * ("Dana pendana"), apa hasilnya ("Hasil pendana"), dan apa sisi platformnya
 * ("Platform") — biaya layanan yang dipungut serta transfer yang belum dicatat.
 */
export type Pita = "dana" | "hasil" | "platform";

/** Kolom tabel yang bukan angka: keadaannya dibaca sebagai kalimat. */
export type KunciKeadaan = "transfer";

/** Kunci kolom tabel: kolom angka yang bisa diurutkan, atau kolom keadaan. */
export type KunciTabel = KunciAngka | KunciKeadaan;

export const PITA: readonly { kunci: Pita; label: string; kolom: readonly KunciTabel[] }[] = [
  { kunci: "dana", label: "Dana pendana", kolom: ["tersalurkan"] },
  { kunci: "hasil", label: "Hasil pendana", kolom: ["dibukukan", "perkiraan"] },
  { kunci: "platform", label: "Platform", kolom: ["transfer", "admin"] },
];

/**
 * Kolom angka beserta warnanya.
 *
 * Labelnya tidak ditulis di sini: diambil dari `KOLOM_PENDANA`
 * (`@/lib/tabelPendana`), sumber istilah yang sama dengan kartu ringkasan di
 * halaman, supaya satu angka tidak pernah punya dua nama.
 *
 * Warnanya dipakai bertingkat, bukan seragam: angka induk (dana tersalurkan)
 * memakai tinta navy dan tebal, angka yang sudah jadi uang hijau, angka yang
 * masih hitungan amber, dan porsi platform tetap netral — pembaca bisa memilah
 * mana yang mengikat dan mana yang baru perkiraan tanpa membaca labelnya satu
 * per satu.
 */
export const KOLOM_ANGKA: readonly { kunci: KunciAngka; kelas: string }[] = [
  { kunci: "tersalurkan", kelas: "font-semibold text-navy" },
  { kunci: "berjalan", kelas: "text-slate-900" },
  { kunci: "dibukukan", kelas: "font-semibold text-emerald-700" },
  { kunci: "perkiraan", kelas: "font-medium text-amber-700" },
  { kunci: "total", kelas: "font-semibold text-emerald-800" },
  { kunci: "admin", kelas: "text-slate-900" },
];

/**
 * Kolom tabel beserta pitanya — satu daftar yang dipakai untuk kepala DAN isi
 * tabel, jadi judul kolom dan selnya tidak bisa tergeser satu sama lain.
 *
 * Judul kolom keadaan tidak diambil dari `KOLOM_PENDANA` karena kolom itu bukan
 * angka yang diurutkan, melainkan keadaan yang dibaca sebagai kalimat ("1 belum
 * dicatat").
 */
export const KOLOM_TABEL: readonly {
  kunci: KunciTabel;
  pita: Pita;
  label: string;
  kelas: string;
}[] = PITA.flatMap((p) =>
  p.kolom.map((kunci) => ({
    kunci,
    pita: p.kunci,
    label: kunci === "transfer" ? "Transfer keuntungan" : labelKolom(kunci),
    kelas: KOLOM_ANGKA.find((k) => k.kunci === kunci)?.kelas ?? "text-slate-900",
  })),
);

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
