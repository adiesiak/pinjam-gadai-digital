/**
 * Uji mesin jadwal angsuran (murni). Run: bun src/lib/angsuran.test.ts
 *
 * Yang dijaga: jadwal berasal dari mesin harga yang sama dengan pengajuan,
 * jumlah pokok tidak berubah, tanggal jatuh tempo berurutan, denda hanya
 * menempel pada angsuran yang telat, dan ringkasan memilih tagihan berikutnya
 * dengan benar.
 */

import {
  dendaAngsuran,
  hariTerlambatAngsuran,
  jadwalAngsuranPinjaman,
  labelNomorAngsuran,
  ringkasAngsuran,
  sisaHariAngsuran,
  tampilanAngsuran,
  type AngsuranTampil,
} from "./angsuran";
import { hitungSimulasiBulanan } from "./bulanan";
import { formatRupiah } from "./money";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const DAY = 86_400_000;
const MULAI = Date.UTC(2026, 0, 10); // 10 Jan 2026
const SEKARANG = MULAI + 10 * DAY;

// ===== bulanan: jadwal sama dengan mesin pengajuan =====
const bulanan = jadwalAngsuranPinjaman({
  pokokPinjaman: 6_000_000,
  tenorBulan: 6,
  didanaiPada: MULAI,
});
const sim = hitungSimulasiBulanan(6_000_000, 6);
eq(bulanan.length, 6, "enam angsuran untuk tenor 6 bulan");
eq(
  bulanan.reduce((acc, r) => acc + r.pokok, 0),
  6_000_000,
  "Σ pokok angsuran = pokok pinjaman",
);
eq(
  bulanan.reduce((acc, r) => acc + r.total, 0),
  sim.totalPengembalian,
  "Σ total angsuran = total pengembalian kontrak",
);
eq(
  bulanan.reduce((acc, r) => acc + r.biayaAdmin, 0),
  sim.biayaAdminCicilanTotal,
  "Σ biaya admin cicilan = total di kontrak",
);
eq(bulanan[0].jatuhTempoPada, MULAI + 30 * DAY, "angsuran 1 jatuh tempo 30 hari");
eq(bulanan[5].jatuhTempoPada, MULAI + 180 * DAY, "angsuran 6 jatuh tempo 180 hari");
eq(bulanan[0].nomor, 1, "nomor dimulai dari 1");
eq(bulanan[5].nomor, 6, "nomor terakhir 6");

// ===== harian: satu tagihan jatuh tempo di akhir tenor =====
const harian = jadwalAngsuranPinjaman({
  pokokPinjaman: 1_000_000,
  tenorHari: 28,
  didanaiPada: MULAI,
});
eq(harian.length, 1, "skema harian punya satu angsuran");
eq(harian[0].total, 1_300_000, "total harian 130% dari pokok");
eq(harian[0].bunga, 300_000, "bunga harian 30%");
eq(harian[0].biayaAdmin, 0, "biaya admin harian sudah dipotong di muka");
eq(harian[0].jatuhTempoPada, MULAI + 28 * DAY, "jatuh tempo 28 hari");

// ===== tanggal & denda =====
eq(hariTerlambatAngsuran(MULAI, MULAI - DAY), 0, "sebelum jatuh tempo belum telat");
eq(hariTerlambatAngsuran(MULAI, MULAI + 2 * DAY), 2, "dua hari telat");
eq(sisaHariAngsuran(MULAI, MULAI - DAY), 1, "sisa satu hari");
eq(sisaHariAngsuran(MULAI, MULAI + DAY), -1, "sudah lewat satu hari");
// Batas hari mengikuti kalender WIB, bukan 24 jam dari jam jatuh tempo.
const jatuhTempoMalam = Date.UTC(2026, 9, 17, 13, 35); // 17 Okt 20.35 WIB
eq(
  hariTerlambatAngsuran(jatuhTempoMalam, Date.UTC(2026, 9, 17, 16, 59)),
  0,
  "23.59 WIB di hari jatuh tempo belum telat",
);
eq(
  hariTerlambatAngsuran(jatuhTempoMalam, Date.UTC(2026, 9, 17, 17, 1)),
  1,
  "00.01 WIB keesokan harinya sudah satu hari telat",
);

