/**
 * Run: bun src/components/PratinjauBanner.render.test.tsx
 *
 * Uji render bilah pratinjau lewat react-dom/server (tanpa DOM, tanpa browser).
 * Yang dipastikan: bilah SELALU memberi jalan pulang ke Mode Admin pada ketiga
 * keadaannya, menyebut akun yang sedang dibuka beserta batas waktunya, dan
 * tetap terbaca sebagai satu wilayah yang jelas bagi pembaca layar.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { BilahPratinjau } from "./PratinjauBanner";

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

const tanpaAksi = () => {};

// ===== 1. Pratinjau berjalan =====
{
  const html = renderToStaticMarkup(
    <BilahPratinjau
      mode="aktif"
      info={{
        adminLabel: "admin@pindai.test",
        targetLabel: "Robert Tanaya",
        berlakuHingga: new Date("2026-10-16T09:30:00+07:00").getTime(),
      }}
      busy={false}
      onKembali={tanpaAksi}
    />,
  );
  ada(html, "Bilah pratinjau Super Admin", "wilayah berlabel");
  ada(html, "Mode pratinjau", "penanda mode");
  ada(html, "Robert Tanaya", "akun yang sedang dibuka");
  ada(html, "admin@pindai.test", "admin pembuka pratinjau");
  ada(html, "Berlaku sampai", "batas waktu disebut");
  ada(html, "Lokasi tidak dipantau", "pembatasan lokasi diumumkan");
  ada(html, "transaksi diblokir", "pemblokiran transaksi diumumkan");
  ada(html, "Kembali ke Mode Admin", "tombol pulang tersedia");
  bersih(html, "bilah aktif");
}

// ===== 2. Detail belum tiba: bilah tetap tampil =====
{
  const html = renderToStaticMarkup(
    <BilahPratinjau mode="memuat" busy={false} onKembali={tanpaAksi} />,
  );
  ada(html, "Mode pratinjau", "penanda mode tetap ada saat memuat");
  ada(html, "Menyiapkan detail pratinjau", "keadaan memuat diumumkan");
  ada(html, "Kembali ke Mode Admin", "tombol pulang ada walau detail belum tiba");
  bersih(html, "bilah memuat");
}

// ===== 3. Pratinjau berakhir: salinan sesi admin masih ada =====
{
  const html = renderToStaticMarkup(
    <BilahPratinjau mode="berakhir" busy={false} onKembali={tanpaAksi} />,
  );
  ada(html, "sudah berakhir", "keadaan berakhir dijelaskan");
  ada(html, "Sesi admin Anda masih tersimpan", "jalan pulang dijelaskan");
  ada(html, "Kembali ke Mode Admin", "tombol pulang ada saat berakhir");
  ok(!html.includes("Robert"), "nama akun tidak dikarang saat pratinjau berakhir");
  bersih(html, "bilah berakhir");
}

// ===== 4. Sedang memproses: tombol tidak bisa ditekan dua kali =====
{
  const html = renderToStaticMarkup(
    <BilahPratinjau
      mode="aktif"
      info={{ adminLabel: "a@b.test", targetLabel: "Rani", berlakuHingga: Date.now() }}
      busy
      onKembali={tanpaAksi}
    />,
  );
  ada(html, "disabled", "tombol pulang nonaktif saat proses berjalan");
  bersih(html, "bilah sibuk");
}

console.log(`\nPratinjauBanner.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
