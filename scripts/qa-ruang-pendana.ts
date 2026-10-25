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
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AturanPerhitungan } from "../src/components/penyediaDana/AturanPerhitungan";
import { bagiKolom } from "../src/components/penyediaDana/folio";
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
  "src/pages/penyedia-dana/bagian-umum.tsx",
  "src/pages/penyedia-dana/format.ts",
  "src/components/penyediaDana/KesehatanPortofolio.tsx",
  "src/components/penyediaDana/RingkasanKeuntungan.tsx",
  "src/components/penyediaDana/RisikoPendanaan.tsx",
  "src/components/penyediaDana/AturanPerhitungan.tsx",
  "src/components/penyediaDana/PersetujuanRisikoPendana.tsx",
  "src/components/penyediaDana/LaporanTransferPendana.tsx",
  "src/components/penyediaDana/KontakLaporanWhatsapp.tsx",
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

// 2. Satu titik fokus, dan hanya satu. Sejak halaman dipecah, permukaan fokus
// bisa tinggal di modul bagian; yang dijaga adalah jumlahnya di seluruh
// penyusun halaman, bukan di satu berkas saja.
const halaman = baca("src/pages/PenyediaDana.tsx");
const bagianUmum = baca("src/pages/penyedia-dana/bagian-umum.tsx");
cek(
  cacah(halaman, /FOLIO\.fokus/g) + cacah(bagianUmum, /FOLIO\.fokus/g) === 1,
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

// Pembagian kolomnya seimbang dan urutannya tidak berubah — kalau tidak, nomor
// poin risiko bisa melompat dari kolom ke kolom.
{
  const dua = [...Array(12).keys()];
  const bagi = bagiKolom(dua, 3);
  cek(
    bagi.map((b) => b.length).join(",") === "4,4,4",
    `dua belas poin dibagi rata ke tiga kolom (ditemukan ${bagi.map((b) => b.length).join(",")})`,
  );
  cek(
    bagi.flat().join(",") === dua.join(","),
    "urutan poin tetap 1 sampai 12 setelah dibagi ke kolom",
  );
  cek(
    bagiKolom([...Array(7).keys()], 3)
      .map((b) => b.length)
      .join(",") === "3,2,2",
    "tujuh aturan dibagi 3/2/2, tanpa kolom yang menggantung satu baris",
  );
  cek(
    bagiKolom([], 3).every((b) => b.length === 0),
    "daftar kosong tidak menghasilkan kolom berisi",
  );
}

// Lipatan itu sendiri: bagian yang dituju jangkar harus terbuka, baik saat
// halaman baru dimuat maupun saat jangkarnya diklik dari dalam halaman.
const lipat = baca("src/components/penyediaDana/bagian-folio.tsx");
cek(
  lipat.includes("dibukaLewatJangkar(id)"),
  "bagian yang dituju jangkar terbuka saat halaman dimuat",
);
cek(
  lipat.includes('addEventListener("hashchange"'),
  "bagian terlipat ikut terbuka saat jangkarnya diklik dari dalam halaman",
);

// Dua bagian rujukan (risiko & aturan) memakai satu bentuk lipatan yang sama:
// tertutup secara bawaan dengan ringkasan tetap terbaca di kepalanya, dan
// isinya dipasang tiga kolom saat dibuka. Yang diperiksa di sini: keadaan
// tertutupnya benar-benar tidak memuat isi, dan keadaan terbukanya tetap rapat.
const risikoTertutup = renderToStaticMarkup(
  createElement(PanelRisikoPendanaan),
);
cek(
  risikoTertutup.includes(">03<"),
  "nomor bagian 03 tercetak di panel risiko",
);
cek(
  risikoTertutup.includes("12 hal yang perlu Anda tahu sebelum mendanai"),
  "ringkasan isi bagian tetap terbaca saat panel risiko tertutup",
);
cek(
  risikoTertutup.includes('aria-expanded="false"'),
  "tombol buka panel risiko menyatakan keadaannya",
);
cek(
  !risikoTertutup.includes("Gagal bayar"),
  "panel risiko yang tertutup tidak merender isinya",
);

const risiko = renderToStaticMarkup(
  createElement(PanelRisikoPendanaan, { bukaAwal: [1] }),
);
cek(
  risiko.includes('aria-expanded="true"') && risiko.includes("lg:grid-cols-3"),
  "panel risiko yang dibuka memasang judul poinnya tiga kolom",
);

const aturanTertutup = renderToStaticMarkup(
  createElement(AturanPerhitungan, {
    persenPotonganAdmin: 5,
  }),
);
cek(
  aturanTertutup.includes(">05<") &&
    aturanTertutup.includes(
      "siklus 30 hari · porsi pendana 78,33% · porsi platform 21,67%",
    ),
  "nomor bagian 05 dan skema tetap tercetak saat aturannya tertutup",
);
cek(
  !aturanTertutup.includes("Imbal Hasil pendana (tetap 30%)"),
  "aturan yang tertutup tidak merender isinya",
);

const aturan = renderToStaticMarkup(
  createElement(AturanPerhitungan, {
    persenPotonganAdmin: 5,
    bukaAwal: [1, 2],
  }),
);
cek(
  aturan.includes("lg:grid-cols-3"),
  "aturan yang dibuka memasang judulnya tiga kolom",
);
cek(
  aturan.includes("30% flat") && aturan.includes("Tenor pendana 30 hari"),
  "skema pendana tetap terbaca setelah aturannya dibuka",
);

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
// Kontraknya: `table-fixed`, lebar kolom dipatok tetap, judul kolom dan sel
// boleh turun baris, semua angka rata kanan, dan tidak ada kolom yang bisa
// disembunyikan tombol.
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
  tabelSumber.includes("w-40") &&
    tabelSumber.includes("w-36") &&
    !/w-\[\d+%\]/.test(tabelSumber),
  "kolom angka berlebar tetap: angkanya berdekatan, tidak ikut melebar bersama halaman",
);
cek(
  tabelSumber.includes("min-w-[60rem]"),
  "lebar minimum menjaga kolom nama tetap terbaca",
);
// Kolomnya selalu lengkap: tidak ada lagi tombol yang menyalakan-mematikan
// gugus kolom, jadi tidak ada angka yang bisa tersembunyi dari pembaca.
cek(
  !/gugus/i.test(tabelSumber),
  "tidak ada tombol yang menyembunyikan kolom di tabel pendana",
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
  "Biaya platform (layanan) dibukukan",
  "Jumlah baris di atas sama dengan kolom “Perkiraan (belum lunas)”.",
]) {
  cek(rincianTerbuka.includes(teks), `rincian baris terbuka memuat "${teks}"`);
}
const kepala = tabelPendana.slice(
  tabelPendana.indexOf("<thead"),
  tabelPendana.indexOf("</thead>"),
);
// Tiga pita kolom: pengelompokannya dinamai sekali di kepala, dan angka
// bagiannya tidak berdiri sebagai kolom sendiri.
for (const pita of ["Dana pendana", "Hasil pendana", "Platform"]) {
  cek(
    cacah(kepala, new RegExp(`>${pita}<`, "g")) === 1,
    `pita "${pita}" dinamai sekali di kepala tabel`,
  );
}
cek(
  kepala.includes("Transfer keuntungan") &&
    kepala.includes("Biaya platform (layanan)"),
  "kolom sisi platform (transfer dan biaya layanan) selalu terbuka",
);
cek(
  !kepala.includes("Masih berjalan") && !kepala.includes("Total keuntungan"),
  "angka bagian dan angka jumlah tidak berdiri sebagai kolom",
);
cek(
  cacah(kepala, /aria-sort=/g) === 4,
  `empat kolom angka membawa tanda urutannya (ditemukan ${cacah(kepala, /aria-sort=/g)})`,
);
cek(
  cacah(kepala, /aria-label="Urutkan menurut/g) === 0,
  "judul kolom bukan tombol: pengurutnya satu tempat di baris kendali",
);
cek(
  tabelPendana.includes("Urutkan tabel menurut kolom"),
  "pengurut kolom tersedia di baris kendali",
);

// Tiap baris: nama (rata kiri, setinggi satu baris teks) + lima kolom pita, dan
// hanya kolom angka yang rata kanan.
const potongBaris = (html: string) =>
  html
    .slice(html.indexOf("<tbody"), html.indexOf("</table>"))
    .split("<tr")
    .slice(1)
    .map((baris) => baris.split("<td").slice(1));
const barisTabel = potongBaris(tabelPendana);
cek(
  barisTabel.every((sel) => sel.length === 6),
  `tiap baris punya 6 sel: nama + lima kolom pita (ditemukan ${barisTabel.map((s) => s.length).join(",")})`,
);
cek(
  barisTabel
    .flatMap((sel) => sel.slice(1))
    .every((sel) => sel.includes("text-right")),
  "semua sel angka rata kanan, sejajar judul kolomnya",
);
// Garis rambut memisahkan nama dari angka, lalu antar pita.
cek(
  barisTabel[0].filter((sel) => sel.includes("border-l")).length === 3,
  "tiga pembatas pita memisahkan nama dari angkanya dan memisahkan pitanya",
);
cek(
  barisTabel[0][0].includes("py-1.5"),
  "sel nama rapat: padding barisnya tidak lagi sedalam dua baris teks",
);
// Dana tersalurkan: angka induknya lebih besar, dan bagian yang masih berjalan
// terbaca di dalam selnya sendiri (bilah + keterangan), bukan sebagai kolom.
const selDana = barisTabel[0][1] ?? "";
cek(
  selDana.includes("w-40") && selDana.includes("text-base"),
  "sel dana tersalurkan tampil lebih besar dari angka lain",
);
cek(
  selDana.includes('role="img"') && selDana.includes("masih berjalan"),
  "bagian yang masih berjalan ditunjukkan bilah dan keterangannya",
);
// Nama pitanya terpakai juga di kartu layar sempit, supaya dua tata letak
// menyebut kelompok angka yang sama dengan istilah yang sama.
const kartuPonsel = tabelPendana.slice(tabelPendana.indexOf("</table>"));
for (const pita of ["Dana pendana", "Hasil pendana", "Platform"]) {
  cek(
    kartuPonsel.includes(pita),
    `kartu layar sempit memakai nama pita "${pita}"`,
  );
}

// 7. Istilah biaya 5%: nama yang dipilih pemilik, tanpa sisa istilah lama yang
// masih terbaca pengguna di bagian yang benar-benar dirender.
const bagianBerbiaya: readonly (readonly [string, string, string])[] = [
  ["aturan perhitungan", aturan, "Porsi platform"],
  ["ringkasan keuntungan", keuntungan, "Porsi platform"],
  ["tabel pendana", tabelPendana, "Biaya platform (layanan)"],
  ["rincian baris tabel", rincianTerbuka, "Biaya platform (layanan)"],
];
for (const [nama, html, label] of bagianBerbiaya) {
  cek(
    html.includes(label),
    `${nama} menyebut bagian platform sebagai "${label}"`,
  );
  cek(
    !/potongan admin/i.test(html),
    `${nama} tidak lagi menyebut "potongan admin"`,
  );
}

// 8. Batas portofolio pribadi ditegakkan di SERVER: akun pendana hanya menerima
// alokasi atas namanya, sedangkan admin/pemantau tetap menerima seluruh baris.
// Yang diperiksa di sini adalah sumber penjaganya — perilakunya ditahan
// `penyediaDana.convex.test.ts`.
const penjaga = baca("src/convex/penyediaDana.ts");
cek(
  cacah(penjaga, /cakupanPendana\(/g) >= 4,
  "cakupan pendana dipakai tiap query ruang: daftar, peta, dan laporan transfer",
);
cek(
  penjaga.includes("pinjamanMilikPendana") &&
    penjaga.includes("dipindahKePendanaLain"),
  "kepemilikan pinjaman memakai aturan tunggal pendanaKepemilikan",
);
cek(
  penjaga.includes('cakupan === null ? await ctx.db.query("pawns")'),
  "gadai hanya dibaca untuk pemantau: pawns tidak punya tabel alokasi pendana",
);
cek(
  halaman.includes("portofolio pribadi"),
  "batas cakupan dinyatakan di halaman, bukan hanya ditegakkan di server",
);
cek(
  baca("src/components/penyediaDana/PortofolioPendana.tsx").includes(
    "Alokasi atas nama",
  ),
  "pendana melihat portofolionya sendiri, bukan papan perbandingan antarpendana",
);

// 9. Laporan ke WhatsApp: nomornya milik AKUN pendana, diisi sendiri di ruangnya,
// dan tidak ada pihak lain yang bisa mengalihkan laporan keuangannya ke nomor
// lain. Yang diperiksa di sini adalah bentuk kartunya dan sumber penjaganya;
// perilakunya ditahan `laporanPendana.convex.test.ts`.
const kontakSumber = baca(
  "src/components/penyediaDana/KontakLaporanWhatsapp.tsx",
);
cek(
  kontakSumber.includes("FOLIO.kertas"),
  "kartu laporan memakai lembar folio yang sama",
);
cek(
  cacah(kontakSumber, /min-h-11/g) >= 2,
  "kedua tombol kartu laporan setinggi sasaran sentuh 44 px",
);
cek(
  kontakSumber.includes("Laporan berisi angka pendanaan Anda"),
  "kartu menyatakan laporan memuat angka pendanaan pemiliknya",
);
cek(
  halaman.includes("<KontakLaporanWhatsapp"),
  "kartu laporan terpasang di halaman ruang pendana",
);
cek(
  halaman.includes("nomor={kontakLaporan.nomorWhatsApp}"),
  "halaman membaca nomor dari akun, bukan dari isian yang diketik ulang",
);
cek(
  /isPendana\s*&&\s*kontakLaporan\s*!==\s*undefined\s*&&\s*kontakLaporan\s*!==\s*null/.test(
    halaman,
  ),
  "kartu laporan hanya untuk akun pemilik portofolio, bukan admin atau pemantau",
);
const pelaporan = baca("src/convex/laporanPendana.ts");
cek(
  pelaporan.includes("export const kirimLaporanPortofolio") &&
    /kirimLaporanPortofolio = action\(\{\s*args: \{\}/.test(pelaporan),
  "aksi laporan pendana tidak menerima nomor tujuan dari pemanggil",
);
cek(
  pelaporan.includes("peranPenyedia") &&
    pelaporan.includes("Nomor WhatsApp laporan belum diisi"),
  "pengiriman menolak akun bukan pendana dan menjelaskan nomor yang belum diisi",
);
cek(
  baca("src/convex/penyediaDana.ts").includes(
    "export const simpanKontakLaporan",
  ),
  "nomor laporan disimpan lewat mutation yang memeriksa pemilik akunnya",
);
cek(
  baca("src/convex/loans.ts").includes(
    "internal.laporanPendana.kirimLaporanPelunasan",
  ),
  "laporan pelunasan dijadwalkan setelah status lunas tersimpan",
);
cek(
  existsSync(
    "src/components/penyediaDana/KontakLaporanWhatsapp.render.test.tsx",
  ),
  "kartu laporan punya uji markup sendiri",
);
cek(
  baca("package.json").includes(
    "bun src/components/penyediaDana/KontakLaporanWhatsapp.render.test.tsx",
  ) && baca("package.json").includes("bun src/lib/laporanPendana.test.ts"),
  "uji laporan pendana ikut dijalankan oleh `bun run test`",
);

// 6. Aksi baris ringkas: Detail + Ubah (+ keuntungan) dalam satu menu Kelola.
{
  const kodeHalaman = baca("src/pages/PenyediaDana.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  cek(
    cacah(kodeHalaman, /<AksiPinjaman/g) === 2,
    "aksi baris dipakai di kartu ponsel dan tabel desktop",
  );
  cek(
    kodeHalaman.includes("aria-label={`Kelola ${nama}`}"),
    "pemicu menu menyebut nama peminjam untuk pembaca layar",
  );
  cek(
    cacah(kodeHalaman, /<DropdownMenuItem/g) === 4,
    "Detail, Ubah, Catat untung, dan Batalkan catatan berada di dalam menu",
  );
  cek(
    kodeHalaman.includes("jumlahAksi === 1"),
    "baris yang hanya punya Detail tetap memakai satu tombol",
  );
  cek(
    !kodeHalaman.includes('<div className="flex flex-col gap-2">') &&
      !kodeHalaman.includes('<Pencil className="mr-1.5 size-3.5"'),
    "tumpukan tombol Detail/Ubah lama sudah tidak dirender",
  );
}

// 10. Ringkasan yang menjawab pertanyaan pendana lebih dulu.
// Tab, angka siklus, dan pinjaman berjalan dibaca dari sumbernya; isi tabnya
// sendiri ditahan uji render bagian masing-masing.
cek(
  /isPendana\s*\?\s*tabPendana\s*:\s*tabPengelola/.test(halaman),
  "daftar tab mengikuti peran pembaca",
);
cek(
  /tabTampil\.includes\("belum"\)/.test(halaman) &&
    /tabTampil\.includes\("ditolak"\)/.test(halaman) &&
    /tabTampil\.includes\("gadai"\)/.test(halaman),
  "tiga tab yang kosong untuk pendana tidak dirender baginya",
);
cek(
  halaman.includes("api.siklusPendana.siklusSaya") &&
    halaman.includes("siklusBerikut"),
  "tanggal cair siklus berikutnya dibaca di puncak halaman",
);
cek(
  halaman.includes('aria-labelledby="judul-sedang-berjalan"'),
  "pinjaman berjalan punya blok ringkas sebelum bagian penjelasan",
);
cek(
  halaman.includes("<AjukanPenempatan") &&
    /isPendana\s*&&\s*<AjukanPenempatan/.test(halaman),
  "pendana bisa mengajukan penempatan dari ruangnya sendiri",
);
cek(
  ["2", "4", "6"].every((nomor) =>
    halaman.includes(`nomor: ${nomor}, teks:`),
  ),
  "navigasi jangkar memuat bagian 2, 4, dan 6 yang sebelumnya dilewati",
);

const jumlah = lulus + gagal;
console.log(`qa-ruang-pendana: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
