/**
 * Uji render panel read-only "Data diri tersimpan" (dipakai dialog review
 * pinjaman & gadai).
 * Run: bun src/components/admin/PanelDataDiriNasabah.render.test.tsx
 *
 * Panel yang tersambung Convex tidak bisa dirender di luar aplikasi; bagian
 * murninya — `DataDiriRingkas` — dirender di sini. Yang dijaga: setiap bidang
 * terlihat (bukan "undefined"), angka uang diformat rupiah, asal-sumber
 * penyuntingan tampil sebagai lencana, dan foto KTP muncul lewat pratinjau
 * ber-watermark.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { DataDiriRingkas, VerifikasiIdentitasRingkas, type DataDiriTampil } from "./PanelDataDiriNasabah";

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

function data(overrides: Partial<DataDiriTampil> = {}): DataDiriTampil {
  return {
    nama: "Rani Puspita",
    email: "rani@pindai.test",
    ada: true,
    data: {
      namaLengkap: "Rani Puspita",
      nik: "3271012345678901",
      nomorWhatsApp: "6281234567890",
      alamat: "Jalan Merdeka No. 10, Bandung",
      pekerjaan: "Karyawan swasta",
      penghasilanBulanan: 5_000_000,
      namaBank: "BCA",
      nomorRekening: "1234567890",
    },
    fotoKtpUrl: "https://example.test/ktp.png",
    diperbaruiPada: 1_700_000_000_000,
    diperbaruiOlehLabel: "admin@pindai.test",
    sumber: "admin",
    verifikasiIdentitas: null,
    ...overrides,
  };
}

// ===== 1. Data lengkap, diisi admin, ada foto KTP =====
{
  const html = renderToStaticMarkup(<DataDiriRingkas data={data()} />);
  ada(html, "Data diri tersimpan", "judul panel tampil");
  ada(html, "diisi admin", "lencana sumber admin");
  ada(html, "3271012345678901", "NIK tampil");
  ada(html, "6281234567890", "nomor WhatsApp tampil");
  ada(html, "Jalan Merdeka No. 10, Bandung", "alamat tampil");
  ada(html, "Karyawan swasta", "pekerjaan tampil");
  ada(html, "Rp 5.000.000", "penghasilan diformat rupiah");
  ada(html, "1234567890", "nomor rekening tampil");
  ada(html, "https://example.test/ktp.png", "foto KTP tampil");
  // Watermark "VERIFIKASI PINDAI" baru muncul setelah gambar termuat (state
  // `loaded`), jadi tidak bisa diperiksa pada markup statis; yang bisa dipastikan
  // di sini adalah gambar KTP terpasang dengan labelnya.
  ada(html, 'alt="KTP tersimpan"', "label foto KTP terpasang");
  bersih(html, "panel data lengkap");
}

// ===== 2. Suntingan terakhir dari nasabah =====
{
  const html = renderToStaticMarkup(
    <DataDiriRingkas data={data({ sumber: "nasabah", diperbaruiOlehLabel: "rani@pindai.test" })} />,
  );
  ada(html, "terakhir diubah nasabah", "lencana sumber nasabah");
  ok(!html.includes("diisi admin"), "tidak salah menyebut diisi admin");
  ada(html, "rani@pindai.test", "label penyunting tampil");
  bersih(html, "panel suntingan nasabah");
}

// ===== 3. Belum ada data diri =====
{
  const html = renderToStaticMarkup(
    <DataDiriRingkas
      data={data({
        ada: false,
        data: {
          namaLengkap: "",
          nik: "",
          nomorWhatsApp: "",
          alamat: "",
          pekerjaan: "",
          penghasilanBulanan: null,
          namaBank: "",
          nomorRekening: "",
        },
        fotoKtpUrl: null,
        diperbaruiPada: null,
        diperbaruiOlehLabel: null,
        sumber: null,
      })}
    />,
  );
  ada(html, "Belum ada data diri tersimpan", "kabar belum ada data");
  ada(html, "Nasabah", "menunjuk ke panel Nasabah");
  bersih(html, "panel kosong");
}

// ===== 4. Ada data tapi tanpa foto KTP =====
{
  const html = renderToStaticMarkup(<DataDiriRingkas data={data({ fotoKtpUrl: null })} />);
  ada(html, "Belum ada foto KTP tersimpan.", "kabar tanpa foto KTP");
  bersih(html, "panel tanpa foto");
}

// ===== 5. Tanpa putusan verifikasi: JANGAN tampil sebagai terverifikasi =====
{
  const html = renderToStaticMarkup(<DataDiriRingkas data={data()} />);
  ada(html, "Belum diverifikasi", "kabar belum diverifikasi tampil");
  ok(!html.includes("Identitas terverifikasi"), "dokumen terunggah tidak disamakan terverifikasi");
  bersih(html, "panel belum diverifikasi");
}

// ===== 6. Putusan terverifikasi =====
{
  const html = renderToStaticMarkup(
    <VerifikasiIdentitasRingkas
      verifikasi={{
        status: "terverifikasi",
        pada: 1_700_000_000_000,
        olehLabel: "petugas@pindai.test",
      }}
    />,
  );
  ada(html, "Identitas terverifikasi", "putusan terverifikasi tampil");
  ada(html, "petugas@pindai.test", "petugas pemutus tampil");
  bersih(html, "panel terverifikasi");
}

// ===== 7. Putusan ditolak dengan alasan =====
{
  const html = renderToStaticMarkup(
    <VerifikasiIdentitasRingkas
      verifikasi={{
        status: "ditolak",
        pada: 1_700_000_000_000,
        olehLabel: "petugas@pindai.test",
        catatan: "Foto KTP buram, NIK tidak terbaca",
      }}
    />,
  );
  ada(html, "Verifikasi identitas ditolak", "putusan ditolak tampil");
  ada(html, "Foto KTP buram, NIK tidak terbaca", "alasan penolakan tampil");
  bersih(html, "panel ditolak");
}

console.log(`PanelDataDiriNasabah.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
