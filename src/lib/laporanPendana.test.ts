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
  laporanRekapPendana,
  namaBerkasPelunasan,
  namaBerkasPortofolio,
  namaBerkasRekapPendana,
  pesanPelunasan,
  pesanPortofolio,
  pesanRekapPendana,
  proyeksiReturnTerdekat,
  type DataPelunasanPendana,
  type DataPortofolioPendana,
  type DataRekapPendana,
} from "./laporanPendana";
import { susunPdf, teksPdf, type DokumenPdf } from "./pdfSederhana";
import { totalPendana, type SumberPendana } from "./tabelPendana";

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
      tanggalReturn: T1 + 10 * 86_400_000,
    },
    {
      nomorReferensi: "PND/2026/09/0003",
      namaPeminjam: "Joko Susilo",
      pokokPinjaman: 5_000_000,
      keuntunganPendana: 1_200_000,
      tanggal: T0,
      tanggalReturn: T1 + 3 * 86_400_000,
    },
  ],
  pinjamanLunas: [
    {
      nomorReferensi: "PND/2026/09/0001",
      namaPeminjam: "Budi Santoso",
      pokokPinjaman: 5_000_000,
      keuntunganPendana: 1_200_000,
      tanggal: T1,
      tanggalReturn: T1,
    },
  ],
  transferBelumDicatat: 0,
};

/**
 * Semua teks baris sebuah dokumen, termasuk pasangan label/nilai.
 *
 * Pasangan dua kolom digabung kembali sebagai "label: nilai" supaya uji tetap
 * membaca satu fakta utuh walau di PDF label dan angkanya punya posisi sendiri.
 */
