/**
 * Uji render "Laporan & riwayat transfer keuntungan" di ruang pendana.
 * Run: bun src/components/penyediaDana/LaporanTransferPendana.render.test.tsx
 *
 * Yang dijaga dari markup (bukan hanya dari fungsi murninya):
 *  1. Tiga angka pokok punya kartunya sendiri dan tidak tertukar: yang berlaku,
 *     yang dibatalkan, dan yang belum dicatat admin.
 *  2. Riwayat benar-benar tampil satu halaman 10 baris — bukan seluruh 12 baris
 *     sekaligus — dan paginasinya menerangkan rentangnya.
 *  3. Baris milik pembaca ditandai "milik Anda".
 *  4. Tanpa data sama sekali, yang muncul keadaan kosong yang jujur, bukan tabel
 *     kosong tanpa keterangan.
 *  5. Kalimat "catatan pembukuan, bukan bukti mutasi" tidak pernah hilang —
 *     inilah batas yang tidak boleh disalahbaca pendana.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  LaporanTransferPendana,
} from "./LaporanTransferPendana";
import type { BarisBelumTransfer, BarisTransferLaporan } from "@/lib/laporanTransfer";

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
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const SEKARANG = Date.UTC(2026, 9, 15, 6, 0, 0);
const HARI = 86_400_000;
const ID_SAYA = "dana-saya";

/** Dua belas catatan: nomor terkecil = paling baru dicatat. */
function barisKe(n: number): BarisTransferLaporan {
  const dibatalkan = n === 12;
  return {
    id: `t${n}`,
    nomorReferensi: `PGD-${String(n).padStart(3, "0")}`,
    // Hanya baris pertama yang milik pembaca; sisanya pendana lain.
    pendanaId: n === 1 ? ID_SAYA : `dana-${n}`,
    pendanaNama: n === 1 ? "ASEP FIRMAN HANAFI" : `PENDANA ${n}`,
    jumlah: dibatalkan ? 75_000 : 250_000,
    metode: n === 3 ? "e_wallet" : "transfer_bank",
    referensi: `TRF-${n}`,
    catatan: null,
    status: dibatalkan ? "dibatalkan" : "dicatat",
    dicatatPada: SEKARANG - n * HARI,
    dicatatOlehLabel: "admin@pindai.id",
    dibatalkanPada: dibatalkan ? SEKARANG - HARI : null,
    dibatalkanOlehLabel: dibatalkan ? "admin@pindai.id" : null,
    alasanBatal: dibatalkan ? "Salah nominal" : null,
  };
}

const ROWS: BarisTransferLaporan[] = Array.from({ length: 12 }, (_, i) => barisKe(i + 1));
const BELUM: BarisBelumTransfer[] = [
  {
    loanId: "loan-1",
    referensi: "PWN-777",
    pendanaId: "dana-9",
    pendanaNama: "PENDANA 9",
    jumlah: 600_000,
    lunasPada: SEKARANG - 3 * HARI,
  },
];

const RINGKASAN = {
  jumlahTercatat: 11,
  nilaiTercatat: 2_750_000,
  jumlahDibatalkan: 1,
  nilaiDibatalkan: 75_000,
  jumlahBelumDicatat: 1,
  nilaiBelumDicatat: 600_000,
};

function render(props: {
  rows?: BarisTransferLaporan[];
  belum?: BarisBelumTransfer[];
  terpotong?: boolean;
}): string {
  return renderToStaticMarkup(
    <LaporanTransferPendana
      rows={props.rows ?? ROWS}
      belum={props.belum ?? BELUM}
      ringkasan={RINGKASAN}
      idSaya={ID_SAYA}
      namaTampil={(nama) => nama}
      terpotong={props.terpotong ?? false}
    />,
    // Pemisah komentar antar teks yang disisipkan React dihapus dulu, supaya
    // kalimat yang tersusun dari beberapa ekspresi tetap bisa dicocokkan utuh.
  ).replace(/<!-- -->/g, "");
}

// ===== Halaman pertama dari 12 baris =====
const html = render({});

