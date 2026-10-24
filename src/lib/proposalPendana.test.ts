/**
 * Uji isi dan tata letak proposal pendanaan (fungsi murni).
 * Run: bun src/lib/proposalPendana.test.ts
 *
 * Yang dijaga:
 *  - angka proposal dihitung dari kebijakan yang sama dengan server
 *    (`bagiHasilPendana`), bukan dari tabel salinan;
 *  - biaya platform yang diubah admin benar-benar mengubah dokumen;
 *  - dokumen memuat lima bagian, bukan ringkasan skema saja;
 *  - tabel enam kolom tercetak utuh di satu halaman;
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
  proposalPendanaanPindai,
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
    else if ("tabel" in baris) {
      bagian.push(...baris.tabel.kepala, ...baris.tabel.baris.flat());
    } else if ("pita" in baris)
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
        const akhirKiri =
          urut[j - 1].x + urut[j - 1].teks.length * urut[j - 1].size * 0.55;
        if (akhirKiri > urut[j].x + 2) {
          masalah.push(
            `H${i + 1} y=${y}: "${urut[j - 1].teks}" menumpuk "${urut[j].teks}"`,
          );
        }
      }
    }
  });
  return masalah;
}

const WAKTU = Date.UTC(2026, 9, 22, 9, 30);
const PERSEN = 5;
const dokumen = proposalPendanaanPindai({
  persenPotonganAdmin: PERSEN,
  dibuatPada: WAKTU,
});
const teks = semuaTeks(dokumen);

// ===== Sampul =====
eq(
  dokumen.sampul?.judul,
  "Proposal pendanaan & kemitraan strategis",
  "judul sampul",
);
eq(dokumen.sampul?.fakta.length, 3, "sampul memuat tiga angka kunci");
eq(dokumen.sampul?.isi.length, 5, "sampul memuat lima butir isi dokumen");
ada(teks, tanggalProposal(WAKTU), "tanggal terbit di sampul");
ada(teks, "30 hari", "siklus di sampul");
ada(teks, "30%", "Imbal Hasil di sampul");
ada(teks, "5%", "biaya platform di sampul");
ada(teks, "300", "target nasabah di sampul");
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
  "Layanan pendanaan - proposal kemitraan strategis",
  "kop memuat keterangan layanan",
);

// ===== Lima bagian dokumen =====
ada(teks, "Ringkasan eksekutif", "bagian ringkasan eksekutif");
ada(teks, "Potensi pasar dan koridor industri", "bagian potensi pasar");
ada(teks, "Skema pendanaan", "bagian skema");
ada(teks, "Biaya platform dan mitigasi risiko", "bagian biaya dan risiko");
ada(teks, "Alur kemitraan", "bagian alur kemitraan");

// ===== Target 2027 dan pasar =====
ada(teks, "300 nasabah aktif per bulan", "target 2027 dinyatakan");
ada(teks, "Rp 225.000.000", "penyaluran bulanan dihitung");
ada(teks, "Rp 2.700.000.000", "penyaluran tahunan dihitung");
ada(teks, "TAM per tahun", "TAM tercantum");
ada(teks, "Rp 100 miliar sampai Rp 200 miliar", "nilai TAM");
ada(teks, "SAM per tahun", "SAM tercantum");
ada(teks, "Rp 10 miliar sampai Rp 20 miliar", "nilai SAM");
ada(teks, "SOM 2027", "SOM tercantum");
ada(teks, "Rp 225 juta per bulan", "nilai SOM");
ada(teks, "13,5% sampai 27% dari SAM", "pangsa SOM dijelaskan");
ada(teks, "KIIC, EJIP, Jababeka, MM2100, Sentul", "kawasan industri disebut");

// ===== Skema dan contoh utama =====
ada(teks, "30% flat", "Imbal Hasil flat dinyatakan");
ada(teks, "5% x (pokok + Imbal Hasil)", "dasar biaya platform dijelaskan");
ada(teks, "Diterima bersih", "hasil bersih dinyatakan");
ada(teks, "123,5% dari pokok", "diterima bersih dalam persen");
ada(teks, "23,5% dari pokok", "keuntungan bersih dalam persen");

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
ada(
  teks,
  `Keuntungan bersih ${formatRupiahAman(contoh.keuntungan)} setelah pokok kembali utuh.`,
  "catatan keuntungan di pita",
);
eq(contoh.imbal, 3_000_000, "Imbal Hasil 10 juta adalah 3 juta");
eq(contoh.potonganAdmin, 650_000, "biaya 5% dari total kembali 13 juta adalah 650 ribu");
eq(contoh.diterima, 12_350_000, "diterima bersih 12,35 juta");
eq(contoh.keuntungan, 2_350_000, "keuntungan bersih 2,35 juta");

// ===== Tabel simulasi enam kolom =====
ada(teks, "Simulasi Rp 5.000.000 sampai Rp 50.000.000", "judul simulasi");
ada(teks, "Imbal 30%", "kepala kolom Imbal Hasil");
ada(teks, "Uang Kembali", "kepala kolom uang kembali");
ada(teks, "Biaya 5%", "kepala kolom biaya");
ada(teks, "Keuntungan", "kepala kolom keuntungan");
{
  const tabel = dokumen.baris.find((b) => "tabel" in b);
  ok(tabel !== undefined, "dokumen memuat tabel simulasi");
  if (tabel !== undefined && "tabel" in tabel) {
    eq(tabel.tabel.kepala.length, 6, "tabel memakai enam kolom");
    eq(tabel.tabel.baris.length, 10, "tabel memuat sepuluh nominal");
    eq(
      NOMINAL_SIMULASI_PROPOSAL[0],
      5_000_000,
      "simulasi dimulai dari lima juta",
    );
    eq(
      NOMINAL_SIMULASI_PROPOSAL[NOMINAL_SIMULASI_PROPOSAL.length - 1],
      50_000_000,
      "simulasi berakhir di lima puluh juta",
    );
    for (const pokok of NOMINAL_SIMULASI_PROPOSAL) {
      const bagi = bagiHasilPendana(pokok, PERSEN);
      const baris = tabel.tabel.baris.find(
        (b) => b[0] === formatRupiahAman(pokok),
      );
      ok(baris !== undefined, `baris simulasi ${formatRupiahAman(pokok)}`);
      if (baris === undefined) continue;
      eq(baris.length, 6, `enam sel pada ${formatRupiahAman(pokok)}`);
      eq(baris[1], formatRupiahAman(bagi.imbal), `Imbal Hasil ${pokok}`);
      eq(baris[2], formatRupiahAman(bagi.total), `uang kembali ${pokok}`);
      eq(baris[3], formatRupiahAman(bagi.potonganAdmin), `biaya ${pokok}`);
      eq(baris[4], formatRupiahAman(bagi.diterima), `diterima ${pokok}`);
      eq(baris[5], formatRupiahAman(bagi.keuntungan), `keuntungan ${pokok}`);
    }
  }
}

// ===== Biaya, langkah preventif, risiko, kontak =====
ada(teks, "Rp 14.625.000 per siklus", "kolam biaya platform dihitung");
ada(teks, "Penagihan lapangan.", "cakupan penagihan");
ada(teks, "Asuransi atau pengelolaan internal agunan.", "cakupan agunan");
ada(teks, "Fasilitas jaminan dan solusi bayar.", "cakupan fasilitas bayar");
ada(teks, "1. Verifikasi sebelum pinjaman", "langkah verifikasi");
ada(teks, "2. Pengingat", "langkah pengingat");
ada(teks, "3. Somasi dan peringatan formal", "langkah somasi");
ada(teks, "4. Restrukturisasi", "langkah restrukturisasi");
ada(teks, "5. Eksekusi agunan fisik", "langkah eksekusi agunan");
ada(teks, "PINDAI tidak menjamin pembayaran peminjam", "batas jaminan");
ada(teks, "Modal berisiko: bila peminjam gagal bayar", "risiko gagal bayar");
ada(teks, "Konsentrasi alokasi", "risiko konsentrasi");
ada(teks, "tidak ada jaminan dari", "tidak ada penjamin pihak ketiga");
ada(teks, "bukan perjanjian dan bukan jaminan hasil", "bukan perjanjian");
ada(teks, "Hubungi CS WhatsApp", "cara memulai");
ada(teks, "wa.me/6285119574032", "tautan WhatsApp resmi");

// ===== Tarif admin yang berbeda mengubah dokumen =====
{
  const lainDok = proposalPendanaanPindai({
    persenPotonganAdmin: 2.5,
    dibuatPada: WAKTU,
  });
  const lain = semuaTeks(lainDok);
  const bagi = bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL, 2.5);
  ada(lain, "2,5% x (pokok + Imbal Hasil)", "persen desimal memakai koma");
  ada(lain, formatRupiahAman(bagi.potonganAdmin), "biaya mengikuti tarif baru");
  ada(lain, formatRupiahAman(bagi.diterima), "diterima mengikuti tarif baru");
  ok(
    !lain.includes(formatRupiahAman(contoh.diterima)),
    "dokumen tidak menyisakan hasil tarif lama",
  );
}
{
  const nol = semuaTeks(
    proposalPendanaanPindai({ persenPotonganAdmin: 0, dibuatPada: WAKTU }),
  );
  ada(nol, "0% x Pokok", "tarif nol ditulis apa adanya");
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
  "PINDAI-Proposal-Pendanaan-2026-10-22.pdf",
  "nama berkas memakai tanggal UTC",
);
eq(
  nomorLayananProposal(),
  "0851-1957-4032",
  "nomor WhatsApp dibaca dari lib/kontak",
);
eq(formatPersen(5), "5%", "persen bulat tanpa desimal");
eq(formatPersen(2.5), "2,5%", "persen desimal memakai koma");

// ===== Berkas PDF: halaman, tabel utuh, dan tata letak =====
{
  const byte = susunPdf(dokumen);
  const pdf = teksPdf(byte);
  const jumlahHalaman = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
  eq(jumlahHalaman, 6, "sampul dan lima halaman isi");
  ok(pdf.startsWith("%PDF-1.4"), "berkas dimulai dengan header PDF");
  ok(pdf.trimEnd().endsWith("%%EOF"), "berkas diakhiri penanda EOF");
  ada(pdf, "Halaman 1 dari 5", "halaman isi pertama bernomor 1 dari 5");
  ada(pdf, "Halaman 5 dari 5", "halaman isi terakhir bernomor 5 dari 5");
  ok(!pdf.includes("Halaman 0 dari"), "sampul tidak memakai nomor nol");
  eq(
    pdf.split("PINJAM GADAI DIGITAL \\(PINDAI\\)").length - 1,
    6,
    "nama layanan tercetak di sampul dan setiap halaman isi",
  );
  ada(pdf, "UNTUK CALON PENDANA", "sampul menyebut pembacanya");
  ada(
    pdf,
    "Layanan pendanaan - proposal kemitraan strategis",
    "keterangan layanan tercetak di sampul",
  );
  ada(pdf, "ISI DOKUMEN", "daftar isi tercetak di sampul");
  ada(pdf, " re f", "pita angka memakai bidang berisi");
  ok(!pdf.includes("\u2014"), "berkas tidak memuat tanda pisah panjang");
  ok(!pdf.includes("?"), "tidak ada karakter yang gagal dipetakan");

  // Tabel enam kolom harus utuh: 11 baris (kepala + 10 nominal) di satu halaman.
  const halaman = posisiTeks(pdf);
  const halamanTabel = halaman.findIndex((h) =>
    h.some((t) => t.size === 7.8 && t.teks === "Pokok"),
  );
  ok(halamanTabel !== -1, "halaman tabel ditemukan");
  const selTabel = halaman[halamanTabel]?.filter((t) => t.size === 7.8) ?? [];
  eq(selTabel.length, 66, "kepala dan 60 sel tabel tercetak di satu halaman");
  ok(
    !halaman.some(
      (h, i) =>
        i !== halamanTabel &&
        h.some((t) => t.size === 7.8 && t.teks === "Pokok"),
    ),
    "kepala tabel tidak diulang di halaman lain",
  );

  const masalah = masalahTataLetak(pdf);
  ok(
    masalah.length === 0,
    `tata letak bersih${masalah.length > 0 ? `: ${masalah.join("; ")}` : ""}`,
  );
  ok(byte.length > 20_000, "berkas berisi enam halaman teks");
}

console.log(`proposalPendana: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
