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
  "/auth?returnTo=%2Fdashboard%3Ftab%3Dform",
  "/biaya",
  "/cara-kerja",
  "/layanan",
  "/layanan/pinjaman-tunai",
  "/layanan/gadai",
  "/layanan/kredit-barang",
  "/keamanan",
  "/faq",
  "/aplikasi",
  "/syarat-ketentuan",
  "/privasi",
  "/pinjaman/konvensional",
  "/pinjaman/syariah",
  "/akses-bersama",
  "/pemenang",
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
    check(
      html.includes('href="/auth?returnTo=%2Fdashboard%3Ftab%3Dform"'),
      `${path} links into the application form after auth`,
    );
  }
  const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)]
    .map((match) => match[1])
    .filter((href): href is string => href?.startsWith("/") === true);
  check(
    hrefs.every((href) => validInternalPaths.has(href)),
    `${path} contains only known internal destinations`,
  );
}

const gadai = renderPage("/layanan/gadai", <PublicInfoPageView />);
check(
  gadai.includes("Sebelum mengajukan") &&
    gadai.includes("Batas LTV 70%"),
  "halaman gadai menampilkan langkah dan batas LTV dari mesin",
);
check(
  gadai.includes("Pertanyaan sebelum menggadaikan barang") &&
    gadai.includes("Belum menemukan jawaban?") &&
    gadai.includes("wa.me/6285119574032") &&
    gadai.includes("Jangan kirim kata sandi atau kode OTP"),
  "halaman gadai menampilkan FAQ dan bantuan WhatsApp",
);

const kredit = renderPage("/layanan/kredit-barang", <PublicInfoPageView />);
check(
  kredit.includes("Sebelum mengajukan") &&
    kredit.includes("Uang muka 10–50%"),
  "halaman kredit menampilkan langkah dan uang muka dari mesin",
);
check(
  kredit.includes("Pertanyaan sebelum mengajukan kredit barang") &&
    kredit.includes("Belum menemukan jawaban?"),
  "halaman kredit menampilkan FAQ kontekstual",
);

const pinjaman = renderPage("/layanan/pinjaman-tunai", <PublicInfoPageView />);
check(
  pinjaman.includes("Ringkasan pinjaman") &&
    pinjaman.includes("7–28 hari"),
  "halaman pinjaman menampilkan ringkasan tenor dari mesin",
);
check(
  pinjaman.includes("Pertanyaan sebelum mengajukan pinjaman") &&
    pinjaman.includes("Belum menemukan jawaban?"),
  "halaman pinjaman menampilkan FAQ kontekstual",
);

const info = renderPage("/faq", <PublicInfoPageView />);
check(
  info.includes("© 2026 PT Pindai Digital Solusindo. All Rights Reserved."),
  "public footer shows the operating entity copyright line",
);
check(
  info.includes(
    "PINDAI adalah platform sistem informasi pembiayaan mikro berbasis teknologi yang dikembangkan oleh PT Pindai Digital Solusindo.",
  ),
  "public footer carries the PINDAI entity disclaimer",
);
check(
  info.includes("Citra Kebun Mas, Karawang") &&
    info.includes("mailto:support@pindai.biz.id"),
  "public footer exposes the office address and official email",
);

const biaya = renderPage("/biaya", <PublicInfoPageView />);
check(
  biaya.includes("overflow-x-auto") && biaya.includes("min-w-[36rem]"),
  "pricing table stays inside a horizontal scroll container on narrow screens",
);
check(
  biaya.includes("bukan catatan pembayaran angsuran"),
  "monthly schedule is disclosed as illustrative, not a payment record",
);
// Kalkulator bulanan harus memakai tarif tenor yang sama dengan mesin pengajuan
// (bawaan 8%/bulan untuk tenor 3), bukan angka 30% yang dulu dipakai bersama
// bunga harian.
check(
  biaya.includes("Bunga flat 8% per bulan"),
  "monthly calculator uses the engine rate for 3-month tenor",
);
check(
  biaya.includes("Rp 1.264.801"),
  "monthly calculator total matches the borrower dashboard for 1jt/3bln",
);
check(
  biaya.includes("Bunga selama tenor") && biaya.includes("Rp 240.000"),
  "monthly calculator shows total interest for the whole tenor",
);
check(
  biaya.includes("pada setiap pembayaran bulanan"),
  "public pricing table charges the admin fee on every monthly payment",
);
check(
  biaya.includes('aria-live="polite"'),
  "calculator results announce changes to assistive technology",
);
const biayaBunga10 = renderPage(
  "/biaya",
  <PublicInfoPageView ketentuan={{ tarifBulanan: { persenBungaBulanan3: 10 } }} />,
);
check(
  biayaBunga10.includes("Bunga flat 10% per bulan") &&
    biayaBunga10.includes("Rp 1.326.001"),
  "monthly calculator follows the configured global interest rate",
);

// Tarif potongan di muka diatur admin. Halaman biaya, kalkulator, FAQ, dan
// syarat harus memakai angka itu, bukan persentase yang ditulis di JSX.
const tarifAdmin = {
  adminPersen: 3.5,
  asuransiPersen: 1,
  ekspres: { tier1: 6_000, tier2: 8_000, tier3: 12_000 },
};
const biayaTarif = renderPage(
  "/biaya",
  <PublicInfoPageView ketentuan={{ tarifBiaya: tarifAdmin }} />,
);
check(
  biayaTarif.includes("admin 3,5%") && biayaTarif.includes("asuransi 1%"),
  "pricing page shows the configured admin and insurance rates",
);
check(
  biayaTarif.includes("ekspres Rp 6.000–Rp 12.000"),
  "pricing page shows the configured express fee range",
);
check(
  biayaTarif.includes("Rp 30.500") && biayaTarif.includes("Rp 469.500"),
  "daily calculator deducts the configured admin, insurance, and express fees",
);
check(
  !biaya.includes("asuransi 0%"),
  "insurance is not advertised while its rate is zero",
);

const syarat = renderPage("/syarat-ketentuan", <SyaratKetentuanView />);
check(
  syarat.includes("Diperbarui 27 Oktober 2026"),
  "terms show the current update date",
);
check(
  syarat.includes('href="/privasi"'),
  "terms link to the privacy policy",
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
  syarat.includes("PT Pindai Digital Solusindo"),
  "terms name the company behind the PINDAI platform",
);
check(
  [...syarat.matchAll(/href="([^"#][^"]*)"/g)].every((match) =>
    validInternalPaths.has(match[1] ?? ""),
  ),
  "terms page contains only known internal destinations",
);

const syaratTarif = renderPage(
  "/syarat-ketentuan",
  <SyaratKetentuanView ketentuan={{ tarifBiaya: tarifAdmin }} />,
);
check(
  syaratTarif.includes("Biaya admin 3,5%") &&
    syaratTarif.includes("asuransi 1%") &&
    syaratTarif.includes("ekspres Rp 6.000–Rp 12.000"),
  "terms quote the configured upfront fees",
);
check(
  !syaratTarif.includes("Rp5.000–Rp10.000"),
  "terms no longer carry the old hardcoded express fee",
);

console.log(`PublicInfoPage.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
