/**
 * Uji render gerbang KYC di UI.
 * Run: bun src/components/kyc/PeringatanKyc.render.test.tsx
 *
 * Yang dijaga:
 * 1. Nasabah yang belum VERIFIED melihat SEBAB kenapa tombol kirim nonaktif —
 *    teksnya menyebut KYC diperlukan sebelum pengajuan dikirim, dan CTA menuju
 *    tab KYC muncul hanya ketika pemanggil menyediakan callback.
 * 2. Nasabah yang SUDAH terverifikasi melihat badge hijau beserta ringkasan
 *    identitas yang dipakai pengajuan (NIK bertopeng, bukan utuh).
 *
 * Pengaman sesungguhnya ada di server (`requireKycTerverifikasi`); komponen ini
 * hanya memberi tahu lebih dulu — dan badge hijau hanya muncul bila pemanggil
 * memang memegang isian KYC yang lengkap.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { IdentitasKycTerverifikasi, PeringatanKyc } from "@/components/kyc/PeringatanKyc";

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

// --- Badge hijau: identitas sudah terverifikasi -----------------------------

const TERVERIFIKASI = renderToStaticMarkup(
  <IdentitasKycTerverifikasi
    namaLengkap="RANI PEMINJAM"
    nik="3204123456789012"
    nomorWhatsApp="6281234567890"
  />,
);
ok(
  TERVERIFIKASI.includes("Identitas &amp; KYC Terverifikasi") ||
    TERVERIFIKASI.includes("Identitas & KYC Terverifikasi"),
  "badge menyatakan identitas & KYC terverifikasi",
);
ok(TERVERIFIKASI.includes("Data disimpan aman"), "badge menyebut data disimpan aman");
ok(TERVERIFIKASI.includes("RANI PEMINJAM"), "nama dari KYC ditampilkan");
ok(TERVERIFIKASI.includes("6281234567890"), "nomor WhatsApp ditampilkan");
ok(
  TERVERIFIKASI.includes("3204••••••••9012") && !TERVERIFIKASI.includes("3204123456789012"),
  "NIK ditampilkan bertopeng",
);
ok(
  !TERVERIFIKASI.includes("Buka Verifikasi KYC"),
  "tanpa callback: CTA tidak dirender di badge",
);
ok(!TERVERIFIKASI.includes("KYC diperlukan"), "badge bukan peringatan kekurangan KYC");

const TERVERIFIKASI_CTA = renderToStaticMarkup(
  <IdentitasKycTerverifikasi
    namaLengkap="RANI PEMINJAM"
    nik="3204123456789012"
    nomorWhatsApp="6281234567890"
    onBukaKyc={() => {}}
  />,
);
ok(
  TERVERIFIKASI_CTA.includes("Kelola data di Verifikasi KYC"),
  "dengan callback: jalan ke tab KYC tersedia",
);
ok(TERVERIFIKASI_CTA.includes('role="status"'), "badge punya peran aksesibilitas status");
ok(!TERVERIFIKASI_CTA.includes("undefined"), 'badge tanpa "undefined"');

console.log(`PeringatanKyc.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
