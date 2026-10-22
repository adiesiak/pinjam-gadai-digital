/**
 * Uji isi proposal pembagian hasil pendanaan (fungsi murni).
 * Run: bun src/lib/proposalPendana.test.ts
 *
 * Yang dijaga:
 *  - angka proposal dihitung dari kebijakan yang sama dengan server
 *    (`bagiHasilPendana`), bukan dari tabel salinan;
 *  - biaya platform yang diubah admin benar-benar mengubah dokumen;
 *  - risiko dan kalimat "bukan perjanjian" tidak pernah hilang;
 *  - dokumen memakai tanda pisah biasa, dan berkas PDF-nya bisa dibuka.
 */
import { bagiHasilPendana } from "./imbalPendana";
import { formatRupiahAman } from "./money";
import type { DokumenPdf } from "./pdfSederhana";
import { susunPdf, teksPdf } from "./pdfSederhana";
import {
  NOMINAL_CONTOH_PROPOSAL,
  NOMINAL_SIMULASI_PROPOSAL,
  formatPersen,
  namaBerkasProposalPendana,
  nomorLayananProposal,
  proposalPembagianPendana,
  tanggalProposal,
} from "./proposalPendana";

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) lulus += 1;
  else {
    gagal += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ada(teks: string, potongan: string, label: string): void {
  ok(teks.includes(potongan), `${label} (memuat "${potongan}")`);
}

/** Seluruh teks dokumen, tanpa memperhatikan gaya barisnya. */
function semuaTeks(dokumen: DokumenPdf): string {
  const bagian: string[] = [];
  for (const baris of dokumen.baris) {
    if ("teks" in baris) bagian.push(baris.teks);
    else if ("label" in baris) bagian.push(baris.label, baris.nilai);
  }
  return bagian.join("\n");
}

const WAKTU = Date.UTC(2026, 9, 22, 9, 30);
const PERSEN = 5;
const dokumen = proposalPembagianPendana({
  persenPotonganAdmin: PERSEN,
  dibuatPada: WAKTU,
});
const teks = semuaTeks(dokumen);

// ===== Kop dan identitas dokumen =====
eq(
  dokumen.kop?.nama,
  "PINJAM GADAI DIGITAL (PINDAI)",
  "kop memakai nama layanan",
);
eq(dokumen.kop?.referensi, "PROPOSAL PENDANAAN", "kop menyebut jenis dokumen");
ada(teks, "Proposal pembagian hasil pendanaan", "judul dokumen");
ada(teks, tanggalProposal(WAKTU), "tanggal terbit tercantum");
ada(
  teks,
  "Skema pendanaan PINDAI untuk calon pendana",
  "subjudul menyebut sasaran",
);

// ===== Skema yang berlaku =====
ada(teks, "30 hari", "siklus pendanaan tercantum");
ada(teks, "30% flat per siklus", "Imbal Hasil tercantum");
ada(teks, "5% dari uang yang kembali", "dasar biaya platform dijelaskan");
ada(teks, "Satu pinjaman untuk satu pendana", "pemetaan dana dinyatakan");

// ===== Contoh utama, dihitung dari modul yang sama dengan server =====
const contoh = bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL, PERSEN);
ada(
  teks,
  `Contoh pembagian ${formatRupiahAman(NOMINAL_CONTOH_PROPOSAL)}`,
  "judul contoh memakai nominal yang dihitung",
);
for (const [label, nilai] of [
  ["pokok", NOMINAL_CONTOH_PROPOSAL],
  ["Imbal Hasil", contoh.imbal],
  ["uang kembali", contoh.total],
  ["biaya platform", contoh.potonganAdmin],
  ["diterima bersih", contoh.diterima],
  ["keuntungan bersih", contoh.keuntungan],
] as const) {
  ada(teks, formatRupiahAman(nilai), `contoh memuat ${label}`);
}
// Angka yang tidak dihitung modul tidak boleh muncul sebagai "angka ajaib".
eq(contoh.imbal, 3_000_000, "Imbal Hasil 10 juta adalah 3 juta");
eq(contoh.potonganAdmin, 650_000, "biaya 5% dari 13 juta adalah 650 ribu");
eq(contoh.diterima, 12_350_000, "diterima bersih 12,35 juta");
eq(contoh.keuntungan, 2_350_000, "keuntungan bersih 2,35 juta");

