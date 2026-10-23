/**
 * Berkas PDF surat somasi.
 *
 * Bentuk halamannya memakai mesin dokumen resmi yang sama dengan rincian
 * pinjaman: banner navy, kartu identitas, tabel kewajiban rata kanan, dan
 * peringatan keamanan. Tidak ada pustaka baru dan tidak ada angka yang dihitung
 * ulang di sini — semuanya datang dari `SuratSomasi`.
 */
import { susunPdfResmi, type BarisTabelResmi, type BlokResmiPdf } from "./pdfSederhana";
import type { SuratSomasi } from "./suratSomasi";

export function buatPdfSomasi(surat: SuratSomasi): Uint8Array {
  const namaBadan = surat.identitas.namaBadan.trim() || "PINDAI";
  const pesanKeamanan = `${namaBadan} tidak pernah meminta kode OTP, PIN, atau kata sandi lewat WhatsApp maupun email.`;

  const rincian: BarisTabelResmi[] = surat.rincian.map((baris, indeks) => ({
    sel: [baris.label, baris.nilai],
    ...(indeks === surat.rincian.length - 1
      ? { nada: "total" as const, tebal: true }
      : {}),
  }));

  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: "Surat Somasi Digital",
      nomor: surat.nomorSurat,
      tanggal: `Tanggal: ${surat.tanggalTeks}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: "Penerima & Perihal",
        baris: [
          { label: "Kepada", nilai: surat.kepada },
          { label: "Perihal", nilai: surat.perihal },
          { label: "Tanggal surat", nilai: surat.tanggalTeks },
          { label: "Keterlambatan", nilai: `${surat.hariTerlambat} hari`, nada: "potongan" },
        ],
      },
      kanan: {
        judul: "Identitas Penerbit",
        baris: [
          { label: "Badan", nilai: namaBadan },
          { label: "Alamat", nilai: surat.identitas.alamat.trim() || "Belum dicatat" },
          { label: "Email", nilai: surat.identitas.email.trim() || "Belum dicatat" },
          { label: "Telepon", nilai: surat.identitas.telepon.trim() || "Belum dicatat" },
        ],
      },
    },
    { jenis: "judul", teks: "Isi Surat" },
    ...surat.paragraf.map((teks): BlokResmiPdf => ({ jenis: "paragraf", teks })),
    { jenis: "judul", teks: "Rincian Kewajiban" },
    {
      jenis: "tabel",
      kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
      bobot: [8, 2],
      rataKanan: [1],
      baris: rincian,
    },
    {
      jenis: "callout",
      label: "Total yang harus dibayar",
      nilai: surat.rincian[surat.rincian.length - 1]?.nilai ?? "Belum dihitung",
      catatan: `Batas pembayaran ${surat.batasBayarTeks}.`,
    },
    { jenis: "judul", teks: "Cara Pembayaran" },
    {
      jenis: "poin",
      teks: surat.instruksiBayar.map((instruksi, i) => `${i + 1}. ${instruksi}`),
    },
    { jenis: "jarak", tinggi: 8 },
  ];

  const penutup = surat.penutup.filter(
    (teks) => !teks.includes("tidak pernah meminta kode OTP"),
  );
  blok.push(...penutup.map((teks): BlokResmiPdf => ({ jenis: "paragraf", teks })));

  blok.push(
    { jenis: "jarak", tinggi: 10 },
    { jenis: "peringatan", judul: "Himbauan Keamanan Transaksi", teks: pesanKeamanan },
    { jenis: "jarak", tinggi: 6 },
    { jenis: "paragraf", teks: surat.pembuat },
    { jenis: "paragraf", teks: `Dokumen dibuat ${surat.tanggalTeks} melalui aplikasi PINDAI.`, kecil: true },
  );

  return susunPdfResmi({
    nomor: surat.nomorSurat,
    judul: "SURAT SOMASI",
    kaki: `PINDAI — Surat Somasi Resmi · ${namaBadan}`,
    blok,
  });
}
