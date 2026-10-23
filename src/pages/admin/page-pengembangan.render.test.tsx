/**
 * Uji halaman "Peta Sistem & Logika Bisnis" (modul admin `pengembangan`).
 * Run: bun src/pages/admin/page-pengembangan.render.test.tsx
 *
 * Yang dijaga:
 *  1. Halaman tetap dokumentasi internal: tidak ada query Convex, tidak ada
 *     tautan keluar ke halaman publik.
 *  2. Angka ringkasan cocok dengan isi halaman (26 modul admin, 16 rute publik).
 *  3. Aturan uang yang ditulis di halaman masih sama dengan konstanta kode,
 *     supaya admin tidak membaca tarif lama.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { LATE_FEE_POLICY, LOAN_LIMITS, TENOR_OPTIONS } from "@/lib/loan";
import { TENOR_BULANAN_OPTIONS } from "@/lib/bulanan";
import { PLAFON_BARU, PLAFON_BATAS, PLAFON_TERUJI } from "@/lib/plafon";
import { BIAYA_EKSPRES_TIER, BIAYA_ROLLOVER } from "@/lib/ekonomiPlatform";
import { GADAI_PRICING } from "@/lib/gadai";
import { KREDIT_BARANG_POKOK_MAKS, KREDIT_PRICING } from "@/lib/kredit";
import { formatRupiah } from "@/lib/money";

import { PagePengembangan } from "./page-pengembangan";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${nama}${info === undefined ? "" : ` — ${info}`}`);
  }
}
const cacah = (teks: string, jarum: string) => teks.split(jarum).length - 1;

const html = renderToStaticMarkup(<PagePengembangan />);

// ===== 1. Sifat halaman =====
cek("1a judul halaman", html.includes("Peta sistem &amp; logika bisnis PINDAI"));
cek("1b ditandai khusus admin", html.includes("Khusus admin"));
cek(
  "1c enam bagian bernomor",
  ["01", "02", "03", "04", "05", "06"].every((n) => html.includes(`>${n}<`)),
);
cek(
  "1d tanpa tautan kembali ke halaman publik",
  !html.includes('href="/"') && !html.includes("Kembali ke depan"),
);
cek("1e tanpa NaN", !html.includes("NaN"));
cek("1f tanpa undefined", !html.includes("undefined"));
// R-02 antislop: em dash dilarang pada teks yang dibaca admin.
cek("1g tanpa em dash", !html.includes("\u2014"));

// ===== 2. Angka ringkasan =====
const modulChips = cacah(html, "rounded-md border border-slate-200 bg-slate-50");
cek("2a 26 modul admin terdaftar", modulChips === 26, `ditemukan ${modulChips}`);
const rutePublik = cacah(html, "<code class=\"w-fit shrink-0 rounded bg-slate-100");
cek("2b 16 rute publik terdaftar", rutePublik === 16, `ditemukan ${rutePublik}`);
cek("2c ringkasan menyebut 26 modul", html.includes(">26<"));
cek("2d ringkasan menyebut 16 halaman", html.includes(">16<"));

// ===== 3. Rute penting benar-benar tertulis =====
for (const rute of ["/dashboard", "/auth", "/cek-status/:token", "/verifikasi-kontrak/:kode"]) {
  cek(`3 rute ${rute} tertulis`, html.includes(`>${rute}<`));
}

// ===== 4. Angka di halaman sama dengan kode =====
cek(
  "4a batas pokok tunai",
  html.includes(formatRupiah(LOAN_LIMITS.minPokok)) &&
    html.includes(formatRupiah(LOAN_LIMITS.maxPokok)),
);
cek(
  "4a2 plafon khusus menaikkan batas pokok",
  html.includes(formatRupiah(LOAN_LIMITS.maxPokokPlafon)),
);
/** "7, 14, 28" → "7, 14, atau 28", bentuk yang dipakai kalimat halaman. */
const daftarAtau = (nilai: readonly number[]) =>
  `${nilai.slice(0, -1).join(", ")}, atau ${nilai[nilai.length - 1]}`;

cek("4b tenor harian resmi", html.includes(daftarAtau(TENOR_OPTIONS)));
cek("4c tenor bulanan resmi", html.includes(daftarAtau(TENOR_BULANAN_OPTIONS)));
cek(
  "4d plafon baru, plafon teruji, dan batas override admin",
  html.includes(formatRupiah(PLAFON_BARU)) &&
    html.includes(formatRupiah(PLAFON_TERUJI)) &&
    html.includes(formatRupiah(PLAFON_BATAS.maks)),
);
cek(
  "4e tarif denda harian dan batasnya",
  html.includes(`${LATE_FEE_POLICY.percentPerDay}% per hari`) &&
    html.includes(`${LATE_FEE_POLICY.maxPercent}%`),
);
cek(
  "4f biaya pencairan ekspres per tier",
  BIAYA_EKSPRES_TIER.every((tier) => html.includes(formatRupiah(tier.biaya))),
);
cek(
  "4g gadai: LTV dan sewa modal",
  html.includes(`${GADAI_PRICING.ltvMaxPercent}%`) &&
    html.includes(
      `${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per ${GADAI_PRICING.periodeHari} hari`,
    ),
);
cek(
  "4h kredit barang: harga dan pokok maksimum",
  html.includes(formatRupiah(KREDIT_PRICING.minHargaBarang)) &&
    html.includes(formatRupiah(KREDIT_BARANG_POKOK_MAKS)),
);
cek("4i biaya roll-over", html.includes(formatRupiah(BIAYA_ROLLOVER)));
cek(
  "4j lima status kanonik",
  html.includes("Ditinjau, Disalurkan, Ditolak, Dibatalkan, Lunas"),
);
// Kalimat lama yang sudah tidak benar: tier 3 hanya "tepat Rp1.000.000" dan
// dana bersih selalu "98%" padahal skema harian juga dipotong biaya ekspres.
cek("4k tanpa klaim tier lama", !html.includes("tepat Rp1.000.000"));
cek("4l tanpa klaim dana bersih 98%", !html.includes("98%"));

console.log(`page-pengembangan.render: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
