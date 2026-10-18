/**
 * Uji bagian pemasangan aplikasi di beranda (`PasangAplikasi`) dan data
 * pendukungnya.
 * Run: bun src/components/landing/PasangAplikasi.render.test.tsx
 *
 * Yang dijaga:
 *  1. Hanya SATU tombol pasang, berupa tombol sungguhan, tanpa tautan toko.
 *  2. Panduan tersedia untuk tiga perangkat (Android, iPhone, komputer) dan
 *     deteksi perangkat memilih yang tepat, termasuk iPad yang menyamar sebagai
 *     macOS.
 *  3. Aset pemasangan benar-benar ada: manifest memuat ikon 192 & 512 PNG dan
 *     berkasnya tidak kosong — tanpa itu tombol tidak akan pernah langsung
 *     memasang di Chrome.
 *  4. Dialog tertutup saat pertama dirender, jadi langkahnya tidak membanjiri
 *     markup beranda.
 */
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { PasangAplikasi } from "@/components/landing/PasangAplikasi";
import {
  PANDUAN_PASANG,
  panduanPasang,
  platformPemasanganDari,
} from "@/lib/panduanPasang";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const markup = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/"]}>
    <PasangAplikasi />
  </MemoryRouter>,
);

const ada = (teks: string, label: string) =>
  ok(markup.includes(teks), `${label} (memuat ${teks})`);

ada("PINDAI di layar utama", "judul bagian tampil");
ok(
  markup.includes('id="pasang-aplikasi"') &&
    markup.includes('aria-labelledby="pasang-aplikasi-judul"'),
  "bagian punya id dan terhubung ke judulnya",
);
ada("Pasang aplikasi", "satu tombol pasang tampil");
ok(
  (markup.match(/<button/g) ?? []).length === 1,
  "hanya satu tombol yang dirender",
);
ada("belum ada di Play Store maupun App Store", "status toko ditulis apa adanya");
ada("tanpa berkas unduhan", "bagian menjelaskan aplikasi dari peramban");

ok(
  !markup.includes("play.google") &&
    !markup.includes("apps.apple") &&
    !markup.includes("market://"),
  "tidak ada tautan toko atau skema market",
);
ok(
  (markup.match(/<a /g) ?? []).length === 1 &&
    markup.includes('href="/pindai.apk"') &&
    markup.includes('download="PINDAI.apk"'),
  "satu tautan unduhan APK, bukan tautan toko",
);
ada("Unduh APK Android", "tautan unduhan APK berlabel jelas");
ok(
  (markup.match(/type="button"/g) ?? []).length === 1,
  "tombol memakai type=button, bukan submit",
);

ok(
  !markup.includes("Tambah ke Layar Utama"),
  "langkah pemasangan tidak ikut tampil saat dialog tertutup",
);

// --- Data panduan -----------------------------------------------------------
ok(PANDUAN_PASANG.length === 3, "panduan tersedia untuk tiga perangkat");
ok(
  new Set(PANDUAN_PASANG.map((p) => p.id)).size === 3,
  "id panduan tidak berulang",
);
for (const panduan of PANDUAN_PASANG) {
  ok(
    panduan.langkah.length === 4,
    `panduan ${panduan.label} berisi empat langkah`,
  );
  ok(
    panduan.langkah.every((l) => l.trim().length > 10),
    `setiap langkah ${panduan.label} terisi`,
  );
  ok(
    panduan.catatan.trim().length > 10,
    `panduan ${panduan.label} punya catatan`,
  );
}

const android = panduanPasang("android");
ok(
  android.langkah.some((l) => l.includes("Instal aplikasi")) &&
    android.langkah.some((l) => l.includes("layar utama")),
  "panduan Android menyebut menu Instal aplikasi dan layar utama",
);

const ios = panduanPasang("ios");
ok(ios.langkah.some((l) => l.includes("Safari")), "panduan iPhone memakai Safari");
ok(
  ios.langkah.some((l) => l.includes("Tambah ke Layar Utama")),
  "panduan iPhone menyebut Tambah ke Layar Utama",
);

const desktop = panduanPasang("desktop");
ok(
  desktop.langkah.some((l) => l.includes("bilah alamat")),
  "panduan komputer menyebut ikon di bilah alamat",
);

let melempar = false;
try {
  panduanPasang("windows" as "android");
} catch {
  melempar = true;
}
ok(melempar, "platform tak dikenal ditolak, bukan diam-diam jatuh ke Android");

// --- Deteksi perangkat ------------------------------------------------------
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const UA_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const UA_MAC_TOUCH =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const UA_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

ok(platformPemasanganDari(UA_ANDROID) === "android", "Android terdeteksi");
ok(platformPemasanganDari(UA_IPHONE) === "ios", "iPhone terdeteksi");
ok(platformPemasanganDari(UA_IPAD) === "ios", "iPad terdeteksi");
ok(
  platformPemasanganDari(UA_MAC_TOUCH, 5) === "ios",
  "iPadOS yang menyamar sebagai macOS terdeteksi sebagai iOS",
);
ok(
  platformPemasanganDari(UA_MAC_TOUCH, 0) === "desktop",
  "Mac tanpa layar sentuh tetap desktop",
);
ok(platformPemasanganDari(UA_WINDOWS) === "desktop", "Windows terdeteksi desktop");

