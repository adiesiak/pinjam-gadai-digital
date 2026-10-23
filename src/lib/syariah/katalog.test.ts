/** Run: bun src/lib/syariah/katalog.test.ts */
import { MAX_AKAD_SYARIAH, MIN_AKAD_SYARIAH } from "./akad";
import {
  barangKatalog,
  cariBarangKatalog,
  KATALOG_MURABAHAH,
  KATEGORI_KATALOG,
  labelNomorTujuan,
  nomorTujuanValid,
  rapikanNomorTujuan,
  wajibBarangKatalog,
} from "./katalog";

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

// ===== 1. Invarian isi katalog =====
{
  const id = new Set<string>();
  const nama = new Set<string>();
  for (const barang of KATALOG_MURABAHAH) {
    ok(!id.has(barang.id), `id unik: ${barang.id}`);
    id.add(barang.id);
    ok(!nama.has(barang.nama), `nama unik: ${barang.nama}`);
    nama.add(barang.nama);
    ok(
      Number.isSafeInteger(barang.harga) &&
        barang.harga >= MIN_AKAD_SYARIAH &&
        barang.harga <= MAX_AKAD_SYARIAH,
      `harga ${barang.id} di rentang akad`,
    );
    ok(
      (KATEGORI_KATALOG as readonly string[]).includes(barang.kategori),
      `kategori ${barang.id} terdaftar`,
    );
  }
  ok(KATALOG_MURABAHAH.length >= 20, "katalog berisi minimal 20 barang");
}

// ===== 2. Barang fisik DAN pulsa/PPOB non-ewallet =====
{
  const fisik = cariBarangKatalog({ kategori: "Elektronik" });
  ok(fisik.length > 0, "ada barang fisik di katalog");
  const digital = KATALOG_MURABAHAH.filter((b) => b.jenisBarang === "digital");
  ok(digital.length > 0, "ada produk pulsa/PPOB");
  ok(
    digital.every((b) => b.kategori === "Pulsa & data" || b.kategori === "Token & tagihan"),
    "produk digital hanya di kategori pulsa/data dan token/tagihan",
  );

  // E-wallet & uang tunai tidak boleh masuk: nilainya setara uang, bukan barang.
  const terlarang = ["gopay", "ovo", "dana", "shopeepay", "linkaja", "tunai", "cash"];
  for (const barang of KATALOG_MURABAHAH) {
    const teks = `${barang.id} ${barang.nama}`.toLowerCase();
    ok(
      !terlarang.some((kata) => teks.includes(kata)),
      `bukan e-wallet/tunai: ${barang.nama}`,
    );
  }
}

// ===== 3. Pencarian & batas harga =====
{
  eq(barangKatalog("pl-pulsa-100")?.harga, 100_000, "harga pulsa 100.000");
  eq(barangKatalog("tidak-ada"), null, "id asing mengembalikan null");
  throws(() => wajibBarangKatalog("tidak-ada"), "id asing ditolak server");

  const murah = cariBarangKatalog({ batasHarga: 500_000 });
  ok(murah.length > 0, "ada barang di bawah Rp500.000");
  ok(
    murah.every((b) => b.harga <= 500_000),
    "batas harga menyaring barang mahal",
  );

  const usaha = cariBarangKatalog({ kategori: "Peralatan usaha" });
  ok(
    usaha.length > 0 && usaha.every((b) => b.kategori === "Peralatan usaha"),
    "filter kategori bekerja",
  );

  eq(
    cariBarangKatalog({ kataKunci: "  mesin jahit " })[0]?.id,
    "us-mesin-jahit",
    "kata kunci mengabaikan spasi tepi",
  );
  eq(
    cariBarangKatalog({ kataKunci: "zzz" }).length,
    0,
    "kata kunci tanpa hasil",
  );
  eq(
    cariBarangKatalog({ batasHarga: 0 }).length,
    0,
    "batas harga nol tidak menyisakan barang",
  );
}

// ===== 4. Nomor tujuan pulsa/PPOB =====
{
  eq(rapikanNomorTujuan("0812-3456 7890"), "081234567890", "pemisah dibuang");
  ok(nomorTujuanValid("0812-3456 7890"), "nomor HP 12 angka sah");
  ok(nomorTujuanValid("123456"), "6 angka masih sah");
  ok(!nomorTujuanValid("12345"), "5 angka ditolak");
  ok(!nomorTujuanValid(""), "kosong ditolak");
  ok(!nomorTujuanValid("0812-ABCD"), "huruf saja ditolak");
  ok(
    nomorTujuanValid("1".repeat(20)),
    "20 angka masih sah (ID meter panjang)",
  );
  ok(!nomorTujuanValid("1".repeat(21)), "21 angka ditolak");

  eq(
    labelNomorTujuan(wajibBarangKatalog("tl-token-200")),
    "ID meter / nomor pelanggan",
    "token listrik meminta ID meter",
  );
  eq(
    labelNomorTujuan(wajibBarangKatalog("pl-pulsa-100")),
    "Nomor HP tujuan",
    "pulsa meminta nomor HP",
  );
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`katalog syariah: ${passed} pemeriksaan lulus`);
