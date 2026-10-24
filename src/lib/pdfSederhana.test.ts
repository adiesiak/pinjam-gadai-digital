/**
 * Uji penulis PDF tanpa dependensi.
 * Run: bun src/lib/pdfSederhana.test.ts
 *
 * Yang dijaga:
 *  - berkas selalu sah: header PDF, penanda EOF, dan jumlah halaman yang benar;
 *  - sampul dan kop dicetak pada tempatnya, termasuk nomor halaman;
 *  - teks panjang dibungkus, bukan keluar margin;
 *  - karakter di luar Latin-1 dinormalkan, bukan menjadi kotak rusak;
 *  - baris angka (label, tiga kolom, tabel enam kolom, pita) sejajar;
 *  - tidak ada teks yang bertumpuk atau melewati margin kertas.
 */
import {
  bungkusTeks,
  keLatin1,
  susunPdf,
  susunPdfResmi,
  teksPdf,
  type DokumenPdf,
} from "./pdfSederhana";

let passed = 0;
let failed = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function ada(teks: string, potongan: string, label: string): void {
  ok(teks.includes(potongan), `${label} (memuat "${potongan}")`);
}

type TeksPdf = { size: number; x: number; y: number; teks: string };

/** Teks beserta posisinya di dalam berkas, per halaman. */
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

/* ===== 1. Berkas dasar ===== */
{
  const byte = susunPdf({
    baris: [{ teks: "Halo pendana", gaya: "biasa" }],
  });
  const pdf = teksPdf(byte);
  ok(pdf.startsWith("%PDF-1.4"), "berkas dimulai dengan header PDF");
  ok(pdf.trimEnd().endsWith("%%EOF"), "berkas diakhiri penanda EOF");
  eq(Number(/\/Count (\d+)/.exec(pdf)?.[1]), 1, "dokumen satu halaman");
  ada(pdf, "Halo pendana", "isi halaman tercetak");
  ok(!/\bundefined\b|\bNaN\b/.test(pdf), "tanpa undefined atau NaN");
  ok(byte.length > 500, "berkas berisi objek PDF yang utuh");
}

/* ===== 2. Halaman, kaki, dan nomor ===== */
{
  const dokumen: DokumenPdf = {
    baris: Array.from({ length: 90 }, (_, i) => ({
      teks: `Baris ${i + 1} laporan pendanaan yang cukup panjang untuk memaksa pembungkusan.`,
      gaya: "biasa" as const,
    })),
  };
  const pdf = teksPdf(susunPdf(dokumen));
  const jumlah = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
  ok(jumlah > 1, "isi panjang dibagi menjadi beberapa halaman");
  ada(pdf, `Halaman 1 dari ${jumlah}`, "halaman pertama bernomor");
  ada(pdf, `Halaman ${jumlah} dari ${jumlah}`, "halaman terakhir bernomor");
  ok(!pdf.includes("Halaman 0 dari"), "tidak ada halaman bernomor nol");
  const barisGambar = (pdf.match(/ Tj ET/g) ?? []).length;
  ok(barisGambar >= 90, "setiap baris isi tercetak");

  // Satu baris sangat panjang dibungkus, bukan dibiarkan keluar margin.
  const panjang = susunPdf({
    baris: [{ teks: "Kata ".repeat(200).trim(), gaya: "biasa" }],
  });
  const teksPanjang = teksPdf(panjang);
  ok(
    (teksPanjang.match(/ Tj ET/g) ?? []).length > 3,
    "teks panjang dibungkus menjadi beberapa baris gambar",
  );
}

/* ===== 3. Paksa halaman baru ===== */
{
  const pdf = teksPdf(
    susunPdf({
      baris: [
        { teks: "Halaman pertama", gaya: "biasa" },
        { halamanBaru: true },
        { teks: "Halaman kedua", gaya: "biasa" },
      ],
    }),
  );
  eq(Number(/\/Count (\d+)/.exec(pdf)?.[1]), 2, "halaman baru dipatuhi");
  ada(pdf, "Halaman pertama", "isi halaman pertama tercetak");
  ada(pdf, "Halaman kedua", "isi halaman kedua tercetak");
  ok(
    !pdf.includes("Halaman 3 dari"),
    "penanda halaman baru tidak menambah nomor salah",
  );
}

