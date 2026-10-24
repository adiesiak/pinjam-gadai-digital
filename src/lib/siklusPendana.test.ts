/**
 * Uji siklus pendana 30 hari.
 * Run: bun src/lib/siklusPendana.test.ts
 *
 * Angka ditulis tangan dari kebijakan: imbal 30% dari pokok, biaya platform 5%
 * dari POKOK, satu pembayaran per siklus.
 */
import {
  HARI_MS,
  PERSEN_IMBAL_SIKLUS,
  PERSEN_POTONGAN_SIKLUS,
  SIKLUS_PENDANA_HARI,
  hitungSiklusPendana,
  jatuhTempoSiklus,
  labelStatusSiklus,
  sisaHariSiklus,
} from "./siklusPendana";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: seharusnya melempar, tetapi tidak`);
  } catch {
    passed += 1;
  }
}

eq(SIKLUS_PENDANA_HARI, 30, "siklus 30 hari");
eq(PERSEN_IMBAL_SIKLUS, 30, "imbal 30% per siklus");
eq(PERSEN_POTONGAN_SIKLUS, 5, "biaya 5% dari pokok");

const acuan = hitungSiklusPendana(1_000_000);
eq(acuan.pokok, 1_000_000, "pokok");
eq(acuan.imbal, 300_000, "imbal 30% dari pokok");
eq(acuan.potongan, 50_000, "biaya 5% dari POKOK (bukan dari uang kembali)");
eq(acuan.totalCair, 1_250_000, "total cair = pokok + imbal − biaya");
eq(acuan.jatuhTempoHari, 30, "jatuh tempo 30 hari");
eq(
  acuan.potongan + acuan.totalCair,
  1_300_000,
  "biaya + total cair = pokok + imbal",
);

// Pokok tidak bulat: kedua pembulatan ke bawah, tidak ada rupiah diciptakan.
const ganjil = hitungSiklusPendana(500_150);
eq(ganjil.imbal, 150_045, "imbal 30% dari 500.150");
eq(ganjil.potongan, 25_007, "5% dari 500.150 dibulatkan ke bawah");
eq(ganjil.totalCair, 625_188, "total cair 500.150 + 150.045 − 25.007");

for (const pokok of [100_000, 333_333, 1_000_000, 7_777_777, 50_000_000]) {
  const h = hitungSiklusPendana(pokok);
  eq(
    h.totalCair,
    pokok + h.imbal - h.potongan,
    `identitas total cair (pokok ${pokok})`,
  );
  eq(
    h.potongan + h.totalCair,
    pokok + h.imbal,
    `tidak ada rupiah hilang (pokok ${pokok})`,
  );
  eq(Number.isInteger(h.totalCair), true, `total cair bulat (pokok ${pokok})`);
  eq(
    h.totalCair > pokok,
    true,
    `pokok kembali utuh dan masih untung (pokok ${pokok})`,
  );
}

const mulai = Date.UTC(2026, 9, 24, 3, 0, 0);
eq(jatuhTempoSiklus(mulai), mulai + 30 * HARI_MS, "jatuh tempo = mulai + 30 hari");
eq(sisaHariSiklus(jatuhTempoSiklus(mulai), mulai), 30, "sisa 30 hari di awal");
eq(
  sisaHariSiklus(jatuhTempoSiklus(mulai), mulai + 29 * HARI_MS),
  1,
  "sisa 1 hari",
);
eq(sisaHariSiklus(jatuhTempoSiklus(mulai), jatuhTempoSiklus(mulai)), 0, "0 di hari jatuh tempo");
eq(
  sisaHariSiklus(jatuhTempoSiklus(mulai), jatuhTempoSiklus(mulai) + 5 * HARI_MS),
  -5,
  "negatif setelah lewat jatuh tempo",
);

eq(labelStatusSiklus("berjalan"), "Berjalan", "label berjalan");
eq(labelStatusSiklus("dicairkan"), "Dicairkan", "label dicairkan");
eq(labelStatusSiklus("dibatalkan"), "Dibatalkan", "label dibatalkan");

throws(() => hitungSiklusPendana(0), "pokok 0 ditolak");
throws(() => hitungSiklusPendana(-1), "pokok negatif ditolak");
throws(() => hitungSiklusPendana(1.5), "pokok pecahan ditolak");

console.log(`siklusPendana.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
