/**
 * Uji isi dan tata letak proposal pembagian hasil pendanaan (fungsi murni).
 * Run: bun src/lib/proposalPendana.test.ts
 *
 * Yang dijaga:
 *  - angka proposal dihitung dari kebijakan yang sama dengan server
 *    (`bagiHasilPendana`), bukan dari tabel salinan;
 *  - biaya platform yang diubah admin benar-benar mengubah dokumen;
 *  - dokumen tetap tiga halaman (sampul + dua halaman isi), tanpa halaman
 *    sisa yang hampir kosong;
 *  - tidak ada teks yang melewati margin atau menumpuk pada garis yang sama;
 *  - risiko dan kalimat "bukan perjanjian" tidak pernah hilang.
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
    else if ("kolom" in baris)
      bagian.push(baris.kolom.kiri, baris.kolom.tengah, baris.kolom.kanan);
    else if ("pita" in baris)
      bagian.push(baris.pita.label, baris.pita.nilai, baris.pita.catatan ?? "");
  }
  if (dokumen.sampul !== undefined) {
    bagian.push(
      dokumen.sampul.judul,
      dokumen.sampul.subjudul,
      dokumen.sampul.meta,
      dokumen.sampul.catatan,
      dokumen.sampul.kaki,
      ...dokumen.sampul.fakta.map((f) => `${f.label} ${f.nilai}`),
      ...dokumen.sampul.isi,
    );
    if (dokumen.sampul.penutup !== undefined) {
      bagian.push(dokumen.sampul.penutup);
    }
  }
  return bagian.join("\n");
}

type TeksPdf = { size: number; x: number; y: number; teks: string };

/** Teks beserta posisinya di dalam berkas, untuk pemeriksaan tata letak. */
function posisiTeks(pdf: string): TeksPdf[][] {
  const halaman = [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)].map(
    (m) => m[1],
  );
  return halaman.map((isi) =>
    [
      ...isi.matchAll(
        /\/(F1|F2) ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \(([^)]*)\) Tj/g,
      ),
    ].map((m) => ({
      size: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      teks: m[5] ?? "",
    })),
  );
}

/** Kumpulan masalah tata letak: keluar margin atau teks bertumpuk. */
function masalahTataLetak(pdf: string): string[] {
  const masalah: string[] = [];
  posisiTeks(pdf).forEach((halaman, i) => {
    for (const t of halaman) {
      // Kaki halaman memang berada di bawah batas isi.
      if (t.y < 58) continue;
      const lebar = t.teks.length * t.size * 0.55;
      if (t.x < 47) masalah.push(`H${i + 1}: ${t.teks} keluar margin kiri`);
      if (t.x + lebar > 551) {
        masalah.push(`H${i + 1}: ${t.teks} keluar margin kanan`);
      }
    }
    const perGaris = new Map<number, TeksPdf[]>();
    for (const t of halaman) {
      if (t.y < 58) continue;
      const kunci = Math.round(t.y);
      perGaris.set(kunci, [...(perGaris.get(kunci) ?? []), t]);
    }
    for (const [y, baris] of perGaris) {
      const urut = [...baris].sort((a, b) => a.x - b.x);
      for (let j = 1; j < urut.length; j += 1) {
        const kiri = urut[j - 1];
        const kanan = urut[j];
        const akhirKiri = kiri.x + kiri.teks.length * kiri.size * 0.55;
        if (akhirKiri > kanan.x + 2) {
          masalah.push(
            `H${i + 1} y=${y}: "${kiri.teks}" menumpuk "${kanan.teks}"`,
          );
        }
      }
    }
  });
  return masalah;
}

const WAKTU = Date.UTC(2026, 9, 22, 9, 30);
const PERSEN = 5;
const dokumen = proposalPembagianPendana({
  persenPotonganAdmin: PERSEN,
  dibuatPada: WAKTU,
});
const teks = semuaTeks(dokumen);

// ===== Sampul =====
eq(dokumen.sampul?.judul, "Pembagian hasil pendanaan", "judul sampul");
eq(dokumen.sampul?.fakta.length, 3, "sampul memuat tiga angka kunci");
eq(dokumen.sampul?.isi.length, 5, "sampul memuat lima butir isi dokumen");
ada(teks, tanggalProposal(WAKTU), "tanggal terbit di sampul");
ada(teks, "30 hari", "siklus di sampul");
ada(teks, "30%", "Imbal Hasil di sampul");
ada(teks, "5%", "biaya platform di sampul");
ada(teks, "Pendanaan bukan tabungan", "peringatan di sampul");
ada(teks, nomorLayananProposal(), "kontak layanan di sampul");

// ===== Kop dan identitas dokumen =====
eq(dokumen.kop?.referensi, "PROPOSAL PENDANAAN", "kop menyebut jenis dokumen");
eq(
  dokumen.kop?.nama,
  "PINJAM GADAI DIGITAL (PINDAI)",
  "kop memakai nama layanan",
);
eq(
  dokumen.kop?.keterangan,
  "Layanan pendanaan - proposal pembagian hasil",
  "kop memuat keterangan layanan",
);

