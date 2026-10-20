import {
  HAK_CIPTA_PINDAI,
  NAMA_ENTITAS_PINDAI,
  PENERBIT_KUITANSI,
  PENAFIAN_PINDAI,
} from "./branding";

function eq<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`${label}: dapat ${String(actual)}, harusnya ${String(expected)}`);
  }
}

eq("nama entitas", NAMA_ENTITAS_PINDAI, "PT Pindai Digital Solusindo");
eq(
  "baris hak cipta",
  HAK_CIPTA_PINDAI,
  "© 2026 PT Pindai Digital Solusindo. All Rights Reserved.",
);
eq(
  "penafian",
  PENAFIAN_PINDAI,
  "PINDAI adalah platform sistem informasi pembiayaan mikro berbasis teknologi yang dikembangkan oleh PT Pindai Digital Solusindo.",
);
eq("label penerbit kuitansi", PENERBIT_KUITANSI, "Publisher: PT Pindai Digital Solusindo");

console.log("branding.test: 4 lulus, 0 gagal");
