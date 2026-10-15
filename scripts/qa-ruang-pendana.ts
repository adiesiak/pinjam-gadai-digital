/**
 * QA ruang pendana: memeriksa kosakata visual "folio" pada berkas yang menyusun
 * `/penyedia-dana`, lalu merender bagian-bagian presentasionalnya untuk
 * memastikan penanda barunya benar-benar keluar di HTML.
 *
 * Kenapa berbentuk skrip dan bukan uji klik: seluruh halaman ini butuh sesi
 * Convex untuk dirender, jadi yang bisa diperiksa tanpa server adalah berkasnya
 * (kelas dan nomor bagian) dan markup setiap bagian yang presentasional. Bagian
 * yang tidak bisa dirender di sini diperiksa dari sumbernya, bukan diklaim sudah
 * diklik.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AturanPerhitungan } from "../src/components/penyediaDana/AturanPerhitungan";
import { KesehatanPortofolio } from "../src/components/penyediaDana/KesehatanPortofolio";
import { PanelRisikoPendanaan } from "../src/components/penyediaDana/RisikoPendanaan";
import { RingkasanKeuntungan } from "../src/components/penyediaDana/RingkasanKeuntungan";

let lulus = 0;
let gagal = 0;
function cek(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}
const baca = (jalur: string) => readFileSync(jalur, "utf8");
const cacah = (teks: string, pola: RegExp) => (teks.match(pola) ?? []).length;

// ===== 1. Tidak ada sisa kosakata lama di berkas ruang pendana =====
const BERKAS = [
  "src/pages/PenyediaDana.tsx",
  "src/components/penyediaDana/KesehatanPortofolio.tsx",
  "src/components/penyediaDana/RingkasanKeuntungan.tsx",
  "src/components/penyediaDana/RisikoPendanaan.tsx",
  "src/components/penyediaDana/AturanPerhitungan.tsx",
  "src/components/penyediaDana/PersetujuanRisikoPendana.tsx",
  "src/components/penyediaDana/LaporanTransferPendana.tsx",
  "src/components/penyediaDana/TabelPendana.tsx",
  "src/components/penyediaDana/SaringanPengajuan.tsx",
  "src/components/penyediaDana/PetaLokasiPeminjam.tsx",
];
const DILARANG = [
  "glass-card",
  "backdrop-blur",
  "hover:shadow-md",
  "hover:-translate-y-0.5",
  "border-l-4",
  "absolute inset-y-0 left-0 w-1",
];
for (const jalur of BERKAS) {
  const isi = baca(jalur)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const pola of DILARANG) {
    cek(!isi.includes(pola), `${jalur} tidak lagi memakai ${pola}`);
  }
  cek(!isi.includes("rounded-3xl"), `${jalur} tidak lagi memakai rounded-3xl`);
  cek(!isi.includes("shadow-sm"), `${jalur} tidak lagi memakai shadow-sm`);
}

// ===== 2. Satu titik fokus, dan hanya satu =====
const halaman = baca("src/pages/PenyediaDana.tsx");
cek(cacah(halaman, /FOLIO\.fokus/g) === 1, "halaman punya tepat satu permukaan fokus");

// ===== 3. Nomor indeks folio berurutan tanpa celah maupun kembar =====
const nomorBagian = [...halaman.matchAll(/nomorFolio\((\d+)\)|nomor=\{(\d+)\}/g)]
  .map((m) => Number(m[1] ?? m[2]))
  .filter((n) => Number.isFinite(n));
const berkasBernomor = [
  "src/components/penyediaDana/KesehatanPortofolio.tsx",
  "src/components/penyediaDana/RisikoPendanaan.tsx",
  "src/components/penyediaDana/PersetujuanRisikoPendana.tsx",
  "src/components/penyediaDana/AturanPerhitungan.tsx",
  "src/components/penyediaDana/RingkasanKeuntungan.tsx",
].flatMap((jalur) =>
  [...baca(jalur).matchAll(/nomor=\{(\d+)\}/g)].map((m) => Number(m[1])),
);
const semuaNomor = [...new Set([...nomorBagian, ...berkasBernomor])].sort((a, b) => a - b);
cek(
  semuaNomor.join(",") === "1,2,3,4,5,6,7,8",
  `nomor bagian 01 sampai 08 lengkap (ditemukan ${semuaNomor.join(",")})`,
);
cek(halaman.includes("Ringkasan Pendanaan"), "judul halaman tetap tercetak");

// ===== 4. Kerangka memuat meniru lembar judul yang baru =====
const kerangka = baca("src/components/ui/loading.tsx");
cek(kerangka.includes("ring-gold/35"), "rangka memuat memakai tepi kuningan lembar judul");

// ===== 5. Markup bagian: nomor bagian ikut tercetak, kelas baru terpakai =====
const kesehatan = renderToStaticMarkup(
  createElement(KesehatanPortofolio, {
    angka: {
      jatuhTempoSegera: { jumlah: 2, nominal: 3_000_000 },
      terlambat: { jumlah: 0, nominal: 0 },
      persenTerlambat: 0,
      belumTerhubung: { jumlah: 1, nominal: 1_500_000 },
    },
  }),
);
cek(kesehatan.includes("Kesehatan portofolio"), "judul bagian kesehatan tetap tercetak");
cek(kesehatan.includes(">02<"), "nomor bagian 02 tercetak di kepala bagian");
cek(
  cacah(kesehatan, /rounded-lg border px-4 py-3/g) === 4,
  "empat angka kesehatan memakai lembar folio yang sama",
);

const risiko = renderToStaticMarkup(createElement(PanelRisikoPendanaan, { bukaAwal: [1] }));
cek(risiko.includes(">03<"), "nomor bagian 03 tercetak di panel risiko");

const aturan = renderToStaticMarkup(
  createElement(AturanPerhitungan, { persenBunga: 1.5, persenPotonganAdmin: 5 }),
);
cek(aturan.includes(">05<"), "nomor bagian 05 tercetak di aturan perhitungan");

const keuntungan = renderToStaticMarkup(
  createElement(RingkasanKeuntungan, {
    ringkasan: {
      totalKeuntunganPendanaLunas: 1_000_000,
      totalKeuntunganPendanaBelumLunas: 500_000,
      totalKeuntunganPendana: 1_500_000,
      totalKeuntunganAdmin: 250_000,
      totalKeuntunganAdminLunas: 200_000,
      totalKeuntunganAdminBelumLunas: 50_000,
      totalTransferBelumDicatat: 0,
      nilaiTransferBelumDicatat: 0,
    },
  }),
);
cek(keuntungan.includes(">06<"), "nomor bagian 06 tercetak di ringkasan keuntungan");

const jumlah = lulus + gagal;
console.log(`qa-ruang-pendana: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
