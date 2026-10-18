/**
 * Uji render bagian pemasangan aplikasi di beranda (`PasangAplikasi`).
 * Run: bun src/components/landing/PasangAplikasi.render.test.tsx
 *
 * Yang dijaga:
 *  1. Dua tombol platform ada dan merupakan tombol sungguhan, bukan tautan.
 *  2. Tidak ada tautan Play Store / App Store / skema market: listing-nya
 *     memang belum ada, dan tombol tidak boleh menipu.
 *  3. Status "belum ada di toko" ditulis di halaman, bukan disembunyikan.
 *  4. Panduan per platform lengkap: Android menyebut menu Instal aplikasi,
 *     iPhone menyebut Safari dan Tambah ke Layar Utama.
 *  5. Dialog tertutup saat pertama dirender, sehingga langkahnya tidak
 *     membanjiri markup beranda.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { PasangAplikasi } from "@/components/landing/PasangAplikasi";
import { PANDUAN_PASANG, panduanPasang } from "@/lib/panduanPasang";

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
ada("Pasang di Android", "tombol Android tampil");
ada("Pasang di iPhone", "tombol iPhone tampil");
ada(
  "belum ada di Play Store maupun App Store",
  "status toko ditulis apa adanya",
);
ada("tidak ada berkas unduhan", "bagian menjelaskan aplikasi dari peramban");

ok(
  !markup.includes("play.google") &&
    !markup.includes("apps.apple") &&
    !markup.includes("market://"),
  "tidak ada tautan toko atau skema market",
);
ok(!markup.includes("<a "), "tidak ada tautan sama sekali di bagian ini");

const tombol = markup.match(/type="button"/g) ?? [];
ok(tombol.length >= 2, "kedua platform dirender sebagai tombol");

ok(
  !markup.includes("Tambah ke Layar Utama"),
  "langkah pemasangan tidak ikut tampil saat dialog tertutup",
);

// Data panduan: jumlah langkah dan istilah kunci tiap platform.
ok(PANDUAN_PASANG.length === 2, "ada panduan untuk dua platform");
for (const panduan of PANDUAN_PASANG) {
  ok(
    panduan.langkah.length === 4,
    `panduan ${panduan.label} berisi empat langkah`,
  );
  ok(
    panduan.langkah.every((l) => l.trim().length > 10),
    `setiap langkah ${panduan.label} terisi`,
  );
  ok(panduan.catatan.trim().length > 10, `panduan ${panduan.label} punya catatan`);
}

const android = panduanPasang("android");
ok(
  android.langkah.some((l) => l.includes("Instal aplikasi")) &&
    android.langkah.some((l) => l.includes("layar utama")),
  "panduan Android menyebut menu Instal aplikasi dan layar utama",
);

const ios = panduanPasang("ios");
ok(
  ios.langkah.some((l) => l.includes("Safari")),
  "panduan iPhone memakai Safari",
);
ok(
  ios.langkah.some((l) => l.includes("Tambah ke Layar Utama")),
  "panduan iPhone menyebut Tambah ke Layar Utama",
);

let melempar = false;
try {
  panduanPasang("windows" as "android");
} catch {
  melempar = true;
}
ok(melempar, "platform tak dikenal ditolak, bukan diam-diam jatuh ke Android");

console.log(`PasangAplikasi.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
