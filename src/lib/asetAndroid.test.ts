/**
 * Uji tata letak aset aplikasi Android — murni angka, tanpa Canvas.
 * Run: bun src/lib/asetAndroid.test.ts
 *
 * Yang dijaga di sini adalah aturan teknis yang kalau dilanggar membuat aset
 * ditolak atau terpotong di perangkat: ukuran kanvas per slot Play, kewajiban
 * latar penuh (tanpa transparansi), zona aman adaptive icon, lingkaran aman
 * splash Android 12, dan kelengkapan panduan pasang.
 */
import {
  ASET_ANDROID,
  KANVAS_ADAPTIVE,
  KANVAS_ANDROID12,
  KANVAS_NOTIFIKASI,
  KANVAS_PLAYSTORE,
  KATEGORI_ASET_ANDROID,
  KOTAK_LAMBANG_ADAPTIVE,
  PANDUAN_ANDROID,
  PITA_BAWAH_RASIO,
  SISI_LAMBANG_ADAPTIVE,
  SISI_LAMBANG_NOTIFIKASI,
  SISI_LAMBANG_PLAYSTORE,
  SPLASH_ANDROID12,
  TATA_SPLASH,
  TATA_WORDMARK,
  ZONA_AMAN_ADAPTIVE,
  ambilAsetAndroid,
  asetAndroidPerKategori,
  type KategoriAsetAndroid,
} from "./asetAndroid";
import { TAGLINE } from "./promoPosters";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}\n   harap: ${String(expected)}\n   dapat: ${String(actual)}`);
  }
}

function ok(label: string, syarat: boolean): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

/** Jarak titik ke pusat (untuk uji zona aman). */
function jarak(x: number, y: number, pusat: number): number {
  return Math.hypot(x - pusat, y - pusat);
}

// ---------------------------------------------------------------------------
// Kelengkapan daftar aset.
// ---------------------------------------------------------------------------

ok(`jumlah aset wajar (${ASET_ANDROID.length})`, ASET_ANDROID.length >= 10);
eq(new Set(ASET_ANDROID.map((a) => a.id)).size, ASET_ANDROID.length, "id aset unik");
eq(new Set(ASET_ANDROID.map((a) => a.berkas)).size, ASET_ANDROID.length, "nama berkas unik");

const kategoriSah = new Set<string>(KATEGORI_ASET_ANDROID);
for (const a of ASET_ANDROID) {
  ok(`"${a.id}" punya label`, a.label.trim() !== "");
  ok(`"${a.id}" punya keterangan`, a.keterangan.trim().length >= 40);
  ok(`"${a.id}" punya tujuan berkas`, a.tujuan.trim() !== "");
  ok(`"${a.id}" punya catatan teknis`, a.catatan.trim().length >= 20);
  ok(`"${a.id}" berkas PNG`, a.berkas.endsWith(".png"));
  ok(`"${a.id}" kategori dikenal (${a.kategori})`, kategoriSah.has(a.kategori));
  ok(
    `"${a.id}" penanda teks konsisten (ikon ${a.kategori === "Ikon" ? "tanpa" : "boleh"} teks)`,
    a.kategori === "Ikon" ? a.berteks === false : true,
  );
  const [w, h] = a.canvas;
  ok(`"${a.id}" ukuran kanvas bilangan bulat positif (${w}×${h})`, Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0);
  ok(`"${a.id}" ukuran kanvas muat (≤ 2048 px)`, w <= 2048 && h <= 2048);
}

// Kategori mengelompokkan ulang SEMUA aset, tanpa ada yang hilang atau ganda.
const perKategori = asetAndroidPerKategori();
eq(perKategori.length, KATEGORI_ASET_ANDROID.length, "setiap kategori punya grup");
eq(
  perKategori.reduce((n, g) => n + g.daftar.length, 0),
  ASET_ANDROID.length,
  "grup kategori mencakup seluruh aset",
);
for (const [i, g] of perKategori.entries()) {
  eq(g.kategori, KATEGORI_ASET_ANDROID[i], `urutan kategori #${i}`);
  ok(`kategori "${g.kategori}" tidak kosong`, g.daftar.length > 0);
}

// `ambilAsetAndroid` hidup untuk id yang ada dan melempar untuk yang tidak.
eq(ambilAsetAndroid("ikon-playstore").id, "ikon-playstore", "ambilAsetAndroid menemukan aset");
{
  let galat = false;
  try {
    ambilAsetAndroid("tidak-ada" as never);
  } catch {
    galat = true;
  }
  ok("ambilAsetAndroid melempar untuk id tak dikenal", galat);
}

