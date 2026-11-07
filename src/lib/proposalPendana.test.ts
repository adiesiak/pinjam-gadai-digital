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
  POKOK_CONTOH_KONVENSIONAL,
  pembagianKonvensionalProposal,
  simulasiKonvensionalProposal,
  keuntunganBulananProposal,
  simulasiBulananProposal,
  simulasiSyariahProposal,
  pembagianSyariahProposal,
  tarifBulananProposal,
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
ada(teks, "Berlaku untuk semua produk", "cakupan semua produk dinyatakan");
for (const produk of [
  "pinjaman harian",
  "pinjaman bulanan",
  "pembiayaan syariah",
  "gadai",
  "kredit barang",
]) {
  ada(teks, produk, `produk ${produk} disebut di proposal`);
}
ada(teks, "Pencatatan hak dan buktinya", "cara pencatatan hak dijelaskan");
ada(teks, "Porsi platform dan mitigasi risiko", "bagian porsi dan risiko");
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
ada(teks, "21,67% x marjin", "dasar porsi platform dijelaskan");
ada(teks, "Diterima bersih", "hasil bersih dinyatakan");
ada(teks, "123,5% dari pokok", "diterima bersih dalam persen");
ada(teks, "23,5% dari pokok", "keuntungan bersih dalam persen");

const contoh = bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL);
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
eq(
  contoh.potonganAdmin,
  650_000,
  "porsi 21,67% dari marjin 3 juta adalah 650 ribu",
);
eq(contoh.diterima, 12_350_000, "diterima bersih 12,35 juta");
eq(contoh.keuntungan, 2_350_000, "keuntungan bersih 2,35 juta");

// ===== Tabel simulasi enam kolom =====
ada(teks, "Simulasi Rp 5.000.000 sampai Rp 50.000.000", "judul simulasi");
ada(teks, "Imbal 30%", "kepala kolom Imbal Hasil");
ada(teks, "Uang Kembali", "kepala kolom uang kembali");
ada(teks, "Porsi 21,67%", "kepala kolom porsi memakai porsi platform 13/60");
ada(teks, "Keuntungan", "kepala kolom keuntungan");
{
  // Tabel simulasi dicari lewat kepala kolomnya: dokumen kini juga memuat
  // tabel tenor bulanan, dan keduanya tidak boleh tertukar.
  const tabel = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Pokok",
  );
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
      const bagi = bagiHasilPendana(pokok);
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

// ===== Keuntungan pinjaman bulanan 1/3/6/9/12 =====
ada(teks, "Keuntungan pinjaman bulanan 1/3/6/9/12", "bagian tenor bulanan ada");
{
  const bulanan = keuntunganBulananProposal();
  eq(bulanan.length, 5, "lima tenor bulanan dijelaskan");
  eq(
    bulanan.map((b) => b.tenor).join(","),
    "1,3,6,9,12",
    "tenor bulanan yang dijelaskan",
  );
  const tabelBulanan = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Tenor",
  );
  ok(tabelBulanan !== undefined, "dokumen memuat tabel tenor bulanan");
  if (tabelBulanan !== undefined && "tabel" in tabelBulanan) {
    eq(tabelBulanan.tabel.kepala.length, 6, "tabel tenor memakai enam kolom");
    eq(tabelBulanan.tabel.baris.length, 5, "tabel tenor memuat lima baris");
    eq(
      tabelBulanan.tabel.kepala[1],
      "Bunga / bulan",
      "kolom bunga per bulan ada",
    );
    for (const b of bulanan) {
      const baris = tabelBulanan.tabel.baris.find(
        (r) => r[0] === `${b.tenor} bulan`,
      );
      ok(baris !== undefined, `baris tenor ${b.tenor} bulan`);
      if (baris === undefined) continue;
      const tarif = tarifBulananProposal().find((t) => t.tenor === b.tenor)!;
      eq(
        baris[1],
        formatPersen(tarif.perBulan),
        `bunga per bulan tenor ${b.tenor}`,
      );
      eq(baris[2], formatRupiahAman(b.margin), `marjin tenor ${b.tenor}`);
      eq(baris[3], formatRupiahAman(b.pendana), `hak pendana tenor ${b.tenor}`);
      eq(
        baris[4],
        formatRupiahAman(b.platform),
        `porsi platform tenor ${b.tenor}`,
      );
      eq(
        baris[5],
        formatRupiahAman(b.perBulan),
        `setara per bulan tenor ${b.tenor}`,
      );
    }
    // Bunga yang benar-benar dipakai kontrak: 30/8/12/10/8 per bulan,
    // dan 30/24/72/90/96 total sepanjang tenor.
    eq(
      tarifBulananProposal()
        .map((t) => t.perBulan)
        .join(","),
      "30,8,12,10,8",
      "bunga per bulan tiap tenor",
    );
    eq(
      tarifBulananProposal()
        .map((t) => t.total)
        .join(","),
      "30,24,72,90,96",
      "marjin total tiap tenor",
    );
  }
  // Angka acuan yang mudah diperiksa manusia: 10 juta, tenor 1 bulan.
  const satu = bulanan[0]!;
  eq(satu.margin, 3_000_000, "marjin tenor 1 bulan = 30% pokok");
  eq(satu.pendana, 2_350_000, "hak pendana tenor 1 bulan 47/60");
  eq(satu.platform, 650_000, "porsi platform tenor 1 bulan 13/60");
}

