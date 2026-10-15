/**
 * Run: bun src/components/admin/WhatsAppPanel.render.test.tsx
 *
 * Uji render manajemen "Template pesan" lewat react-dom/server (tanpa DOM, tanpa
 * browser). Yang diperiksa adalah hal yang HANYA bisa dilihat dari markup panel:
 * chip placeholder benar-benar muncul sesuai izin jenisnya, placeholder wajib
 * yang belum ada ditandai, validasi jenis tampil apa adanya, tombol
 * "Lihat bawaan"/"Reset" ada, dan pratinjau memakai nilai contoh (bukan
 * `{jumlah}` mentah) — persis yang akan dibaca admin sebelum menyimpan.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { ManajemenTemplateWa } from "./WhatsAppPanel";
import { TEMPLATE_BAWAAN_WA } from "@/lib/templatePesanWa";

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
}

const tanpa = () => {};
const jenisTerpilih = (jenis: Parameters<typeof ManajemenTemplateWa>[0]["jenisAktif"]) =>
  renderToStaticMarkup(
    <ManajemenTemplateWa
      nilai={{}}
      onChange={tanpa}
      jenisAktif={jenis}
      onPilihJenis={tanpa}
    />,
  );

// ===== 1. Daftar semua jenis + keadaan bawaan (pengingat H-3) =====
{
  const html = jenisTerpilih("pengingat_h3");
  ada(html, "Manajemen template pesan", "judul bagian");
  ada(html, "Pengingat H-3", "jenis terpilih tampil");
  for (const label of [
    "Pengingat H-1",
    "Pengingat hari H",
    "Keterlambatan tahap 1",
    "Keterlambatan tahap 2",
    "Konfirmasi pembayaran",
    "Pelunasan",
    "Pencairan",
    "Kode OTP",
  ]) {
    ada(html, label, `jenis "${label}" ada di daftar`);
  }
  ada(html, "Memakai bawaan", "lencana keadaan bawaan");

  // Chip placeholder sesuai izin jenis: pengingat memakai hari/jatuh tempo/
  // metode bayar/kontak, dan TIDAK boleh menawarkan kode OTP.
  for (const chip of ["{hari}", "{jatuh_tempo}", "{metode_bayar}", "{kontak}", "{jumlah}"]) {
    ada(html, `+${chip}`, `chip ${chip} tersedia`);
  }
  tidakAda(html, "+{kode_otp}", "chip OTP tidak ditawarkan ke pengingat");
  tidakAda(html, "+{menit}", "chip menit tidak ditawarkan ke pengingat");
  ada(html, "wajib", "placeholder wajib ditandai");

  // Tombol yang diminta produk.
  ada(html, "Lihat bawaan", "tombol lihat bawaan ada");
  ada(html, "Reset", "tombol reset ada");

  // Pratinjau memakai nilai contoh, bukan placeholder mentah.
  ada(html, "RANI PUSPITA", "pratinjau menyapa nama contoh");
  ada(html, "Rp 1.500.000", "pratinjau memuat nominal contoh");
  ada(html, "Total kewajiban tercatat", "pratinjau memakai teks bawaan");
  bersih(html, "editor pengingat");
}

// ===== 2. Jenis OTP: chip kode & menit, tanpa chip nama =====
{
  const html = jenisTerpilih("otp");
  ada(html, "+{kode_otp}", "chip kode OTP tersedia untuk OTP");
  ada(html, "+{menit}", "chip menit tersedia untuk OTP");
  tidakAda(html, "+{nama}", "OTP tidak menawarkan placeholder nama");
  ada(html, "123456", "pratinjau OTP menampilkan kode contoh");
  bersih(html, "editor OTP");
}

// ===== 3. Template tidak sah: alasan tampil, bukan disimpan diam-diam =====
{
  const html = renderToStaticMarkup(
    <ManajemenTemplateWa
      nilai={{ otp: "Kode Anda: {kode_otp}" }}
      onChange={tanpa}
      jenisAktif="otp"
      onPilihJenis={tanpa}
    />,
  );
  ada(html, "Diubah", "template tersimpan dihitung sebagai diubah");
  ada(html, "Wajib memuat {menit}.", "alasan validasi tampil");
  ada(html, "Tambahkan {menit} lewat chip di atas.", "petunjuk perbaikan tampil");
  bersih(html, "editor tidak sah");
}

// ===== 4. Template asing ditolak dengan alasan yang bisa dibaca =====
{
  const html = renderToStaticMarkup(
    <ManajemenTemplateWa
      nilai={{ pelunasan: "Halo {nama}, salam {foo}." }}
      onChange={tanpa}
      jenisAktif="pelunasan"
      onPilihJenis={tanpa}
    />,
  );
  ada(html, "Placeholder tidak dikenal: {foo}.", "placeholder asing dilaporkan");
  bersih(html, "editor placeholder asing");
}

// ===== 5. Teks bawaan yang ditampilkan benar-benar bawaan resmi =====
{
  const html = jenisTerpilih("terlambat_2");
  const cuplikan = TEMPLATE_BAWAAN_WA.terlambat_2.slice(0, 40);
  ada(html, cuplikan, "pratinjau memakai teks bawaan terlambat tahap 2");
  ada(html, "Total kewajiban saat ini", "pratinjau terlambat memuat nominal");
  bersih(html, "editor terlambat");
}

console.log(`\nWhatsAppPanel.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