/* ===== 4. Sampul dan kop ===== */
{
  const dokumen: DokumenPdf = {
    kop: {
      nama: "PINJAM GADAI DIGITAL (PINDAI)",
      keterangan: "Layanan pendanaan",
      referensi: "PROPOSAL PENDANAAN",
    },
    sampul: {
      judul: "Pembagian hasil pendanaan",
      subjudul: "Skema pendanaan untuk calon pendana.",
      meta: "Diterbitkan 22 Oktober 2026 / PINDAI",
      fakta: [
        { nilai: "30 hari", label: "Siklus pendanaan" },
        { nilai: "30%", label: "Imbal Hasil" },
        { nilai: "5%", label: "Biaya platform" },
      ],
      catatan: "Imbal Hasil dihitung dari pokok yang Anda danai.",
      isi: ["Ringkasan skema", "Contoh pembagian"],
      penutup: "Pendanaan bukan tabungan.",
      kaki: "Dokumen ini bukan perjanjian.",
    },
    kaki: "PINDAI - proposal",
    baris: [
      { teks: "Ringkasan skema", gaya: "seksi" },
      {
        pita: {
          label: "Diterima bersih",
          nilai: "Rp 12.350.000",
          catatan: "Keuntungan bersih Rp 2.350.000.",
        },
      },
      {
        kolom: {
          kiri: "Nominal",
          tengah: "Imbal Hasil",
          kanan: "Diterima",
        },
        tebal: true,
      },
      {
        kolom: {
          kiri: "Rp 5.000.000",
          tengah: "Rp 1.500.000",
          kanan: "Rp 6.175.000",
        },
      },
      { halamanBaru: true },
      { teks: "Halaman kedua", gaya: "biasa" },
    ],
  };
  const byte = susunPdf(dokumen);
  const pdf = teksPdf(byte);
  eq(
    Number(/\/Count (\d+)/.exec(pdf)?.[1]),
    3,
    "sampul + dua halaman isi menjadi tiga halaman",
  );
  ada(pdf, "Pembagian hasil pendanaan", "judul sampul tercetak");
  ada(pdf, "30 hari", "angka kunci sampul tercetak");
  ada(pdf, "ISI DOKUMEN", "daftar isi sampul tercetak");
  ada(pdf, "Pendanaan bukan tabungan.", "kalimat penutup sampul tercetak");
  ada(pdf, "Dokumen ini bukan perjanjian.", "catatan kaki sampul tercetak");
  ada(pdf, "Halaman 1 dari 2", "halaman isi pertama bernomor 1 dari 2");
  ada(pdf, "Halaman 2 dari 2", "halaman isi kedua bernomor 2 dari 2");
  ok(!pdf.includes("Halaman 3 dari"), "tidak ada halaman isi ketiga");
  ada(pdf, "Halaman kedua", "paksa halaman baru dipatuhi");
  ada(pdf, " re f", "pita memakai bidang berisi");
  ada(pdf, "Rp 12.350.000", "nilai pita tercetak");
  ada(pdf, "Keuntungan bersih Rp 2.350.000.", "catatan pita tercetak");
  eq(
    pdf.split("PINJAM GADAI DIGITAL \\(PINDAI\\)").length - 1,
    3,
    "nama layanan tercetak di sampul dan setiap halaman isi",
  );
  ok(byte.length > 4_000, "berkas sampul berisi tiga halaman teks");

  // Tiga kolom: x menaik pada garis dasar yang sama.
  const posisi = [
    ...pdf.matchAll(
      /1 0 0 1 ([\d.]+) ([\d.]+) Tm \((Rp 5\.000\.000|Rp 1\.500\.000|Rp 6\.175\.000)\) Tj/g,
    ),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), isi: m[3] ?? "" }));
  const kiri = posisi.find((p) => p.isi === "Rp 5.000.000");
  const tengah = posisi.find((p) => p.isi === "Rp 1.500.000");
  const kanan = posisi.find((p) => p.isi === "Rp 6.175.000");
  ok(
    kiri !== undefined && tengah !== undefined && kanan !== undefined,
    "tiga kolom tercetak",
  );
  eq(kiri?.y, kanan?.y, "kolom berada pada garis dasar yang sama");
  ok((tengah?.x ?? 0) > (kiri?.x ?? 0), "kolom tengah di kanan kolom kiri");
  ok((kanan?.x ?? 0) > (tengah?.x ?? 0), "kolom kanan di kanan kolom tengah");
}

