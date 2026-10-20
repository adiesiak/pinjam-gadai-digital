/** Run: bun src/components/PreferensiNotifikasi.render.test.tsx */
import { renderToStaticMarkup } from "react-dom/server";

import { KartuPengingatWhatsapp } from "./PreferensiNotifikasi";

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
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const aktif = (tambahan: Partial<Parameters<typeof KartuPengingatWhatsapp>[0]> = {}) =>
  renderToStaticMarkup(
    <KartuPengingatWhatsapp
      aktif
      efektif
      globalAktif
      nomorWhatsapp="628123450001"
      sibuk={false}
      galat={null}
      onUbah={() => {}}
      {...tambahan}
    />,
  );

// ===== Aktif =====
{
  const html = aktif();
  ada(html, "Pengingat WhatsApp", "judul kartu tampil");
  ada(html, "Pengingat tagihan lewat WhatsApp", "label sakelar tampil");
  ada(html, "Pengingat tagihan lewat WhatsApp aktif.", "status aktif dijelaskan");
  ada(html, "628123450001", "nomor WhatsApp tampil");
  ada(html, "Aktif", "keadaan sakelar terbaca sebagai teks");
  ada(html, 'role="switch"', "sakelar memakai peran switch");
  ada(html, "kode OTP tetap dikirim", "pesan keamanan dikecualikan dengan jelas");
  bersih(html, "kartu aktif");
}

// ===== Nonaktif =====
{
  const html = aktif({ aktif: false, efektif: false });
  ada(html, "Nonaktif", "keadaan nonaktif terbaca sebagai teks");
  ada(html, "Notifikasi di aplikasi tetap masuk.", "nasabah tahu notifikasi in-app tetap ada");
  tidakAda(html, "Pengingat tagihan lewat WhatsApp aktif.", "tidak mengklaim pengingat aktif");
  bersih(html, "kartu nonaktif");
}

// ===== Global menahan kanal =====
{
  const html = aktif({ globalAktif: false, efektif: false });
  ada(
    html,
    "PINDAI sedang mematikan pengingat WhatsApp untuk semua akun",
    "alasan kanal ditahan dijelaskan",
  );
  ada(html, "Pilihan Anda disimpan", "pilihan nasabah tidak hilang");
  bersih(html, "kartu ditahan global");
}

// ===== Nomor belum ada =====
{
  const html = aktif({ nomorWhatsapp: null });
  ada(html, "Nomor WhatsApp belum lengkap", "kekurangan nomor dijelaskan");
  ada(html, "Lengkapi di Data Diri", "jalan keluar diberikan");
  bersih(html, "kartu tanpa nomor");
}

// ===== Menyimpan dan galat =====
{
  const html = aktif({
    sibuk: true,
    galat: "Pilihan pengingat WhatsApp gagal disimpan. Coba lagi.",
  });
  ada(html, "Menyimpan pilihan", "status menyimpan diumumkan");
  ada(html, "gagal disimpan", "galat tampil");
  ada(html, 'role="alert"', "galat memakai peran alert");
  ada(html, 'aria-live="polite"', "status diumumkan ke pembaca layar");
  bersih(html, "kartu dengan galat");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render preferensi notifikasi gagal`);
}
console.log(`PreferensiNotifikasi.render: ${passed} lulus`);
