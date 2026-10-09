/**
 * Uji mesin pengingat jatuh tempo (murni).
 * Run: bun src/lib/pengingatJatuhTempo.test.ts
 *
 * Yang dijaga: ambang tingkat (aman / segera / hari ini / terlambat) sama dengan
 * ambang tabel admin, dan hitung mundur tidak pernah negatif serta tidak pernah
 * menentukan status — ia hanya merapikan sisa waktu untuk tampilan.
 */
import {
  hitungMundur,
  judulPengingat,
  perluDenyut,
  perluNapas,
  teksHitungMundur,
  tingkatDariTampilan,
  tingkatPengingat,
} from "./pengingatJatuhTempo";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(nyata: unknown, harap: unknown, label: string): void {
  ok(
    nyata === harap,
    `${label} (harap ${String(harap)}, dapat ${String(nyata)})`,
  );
}

// ===== Tingkat dari angka hari =====
eq(tingkatPengingat(10, 0), "aman", "10 hari lagi = aman");
eq(tingkatPengingat(7, 0), "aman", "7 hari lagi = aman");
eq(tingkatPengingat(4, 0), "aman", "4 hari lagi = aman");
eq(tingkatPengingat(3, 0), "segera", "3 hari lagi = segera");
eq(tingkatPengingat(2, 0), "segera", "2 hari lagi = segera");
eq(tingkatPengingat(1, 0), "segera", "1 hari lagi = segera");
eq(tingkatPengingat(0, 0), "hari_ini", "sisa 0 hari = hari ini");
eq(tingkatPengingat(0, 3), "terlambat", "terlambat 3 hari");
eq(tingkatPengingat(0, 1), "terlambat", "terlambat 1 hari menang atas hari ini");

// ===== Tingkat dari tampilan lib/jatuhTempo =====
eq(
  tingkatDariTampilan({ nada: "netral", hitung: "Sisa 12 hari" }),
  "aman",
  "nada netral = aman",
);
eq(
  tingkatDariTampilan({ nada: "segera", hitung: "Sisa 2 hari" }),
  "segera",
  "nada segera (belum hari ini) = segera",
);
eq(
  tingkatDariTampilan({ nada: "segera", hitung: "Jatuh tempo hari ini" }),
  "hari_ini",
  "nada segera + hitung hari ini = hari_ini",
);
eq(
  tingkatDariTampilan({ nada: "terlambat", hitung: "Terlambat 3 hari" }),
  "terlambat",
  "nada terlambat = terlambat",
);
eq(
  tingkatDariTampilan({ nada: "lunas", hitung: "Sudah lunas" }),
  "aman",
  "lunas tidak mendesak",
);
eq(
  tingkatDariTampilan({ nada: "belum_didanai", hitung: "Belum didanai" }),
  "aman",
  "belum didanai tidak mendesak",
);

// ===== Hitung mundur =====
const HARI = 86_400_000;
const JAM = 3_600_000;
const MENIT = 60_000;
const T0 = 1_700_000_000_000;

const tigaHari = hitungMundur(T0 + 3 * HARI + 12 * JAM + 25 * MENIT, T0);
eq(tigaHari.hari, 3, "hitung mundur: hari");
eq(tigaHari.jam, 12, "hitung mundur: jam");
eq(tigaHari.menit, 25, "hitung mundur: menit");
eq(teksHitungMundur(tigaHari), "3 hari 12 jam 25 menit", "teks hitung mundur lengkap");

const kurangSatuJam = hitungMundur(T0 + 9 * MENIT, T0);
eq(teksHitungMundur(kurangSatuJam), "9 menit", "hari/jam bernilai nol dilewati");

const lewat = hitungMundur(T0 - 5 * HARI, T0);
eq(lewat.totalMenit, 0, "hitung mundur tidak negatif setelah lewat");
eq(teksHitungMundur(lewat), "kurang dari 1 menit", "teks saat sudah lewat");

// ===== Judul & efek =====
eq(judulPengingat("terlambat", 0, 3), "Pembayaran Terlambat 3 Hari", "judul terlambat");
eq(judulPengingat("hari_ini", 0, 0), "Pembayaran Jatuh Tempo Hari Ini", "judul hari ini");
eq(judulPengingat("segera", 2, 0), "Pembayaran Jatuh Tempo 2 Hari Lagi", "judul segera");
eq(judulPengingat("aman", 7, 0), "Pembayaran Jatuh Tempo 7 Hari Lagi", "judul aman");
ok(perluDenyut("segera") && perluDenyut("hari_ini"), "denyut hanya untuk yang mendesak");
ok(!perluDenyut("aman") && !perluDenyut("terlambat"), "aman & terlambat tanpa denyut");
ok(!perluNapas("aman"), "tingkat aman tampil tenang tanpa napas");
ok(
  perluNapas("segera") && perluNapas("hari_ini") && perluNapas("terlambat"),
  "segera, hari ini, dan terlambat bernapas pelan",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`pengingatJatuhTempo: ${passed} lulus`);
