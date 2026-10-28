/**
 * Harness adaptor H2H PPOB — tanpa jaringan.
 * Run: bun scripts/qa-ppob-h2h.ts
 *
 * Berkas ini tinggal di `scripts/` karena mengimpor modul Convex `"use node"`
 * (MD5 dari `node:crypto`), yang tidak bisa dimuat runner frontend. Yang diuji
 * hanya fungsi murni: signature, normalisasi produk, dan deduplikasi.
 */
import {
  normalisasiProdukDigiflazz,
  normalisasiProdukKustom,
  tandaDigiflazz,
  unikkanProduk,
} from "../src/convex/ppobH2h";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}${info ? ` — ${info}` : ""}`);
  }
}
function sama(aktual: unknown, harapan: unknown, nama: string) {
  cek(
    `${nama} (${JSON.stringify(aktual)})`,
    JSON.stringify(aktual) === JSON.stringify(harapan),
  );
}

// ===== Signature Digiflazz =====
// Nilai pembanding dihitung `printf 'userkeypricelist' | md5sum`.
sama(
  tandaDigiflazz("user", "key", "pricelist"),
  "6870b202c286b430a1f8a6744d48a862",
  "sign pricelist = md5(username + key + suffix)",
);
// `printf 'ukref-1' | md5sum`
sama(
  tandaDigiflazz("u", "k", "ref-1"),
  "3f58cdb0e9e288a8071a93de8a5803d1",
  "sign transaksi memakai ref_id",
);

// ===== Produk Digiflazz =====
const valid = normalisasiProdukDigiflazz({
  buyer_sku_code: "TSEL10",
  product_name: "Telkomsel 10.000",
  category: "Pulsa",
  brand: "Telkomsel",
  price: 9850,
  buyer_product_status: true,
  seller_product_status: true,
  stock: 10,
});
sama(valid?.kode, "TSEL10", "SKU dipertahankan");
sama(valid?.kategori, "pulsa", "kategori dipetakan");
sama(valid?.hargaModal, 9850, "harga modal dari provider");
sama(valid?.stok, 10, "stok dibawa");
sama(valid?.tersedia, true, "produk aktif tersedia");

sama(
  normalisasiProdukDigiflazz({
    buyer_sku_code: "X",
    product_name: "TV",
    category: "TV",
    price: 1000,
  }),
  null,
  "kategori di luar lima kelompok dibuang",
);
sama(
  normalisasiProdukDigiflazz({
    buyer_sku_code: "X",
    product_name: "Gratis",
    category: "Pulsa",
    price: 0,
  }),
  null,
  "harga nol dibuang",
);
sama(
  normalisasiProdukDigiflazz({
    buyer_sku_code: "X",
    product_name: "Habis",
    category: "Pulsa",
    price: 1000,
    stock: 0,
  })?.tersedia,
  false,
  "stok nol tidak tersedia",
);
sama(
  normalisasiProdukDigiflazz({
    buyer_sku_code: "X",
    product_name: "Nonaktif",
    category: "Pulsa",
    price: 1000,
    buyer_product_status: false,
  })?.tersedia,
  false,
  "sakelar pembeli mematikan produk",
);
sama(
  normalisasiProdukDigiflazz({
    buyer_sku_code: "X",
    product_name: "Tanpa stok",
    category: "Pulsa",
    price: 1000,
  })?.tersedia,
  true,
  "stok kosong berarti tidak dibatasi",
);

// ===== Produk kustom =====
const kustom = normalisasiProdukKustom({
  kode: "MLBB86",
  nama: "Mobile Legends 86 Diamond",
  kategori: "Games",
  operator: "Moonton",
  harga: 19_500,
  aktif: true,
});
sama(kustom?.kategori, "game", "kategori kustom Games");
sama(kustom?.hargaModal, 19_500, "harga kustom");
sama(kustom?.tersedia, true, "aktif kustom");

sama(
  normalisasiProdukKustom({
    kode: "PLN20",
    nama: "Token PLN 20.000",
    kategori: "token-listrik",
    harga: 20_100,
  })?.kategori,
  "token-listrik",
  "kategori kustom token-listrik",
);
sama(
  normalisasiProdukKustom({ kode: "", nama: "Tanpa kode", kategori: "pulsa", harga: 1000 }),
  null,
  "kode kosong dibuang",
);
sama(
  normalisasiProdukKustom({ kode: "A", nama: "Nonaktif", kategori: "pulsa", harga: 1000, aktif: false })
    ?.tersedia,
  false,
  "produk nonaktif tidak tersedia",
);

// ===== Deduplikasi =====
const unik = unikkanProduk([
  { kode: "A", nama: "Lama", kategori: "pulsa", hargaModal: 1000, tersedia: true },
  { kode: "A", nama: "Baru", kategori: "pulsa", hargaModal: 1200, tersedia: true },
  { kode: "B", nama: "Lain", kategori: "data", hargaModal: 2000, tersedia: true },
]);
sama(unik.length, 2, "duplikat SKU dibuang");
sama(unik.find((item) => item.kode === "A")?.nama, "Baru", "baris terakhir menang");

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
