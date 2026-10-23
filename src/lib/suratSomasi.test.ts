/** Run: bun src/lib/suratSomasi.test.ts */
import { pelunasanPinjaman } from "./loan";
import { formatRupiah } from "./money";
import {
  BATAS_BAYAR_HARI,
  MIN_HARI_SOMASI,
  cekSomasi,
  htmlSomasiEmail,
  namaBerkasSomasi,
  nomorSuratSomasi,
  subjekSomasiEmail,
  susunSuratSomasi,
  teksSomasi,
  teksSomasiWhatsapp,
  type DataSuratSomasi,
} from "./suratSomasi";
import { buatPdfSomasi } from "./suratSomasiPdf";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function ok(nilai: boolean, label: string) {
  if (nilai) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const HARI = 86_400_000;
const SEKARANG = Date.UTC(2026, 9, 19, 4, 0, 0);

const data: DataSuratSomasi = {
  nomorReferensi: "PNJ-2026-0042",
  namaPeminjam: "Rani Peminjam",
  pokokBerjalan: 500_000,
  jatuhTempoPada: SEKARANG - 10 * HARI,
  hariTerlambat: 10,
  dendaTerlambat: 100_000,
  totalKewajiban: 750_000,
  persenDendaPerHari: 2,
  rekening: { nama: "PT PINDAI", bank: "BCA", nomor: "1234567890" },
  identitas: {
    namaBadan: "PT PINDAI SEJAHTERA",
    alamat: "Jl. Contoh No. 1, Jakarta",
    email: "tagihan@pindai.test",
    telepon: "021-555-0100",
  },
};

// Gerbang: hanya pinjaman yang benar-benar lewat jatuh tempo.
eq(cekSomasi({ hariTerlambat: 0, totalKewajiban: 750_000 }).ok, false, "belum jatuh tempo ditolak");
const belum = cekSomasi({ hariTerlambat: 0, totalKewajiban: 750_000 });
if (!belum.ok) ok(/belum melewati jatuh tempo/i.test(belum.alasan), "alasan belum jatuh tempo");
eq(cekSomasi({ hariTerlambat: 3, totalKewajiban: null }).ok, false, "kewajiban kosong ditolak");
eq(cekSomasi({ hariTerlambat: 3, totalKewajiban: 0 }).ok, false, "kewajiban nol ditolak");
eq(MIN_HARI_SOMASI, 3, "ambang somasi H+3");
eq(cekSomasi({ hariTerlambat: 1, totalKewajiban: 1 }).ok, false, "H+1 belum boleh somasi");
const terlaluAwal = cekSomasi({ hariTerlambat: 2, totalKewajiban: 750_000 });
if (!terlaluAwal.ok) {
  ok(/setelah keterlambatan 3 hari/i.test(terlaluAwal.alasan), "alasan ambang H+3");
}
eq(cekSomasi({ hariTerlambat: 3, totalKewajiban: 1 }).ok, true, "H+3 diterima");
eq(
  cekSomasi({ hariTerlambat: 1, totalKewajiban: 1 }, { minHari: 1 }).ok,
  true,
  "ambang dapat diturunkan pemanggil",
);

// Nomor surat memakai tanggal WIB.
eq(nomorSuratSomasi("PNJ-2026-0042", SEKARANG), "SOMASI/PNJ-2026-0042/20261019", "nomor surat");
eq(nomorSuratSomasi("  ", SEKARANG), "SOMASI/PINDAI/20261019", "nomor surat tanpa referensi");

const surat = susunSuratSomasi(data, { sekarang: SEKARANG });
eq(surat.tanggalTeks, "19 Oktober 2026", "tanggal surat");
eq(surat.batasBayarTeks, "26 Oktober 2026", "batas bayar 7 hari");
eq(surat.batasBayarPada, SEKARANG + BATAS_BAYAR_HARI * HARI, "epoch batas bayar");
eq(surat.kepada, "Rani Peminjam", "penerima");
ok(surat.paragraf.some((p) => p.includes("PNJ-2026-0042")), "referensi disebut di paragraf");
ok(surat.paragraf.some((p) => p.includes("10 hari")), "lama keterlambatan disebut");
const barisRincian = (awalan: string) =>
  surat.rincian.find((r) => r.label.startsWith(awalan));
eq(barisRincian("Pokok pinjaman")?.nilai, formatRupiah(500_000), "pokok di rincian");
eq(
  barisRincian("Bunga dan biaya tercatat")?.nilai,
  formatRupiah(150_000),
  "bunga di rincian",
);
eq(barisRincian("Denda keterlambatan")?.nilai, formatRupiah(100_000), "denda di rincian");
const barisTerakhir = surat.rincian[surat.rincian.length - 1];
eq(barisTerakhir?.label, "Total yang harus dibayar", "total di baris terakhir");
eq(barisTerakhir?.nilai, formatRupiah(750_000), "nilai total di rincian");
ok(
  barisRincian("Denda keterlambatan")?.label.includes("2% dari pokok per hari") ?? false,
  "tarif denda di label",
);

/** "Rp 300.000" atau "Rp -5.000" → 300000 / -5000. */
function angkaRupiah(nilai: string): number {
  return Number(nilai.replace(/[^\d-]/g, ""));
}
function jumlahBaris(surat: { rincian: { nilai: string }[] }): number {
  return surat.rincian
    .slice(0, -1)
    .reduce((total, baris) => total + angkaRupiah(baris.nilai), 0);
}
eq(
  jumlahBaris(surat),
  angkaRupiah(surat.rincian[surat.rincian.length - 1]?.nilai ?? "0"),
  "jumlah baris rincian sama dengan total tagihan",
);

// Pinjaman yang sudah diperpanjang ditagih dari SISA pokok, bukan pokok awal;
// kalau memakai pokok awal, baris pokok + denda melebihi total tagihan.
const diperpanjang = susunSuratSomasi(
  {
    ...data,
    pokokBerjalan: 300_000,
    dendaTerlambat: 60_000,
    totalKewajiban: 420_000,
  },
  { sekarang: SEKARANG },
);
eq(
  diperpanjang.rincian.find((r) => r.label === "Pokok pinjaman")?.nilai,
  formatRupiah(300_000),
  "pokok berjalan dipakai pada surat",
);
eq(jumlahBaris(diperpanjang), 420_000, "rincian pinjaman diperpanjang menjumlah");
ok(
  diperpanjang.rincian.every((r) => angkaRupiah(r.nilai) >= 0),
  "tidak ada baris negatif pada data yang konsisten",
);

// Keterlambatan melewati batas 100% pokok: label menyebut batasnya, bukan
// seolah-olah tarif harian masih dipakai penuh.
const kenaBatas = susunSuratSomasi(
  {
    ...data,
    hariTerlambat: 60,
    dendaTerlambat: 500_000,
    totalKewajiban: 1_150_000,
  },
  { sekarang: SEKARANG },
);
ok(
  kenaBatas.rincian
    .find((r) => r.label.startsWith("Denda keterlambatan"))
    ?.label.includes("dibatasi 100% dari pokok") ?? false,
  "denda yang kena batas diberi label batas",
);
eq(jumlahBaris(kenaBatas), 1_150_000, "rincian denda berbatas menjumlah");

// Angka surat harus persis angka mesin pelunasan yang dipakai panel penagihan,
// termasuk saat pinjaman sudah diperpanjang.
const pelunasan = pelunasanPinjaman(
  {
    pokokPinjaman: 1_000_000,
    status: "didanai",
    didanaiPada: SEKARANG - 20 * HARI,
    tenorHari: 28,
    remainingPrincipal: 600_000,
    nextDueDate: SEKARANG - 10 * HARI,
    nextInterestAmount: 120_000,
  },
  SEKARANG,
  2,
);
ok(pelunasan !== null, "pelunasan pinjaman diperpanjang tersedia");
if (pelunasan !== null) {
  const suratPelunasan = susunSuratSomasi(
    {
      ...data,
      pokokBerjalan: pelunasan.pokokBerjalan ?? 1_000_000,
      hariTerlambat: pelunasan.hariTerlambat,
      dendaTerlambat: pelunasan.dendaTerlambat,
      totalKewajiban: pelunasan.totalKewajibanDenganPenalti,
    },
    { sekarang: SEKARANG },
  );
  eq(pelunasan.pokokBerjalan, 600_000, "pokok berjalan memakai sisa pokok");
  eq(pelunasan.dendaTerlambat, 120_000, "denda dihitung dari sisa pokok");
  eq(
    jumlahBaris(suratPelunasan),
    pelunasan.totalKewajibanDenganPenalti,
    "rincian surat sama dengan total mesin pelunasan",
  );
}
ok(surat.instruksiBayar.some((i) => i.includes("BCA 1234567890")), "rekening tujuan disebut");
ok(surat.instruksiBayar.some((i) => i.includes("PNJ-2026-0042")), "referensi di instruksi bayar");
ok(surat.penutup.some((p) => p.includes("bukan putusan pengadilan")), "batas dokumen disebut");
ok(surat.penutup.some((p) => p.includes("OTP")), "peringatan OTP disebut");
ok(
  surat.penutup.some((p) => /penjadwalan ulang/i.test(p)),
  "ruang pembicaraan tetap dibuka",
);
ok(surat.penutup.some((p) => p.includes("tagihan@pindai.test")), "email resmi di surat");
ok(surat.penutup.some((p) => p.includes("021-555-0100")), "telepon resmi di surat");
eq(surat.pembuat, "Tim Penagihan PT PINDAI SEJAHTERA", "nama badan di pembuat");

// Versi teks dipakai untuk salin dan WhatsApp.
const teks = teksSomasi(surat);
ok(teks.includes("SURAT SOMASI"), "teks salinan memuat judul");
ok(
  teks.includes(`Total yang harus dibayar: ${formatRupiah(750_000)}`),
  "teks salinan memuat total",
);
ok(teks.includes("PT PINDAI SEJAHTERA"), "teks salinan memuat nama badan");
const wa = teksSomasiWhatsapp(surat);
ok(wa.includes("terlambat 10 hari"), "pesan WA menyebut keterlambatan");
ok(wa.includes(formatRupiah(750_000)), "pesan WA menyebut total");
ok(wa.includes("26 Oktober 2026"), "pesan WA menyebut batas bayar");
ok(wa.length < teks.length, "pesan WA lebih ringkas daripada surat penuh");
ok(/—/.test(wa) === false, "pesan WA tanpa em dash");
eq(
  subjekSomasiEmail(surat),
  "Somasi keterlambatan pinjaman PNJ-2026-0042 - PT PINDAI SEJAHTERA",
  "subjek email",
);
const email = htmlSomasiEmail(surat);
ok(email.includes("Surat somasi"), "email menyebut surat somasi");
ok(email.includes(formatRupiah(750_000)), "email memuat total");
ok(email.includes("tagihan@pindai.test"), "email memuat kontak resmi");

// Bank kosong tidak menghasilkan kalimat rancu.
const tanpaBank = susunSuratSomasi(
  { ...data, rekening: { nama: "PT PINDAI", bank: "  ", nomor: "1234567890" } },
  { sekarang: SEKARANG },
);
ok(
  tanpaBank.instruksiBayar.some((i) => i.includes("rekening usaha 1234567890")),
  "tanpa nama bank, nomor rekening tetap terbaca",
);

// Tanpa rekening usaha, surat tidak mengarang nomor rekening.
const tanpaRekening = susunSuratSomasi({ ...data, rekening: null }, { sekarang: SEKARANG });
ok(
  tanpaRekening.instruksiBayar.every((i) => !i.includes("Transfer ke rekening")),
  "tanpa rekening tidak menyebut transfer",
);
ok(
  tanpaRekening.instruksiBayar.some((i) => i.includes("menu Bantuan")),
  "tanpa rekening mengarahkan ke petugas",
);

eq(namaBerkasSomasi(surat), "somasi-pnj-2026-0042.pdf", "nama berkas");

// Bahasa surat: tanpa em dash dan tanpa klaim yang melewati batas.
const semuaTeks = [
  surat.perihal,
  ...surat.paragraf,
  ...surat.rincian.map((r) => `${r.label}: ${r.nilai}`),
  ...surat.instruksiBayar,
  ...surat.penutup,
].join("\n");
ok(!semuaTeks.includes("\u2014"), "tanpa em dash");
ok(!/\bsita\b/i.test(semuaTeks), "tanpa ancaman penyitaan");
ok(!/sebar(kan)? data/i.test(semuaTeks), "tanpa penyebaran data");

// PDF benar-benar terbentuk dan memuat isi surat.
const byte = buatPdfSomasi(surat);
const teksPdf = new TextDecoder("latin1").decode(byte);
ok(teksPdf.startsWith("%PDF-"), "header PDF");
ok(teksPdf.includes("SURAT SOMASI"), "judul di PDF");
ok(teksPdf.includes("PT PINDAI SEJAHTERA"), "nama badan di PDF");
ok(teksPdf.includes("SOMASI/PNJ-2026-0042/20261019"), "nomor di PDF");
ok(!teksPdf.includes("undefined"), "tidak ada nilai kosong tercetak");
ok(byte.length > 1_000, "PDF berisi halaman");

console.log(`suratSomasi: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
