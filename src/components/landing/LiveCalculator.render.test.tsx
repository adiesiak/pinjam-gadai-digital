/**
 * Uji render kalkulator landing.
 * Run: bun src/components/landing/LiveCalculator.render.test.tsx
 *
 * Yang dijaga: slider nominal mengumumkan rupiah (bukan nilai 0–140), batas
 * nominal terhubung lewat `aria-describedby`, tautan syariah tersedia, dan CTA
 * mengikuti tujuan yang diberikan pemanggil, bukan selalu `/auth`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { LiveCalculator } from "./LiveCalculator";

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/"]}>
    <LiveCalculator
      accountHref="/auth?returnTo=%2Fdashboard%3Ftab%3Dform"
      accountLabel="Ajukan pinjaman"
    />
  </MemoryRouter>,
);

ok(
  html.includes('aria-valuetext="Rp 1.000.000"'),
  "slider mengumumkan nominal dalam rupiah",
);
ok(
  /aria-describedby="[^"]+"/.test(html),
  "slider terhubung ke keterangan batas nominal",
);
ok(
  html.includes('href="/pinjaman/syariah"'),
  "kalkulator menautkan simulasi syariah",
);
ok(
  html.includes('href="/auth?returnTo=%2Fdashboard%3Ftab%3Dform"') &&
    html.includes("Ajukan pinjaman"),
  "CTA memakai tujuan dan label dari pemanggil",
);
ok(!html.includes("animate-sheen"), "CTA tidak memakai kilau dekoratif");
ok(
  !html.includes("rounded-[1.5rem]"),
  "permukaan memakai radius token, bukan radius satu-off",
);

console.log(`LiveCalculator.render: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
