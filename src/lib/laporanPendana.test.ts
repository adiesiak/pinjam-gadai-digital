/**
 * Uji isi laporan pendana (fungsi murni).
 * Run: bun src/lib/laporanPendana.test.ts
 *
 * Yang dijaga: angka yang dicetak sama dengan format rupiah aplikasi, laporan
 * tidak pernah memuat tanda pisah panjang, batas baris dipatuhi dengan catatan
 * sisa yang jujur, dan kabar yang belum tentu benar (transfer belum dicatat)
 * tidak dihilangkan.
 */
import {
  BATAS_PINJAMAN_LAPORAN,
  laporanPelunasan,
  laporanPortofolio,
  namaBerkasPelunasan,
  namaBerkasPortofolio,
  pesanPelunasan,
  pesanPortofolio,
  type DataPelunasanPendana,
  type DataPortofolioPendana,
} from "./laporanPendana";
import { susunPdf, teksPdf, type DokumenPdf } from "./pdfSederhana";

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

const T0 = Date.UTC(2026, 8, 3, 3, 0, 0); // 3 Sep 2026
const T1 = Date.UTC(2026, 9, 2, 3, 0, 0); // 2 Okt 2026

const PELUNASAN: DataPelunasanPendana = {
  namaPendana: "Siti Aminah",
  nomorReferensi: "PND/2026/09/0001",
  namaPeminjam: "Budi Santoso",
  pokokPinjaman: 5_000_000,
  totalLunas: 6_500_000,
  potonganAdmin: 300_000,
  keuntunganPendana: 1_200_000,
  didanaiPada: T0,
  lunasPada: T1,
  transferDicatat: true,
  dicetakPada: T1,
};

const PORTOFOLIO: DataPortofolioPendana = {
  namaPendana: "Siti Aminah",
  dicetakPada: T1,
  totalDisalurkan: 15_000_000,
  saldoBerjalan: 10_000_000,
  keuntunganDibukukan: 1_200_000,
  keuntunganPerkiraan: 2_400_000,
  totalKeuntungan: 3_600_000,
  potonganAdmin: 900_000,
  jumlahBerjalan: 2,
  jumlahLunas: 1,
  pinjamanBerjalan: [
    {
      nomorReferensi: "PND/2026/09/0002",
      namaPeminjam: "Rina Wati",
      pokokPinjaman: 5_000_000,
      keuntunganPendana: 1_200_000,
      tanggal: T0,
    },
    {
      nomorReferensi: "PND/2026/09/0003",
      namaPeminjam: "Joko Susilo",
      pokokPinjaman: 5_000_000,
      keuntunganPendana: 1_200_000,
      tanggal: T0,
    },
  ],
  pinjamanLunas: [
    {
      nomorReferensi: "PND/2026/09/0001",
      namaPeminjam: "Budi Santoso",
      pokokPinjaman: 5_000_000,
      keuntunganPendana: 1_200_000,
      tanggal: T1,
    },
  ],
  transferBelumDicatat: 0,
};

/** Semua teks baris sebuah dokumen, untuk pemeriksaan larangan karakter. */
function semuaTeks(dokumen: DokumenPdf): string[] {
  return dokumen.baris.flatMap((b) => ("teks" in b ? [b.teks] : []));
}

/* ===== 1. Laporan pelunasan ===== */
{
  const dokumen = laporanPelunasan(PELUNASAN);
  const teks = semuaTeks(dokumen);
  ok(teks.some((t) => t.includes("Rp 1.200.000")), "keuntungan dibukukan tercetak sebagai rupiah");
  ok(
    teks.some((t) => t.includes("Keuntungan pendana (dibukukan): Rp 1.200.000")),
    "baris keuntungan memakai istilah ruang penyedia dana",
  );
  ok(
    teks.some((t) => t.includes("Biaya platform (layanan): Rp 300.000")),
    "biaya platform tercetak terpisah dari keuntungan",
  );
  ok(
    teks.some((t) => t.includes("Nomor referensi: PND/2026/09/0001")),
    "nomor referensi dicetak apa adanya",
  );
  ok(
    teks.some((t) => t.includes("Catatan transfer keuntungan sudah dibuat admin")),
    "status transfer yang sudah dicatat dinyatakan terbuka",
  );
  ok(
    !teks.some((t) => t.includes("belum dibuat admin")),
    "tidak ada kalimat transfer tertunda saat catatannya sudah ada",
  );
  ok(
    teks.some((t) => t.includes("Peminjam: Budi Santoso")),
    "nama peminjam dicetak sebagai identitas baris",
  );

  const tertunda = laporanPelunasan({ ...PELUNASAN, transferDicatat: false });
  ok(
    semuaTeks(tertunda).some((t) => t.includes("Catatan transfer keuntungan belum dibuat admin")),
    "transfer yang belum dicatat disebut apa adanya",
  );
}

