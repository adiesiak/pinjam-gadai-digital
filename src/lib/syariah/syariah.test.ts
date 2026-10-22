/** Run: bun src/lib/syariah/syariah.test.ts */
import { KELIPATAN_TIKET_PENDANA } from "../doorprize";
import {
  NISBAH_PENDANA_PERSEN,
  NISBAH_PLATFORM_PERSEN,
  bagiNisbah,
  floorPersen,
} from "./nisbah";
import { bagiHasilMurabahah, hargaJualMurabahah } from "./murabahah";
import {
  SIKLUS_UJRAH_RAHN_HARI,
  UJRAH_RAHN_PERSEN_PER_30_HARI,
  bagiHasilRahn,
} from "./rahn";
import { bagiHasilQardh, tiketQardh } from "./qardh";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: seharusnya melempar`);
  } catch {
    passed += 1;
  }
}

// ===== 1. Nisbah 85:15 dan pembulatan ke bawah =====
eq(NISBAH_PENDANA_PERSEN, 85, "porsi pendana 85%");
eq(NISBAH_PLATFORM_PERSEN, 15, "porsi platform 15%");
eq(floorPersen(1_000_000, 15), 150_000, "15% dari Rp1.000.000");
eq(floorPersen(333_333, 15), 49_999, "15% dibulatkan ke bawah, bukan 50.000");

{
  const nol = bagiNisbah(0);
  eq(nol.nisbahPendana, 0, "nilai nol: pendana nol");
  eq(nol.nisbahPlatform, 0, "nilai nol: platform nol");
}

// Invarian untuk deret nilai: tidak ada rupiah hilang, sisa ke pendana.
for (const nilai of [1, 7, 99, 1_001, 33_333, 1_000_001, 12_345_679]) {
  const bagi = bagiNisbah(nilai);
  eq(
    bagi.nisbahPendana + bagi.nisbahPlatform,
    nilai,
    `nisbah ${nilai}: pendana + platform = nilai`,
  );
  ok(
    bagi.nisbahPendana >= nilai - Math.ceil((nilai * 15) / 100),
    `nisbah ${nilai}: pendana menerima sisa pembulatan`,
  );
}

// ===== 2. Murabahah: margin = harga jual - harga pokok =====
{
  const akad = bagiHasilMurabahah({
    hargaPokok: 10_000_000,
    hargaJual: 11_500_000,
  });
  eq(akad.marginTotal, 1_500_000, "margin total Rp1.500.000");
  eq(akad.nisbahPlatform, 225_000, "platform 15% dari margin");
  eq(akad.nisbahPendana, 1_275_000, "pendana 85% dari margin");
  eq(akad.pendanaTerima, 11_275_000, "pendana menerima pokok + nisbah");
  eq(akad.platformTerima, 225_000, "platform menerima nisbah saja");
  eq(
    akad.pendanaTerima + akad.platformTerima,
    akad.hargaJual,
    "pendana + platform = harga jual",
  );
  eq(
    akad.nisbahPendana + akad.nisbahPlatform,
    akad.marginTotal,
    "nisbah pendana + platform = margin",
  );
}

{
  // Sisa pembulatan wajib ke pendana, bukan ke platform.
  const akad = bagiHasilMurabahah({
    hargaPokok: 10_000_000,
    hargaJual: 11_000_001,
  });
  eq(akad.marginTotal, 1_000_001, "margin ganjil");
  eq(akad.nisbahPlatform, 150_000, "15% margin ganjil dibulatkan ke bawah");
  eq(akad.nisbahPendana, 850_001, "sisa pecahan ke pendana");
  eq(
    akad.pendanaTerima + akad.platformTerima,
    akad.hargaJual,
    "harga jual utuh pada margin ganjil",
  );
}

{
  // Harga jual sama dengan harga pokok: margin nol, tidak ada bagi hasil.
  const akad = bagiHasilMurabahah({
    hargaPokok: 2_500_000,
    hargaJual: 2_500_000,
  });
  eq(akad.marginTotal, 0, "margin nol saat harga jual = harga pokok");
  eq(akad.nisbahPendana, 0, "pendana tidak mendapat margin");
  eq(akad.pendanaTerima, 2_500_000, "pokok kembali utuh");
}

throws(
  () => bagiHasilMurabahah({ hargaPokok: 3_000_000, hargaJual: 2_999_999 }),
  "harga jual di bawah harga pokok ditolak",
);
throws(() => hargaJualMurabahah(0, 15), "harga pokok nol ditolak");
throws(() => hargaJualMurabahah(1_000_000.5, 15), "harga pokok pecahan ditolak");

eq(
  hargaJualMurabahah(10_000_000, 15),
  11_500_000,
  "harga jual dari margin 15%",
);
eq(
  hargaJualMurabahah(333_333, 15),
  383_332,
  "margin harga jual dibulatkan ke bawah",
);

// ===== 3. Rahn: ujrah 2% taksiran per 30 hari, pokok 100% =====
eq(UJRAH_RAHN_PERSEN_PER_30_HARI, 2, "ujrah Rahn 2% per 30 hari");
eq(SIKLUS_UJRAH_RAHN_HARI, 30, "siklus ujrah 30 hari");

{
  const akad = bagiHasilRahn({
    nilaiTaksiran: 5_000_000,
    pokokGadai: 4_000_000,
    tenorHari: 30,
  });
  eq(akad.jumlahSiklus, 1, "30 hari = satu siklus");
  eq(akad.ujrahPerSiklus, 100_000, "ujrah 2% dari taksiran");
  eq(akad.ujrahTotal, 100_000, "ujrah satu siklus");
  eq(akad.nisbahPlatform, 15_000, "platform 15% dari ujrah");
  eq(akad.nisbahPendana, 85_000, "pendana 85% dari ujrah");
  eq(akad.pendanaTerima, 4_085_000, "pokok gadai + nisbah pendana");
  eq(akad.totalKewajiban, 4_100_000, "pokok + seluruh ujrah");
  eq(
    akad.pendanaTerima + akad.platformTerima,
    akad.totalKewajiban,
    "pendana + platform = kewajiban peminjam",
  );
}

{
  const akad = bagiHasilRahn({
    nilaiTaksiran: 5_000_000,
    pokokGadai: 4_000_000,
    tenorHari: 90,
  });
  eq(akad.jumlahSiklus, 3, "90 hari = tiga siklus");
  eq(akad.ujrahTotal, 300_000, "ujrah tiga siklus");
  eq(akad.nisbahPlatform, 45_000, "platform 15% dari ujrah 90 hari");
  eq(akad.nisbahPendana, 255_000, "pendana 85% dari ujrah 90 hari");
  eq(akad.pendanaTerima, 4_255_000, "pokok + nisbah ujrah 90 hari");
  eq(akad.totalKewajiban, 4_300_000, "kewajiban peminjam 90 hari");
  eq(
    akad.pendanaTerima + akad.platformTerima,
    akad.totalKewajiban,
    "invarian Rahn 90 hari",
  );
}

{
  // Taksiran ganjil: ujrah dan nisbah dibulatkan ke bawah, sisa ke pendana.
  const akad = bagiHasilRahn({
    nilaiTaksiran: 333_333,
    pokokGadai: 300_000,
    tenorHari: 30,
  });
  eq(akad.ujrahPerSiklus, 6_666, "ujrah 2% taksiran ganjil, floor");
  eq(akad.nisbahPlatform, 999, "15% ujrah ganjil, floor");
  eq(akad.nisbahPendana, 5_667, "sisa ujrah ke pendana");
  eq(
    akad.nisbahPendana + akad.nisbahPlatform,
    akad.ujrahTotal,
    "ujrah utuh pada taksiran ganjil",
  );
}

throws(
  () =>
    bagiHasilRahn({ nilaiTaksiran: 2_000_000, pokokGadai: 2_000_001 }),
  "pokok gadai di atas taksiran ditolak",
);
throws(
  () =>
    bagiHasilRahn({
      nilaiTaksiran: 2_000_000,
      pokokGadai: 1_500_000,
      tenorHari: 45,
    }),
  "tenor Rahn di luar kelipatan 30 ditolak",
);
throws(
  () => bagiHasilRahn({ nilaiTaksiran: 0, pokokGadai: 0 }),
  "taksiran nol ditolak",
);

// ===== 4. Qardh: margin 0, pokok 100%, tiket per Rp1 juta =====
{
  eq(KELIPATAN_TIKET_PENDANA, 1_000_000, "kelipatan tiket Rp1.000.000");
  const akad = bagiHasilQardh(2_500_000);
  eq(akad.marginTotal, 0, "Qardh tanpa margin");
  eq(akad.pendanaTerima, 2_500_000, "pokok Qardh kembali 100%");
  eq(akad.platformTerima, 0, "platform tidak mengambil bagian Qardh");
  eq(akad.tiketDoorprize, 2, "Rp2,5 juta = 2 tiket");
  eq(akad.kelipatanTiket, 1_000_000, "keterangan kelipatan tiket");
}

eq(tiketQardh(999_999), 0, "di bawah Rp1 juta belum dapat tiket");
eq(tiketQardh(1_000_000), 1, "tepat Rp1 juta = 1 tiket");
eq(tiketQardh(5_999_999), 5, "sisa di bawah kelipatan tidak menambah tiket");

throws(() => bagiHasilQardh(0), "pokok Qardh nol ditolak");
throws(() => tiketQardh(1_000_000.5), "pokok Qardh pecahan ditolak");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`syariah: ${passed} lulus`);
