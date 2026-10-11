/**
 * Run: bun src/components/admin/KartuFeedLokasi.render.test.tsx
 *
 * Uji render kartu "Live Geofence Feed" lewat react-dom/server (tanpa DOM,
 * tanpa browser): memastikan kartu nasabah menumpuk rapi — kolom flex, TANPA
 * `position: absolute` / margin negatif — dengan nama, lencana status jarak,
 * kode referensi, dan jarak yang terbaca. Ini satu-satunya "jendela" ke feed
 * peta admin di lingkungan tanpa browser (Leaflet tidak bisa diimpor tanpa DOM,
 * karena itu kartu dipisah dari `LiveLocationMap`).
 */
import { renderToStaticMarkup } from "react-dom/server";

import { KartuFeedLokasi, type BarisFeedLokasi } from "./KartuFeedLokasi";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const baris = (o: Partial<BarisFeedLokasi> = {}): BarisFeedLokasi => ({
  userId: "users_1",
  namaLengkap: "Rani Puspita",
  nomorReferensi: "PGD-20261001-AB12",
  jarakVaultKm: 12.34,
  mismatch: false,
  tanda: [],
  ...o,
});

const tanpaPilih = () => {};

// ===== 1. Aman (di dalam ambang) =====
{
  const html = renderToStaticMarkup(<KartuFeedLokasi r={baris()} onPilih={tanpaPilih} />);
  ada(html, "RANI PUSPITA", "nama tampil huruf besar");
  ada(html, "Aman", "lencana status aman tampil");
  ada(html, "bg-emerald-100", "warna lencana aman");
  ada(html, "PGD-20261001-AB12", "kode referensi tampil");
  ada(html, "12.3 km dari titik acuan", "jarak tampil satu desimal");
  ada(html, "flex-col", "tata letak kolom flex");
  ada(html, "p-3.5", "kartu mandiri berpadding");
  ok(!html.includes("absolute"), "tanpa position absolute (anti-overlap)");
  ok(!html.includes("inset-"), "tanpa inset absolut (anti-overlap)");
  ok(
    ["-mt-", "-mr-", "-mb-", "-ml-", "-mx-", "-my-"].every((k) => !html.includes(k)),
    "tanpa margin negatif (anti-overlap)",
  );
  bersih(html, "kartu aman");
}

// ===== 2. Di luar ambang jarak =====
{
  const html = renderToStaticMarkup(
    <KartuFeedLokasi r={baris({ mismatch: true, jarakVaultKm: 48 })} onPilih={tanpaPilih} />,
  );
  ada(html, "Di Luar Ambang Jarak", "lencana di luar ambang tampil");
  ada(html, "bg-red-100", "warna lencana merah");
  ada(html, "48.0 km dari titik acuan", "jarak di luar ambang tampil");
  bersih(html, "kartu di luar ambang");
}

// ===== 3. Pola koordinat ditandai =====
{
  const html = renderToStaticMarkup(
    <KartuFeedLokasi r={baris({ tanda: ["koordinat_duplikat"] })} onPilih={tanpaPilih} />,
  );
  ada(html, "Pola Ditandai", "lencana pola ditandai tampil");
  ada(html, "bg-amber-100", "warna lencana amber");
  bersih(html, "kartu pola ditandai");
}

// ===== 4. Belum ada jarak =====
{
  const html = renderToStaticMarkup(
    <KartuFeedLokasi r={baris({ jarakVaultKm: null })} onPilih={tanpaPilih} />,
  );
  ada(html, "jarak tidak diketahui", "jarak kosong dinyatakan jujur");
  bersih(html, "kartu tanpa jarak");
}

console.log(`\nKartuFeedLokasi.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
