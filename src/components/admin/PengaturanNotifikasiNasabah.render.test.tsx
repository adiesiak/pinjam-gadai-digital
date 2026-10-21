/**
 * Uji render kartu notifikasi per nasabah (panel admin).
 * Run: bun src/components/admin/PengaturanNotifikasiNasabah.render.test.tsx
 *
 * Yang dijaga: keadaan tersimpan dan keadaan EFEKTIF ditampilkan terpisah,
 * sehingga admin tahu kapan sebuah kanal ditahan sakelar global. Kartu juga
 * menyatakan bahwa hanya Super Admin yang dapat mengubahnya. Tombol cepat di
 * daftar nasabah diuji terpisah: labelnya harus mengikuti keadaan kedua kanal.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  KartuNotifikasiNasabah,
  TombolNotifikasiTagihan,
} from "./PengaturanNotifikasiNasabah";

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

// ===== Keduanya aktif dan global menyala =====
{
  const html = renderToStaticMarkup(
    <KartuNotifikasiNasabah
      nilai={{ whatsapp: true, email: true }}
      nomorWhatsapp="628123450001"
      emailAlamat="rani@pindai.test"
      efektifWhatsapp
      efektifEmail
      globalWhatsapp
      globalEmail
      sibuk={null}
      galat={null}
      onUbah={() => {}}
    />,
  );
  ada(html, "Notifikasi nasabah ini", "judul kartu tampil");
  ada(html, "628123450001", "nomor WhatsApp tampil");
  ada(html, "rani@pindai.test", "alamat email tampil");
  ok((html.match(/Pengingat berjalan/g) ?? []).length === 2, "kedua kanal berjalan");
  ok((html.match(/Aktif/g) ?? []).length >= 2, "kedua sakelar berlabel Aktif");
  ada(html, "Pengingat WhatsApp untuk nasabah ini", "sakelar WhatsApp berlabel aksesibel");
  ada(html, "Pengingat Email untuk nasabah ini", "sakelar email berlabel aksesibel");
  ada(html, "Hanya", "menyatakan siapa yang berwenang");
  ada(html, "Super Admin", "wewenang Super Admin disebut");
  tidakAda(html, "Profil & Rekening", "tidak lagi menunjuk sakelar nasabah");
  bersih(html, "kartu aktif");
}

// ===== Pengaturan aktif, tetapi global mati =====
{
  const html = renderToStaticMarkup(
    <KartuNotifikasiNasabah
      nilai={{ whatsapp: true, email: true }}
      nomorWhatsapp="628123450001"
      emailAlamat="rani@pindai.test"
      efektifWhatsapp={false}
      efektifEmail={false}
      globalWhatsapp={false}
      globalEmail={false}
      sibuk={null}
      galat={null}
      onUbah={() => {}}
    />,
  );
  ok(
    (html.match(/Ditahan sakelar global/g) ?? []).length === 2,
    "kedua kanal ditandai ditahan global",
  );
  tidakAda(html, "Pengingat berjalan", "tidak mengklaim pengingat berjalan");
  ada(html, "Nyalakan sakelar global", "admin diberi jalan keluar");
  bersih(html, "kartu ditahan global");
}

// ===== Pilihan nasabah mati =====
{
  const html = renderToStaticMarkup(
    <KartuNotifikasiNasabah
      nilai={{ whatsapp: false, email: false }}
      nomorWhatsapp={null}
      emailAlamat={null}
      efektifWhatsapp={false}
      efektifEmail={false}
      globalWhatsapp
      globalEmail
      sibuk={null}
      galat={null}
      onUbah={() => {}}
    />,
  );
  ok((html.match(/Nonaktif/g) ?? []).length >= 2, "kedua sakelar berlabel Nonaktif");
  ada(html, "Nasabah belum punya nomor WhatsApp", "kekurangan nomor dijelaskan");
  ada(html, "Nasabah belum punya alamat email", "kekurangan email dijelaskan");
  ada(html, "Pengingat tidak dikirim", "keadaan akhir dijelaskan");
  bersih(html, "kartu nonaktif");
}

// ===== Menyimpan dan galat =====
{
  const html = renderToStaticMarkup(
    <KartuNotifikasiNasabah
      nilai={{ whatsapp: false, email: true }}
      nomorWhatsapp="628123450001"
      emailAlamat="rani@pindai.test"
      efektifWhatsapp={false}
      efektifEmail
      globalWhatsapp
      globalEmail
      sibuk="whatsapp"
      galat="Pilihan notifikasi nasabah gagal disimpan. Coba lagi."
      onUbah={() => {}}
    />,
  );
  ada(html, "Menyimpan pilihan", "status menyimpan diumumkan");
  ada(html, "gagal disimpan", "galat tampil");
  ada(html, 'role="alert"', "galat memakai peran alert");
  ada(html, 'aria-live="polite"', "status diumumkan ke pembaca layar");
  bersih(html, "kartu dengan galat");
}

// ===== Tombol cepat di daftar nasabah =====
{
  const html = renderToStaticMarkup(
    <TombolNotifikasiTagihan nama="RANI PEMINJAM" aktif sibuk={false} onUbah={() => {}} />,
  );
  ada(html, "Matikan tagihan", "tombol menawarkan mematikan saat tagihan aktif");
  tidakAda(html, "Nyalakan tagihan", "tidak menawarkan menyalakan saat sudah aktif");
  ada(html, "Matikan tagihan untuk RANI PEMINJAM", "label aksesibel menyebut nasabah");
  ada(html, "Hentikan pengingat tagihan", "tooltip menjelaskan akibatnya");
  bersih(html, "tombol tagihan aktif");
}
{
  const html = renderToStaticMarkup(
    <TombolNotifikasiTagihan nama="RANI PEMINJAM" aktif={false} sibuk={false} onUbah={() => {}} />,
  );
  ada(html, "Nyalakan tagihan", "tombol menawarkan menyalakan saat tagihan mati");
  tidakAda(html, "Matikan tagihan", "tidak menawarkan mematikan saat sudah mati");
  ada(html, "Kirim lagi pengingat tagihan", "tooltip menjelaskan pemulihannya");
  bersih(html, "tombol tagihan mati");
}
{
  const html = renderToStaticMarkup(
    <TombolNotifikasiTagihan nama="RANI PEMINJAM" aktif sibuk onUbah={() => {}} />,
  );
  ada(html, "disabled", "tombol tidak dapat ditekan ganda saat menyimpan");
  ada(html, "animate-spin", "penanda proses tampil selama menyimpan");
  bersih(html, "tombol tagihan sibuk");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render notifikasi nasabah gagal`);
}
console.log(`PengaturanNotifikasiNasabah: ${passed} lulus`);
