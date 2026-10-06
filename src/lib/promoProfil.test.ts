/**
 * Uji tata letak aset profil WhatsApp PINDAI: foto profil wajib utuh saat
 * dipotong bulat, dan konten sampul wajib berada di area aman (foto profil
 * dapat menutupi bagian bawah sampul). Murni fungsi angka — tidak menyentuh
 * Canvas — sehingga bisa jalan sebagai skrip biasa seperti uji lib lainnya.
 */
import {
  ASET_PROFIL,
  BACKGROUND_BATAS_AMAN,
  BACKGROUND_KONTEN_PUSAT_Y,
  BACKGROUND_TINGGI,
  FOTO_PROFIL_PUSAT,
  KOTAK_KONTEN_BACKGROUND,
  KOTAK_KONTEN_FOTO_PROFIL,
  LANDASAN_BACKGROUND,
  LANDASAN_FOTO_PROFIL,
  RADIUS_AMAN_BULAT,
  TATA_BACKGROUND,
  TATA_FOTO_PROFIL,
  setengahLebarAman,
} from "./promoProfil";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}\n   harap: ${expected}\n   dapat: ${actual}`);
  }
}

function ok(label: string, syarat: boolean) {
  if (syarat) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

function dekat(actual: number, expected: number, label: string, toleransi = 1e-6) {
  ok(`${label} (${actual} ≈ ${expected})`, Math.abs(actual - expected) <= toleransi);
}

/** Jarak terjauh dari pusat potongan bulat ke sudut-sudut sebuah kotak. */
function sudutTerjauh(
  kiri: number,
  kanan: number,
  atas: number,
  bawah: number,
): number {
  let jauh = 0;
  for (const [x, y] of [
    [kiri, atas],
    [kanan, atas],
    [kiri, bawah],
    [kanan, bawah],
  ] as const) {
    jauh = Math.max(jauh, Math.hypot(x - FOTO_PROFIL_PUSAT, y - FOTO_PROFIL_PUSAT));
  }
  return jauh;
}

// ---- setengahLebarAman: geometri lingkaran ----
dekat(setengahLebarAman(100, 0), 100, "di pusat, setengah-lebar = radius");
dekat(setengahLebarAman(100, 60), 80, "teorema Pythagoras 3-4-5");
dekat(setengahLebarAman(100, 100), 0, "tepat di tepi, tidak ada sisa lebar");
eq(setengahLebarAman(100, 150), 0, "di luar lingkaran tidak negatif");
eq(setengahLebarAman(0, 0), 0, "radius nol aman");

// ---- Foto profil: seluruh konten di dalam lingkaran aman ----
const radiusAman = 1080 * RADIUS_AMAN_BULAT;
const { kiri, kanan, atas, bawah } = KOTAK_KONTEN_FOTO_PROFIL;
const jarakTerjauh = sudutTerjauh(kiri, kanan, atas, bawah);
ok(
  `seluruh sudut konten foto profil di dalam lingkaran aman (${jarakTerjauh.toFixed(1)} ≤ ${radiusAman})`,
  jarakTerjauh <= radiusAman,
);
ok(
  `cincin segel foto profil di dalam lingkaran aman (${TATA_FOTO_PROFIL.cincin} ≤ ${radiusAman})`,
  TATA_FOTO_PROFIL.cincin <= radiusAman,
);
ok(
  "konten foto profil mendekati pusat kanvas",
  Math.abs((atas + bawah) / 2 - FOTO_PROFIL_PUSAT) <= 20,
);

// ---- Foto profil: skala besar + panggung yang tetap aman ----
const { emblema, judul, rule, eyebrow } = TATA_FOTO_PROFIL;
ok(
  `lambang mengisi porsi besar potongan bulat (${((emblema.sisi / (2 * radiusAman)) * 100).toFixed(0)}% diameter)`,
  emblema.sisi >= 2 * radiusAman * 0.32,
);
ok(
  "lambang berada di tengah horizontal kanvas",
  Math.abs(emblema.x + emblema.sisi / 2 - FOTO_PROFIL_PUSAT) <= 1,
);

const landasanBawah = LANDASAN_FOTO_PROFIL.atas + LANDASAN_FOTO_PROFIL.tinggi;
const landasanTerjauh = sudutTerjauh(
  LANDASAN_FOTO_PROFIL.cx - LANDASAN_FOTO_PROFIL.lebar / 2,
  LANDASAN_FOTO_PROFIL.cx + LANDASAN_FOTO_PROFIL.lebar / 2,
  LANDASAN_FOTO_PROFIL.atas,
  landasanBawah,
);
ok(
  `landasan foto profil di dalam lingkaran aman (${landasanTerjauh.toFixed(1)} ≤ ${radiusAman})`,
  landasanTerjauh <= radiusAman,
);
ok(
  "landasan menindih dasar lambang (brankas berdiri di atasnya)",
  LANDASAN_FOTO_PROFIL.atas < emblema.y + emblema.sisi * 0.91,
);
ok("landasan tidak menutupi judul", landasanBawah < judul.baseline);

const ruleTerjauh = Math.hypot(
  rule.lebar / 2,
  Math.abs(rule.y + rule.tinggi / 2 - FOTO_PROFIL_PUSAT),
);
ok(
  `rule kuningan di dalam lingkaran aman (${ruleTerjauh.toFixed(1)} ≤ ${radiusAman})`,
  ruleTerjauh <= radiusAman,
);
ok(
  "rule kuningan duduk di antara judul dan eyebrow",
  rule.y > judul.baseline && rule.y + rule.tinggi < eyebrow.baseline,
);

// ---- Background: konten penting berhenti sebelum area tertutup foto profil ----
ok(
  `konten sampul berakhir sebelum batas area aman (${KOTAK_KONTEN_BACKGROUND.bawah} < ${BACKGROUND_BATAS_AMAN})`,
  KOTAK_KONTEN_BACKGROUND.bawah < BACKGROUND_BATAS_AMAN,
);
ok(
  `pusat konten sampul di paruh atas kanvas (${BACKGROUND_KONTEN_PUSAT_Y} < ${BACKGROUND_TINGGI / 2})`,
  BACKGROUND_KONTEN_PUSAT_Y < BACKGROUND_TINGGI / 2,
);

// ---- Background: band bawah terdesain, bukan ruang mati ----
const { band, pita } = TATA_BACKGROUND;
eq(band.tepi, BACKGROUND_BATAS_AMAN, "tepi band = batas area aman");
ok(
  `band dimulai setelah blok konten (${KOTAK_KONTEN_BACKGROUND.bawah} < ${band.tepi})`,
  KOTAK_KONTEN_BACKGROUND.bawah < band.tepi,
);
ok(
  `pita kata berada di dalam band (${band.garisAtas} < ${pita.y} < ${band.garisBawah})`,
  pita.y > band.garisAtas && pita.y < band.garisBawah,
);
ok(
  `pita kata tidak menyentuh tepi bawah kanvas (${pita.y + pita.fs} < ${BACKGROUND_TINGGI})`,
  pita.y + pita.fs < BACKGROUND_TINGGI,
);
ok(
  "band cukup tinggi untuk beberapa baris buku besar",
  (BACKGROUND_TINGGI - band.tepi) / band.jarakBuku >= 8,
);
ok(
  "landasan sampul berada di dalam kotak konten",
  LANDASAN_BACKGROUND.atas >= KOTAK_KONTEN_BACKGROUND.atas &&
    LANDASAN_BACKGROUND.atas + LANDASAN_BACKGROUND.tinggi < KOTAK_KONTEN_BACKGROUND.bawah,
);

// ---- Metadata aset ----
const foto = ASET_PROFIL.find((a) => a.id === "foto-profil");
const background = ASET_PROFIL.find((a) => a.id === "background-profil");
ok("aset foto profil tersedia", Boolean(foto));
ok("aset background profil tersedia", Boolean(background));

if (foto) {
  eq(foto.canvas[0], 1080, "foto profil 1080 lebar");
  eq(foto.canvas[0], foto.canvas[1], "foto profil rasio 1:1");
  ok("nama berkas foto profil berakhiran .png", foto.berkas.endsWith(".png"));
}
if (background) {
  eq(background.canvas[0] / background.canvas[1], 16 / 9, "background rasio 16:9");
  ok("background minimal selebar rekomendasi WhatsApp (1211)", background.canvas[0] >= 1211);
  ok("nama berkas background berakhiran .png", background.berkas.endsWith(".png"));
}

const idUnik = new Set(ASET_PROFIL.map((a) => a.id));
eq(idUnik.size, ASET_PROFIL.length, "id aset unik");
const berkasUnik = new Set(ASET_PROFIL.map((a) => a.berkas));
eq(berkasUnik.size, ASET_PROFIL.length, "nama berkas unik");

console.log(`promoProfil tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
