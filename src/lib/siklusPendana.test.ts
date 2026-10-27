/**
 * Uji siklus pendana 30 hari.
 * Run: bun src/lib/siklusPendana.test.ts
 *
 * Angka ditulis tangan dari kebijakan: imbal 30% dari pokok, marjin dibagi
 * 47 : 13 (porsi platform 13/60), satu pembayaran per siklus.
 */
import {
  HARI_MS,
  PERSEN_IMBAL_SIKLUS,
  SIKLUS_PENDANA_HARI,
  hitungSiklusPendana,
  jatuhTempoSiklus,
  labelPilihanSiklus,
  labelStatusSiklus,
  pokokPutarUlang,
  potonganPutaran,
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

const acuan = hitungSiklusPendana(1_000_000);
eq(acuan.pokok, 1_000_000, "pokok");
eq(acuan.imbal, 300_000, "imbal 30% dari pokok");
eq(acuan.potongan, 65_000, "porsi platform 13/60 marjin Rp300.000");
eq(acuan.totalCair, 1_235_000, "total cair = pokok + porsi pendana");
eq(acuan.jatuhTempoHari, 30, "jatuh tempo 30 hari");
eq(
  acuan.potongan + acuan.totalCair,
  1_300_000,
  "biaya + total cair = pokok + imbal",
);

// Pokok tidak bulat: kedua pembulatan ke bawah, tidak ada rupiah diciptakan.
const ganjil = hitungSiklusPendana(500_150);
eq(ganjil.imbal, 150_045, "imbal 30% dari 500.150");
eq(ganjil.potongan, 32_509, "13/60 marjin 150.045 dibulatkan ke bawah");
eq(ganjil.totalCair, 617_686, "total cair 500.150 + 150.045 − 32.509");

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
eq(
  labelStatusSiklus("diputar_ulang"),
  "Diputar ulang",
  "label diputar ulang",
);
eq(labelStatusSiklus("dibatalkan"), "Dibatalkan", "label dibatalkan");

// Pilihan saat jatuh tempo: bawaan cairkan bila pendana tidak memilih.
eq(labelPilihanSiklus(undefined), "Cairkan ke rekening", "belum memilih = cairkan");
eq(labelPilihanSiklus("cairkan"), "Cairkan ke rekening", "pilihan cairkan");
eq(
  labelPilihanSiklus("putar_ulang"),
  "Putar lagi 30 hari",
  "pilihan putar ulang",
);

// Putar ulang: seluruh hak siklus menjadi pokok baru, tanpa rupiah hilang.
eq(pokokPutarUlang(acuan.totalCair), 1_235_000, "pokok baru = total cair lama");
// 1.235.000 + 370.500 − 80.275 = 1.525.225.
const lanjutan = hitungSiklusPendana(pokokPutarUlang(acuan.totalCair));
eq(lanjutan.totalCair, 1_525_225, "total cair siklus kedua");
eq(
  lanjutan.totalCair > acuan.totalCair,
  true,
  "siklus kedua lebih besar dari siklus pertama",
);
// Putaran modal: biaya mengikuti proporsi pokok siklus, hak pendana tidak ikut.
eq(potonganPutaran(50_000, 1_000_000, 1_000_000), 50_000, "putaran penuh menagih biaya penuh");
eq(potonganPutaran(50_000, 1_000_000, 500_000), 25_000, "putaran separuh menagih separuh biaya");
eq(
  potonganPutaran(50_000, 1_000_000, 333_333),
  16_666,
  "biaya putaran ganjil dibulatkan ke bawah",
);
eq(potonganPutaran(50_000, 0, 100_000), 0, "pokok siklus nol tidak menagih biaya");
throws(() => potonganPutaran(50_000, 1_000_000, 0), "putaran 0 ditolak");
throws(() => potonganPutaran(50_000, 1_000_000, 1.5), "putaran pecahan ditolak");

throws(() => pokokPutarUlang(0), "putar ulang pokok 0 ditolak");
throws(() => pokokPutarUlang(1.5), "putar ulang pokok pecahan ditolak");

throws(() => hitungSiklusPendana(0), "pokok 0 ditolak");
throws(() => hitungSiklusPendana(-1), "pokok negatif ditolak");
throws(() => hitungSiklusPendana(1.5), "pokok pecahan ditolak");

console.log(`siklusPendana.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