/* ===== 2. Laporan portofolio ===== */
{
  const dokumen = laporanPortofolio(PORTOFOLIO);
  const teks = semuaTeks(dokumen);
  ok(
    teks.some((t) => t.includes("Total keuntungan pendana: Rp 3.600.000")),
    "total keuntungan dicetak",
  );
  ok(
    teks.some((t) => t.includes("Keuntungan perkiraan (belum lunas): Rp 2.400.000")),
    "bagian perkiraan dipisah dari yang dibukukan",
  );
  ok(
    teks.some((t) => t.includes("Masih berjalan: Rp 10.000.000 (2 pinjaman)")),
    "saldo berjalan menyebut jumlah pinjaman yang membentuknya",
  );
  ok(
    teks.some((t) => t.includes("PND/2026/09/0002") && t.includes("perkiraan Rp 1.200.000")),
    "baris pinjaman berjalan memuat referensi dan angka perkiraannya",
  );
  ok(
    teks.some((t) => t.includes("PND/2026/09/0001") && t.includes("dibukukan Rp 1.200.000")),
    "baris pinjaman lunas memakai kata dibukukan",
  );
  ok(
    teks.some((t) => t.includes("Seluruh keuntungan yang sudah dibukukan memiliki catatan transfer")),
    "tanpa transfer tertunda, dinyatakan seluruhnya tercatat",
  );

  const tertunda = laporanPortofolio({ ...PORTOFOLIO, transferBelumDicatat: 2 });
  ok(
    semuaTeks(tertunda).some((t) => t.includes("2 pinjaman lunas sudah dibukukan")),
    "jumlah transfer tertunda disebut sebagai angka, bukan disamarkan",
  );

  const kosong = laporanPortofolio({ ...PORTOFOLIO, pinjamanBerjalan: [], pinjamanLunas: [] });
  ok(
    semuaTeks(kosong).some((t) => t === "Belum ada pinjaman pada bagian ini."),
    "bagian kosong menyatakan keadaannya, bukan dibiarkan tanpa penjelasan",
  );
}

/* ===== 3. Batas baris dan catatan sisa ===== */
{
  const banyak = Array.from({ length: BATAS_PINJAMAN_LAPORAN + 5 }, (_, i) => ({
    nomorReferensi: `PND/2026/09/${1000 + i}`,
    namaPeminjam: `Peminjam ${i + 1}`,
    pokokPinjaman: 1_000_000,
    keuntunganPendana: 200_000,
    tanggal: T0,
  }));
  const dokumen = laporanPortofolio({ ...PORTOFOLIO, pinjamanBerjalan: banyak, pinjamanLunas: [] });
  const teks = semuaTeks(dokumen);
  const barisPinjaman = teks.filter((t) => t.startsWith("PND/2026/09/1"));
  eq(barisPinjaman.length, BATAS_PINJAMAN_LAPORAN, "jumlah baris pinjaman dibatasi");
  ok(
    teks.some((t) => t.includes("Dan 5 pinjaman lain pada bagian ini")),
    "sisa baris yang tidak dicetak disebutkan jumlahnya",
  );
}

/* ===== 4. Larangan tanda pisah panjang dan karakter di luar Latin-1 ===== */
{
  const dokumen = [laporanPelunasan(PELUNASAN), laporanPortofolio(PORTOFOLIO)];
  const semua = dokumen.flatMap(semuaTeks);
  ok(!semua.some((t) => t.includes("\u2014")), "tidak ada tanda pisah panjang di isi laporan");
  ok(!semua.some((t) => t.includes("^")), "tidak ada penanda internal yang ikut tercetak");
  const pdf = teksPdf(susunPdf(laporanPelunasan(PELUNASAN)));
  ok(!pdf.includes("\u2014"), "tidak ada tanda pisah panjang di berkas PDF");
  ok(pdf.includes("Keuntungan pendana \\(dibukukan\\)"), "kurung pada label di-escape di PDF");
}

/* ===== 5. Keterangan pesan dan nama berkas ===== */
{
  const pesan = pesanPelunasan(PELUNASAN);
  ok(pesan.includes("PND/2026/09/0001"), "pesan pelunasan menyebut nomor referensi");
  ok(pesan.includes("Rp 1.200.000"), "pesan pelunasan menyebut angka yang dibukukan");
  ok(!pesan.includes("\u2014"), "pesan pelunasan tanpa tanda pisah panjang");
  ok(pesan.includes("lampiran PDF"), "pesan menunjuk lampirannya");

  const pesanPorto = pesanPortofolio(PORTOFOLIO);
  ok(pesanPorto.includes("Rp 15.000.000"), "pesan portofolio menyebut dana tersalurkan");
  ok(!pesanPorto.includes("\u2014"), "pesan portofolio tanpa tanda pisah panjang");

  eq(
    namaBerkasPelunasan("PND/2026/09/0001"),
    "laporan-pelunasan-pnd-2026-09-0001.pdf",
    "nama berkas pelunasan memakai referensi yang dislug",
  );
  eq(
    namaBerkasPortofolio(Date.UTC(2026, 9, 2)),
    "laporan-pendanaan-2026-10-02.pdf",
    "nama berkas portofolio memakai tanggal ISO",
  );
  eq(namaBerkasPelunasan("///"), "laporan-pelunasan-pinjaman.pdf", "referensi kosong tetap menghasilkan nama berkas");
}

console.log(`laporanPendana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
