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
 *    transfer), bukan daftar angka panjang yang harus diurai satu per satu;
 * 3. angka perkiraan bisa ditelusuri: rincian pinjaman pembentuknya ada, tetapi
 *    tersimpan dalam `<details>` yang tertutup secara bawaan — dan jumlah
 *    barisnya benar-benar sama dengan angka perkiraan yang ditampilkan.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { RekapPendana } from "@/convex/penyediaDana";
import { namaHurufBesar, samarkanNama } from "@/lib/nama";

import { KartuPendana, type RincianPerkiraan } from "./KartuPendana";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
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
/**
 * Isi satu baris nilai: dari labelnya sampai penutup barisnya.
 *
 * Label sekarang boleh diikuti ikon bantuan (tooltip istilah), jadi yang dicari
 * bukan lagi "label</dt>" melainkan "label berada DI DALAM sebuah <dt>". Syarat
 * "harus di dalam <dt>" sengaja dipertahankan — justru lebih tepat daripada
 * sekadar mencocokkan teks label di mana pun.
 */
function baris(html: string, label: string): string {
  let mulai = -1;
  for (let i = html.indexOf(label); i !== -1; i = html.indexOf(label, i + 1)) {
    const dtBuka = html.lastIndexOf("<dt", i);
    const dtTutup = html.lastIndexOf("</dt>", i);
    if (dtBuka !== -1 && dtBuka > dtTutup) {
      mulai = dtBuka;
      break;
    }
  }
  ok(mulai !== -1, `baris "${label}" ada di dalam <dt>`);
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

// Modal tetap berlabel — permintaan pemilik produk: total pinjaman dan dana
// tersalurkan TIDAK boleh hilang saat kartu diringkas.
ok(
  baris(html, "Total pinjaman").includes("8 pinjaman · 7 aktif · 1 lunas"),
  "baris \"Total pinjaman\" memuat hitungan pinjaman, aktif, dan lunas",
);
ok(
  baris(html, "Dana tersalurkan").includes("Rp 7.000.000"),
  "baris \"Dana tersalurkan\" memuat total pokok yang sudah tersalurkan",
);
ok(
  baris(html, "Saldo berjalan").includes("Rp 6.000.000"),
  "baris \"Saldo berjalan\" memuat pokok yang masih berjalan",
);

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
  baris(html, "Potongan admin (total)").includes(
    'tabular-nums font-semibold text-amber-700">Rp 455.000',
  ),
  "potongan admin memuat totalnya",
);
ada(html, "sudah dibukukan Rp 65.000", "potongan admin yang sudah dibukukan tetap disebut");
ada(html, "perkiraan Rp 390.000", "potongan admin perkiraan tetap disebut");

// Catatan transfer tetap hanya soal pinjaman lunas.
ada(html, "Transfer keuntungan", "baris transfer keuntungan");
ada(html, "1 belum dicatat", "catatan transfer yang belum dibuat ditandai");

// ===== Susunan baris adalah kontrak, bukan sekadar jumlah =====
// Urutan dan labelnya diuji persis: angka wajib (total pinjaman, dana
// tersalurkan, saldo berjalan, keuntungan sudah/belum lunas, total, potongan
// admin, transfer) tetap ada, tanpa baris tambahan yang membuat kartu kembali
// menjadi daftar panjang.
const label = [...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>/g)].map((m) =>
  m[1].replace(/<[^>]*>/g, "").trim(),
);
eq(
  JSON.stringify(label),
  JSON.stringify([
    "Total pinjaman",
    "Dana tersalurkan",
    "Saldo berjalan",
    "Sudah lunas (dibukukan)",
    "Belum lunas (perkiraan) · 7 pinjaman berjalan",
    "Total keuntungan",
    "Potongan admin (total)",
    "Transfer keuntungan",
  ]),
  "urutan & label baris kartu persis seperti kontrak",
);

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
  baris(htmlBaru, "Sudah lunas (dibukukan)").includes(
    'tabular-nums font-semibold text-emerald-700">Rp 0',
  ),
  "bagian yang sudah cair nol, bukan angka perkiraan",
);
ada(htmlBaru, "Rp 235.000", "perkiraan tetap tampil di baris belum lunas");
ok(
  !htmlBaru.includes("semua sudah dicatat"),
  "belum ada pinjaman lunas tidak diklaim sudah dicatat",
);
bersih(htmlBaru, "markup kartu tanpa pinjaman lunas");

