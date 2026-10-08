/**
 * Uji render kartu rekap penyedia dana di /penyedia-dana.
 * Run: bun src/components/penyediaDana/KartuPendana.render.test.tsx
 *
 * Halaman utuhnya membaca Convex dan memuat peta Leaflet, jadi tidak bisa
 * dirender di luar aplikasi; kartunya murni, jadi dirender langsung di sini.
 * Yang dijaga: keuntungan pinjaman yang BELUM lunas benar-benar dilaporkan
 * sebagai baris terpisah — angka proyeksi tidak boleh menyamar sebagai
 * keuntungan yang sudah cair, dan labelnya tidak boleh tertukar.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { RekapPendana } from "@/convex/penyediaDana";

import { KartuPendana } from "./KartuPendana";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

/** Nilai unik per baris supaya label tertukar pasti ketahuan. */
const ROBERT: RekapPendana = {
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
};

const html = renderToStaticMarkup(<KartuPendana r={ROBERT} />);

// Identitas + ringkasan jumlah pinjaman.
ada(html, "ROBERT", "nama penyedia dana");
ada(html, "8 pinjaman · 7 aktif · 1 lunas", "ringkasan jumlah pinjaman");
ada(html, "Rp 7.000.000", "total disalurkan");
ada(html, "Rp 6.000.000", "saldo berjalan");

// Pemisahan keuntungan: dua baris terpisah + satu baris total.
ada(html, "Keuntungan sudah lunas", "label keuntungan sudah lunas");
ada(html, "Keuntungan belum lunas (proyeksi)", "label keuntungan belum lunas ditandai proyeksi");
ada(html, "Total keuntungan pendana", "label total keuntungan pendana");
ada(html, "Rp 235.000", "keuntungan sudah lunas tampil");
ada(html, "Rp 1.410.000", "keuntungan belum lunas tampil");
ada(html, "Rp 1.645.000", "total keuntungan pendana tampil");
// Angka proyeksi tidak boleh muncul di baris "sudah lunas" — ini inti
// permintaan: laporan belum lunas harus terpisah, bukan digabung.
ok(
  html.includes("Keuntungan sudah lunas</dt><dd class=\"tabular-nums font-semibold text-emerald-700\">Rp 235.000"),
  "baris \"sudah lunas\" memuat angka lunas, bukan angka proyeksi",
);
ok(
  html.includes(
    "Keuntungan belum lunas (proyeksi)</dt><dd class=\"tabular-nums font-medium text-amber-700\">Rp 1.410.000",
  ),
  "baris \"belum lunas\" memuat angka proyeksi",
);
ok(
  html.includes(
    "Total keuntungan pendana</dt><dd class=\"tabular-nums font-semibold text-emerald-700\">Rp 1.645.000",
  ),
  "baris total pendana memuat jumlah keduanya",
);

// Pemisahan potongan admin memakai aturan yang sama.
ada(html, "Potongan admin sudah lunas", "label potongan admin sudah lunas");
ada(html, "Potongan admin belum lunas (proyeksi)", "label potongan admin belum lunas");
ada(html, "Total potongan admin (dari uang kembali)", "label total potongan admin");
ada(html, "Rp 65.000", "potongan admin sudah lunas tampil");
ada(html, "Rp 390.000", "potongan admin belum lunas tampil");
ada(html, "Rp 455.000", "total potongan admin tampil");

// Catatan transfer tetap hanya soal pinjaman lunas.
ada(html, "Transfer keuntungan", "baris transfer keuntungan");
ada(html, "1 belum dicatat", "catatan transfer yang belum dibuat ditandai");

bersih(html, "markup kartu rekap");

// Tanpa pinjaman lunas: baris lunas nol dan transfer dijelaskan apa adanya,
// bukan dikosongkan atau diisi angka proyeksi.
const BARU: RekapPendana = {
  ...ROBERT,
  jumlahLunas: 0,
  jumlahAktif: 1,
  transferTercatat: 0,
  transferBelumDicatat: 0,
  keuntunganPendanaLunas: 0,
  keuntunganPendanaBelumLunas: 235_000,
  keuntunganAdminLunas: 0,
  keuntunganAdminBelumLunas: 65_000,
  keuntunganPendana: 235_000,
  keuntunganAdmin: 65_000,
  keuntunganBelumDicatat: 0,
};
const htmlBaru = renderToStaticMarkup(<KartuPendana r={BARU} />);
ada(htmlBaru, "belum ada pinjaman lunas", "transfer dijelaskan saat belum ada pinjaman lunas");
ada(htmlBaru, "Rp 0", "bagian sudah lunas nol, bukan angka proyeksi");
ada(htmlBaru, "Rp 235.000", "proyeksi tetap tampil di baris belum lunas");
ok(
  !htmlBaru.includes("semua sudah dicatat"),
  "belum ada pinjaman lunas tidak diklaim sudah dicatat",
);
bersih(htmlBaru, "markup kartu tanpa pinjaman lunas");

console.log(`KartuPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
