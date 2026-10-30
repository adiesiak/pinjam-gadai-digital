/**
 * Uji susunan sumber bagian "Bunga promo" di panel Promo Pinjaman.
 *
 * Panel ini mengubah angka kontrak, jadi yang dijaga di sini bukan tampilan,
 * melainkan hal-hal yang bisa membuat janji berbeda dari perhitungan:
 *  - validasi dan pratinjau memakai fungsi bersama, bukan salinan aturan;
 *  - peringatan bahwa promo memotong imbal hasil pendana tetap ada;
 *  - template kampanye teks benar-benar memakai daftar bersama, sehingga
 *    menambah preset baru tidak perlu menyunting dua tempat.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

const sumber = readFileSync(fileURLToPath(new URL("./PromoBungaPanel.tsx", import.meta.url)), "utf8");
const induk = readFileSync(
  fileURLToPath(new URL("./PromoPinjamanPanel.tsx", import.meta.url)),
  "utf8",
);

const kode = sumber
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

ok(kode.includes("periksaIsiPromoBunga"), "memakai validasi bersama dengan server");
ok(kode.includes("pratinjauPromoBunga"), "pratinjau memakai fungsi bersama");
ok(
  kode.includes("persenBungaHarian(100_000, tenor)") &&
    kode.includes("persenBungaHarian(1_000_000, tenor)"),
  "tarif normal dibaca dari matriks, bukan angka yang ditulis ulang",
);
ok(
  /Hak pendana tetap dihitung dari tarif normal/.test(kode) &&
    /bukan dipotong dari imbal hasil pendana/.test(kode),
  "peringatan imbal hasil pendana tetap tampil",
);
ok(
  kode.includes("api.promoBunga.setAktif") && kode.includes("Switch"),
  "promo bisa dinyalakan/dimatikan tanpa membuka formulir",
);
ok(kode.includes("BATAS_PROMO_BUNGA.persenMaks"), "batas bunga memakai konstanta bersama");
ok(kode.includes("formatPeriodePromo"), "masa berlaku ditampilkan sebagai rentang");
ok(!/promoBunga\.hapus[\s\S]{0,400}tanpa alasan/.test(kode), "tidak ada cabang hapus tanpa konfirmasi");

// Bagian ini harus benar-benar dipasang di panel promo, bukan file yatim.
ok(induk.includes("<PromoBungaPanel />"), "bagian bunga promo dipasang di panel Promo Pinjaman");
ok(induk.includes("TEMPLATE_PROMO_PINJAMAN"), "template teks memakai daftar bersama");
ok(
  induk.includes("template.badge") &&
    induk.includes("template.judul") &&
    induk.includes("template.deskripsi"),
  "template mengisi badge, judul, dan deskripsi",
);

const jumlah = lulus + gagal;
console.log(`PromoBungaPanel.render.test: ${lulus}/${jumlah} pemeriksaan lulus`);
if (gagal > 0) process.exit(1);