// ===== Simulasi pinjaman bulanan Rp 1 juta sampai Rp 10 juta =====
ada(
  teks,
  "Simulasi pinjaman bulanan Rp 1 juta sampai Rp 10 juta",
  "judul simulasi bulanan ada",
);
{
  const simulasi = simulasiBulananProposal();
  eq(simulasi.length, 10, "simulasi bulanan memuat sepuluh nominal");
  eq(simulasi[0]?.pokok, 1_000_000, "simulasi dimulai dari satu juta");
  eq(simulasi[9]?.pokok, 10_000_000, "simulasi berakhir di sepuluh juta");
  eq(simulasi[0]?.pendana[1], 235_000, "hak pendana 1 juta tenor 1 bulan");
  eq(simulasi[9]?.pendana[12], 7_520_000, "hak pendana 10 juta tenor 12 bulan");
  eq(
    simulasi[1]?.pendana[3],
    null,
    "tenor 3 bulan belum tersedia untuk pokok 2 juta",
  );

  const tabelBulanan = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Pokok bulanan",
  );
  ok(tabelBulanan !== undefined, "dokumen memuat tabel simulasi bulanan");
  if (tabelBulanan !== undefined && "tabel" in tabelBulanan) {
    eq(
      tabelBulanan.tabel.kepala.length,
      6,
      "tabel simulasi bulanan enam kolom",
    );
    eq(
      tabelBulanan.tabel.baris.length,
      10,
      "tabel simulasi bulanan sepuluh baris",
    );
    const barisSatu = tabelBulanan.tabel.baris.find(
      (r) => r[0] === formatRupiahAman(1_000_000),
    );
    ok(barisSatu !== undefined, "baris satu juta ada");
    if (barisSatu !== undefined) {
      eq(barisSatu[1], formatRupiahAman(235_000), "sel 1 juta tenor 1 bulan");
      eq(barisSatu[2], "-", "sel 1 juta tenor 3 bulan kosong");
    }
    const barisSepuluh = tabelBulanan.tabel.baris.find(
      (r) => r[0] === formatRupiahAman(10_000_000),
    );
    ok(barisSepuluh !== undefined, "baris sepuluh juta ada");
    if (barisSepuluh !== undefined) {
      eq(
        barisSepuluh[5],
        formatRupiahAman(7_520_000),
        "sel 10 juta tenor 12 bulan",
      );
    }
  }
}

