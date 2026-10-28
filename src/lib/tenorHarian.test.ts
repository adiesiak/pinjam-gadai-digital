/**
 * Uji matriks tenor & bunga pinjaman harian (`src/lib/loan.ts`).
 * Run: bun src/lib/tenorHarian.test.ts
 *
 * Matriks yang dijaga:
 *  - di bawah Rp500.000: 7 hari 30%, 14 hari 35%, 21 hari 38%, 28 hari 40%;
 *  - Rp500.000 sampai di bawah Rp1.000.000: 7 hari 28%, 14 hari 32%,
 *    21 hari 34%, 28 hari 35%;
 *  - Rp1.000.000 ke atas (sampai plafon khusus Rp10 juta): 7 hari 26%,
 *    14 hari 28%, 21 hari 29%, 28 hari 30%.
 *
 * Tenor resmi 7/14/21/28 hari; tenor lain DITOLAK, bukan digeser diam-diam.
 */
import type { Rupiah } from "@/lib/money";
import {
  LOAN_LIMITS,
  persenBungaHarian,
  quoteLoanBunga,
  sesuaikanTenorHarian,
  TENOR_OPTIONS,
  tenorHarianDefault,
  tenorHarianEfektif,
  tenorHarianTersedia,
  validasiTenorHarian,
} from "@/lib/loan";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== Batas rentang =====
eq(tenorHarianTersedia(LOAN_LIMITS.minPokok), [7, 14, 21, 28], "batas bawah menerima 7/14/28 hari");
eq(tenorHarianTersedia(499_999), [7, 14, 21, 28], "di bawah Rp500.000 menerima 7/14/28 hari");
eq(tenorHarianTersedia(500_000), [7, 14, 21, 28], "Rp500.000 menerima 7/14/28 hari");
eq(tenorHarianTersedia(999_999), [7, 14, 21, 28], "di bawah Rp1 juta menerima 7/14/28 hari");
eq(tenorHarianTersedia(1_000_000), [7, 14, 21, 28], "Rp1 juta menerima 7/14/28 hari");
eq(tenorHarianTersedia(50_000), TENOR_OPTIONS, "nominal belum sah memakai daftar produk");
eq(tenorHarianTersedia(2_000_000), [7, 14, 21, 28], "plafon khusus tetap menerima 7/14/28 hari");
eq(tenorHarianTersedia(20_000_000), TENOR_OPTIONS, "di atas langit-langit memakai daftar produk");

// ===== Tenor bawaan =====
eq(tenorHarianDefault(100_000), 7, "Rp100.000 bawaan 7 hari");
eq(tenorHarianDefault(499_999), 7, "Rp499.999 bawaan 7 hari");
eq(tenorHarianDefault(500_000), 14, "Rp500.000 bawaan 14 hari");
eq(tenorHarianDefault(999_999), 14, "Rp999.999 bawaan 14 hari");
eq(tenorHarianDefault(1_000_000), 28, "Rp1 juta bawaan 28 hari");
eq(tenorHarianDefault(2_000_000), 28, "Rp2 juta (plafon khusus) bawaan 28 hari");

// ===== Bunga per kombinasi =====
eq(persenBungaHarian(250_000, 7), 30, "Rp250.000/7 hari = 30%");
eq(persenBungaHarian(250_000, 14), 35, "Rp250.000/14 hari = 35%");
eq(persenBungaHarian(250_000, 21), 38, "Rp250.000/21 hari = 38%");
eq(persenBungaHarian(250_000, 28), 40, "Rp250.000/28 hari = 40%");
eq(persenBungaHarian(500_000, 7), 28, "Rp500.000/7 hari = 28%");
eq(persenBungaHarian(500_000, 14), 32, "Rp500.000/14 hari = 32%");
eq(persenBungaHarian(500_000, 21), 34, "Rp500.000/21 hari = 34%");
eq(persenBungaHarian(500_000, 28), 35, "Rp500.000/28 hari = 35%");
eq(persenBungaHarian(999_999, 14), 32, "Rp999.999/14 hari = 32%");
eq(persenBungaHarian(1_000_000, 7), 26, "Rp1 juta/7 hari = 26%");
eq(persenBungaHarian(1_000_000, 14), 28, "Rp1 juta/14 hari = 28%");
eq(persenBungaHarian(1_000_000, 21), 29, "Rp1 juta/21 hari = 29%");
eq(persenBungaHarian(1_000_000, 28), 30, "Rp1 juta/28 hari = 30%");
// Tanggal bebas 8–27 hari: interpolasi antara dua acuan.
eq(persenBungaHarian(1_000_000, 8), 26.29, "Rp1 juta/8 hari = 26,29%");
eq(persenBungaHarian(1_000_000, 20), 28.86, "Rp1 juta/20 hari = 28,86%");
eq(tenorHarianEfektif(1_000_000, 20), 20, "tanggal bebas dipertahankan");
eq(tenorHarianEfektif(1_000_000, 35), 35, "tenor perpanjangan dibiarkan apa adanya");
eq(tenorHarianEfektif(1_000_000, 51), 28, "di atas batas digeser ke 28 hari");
// Perpanjangan 29–50 hari: tarif 28 hari + harga satu hari tenor 28 hari.
// Hari perpanjangan dihargai 1,5 × harga satu hari tenor 28 hari.
eq(persenBungaHarian(1_000_000, 29), 31.61, "Rp1 juta/29 hari = 31,61%");
eq(persenBungaHarian(1_000_000, 30), 33.21, "Rp1 juta/30 hari = 33,21%");
eq(persenBungaHarian(1_000_000, 35), 41.25, "Rp1 juta/35 hari = 41,25%");
eq(persenBungaHarian(1_000_000, 50), 65.36, "Rp1 juta/50 hari = 65,36%");
eq(persenBungaHarian(1_000_000, 51), null, "51 hari di atas batas");
eq(persenBungaHarian(1_000_000, 6), null, "6 hari di bawah batas");
// Semakin lama selalu semakin mahal — diuji untuk setiap hari 7–50.
let bungaMenaik = true;
let tarifSebelumnya = 0;
for (let hari = 7; hari <= 50; hari += 1) {
  const tarif = persenBungaHarian(1_000_000, hari) ?? -1;
  if (tarif <= tarifSebelumnya) bungaMenaik = false;
  tarifSebelumnya = tarif;
}
ok(bungaMenaik, "bunga naik ketat untuk setiap hari 7–50");
eq(persenBungaHarian(2_000_000, 7), 26, "Rp2 juta/7 hari = 26%");
eq(persenBungaHarian(2_000_000, 14), 28, "Rp2 juta/14 hari = 28%");
eq(persenBungaHarian(2_000_000, 28), 30, "Rp2 juta/28 hari = 30%");