// ---------------------------------------------------------------------------
// Aturan Play Store: dua slot ini WAJIB latar penuh tanpa transparansi.
// ---------------------------------------------------------------------------

const playstore = ambilAsetAndroid("ikon-playstore");
eq(playstore.canvas[0], KANVAS_PLAYSTORE, "ikon Play Store 512 px");
eq(playstore.canvas[1], KANVAS_PLAYSTORE, "ikon Play Store persegi");
ok("ikon Play Store latar penuh (tanpa alpha)", playstore.latarPenuh);
ok(
  "lambang ikon Play Store tidak melewati tepi",
  SISI_LAMBANG_PLAYSTORE + 2 * ((KANVAS_PLAYSTORE - SISI_LAMBANG_PLAYSTORE) / 2) === KANVAS_PLAYSTORE &&
    (KANVAS_PLAYSTORE - SISI_LAMBANG_PLAYSTORE) / 2 >= 60,
);

const feature = ambilAsetAndroid("feature-graphic");
eq(feature.canvas[0], 1024, "feature graphic lebar 1024");
eq(feature.canvas[1], 500, "feature graphic tinggi 500");
ok("feature graphic latar penuh (tanpa alpha)", feature.latarPenuh);

const tanpaAlpha = ASET_ANDROID.filter((a) => a.latarPenuh).map((a) => a.id).sort();
eq(
  tanpaAlpha.join(","),
  ["feature-graphic", "ikon-adaptive-background", "ikon-playstore", "splash-lanskap", "splash-potret"].sort().join(","),
  "hanya aset yang butuh latar penuh yang ditandai latarPenuh",
);

// ---------------------------------------------------------------------------
// Adaptive icon: lambang wajib di dalam lingkaran aman 66dp.
// ---------------------------------------------------------------------------

const foreground = ambilAsetAndroid("ikon-adaptive-foreground");
eq(foreground.canvas[0], KANVAS_ADAPTIVE, "kanvas adaptive icon 432 px");
eq(foreground.canvas[1], KANVAS_ADAPTIVE, "kanvas adaptive icon persegi");
ok("lapisan lambang transparan", !foreground.latarPenuh);

const sudutAdaptive: Array<[number, number, string]> = [
  [KOTAK_LAMBANG_ADAPTIVE.kiri, KOTAK_LAMBANG_ADAPTIVE.atas, "kiri-atas"],
  [KOTAK_LAMBANG_ADAPTIVE.kanan, KOTAK_LAMBANG_ADAPTIVE.atas, "kanan-atas"],
  [KOTAK_LAMBANG_ADAPTIVE.kiri, KOTAK_LAMBANG_ADAPTIVE.bawah, "kiri-bawah"],
  [KOTAK_LAMBANG_ADAPTIVE.kanan, KOTAK_LAMBANG_ADAPTIVE.bawah, "kanan-bawah"],
];
for (const [x, y, nama] of sudutAdaptive) {
  const d = jarak(x, y, ZONA_AMAN_ADAPTIVE.pusat);
  ok(
    `lambang adaptive sudut ${nama} di dalam zona aman (${d.toFixed(1)} ≤ ${ZONA_AMAN_ADAPTIVE.radius})`,
    d <= ZONA_AMAN_ADAPTIVE.radius,
  );
}
eq(SISI_LAMBANG_ADAPTIVE, KOTAK_LAMBANG_ADAPTIVE.kanan - KOTAK_LAMBANG_ADAPTIVE.kiri, "kotak lambang = sisi konstanta");
ok(
  "kotak lambang terpusat di kanvas adaptive",
  KOTAK_LAMBANG_ADAPTIVE.kiri === KANVAS_ADAPTIVE - KOTAK_LAMBANG_ADAPTIVE.kanan,
);

// ---------------------------------------------------------------------------
// Ikon notifikasi: putih ber-alpha, dengan margin cukup.
// ---------------------------------------------------------------------------

const notifikasi = ambilAsetAndroid("ikon-notifikasi");
eq(notifikasi.canvas[0], KANVAS_NOTIFIKASI, "kanvas ikon notifikasi 96 px");
ok("ikon notifikasi transparan", !notifikasi.latarPenuh);
{
  const margin = (KANVAS_NOTIFIKASI - SISI_LAMBANG_NOTIFIKASI) / 2;
  ok(`margin ikon notifikasi aman (${margin} px ≥ 8)`, margin >= 8);
  ok("lambang notifikasi tidak melewati kanvas", SISI_LAMBANG_NOTIFIKASI + margin * 2 === KANVAS_NOTIFIKASI);
}