// Tiga kartu angka, masing-masing dengan angkanya sendiri.
ada(html, "Catatan transfer berlaku", "kartu catatan berlaku");
ada(html, "Rp 2.750.000", "nilai yang sudah dicatat");
ada(html, "11 catatan", "jumlah catatan berlaku");
ada(html, "Catatan dibatalkan", "kartu catatan dibatalkan");
ada(html, "Rp 75.000", "nilai yang dibatalkan");
ada(html, "Belum dicatat (antrean admin)", "kartu antrean admin");
ada(html, "Rp 600.000", "nilai yang belum dicatat");

// Batas yang tidak boleh disalahbaca.
ada(html, "catatan pembukuan internal", "isi laporan disebut catatan pembukuan");
ada(html, "bukan bukti mutasi bank/e-wallet dan bukan jaminan", "bukan bukti mutasi dinyatakan");

// Saringan & ekspor.
ada(html, 'aria-label="Laporan transfer keuntungan"', "bagian punya nama untuk pembaca layar");
ada(html, "Saring riwayat", "bilah saringan diberi nama");
ada(html, "semua status", "wajah dropdown status terisi tanpa menunggu dibuka");
ada(html, "semua waktu", "wajah dropdown periode terisi tanpa menunggu dibuka");
ada(html, "Unduh CSV", "tombol ekspor tersedia");
tidakAda(html, "Kosongkan filter", "tanpa filter, tombol kosongkan tidak muncul");

// Paginasi 10 baris/halaman: 1 baris kepala + 10 baris isi.
const barisTabel = html.match(/data-slot="table-row"/g) ?? [];
ok(barisTabel.length === 11, `halaman pertama memuat 10 baris isi (dapat ${barisTabel.length - 1})`);
ada(html, "PGD-001", "baris pertama halaman tampil");
ada(html, "PGD-010", "baris kesepuluh halaman tampil");
tidakAda(html, "PGD-011", "baris kesebelas belum tampil di halaman pertama");
tidakAda(html, "PGD-012", "baris kedua belas belum tampil di halaman pertama");
ada(html, "Menampilkan 1–10 dari 12", "rentang baris diterangkan");
ada(html, "Halaman 1 dari 2", "nomor halaman diterangkan");
ada(html, "Berikutnya", "tombol halaman berikutnya ada");
ada(html, "Sebelumnya", "tombol halaman sebelumnya ada");

// Baris milik pembaca ditandai, baris pendana lain tidak. Penandanya muncul di
// dua tempat untuk baris yang sama — tabel layar lebar dan kartu layar sempit —
// jadi jumlahnya dua, bukan satu.
ada(html, "milik Anda", "baris milik pembaca ditandai");
ok(
  (html.match(/milik Anda/g) ?? []).length === 2,
  "hanya baris milik pembaca yang ditandai (tabel + kartu ponsel)",
);

// Antrean rekonsiliasi: pekerjaan admin, jumlah dan nilainya terlihat.
ada(html, "Antrean rekonsiliasi · 1 pinjaman", "antrean rekonsiliasi berisi satu pinjaman");
ada(html, "PWN-777", "referensi pinjaman pada antrean");
ada(html, "pekerjaan admin", "antrean dinyatakan sebagai pekerjaan admin");
ada(html, "· lunas ", "tanggal pelunasan ditampilkan pada antrean");

// Daftar yang dipotong diberi tahu apa adanya, dan tidak diklaim terpotong
// saat memang tidak.
tidakAda(html, "Daftar dibatasi 200 catatan terbaru", "tanpa pemotongan, tidak ada klaim terpotong");
bersih(html, "markup laporan transfer");

// ===== Daftar terpotong =====
const terpotong = render({ terpotong: true });
ada(terpotong, "Daftar dibatasi 200 catatan terbaru", "pemotongan daftar diberitahukan");
bersih(terpotong, "markup laporan terpotong");

// ===== Tanpa data sama sekali =====
const kosong = render({ rows: [], belum: [] });
ada(kosong, "Belum ada catatan transfer keuntungan", "keadaan kosong jujur");
ada(kosong, "Belum ada catatan berarti belum ada yang perlu diperiksa", "keadaan kosong tidak menakut-nakuti");
ada(kosong, "di bank atau e-wallet", "keadaan kosong mengingatkan di mana buktinya berada");
tidakAda(kosong, "Unduh CSV", "tanpa data, tombol ekspor tidak tampil");
tidakAda(kosong, "data-slot=\"table-row\"", "tanpa data, tabel tidak dirender");
bersih(kosong, "markup keadaan kosong");

console.log(`LaporanTransferPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
