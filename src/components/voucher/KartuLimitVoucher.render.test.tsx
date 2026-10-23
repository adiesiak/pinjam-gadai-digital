/**
 * Uji render daftar voucher di slide-over dashboard peminjam.
 * Run: bun src/components/voucher/KartuLimitVoucher.render.test.tsx
 *
 * Yang dijaga: voucher yang belum layak TETAP tampil (bukan disembunyikan),
 * diberi tanda nonaktif, dan alasannya menyebut minimal pengajuan sekaligus
 * limit nasabah saat ini — dua angka yang dibutuhkan untuk memutuskan apakah
 * nominal pengajuannya perlu diturunkan.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  DaftarVoucherSheet,
  type VoucherDenganKelayakan,
} from "./KartuLimitVoucher";

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

const berlakuSampai = Date.UTC(2026, 10, 30);

const DAFTAR: VoucherDenganKelayakan[] = [
  {
    _id: "v1",
    kode: "VCR-100001-234",
    jenis: "diskon_admin",
    judul: "Bebas biaya admin",
    nilai: 20_000,
    minPokok: 100_000,
    batasPemakaian: 1,
    terpakai: 0,
    status: "aktif",
    berlakuSampai,
    layak: true,
    alasan: null,
  },
  {
    _id: "v2",
    kode: "VCR-100002-345",
    jenis: "boost_plafon",
    judul: "Tambah limit akhir tahun",
    nilai: 500_000,
    minPokok: 2_000_000,
    batasPemakaian: 1,
    terpakai: 0,
    status: "aktif",
    berlakuSampai,
    layak: false,
    alasan: "Minimal pengajuan Rp 2.000.000 (Limit Anda saat ini Rp 500.000)",
  },
];

const html = renderToStaticMarkup(
  <DaftarVoucherSheet daftar={DAFTAR} batasPengajuan={500_000} />,
);

ada(html, "Batas pengajuan Anda sekarang Rp 500.000", "batas pengajuan disebut");
ada(html, "VCR-100001-234", "kode voucher tampil");
ada(html, "Bebas biaya admin", "voucher layak tampil");
ada(html, "Bisa dipakai", "voucher layak ditandai");
ada(html, "Tambah limit akhir tahun", "voucher belum layak tetap tampil");
ada(html, "Belum bisa", "voucher belum layak ditandai nonaktif");
ada(
  html,
  "Minimal pengajuan Rp 2.000.000",
  "alasan menyebut minimal pengajuan",
);
ada(html, "Limit Anda saat ini Rp 500.000", "alasan menyebut limit nasabah");
ada(html, "tambah limit Rp 500.000", "jenis boost dijelaskan sebagai tambahan limit");
ada(html, "potongan Rp 20.000", "voucher potongan menyebut nilai potongannya");
bersih(html, "daftar voucher");

const kosong = renderToStaticMarkup(
  <DaftarVoucherSheet daftar={[]} batasPengajuan={500_000} />,
);
ada(kosong, "Belum ada voucher atas nama Anda", "keadaan kosong dijelaskan");
ada(kosong, "lunas tepat waktu", "cara mendapat voucher dijelaskan");
bersih(kosong, "keadaan kosong");

console.log(`DaftarVoucherSheet.render: ${passed}/${passed + failed} lulus`);
if (failed > 0) process.exit(1);