// ---------------------------------------------------------------------------
// Splash: dua orientasi, dan Android 12 dengan lingkaran aman.
// ---------------------------------------------------------------------------

const potret = ambilAsetAndroid("splash-potret");
const lanskap = ambilAsetAndroid("splash-lanskap");
eq(potret.canvas[0], 1080, "splash potret lebar 1080");
eq(potret.canvas[1], 1920, "splash potret tinggi 1920");
eq(lanskap.canvas[0], 1920, "splash lanskap lebar 1920");
eq(lanskap.canvas[1], 1080, "splash lanskap tinggi 1080");
ok("splash potret lebih tinggi daripada lebar", potret.canvas[1] > potret.canvas[0]);
ok("splash lanskap lebih lebar daripada tinggi", lanskap.canvas[0] > lanskap.canvas[1]);

for (const [nama, tata] of [
  ["potret", TATA_SPLASH.potret],
  ["lanskap", TATA_SPLASH.lanskap],
] as const) {
  const badgeKiri = tata.lebar / 2 - tata.sisiBadge / 2;
  const badgeBawah = tata.pusatBadgeY + tata.sisiBadge / 2;
  ok(`splash ${nama}: badge muat di kanvas`, badgeKiri >= 0 && badgeBawah <= tata.tinggi);
  ok(`splash ${nama}: badge tidak melewati rule`, badgeBawah < tata.ruleY);
  ok(`splash ${nama}: judul di atas rule`, tata.ruleY - tata.judulFs * 0.55 > badgeBawah);
  ok(`splash ${nama}: tagline masih di dalam kanvas`, tata.taglineBaseline < tata.tinggi);
  ok(`splash ${nama}: rule di dalam kanvas`, tata.ruleY < tata.tinggi);
  // Pita kuningan bawah tidak boleh menutupi teks terakhir.
  ok(
    `splash ${nama}: tagline di atas pita kuningan bawah`,
    tata.taglineBaseline < tata.tinggi * (1 - PITA_BAWAH_RASIO),
  );
  ok(
    `splash ${nama}: ruang bawah terisi pita (${Math.round(tata.tinggi * PITA_BAWAH_RASIO)} px)`,
    Math.round(tata.tinggi * PITA_BAWAH_RASIO) >= 48,
  );
}

const android12 = ambilAsetAndroid("splash-android12");
eq(android12.canvas[0], KANVAS_ANDROID12, "kanvas ikon splash Android 12 = 1152 px");
eq(android12.canvas[1], KANVAS_ANDROID12, "kanvas Android 12 persegi");
ok("ikon splash Android 12 transparan", !android12.latarPenuh);
// Cakram 192dp (@4x = 768 px) di kanvas 288dp (@4x = 1152 px): sisa 48dp
// margin, yang memang dipakai sistem untuk ruang napas sebelum dipotong bulat.
eq(
  SPLASH_ANDROID12.radiusLingkaran * 2,
  768,
  "diameter cakram splash Android 12 = 192dp",
);
ok(
  "cakram splash Android 12 muat di kanvas dengan margin 48dp",
  SPLASH_ANDROID12.pusat + SPLASH_ANDROID12.radiusLingkaran + 192 === KANVAS_ANDROID12 &&
    SPLASH_ANDROID12.pusat - SPLASH_ANDROID12.radiusLingkaran === 192,
);
{
  const setengah = SPLASH_ANDROID12.sisiBadge / 2;
  const sudut: Array<[number, number, string]> = [
    [SPLASH_ANDROID12.pusat - setengah, SPLASH_ANDROID12.pusat - setengah, "kiri-atas"],
    [SPLASH_ANDROID12.pusat + setengah, SPLASH_ANDROID12.pusat - setengah, "kanan-atas"],
    [SPLASH_ANDROID12.pusat - setengah, SPLASH_ANDROID12.pusat + setengah, "kiri-bawah"],
    [SPLASH_ANDROID12.pusat + setengah, SPLASH_ANDROID12.pusat + setengah, "kanan-bawah"],
  ];
  for (const [x, y, nama] of sudut) {
    const d = jarak(x, y, SPLASH_ANDROID12.pusat);
    ok(
      `splash Android 12 sudut ${nama} di dalam lingkaran aman (${d.toFixed(1)} ≤ ${SPLASH_ANDROID12.radiusAmanKonten})`,
      d <= SPLASH_ANDROID12.radiusAmanKonten,
    );
  }
}

// ---------------------------------------------------------------------------
// Wordmark & logo.
// ---------------------------------------------------------------------------