// ===== Simulasi pinjaman bulanan Rp 1 juta sampai Rp 10 juta =====
ada(
  teks,
  "Simulasi pinjaman bulanan Rp 1 juta sampai Rp 10 juta",
  "judul simulasi bulanan ada",
);
{
  const simulasi = simulasiBulananProposal();
  eq(simulasi.length, 10, "simulasi bulanan memuat sepuluh nominal");
  eq(simulasi[0]?.pokok, 1_000_000, "simulasi dimulai dari satu juta");
  eq(simulasi[9]?.pokok, 10_000_000, "simulasi berakhir di sepuluh juta");
  eq(simulasi[0]?.pendana[1], 235_000, "hak pendana 1 juta tenor 1 bulan");
  eq(simulasi[9]?.pendana[12], 7_520_000, "hak pendana 10 juta tenor 12 bulan");
  eq(
    simulasi[1]?.pendana[3],
    null,
    "tenor 3 bulan belum tersedia untuk pokok 2 juta",
  );

  const tabelBulanan = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Pokok bulanan",
  );
  ok(tabelBulanan !== undefined, "dokumen memuat tabel simulasi bulanan");
  if (tabelBulanan !== undefined && "tabel" in tabelBulanan) {
    eq(
      tabelBulanan.tabel.kepala.length,
      6,
      "tabel simulasi bulanan enam kolom",
    );
    eq(
      tabelBulanan.tabel.baris.length,
      10,
      "tabel simulasi bulanan sepuluh baris",
    );
    const barisSatu = tabelBulanan.tabel.baris.find(
      (r) => r[0] === formatRupiahAman(1_000_000),
    );
    ok(barisSatu !== undefined, "baris satu juta ada");
    if (barisSatu !== undefined) {
      eq(barisSatu[1], formatRupiahAman(235_000), "sel 1 juta tenor 1 bulan");
      eq(barisSatu[2], "-", "sel 1 juta tenor 3 bulan kosong");
    }
    const barisSepuluh = tabelBulanan.tabel.baris.find(
      (r) => r[0] === formatRupiahAman(10_000_000),
    );
    ok(barisSepuluh !== undefined, "baris sepuluh juta ada");
    if (barisSepuluh !== undefined) {
      eq(
        barisSepuluh[5],
        formatRupiahAman(7_520_000),
        "sel 10 juta tenor 12 bulan",
      );
    }
  }
}

// ===== Pembagian produk konvensional =====
ada(teks, "Pembagian produk konvensional", "bagian konvensional ada");
{
  const produk = pembagianKonvensionalProposal();
  eq(produk.length, 3, "tiga produk konvensional dijelaskan");
  eq(
    produk.map((p) => p.produk).join(","),
    "Pinjaman harian,Gadai,Kredit barang",
    "produk konvensional yang dijelaskan",
  );
  eq(POKOK_CONTOH_KONVENSIONAL, 10_000_000, "pokok contoh konvensional");
  eq(produk[0]?.margin, 3_000_000, "marjin harian 30% dari 10 juta");
  eq(produk[0]?.pendana, 2_350_000, "hak pendana harian 47/60");
  eq(produk[0]?.platform, 650_000, "porsi platform harian 13/60");
  eq(produk[0]?.diterima, 12_350_000, "diterima pendana harian");
  eq(produk[1]?.margin, 1_000_000, "sewa gadai 10% satu periode");
  eq(produk[1]?.pendana, 783_334, "hak pendana gadai 47/60");
  eq(produk[1]?.platform, 216_666, "porsi platform gadai 13/60");
  eq(produk[1]?.diterima, 10_783_334, "diterima pendana gadai");
  eq(produk[2]?.margin, 2_400_000, "marjin kredit 3 bulan 24%");
  eq(produk[2]?.pendana, 1_880_000, "hak pendana kredit 47/60");
  eq(produk[2]?.platform, 520_000, "porsi platform kredit 13/60");
  eq(produk[2]?.diterima, 11_880_000, "diterima pendana kredit");

  const tabelProduk = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Produk",
  );
  ok(tabelProduk !== undefined, "dokumen memuat tabel produk konvensional");
  if (tabelProduk !== undefined && "tabel" in tabelProduk) {
    eq(tabelProduk.tabel.kepala.length, 6, "tabel produk enam kolom");
    eq(tabelProduk.tabel.baris.length, 3, "tabel produk tiga baris");
    for (const b of produk) {
      const baris = tabelProduk.tabel.baris.find((r) => r[0] === b.produk);
      ok(baris !== undefined, `baris produk ${b.produk}`);
      if (baris === undefined) continue;
      eq(baris[2], formatRupiahAman(b.margin), `margin ${b.produk}`);
      eq(baris[3], formatRupiahAman(b.pendana), `pendana ${b.produk}`);
      eq(baris[4], formatRupiahAman(b.platform), `platform ${b.produk}`);
      eq(baris[5], formatRupiahAman(b.diterima), `diterima ${b.produk}`);
    }
  }

  const simulasi = simulasiKonvensionalProposal();
  eq(simulasi.length, 10, "simulasi konvensional sepuluh nominal");
  eq(simulasi[0]?.pokok, 1_000_000, "simulasi konvensional mulai satu juta");
  eq(simulasi[9]?.pokok, 10_000_000, "simulasi konvensional sampai sepuluh juta");
  eq(simulasi[0]?.harian, 235_000, "harian 1 juta");
  eq(simulasi[0]?.gadai, 78_334, "gadai 1 juta");
  eq(simulasi[0]?.kredit, 188_000, "kredit 1 juta");
  eq(simulasi[9]?.harian, 2_350_000, "harian 10 juta");
  eq(simulasi[9]?.gadai, 783_334, "gadai 10 juta");
  eq(simulasi[9]?.kredit, 1_880_000, "kredit 10 juta");

  const tabelSimulasi = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Pokok konvensional",
  );
  ok(tabelSimulasi !== undefined, "dokumen memuat simulasi konvensional");
  if (tabelSimulasi !== undefined && "tabel" in tabelSimulasi) {
    eq(tabelSimulasi.tabel.kepala.length, 4, "simulasi konvensional empat kolom");
    eq(tabelSimulasi.tabel.baris.length, 10, "simulasi konvensional sepuluh baris");
    const barisSatu = tabelSimulasi.tabel.baris.find(
      (r) => r[0] === formatRupiahAman(1_000_000),
    );
    ok(barisSatu !== undefined, "baris konvensional satu juta ada");
    if (barisSatu !== undefined) {
      eq(barisSatu[1], formatRupiahAman(235_000), "sel harian 1 juta");
      eq(barisSatu[2], formatRupiahAman(78_334), "sel gadai 1 juta");
      eq(barisSatu[3], formatRupiahAman(188_000), "sel kredit 1 juta");
    }
  }
}