/* ===== 5. Label dan nilai ===== */
{
  const pdf = teksPdf(
    susunPdf({
      baris: [
        { label: "Biaya platform", nilai: "Rp 650.000" },
        {
          label:
            "Total pengembalian yang diterima pendana setelah siklus selesai",
          nilai: "Rp 12.350.000",
        },
      ],
    }),
  );
  const posisi = [
    ...pdf.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm \(([^)]*)\) Tj/g),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), teks: m[3] ?? "" }));
  const label = posisi.find((p) => p.teks === "Biaya platform");
  const nilai = posisi.find((p) => p.teks === "Rp 650.000");
  ok(label !== undefined && nilai !== undefined, "label dan nilai tercetak");
  eq(label?.y, nilai?.y, "nilai berada pada baris label");
  ok((nilai?.x ?? 0) > (label?.x ?? 0), "nilai berada di kanan label");
  const labelPanjang = posisi.filter((p) =>
    p.teks.startsWith("Total pengembalian"),
  );
  ok(labelPanjang.length > 0, "label panjang tetap tercetak");
  ok(
    labelPanjang.every((p) => p.x >= 47),
    "label panjang tidak keluar margin kiri",
  );
  const nilaiPanjang = posisi.find((p) => p.teks === "Rp 12.350.000");
  ok(
    (nilaiPanjang?.x ?? 0) > (labelPanjang[0]?.x ?? 0),
    "nilai tetap di kanan label yang dibungkus",
  );
}

/* ===== 6. Tabel enam kolom ===== */
{
  const pdf = teksPdf(
    susunPdf({
      baris: [
        {
          tabel: {
            kepala: [
              "Pokok",
              "Imbal 30%",
              "Uang Kembali",
              "Biaya 5%",
              "Diterima",
              "Keuntungan",
            ],
            baris: [
              [
                "Rp 5.000.000",
                "Rp 1.500.000",
                "Rp 6.500.000",
                "Rp 325.000",
                "Rp 6.175.000",
                "Rp 1.175.000",
              ],
            ],
          },
        },
      ],
    }),
  );
  for (const teks of [
    "Pokok",
    "Imbal 30%",
    "Uang Kembali",
    "Biaya 5%",
    "Diterima",
    "Keuntungan",
  ]) {
    ada(pdf, teks, `kepala tabel ${teks}`);
  }
  const sel = [
    ...pdf.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm \((Rp [\d.]+)\) Tj/g),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), teks: m[3] ?? "" }));
  eq(sel.length, 6, "enam sel angka tercetak");
  ok(
    sel.every((s) => Math.round(s.y) === Math.round(sel[0]?.y ?? -1)),
    "enam sel berada pada garis dasar yang sama",
  );
  for (let i = 1; i < sel.length; i += 1) {
    ok(sel[i].x > sel[i - 1].x, `kolom ${i + 1} di kanan kolom ${i}`);
  }
  ok((sel[sel.length - 1]?.x ?? 0) < 505, "kolom terakhir masih di dalam margin");
  ada(pdf, "/F2 7.8 Tf", "kepala tabel memakai huruf tebal 7,8 pt");
  ok(pdf.includes("/F1 7.8 Tf"), "sel tabel memakai huruf biasa 7,8 pt");
  ok(
    masalahTataLetak(pdf).length === 0,
    "tabel tidak menumpuk dan tidak keluar margin",
  );
}

/* ===== 7. Normalisasi teks (Latin-1 + escape) ===== */
{
  eq(
    keLatin1("Rp10.000 \u2014 lunas"),
    "Rp10.000 - lunas",
    "em dash dinormalkan menjadi tanda hubung",
  );
  eq(
    keLatin1("biaya \u00d7 2"),
    "biaya x 2",
    "tanda kali dinormalkan menjadi huruf x",
  );
  eq(
    keLatin1("emoji \u{1f600} aman"),
    "emoji ? aman",
    "karakter di luar Latin-1 diganti tanda tanya",
  );
  eq(
    keLatin1("Nama: \u2018Budi\u2019"),
    "Nama: 'Budi'",
    "kutip melengkung dinormalkan",
  );

  const byte = susunPdf({
    baris: [
      { teks: "Jumlah (biaya) 5% \\ sisa", gaya: "biasa" },
      { teks: "Rp1.000 \u2014 dibukukan", gaya: "tebal" },
    ],
  });
  const pdf = teksPdf(byte);
  ada(pdf, "\\(biaya\\)", "kurung di-escape supaya tidak menutup string PDF");
  ok(pdf.includes("\\\\"), "garis miring di-escape");
  ok(!pdf.includes("\u2014"), "tidak ada em dash yang ikut tercetak");
  ok(!pdf.includes("\ufffd"), "tidak ada karakter rusak di berkas");
}

