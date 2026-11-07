/** Run: bun src/lib/rincianPinjaman.test.ts */
import { susunRincianPinjaman, htmlRincianEmail, namaBerkasRincian, teksRincianEmail, teksRincianWhatsapp, type PinjamanUntukRincian } from "./rincianPinjaman";
import { formatRupiah } from "./money";

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

const pinjamanHarian: PinjamanUntukRincian = {
  nomorReferensi: "PNJ-2026-0012",
  namaLengkap: "Rani Peminjam",
  status: "didanai",
  pokokPinjaman: 500_000,
  tenorHari: 30,
  didanaiPada: SEKARANG - 10 * HARI,
  diajukanPada: SEKARANG - 12 * HARI,
  tujuan: "modal_usaha",
  namaBank: "BCA",
  nomorRekening: "1234567890",
};

const pinjamanBulanan: PinjamanUntukRincian = {
  nomorReferensi: "PNJ-2026-0099",
  namaLengkap: "Budi <Peminjam>",
  status: "didanai",
  pokokPinjaman: 1_000_000,
  tenorHari: 90,
  tenorBulan: 3,
  didanaiPada: SEKARANG - 5 * HARI,
  diajukanPada: SEKARANG - 8 * HARI,
  nomorRekening: "9876543210",
};

const harian = susunRincianPinjaman(pinjamanHarian, {
  sekarang: SEKARANG,
  dendaPerHari: 2,
});

// Skema harian: potongan 2%, bunga 30% dari pokok, satu kali lunas.
eq(harian.skemaTeks, "Harian", "skema harian");
eq(harian.tenorTeks, "30 hari", "tenor harian");
eq(harian.pokokPinjaman, 500_000, "pokok disimpan di dokumen");
eq(harian.totalKewajiban, 650_000, "total kewajiban 130% sebelum denda");
eq(harian.dendaTerlambat, 0, "belum terlambat");
eq(harian.jatuhTempoTeks, formatTanggalUji(SEKARANG - 10 * HARI + 30 * HARI), "jatuh tempo");
const kelompokHarian = harian.kelompok.map((k) => k.judul);
ok(kelompokHarian.includes("Dana yang Anda terima"), "kelompok dana ada");
ok(kelompokHarian.includes("Yang Anda bayar"), "kelompok bayar ada");
ok(kelompokHarian.includes("Status hari ini"), "kelompok status ada untuk pinjaman cair");
eq(harian.jadwal, null, "skema harian tanpa tabel cicilan");
const rekening = harian.kelompok
  .flatMap((k) => k.baris)
  .find((b) => b.label === "Rekening tujuan");
eq(rekening?.nilai, "BCA •••• 7890", "rekening disamarkan di dokumen");
eq(harian.rekeningTujuanLengkap, "BCA 1234567890", "rekening lengkap tersedia untuk pesan WA");

// Pinjaman yang belum dicairkan tidak punya kewajiban berjalan.
const menunggu = susunRincianPinjaman(
  { ...pinjamanHarian, status: "ditinjau", didanaiPada: null },
  { sekarang: SEKARANG, dendaPerHari: 2 },
);
eq(menunggu.totalKewajiban, null, "belum cair tanpa kewajiban berjalan");
ok(!menunggu.kelompok.some((k) => k.judul === "Status hari ini"), "tanpa blok status");
eq(
  menunggu.kelompok.flatMap((k) => k.baris).find((b) => b.label === "Tanggal dana dicairkan")?.nilai,
  "Belum dicairkan",
  "tanggal cair kosong ditulis apa adanya",
);

// Denda muncul saat jatuh tempo sudah lewat.
const telat = susunRincianPinjaman(
  { ...pinjamanHarian, didanaiPada: SEKARANG - 40 * HARI },
  { sekarang: SEKARANG, dendaPerHari: 2 },
);
eq(telat.hariTerlambat, 10, "terlambat 10 hari");
eq(telat.dendaTerlambat, 100_000, "denda 2% pokok per hari");
eq(telat.totalKewajiban, 750_000, "total termasuk denda");

