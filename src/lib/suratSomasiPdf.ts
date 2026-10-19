/**
 * Berkas PDF surat somasi. Bentuk halamannya memakai penulis PDF yang sama
 * dengan rincian pinjaman dan laporan pendana, jadi tidak ada pustaka baru dan
 * hasilnya tetap satu gaya dokumen PINDAI.
 */
import { susunPdf, type BarisPdf } from "./pdfSederhana";
import type { SuratSomasi } from "./suratSomasi";

export function buatPdfSomasi(surat: SuratSomasi): Uint8Array {
  const baris: BarisPdf[] = [
    { teks: "PINDAI", gaya: "judul" },
    { teks: "SURAT SOMASI", gaya: "subjudul" },
    { teks: `Nomor: ${surat.nomorSurat}`, gaya: "biasa" },
    { teks: `Tanggal: ${surat.tanggalTeks}`, gaya: "biasa" },
    { garis: true },
    { teks: "Kepada", gaya: "seksi" },
    { teks: surat.kepada, gaya: "tebal" },
    { teks: `Perihal: ${surat.perihal}`, gaya: "biasa" },
    { kosong: true },
  ];

  for (const paragraf of surat.paragraf) baris.push({ teks: paragraf, gaya: "biasa" });

  baris.push({ kosong: true }, { teks: "Rincian kewajiban", gaya: "seksi" });
  surat.rincian.forEach((r, indeks) => {
    baris.push({
      teks: `${r.label}: ${r.nilai}`,
      gaya: indeks === surat.rincian.length - 1 ? "tebal" : "biasa",
    });
  });

  baris.push({ kosong: true }, { teks: "Cara pembayaran", gaya: "seksi" });
  surat.instruksiBayar.forEach((instruksi, indeks) => {
    baris.push({ teks: `${indeks + 1}. ${instruksi}`, gaya: "biasa" });
  });

  baris.push({ kosong: true });
  for (const paragraf of surat.penutup) baris.push({ teks: paragraf, gaya: "biasa" });

  baris.push(
    { kosong: true },
    { teks: surat.pembuat, gaya: "tebal" },
    { teks: `Dokumen dibuat ${surat.tanggalTeks} melalui aplikasi PINDAI.`, gaya: "kecil" },
  );

  return susunPdf({
    kaki: `Surat somasi ${surat.nomorSurat} - PINDAI`,
    baris,
  });
}
