/**
 * Uji render kartu pengaturan kanal pengingat.
 * Run: bun src/components/PreferensiNotifikasi.render.test.tsx
 *
 * Yang dijaga:
 *  - kedua kanal tampil dengan tujuan yang benar-benar dipakai, bukan alamat
 *    contoh;
 *  - keadaan aktif/nonaktif terbaca sebagai TEKS, bukan hanya posisi sakelar;
 *  - kanal tanpa tujuan menjelaskan apa yang kurang;
 *  - pesan menyimpan/galat tidak menghilang dari pembaca layar.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { KartuPreferensiNotifikasi } from "./PreferensiNotifikasi";

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

// ===== Kedua kanal aktif dengan tujuan =====
{
  const html = renderToStaticMarkup(
    <KartuPreferensiNotifikasi
      nilai={{ whatsapp: true, email: true }}
      nomorWhatsapp="628123450001"
      emailAlamat="rani@pindai.test"
      sibuk={null}
      galat={null}
      onUbah={() => {}}
    />,
  );
  ada(html, "Pengingat tagihan", "judul kartu tampil");
  ada(html, "WhatsApp", "baris WhatsApp tampil");
  ada(html, "Email", "baris email tampil");
  ada(html, "628123450001", "nomor WhatsApp tujuan tampil");
  ada(html, "rani@pindai.test", "alamat email tujuan tampil");
  ok((html.match(/Aktif/g) ?? []).length >= 2, "kedua kanal berlabel Aktif");
  tidakAda(html, "Nonaktif", "tidak ada label nonaktif saat keduanya aktif");
  ada(html, "Pengingat lewat WhatsApp", "sakelar WhatsApp punya label aksesibel");
  ada(html, "Pengingat lewat Email", "sakelar email punya label aksesibel");
  ada(html, "Kode OTP", "pengecualian pesan keamanan dijelaskan");
  ada(html, "Berlaku untuk akun ini", "menyatakan cakupan pilihan");
  bersih(html, "kartu aktif");
}

// ===== Keduanya mati, tanpa tujuan =====
{
  const html = renderToStaticMarkup(
    <KartuPreferensiNotifikasi
      nilai={{ whatsapp: false, email: false }}
      nomorWhatsapp={null}
      emailAlamat={null}
      sibuk={null}
      galat={null}
      onUbah={() => {}}
    />,
  );
  ok((html.match(/Nonaktif/g) ?? []).length >= 2, "kedua kanal berlabel Nonaktif");
  tidakAda(html, ">Aktif<", "tidak ada label aktif saat keduanya mati");
  ada(html, "Belum ada nomor WhatsApp", "kekurangan nomor dijelaskan");
  ada(html, "Akun ini belum punya alamat email", "kekurangan email dijelaskan");
  ada(html, "tetap tersimpan", "notifikasi in-app dijelaskan tetap ada");
  bersih(html, "kartu nonaktif");
}

// ===== Sedang menyimpan dan galat =====
{
  const html = renderToStaticMarkup(
    <KartuPreferensiNotifikasi
      nilai={{ whatsapp: false, email: true }}
      nomorWhatsapp="628123450001"
      emailAlamat="rani@pindai.test"
      sibuk="whatsapp"
      galat="Pilihan notifikasi gagal disimpan. Coba lagi."
      onUbah={() => {}}
    />,
  );
  ada(html, "Menyimpan pilihan", "status menyimpan diumumkan");
  ada(html, "gagal disimpan", "galat tampil sebagai kalimat");
  ada(html, 'role="alert"', "galat memakai peran alert");
  ada(html, 'aria-live="polite"', "status menyimpan diumumkan ke pembaca layar");
  bersih(html, "kartu dengan galat");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render preferensi notifikasi gagal`);
}
console.log(`PreferensiNotifikasi: ${passed} lulus`);
