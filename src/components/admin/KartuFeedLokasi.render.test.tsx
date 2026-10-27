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
import { readFileSync } from "node:fs";

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
  umurDetik: 12,
  langsung: true,
  akurasi: 8,
  perangkat: null,
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
  ada(html, "Langsung", "status langsung tampil");
  ada(html, "12 dtk lalu", "umur titik tampil");
  ada(html, "GPS ±8 m", "akurasi GPS tampil");
  ada(html, "badge-dot--hidup", "titik langsung berdenyut");
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

// ===== 4b. Titik lama TIDAK boleh mengaku langsung =====
{
  const html = renderToStaticMarkup(
    <KartuFeedLokasi
      r={baris({ umurDetik: 7_200, langsung: false, akurasi: null })}
      onPilih={tanpaPilih}
    />,
  );
  ada(html, "Tidak aktif", "titik lama dilabeli tidak aktif");
  ada(html, "2 jam lalu", "umur titik lama tampil dalam jam");
  ok(!html.includes("Langsung<"), "titik lama tidak memakai label langsung");
  ok(!html.includes("badge-dot--hidup"), "titik lama tidak berdenyut");
  bersih(html, "kartu tidak aktif");
}

// ===== 4c. Tanpa informasi umur, baris keaktifan tidak dirender =====
{
  const html = renderToStaticMarkup(
    <KartuFeedLokasi
      r={baris({ umurDetik: undefined, langsung: undefined, akurasi: undefined })}
      onPilih={tanpaPilih}
    />,
  );
  ok(!html.includes("Tidak aktif"), "pemanggil tanpa umur tidak dipaksa berbohong");
  ok(!html.includes("belum pernah"), "tidak ada umur karangan saat data tidak dikirim");
  bersih(html, "kartu tanpa umur");
}

// ===== 5. Penjagaan "peta blank" di LiveLocationMap =====
// Peta Leaflet dibuat oleh efek berdep `[]` yang keluar lebih awal bila
// `containerRef.current` belum ada. Karena itu komponen ini TIDAK boleh
// me-return lebih awal selagi data belum tiba: kontainer peta baru akan muncul
// setelah efek itu terlanjur dilewati, efeknya tidak dijalankan ulang (dep `[]`),
// peta tidak pernah dibuat, dan yang tampil hanya kotak abu-abu kosong
// seterusnya. Uji ini menjaga sifat itu lewat sumbernya — Leaflet tidak bisa
// diimpor tanpa DOM, jadi render langsung bukan pilihan.
{
  const sumber = readFileSync(new URL("./LiveLocationMap.tsx", import.meta.url), "utf8");
  ok(
    !/if \(data === undefined\) \{\s*return/.test(sumber),
    "tidak ada early-return yang menghalangi kontainer peta selagi data belum tiba",
  );
  ada(sumber, "ref={containerRef}", "kontainer peta tetap dirender sejak render pertama");
  ada(sumber, "const baris = data?.rows ?? [];", "baris feed dibaca aman sebelum data tiba");
  ok(!/data\.rows/.test(sumber), "tidak ada pembacaan data.rows tanpa penjagaan");
  ada(
    sumber,
    "Memuat titik lokasi…",
    "penanda memuat hidup DI ATAS peta, bukan menggantikan petanya",
  );
  ada(
    sumber,
    "data?.gpsMismatchKm ?? DEFAULT_CONFIG.gpsMismatchKm",
    "ambang pola tetap terbaca sebelum data tiba",
  );
}

console.log(`\nKartuFeedLokasi.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
