/**
 * Uji render gerbang KYC di UI.
 * Run: bun src/components/kyc/PeringatanKyc.render.test.tsx
 *
 * Yang dijaga: nasabah yang belum VERIFIED melihat SEBAB kenapa tombol kirim
 * nonaktif — teksnya menyebut KYC diperlukan sebelum pengajuan dikirim, dan
 * CTA menuju tab KYC muncul hanya ketika pemanggil menyediakan callback.
 * Pengaman sesungguhnya ada di server (`requireKycTerverifikasi`); komponen ini
 * hanya memberi tahu lebih dulu.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { PeringatanKyc } from "@/components/kyc/PeringatanKyc";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const TANPA_CTA = renderToStaticMarkup(<PeringatanKyc />);
ok(
  TANPA_CTA.includes("KYC diperlukan sebelum pengajuan dapat dikirim"),
  "pesan sebab disebut",
);
ok(TANPA_CTA.includes("VERIFIED"), "status VERIFIED dijelaskan");
ok(
  !TANPA_CTA.includes("Buka Verifikasi KYC"),
  "tanpa callback: CTA tidak dirender",
);

const DENGAN_CTA = renderToStaticMarkup(<PeringatanKyc onBukaKyc={() => {}} />);
ok(
  DENGAN_CTA.includes("Buka Verifikasi KYC"),
  "dengan callback: CTA menuju tab KYC dirender",
);
ok(DENGAN_CTA.includes('role="status"'), "punya peran aksesibilitas status");
ok(!DENGAN_CTA.includes("undefined"), 'tanpa "undefined"');
ok(!DENGAN_CTA.includes("[object Object]"), 'tanpa "[object Object]"');

console.log(`PeringatanKyc.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