// ===== Simulasi nominal lain =====
for (const pokok of NOMINAL_SIMULASI_PROPOSAL) {
  const bagi = bagiHasilPendana(pokok, PERSEN);
  const nama = formatRupiahAman(pokok);
  ok(teks.split(nama).length >= 2, `nominal simulasi ${nama} muncul`);
  ada(
    teks,
    formatRupiahAman(bagi.diterima),
    `simulasi ${nama} memuat diterima`,
  );
  ada(
    teks,
    formatRupiahAman(bagi.keuntungan),
    `simulasi ${nama} memuat keuntungan`,
  );
  // Identitas uang: tidak ada rupiah hilang atau diciptakan.
  ok(
    bagi.potonganAdmin + bagi.diterima === bagi.total,
    `potongan + diterima = uang kembali pada ${nama}`,
  );
  ok(
    bagi.keuntungan === bagi.diterima - pokok,
    `keuntungan = diterima - pokok pada ${nama}`,
  );
}

// ===== Alur, hak, risiko, dan kontak =====
ada(
  teks,
  "Pendaftaran. Admin PINDAI membuatkan akun pendana",
  "alur pendaftaran",
);
ada(
  teks,
  "Aplikasi tidak memindahkan uang",
  "batas perpindahan uang dinyatakan",
);
ada(teks, "Catatan transfer bukan bukti mutasi bank", "arti catatan transfer");
ada(teks, "Menyetor dana sesuai kesepakatan", "kewajiban pendana");
ada(teks, "PINDAI tidak menjamin pembayaran peminjam", "batas jaminan PINDAI");
ada(
  teks,
  "Konsentrasi. Satu pinjaman hanya didanai satu pendana",
  "risiko konsentrasi",
);
ada(
  teks,
  "Tidak ada jaminan dari LPS, asuransi, atau pihak ketiga",
  "risiko modal",
);
ada(teks, "Keterlambatan peminjam menunda pencairan hasil", "risiko waktu");
ada(
  teks,
  "bukan perjanjian dan bukan jaminan hasil",
  "dokumen bukan perjanjian",
);
ada(teks, nomorLayananProposal(), "nomor layanan tercantum");

// ===== Tarif admin yang berbeda mengubah dokumen =====
{
  const lain = semuaTeks(
    proposalPembagianPendana({ persenPotonganAdmin: 2.5, dibuatPada: WAKTU }),
  );
  const bagi = bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL, 2.5);
  ada(lain, "2,5% dari uang yang kembali", "persen desimal memakai koma");
  ada(lain, formatRupiahAman(bagi.potonganAdmin), "biaya mengikuti tarif baru");
  ada(lain, formatRupiahAman(bagi.diterima), "diterima mengikuti tarif baru");
  ok(
    !lain.includes(formatRupiahAman(contoh.potonganAdmin)),
    "dokumen tidak menyisakan biaya tarif lama",
  );
}
{
  const nol = semuaTeks(
    proposalPembagianPendana({ persenPotonganAdmin: 0, dibuatPada: WAKTU }),
  );
  ada(nol, "0% dari uang yang kembali", "tarif nol ditulis apa adanya");
  ok(
    nol.includes(
      formatRupiahAman(bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL, 0).diterima),
    ),
    "tanpa biaya, diterima sama dengan uang yang kembali",
  );
}

// ===== Ejaan dan tanda baca =====
ok(!teks.includes("\u2014"), "tidak ada tanda pisah panjang");
ok(!teks.includes("\u2013"), "tidak ada tanda pisah sedang");
ok(!/\bundefined\b|\bNaN\b/.test(teks), "tanpa undefined atau NaN");

// ===== Nama berkas dan nomor layanan =====
eq(
  namaBerkasProposalPendana(WAKTU),
  "proposal-pembagian-pendanaan-2026-10-22.pdf",
  "nama berkas memakai tanggal UTC",
);
eq(
  nomorLayananProposal(),
  "0851-1957-4032",
  "nomor WhatsApp dibaca dari lib/kontak",
);
eq(formatPersen(5), "5%", "persen bulat tanpa desimal");
eq(formatPersen(2.5), "2,5%", "persen desimal memakai koma");

// ===== Berkas PDF benar-benar terbentuk =====
{
  const byte = susunPdf(dokumen);
  const pdf = teksPdf(byte);
  ok(pdf.startsWith("%PDF-1.4"), "berkas dimulai dengan header PDF");
  ok(pdf.trimEnd().endsWith("%%EOF"), "berkas diakhiri penanda EOF");
  ada(pdf, "Halaman 1 dari", "setiap halaman bernomor");
  ada(pdf, "Proposal pembagian hasil pendanaan", "judul tertanam di berkas");
  ok(!pdf.includes("\u2014"), "berkas tidak memuat tanda pisah panjang");
  ok(byte.length > 3_000, "berkas berisi lebih dari satu halaman teks");
}

console.log(`proposalPendana: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
