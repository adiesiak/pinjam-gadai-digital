/**
 * Uji PDF laporan efektivitas promo.
 * Run: bun src/lib/laporanPromoPdf.test.ts
 *
 * Yang dijaga: berkas PDF sah, angka laporan tercetak apa adanya, periode
 * saringan disebut, dan catatan batas 500 muncul hanya saat perlu.
 */
import { buatPdfLaporanPromo } from "./laporanPromoPdf";
import { teksPdf } from "./pdfSederhana";
import { OFFSET_WIB_MS } from "./waktu";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function ada(teks: string, potongan: string, label: string): void {
  ok(teks.includes(potongan), `${label} (memuat "${potongan}")`);
}

function wib(tahun: number, bulan: number, hari: number): number {
  return Date.UTC(tahun, bulan - 1, hari) - OFFSET_WIB_MS;
}

const DIBUAT = wib(2026, 10, 25) + 10 * 3_600_000;

const dasar = {
  baris: [
    {
      nama: "Bunga 15% tenor 7",
      status: "berjalan" as const,
      persenBunga: 15,
      tenor: [7],
      mulai: wib(2026, 10, 19),
      selesai: wib(2026, 10, 25) + 86_399_999,
      pinjaman: 3,
      pokok: 3_000_000,
      subsidi: 450_000,
    },
  ],
  tren: [
    { mulai: wib(2026, 10, 19), pinjaman: 2, subsidi: 300_000 },
    { mulai: wib(2026, 10, 26), pinjaman: 1, subsidi: 150_000 },
  ],
  total: { promo: 1, pinjaman: 3, pokok: 3_000_000, subsidi: 450_000 },
  periode: { dari: wib(2026, 10, 1), sampai: wib(2026, 10, 31) + 86_399_999 },
  dibuatPada: DIBUAT,
  dibatasi: false,
};

const bytes = buatPdfLaporanPromo(dasar);
const teks = teksPdf(bytes);

ok(teks.startsWith("%PDF"), "berkas dimulai dengan header PDF");
ok(teks.trimEnd().endsWith("%%EOF"), "berkas diakhiri penanda EOF");
ada(teks, "LAPORAN EFEKTIVITAS PROMO", "judul dokumen tercetak");
ada(teks, "LAPORAN EFEKTIVITAS PROMO PINJAMAN", "subjudul banner tercetak");
ada(teks, "Bunga 15% tenor 7", "nama promo tercetak");
ada(teks, "Rp 450.000", "subsidi total tercetak");
ada(teks, "Total subsidi promo platform", "callout total tercetak");
ada(teks, "Tren mingguan", "bagian tren tercetak");
ada(teks, "19 Okt", "label minggu dimulai Senin");
ada(teks, "Dokumen internal", "peringatan dokumen internal tercetak");
ok(!teks.includes("500 pinjaman terbaru"), "catatan batas tidak muncul bila tidak dibatasi");

// ===== Periode & batas =====
const denganPeriode = buatPdfLaporanPromo({
  ...dasar,
  dibuatPada: DIBUAT,
  periode: { dari: wib(2026, 10, 1), sampai: wib(2026, 10, 31) },
});
ada(teksPdf(denganPeriode), "1 Oktober 2026", "tanggal awal periode tercetak");
ada(teksPdf(denganPeriode), "31 Oktober 2026", "tanggal akhir periode tercetak");

const dibatasi = buatPdfLaporanPromo({
  ...dasar,
  dibuatPada: DIBUAT,
  periode: null,
  dibatasi: true,
});
ada(teksPdf(dibatasi), "500 pinjaman terbaru", "catatan batas muncul saat dibatasi");

// ===== Tanpa promo: tetap dokumen sah =====
const kosong = buatPdfLaporanPromo({
  baris: [],
  tren: [],
  total: { promo: 0, pinjaman: 0, pokok: 0, subsidi: 0 },
  periode: null,
  dibuatPada: DIBUAT,
  dibatasi: false,
});
ok(teksPdf(kosong).startsWith("%PDF"), "laporan kosong tetap PDF sah");
ada(teksPdf(kosong), "Belum ada promo bunga", "laporan kosong menjelaskan keadaannya");
ada(teksPdf(kosong), "Seluruh periode", "periode kosong disebut apa adanya");

const jumlah = lulus + gagal;
console.log(`laporanPromoPdf.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
