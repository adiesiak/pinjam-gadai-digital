/**
 * Uji terjemahan tanggal jatuh tempo ↔ tenor harian (`src/lib/tanggalTenor.ts`).
 * Run: bun src/lib/tanggalTenor.test.ts
 *
 * Yang dijaga:
 *  - "hari ini" mengikuti kalender WIB, bukan UTC atau zona peramban;
 *  - tenor 7–50 hari bisa dibaca bolak-balik dari tanggal;
 *  - tanggal di luar 7–50 hari ditolak, bukan digeser diam-diam;
 *  - pergantian bulan dan tahun mengikuti kalender, termasuk tahun kabisat.
 */
import {
  hariIniLokal,
  rentangTanggalTenor,
  selisihHari,
  tambahHari,
  tanggalJatuhTempo,
  tenorDariTanggal,
} from "@/lib/tanggalTenor";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.log(`GAGAL ${label}\n  harap: ${JSON.stringify(expected)}\n  dapat: ${JSON.stringify(actual)}`);
  }
}
function ok(nilai: boolean, label: string) {
  eq(nilai, true, label);
}

const POKOK = 1_000_000;
const siang = Date.UTC(2026, 9, 28, 3, 0); // 28 Okt 2026, 10.00 WIB

const tanggal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---- Batas hari WIB, bukan UTC ----
eq(tanggal(hariIniLokal(siang)), "2026-10-28", "jam 10.00 WIB masih 28 Oktober");
eq(
  tanggal(hariIniLokal(Date.UTC(2026, 9, 27, 18, 0))),
  "2026-10-28",
  "01.00 WIB tanggal 28, walau UTC masih 27",
);
eq(
  tanggal(hariIniLokal(Date.UTC(2026, 9, 27, 16, 59))),
  "2026-10-27",
  "23.59 WIB tanggal 27 tetap 27",
);

// ---- Tenor ke tanggal dan kembali ----
eq(tanggal(tanggalJatuhTempo(7, siang)), "2026-11-04", "7 hari dari 28 Oktober");
eq(
  tanggal(tanggalJatuhTempo(20, siang)),
  "2026-11-17",
  "tanggal bebas 20 hari",
);
eq(
  tanggal(tanggalJatuhTempo(50, siang)),
  "2026-12-17",
  "perpanjangan maksimum 50 hari",
);
eq(tenorDariTanggal(tanggalJatuhTempo(20, siang), POKOK, siang), 20, "20 hari bolak-balik");
eq(tenorDariTanggal(tanggalJatuhTempo(7, siang), POKOK, siang), 7, "7 hari bolak-balik");
eq(tenorDariTanggal(tanggalJatuhTempo(50, siang), POKOK, siang), 50, "50 hari bolak-balik");

// ---- Di luar rentang ditolak ----
eq(tenorDariTanggal(tanggalJatuhTempo(6, siang), POKOK, siang), null, "6 hari ditolak");
eq(tenorDariTanggal(tanggalJatuhTempo(51, siang), POKOK, siang), null, "51 hari ditolak");
eq(tenorDariTanggal(hariIniLokal(siang), POKOK, siang), null, "hari ini ditolak");

// ---- Pergantian bulan, tahun, dan kabisat ----
eq(
  tanggal(tanggalJatuhTempo(20, Date.UTC(2026, 0, 20, 3, 0))),
  "2026-02-09",
  "20 Januari + 20 hari melewati Januari",
);
eq(
  tanggal(tanggalJatuhTempo(20, Date.UTC(2026, 11, 20, 3, 0))),
  "2027-01-09",
  "20 Desember + 20 hari melewati tahun",
);
eq(
  tanggal(tanggalJatuhTempo(15, Date.UTC(2028, 1, 20, 3, 0))),
  "2028-03-06",
  "tahun kabisat: 20 Februari + 15 hari melewati 29 Februari",
);

// ---- Voucher menambah hari tanpa mengubah tenor dasar ----
const dasar = tanggalJatuhTempo(14, siang);
eq(tanggal(tambahHari(dasar, 7)), "2026-11-18", "voucher +7 hari menggeser tanggal akhir");
eq(selisihHari(dasar, tambahHari(dasar, 7)), 7, "selisih tanggal akhir 7 hari");

// ---- Rentang minimum & maksimum ----
const { min, maks } = rentangTanggalTenor(siang);
eq(tanggal(min), "2026-11-04", "batas bawah 7 hari");
eq(tanggal(maks), "2026-12-17", "batas atas 50 hari");
ok(selisihHari(min, maks) === 43, "lebar rentang 43 hari");

console.log(`\n${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
