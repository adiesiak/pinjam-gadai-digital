/**
 * Uji susunan panel Katalog Murabahah.
 *
 * Keluhan yang dijaga: 54 barang tampil sebagai satu daftar datar, sehingga
 * kategori dan harga sulit dibandingkan. Sekarang barang dikelompokkan per
 * kategori dan diurutkan dari termurah.
 *
 * Panel ini membaca Convex (`useQuery`/`useMutation`), jadi tidak bisa dirender
 * di luar aplikasi. Yang diperiksa adalah sumbernya.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const sumber = readFileSync(
  fileURLToPath(new URL("./KatalogSyariahPanel.tsx", import.meta.url)),
  "utf8",
);
const kode = sumber
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

ok(
  kode.includes("KATEGORI_KATALOG.map((kategori)") &&
    kode.includes(".filter((satu) => satu.items.length > 0)"),
  "barang dikelompokkan per kategori, kategori kosong tidak dirender",
);
ok(
  kode.includes(".sort((a, b) => a.harga - b.harga)"),
  "tiap kelompok diurutkan dari harga termurah",
);
ok(
  kode.includes("{items.length} barang"),
  "judul kelompok menyebut jumlah barang",
);
ok(
  kode.includes("`${baris.length} dari ${semua.length} cocok`") &&
    kode.includes("`${semua.length} barang · ${jumlahAktif} aktif`"),
  "ringkasan membedakan hasil pencarian dan jumlah aktif",
);
ok(
  kode.includes("Tidak ada barang yang cocok dengan pencarian."),
  "pencarian tanpa hasil punya keadaan kosong",
);
ok(
  kode.includes("onClick={() => buka(item)}") &&
    kode.includes("Muat katalog awal"),
  "aksi Ubah dan Muat katalog awal tetap ada",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`KatalogSyariahPanel.render: ${passed} lulus`);
