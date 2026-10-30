/**
 * Penjaga kontras warna PINDAI.
 *
 * Run: bun src/lib/kontrasWarna.test.ts
 *
 * Uji ini membaca token di `src/index.css` lalu menghitung rasio kontras WCAG
 * untuk pasangan yang benar-benar dipakai teks dan kontrol. Tujuannya bukan
 * menguji selera warna, melainkan mencegah token yang sudah lolos berubah
 * diam-diam menjadi terlalu pucat.
 *
 * Batas yang dipakai:
 *  - teks normal 4.5:1 (DESIGN.md §5)
 *  - batas kontrol dan cincin fokus 3:1 (DESIGN.md §5)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  fileURLToPath(new URL("../index.css", import.meta.url)),
  "utf8",
);

function token(nama: string): string {
  const cocok = new RegExp(`--${nama}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (cocok === null) {
    throw new Error(`Token --${nama} tidak ditemukan di src/index.css`);
  }
  return cocok[1].toLowerCase();
}

function luminans(hex: string): number {
  const kanal = hex
    .replace("#", "")
    .match(/../g)!
    .map((bagian) => parseInt(bagian, 16) / 255)
    .map((nilai) =>
      nilai <= 0.04045 ? nilai / 12.92 : ((nilai + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * kanal[0] + 0.7152 * kanal[1] + 0.0722 * kanal[2];
}

function rasio(hexA: string, hexB: string): number {
  const a = luminans(hexA);
  const b = luminans(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

type Pasangan = {
  depan: string;
  belakang: string;
  minimum: number;
  label: string;
};

const pasangan: Pasangan[] = [
  // Teks utama dan sekunder di atas kertas.
  { depan: "foreground", belakang: "background", minimum: 4.5, label: "teks utama / kanvas" },
  { depan: "muted-foreground", belakang: "background", minimum: 4.5, label: "teks sekunder / kanvas" },
  { depan: "muted-foreground", belakang: "muted", minimum: 4.5, label: "teks sekunder / permukaan muted" },
  { depan: "muted-foreground", belakang: "secondary", minimum: 4.5, label: "teks sekunder / kertas sekunder" },
  { depan: "color-slate-600", belakang: "background", minimum: 4.5, label: "slate-600 / kanvas" },
  { depan: "color-slate-500", belakang: "background", minimum: 4.5, label: "slate-500 / kanvas" },
  { depan: "color-slate-500", belakang: "color-slate-50", minimum: 4.5, label: "slate-500 / slate-50" },
  { depan: "color-slate-500", belakang: "color-slate-100", minimum: 4.5, label: "slate-500 / slate-100" },

  // Tombol dan status.
  { depan: "primary-foreground", belakang: "primary", minimum: 4.5, label: "teks tombol utama" },
  { depan: "gold-foreground", belakang: "background", minimum: 4.5, label: "label kuningan / kanvas" },
  { depan: "color-emerald-800", belakang: "color-emerald-50", minimum: 4.5, label: "status positif" },
  { depan: "color-emerald-700", belakang: "color-emerald-50", minimum: 4.5, label: "label positif" },
  { depan: "color-amber-900", belakang: "color-amber-50", minimum: 4.5, label: "status peringatan" },
  { depan: "color-red-800", belakang: "color-red-50", minimum: 4.5, label: "status bahaya" },

  // Batas kontrol dan cincin fokus.
  { depan: "ring", belakang: "background", minimum: 3, label: "cincin fokus / kanvas" },
  { depan: "input", belakang: "background", minimum: 3, label: "batas input / kanvas" },
  { depan: "gold", belakang: "background", minimum: 3, label: "garis kuningan / kanvas" },
];

let lulus = 0;
let gagal = 0;

for (const satu of pasangan) {
  const depan = token(satu.depan);
  const belakang = token(satu.belakang);
  const nilai = rasio(depan, belakang);
  if (nilai >= satu.minimum) {
    lulus += 1;
    console.log(
      `LULUS ${satu.label}: ${nilai.toFixed(2)}:1 (minimum ${satu.minimum}:1)`,
    );
  } else {
    gagal += 1;
    console.error(
      `GAGAL ${satu.label}: ${nilai.toFixed(2)}:1, minimum ${satu.minimum}:1`,
    );
  }
}

console.log(`\nkontrasWarna: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
