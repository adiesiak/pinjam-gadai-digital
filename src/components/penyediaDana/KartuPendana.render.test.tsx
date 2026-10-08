/**
 * Uji render kartu rekap penyedia dana di /penyedia-dana.
 * Run: bun src/components/penyediaDana/KartuPendana.render.test.tsx
 *
 * Halaman utuhnya membaca Convex dan memuat peta Leaflet, jadi tidak bisa
 * dirender di luar aplikasi; kartunya murni, jadi dirender langsung di sini.
 *
 * Yang dijaga:
 * 1. laporan keuntungan yang MASIH DIPERKIRAKAN benar-benar terpisah dari yang
 *    sudah cair — angka perkiraan tidak boleh menyamar sebagai uang yang sudah
 *    menjadi hak penyedia dana, dan labelnya tidak boleh tertukar;
 * 2. kartunya tetap ringkas: dibaca dalam blok (keuntungan → potongan admin →
 *    transfer), bukan daftar angka panjang yang harus diurai satu per satu.
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
/** Isi satu baris nilai: dari labelnya sampai penutup barisnya. */
function baris(html: string, label: string): string {
  const mulai = html.indexOf(`${label}</dt>`);
  ok(mulai !== -1, `baris "${label}" ada`);
  if (mulai === -1) return "";
  const selesai = html.indexOf("</div>", mulai);
  return selesai === -1 ? html.slice(mulai) : html.slice(mulai, selesai);
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

// Modal diringkas jadi satu baris konteks — bukan dua baris yang bersaing
// perhatian dengan laporan keuntungan.
ada(html, "Rp 7.000.000 disalurkan", "total disalurkan tetap tampil, kini satu baris");
ada(html, "Rp 6.000.000 masih berjalan", "saldo berjalan tetap tampil, kini satu baris");

// ===== Blok keuntungan: yang sudah cair dipisah dari yang masih perkiraan =====
ada(html, "Keuntungan pendana", "judul blok keuntungan");
ada(html, "Sudah lunas (dibukukan)", "label keuntungan yang sudah jadi uang");
ada(
  html,
  "Belum lunas (perkiraan) · 7 pinjaman berjalan",
  "label perkiraan menyebut jumlah pinjaman yang masih berjalan",
);
ada(html, "Total keuntungan", "label total keuntungan");
ada(
  html,
  "Angka perkiraan baru menjadi uang Anda setelah pinjamannya lunas.",
  "catatan jujur: perkiraan belum menjadi uang",
);

const sudah = baris(html, "Sudah lunas (dibukukan)");
const belum = baris(html, "Belum lunas (perkiraan) · 7 pinjaman berjalan");
const total = baris(html, "Total keuntungan");

ok(
  sudah.includes("Rp 235.000") && !sudah.includes("Rp 1.410.000"),
  "baris \"sudah lunas\" memuat angka yang sudah cair, bukan angka perkiraan",
);
ok(
  belum.includes("Rp 1.410.000") && !belum.includes("Rp 235.000"),
  "baris \"belum lunas\" memuat angka perkiraan, bukan angka yang sudah cair",
);
ok(total.includes("Rp 1.645.000"), "baris total keuntungan memuat jumlah keduanya");
ok(
  sudah.includes('dd class="tabular-nums font-semibold text-emerald-700"'),
  "angka yang sudah cair ditandai emerald (tegas)",
);
ok(
  belum.includes('dd class="tabular-nums font-medium text-amber-700"'),
  "angka perkiraan ditandai amber (belum pasti)",
);

// ===== Potongan admin dipisah dengan aturan yang sama, tapi cukup satu baris =====
ada(html, "Potongan admin (total)", "label potongan admin");
ok(
  html.includes(
    'Potongan admin (total)</dt><dd class="tabular-nums font-semibold text-amber-700">Rp 455.000',
  ),
  "potongan admin memuat totalnya",
);
ada(html, "sudah dibukukan Rp 65.000", "potongan admin yang sudah dibukukan tetap disebut");
ada(html, "perkiraan Rp 390.000", "potongan admin perkiraan tetap disebut");

// Catatan transfer tetap hanya soal pinjaman lunas.
ada(html, "Transfer keuntungan", "baris transfer keuntungan");
ada(html, "1 belum dicatat", "catatan transfer yang belum dibuat ditandai");

// ===== Kartu tetap ringkas =====
// Lima baris nilai (3 keuntungan + 1 potongan admin + 1 transfer) adalah bentuk
// yang diminta: penyedia dana tidak perlu mengurai sembilan baris angka.
const jumlahBaris = (html.match(/<\/dt>/g) ?? []).length;
ok(jumlahBaris <= 6, `kartu tetap terbaca ringkas (${jumlahBaris} baris nilai, maksimum 6)`);

bersih(html, "markup kartu rekap");

// Tanpa pinjaman lunas: bagian yang sudah cair nol dan transfer dijelaskan apa
// adanya, bukan dikosongkan atau diisi angka perkiraan.
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
ada(
  htmlBaru,
  "Belum lunas (perkiraan) · 1 pinjaman berjalan",
  "label perkiraan ikut menyesuaikan jumlah pinjaman berjalan",
);
ok(
  htmlBaru.includes(
    'Sudah lunas (dibukukan)</dt><dd class="tabular-nums font-semibold text-emerald-700">Rp 0',
  ),
  "bagian yang sudah cair nol, bukan angka perkiraan",
);
ada(htmlBaru, "Rp 235.000", "perkiraan tetap tampil di baris belum lunas");
ok(
  !htmlBaru.includes("semua sudah dicatat"),
  "belum ada pinjaman lunas tidak diklaim sudah dicatat",
);
bersih(htmlBaru, "markup kartu tanpa pinjaman lunas");

console.log(`KartuPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
