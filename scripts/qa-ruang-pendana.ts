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
import { TabelPendana } from "../src/components/penyediaDana/TabelPendana";

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

// 1. Tidak ada sisa kosakata lama di berkas ruang pendana.
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

// 2. Satu titik fokus, dan hanya satu.
const halaman = baca("src/pages/PenyediaDana.tsx");
cek(
  cacah(halaman, /FOLIO\.fokus/g) === 1,
  "halaman punya tepat satu permukaan fokus",
);

// 3. Nomor indeks folio berurutan tanpa celah maupun kembar.
const nomorBagian = [
  ...halaman.matchAll(/nomorFolio\((\d+)\)|nomor=\{(\d+)\}/g),
]
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
const semuaNomor = [...new Set([...nomorBagian, ...berkasBernomor])].sort(
  (a, b) => a - b,
);
cek(
  semuaNomor.join(",") === "1,2,3,4,5,6,7,8",
  `nomor bagian 01 sampai 08 lengkap (ditemukan ${semuaNomor.join(",")})`,
);
cek(halaman.includes("Ringkasan Pendanaan"), "judul halaman tetap tercetak");

// 4. Kerangka memuat meniru lembar judul yang baru.
const kerangka = baca("src/components/ui/loading.tsx");
cek(
  kerangka.includes("ring-gold/35"),
  "rangka memuat memakai tepi kuningan lembar judul",
);

// 5. Markup bagian: nomor bagian ikut tercetak, kelas baru terpakai.
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
cek(
  kesehatan.includes("Kesehatan portofolio"),
  "judul bagian kesehatan tetap tercetak",
);
cek(kesehatan.includes(">02<"), "nomor bagian 02 tercetak di kepala bagian");
cek(
  cacah(kesehatan, /rounded-lg border px-4 py-3/g) === 4,
  "empat angka kesehatan memakai lembar folio yang sama",
);

const risiko = renderToStaticMarkup(
  createElement(PanelRisikoPendanaan, { bukaAwal: [1] }),
);
cek(risiko.includes(">03<"), "nomor bagian 03 tercetak di panel risiko");