/* ===== 8. Pembungkusan dan dokumen kosong ===== */
{
  const tunggal = bungkusTeks("Halo pendana", 10.5);
  eq(tunggal.length, 1, "teks pendek tidak dibungkus");
  const panjang = bungkusTeks(
    "Peminjam: Nama Yang Sangat Panjang Sekali ".repeat(4).trim(),
    10.5,
  );
  ok(panjang.length > 1, "teks panjang dibungkus menjadi beberapa potongan");
  ok(
    panjang.every((b) => b.length > 0),
    "tidak ada potongan kosong di tengah hasil",
  );

  const kataPanjang = bungkusTeks(
    "PND/2026/VERY-LONG-REFERENCE-NUMBER-WITHOUT-SPACES-AT-ALL",
    10.5,
  );
  ok(
    kataPanjang.every((b) => b.length <= 95),
    "kata tanpa spasi yang lebih panjang dari satu baris dipotong paksa",
  );

  const kosong = susunPdf({ baris: [] });
  eq(
    Number(/\/Count (\d+)/.exec(teksPdf(kosong))?.[1]),
    1,
    "dokumen tanpa isi tetap satu halaman",
  );
}

/** Teks yang kotak hurufnya bersinggungan dengan garis horizontal tabel. */
function teksBertumpuk(pdf: string): string[] {
  const halaman = [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)].map((m) => m[1]);
  const masalah: string[] = [];
  for (const isi of halaman) {
    const teks = [
      ...isi.matchAll(
        /\/(F1|F2) ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g,
      ),
    ]
      .map((m) => ({
        ukuran: Number(m[2]),
        x: Number(m[3]),
        y: Number(m[4]),
        teks: m[5] ?? "",
      }))
      .filter((t) => t.y > 58);
    const perGaris = new Map<number, typeof teks>();
    for (const t of teks) {
      const kunci = Math.round(t.y);
      perGaris.set(kunci, [...(perGaris.get(kunci) ?? []), t]);
    }
    for (const baris of perGaris.values()) {
      const urut = [...baris].sort((a, b) => a.x - b.x);
      for (let i = 1; i < urut.length; i += 1) {
        const kiri = urut[i - 1];
        const kanan = urut[i];
        const akhirKiri = kiri.x + kiri.teks.length * kiri.ukuran * 0.55;
        if (akhirKiri > kanan.x + 1) {
          masalah.push(`"${kiri.teks}" menumpuk "${kanan.teks}"`);
        }
      }
    }
  }
  return masalah;
}

