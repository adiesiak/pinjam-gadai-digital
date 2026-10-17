/**
 * Uji pintu admin alternatif (tanpa DOM/browser).
 * Run: bun src/lib/routes.test.ts
 *
 * Yang dijaga: hanya Ctrl+Alt+A yang membuka jalur admin (bukan pintasan
 * bawaan peramban/sistem), dan kombinasinya dibaca dari `code` sehingga tetap
 * sama di tata letak papan tombol non-QWERTY.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ADMIN_ROUTE, kombinasiAdmin } from "./routes";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const tekan = (over: Partial<{ ctrlKey: boolean; altKey: boolean; code: string }>) =>
  kombinasiAdmin({ ctrlKey: false, altKey: false, code: "KeyA", ...over });

ok(tekan({ ctrlKey: true, altKey: true }), "Ctrl+Alt+A membuka jalur admin");
ok(!tekan({ altKey: true }), "Alt+A saja tidak membuka jalur admin");
ok(!tekan({ ctrlKey: true }), "Ctrl+A saja tidak membuka jalur admin");
ok(
  !tekan({ ctrlKey: true, altKey: true, code: "KeyB" }),
  "huruf lain tidak membuka jalur admin",
);
ok(
  !tekan({ ctrlKey: true, altKey: true, code: "Enter" }),
  "tombol non-huruf tidak membuka jalur admin",
);
ok(
  tekan({ ctrlKey: true, altKey: true }) === tekan({ ctrlKey: true, altKey: true }),
  "hasil tidak berubah antar pemanggilan",
);
ok(
  ADMIN_ROUTE.startsWith("/") && ADMIN_ROUTE.length > 20,
  "rute admin tetap jalur internal yang panjang",
);

// Perkabelan di halaman yang BENAR: rute "/" merender `LandingHome`, bukan
// `Landing`. Kedua pintu harus terpasang di berkas itu.
const landing = readFileSync(
  fileURLToPath(new URL("../pages/LandingHome.tsx", import.meta.url)),
  "utf8",
);
ok(landing.includes("onClick={handleBrandClick}"), "logo landing menghitung ketukan");
ok(
  landing.includes("logoClickCountRef.current >= 5"),
  "lima ketukan membuka pintu admin",
);
ok(
  landing.includes("kombinasiAdmin(event)"),
  "landing memakai pencocok Ctrl+Alt+A",
);
ok(
  landing.includes("navigate(`/auth?returnTo="),
  "pintu admin mengarah ke halaman masuk dengan returnTo",
);
ok(
  !landing.match(/href=["']\/7c91f4d2/),
  "tautan rute admin tidak pernah dirender di markup landing",
);

// `/promo` adalah ruang internal brand: rutenya dijaga `RequireAdmin`, dan
// menu peran lain tidak menawarkannya.
const main = readFileSync(fileURLToPath(new URL("../main.tsx", import.meta.url)), "utf8");
ok(
  main.includes("<RequireAdmin>") && main.includes("<Promo />"),
  "/promo dijaga gerbang admin",
);
ok(
  !main.includes("<RequireAuth>\n                      <Promo />"),
  "/promo tidak lagi memakai gerbang semua pengguna",
);
const menu = readFileSync(
  fileURLToPath(new URL("../components/RoleDashboardMenu.tsx", import.meta.url)),
  "utf8",
);
ok(
  /role === "admin"\s*\?\s*\[modeAdmin, ruangPromo/.test(menu),
  "menu hanya menawarkan /promo untuk admin",
);
ok(
  !/\]\)?,\s*ruangPromo,/.test(menu) && !/menuSpaces = \[\s*\.\.\./.test(menu),
  "menu tidak menempelkan /promo di luar cabang admin",
);

console.log(`routes: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
