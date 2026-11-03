/**
 * Uji kontrak event funnel landing.
 * Run: bun src/lib/analitikLanding.test.ts
 */
import {
  catatPeristiwaLanding,
  type PeristiwaLandingTercatat,
} from "./analitikLanding";

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

const asalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const target = new EventTarget();
const palsu = Object.assign(target, {
  pindaiAnalitik: [] as PeristiwaLandingTercatat[],
}) as unknown as Window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: palsu,
});

const diterima: PeristiwaLandingTercatat[] = [];
target.addEventListener("pindai:analitik", (event) => {
  diterima.push((event as CustomEvent<PeristiwaLandingTercatat>).detail);
});

catatPeristiwaLanding({ nama: "landing_cta", tempat: "header" });
const terakhir = diterima[diterima.length - 1];
const cta = diterima.find(
  (peristiwa): peristiwa is Extract<
    PeristiwaLandingTercatat,
    { nama: "landing_cta" }
  > => peristiwa.nama === "landing_cta",
);
ok(palsu.pindaiAnalitik?.length === 1, "event masuk ke antrean lokal");
ok(terakhir?.nama === "landing_cta", "event dipancarkan dengan nama yang sama");
ok(
  cta !== undefined &&
    cta.tempat === "header" &&
    !("nominal" in cta) &&
    !("identitas" in cta),
  "payload hanya berisi tempat, bukan data pribadi",
);

for (let i = 0; i < 120; i += 1) {
  catatPeristiwaLanding({ nama: "landing_demo", aksi: "buka" });
}
ok(
  palsu.pindaiAnalitik?.length === 100,
  "antrean dibatasi agar tidak tumbuh tanpa batas",
);

if (asalWindow === undefined) {
  delete (globalThis as unknown as { window?: Window }).window;
} else {
  Object.defineProperty(globalThis, "window", asalWindow);
}
catatPeristiwaLanding({ nama: "landing_cta", tempat: "penutup" });
ok(true, "pemanggilan tanpa window tidak melempar");

console.log(`analitikLanding: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
