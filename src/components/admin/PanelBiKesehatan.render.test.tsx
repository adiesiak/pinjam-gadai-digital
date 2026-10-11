/**
 * Uji render bagian MURNI panel BI & Kesehatan.
 * Run: bun src/components/admin/PanelBiKesehatan.render.test.tsx
 *
 * Yang dijaga:
 *  - setiap metrik menampilkan KODE + label manusia + nilai + sumbernya
 *    (angka tanpa sumber tidak dapat dipercaya);
 *  - nilai rupiah diformat rupiah, bukan angka mentah;
 *  - tabel sinyal menyebut judul, nilai, sumber, catatan, dan ambang;
 *  - contoh respons gateway ditampilkan bila ada;
 *  - tidak ada "undefined"/"NaN"/"[object Object]".
 */
import { renderToStaticMarkup } from "react-dom/server";

import { DaftarMetrikBI, DaftarSinyalKesehatan } from "./PanelBiKesehatan";

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

// ===== 1. Metrik: kode, label, nilai, sumber =====
{
  const html = renderToStaticMarkup(
    <DaftarMetrikBI
      metrik={[
        { kode: "BI-L1", nilai: 12, satuan: "pengajuan", keterangan: "Sumber waktu: diajukanPada." },
        {
          kode: "BI-L4",
          nilai: 2_500_000,
          satuan: "rupiah",
          keterangan: "Pokok disalurkan dari 2 pinjaman.",
        },
      ]}
    />,
  );
  ada(html, "BI-L1", "kode metrik tampil");
  ada(html, "Pengajuan pinjaman baru", "label manusia dari register");
  ada(html, "12 pengajuan", "nilai + satuan angka");
  ada(html, "BI-L4", "kode metrik rupiah tampil");
  ada(html, "Rp 2.500.000", "nilai rupiah diformat");
  ada(html, "Sumber: loans", "sumber tabel disebutkan");
  ada(html, "Pokok disalurkan dari 2 pinjaman.", "keterangan metrik ikut tampil");
  bersih(html, "daftar metrik");
}
{
  const kosong = renderToStaticMarkup(<DaftarMetrikBI metrik={[]} />);
  ada(kosong, "Belum ada metrik", "tanpa metrik → pesan jelas");
  bersih(kosong, "metrik kosong");
}

// ===== 2. Sinyal kesehatan =====
{
  const html = renderToStaticMarkup(
    <DaftarSinyalKesehatan
      sinyal={[
        {
          kunci: "wa",
          judul: "Pengiriman WhatsApp gagal",
          nilai: 2,
          ambang: "perlu diperiksa bila > 0",
          sumber: "waLogs (status gagal, 24 jam)",
          keterangan: "2 gagal dari 5 percobaan.",
          contoh: "gateway: token tidak valid",
        },
        {
          kunci: "pengaduan",
          judul: "Pengaduan nasabah terbuka",
          nilai: 0,
          ambang: "perlu ditangani petugas",
          sumber: "pengaduanNasabah (status baru/ditinjau)",
          keterangan: "0 terbuka · 0 belum punya penanggung jawab.",
          contoh: null,
        },
      ]}
    />,
  );
  ada(html, "Pengiriman WhatsApp gagal", "judul sinyal tampil");
  ada(html, "waLogs (status gagal, 24 jam)", "sumber sinyal tampil");
  ada(html, "gateway: token tidak valid", "contoh respons gateway tampil");
  ada(html, "Ambang: perlu diperiksa bila", "ambang dijelaskan");
  ada(html, "0 terbuka", "nilai nol tetap dilaporkan apa adanya");
  ada(html, "Pengaduan nasabah terbuka", "sinyal kedua tampil");
  bersih(html, "daftar sinyal");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render panel BI gagal`);
}
console.log(`PanelBiKesehatan: ${passed} lulus`);