// --- Aset pemasangan --------------------------------------------------------
const akar = fileURLToPath(new URL("../../../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(`${akar}public/manifest.webmanifest`, "utf8"),
) as { icons?: Array<{ src?: string; sizes?: string; type?: string }> };

/** Lebar/tinggi dari header IHDR PNG — memastikan berkasnya benar-benar 192/512. */
function ukuranPng(berkas: string): { lebar: number; tinggi: number } | null {
  try {
    const kepala = readFileSync(`${akar}public/${berkas}`).subarray(0, 24);
    const tanda = kepala.subarray(1, 4).toString("ascii");
    if (tanda !== "PNG") return null;
    return { lebar: kepala.readUInt32BE(16), tinggi: kepala.readUInt32BE(20) };
  } catch {
    return null;
  }
}

for (const [ukuran, berkas, sisi] of [
  ["192x192", "icon-192.png", 192],
  ["512x512", "icon-512.png", 512],
] as const) {
  const ikon = manifest.icons?.find(
    (i) => i.sizes === ukuran && i.type === "image/png",
  );
  ok(ikon?.src === `/${berkas}`, `manifest memuat ikon ${ukuran}`);
  ok(statSync(`${akar}public/${berkas}`).size > 1000, `berkas ${berkas} tidak kosong`);
  const png = ukuranPng(berkas);
  ok(
    png?.lebar === sisi && png?.tinggi === sisi,
    `${berkas} benar-benar ${sisi} x ${sisi} piksel`,
  );
}

// APK-nya harus benar-benar ada; tautan tanpa berkas lebih buruk daripada
// tidak ada tautan sama sekali.
const apk = readFileSync(`${akar}public/pindai.apk`);
ok(apk.length > 10_000, "berkas APK ada dan berukuran wajar");
ok(
  apk.subarray(0, 2).toString("ascii") === "PK",
  "APK adalah arsip zip yang sah",
);
ok(apk.includes(Buffer.from("classes.dex")), "APK memuat classes.dex");
ok(
  apk.includes(Buffer.from("META-INF/PINDAI.RSA")),
  "APK sudah ditandatangani",
);

const ikonIos = ukuranPng("apple-touch-icon.png");
ok(
  ikonIos?.lebar === 180 && ikonIos?.tinggi === 180,
  "apple-touch-icon berukuran 180 x 180",
);

const html = readFileSync(`${akar}index.html`, "utf8");
ok(
  html.includes('rel="apple-touch-icon"') &&
    html.includes("/apple-touch-icon.png"),
  "iOS memakai apple-touch-icon PNG",
);
ok(
  statSync(`${akar}public/sw.js`).size > 100,
  "service worker pemasangan tersedia",
);

// --- Cek versi di aplikasi Android -----------------------------------------
// Aplikasi yang terpasang membandingkan VERSI_KODE-nya dengan berkas ini.
// Angka di build.sh, MainActivity, dan version.json harus satu cerita: build.sh
// menulis version.json, MainActivity membacanya.
const versiServer = JSON.parse(
  readFileSync(`${akar}public/version.json`, "utf8"),
) as { versionCode?: unknown; versionName?: unknown; apkUrl?: unknown };

ok(
  Number.isInteger(versiServer.versionCode) &&
    (versiServer.versionCode as number) > 0,
  "version.json memuat versionCode bilangan bulat",
);
ok(
  typeof versiServer.versionName === "string" &&
    /^\d+\.\d+\.\d+$/.test(versiServer.versionName),
  "version.json memuat versionName berbentuk x.y.z",
);
ok(
  versiServer.apkUrl === "/pindai.apk",
  "version.json menunjuk APK yang memang ada di public/",
);

const buildSh = readFileSync(`${akar}android/build.sh`, "utf8");
const mainActivity = readFileSync(
  `${akar}android/src/id/pindai/app/MainActivity.java`,
  "utf8",
);
const kodeBuild = /VERSI_KODE\s*=\s*(\d+)/.exec(buildSh)?.[1];
const kodeApp = /VERSI_KODE\s*=\s*(\d+)/.exec(mainActivity)?.[1];
const namaBuild = /VERSI_NAMA\s*=\s*([\d.]+)/.exec(buildSh)?.[1];

ok(kodeBuild !== undefined, "build.sh menulis versi di satu tempat");
ok(
  kodeBuild === kodeApp,
  "MainActivity memakai versionCode yang sama dengan build.sh",
);
ok(
  namaBuild === versiServer.versionName,
  "version.json dan build.sh menyebut versi yang sama",
);
ok(
  Number(versiServer.versionCode) === Number(kodeBuild),
  "version.json menunjuk versionCode yang sudah dibangun",
);
ok(
  mainActivity.includes('"version.json"'),
  "MainActivity benar-benar memeriksa version.json",
);
ok(
  mainActivity.includes("bilahPembaruan") &&
    mainActivity.includes("VERSI_KODE"),
  "MainActivity punya bilah pembaruan berbasis VERSI_KODE",
);

console.log(`PasangAplikasi.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
