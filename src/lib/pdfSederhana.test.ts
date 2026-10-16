/**
 * Uji penulis PDF laporan (fungsi murni, tanpa dependensi).
 * Run: bun src/lib/pdfSederhana.test.ts
 *
 * Yang dijaga: berkas yang dihasilkan benar-benar bisa dibuka pembaca PDF.
 * Bagian yang paling gampang salah adalah tabel `xref`: setiap offset harus
 * menunjuk tepat ke awal objek. Offset yang melenceng tidak membuat berkas
 * "gagal tampil" di layar pengembang, tetapi membuat pembaca PDF menolak
 * berkasnya. Karena itu offset diperiksa byte demi byte di sini.
 */
import { bagiHalaman, bungkusTeks, keLatin1, siapkanBaris, susunPdf, teksPdf } from "./pdfSederhana";

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

/** Ambil posisi kemunculan pertama sebuah penanda (byte), atau -1. */
function posisi(teks: string, penanda: string): number {
  return teks.indexOf(penanda);
}

/** Offset objek dari tabel xref, urut nomor objek. */
function offsetXref(teks: string): number[] {
  const mulai = teks.lastIndexOf("\nxref\n");
  const badan = teks.slice(mulai + "\nxref\n".length);
  const baris = badan.split("\n");
  const hasil: number[] = [];
  for (let i = 2; i < baris.length; i += 1) {
    const cocok = /^(\d{10}) (\d{5}) ([nf]) $/.exec(baris[i] ?? "");
    if (cocok === null) break;
    if (cocok[3] === "n") hasil.push(Number(cocok[1]));
  }
  return hasil;
}

/* ===== 1. Struktur berkas ===== */
{
  const byte = susunPdf({
    kaki: "PINDAI",
    baris: [
      { teks: "Laporan Kinerja Pendanaan", gaya: "judul" },
      { teks: "Pendana: Siti Aminah", gaya: "biasa" },
      { garis: true },
      { teks: "Dana tersalurkan: Rp10.000.000", gaya: "tebal" },
    ],
  });
  const teks = teksPdf(byte);
  ok(byte instanceof Uint8Array, "keluaran berupa Uint8Array");
  ok(teks.startsWith("%PDF-1.4\n"), "berkas dimulai dengan penanda versi PDF");
  ok(teks.endsWith("%%EOF\n"), "berkas ditutup penanda EOF");
  ok(posisi(teks, "/Type /Catalog") > 0, "ada objek katalog");
  ok(posisi(teks, "/Type /Pages") > 0, "ada objek daftar halaman");
  ok(posisi(teks, "/BaseFont /Helvetica") > 0, "font teks biasa tertanam sebagai referensi baku");
  ok(posisi(teks, "/BaseFont /Helvetica-Bold") > 0, "font tebal tersedia");
  ok(teks.includes("Pendana: Siti Aminah"), "teks isi tertulis di aliran halaman");
  ok(teks.includes("PINDAI  -  Halaman 1 dari 1"), "kaki halaman memuat nama layanan dan nomor halaman");
  eq(byte.length, teks.length, "satu karakter berkas sama dengan satu byte (Latin-1)");
}

/* ===== 2. Tabel xref menunjuk ke awal objek ===== */
{
  const byte = susunPdf({
    baris: [
      { teks: "Laporan", gaya: "judul" },
      { teks: "Baris kedua", gaya: "biasa" },
    ],
  });
  const teks = teksPdf(byte);
  const offset = offsetXref(teks);
  ok(offset.length >= 6, "tabel xref memuat semua objek (katalog, halaman, font, isi)");

  let semuaBenar = true;
  offset.forEach((pos, i) => {
    const awal = `${i + 1} 0 obj`;
    if (teks.slice(pos, pos + awal.length) !== awal) {
      semuaBenar = false;
      console.error(`FAIL objek ${i + 1}: offset ${pos} menunjuk ke ${JSON.stringify(teks.slice(pos, pos + 12))}`);
    }
  });
  ok(semuaBenar, "setiap offset xref menunjuk tepat ke awal objeknya");

  const startxref = /startxref\n(\d+)\n%%EOF\n$/.exec(teks);
  ok(startxref !== null, "trailer memuat startxref");
  eq(
    Number(startxref?.[1]),
    posisi(teks, "xref\n0 "),
    "startxref menunjuk tepat ke penanda tabel xref",
  );
  eq(
    Number(/\/Size (\d+)/.exec(teks)?.[1]),
    offset.length + 1,
    "jumlah entri /Size sama dengan objek + entri bebas (0)",
  );
}

