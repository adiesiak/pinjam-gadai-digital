/**
 * Uji validasi simulasi kalkulator yang dibawa ke formulir.
 * Run: bun src/lib/simulasiPengajuan.test.ts
 */
import { LOAN_LIMITS } from "./loan";
import { validasiSimulasiPengajuan } from "./simulasiPengajuan";

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

const harian = validasiSimulasiPengajuan({
  skema: "harian",
  pokok: 500_000,
  tenorHari: 28,
  tenorBulan: 3,
});
ok(harian?.skema === "harian", "skema harian dikenali");
ok(harian?.pokok === 500_000, "pokok harian dipertahankan");
ok(harian?.tenorHari === 28, "tenor harian dipertahankan");

const bulanan = validasiSimulasiPengajuan({
  skema: "bulanan",
  pokok: 2_000_000,
  tenorHari: 28,
  tenorBulan: 6,
});
ok(bulanan?.skema === "bulanan", "skema bulanan dikenali");
ok(bulanan?.tenorBulan === 6, "tenor bulanan dipertahankan");
ok(bulanan?.tenorHari === 30, "bulanan memakai tenor hari 30 untuk formulir");

ok(
  validasiSimulasiPengajuan({
    skema: "harian",
    pokok: LOAN_LIMITS.maxPokok + 1,
    tenorHari: 28,
    tenorBulan: 3,
  }) === null,
  "pokok harian di atas batas ditolak",
);
ok(
  validasiSimulasiPengajuan({
    skema: "bulanan",
    pokok: 2_000_000,
    tenorHari: 28,
    tenorBulan: 2,
  }) === null,
  "tenor bulanan yang tidak ditawarkan ditolak",
);
ok(
  validasiSimulasiPengajuan({
    skema: "bulanan",
    pokok: 11_000_000,
    tenorHari: 28,
    tenorBulan: 3,
  }) === null,
  "pokok bulanan di atas plafon platform ditolak",
);
ok(
  validasiSimulasiPengajuan({
    skema: "lain",
    pokok: 500_000,
    tenorHari: 28,
    tenorBulan: 3,
  }) === null,
  "skema asing ditolak",
);
ok(
  validasiSimulasiPengajuan({
    skema: "harian",
    pokok: 500_000.5,
    tenorHari: 28,
    tenorBulan: 3,
  }) === null,
  "pokok pecahan ditolak",
);

console.log(`simulasiPengajuan: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
