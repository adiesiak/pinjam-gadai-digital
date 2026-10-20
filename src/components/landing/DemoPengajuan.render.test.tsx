/**
 * Uji render demo alur pengajuan di beranda (`DemoPengajuan`).
 * Run: bun src/components/landing/DemoPengajuan.render.test.tsx
 *
 * Yang dijaga (render statis, tanpa browser):
 *  1. Kelima langkah dan keterangannya ada di markup — demo tidak boleh
 *     bergantung pada JavaScript berjalan agar isinya terbaca.
 *  2. Angka pada layar "Isi nominal dan tenor" sama dengan hasil mesin pinjaman
 *     untuk nominal demo, bukan angka yang ditulis tangan.
 *  3. Tidak ada berkas media eksternal: tidak ada `<video>`, `<iframe>`, atau
 *     `<img>` — demo sepenuhnya kode.
 *  4. Keadaan awal: langkah 01 aktif (`aria-current="step"` sekali), tombol
 *     jeda tersedia, dan tidak ada teks "undefined"/"[object Object]".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { DemoPengajuan, PratinjauLayar } from "@/components/landing/DemoPengajuan";
import { DEMO_POKOK, LANGKAH_DEMO, quoteDemo } from "@/lib/demoPengajuan";
import { formatRupiah } from "@/lib/money";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const markup = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/"]}>
    <DemoPengajuan />
  </MemoryRouter>,
);

const ada = (teks: string, label: string) =>
  ok(markup.includes(teks), `${label} (memuat ${teks})`);

ada("Cara mengajukan pinjaman", "judul bagian tampil");
ok(
  markup.includes('id="demo-pengajuan"') &&
    markup.includes('aria-labelledby="demo-pengajuan-judul"'),
  "bagian punya id dan terhubung ke judulnya",
);

for (const langkah of LANGKAH_DEMO) {
  ada(langkah.judul, `langkah ${langkah.nomor} punya judul`);
  ada(langkah.nomor, `langkah ${langkah.nomor} punya nomor`);
}
ada("Langkah 01 dari 05", "keterangan langkah awal");

const aktif = markup.match(/aria-current="step"/g) ?? [];
ok(aktif.length === 1, "tepat satu langkah ditandai aktif");

// Angka dikunci apa adanya: kalau tarif atau mesin pinjaman berubah, demo ikut
// ditinjau ulang, bukan diam-diam menampilkan angka baru tanpa ada yang sadar.
const q = quoteDemo();
ok(formatRupiah(DEMO_POKOK) === "Rp 500.000", "nominal demo Rp 500.000");
ok(
  formatRupiah(q.totalPotonganDiMuka) === "Rp 10.000",
  "potongan di muka demo Rp 10.000",
);
ok(
  formatRupiah(q.danaBersihDitransfer) === "Rp 490.000",
  "dana bersih demo Rp 490.000",
);
ok(
  formatRupiah(q.totalKewajibanPelunasan) === "Rp 660.000",
  "total kewajiban demo Rp 660.000 (500 ribu, tenor bawaan 14 hari, bunga 32%)",
);

// Setiap layar diuji sendiri: hanya layar aktif yang dirender di markup, jadi
// angka formulir tidak akan pernah muncul di render bagian (langkah 01 aktif).
function layar(id: (typeof LANGKAH_DEMO)[number]["id"]): string {
  const langkah = LANGKAH_DEMO.find((l) => l.id === id);
  if (langkah === undefined) throw new Error(`Langkah demo tidak dikenal: ${id}`);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <PratinjauLayar langkah={langkah} />
    </MemoryRouter>,
  );
}

const formulir = layar("ajukan");
ok(formulir.includes("Rp 490.000"), "dana bersih tampil di layar formulir");
ok(formulir.includes("Rp 660.000"), "total kewajiban tampil di layar formulir");
ok(formulir.includes("Rp 10.000"), "potongan di muka tampil di layar formulir");
ok(
  formulir.includes("bukan persetujuan pinjaman"),
  "layar formulir menyebut ilustrasi, bukan persetujuan",
);

const akun = layar("akun");
ok(akun.includes("Kode 6 angka dari WhatsApp"), "layar akun memakai kode WhatsApp");
ok(!akun.includes("kata sandi yang harus"), "layar akun tidak meminta kata sandi");

const verifikasi = layar("verifikasi");
ok(verifikasi.includes("Selfie dengan KTP"), "layar verifikasi memuat selfie KTP");

const tinjau = layar("tinjau");
ok(
  tinjau.includes("Ditinjau") && tinjau.includes("Disalurkan"),
  "layar tinjau memakai label status aplikasi",
);
ok(tinjau.includes("di luar aplikasi"), "layar tinjau menyebut pencairan di luar aplikasi");

const catatan = layar("catatan");
ok(catatan.includes("Lunas"), "layar catatan menampilkan status lunas");

ok(!markup.includes("<video"), "tidak memakai elemen video");
ok(!markup.includes("<iframe"), "tidak memakai iframe");
ok(!markup.includes("<img"), "tidak memuat berkas gambar");
ada("Contoh layar", "layar ditandai sebagai contoh");
ada("bukan rekaman layar", "demo disebut animasi, bukan rekaman");
ada("Jeda demo", "tombol jeda tersedia");
ok(
  !markup.includes("undefined") && !markup.includes("[object Object]"),
  "tidak ada nilai kosong yang bocor ke markup",
);

console.log(`DemoPengajuan.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