const pokokAngsuran = 1_000_000;
eq(dendaAngsuran(pokokAngsuran, MULAI, MULAI - DAY), 0, "belum telat: tanpa denda");
eq(
  dendaAngsuran(pokokAngsuran, MULAI, MULAI + DAY, 2),
  20_000,
  "2% dari pokok angsuran per hari",
);
eq(
  dendaAngsuran(pokokAngsuran, MULAI, MULAI + 100 * DAY, 2),
  1_000_000,
  "denda dibatasi 100% pokok angsuran",
);
ok(
  dendaAngsuran(500_000, MULAI, MULAI + DAY, 2) <
    dendaAngsuran(1_000_000, MULAI, MULAI + DAY, 2),
  "denda mengikuti pokok angsuran, bukan pokok pinjaman penuh",
);

// ===== status tampilan =====
eq(
  tampilanAngsuran({ status: "lunas", jatuhTempoPada: MULAI }, MULAI + 30 * DAY),
  "lunas",
  "lunas menang atas tanggal",
);
eq(
  tampilanAngsuran({ status: "menunggu_verifikasi", jatuhTempoPada: MULAI }, MULAI + 30 * DAY),
  "menunggu_verifikasi",
  "menunggu verifikasi tidak dihitung telat",
);
eq(
  tampilanAngsuran({ status: "belum_dibayar", jatuhTempoPada: MULAI }, MULAI - 2 * DAY),
  "segera",
  "dua hari lagi: segera",
);
eq(
  tampilanAngsuran({ status: "belum_dibayar", jatuhTempoPada: MULAI }, MULAI),
  "hari_ini",
  "hari ini",
);
eq(
  tampilanAngsuran({ status: "belum_dibayar", jatuhTempoPada: MULAI }, MULAI + DAY),
  "terlambat",
  "lewat satu hari: terlambat",
);

// ===== ringkasan =====
function baris(over: Partial<AngsuranTampil>): AngsuranTampil {
  return {
    _id: "a",
    nomor: 1,
    jatuhTempoPada: MULAI,
    pokok: 1_000_000,
    bunga: 200_000,
    biayaAdmin: 24_000,
    total: 1_224_000,
    status: "belum_dibayar",
    dibayarPada: null,
    dendaDibayar: null,
    dendaBerjalan: 0,
    totalDibayar: 0,
    tampilan: "belum",
    hariTerlambat: 0,
    sisaHari: 0,
    ...over,
  };
}

const ringkas = ringkasAngsuran([
  baris({ _id: "a", nomor: 1, status: "lunas", tampilan: "lunas", totalDibayar: 1_224_000 }),
  baris({
    _id: "b",
    nomor: 2,
    jatuhTempoPada: MULAI + 30 * DAY,
    status: "belum_dibayar",
    tampilan: "terlambat",
    dendaBerjalan: 20_000,
    hariTerlambat: 1,
  }),
  baris({
    _id: "c",
    nomor: 3,
    jatuhTempoPada: MULAI + 60 * DAY,
    status: "menunggu_verifikasi",
    tampilan: "menunggu_verifikasi",
    total: 1_200_000,
  }),
]);
eq(ringkas.jumlah, 3, "tiga angsuran");
eq(ringkas.lunas, 1, "satu lunas");
eq(ringkas.menunggu, 1, "satu menunggu verifikasi");
eq(ringkas.terlambat, 1, "satu terlambat");
eq(ringkas.totalKewajiban, 1_224_000 + 1_224_000 + 1_200_000, "total kewajiban");
eq(ringkas.totalDibayar, 1_224_000, "total dibayar hanya yang lunas");
eq(ringkas.dendaBerjalan, 20_000, "denda berjalan");
eq(ringkas.berikutnya?._id, "b", "tagihan berikutnya yang paling awal");
eq(ringkas.semuaLunas, false, "belum semua lunas");
eq(ringkasAngsuran([]).berikutnya, null, "tanpa angsuran: tidak ada tagihan berikutnya");
eq(ringkasAngsuran([]).semuaLunas, false, "tanpa angsuran bukan berarti lunas");
eq(labelNomorAngsuran(2, 6), "2/6", "label nomor angsuran");
ok(formatRupiah(1_300_000).includes("1.300.000"), "format rupiah tetap dipakai");

console.log(`angsuran.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
