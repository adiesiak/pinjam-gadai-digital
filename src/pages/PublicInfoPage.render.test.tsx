import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { PublicInfoPageView } from "./PublicInfoPage";
import { SyaratKetentuanView } from "./SyaratKetentuan";

const routes = [
  ["/biaya", "Contoh perhitungan"],
  ["/cara-kerja", "Pilih jenis pengajuan"],
  ["/layanan/pinjaman-tunai", "Skema pinjaman"],
  ["/layanan/gadai", "Yang dicatat aplikasi"],
  ["/layanan/kredit-barang", "Yang dicatat aplikasi"],
  ["/keamanan", "Data yang dicatat"],
  ["/faq", "Apakah PINDAI mengirim uang ke rekening saya?"],
] as const;

const validInternalPaths = new Set([
  "/",
  "/auth",
  "/biaya",
  "/cara-kerja",
  "/layanan/pinjaman-tunai",
  "/layanan/gadai",
  "/layanan/kredit-barang",
  "/keamanan",
  "/faq",
  "/aplikasi",
  "/syarat-ketentuan",
]);

function renderPage(path: string, page: React.ReactNode): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>,
  );
}

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

for (const [path, expectedText] of routes) {
  const html = renderPage(path, <PublicInfoPageView />);
  check(html.includes(expectedText), `${path} renders its route content`);
  if (path !== "/keamanan" && path !== "/faq") {
    check(html.includes('href="/auth"'), `${path} links into the account flow`);
  }
  const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map(
    (match) => match[1],
  );
  check(
    hrefs.every((href) => validInternalPaths.has(href ?? "")),
    `${path} contains only known internal destinations`,
  );
}

const biaya = renderPage("/biaya", <PublicInfoPageView />);
check(
  biaya.includes("overflow-x-auto") && biaya.includes("min-w-[36rem]"),
  "pricing table stays inside a horizontal scroll container on narrow screens",
);
check(
  biaya.includes("bukan catatan pembayaran angsuran"),
  "monthly schedule is disclosed as illustrative, not a payment record",
);

const syarat = renderPage("/syarat-ketentuan", <SyaratKetentuanView />);
check(
  syarat.includes("Diperbarui 14 Oktober 2026"),
  "terms show the current update date",
);
check(
  syarat.includes("1 pinjaman untuk 1 pendana"),
  "terms describe the current funding model",
);
check(
  syarat.includes("sekitar setiap") && syarat.includes("detik"),
  "terms disclose the location heartbeat interval",
);
check(
  syarat.includes("bukan catatan pembayaran tiap angsuran"),
  "terms clarify monthly installments are illustrative",
);
check(syarat.includes('href="/auth"'), "terms page links to sign-in");
check(
  [...syarat.matchAll(/href="([^"#][^"]*)"/g)].every((match) =>
    validInternalPaths.has(match[1] ?? ""),
  ),
  "terms page contains only known internal destinations",
);

console.log(`PublicInfoPage.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