// ===== Skema yang berlaku =====
ada(teks, "Ringkasan skema", "bagian ringkasan");
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
] as const) {
  ada(teks, formatRupiahAman(nilai), `contoh memuat ${label}`);
}
ada(teks, "Diterima bersih", "pita hasil bersih");
ada(
  teks,
  `Keuntungan bersih ${formatRupiahAman(contoh.keuntungan)} setelah pokok kembali utuh.`,
  "catatan keuntungan di pita",
);
eq(contoh.imbal, 3_000_000, "Imbal Hasil 10 juta adalah 3 juta");
eq(contoh.potonganAdmin, 650_000, "biaya 5% dari 13 juta adalah 650 ribu");
eq(contoh.diterima, 12_350_000, "diterima bersih 12,35 juta");
eq(contoh.keuntungan, 2_350_000, "keuntungan bersih 2,35 juta");

// ===== Tabel simulasi tiga kolom =====
ada(teks, "Simulasi nominal", "bagian simulasi");
ada(teks, "Nominal", "kepala kolom nominal");
ada(teks, "Imbal Hasil", "kepala kolom Imbal Hasil");
for (const pokok of NOMINAL_SIMULASI_PROPOSAL) {
  const bagi = bagiHasilPendana(pokok, PERSEN);
  const nama = formatRupiahAman(pokok);
  ada(teks, nama, `baris simulasi ${nama}`);
  ada(teks, formatRupiahAman(bagi.imbal), `Imbal Hasil simulasi ${nama}`);
  ada(teks, formatRupiahAman(bagi.diterima), `diterima simulasi ${nama}`);
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
ada(teks, "1. Pendaftaran dan penyetoran", "langkah pendaftaran");
ada(
  teks,
  "Admin PINDAI membuatkan akun setelah rencana pendanaan disepakati",
  "isi langkah pendaftaran",
);
ada(teks, "2. Alokasi ke satu pinjaman", "langkah alokasi");
ada(teks, "3. Berjalan sampai lunas", "langkah berjalan");
ada(teks, "4. Transfer hasil", "langkah transfer");
ada(
  teks,
  "Aplikasi tidak memindahkan uang",
  "batas perpindahan uang dinyatakan",
);
ada(teks, "Catatan transfer bukan bukti mutasi bank", "arti catatan transfer");
ada(teks, "Menyetor dana sesuai kesepakatan", "kewajiban pendana");
ada(teks, "PINDAI tidak menjamin pembayaran peminjam", "batas jaminan PINDAI");
ada(teks, "Modal berisiko. Jika peminjam gagal bayar", "risiko gagal bayar");
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
ada(teks, "Hubungi layanan pelanggan PINDAI di WhatsApp", "cara memulai");

// ===== Tarif admin yang berbeda mengubah dokumen =====
{
  const lainDok = proposalPembagianPendana({
    persenPotonganAdmin: 2.5,
    dibuatPada: WAKTU,
  });
  const lain = semuaTeks(lainDok);
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
  ada(
    nol,
    formatRupiahAman(bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL, 0).diterima),
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

// ===== Berkas PDF: tiga halaman, tanpa sisa satu halaman =====
{
  const byte = susunPdf(dokumen);
  const pdf = teksPdf(byte);
  eq(Number(/\/Count (\d+)/.exec(pdf)?.[1]), 3, "sampul + dua halaman isi");
  ok(pdf.startsWith("%PDF-1.4"), "berkas dimulai dengan header PDF");
  ok(pdf.trimEnd().endsWith("%%EOF"), "berkas diakhiri penanda EOF");
  ok(pdf.includes("Halaman 1 dari 2"), "halaman isi pertama bernomor 1 dari 2");
  ok(pdf.includes("Halaman 2 dari 2"), "halaman isi kedua bernomor 2 dari 2");
  ok(!pdf.includes("Halaman 3 dari"), "tidak ada halaman isi ketiga");
  ok(!pdf.includes("Halaman 0 dari"), "sampul tidak memakai nomor nol");
  eq(
    pdf.split("PINJAM GADAI DIGITAL \\(PINDAI\\)").length - 1,
    3,
    "nama layanan tercetak di sampul dan dua halaman isi",
  );
  ada(pdf, "UNTUK CALON PENDANA", "sampul menyebut pembacanya");
  ada(
    pdf,
    "Layanan pendanaan - proposal pembagian hasil",
    "keterangan layanan tercetak di sampul",
  );
  ada(pdf, "ISI DOKUMEN", "daftar isi tercetak di sampul");
  ada(pdf, " re f", "pita angka memakai bidang berisi");
  ok(!pdf.includes("\u2014"), "berkas tidak memuat tanda pisah panjang");
  ok(!pdf.includes("?"), "tidak ada karakter yang gagal dipetakan");
  ok(byte.length > 8_000, "berkas berisi tiga halaman teks");

  const masalah = masalahTataLetak(pdf);
  ok(
    masalah.length === 0,
    `tata letak bersih${masalah.length > 0 ? `: ${masalah.join("; ")}` : ""}`,
  );
}

console.log(`proposalPendana: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