// ===== Rincian pembentuk angka perkiraan (tersimpan rapi di dalam <details>) =====
{
  // Tanpa rincian, kartu tidak boleh menampilkan bagian kosong.
  ok(!html.includes("Rincian"), "tanpa rincian, tidak ada bagian rincian kosong");

  // 5 × Rp200.000 + 2 × Rp205.000 = Rp1.410.000, yaitu angka perkiraan kartu.
  const RINCIAN: RincianPerkiraan[] = Array.from(
    { length: 7 },
    (_, i) => ({
      id: `loans-${i}`,
      nomorReferensi: `PGD-2026-000${i + 1}`,
      namaLengkap: `Peminjam ${i + 1}`,
      keuntunganPendana: i < 5 ? 200_000 : 205_000,
    }),
  );
  const htmlRincian = renderToStaticMarkup(
    <KartuPendana r={ROBERT} rincianPerkiraan={RINCIAN} />,
  );

  ada(htmlRincian, "Rincian 7 pinjaman berjalan", "judul rincian menyebut jumlah pinjaman");
  ada(htmlRincian, "<details", "rincian tersimpan dalam elemen yang bisa dilipat");
  ada(
    htmlRincian,
    "Jumlah baris di atas sama dengan baris “Belum lunas (perkiraan)”.",
    "rincian menjelaskan hubungannya dengan angka perkiraan",
  );
  for (const p of RINCIAN) {
    ada(
      htmlRincian,
      `${p.nomorReferensi} · ${namaHurufBesar(p.namaLengkap)}`,
      `baris rincian ${p.nomorReferensi}`,
    );
  }
  ada(htmlRincian, "PEMINJAM 7", "nama peminjam terakhir ikut tampil");
  ok(
    !htmlRincian.includes("Peminjam "),
    "nama peminjam di rincian tampil HURUF BESAR, bukan apa adanya",
  );
  // Angka perkiraan kartu tetap sama; rincian tidak boleh mengubahnya.
  ada(htmlRincian, "Rp 1.410.000", "angka perkiraan tetap tampil di blok keuntungan");

  // Invarian yang dijanjikan catatan di kartu: jumlah baris rincian = angka perkiraan.
  const jumlah = RINCIAN.reduce((total, p) => total + p.keuntunganPendana, 0);
  eq(
    jumlah,
    ROBERT.keuntunganPendanaBelumLunas,
    "jumlah rincian sama dengan angka perkiraan pada kartu",
  );
  // Rincian tidak melemahkan aturan lama: bagian yang sudah cair tetap terpisah.
  ok(
    baris(htmlRincian, "Sudah lunas (dibukukan)").includes("Rp 235.000"),
    "rincian tidak menggeser angka yang sudah cair",
  );
  bersih(htmlRincian, "markup kartu dengan rincian perkiraan");
}

// ===== Penyamaran nama penyedia dana (ruang /penyedia-dana) =====
{
  const htmlSamar = renderToStaticMarkup(<KartuPendana r={ROBERT} namaTampil={samarkanNama} />);
  ada(htmlSamar, samarkanNama(ROBERT.nama), "nama penyedia dana tampil tersamar");
  ok(
    !htmlSamar.includes(`>${ROBERT.nama}<`),
    "nama penyedia dana penuh tidak tercetak saat penyamaran dipakai",
  );
  bersih(htmlSamar, "markup kartu dengan penyamaran");
}

console.log(`KartuPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