// ===== Penyesuaian tenor saat nominal berubah =====
eq(sesuaikanTenorHarian(250_000, 7), 7, "tenor sah tidak diubah");
eq(sesuaikanTenorHarian(500_000, 7), 7, "7 hari tetap sah di Rp500.000");
eq(sesuaikanTenorHarian(1_000_000, 7), 7, "7 hari tetap sah di Rp1 juta");
eq(sesuaikanTenorHarian(1_000_000, 14), 14, "14 hari tetap sah di Rp1 juta");
eq(sesuaikanTenorHarian(1_000_000, 30), 28, "tenor 30 hari digeser ke 28 hari");
eq(sesuaikanTenorHarian(250_000, 45), 28, "tenor asing digeser ke tenor sah terdekat");

// ===== Validasi server =====
eq(validasiTenorHarian(250_000, 7), null, "kombinasi kecil/7 hari sah");
eq(validasiTenorHarian(500_000, 14), null, "kombinasi menengah/14 hari sah");
eq(validasiTenorHarian(1_000_000, 28), null, "kombinasi penuh/28 hari sah");
eq(validasiTenorHarian(1_000_000, 7), null, "Rp1 juta/7 hari sah");
eq(validasiTenorHarian(500_000, 7), null, "Rp500.000/7 hari sah");
eq(validasiTenorHarian(1_000_000, 20), null, "tanggal bebas 20 hari sah");
eq(validasiTenorHarian(1_000_000, 30), null, "tenor 30 hari sah");
eq(validasiTenorHarian(1_000_000, 50), null, "tenor 50 hari sah");
ok(
  validasiTenorHarian(1_000_000, 51)?.includes("7–50") === true,
  "51 hari ditolak dengan menyebut rentang 7–50",
);
ok(
  validasiTenorHarian(1_000_000, 6)?.includes("7–50") === true,
  "6 hari ditolak dengan menyebut rentang 7–50",
);
// Plafon khusus diteruskan pemanggil sebagai batas atas; tanpa itu, batas
// bawaan produk yang berlaku dan pokok Rp2 juta ditolak.
eq(validasiTenorHarian(2_000_000, 28, 2_000_000 as Rupiah), null, "Rp2 juta/28 hari sah bila plafon menutupnya");
let tolakDiAtasBawaan = false;
try {
  validasiTenorHarian(2_000_000, 28);
} catch {
  tolakDiAtasBawaan = true;
}
ok(tolakDiAtasBawaan, "tanpa plafon khusus, Rp2 juta tetap ditolak");

// ===== Total pembayaran mengikuti tarif matriks =====
eq(quoteLoanBunga(250_000, 30).totalKewajibanPelunasan, 325_000, "Rp250.000/7 hari = Rp325.000");
eq(quoteLoanBunga(250_000, 35).totalKewajibanPelunasan, 337_500, "Rp250.000/14 hari = Rp337.500");
eq(quoteLoanBunga(500_000, 32).totalKewajibanPelunasan, 660_000, "Rp500.000/14 hari = Rp660.000");
eq(quoteLoanBunga(1_000_000, 30).totalKewajibanPelunasan, 1_300_000, "Rp1 juta/28 hari = Rp1.300.000");
eq(quoteLoanBunga(1_000_000, 26).totalKewajibanPelunasan, 1_260_000, "Rp1 juta/7 hari = Rp1.260.000");
eq(quoteLoanBunga(2_000_000, 30).totalKewajibanPelunasan, 2_600_000, "Rp2 juta/28 hari = Rp2.600.000");
eq(
  quoteLoanBunga(1_000_000, persenBungaHarian(1_000_000, 20) ?? 0).totalKewajibanPelunasan,
  1_288_600,
  "Rp1 juta/20 hari = Rp1.288.600",
);
eq(
  quoteLoanBunga(1_000_000, persenBungaHarian(1_000_000, 30) ?? 0).totalKewajibanPelunasan,
  1_332_100,
  "Rp1 juta/30 hari = Rp1.332.100",
);
eq(
  quoteLoanBunga(1_000_000, persenBungaHarian(1_000_000, 35) ?? 0).totalKewajibanPelunasan,
  1_412_500,
  "Rp1 juta/35 hari = Rp1.412.500",
);
eq(
  quoteLoanBunga(1_000_000, persenBungaHarian(1_000_000, 50) ?? 0).totalKewajibanPelunasan,
  1_653_600,
  "Rp1 juta/50 hari = Rp1.653.600",
);

console.log(`tenorHarian.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
