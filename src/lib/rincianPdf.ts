/**
 * DOKUMEN PDF RINCIAN PINJAMAN.
 *
 * Bentuk dokumennya disusun di sini, sedangkan byte PDF-nya ditulis
 * `lib/pdfSederhana` — penulis PDF yang sama dengan laporan pendana. Rincian
 * ini dipakai lampiran email dan WhatsApp, jadi isinya hanya datang dari
 * `DokumenRincianPinjaman` supaya kedua kanal tidak pernah berbeda angka.
 */
import { susunPdf, type BarisPdf } from "./pdfSederhana";
import type { DokumenRincianPinjaman } from "./rincianPinjaman";

export function buatPdfRincian(dok: DokumenRincianPinjaman): Uint8Array {
  const baris: BarisPdf[] = [
    { teks: "PINDAI", gaya: "judul" },
    { teks: `Rincian pinjaman ${dok.nomorReferensi}`, gaya: "subjudul" },
    { teks: dok.namaPeminjam, gaya: "tebal" },
    { teks: `${dok.statusLabel}, tenor ${dok.tenorTeks} (${dok.skemaTeks})`, gaya: "biasa" },
    { teks: `Dokumen dibuat ${dok.diajukanTeks}`, gaya: "kecil" },
    { garis: true },
  ];

  for (const kelompok of dok.kelompok) {
    baris.push({ teks: kelompok.judul, gaya: "seksi" });
    for (const isi of kelompok.baris) {
      baris.push({
        teks: `${isi.label}: ${isi.nilai}`,
        gaya: isi.tegas === true ? "tebal" : "biasa",
      });
    }
    baris.push({ kosong: true });
  }

  if (dok.jadwal !== null) {
    baris.push({ teks: dok.jadwal.judul, gaya: "seksi" });
    const kolom = dok.jadwal.kolom;
    for (const isi of dok.jadwal.baris) {
      const rincian = isi
        .slice(1)
        .map((nilai, indeks) => `${kolom[indeks + 1] ?? ""} ${nilai}`.trim())
        .join("  |  ");
      baris.push({ teks: `${isi[0]}: ${rincian}`, gaya: "kecil" });
    }
    baris.push({ kosong: true });
  }

  baris.push({ teks: "Catatan", gaya: "seksi" });
  for (const catatan of dok.catatan) baris.push({ teks: catatan, gaya: "kecil" });

  return susunPdf({
    kaki: `Rincian pinjaman ${dok.nomorReferensi} - dibuat otomatis oleh PINDAI`,
    baris,
  });
}
