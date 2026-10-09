/**
 * Uji render bilah progres unggahan.
 * Run: bun src/components/ui/bilahProgres.render.test.tsx
 *
 * Kontrak yang dijaga: bilah HANYA menampilkan angka saat angkanya benar-benar
 * diketahui (`aria-valuenow` + persen terlihat). Saat total byte tidak
 * diketahui, bilahnya harus kembali tak tentu — tanpa `aria-valuenow`, tanpa
 * satu pun tanda persen — supaya tidak ada progres yang dikarang di layar.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { BilahProgres } from "./loading";

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

// ===== 1. Angka nyata: determinate =====
{
  const html = renderToStaticMarkup(<BilahProgres nilai={42} label="Mengunggah Foto KTP" />);
  ada(html, 'role="progressbar"', "bilah punya peran progressbar");
  ada(html, 'aria-valuenow="42"', "nilai progres diumumkan pembaca layar");
  ada(html, 'aria-valuemin="0"', "batas bawah diumumkan");
  ada(html, 'aria-valuemax="100"', "batas atas diumumkan");
  ada(html, "width:42%", "lebar bilah mengikuti angka nyata");
  ada(html, "42%", "persen terlihat sebagai angka");
  ada(html, "Mengunggah Foto KTP", "nama pekerjaan tampil");
}

// ===== 2. Nol persen tetap angka nyata (bukan tak tentu) =====
{
  const html = renderToStaticMarkup(<BilahProgres nilai={0} label="Mengunggah berkas" />);
  ada(html, 'aria-valuenow="0"', "0% tetap nilai yang sah");
  ada(html, "width:0%", "bilah kosong saat belum ada byte terkirim");
}

// ===== 3. Total tidak diketahui: tak tentu, tanpa angka apa pun =====
{
  const html = renderToStaticMarkup(<BilahProgres nilai={null} label="Memeriksa isi dokumen" />);
  ada(html, 'role="progressbar"', "keadaan tak tentu tetap progressbar");
  tidakAda(html, "aria-valuenow", "tanpa nilai: tidak ada angka yang dikarang");
  tidakAda(html, "%", "tanpa nilai: tidak ada tanda persen sama sekali");
  ada(html, "Memeriksa isi dokumen", "nama pekerjaan tetap diumumkan");
  ada(html, 'aria-live="polite"', "keadaan tak tentu diumumkan sebagai status");
}

console.log(`bilahProgres.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