function semuaTeks(dokumen: DokumenPdf): string[] {
  return dokumen.baris.flatMap((b) => {
    if ("teks" in b) return [b.teks];
    if ("label" in b) return [`${b.label}: ${b.nilai}`];
    return [];
  });
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
    teks.some((t) => t.includes("Peminjam: Bu** Sa*****")),
    "nama peminjam dicetak tersamarkan sebagai identitas baris",
  );
  ok(
    !teks.some((t) => t.includes("Budi Santoso")),
    "nama lengkap peminjam tidak pernah tercetak",
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
    teks.some((t) => t.startsWith("PND/2026/09/0002")),
    "baris pinjaman berjalan memuat referensi dan tanggalnya",
  );
  ok(
    teks.some((t) => t.includes("perkiraan Rp 1.200.000")),
    "baris pinjaman berjalan memuat angka perkiraannya",
  );
  ok(
    teks.some((t) => t.includes("PND/2026/09/0001")),
    "baris pinjaman lunas tetap menyebut referensinya",
  );
  ok(
    teks.some((t) => t.includes("dibukukan Rp 1.200.000")),
    "baris pinjaman lunas memakai kata dibukukan",
  );
  ok(
    teks.some((t) => t.includes("jatuh tempo")),
    "setiap baris menyebut proyeksi jatuh tempo return",
  );
  ok(
    teks.some((t) => t.includes("bukan janji pembayaran")),
    "proyeksi return tidak diklaim sebagai janji",
  );
  eq(
    proyeksiReturnTerdekat(PORTOFOLIO),
    T1 + 3 * 86_400_000,
    "proyeksi return terdekat diambil dari pinjaman berjalan",
  );
  ok(
    pesanPortofolio(PORTOFOLIO).includes("Proyeksi return terdekat"),
    "pesan WhatsApp menyebut proyeksi return terdekat",
  );
  const tanpaTanggal = {
    ...PORTOFOLIO,
    pinjamanBerjalan: PORTOFOLIO.pinjamanBerjalan.map((p) => ({
      ...p,
      tanggalReturn: null,
    })),
  };
  eq(
    proyeksiReturnTerdekat(tanpaTanggal),
    null,
    "tanpa tanggal terbaca, proyeksi terdekat null",
  );
  ok(
    pesanPortofolio(tanpaTanggal).includes("Belum ada proyeksi"),
    "pesan tidak mengarang tanggal saat datanya kosong",
  );
  ok(
    teks.some((t) => t.includes("Ri** Wa**")),
    "nama peminjam pada daftar juga disamarkan",
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
    tanggalReturn: T1,
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

/* ===== 3b. Kop, kaki, dan pengulangan kop di halaman berikutnya ===== */
{
  const dokumen = laporanPortofolio(PORTOFOLIO);
  ok(dokumen.kop?.nama.includes("PINDAI") === true, "laporan memakai kop PINDAI");
  ok(dokumen.kaki?.includes("dokumen dibuat otomatis") === true, "laporan punya kaki halaman");

  const pdf = teksPdf(susunPdf(dokumen));
  ok(
    pdf.includes("PINJAM GADAI DIGITAL \\(PINDAI\\)"),
    "nama layanan tercetak di kop",
  );
  ok(pdf.includes("LAPORAN PENDANAAN"), "jenis dokumen tercetak di kanan kop");
  ok(pdf.includes("Halaman 1 dari"), "nomor halaman tercetak di kaki");
  ok(pdf.includes("PINDAI - dokumen dibuat otomatis oleh sistem"), "keterangan penerbit tercetak di kaki");

  const banyak = Array.from({ length: 40 }, (_, i) => ({
    nomorReferensi: `PND/2026/10/${2000 + i}`,
    namaPeminjam: `Peminjam ${i + 1}`,
    pokokPinjaman: 1_000_000,
    keuntunganPendana: 200_000,
    tanggal: T0,
    tanggalReturn: T1,
  }));
  const panjang = teksPdf(
    susunPdf(laporanPortofolio({ ...PORTOFOLIO, pinjamanBerjalan: banyak, pinjamanLunas: [] })),
  );
  const jumlahHalaman = Number(/\/Count (\d+)/.exec(panjang)?.[1]);
  ok(jumlahHalaman >= 2, "laporan panjang terbagi menjadi beberapa halaman");
  const merek = "PINJAM GADAI DIGITAL \\(PINDAI\\)";
  eq(
    panjang.split(merek).length - 1,
    jumlahHalaman,
    "kop dicetak ulang di setiap halaman",
  );
  ok(
    panjang.includes(`Halaman ${jumlahHalaman} dari ${jumlahHalaman}`),
    "halaman terakhir menyebut nomor halaman yang benar",
  );
}

/* ===== 3c. Rekap seluruh pendana ===== */
{
  const baris: SumberPendana[] = [
    {
      nama: "ROBERT",
      jumlahPinjaman: 2,
      jumlahAktif: 1,
      jumlahLunas: 1,
      totalDisalurkan: 8_500_000,
      saldoBerjalan: 7_000_000,
      keuntunganPendana: 1_200_000,
      keuntunganPendanaLunas: 350_000,
      keuntunganPendanaBelumLunas: 850_000,
      keuntunganAdmin: 550_000,
      keuntunganAdminLunas: 150_000,
      keuntunganAdminBelumLunas: 400_000,
      transferTercatat: 1,
      transferBelumDicatat: 0,
      keuntunganBelumDicatat: 0,
    },
    {
      nama: "EVELYN",
      jumlahPinjaman: 1,
      jumlahAktif: 1,
      jumlahLunas: 0,
      totalDisalurkan: 3_100_000,
      saldoBerjalan: 3_100_000,
      keuntunganPendana: 728_500,
      keuntunganPendanaLunas: 0,
      keuntunganPendanaBelumLunas: 728_500,
      keuntunganAdmin: 201_500,
      keuntunganAdminLunas: 0,
      keuntunganAdminBelumLunas: 201_500,
      transferTercatat: 0,
      transferBelumDicatat: 0,
      keuntunganBelumDicatat: 0,
    },
  ];
  const data: DataRekapPendana = {
    dicetakPada: T1,
    baris,
    total: totalPendana(baris),
  };
  const dokumen = laporanRekapPendana(data);
  const teks = semuaTeks(dokumen);

  ok(teks.some((t) => t === "Rekap pinjaman semua pendana"), "rekap punya judul sendiri");
  ok(teks.some((t) => t === "Jumlah pendana: 2"), "jumlah pendana dihitung dari baris");
  ok(
    teks.some((t) => t === "Dana tersalurkan: Rp 11.600.000"),
    "dana tersalurkan total sama dengan penjumlahan baris",
  );
  ok(
    teks.some((t) => t === "Total keuntungan pendana: Rp 1.928.500"),
    "total keuntungan pendana dijumlahkan",
  );
  ok(teks.some((t) => t === "1. ROBERT"), "setiap pendana punya bagiannya sendiri");
  ok(teks.some((t) => t === "2. EVELYN"), "urutan pendana mengikuti rekap");
  ok(
    teks.some((t) => t === "Keuntungan perkiraan (belum lunas): Rp 1.578.500"),
    "keuntungan perkiraan total dipisah dari yang dibukukan",
  );
  ok(
    !teks.some((t) => t.includes("Budi Santoso") || t.includes("Rina Wati")),
    "rekap tidak memuat nama peminjam",
  );

  const pdf = teksPdf(susunPdf(dokumen));
  ok(pdf.includes("KHUSUS SUPER ADMIN"), "kop rekap menandai dokumen khusus admin");
  eq(namaBerkasRekapPendana(T1), "rekap-pendana-2026-10-02.pdf", "nama berkas rekap memakai tanggal ISO");

  const pesan = pesanRekapPendana(data);
  ok(pesan.includes("2 pendana"), "pesan rekap menyebut jumlah pendana");
  ok(pesan.includes("Rp 11.600.000"), "pesan rekap menyebut dana tersalurkan");
  ok(pesan.includes("lampiran PDF"), "pesan rekap menunjuk lampirannya");
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
  ok(!pdf.includes("Budi Santoso"), "nama lengkap tidak ikut tercetak di berkas PDF");
}

/* ===== 5. Keterangan pesan dan nama berkas ===== */
{
  const pesan = pesanPelunasan(PELUNASAN);
  ok(pesan.includes("PND/2026/09/0001"), "pesan pelunasan menyebut nomor referensi");
  ok(pesan.includes("Rp 1.200.000"), "pesan pelunasan menyebut angka yang dibukukan");
  ok(!pesan.includes("\u2014"), "pesan pelunasan tanpa tanda pisah panjang");
  ok(pesan.includes("lampiran PDF"), "pesan menunjuk lampirannya");
  ok(pesan.includes("Bu** Sa*****"), "pesan WhatsApp juga memakai nama tersamarkan");
  ok(!pesan.includes("Budi Santoso"), "nama lengkap tidak bocor lewat pesan WhatsApp");

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
