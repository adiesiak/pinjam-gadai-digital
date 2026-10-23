/** Run: bun src/lib/syariah/pengajuan.test.ts */
import { susunPermintaanAjukanSyariah } from "./pengajuan";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: seharusnya melempar`);
  } catch {
    passed += 1;
  }
}

const DASAR = { pokok: 300_000, tenorHari: 30, tujuan: "  Modal usaha  " };

// ===== 1. Murabahah dengan barang katalog mengunci harga dan nama =====
{
  const fisik = susunPermintaanAjukanSyariah({
    ...DASAR,
    jenis: "murabahah",
    namaBarang: "Tulisan lama yang masih tertinggal",
    katalog: {
      kode: "el-setrika-uap",
      nama: "Setrika uap 1.800 W",
      jenisBarang: "fisik",
      harga: 350_000,
    },
  });
  eq(fisik.pokok, 350_000, "pokok mengikuti harga katalog");
  eq(fisik.namaBarang, "Setrika uap 1.800 W", "nama dari katalog");
  eq(fisik.katalogId, "el-setrika-uap", "kode katalog dikirim");
  eq(fisik.tujuan, "Modal usaha", "tujuan dirapikan");
  ok(!("nomorTujuan" in fisik), "barang fisik tanpa nomor tujuan");
}

// ===== 2. Produk digital wajib nomor tujuan yang sah =====
{
  const digital = susunPermintaanAjukanSyariah({
    ...DASAR,
    jenis: "murabahah",
    pokok: 999,
    nomorTujuan: "0812-3456 7890",
    katalog: {
      kode: "pl-pulsa-100",
      nama: "Pulsa 100.000",
      jenisBarang: "digital",
      harga: 100_000,
    },
  });
  eq(digital.pokok, 100_000, "nominal digital dari katalog, bukan isian");
  eq(digital.nomorTujuan, "081234567890", "nomor tujuan hanya angkanya");
  eq(digital.katalogId, "pl-pulsa-100", "kode produk digital dikirim");

  throws(
    () =>
      susunPermintaanAjukanSyariah({
        ...DASAR,
        jenis: "murabahah",
        nomorTujuan: "123",
        katalog: {
          kode: "pl-pulsa-100",
          nama: "Pulsa 100.000",
          jenisBarang: "digital",
          harga: 100_000,
        },
      }),
    "nomor tujuan terlalu pendek ditolak",
  );
}

// ===== 3. Barang manual tetap boleh, tanpa kode katalog =====
{
  const manual = susunPermintaanAjukanSyariah({
    ...DASAR,
    jenis: "murabahah",
    namaBarang: "  Mesin jahit bekas  ",
  });
  eq(manual.namaBarang, "Mesin jahit bekas", "nama manual dirapikan");
  eq(manual.pokok, 300_000, "pokok manual dipakai apa adanya");
  ok(!("katalogId" in manual), "barang manual tanpa kode katalog");

  const tanpaNama = susunPermintaanAjukanSyariah({ ...DASAR, jenis: "qardh" });
  ok(!("namaBarang" in tanpaNama), "qardh tanpa nama barang");
  ok(!("nilaiTaksiran" in tanpaNama), "qardh tanpa taksiran");
}

// ===== 4. Rahn membawa taksiran, katalog diabaikan =====
{
  const rahn = susunPermintaanAjukanSyariah({
    ...DASAR,
    jenis: "rahn",
    namaBarang: "Motor Vario",
    nilaiTaksiran: 2_000_000,
    nomorTujuan: "081234567890",
    katalog: {
      kode: "pl-pulsa-100",
      nama: "Pulsa 100.000",
      jenisBarang: "digital",
      harga: 100_000,
    },
  });
  eq(rahn.nilaiTaksiran, 2_000_000, "taksiran Rahn ikut");
  eq(rahn.pokok, 300_000, "harga katalog tidak dipakai Rahn");
  ok(!("katalogId" in rahn), "Rahn tanpa kode katalog");
  ok(!("nomorTujuan" in rahn), "Rahn tanpa nomor tujuan");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`pengajuan syariah: ${passed} pemeriksaan lulus`);
