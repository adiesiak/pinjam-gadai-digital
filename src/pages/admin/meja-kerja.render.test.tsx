/**
 * Uji render kartu "Aliran uang satu pinjaman" di panel Ringkasan → Hari Ini.
 * Run: bun src/pages/admin/meja-kerja.render.test.tsx
 *
 * Dirender lewat react-dom/server (tanpa DOM, tanpa browser): memastikan kartu
 * itu benar-benar muncul di markup admin dengan angka rupiah yang diminta
 * pemilik produk — bukan hanya benar di fungsi murninya. Pada saat yang sama
 * uji ini menjaga aturan panel: data server yang belum siap tampil "—", bukan 0.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { formatRupiah } from "@/lib/money";
import { PILIHAN_POKOK_RINCIAN } from "@/lib/rincianAliranDana";

import { MejaKerja } from "./meja-kerja";

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

/** Panel dirender tanpa data server: `stats` belum siap. */
function renderPanel(pokokContohAwal?: number): string {
  return renderToStaticMarkup(
    <MejaKerja
      overview={{ loans: [], pawns: [], kredit: [] }}
      stats={undefined}
      onBukaModul={() => {}}
      pokokContohAwal={pokokContohAwal}
    />,
  );
}

const html = renderPanel();

// Kartu baru itu ada dan bisa ditemukan admin.
ada(html, "Aliran uang satu pinjaman", "judul kartu");
ada(html, "Contoh satu pinjaman Rp 1.000.000", "kalimat contoh menyebut pokok Rp1.000.000");
ada(html, "dipotong 2% di muka", "kalimat contoh menyebut potongan 2% di muka");
ada(html, "kembali 130% dari pokok", "kalimat contoh menyebut kembali 130%");
ada(html, "dipotong 5% dari uang yang kembali", "kalimat contoh menyebut dasar potongan 5%");

// Delapan baris rincian, dengan label kebijakannya.
const label = [
  "Pokok pinjaman",
  "Potongan di muka 2% (biaya admin)",
  "Diterima peminjam",
  "Kembali (pokok + Imbal Hasil 30%)",
  "Potongan 5% dari uang yang kembali",
  "Diterima penyedia dana",
  "Imbal Hasil bersih penyedia dana",
  "Pendapatan platform",
];
for (const teks of label) ada(html, teks, `label rincian "${teks}"`);

// Angka yang diminta: 1jt dipotong 2% → 980rb diterima peminjam; kembali
// 1,3jt; dipotong 5% dari yang kembali → penyedia dana menerima 1,235jt.
ada(html, "Rp 1.000.000", "pokok");
ada(html, "− Rp 20.000", "potongan di muka 2%");
ada(html, "Rp 980.000", "dana yang diterima peminjam");
ada(html, "Rp 1.300.000", "uang yang kembali");
ada(html, "− Rp 65.000", "potongan 5% dari uang yang kembali");
ada(html, "Rp 1.235.000", "uang yang diterima penyedia dana");
ada(html, "Rp 235.000", "Imbal Hasil bersih penyedia dana");
ada(html, "Rp 85.000", "pendapatan platform satu pinjaman");

// Pilihan pokok: admin bisa memeriksa nominal lain tanpa membuka modul lain.
ada(html, "Pilih pokok pinjaman contoh", "grup pilihan pokok ada dan diberi nama");
for (const pokok of PILIHAN_POKOK_RINCIAN) {
  ada(html, formatRupiah(pokok), `pilihan pokok ${formatRupiah(pokok)} tersedia`);
}
ada(
  html,
  `aria-pressed="true"`,
  "pilihan aktif ditandai aria-pressed (pokok bawaan = maksimum)",
);
ada(html, `aria-pressed="false"`, "pilihan lain ditandai tidak aktif");
ada(
  html,
  "Rincian pinjaman yang sedang berjalan ada di detail pinjaman masing-masing.",
  "kartu mengarahkan admin ke detail pinjaman untuk angka nyata",
);

// Kartu melintang penuh di grid (1/2/4 kolom) supaya tidak berdesakan.
ada(html, "sm:col-span-2", "kartu rincian melintang 2 kolom di layar kecil");
ada(html, "xl:col-span-4", "kartu rincian melintang penuh di desktop");

// Angka contoh TIDAK boleh disamarkan sebagai angka ledger hari ini.
ada(html, "bukan angka ledger hari ini", "keterangan bahwa ini contoh kebijakan");

// Aturan panel: sumber belum siap → tanda pisah, bukan nol.
ada(html, "—", "kartu pekerjaan menampilkan tanda pisah saat data belum siap");
ada(html, "aria-busy", "kartu yang belum siap ditandai aria-busy");
// Panel ledger sudah dihapus dari admin: tidak boleh ada lagi kartu/tombolnya.
ok(!html.includes("Ledger internal"), "tanpa kartu Ledger internal");
ok(!html.includes("Buka ledger"), "tanpa tombol menuju panel ledger");
ada(html, "Tidak ada yang perlu ditindak.", "antrean kosong dijelaskan, bukan dibiarkan kosong");

bersih(html, "markup panel Hari Ini");

// ===== Pilihan pokok benar-benar mengubah angka kartu =====
// Panel dibuka dengan pilihan lain (pokok Rp500.000): angka rincian HARUS ikut
// berubah, bukan tetap menampilkan contoh maksimum.
const htmlKecil = renderPanel(500_000);
ada(htmlKecil, "Contoh satu pinjaman Rp 500.000", "kalimat contoh mengikuti pilihan pokok");
ada(htmlKecil, "− Rp 10.000", "potongan di muka 2% dari Rp500.000");
ada(htmlKecil, "Rp 490.000", "diterima peminjam");
ada(htmlKecil, "Rp 650.000", "uang yang kembali");
ada(htmlKecil, "− Rp 32.500", "potongan 5% dari yang kembali");
ada(htmlKecil, "Rp 617.500", "diterima penyedia dana");
ada(htmlKecil, "Rp 117.500", "Imbal Hasil bersih penyedia dana");
ada(htmlKecil, "Rp 42.500", "pendapatan platform");
ok(
  !htmlKecil.includes("Rp 1.235.000"),
  "angka contoh maksimum tidak lagi tampil saat pilihan diganti",
);
// Tombol yang aktif harus tombol Rp500.000 — bukan hanya "ada satu yang aktif".
const posisiAktif = htmlKecil.indexOf('aria-pressed="true"');
const posisiTombol = htmlKecil.indexOf(">Rp 500.000</button>");
ok(
  posisiAktif !== -1 && posisiTombol > posisiAktif && posisiTombol - posisiAktif < 400,
  "tombol pokok yang aktif adalah Rp 500.000",
);
bersih(htmlKecil, "markup panel dengan pilihan pokok Rp500.000");

console.log(`meja-kerja.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
