/**
 * Uji markup rincian pembayaran bulanan ruang pendana.
 *
 * Yang dijaga:
 *  - angka ringkasan diambil dari jadwal (angsuran, bunga, total bayar);
 *  - jadwal per bulan ikut tercetak, termasuk biaya admin cicilan;
 *  - biaya di muka tidak hilang dari total bayar;
 *  - pembulatan cicilan terakhir terbaca, bukan disembunyikan.
 *
 * Menjalankan: bun src/components/penyediaDana/RincianPembayaranBulanan.render.test.tsx
 */
import { renderToStaticMarkup } from "react-dom/server";

import { RincianPembayaranBulanan } from "./RincianPembayaranBulanan";

let lulus = 0;
let gagal = 0;
function cek(ok: boolean, pesan: string) {
  if (ok) {
    lulus += 1;
  } else {
    gagal += 1;
    console.error(`GAGAL: ${pesan}`);
  }
}

const tigaBulan = renderToStaticMarkup(
  <RincianPembayaranBulanan
    tenorBulan={3}
    persenBungaPerBulan={12}
    potonganDiMuka={60_000}
    jadwal={[1, 2, 3].map((bulan) => ({
      bulan,
      pokok: 1_000_000,
      bunga: 360_000,
      biayaAdmin: 27_200,
      total: 1_387_200,
    }))}
  />,
);

cek(
  tigaBulan.includes("Bulanan 3 bulan · bunga flat 12% per bulan"),
  "tenor dan tarif bunga tertulis",
);
cek(tigaBulan.includes("Rp 1.387.200"), "angsuran per bulan tercetak");
cek(tigaBulan.includes("Rp 360.000"), "bunga per bulan tercetak");
cek(tigaBulan.includes("Rp 27.200"), "biaya admin cicilan tercetak");
cek(tigaBulan.includes("Rp 4.221.600"), "total bayar termasuk biaya di muka");
cek(
  tigaBulan.includes("biaya di muka Rp 60.000"),
  "asal selisih total dijelaskan",
);
cek(tigaBulan.includes("Jadwal 3 cicilan"), "jumlah cicilan di judul jadwal");
cek(tigaBulan.includes("3/3"), "setiap bulan punya nomor urut");

const sembilanBulan = renderToStaticMarkup(
  <RincianPembayaranBulanan
    tenorBulan={9}
    persenBungaPerBulan={6}
    jadwal={[1, 2, 3, 4, 5, 6, 7, 8, 9].map((bulan) => ({
      bulan,
      pokok: bulan === 9 ? 333_336 : 333_333,
      bunga: 180_000,
      biayaAdmin: 10_267,
      total: bulan === 9 ? 523_603 : 523_600,
    }))}
  />,
);

cek(
  sembilanBulan.includes("terakhir Rp 523.603"),
  "cicilan terakhir yang dibulatkan ikut terbaca",
);
cek(
  sembilanBulan.includes("Rp 4.712.403"),
  "total angsuran menjumlahkan seluruh baris jadwal",
);

console.log(
  `RincianPembayaranBulanan.render.test: ${lulus} lulus, ${gagal} gagal`,
);
if (gagal > 0) process.exitCode = 1;
