/**
 * Uji angka utama kartu layanan beranda.
 * Run: bun src/lib/sorotanLayanan.test.ts
 *
 * Yang dijaga: kartu layanan tidak menyimpan angka sendiri. Tenor, LTV, dan
 * keluarga tenor harus mengikuti konstanta mesin, supaya perubahan aturan tidak
 * meninggalkan klaim lama di beranda.
 */
import { TENOR_BULANAN_OPTIONS } from "./bulanan";
import { GADAI_PRICING } from "./gadai";
import { KREDIT_TENOR_PENGAJUAN_OPTIONS } from "./kredit";
import { TENOR_HARIAN_MAKS, TENOR_OPTIONS } from "./loan";
import { SOROTAN_LAYANAN } from "./sorotanLayanan";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}

cek("tiga kartu punya sorotan", SOROTAN_LAYANAN.length === 3);

const [pinjaman, gadai, kredit] = SOROTAN_LAYANAN;

cek(
  "tenor harian memakai awal TENOR_OPTIONS sampai TENOR_HARIAN_MAKS",
  pinjaman.angka === `${TENOR_OPTIONS[0]}–${TENOR_HARIAN_MAKS}`,
);
cek(
  "label pinjaman menyebut tenor bulanan",
  pinjaman.label.includes(TENOR_BULANAN_OPTIONS.join("/")),
);
cek(
  "plafon gadai memakai LTV mesin",
  gadai.angka === `${GADAI_PRICING.ltvMaxPercent}%`,
);
cek(
  "label gadai memakai sewa modal dan periode mesin",
  gadai.label.includes(
    `${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}%`,
  ) && gadai.label.includes(`${GADAI_PRICING.periodeHari} hari`),
);
cek(
  "tenor kredit memakai pilihan pengajuan",
  kredit.angka === KREDIT_TENOR_PENGAJUAN_OPTIONS.join("/"),
);
cek(
  "setiap sorotan punya satuan dan label",
  SOROTAN_LAYANAN.every(
    (s) => s.satuan.trim() !== "" && s.label.trim() !== "",
  ),
);

console.log(`sorotanLayanan: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
