/** Run: bun src/lib/restrukturisasi.test.ts */
import {
  BATAS_RESTRUKTURISASI,
  jatuhTempoSetelahPerpanjangan,
  validasiAlasanRestrukturisasi,
  validasiPerpanjanganTenor,
} from "./restrukturisasi";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const naik = validasiPerpanjanganTenor({ tenorLamaHari: 30, tambahanHari: 14 });
ok(naik.ok, "perpanjangan normal diterima");
if (naik.ok) ok(naik.tenorBaruHari === 44, "tenor baru dihitung dari tenor lama + tambahan");

const nol = validasiPerpanjanganTenor({ tenorLamaHari: 30, tambahanHari: 0 });
ok(!nol.ok, "tambahan nol ditolak");
if (!nol.ok) ok(nol.alasan.includes(String(BATAS_RESTRUKTURISASI.minTambahan)), "alasan batas minimum");

const terlaluBanyak = validasiPerpanjanganTenor({ tenorLamaHari: 30, tambahanHari: 120 });
ok(!terlaluBanyak.ok, "tambahan di atas batas ditolak");

const lewatBatas = validasiPerpanjanganTenor({ tenorLamaHari: 350, tambahanHari: 30 });
ok(!lewatBatas.ok, "tenor baru melewati batas ditolak");
if (!lewatBatas.ok) ok(lewatBatas.alasan.includes("melewati batas"), "alasan batas tenor");

const tenorRusak = validasiPerpanjanganTenor({ tenorLamaHari: Number.NaN, tambahanHari: 7 });
ok(!tenorRusak.ok, "tenor lama rusak ditolak");

const pecahan = validasiPerpanjanganTenor({ tenorLamaHari: 30, tambahanHari: 7.5 });
ok(!pecahan.ok, "tambahan pecahan ditolak");

const alasanPendek = validasiAlasanRestrukturisasi("coba");
ok(!alasanPendek.ok, "alasan terlalu pendek ditolak");

const alasanPanjang = validasiAlasanRestrukturisasi("x".repeat(600));
ok(!alasanPanjang.ok, "alasan terlalu panjang ditolak");

const alasanSah = validasiAlasanRestrukturisasi("  Nasabah kehilangan penghasilan bulan ini.  ");
ok(alasanSah.ok, "alasan sah diterima");

const HARI = 86_400_000;
const didanai = Date.UTC(2026, 8, 1);
ok(
  jatuhTempoSetelahPerpanjangan(didanai, 44) === didanai + 44 * HARI,
  "jatuh tempo memakai tambahan hari penuh",
);

console.log(`restrukturisasi: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