// ===== Pembagian produk syariah =====
ada(teks, "Pembagian produk syariah", "bagian syariah ada");
{
  const akad = pembagianSyariahProposal();
  eq(akad.length, 3, "tiga akad syariah dijelaskan");
  eq(akad.map((a) => a.akad).join(","), "Murabahah,Rahn,Qardh", "jenis akad");
  eq(akad[0]?.margin, 2_000_000, "margin murabahah 20% dari 10 juta");
  eq(akad[0]?.pendana, 1_566_667, "hak pendana murabahah 47/60");
  eq(akad[0]?.platform, 433_333, "porsi platform murabahah 13/60");
  eq(akad[0]?.diterima, 11_566_667, "diterima pendana murabahah");
  eq(akad[1]?.margin, 200_000, "ujrah rahn 2% satu siklus");
  eq(akad[1]?.pendana, 156_667, "hak pendana rahn");
  eq(akad[2]?.pendana, 0, "qardh tanpa margin");
  eq(akad[2]?.diterima, 10_000_000, "qardh kembali pokok saja");

  const tabelAkad = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Akad",
  );
  ok(tabelAkad !== undefined, "dokumen memuat tabel akad syariah");
  if (tabelAkad !== undefined && "tabel" in tabelAkad) {
    eq(tabelAkad.tabel.kepala.length, 6, "tabel akad enam kolom");
    eq(tabelAkad.tabel.baris.length, 3, "tabel akad tiga baris");
    for (const b of akad) {
      const baris = tabelAkad.tabel.baris.find((r) => r[0] === b.akad);
      ok(baris !== undefined, `baris akad ${b.akad}`);
      if (baris === undefined) continue;
      eq(baris[2], formatRupiahAman(b.margin), `margin ${b.akad}`);
      eq(baris[3], formatRupiahAman(b.pendana), `pendana ${b.akad}`);
      eq(baris[4], formatRupiahAman(b.platform), `platform ${b.akad}`);
      eq(baris[5], formatRupiahAman(b.diterima), `diterima ${b.akad}`);
    }
  }

  const simulasi = simulasiSyariahProposal();
  eq(simulasi.length, 10, "simulasi syariah sepuluh nominal");
  eq(simulasi[0]?.murabahah15, 117_500, "murabahah 15% pada 1 juta");
  eq(simulasi[0]?.murabahah20, 156_667, "murabahah 20% pada 1 juta");
  eq(simulasi[0]?.rahn, 15_667, "rahn 2% pada 1 juta");
  eq(simulasi[0]?.qardh, 0, "qardh tanpa bagian");
  const tabelSimulasi = dokumen.baris.find(
    (b) => "tabel" in b && b.tabel.kepala[0] === "Pokok syariah",
  );
  ok(tabelSimulasi !== undefined, "dokumen memuat simulasi syariah");
  if (tabelSimulasi !== undefined && "tabel" in tabelSimulasi) {
    eq(tabelSimulasi.tabel.kepala.length, 5, "simulasi syariah lima kolom");
    eq(tabelSimulasi.tabel.baris.length, 10, "simulasi syariah sepuluh baris");
    const barisSatu = tabelSimulasi.tabel.baris.find(
      (r) => r[0] === formatRupiahAman(1_000_000),
    );
    ok(barisSatu !== undefined, "baris syariah satu juta ada");
    if (barisSatu !== undefined) {
      eq(barisSatu[1], formatRupiahAman(117_500), "sel murabahah 15%");
      eq(barisSatu[3], formatRupiahAman(15_667), "sel rahn");
      eq(barisSatu[4], formatRupiahAman(0), "sel qardh nol");
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

// ===== Tarif tersimpan tidak lagi mengubah dokumen =====
// Angka porsi platform adalah kebijakan tetap 13/60 marjin. Field lama
// `persenPotonganAdmin` tetap dibaca dari data proposal, tetapi tidak boleh
// lagi menggeser angka apa pun di dokumen.
{
  const lain = semuaTeks(
    proposalPendanaanPindai({ persenPotonganAdmin: 2.5, dibuatPada: WAKTU }),
  );
  eq(lain, teks, "tarif tersimpan 2,5% tidak mengubah isi dokumen");
  ok(!lain.includes("2,5% x marjin"), "tarif lama tidak dicetak sebagai dasar");
  eq(
    bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL).diterima,
    contoh.diterima,
    "porsi 13/60 tidak berubah oleh tarif biaya lama",
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
  // Jumlah halaman mengikuti isi dokumen; yang dijaga adalah KONSISTENSI
  // penomoran (sampul tidak bernomor, halaman isi 1..N) dan kop di tiap halaman.
  const halamanIsi = jumlahHalaman - 1;
  ok(
    jumlahHalaman >= 7,
    `dokumen memuat sampul dan minimal enam halaman isi (${jumlahHalaman})`,
  );
  ok(pdf.startsWith("%PDF-1.4"), "berkas dimulai dengan header PDF");
  ok(pdf.trimEnd().endsWith("%%EOF"), "berkas diakhiri penanda EOF");
  ada(
    pdf,
    `Halaman 1 dari ${halamanIsi}`,
    "halaman isi pertama bernomor 1 dari N",
  );
  ada(
    pdf,
    `Halaman ${halamanIsi} dari ${halamanIsi}`,
    "halaman isi terakhir bernomor N dari N",
  );
  ok(!pdf.includes("Halaman 0 dari"), "sampul tidak memakai nomor nol");
  eq(
    pdf.split("PINJAM GADAI DIGITAL \\(PINDAI\\)").length - 1,
    jumlahHalaman,
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

  const halamanCatatan = halaman.findIndex((h) =>
    h.some((t) => t.teks.includes("Dana pada tenor bulanan")),
  );
  ok(
    halamanCatatan >= 0 &&
      halaman[halamanCatatan].some((t) => t.teks.includes("Simulasi pinjaman bulanan Rp 1 juta")),
    "catatan tenor tidak tertinggal sendirian dari tabel berikutnya",
  );
  const halamanTerpendek = Math.min(...halaman.slice(1).map((h) => h.length));
  ok(
    halamanTerpendek >= 20,
    `tidak ada halaman isi yang hampir kosong (${halamanTerpendek} teks)`,
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