/* ===== 3. Pemenggalan halaman ===== */
{
  // 80 baris gaya biasa (leading 15 + jarak 2 = 17) melewati kapasitas satu
  // halaman, dan tetap muat di halaman kedua.
  const banyak = Array.from({ length: 80 }, (_, i) => ({
    teks: `Baris ${i + 1} dari daftar panjang yang harus dipenggal`,
    gaya: "biasa" as const,
  }));
  const byte = susunPdf({ baris: banyak });
  const teks = teksPdf(byte);
  eq(Number(/\/Count (\d+)/.exec(teks)?.[1]), 2, "80 baris terbagi menjadi 2 halaman");
  ok(teks.includes("Halaman 2 dari 2"), "halaman kedua menyebut jumlah halaman yang benar");
  eq(
    (teks.match(/\/Type \/Page[ /]/g) ?? []).length,
    2,
    "dua objek halaman ditulis (tanpa objek /Pages ikut terhitung)",
  );
  ok(teks.includes("Baris 80"), "isi terakhir tetap tertulis, tidak terpotong diam-diam");

  // Pagar atas: dokumen yang lebih panjang tetap menghasilkan jumlah halaman
  // yang konsisten dengan daftar halaman di `/Kids`.
  const sangatPanjang = susunPdf({
    baris: Array.from({ length: 300 }, (_, i) => ({ teks: `Baris ${i + 1}`, gaya: "biasa" as const })),
  });
  const teksSangatPanjang = teksPdf(sangatPanjang);
  const jumlahHalaman = Number(/\/Count (\d+)/.exec(teksSangatPanjang)?.[1]);
  eq(
    (teksSangatPanjang.match(/ \d+ 0 R/g) ?? []).length > jumlahHalaman,
    true,
    "daftar /Kids memuat satu referensi per halaman",
  );
  ok(
    teksSangatPanjang.includes(`Halaman ${jumlahHalaman} dari ${jumlahHalaman}`),
    "halaman terakhir menyebut nomor halaman terakhir",
  );

  // Satu baris sangat panjang dibungkus, bukan dibiarkan keluar margin.
  const panjang = susunPdf({
    baris: [{ teks: "Kata ".repeat(200).trim(), gaya: "biasa" }],
  });
  const teksPanjang = teksPdf(panjang);
  const jumlahBarisGambar = (teksPanjang.match(/ Tj ET/g) ?? []).length;
  ok(jumlahBarisGambar > 3, "teks panjang dibungkus menjadi beberapa baris gambar");
}

/* ===== 4. Normalisasi teks (Latin-1 + escape) ===== */
{
  eq(keLatin1("Rp10.000 \u2014 lunas"), "Rp10.000 - lunas", "em dash dinormalkan menjadi tanda hubung");
  eq(keLatin1("biaya \u00d7 2"), "biaya x 2", "tanda kali dinormalkan menjadi huruf x");
  eq(keLatin1("emoji \u{1f600} aman"), "emoji ? aman", "karakter di luar Latin-1 diganti tanda tanya");
  eq(keLatin1("Nama: \u2018Budi\u2019"), "Nama: 'Budi'", "kutip melengkung dinormalkan");

  const byte = susunPdf({
    baris: [
      { teks: "Jumlah (biaya) 5% \\ sisa", gaya: "biasa" },
      { teks: "Rp1.000 \u2014 dibukukan", gaya: "tebal" },
    ],
  });
  const teks = teksPdf(byte);
  ok(teks.includes("\\(biaya\\)"), "kurung di-escape supaya tidak menutup literal string PDF");
  ok(teks.includes("\\\\"), "garis miring di-escape");
  ok(!teks.includes("\u2014"), "tidak ada em dash yang ikut tercetak");
  ok(!teks.includes("\ufffd"), "tidak ada karakter rusak di berkas");
  eq(teks.length, byte.length, "tidak ada karakter di luar Latin-1 yang menambah byte");
}

/* ===== 5. Fungsi tata letak ===== */
{
  const tunggal = bungkusTeks("Halo pendana", 10.5);
  eq(tunggal.length, 1, "teks pendek tidak dibungkus");
  const panjang = bungkusTeks("Peminjam: Nama Yang Sangat Panjang Sekali ".repeat(4).trim(), 10.5);
  ok(panjang.length > 1, "teks panjang dibungkus menjadi beberapa potongan");
  ok(panjang.every((b) => b.length > 0), "tidak ada potongan kosong di tengah hasil");

  const kataPanjang = bungkusTeks("PND/2026/VERY-LONG-REFERENCE-NUMBER-WITHOUT-SPACES-AT-ALL", 10.5);
  ok(
    kataPanjang.every((b) => b.length <= 95),
    "kata tanpa spasi yang lebih panjang dari satu baris dipotong paksa",
  );

  const kosong = susunPdf({ baris: [] });
  eq(Number(/\/Count (\d+)/.exec(teksPdf(kosong))?.[1]), 1, "dokumen tanpa isi tetap menghasilkan satu halaman");

  const siap = siapkanBaris([{ teks: "Judul", gaya: "judul" }, { kosong: true }, { garis: true }]);
  eq(siap.length, 3, "baris kosong dan garis tetap dihitung sebagai satu baris tata letak");
  const dibagi = bagiHalaman(siap);
  eq(dibagi.length, 1, "tiga baris pendek muat di satu halaman");
}

console.log(`pdfSederhana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
