/**
 * Uji pintu admin alternatif (tanpa DOM/browser).
 * Run: bun src/lib/routes.test.ts
 *
 * Yang dijaga: hanya Ctrl+Alt+A yang membuka jalur admin (bukan pintasan
 * bawaan peramban/sistem), dan kombinasinya dibaca dari `code` sehingga tetap
 * sama di tata letak papan tombol non-QWERTY.
 */
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

console.log(`routes: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