const terang = ambilAsetAndroid("wordmark-terang");
const gelap = ambilAsetAndroid("wordmark-gelap");
eq(terang.canvas[0], TATA_WORDMARK.lebar, "wordmark lebar sesuai tata letak");
eq(gelap.canvas[1], TATA_WORDMARK.tinggi, "wordmark tinggi sesuai tata letak");
ok("wordmark terang transparan", !terang.latarPenuh);
ok("wordmark gelap transparan", !gelap.latarPenuh);
ok(
  "badge wordmark muat di kanvas",
  TATA_WORDMARK.badgeX + TATA_WORDMARK.sisiBadge < TATA_WORDMARK.teksX,
);
ok(
  "teks wordmark di atas badge, bukan menumpuknya",
  TATA_WORDMARK.judulBaseline > TATA_WORDMARK.badgeY + TATA_WORDMARK.sisiBadge * 0.1,
);
ok(
  "tagline wordmark masih di dalam kanvas",
  TATA_WORDMARK.taglineBaseline < TATA_WORDMARK.tinggi,
);
ok(
  "badge wordmark tidak menembus bawah kanvas",
  TATA_WORDMARK.badgeY + TATA_WORDMARK.sisiBadge <= TATA_WORDMARK.tinggi,
);

const logoKotak = ambilAsetAndroid("logo-kotak");
eq(logoKotak.canvas[0], 1024, "logo kotak 1024 px");
ok("logo kotak transparan", !logoKotak.latarPenuh);

// ---------------------------------------------------------------------------
// Panduan pasang: lengkap dan menunjuk folder res/ yang benar.
// ---------------------------------------------------------------------------

// Aset berteks: splash, wordmark, feature graphic — sisanya murni lambang.
eq(
  ASET_ANDROID.filter((a) => a.berteks).map((a) => a.id).sort().join(","),
  ["feature-graphic", "splash-lanskap", "splash-potret", "wordmark-gelap", "wordmark-terang"].sort().join(","),
  "daftar aset berteks",
);

ok(`ada ${PANDUAN_ANDROID.langkah.length} langkah pemasangan`, PANDUAN_ANDROID.langkah.length >= 5);
for (const [i, langkah] of PANDUAN_ANDROID.langkah.entries()) {
  ok(`langkah #${i + 1} berisi`, langkah.trim().length >= 30);
}
eq(PANDUAN_ANDROID.warna.length, 5, "lima warna brand untuk colors.xml");
for (const w of PANDUAN_ANDROID.warna) {
  ok(`warna "${w.nama}" berbentuk hex 6 digit (${w.nilai})`, /^#[0-9A-F]{6}$/.test(w.nilai));
}
ok(`ada ${PANDUAN_ANDROID.potongan.length} potongan XML`, PANDUAN_ANDROID.potongan.length >= 3);
for (const p of PANDUAN_ANDROID.potongan) {
  ok(`potongan "${p.id}" punya judul`, p.judul.trim() !== "");
  ok(`potongan "${p.id}" menunjuk folder res/ Android`, p.berkas.startsWith("android/app/src/main/res/"));
  ok(`potongan "${p.id}" berisi XML`, p.kode.trim().startsWith("<") && p.kode.includes(">"));
}
ok(
  "potongan adaptive icon memakai drawable yang kita hasilkan",
  PANDUAN_ANDROID.potongan.some(
    (p) => p.kode.includes("@drawable/ic_launcher_foreground") && p.kode.includes("@drawable/ic_launcher_background"),
  ),
);
ok(
  "potongan splash Android 12 memakai drawable yang kita hasilkan",
  PANDUAN_ANDROID.potongan.some(
    (p) => p.kode.includes("@drawable/ic_splash_pindai") && p.kode.includes("windowSplashScreenBackground"),
  ),
);
ok(
  "potongan warna menyediakan pindai_navy_tua untuk latar splash",
  PANDUAN_ANDROID.potongan.some((p) => p.kode.includes('name="pindai_navy_tua"')),
);

// Nama berkas di panduan harus berkas yang memang bisa diunduh dari /promo.
const berkasAset = new Set(ASET_ANDROID.map((a) => a.berkas));
for (const id of ["ikon-playstore", "ikon-adaptive-foreground", "feature-graphic"] as const) {
  ok(`berkas "${id}" ada di daftar unduhan`, berkasAset.has(ambilAsetAndroid(id).berkas));
}
ok("tagline dipakai konsisten dengan poster", TAGLINE === "PINJAM • GADAI DIGITAL");

// `KategoriAsetAndroid` harus tetap selaras dengan daftar kategori.
const kategoriUji: KategoriAsetAndroid[] = [...KATEGORI_ASET_ANDROID];
eq(kategoriUji.length, 4, "empat kategori aset");

console.log(`asetAndroid.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