function teksMenembusGaris(pdf: string): string[] {
  const halaman = [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)].map((m) => m[1]);
  return halaman.flatMap((isi) => {
    const garis = [
      ...isi.matchAll(
        /([\d.]+ [\d.]+ [\d.]+) RG [\d.]+ w ([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g,
      ),
    ]
      .filter((m) => Math.abs(Number(m[3]) - Number(m[5])) < 0.01)
      .map((m) => Number(m[3]));
    return [
      ...isi.matchAll(
        /\/(F1|F2) ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g,
      ),
    ]
      .map((m) => ({ ukuran: Number(m[2]), y: Number(m[4]), teks: m[5] ?? "" }))
      .filter(
        (t) =>
          t.y > 58 &&
          garis.some(
            (y) => y > t.y - t.ukuran * 0.21 && y < t.y + t.ukuran * 0.72,
          ),
      )
      .map((t) => t.teks);
  });
}

/* ===== 9. Dokumen resmi: tabel panjang, kaki, dan metadata ===== */
{
  const baris = Array.from({ length: 70 }, (_, i) => ({
    sel: [`Baris ${i + 1}`, `Rp ${(i + 1) * 1000}`],
  }));
  const pdf = teksPdf(
    susunPdfResmi({
      nomor: "DOK-UJI",
      judul: "UJI TABEL PANJANG",
      kaki: "PINDAI - uji tabel",
      blok: [
        {
          jenis: "banner",
          merek: "PINDAI",
          subjudul: "Dokumen uji",
          nomor: "DOK-UJI",
          tanggal: "Dicetak hari ini",
        },
        { jenis: "judul", teks: "Daftar panjang" },
        {
          jenis: "tabel",
          kepala: ["KETERANGAN", "NOMINAL"],
          bobot: [8, 2],
          rataKanan: [1],
          baris,
        },
      ],
    }),
  );
  const halaman = [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)].map(
    (m) => m[1],
  );
  ok(halaman.length >= 3, "tabel panjang dipecah ke halaman berikutnya");
  eq((pdf.match(/Baris \d+/g) ?? []).length, 70, "tidak ada baris tabel yang hilang");
  ok(
    halaman.every((isi) => isi.includes("KETERANGAN")),
    "kepala tabel dicetak di setiap halaman lanjutan",
  );
  eq(
    (pdf.match(/DOK-UJI - PINDAI - uji tabel/g) ?? []).length,
    halaman.length,
    "nomor dokumen dan kaki dicetak di setiap halaman",
  );
  ok(pdf.includes("/Title (UJI TABEL PANJANG DOK-UJI)"), "metadata judul ditulis");
  ok(pdf.includes("/Author (PINDAI)"), "metadata penerbit ditulis");
  ok(pdf.includes("/Info"), "kamus info dirujuk dari trailer");

  // Baris tabel harus duduk di antara garis, bukan menimpanya.
  const menembus = halaman.flatMap((isi) => {
    const aturan = [
      ...isi.matchAll(
        /([\d.]+ [\d.]+ [\d.]+) RG [\d.]+ w ([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g,
      ),
    ]
      .filter((m) => Math.abs(Number(m[3]) - Number(m[5])) < 0.01)
      .map((m) => Number(m[3]));
    return [
      ...isi.matchAll(
        /\/(F1|F2) ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g,
      ),
    ]
      .map((m) => ({ ukuran: Number(m[2]), y: Number(m[4]) }))
      .filter(
        (t) =>
          t.y > 58 &&
          aturan.some(
            (y) => y > t.y - t.ukuran * 0.21 && y < t.y + t.ukuran * 0.72,
          ),
      );
  });
  eq(menembus.length, 0, "tidak ada teks dokumen resmi yang menembus garis");
}

/* ===== 10. Label panjang dan nominal besar ===== */
{
  const pdf = teksPdf(
    susunPdfResmi({
      nomor: "DOK-BESAR",
      judul: "UJI NOMINAL BESAR",
      kaki: "PINDAI - uji nominal",
      blok: [
        {
          jenis: "banner",
          merek: "PINDAI",
          subjudul: "Dokumen uji nominal",
          nomor: "DOK-BESAR",
          tanggal: "Dicetak hari ini",
        },
        { jenis: "judul", teks: "Rincian kewajiban" },
        {
          jenis: "tabel",
          kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
          bobot: [8, 2],
          rataKanan: [1],
          baris: [
            {
              sel: [
                "Sisa pokok pinjaman setelah perpanjangan tenor dan penyesuaian admin",
                "Rp 999.999.999",
              ],
            },
            {
              sel: [
                "Denda keterlambatan (2% per hari, dibatasi 100% dari pokok)",
                "Rp 1.000.000",
              ],
              nada: "potongan",
            },
          ],
        },
      ],
    }),
  );
  ok(pdf.includes("Rp 999.999.999"), "nominal besar tercetak utuh");
  ok(pdf.includes("Rp 1.000.000"), "nominal denda tercetak");
  ok(
    pdf.includes("dibatasi 100% dari pokok"),
    "label panjang dibungkus dan tetap terbaca",
  );
  eq(
    teksMenembusGaris(pdf).length,
    0,
    `label/nominal besar tidak menembus garis: ${teksMenembusGaris(pdf).join(", ")}`,
  );

  const rekap = teksPdf(
    susunPdfResmi({
      nomor: "DOK-REKAP",
      judul: "UJI KOLOM SEMPIT",
      kaki: "PINDAI - uji kolom",
      blok: [
        {
          jenis: "banner",
          merek: "PINDAI",
          subjudul: "Dokumen uji kolom",
          nomor: "DOK-REKAP",
          tanggal: "Dicetak hari ini",
        },
        {
          jenis: "tabel",
          kepala: [
            "PENDANA",
            "PINJAMAN",
            "TERSALURKAN",
            "BERJALAN",
            "DIBUKUKAN",
            "PERKIRAAN",
            "TOTAL",
          ],
          bobot: [2.3, 0.9, 1.5, 1.4, 1.4, 1.4, 1.4],
          rataKanan: [1, 2, 3, 4, 5, 6],
          baris: [
            {
              sel: [
                "ROBERT",
                "12",
                "Rp 999.999.999.999",
                "Rp 999.999.999.999",
                "Rp 999.999.999.999",
                "Rp 999.999.999.999",
                "Rp 999.999.999.999",
              ],
            },
          ],
        },
      ],
    }),
  );
  ok(rekap.includes("Rp 999.999.999.999"), "nominal sangat besar tetap utuh");
  eq(
    teksBertumpuk(rekap).length,
    0,
    `nominal kolom sempit tidak menumpuk tetangganya: ${teksBertumpuk(rekap).join(", ")}`,
  );
}

console.log(`pdfSederhana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