const aturan = renderToStaticMarkup(
  createElement(AturanPerhitungan, {
    persenBunga: 1.5,
    persenPotonganAdmin: 5,
  }),
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
cek(
  keuntungan.includes(">06<"),
  "nomor bagian 06 tercetak di ringkasan keuntungan",
);

// 6. Tabel pendana muat di kontainernya, tanpa kolom terpotong.
// Kontraknya: `table-fixed`, lebar kolom dipatok persen sampai jumlahnya ≤ 100,
// judul kolom dan sel boleh turun baris, dan semua angka rata kanan.
const tabelSumber = baca("src/components/penyediaDana/TabelPendana.tsx");
cek(tabelSumber.includes("table-fixed"), "tabel pendana memakai table-fixed");
cek(
  tabelSumber.includes("[&_th]:whitespace-normal"),
  "judul kolom tabel boleh turun baris (tanpa whitespace-nowrap)",
);
cek(
  tabelSumber.includes("sticky top-0"),
  "kepala kolom melekat saat isinya digulir",
);
cek(
  tabelSumber.includes("sticky bottom-0"),
  "baris total menempel di dasar kotak gulir",
);
cek(
  tabelSumber.includes("max-h-[min("),
  "tabel dibatasi tingginya, jadi isinya digulir di dalam tabel, bukan di halaman",
);
cek(
  tabelSumber.includes("w-[10rem]") && !/w-\[\d+%\]/.test(tabelSumber),
  "kolom angka berlebar tetap: angkanya berdekatan, tidak ikut melebar bersama halaman",
);
cek(
  tabelSumber.includes("min-w-[34rem]") &&
    tabelSumber.includes("min-w-[74rem]"),
  "lebar minimum menjaga kolom nama tetap terbaca saat enam kolom angka terbuka",
);

const rekapUji = [
  {
    nama: "ROBERT",
    jumlahPinjaman: 8,
    jumlahAktif: 7,
    jumlahLunas: 1,
    totalDisalurkan: 7_000_000,
    saldoBerjalan: 6_000_000,
    totalBunga: 2_100_000,
    keuntunganPendana: 1_645_000,
    keuntunganPendanaLunas: 235_000,
    keuntunganPendanaBelumLunas: 1_410_000,
    keuntunganAdmin: 455_000,
    keuntunganAdminLunas: 65_000,
    keuntunganAdminBelumLunas: 390_000,
    transferTercatat: 0,
    transferBelumDicatat: 1,
    keuntunganBelumDicatat: 235_000,
  },
];
const tabelPendana = renderToStaticMarkup(
  createElement(TabelPendana, { rekap: rekapUji, onPilih: () => {} }),
);
// Baris rincian diuji pada baris yang dibuka: isinya tidak ada di DOM saat terlipat.
const rincianTerbuka = renderToStaticMarkup(
  createElement(TabelPendana, {
    rekap: rekapUji,
    bukaAwal: ["ROBERT"],
    rincianPerkiraan: () => [
      {
        id: "p1",
        nomorReferensi: "PGD-1",
        namaLengkap: "HASBI SUKMANDA",
        keuntunganPendana: 235_000,
      },
    ],
  }),
);
for (const teks of [
  "Pinjaman (referensi · peminjam)",
  "Angka lain di baris ini",
  "Potongan admin dibukukan",
  "Jumlah baris di atas sama dengan kolom “Perkiraan (belum lunas)”.",
]) {
  cek(rincianTerbuka.includes(teks), `rincian baris terbuka memuat "${teks}"`);
}
const kepala = tabelPendana.slice(
  tabelPendana.indexOf("<thead"),
  tabelPendana.indexOf("</thead>"),
);
cek(
  cacah(kepala, /text-right/g) >= 2,
  `dua judul kolom angka rata kanan, sejajar dengan angkanya (ditemukan ${cacah(kepala, /text-right/g)})`,
);
cek(
  cacah(kepala, /aria-sort=/g) === 2,
  `dua kolom angka membawa tanda urutannya (ditemukan ${cacah(kepala, /aria-sort=/g)})`,
);
cek(
  cacah(kepala, /aria-label="Urutkan menurut/g) === 0,
  "judul kolom bukan tombol: pengurutnya satu tempat di baris kendali",
);
cek(
  tabelPendana.includes("Urutkan tabel menurut kolom"),
  "pengurut kolom tersedia di baris kendali",
);

// Tiap baris: nama (rata kiri, setinggi satu baris teks) + kolom angka yang
// sedang terbuka. Bawaannya dua kolom modal; empat kolom hasil menyusul saat
// gugusnya dinyalakan.
const potongBaris = (html: string) =>
  html
    .slice(html.indexOf("<tbody"), html.indexOf("</table>"))
    .split("<tr")
    .slice(1)
    .map((baris) => baris.split("<td").slice(1));
const barisTabel = potongBaris(tabelPendana);
cek(
  barisTabel.every((sel) => sel.length === 3),
  `tiap baris punya 3 sel: nama + dua kolom modal (ditemukan ${barisTabel.map((s) => s.length).join(",")})`,
);
cek(
  barisTabel
    .flatMap((sel) => sel.slice(1))
    .every((sel) => sel.includes("text-right")),
  "semua sel angka rata kanan, sejajar judul kolomnya",
);
// Gugus kolom dipisah garis rambut antara nama dan angka pertamanya.
cek(
  barisTabel[0].filter((sel) => sel.includes("border-l")).length === 1,
  "satu pembatas gugus memisahkan nama dari angkanya",
);
cek(
  barisTabel[0][0].includes("py-1.5"),
  "sel nama rapat: padding barisnya tidak lagi sedalam dua baris teks",
);

const htmlPenuh = renderToStaticMarkup(
  createElement(TabelPendana, {
    rekap: rekapUji,
    gugusAwal: ["dana", "hasil"],
  }),
);
const barisPenuh = potongBaris(htmlPenuh);
cek(
  barisPenuh.every((sel) => sel.length === 7),
  `gugus hasil menambah empat kolom angka (ditemukan ${barisPenuh.map((s) => s.length).join(",")})`,
);
cek(
  cacah(htmlPenuh, /aria-sort=/g) === 6,
  `enam kolom angka membawa tanda urutannya saat kedua gugus terbuka (ditemukan ${cacah(htmlPenuh, /aria-sort=/g)})`,
);

const jumlah = lulus + gagal;
console.log(`qa-ruang-pendana: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