// Skema bulanan: dana diterima 98% dan jadwal cicilan sebanyak tenor.
const bulanan = susunRincianPinjaman(pinjamanBulanan, { sekarang: SEKARANG, dendaPerHari: 2 });
eq(bulanan.skemaTeks, "Bulanan", "skema bulanan");
eq(bulanan.tenorTeks, "3 bulan", "tenor bulanan");
eq(bulanan.jadwal?.baris.length, 3, "tiga baris cicilan");
const dana = bulanan.kelompok.flatMap((k) => k.baris);
eq(
  dana.find((b) => b.label === "Dana bersih ke rekening")?.nilai,
  formatRupiah(980_000),
  "dana bersih 98%",
);
eq(
  dana.find((b) => b.label.startsWith("Biaya admin (2%"))?.nilai,
  formatRupiah(20_000),
  "biaya admin 2% dipotong di muka",
);
const totalBaris = bulanan.kelompok
  .flatMap((k) => k.baris)
  .find((b) => b.label.startsWith("Total cicilan selama"));
eq(totalBaris?.tegas, true, "total cicilan dicetak tegas");
// 1 jt tenor 3 bulan: bunga flat 8%/bulan = 240.000, ditambah biaya admin
// cicilan 2% dari tiap cicilan (24.801), jadi 1.264.801.
ok(
  totalBaris?.nilai === formatRupiah(1_264_801),
  `total cicilan sama dengan jumlah jadwal (${totalBaris?.nilai})`,
);
ok(
  bulanan.catatan.some((c) => c.includes("Total biaya pinjaman") && c.includes("Rp 284.801")),
  "catatan menyebut total bunga dan biaya admin",
);
ok(
  bulanan.kelompok
    .flatMap((k) => k.baris)
    .some((b) => b.label.includes("dari pokok + bunga cicilan")),
  "label biaya admin cicilan menjelaskan dasar perhitungan",
);

// Teks yang dikirim tidak boleh memuat em dash (aturan copy proyek).
for (const teks of [
  teksRincianWhatsapp(harian),
  teksRincianEmail(bulanan),
  htmlRincianEmail(bulanan),
]) {
  ok(!teks.includes("\u2014"), "tanpa em dash");
}

// Nama peminjam di-escape sebelum masuk badan email.
ok(htmlRincianEmail(bulanan).includes("Budi &lt;Peminjam&gt;"), "nama di-escape di HTML");
const waHarian = teksRincianWhatsapp(harian);
ok(waHarian.includes("PNJ-2026-0012"), "pesan WA memuat nomor referensi");
ok(waHarian.includes("Rekening tujuan: BCA 1234567890"), "pesan WA memuat rekening lengkap");
ok(!waHarian.toLowerCase().includes("pdf"), "pesan WA tidak menjanjikan lampiran PDF");

// Potongan di muka dan dana bersih harus terbaca di pesan WA, bukan hanya PDF.
ok(waHarian.includes("Rincian potongan:"), "pesan WA memuat judul rincian potongan");
const danaHarian = harian.kelompok.find((k) => k.judul === "Dana yang Anda terima");
const potonganHarian =
  danaHarian?.baris.filter((b) => b.nada === "potongan" && b.nilai !== formatRupiah(0)) ?? [];
ok(potonganHarian.length > 0, "dokumen harian punya komponen potongan");
for (const b of potonganHarian) {
  ok(waHarian.includes(`- ${b.label}: ${b.nilai}`), `pesan WA memuat potongan ${b.label}`);
}
const bersihHarian = danaHarian?.baris.find((b) => b.nada === "bersih");
ok(
  bersihHarian !== undefined && waHarian.includes(`${bersihHarian.label}: ${bersihHarian.nilai}`),
  "pesan WA memuat dana bersih ke rekening",
);

eq(namaBerkasRincian(bulanan), "PINDAI-Rincian-Pinjaman-PNJ-2026-0099.pdf", "nama berkas PDF");

console.log(`rincianPinjaman: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);

/** Tanggal panjang WIB seperti yang dipakai dokumen (untuk pembanding uji). */
function formatTanggalUji(ms: number): string {
  return new Date(ms + 7 * 60 * 60 * 1000).toLocaleDateString("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
