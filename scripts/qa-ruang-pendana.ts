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

// ===== 6. Tabel pendana muat di kontainernya, tanpa kolom terpotong =====
// Sebelumnya tiap kolom angka selebar isi terpanjang judulnya (judul kolom
// dipaksa satu baris), sehingga tabel menuntut lebih lebar daripada kartunya:
// kolom "Total keuntungan" terpotong tepi kartu. Kontrak yang dijaga di sini:
// tabel `table-fixed`, lebar tiap kolom dipatok persen sampai jumlahnya ≤ 100,
// judul dan sel boleh turun baris, dan semua angka rata kanan.
const tabelSumber = baca("src/components/penyediaDana/TabelPendana.tsx");
cek(tabelSumber.includes("table-fixed"), "tabel pendana memakai table-fixed");
cek(
  tabelSumber.includes("[&_th]:whitespace-normal"),
  "judul kolom tabel boleh turun baris (tanpa whitespace-nowrap)",
);
cek(
  tabelSumber.includes("[&_td]:whitespace-normal"),
  "sel tabel mengikuti lebar kolom, bukan menuntut selebar isinya",
);

const lebar = Object.fromEntries(
  [...tabelSumber.matchAll(/const LEBAR_(\w+) = "w-\[(\d+(?:\.\d+)?)%\]"/g)].map((m) => [
    m[1],
    Number(m[2]),
  ]),
);
const anggaran = lebar.PENDANA + 6 * lebar.ANGKA + lebar.AKSI;
cek(
  anggaran <= 100,
  `jatah lebar kolom tidak melebihi kontainer (${anggaran}% = 1×${lebar.PENDANA}% + 6×${lebar.ANGKA}% + ${lebar.AKSI}%)`,
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
const kepala = tabelPendana.slice(
  tabelPendana.indexOf("<thead"),
  tabelPendana.indexOf("</thead>"),
);
cek(
  cacah(kepala, /justify-end/g) === 6,
  "enam judul kolom angka rata kanan, sejajar dengan angkanya",
);
cek(
  cacah(kepala, /aria-label="Urutkan menurut/g) === 7,
  `tujuh kepala kolom bisa diurutkan (ditemukan ${cacah(kepala, /aria-label="Urutkan menurut/g)})`,
);

// Tiap baris: sel pertama nama (rata kiri, memuat catatan transfer), enam sel
// berikutnya angka (rata kanan), sel terakhir aksi.
const barisTabel = tabelPendana
  .slice(tabelPendana.indexOf("<tbody"), tabelPendana.indexOf("</table>"))
  .split("<tr")
  .slice(1)
  .map((baris) => baris.split("<td").slice(1));
const selAngka = barisTabel.flatMap((sel) => sel.slice(1, 7));
cek(
  barisTabel.every((sel) => sel.length === 8),
  `tiap baris punya 8 sel (ditemukan ${barisTabel.map((s) => s.length).join(",")})`,
);
cek(selAngka.length === 12, `enam sel angka per baris, dua baris (ada ${selAngka.length})`);
cek(
  selAngka.every((sel) => sel.includes("text-right")),
  "semua sel angka rata kanan, sejajar judul kolomnya",
);
// Gugus kolom dipisah garis rambut: posisi dana | hasil pendana | biaya.
const barisBadan = barisTabel[0];
cek(
  barisBadan.filter((sel) => sel.includes("border-l")).length === 3,
  "tiga pembatas gugus kolom di badan tabel",
);

const jumlah = lulus + gagal;
console.log(`qa-ruang-pendana: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
