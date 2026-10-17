/**
 * Uji render penampil dokumen KYC (tanpa Convex/DOM).
 * Run: bun src/components/admin/PenampilDokumen.render.test.tsx
 *
 * Kenapa ada: gambar yang disembunyikan dengan `display:none` sambil memakai
 * `loading="lazy"` TIDAK PERNAH dimuat peramban — tidak ada kotak tata letak
 * untuk dihitung, jadi `onLoad` tidak pernah menyala dan spinner berputar
 * selamanya (gejala "blank" pada modal lampiran). Uji ini menjaga agar keadaan
 * "belum termuat" tetap memakai transparansi, bukan `hidden`, dan agar gambar
 * tidak lagi memakai lazy-loading.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { PenampilDokumen } from "@/components/admin/PenampilDokumen";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(teks: string, cari: string, label: string): void {
  ok(teks.includes(cari), `${label} (memuat "${cari}")`);
}
function tidakAda(teks: string, cari: string, label: string): void {
  ok(!teks.includes(cari), `${label} (tidak memuat "${cari}")`);
}

const SRC = "https://contoh.test/ktp.jpg";

// ===== PenampilDokumen (modal lampiran admin) =====
const penampil = renderToStaticMarkup(<PenampilDokumen src={SRC} label="KTP" />);
ada(penampil, `src="${SRC}"`, "gambar penampil memakai URL dokumen");
ada(penampil, 'alt="KTP"', "label dokumen dipakai sebagai alt");
tidakAda(penampil, 'loading="lazy"', "penampil tidak memakai lazy-loading");
tidakAda(penampil, "object-contain hidden", "gambar tidak disembunyikan display:none");
ada(penampil, "object-contain transition-opacity duration-150 opacity-0", "keadaan belum termuat = transparan");
ada(penampil, "animate-spin", "spinner tampil selama menunggu");
ada(penampil, 'aria-label="Perbesar KTP"', "kontrol zoom tetap ada");
ada(penampil, 'aria-label="Perkecil KTP"', "kontrol perkecil tetap ada");

// ===== WatermarkedDoc (daftar ringkas) =====
const tandaAir = renderToStaticMarkup(<WatermarkedDoc src={SRC} label="Selfie" />);
ada(tandaAir, `src="${SRC}"`, "gambar tanda air memakai URL dokumen");
ada(tandaAir, 'alt="Selfie"', "label tanda air dipakai sebagai alt");
tidakAda(tandaAir, 'loading="lazy"', "tanda air tidak memakai lazy-loading");
tidakAda(tandaAir, "object-contain hidden", "gambar tanda air tidak disembunyikan display:none");
ada(tandaAir, "opacity-0", "keadaan belum termuat tetap bertata letak");
ada(tandaAir, "animate-spin", "spinner tampil selama menunggu");

console.log(`penampil-dokumen: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
