/**
 * Uji render navigasi panel admin di layar kecil.
 * Run: bun src/components/admin/admin-nav.render.test.tsx
 *
 * Kontrak yang dijaga — semuanya pernah rusak sekali, jadi ditulis sebagai uji
 * supaya tidak kembali:
 * - Deret chip modul WAJIB satu baris yang digeser mendatar. Membungkus ke
 *   beberapa baris membuat bilah sticky (top-14) menutupi hampir separuh layar.
 * - Setiap target sentuh >= 44px (`min-h-11` = 2,75rem), termasuk pintu "Cari…".
 * - Chip modul aktif punya id yang dicari efek auto-scroll, dan efeknya tetap
 *   terikat pada `activeTab` — tanpa itu, membuka modul dari bilah bawah atau
 *   sheet pencarian meninggalkan chip aktif di luar pandangan.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { GRUP_NAV } from "@/lib/admin-queue";

import { AdminNav, type GrupNavData } from "./admin-nav";

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
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tanpa "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}
/** Cacah kemunculan — dipakai untuk memastikan SETIAP target, bukan satu saja. */
function cacah(haystack: string, jarum: string): number {
  return haystack.split(jarum).length - 1;
}

/** Label modul disalin dari `admin-tabs.tsx` supaya uji memakai teks sungguhan. */
const LABEL: Record<string, string> = {
  "hari-ini": "Ringkasan",
  pinjaman: "Pengajuan Pinjaman",
  gadai: "Pengajuan Gadai",
  kredit: "Pengajuan Kredit Barang",
  kyc: "Verifikasi KYC",
  alokasi: "Pinjaman siap disalurkan",
  rekonsiliasi: "Rekonsiliasi Angsuran",
  plafon: "Plafon Nasabah",
  akses: "Nasabah & Pendana",
  dpd: "Jatuh Tempo",
  lokasi: "Peta lokasi nasabah",
  lelang: "Kalkulator Lelang Jaminan",
  bi: "Catatan Internal & Kesehatan Sistem",
  template: "Template Website",
  landing: "Konten Beranda",
  pendana: "Halaman Pendana & Proposal",
  pengumuman: "Banner & Pengumuman Sistem",
  promo: "Promo Pinjaman",
  whatsapp: "WhatsApp",
  aplikasi: "Aplikasi Android",
  config: "Pengaturan Parameter Bisnis (Bunga/Limit/Biaya)",
  backup: "Backup & Snapshot Database",
  pengembangan: "Peta Sistem & Logika Bisnis",
  audit: "Audit Trail (Timeline Log)",
  loglogin: "Session & Keamanan Login",
  killswitch: "Kill Switch Darurat",
};

/** Lencana contoh dari tangkapan layar: grup Pemantauan punya 17 perhatian. */
const BADGE: Record<string, string> = { lokasi: "17" };

const menu: GrupNavData[] = GRUP_NAV.map((grup) => ({
  judul: grup.label,
  items: grup.modul.map((modul) => ({
    value: modul,
    label: LABEL[modul] ?? modul,
    hint: `Petunjuk ${LABEL[modul] ?? modul}`,
    badge: BADGE[modul] ?? null,
    hitung: "tidak",
    Icon: () => null,
  })),
}));

const gambar = (aktif: (typeof GRUP_NAV)[number]["default"]): string =>
  renderToStaticMarkup(
    <AdminNav menu={menu} activeTab={aktif} onPilih={() => {}} />,
  );

// ===== 1. Setiap grup: satu baris yang digeser, target >= 44px =====
for (const grup of GRUP_NAV) {
  const html = gambar(grup.default);
  const label = `grup ${grup.label}`;

  // Satu baris: deret tidak boleh membungkus.
  ada(html, "flex-nowrap", `${label}: deret chip tidak membungkus`);
  tidakAda(html, "flex-wrap", `${label}: tidak ada pembungkusan sisa`);
  ada(html, "overflow-x-auto", `${label}: deret bisa digeser mendatar`);
  ada(html, "no-scrollbar", `${label}: bilah gulir tak menutupi chip`);
  ada(
    html,
    "motion-safe:scroll-smooth",
    `${label}: geseran halus tetap menghormati reduce`,
  );
  // Label lama membungkus baris; dengan lebar dibatasi ia harus dipotong.
  ada(html, "truncate", `${label}: label panjang dipotong satu baris`);
  tidakAda(html, "whitespace-normal", `${label}: tidak ada label yang membungkus`);
  ada(html, "max-w-[16rem]", `${label}: lebar satu chip dibatasi`);

  // 44px = `min-h-11` (2,75rem). Setiap chip + tombol Cari, bukan sebagian.
  ok(
    cacah(html, "min-h-11") === grup.modul.length + 1,
    `${label}: ${grup.modul.length} chip + tombol Cari semuanya >= 44px (ditemukan ${cacah(html, "min-h-11")}, seharusnya ${grup.modul.length + 1})`,
  );
  tidakAda(html, "min-h-10", `${label}: tinggi lama 40px sudah tidak dipakai`);

  // Kontrak aksesibilitas deret.
  ada(html, 'aria-label="Pilih modul"', `${label}: deret dilabeli`);
  ok(
    cacah(html, 'aria-pressed="true"') === 1,
    `${label}: tepat satu chip ditandai aktif`,
  );
  ada(html, 'aria-label="Menu operasi"', `${label}: bilah bawah tetap ada`);
}

// ===== 2. Auto-scroll chip aktif terpasang untuk tiap modul =====
for (const grup of GRUP_NAV) {
  for (const modul of grup.modul) {
    const html = gambar(modul);
    ada(
      html,
      `id="chip-modul-${modul}"`,
      `chip ${modul}: punya id sasaran auto-scroll`,
    );
  }
}

// Efeknya sendiri tidak berjalan di react-dom/server, jadi isinya diperiksa di
// sumber: id sasaran + geseran `nearest` + ketergantungan pada `activeTab`.
const sumber = readFileSync(
  fileURLToPath(new URL("./admin-nav.tsx", import.meta.url)),
  "utf8",
);
ada(sumber, "chip-modul-${activeTab}", "sumber: efek mencari chip aktif");
ada(
  sumber,
  'scrollIntoView({ inline: "nearest", block: "nearest" })',
  "sumber: geseran mendatar tanpa lompatan vertikal",
);
ok(
  /\.getElementById\(`chip-modul-\$\{activeTab\}`\)[\s\S]{0,80}\}, \[activeTab\]\)/.test(
    sumber,
  ),
  "sumber: efek terikat pada perubahan activeTab",
);

// ===== 3. Isi chip tidak dikorbankan demi satu baris =====
{
  const html = gambar("bi");
  ada(html, "Catatan Internal", "label panjang tetap utuh di DOM");
  ada(html, "Jatuh Tempo", "modul lain di grup yang sama tetap hadir");
  ada(html, "Cari…", "pintu pencarian tetap terjangkau");
  ada(html, "title=", "petunjuk modul tetap tersedia sebagai tooltip");
  bersih(html, "deret chip grup Pemantauan");
}

// Lencana tetap terbaca setelah dipotong lebarnya.
{
  const html = gambar("dpd");
  ada(html, "Peta lokasi nasabah", "modul berlencana hadir di deret");
  ada(html, "17", "lencana angka tetap tampil di samping label");
}

console.log(`admin-nav.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
