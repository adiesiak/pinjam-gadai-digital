/**
 * Uji render saringan di atas tabel /penyedia-dana.
 * Run: bun src/components/penyediaDana/SaringanPengajuan.render.test.tsx
 *
 * Halaman utuhnya membaca Convex dan memuat peta Leaflet, jadi tidak bisa
 * dirender di luar aplikasi; saringan ini murni, jadi dirender langsung di sini.
 * Yang dijaga dari markup (bukan hanya dari fungsi murninya):
 *  1. Kedua saringan benar-benar ada dan diberi nama untuk pembaca layar.
 *  2. Wajah dropdown menyebut pilihan yang sedang aktif — jebakan Radix yang
 *     sama dengan `PemilihJenisPengajuan`: `<SelectValue />` tanpa children
 *     tampak kosong sampai menunya dibuka.
 *  3. Tombol "Kosongkan filter" hanya muncul saat ada filter aktif.
 *  4. Tab gadai (tanpa kolom pendana) menyembunyikan pilihan pendana.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { samarkanNama } from "@/lib/nama";

import { SEMUA_PENDANA, SaringanPengajuan } from "./SaringanPengajuan";

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

const PILIHAN = ["ASEP FIRMAN HANAFI", "CHARELSOERYA@GMAIL.COM", "ROBERT"];

function render(props: {
  cari?: string;
  pendana?: string;
  tampilkanPendana?: boolean;
  tampil?: number;
  total?: number;
  hanyaReferensi?: boolean;
}): string {
  return renderToStaticMarkup(
    <SaringanPengajuan
      cari={props.cari ?? ""}
      onCari={() => {}}
      pendana={props.pendana ?? ""}
      onPendana={() => {}}
      pilihanPendana={PILIHAN}
      tampilkanPendana={props.tampilkanPendana ?? true}
      tampil={props.tampil ?? 13}
      total={props.total ?? 13}
      onReset={() => {}}
      hanyaReferensi={props.hanyaReferensi === true}
    />,
  );
}

// ===== Tanpa filter =====
const kosong = render({});

ada(kosong, 'aria-label="Saring daftar pengajuan"', "saringan diberi nama untuk pembaca layar");
ada(kosong, "Cari nama peminjam", "label saringan nama");
ada(kosong, 'type="search"', "kolom nama bertipe search");
ada(kosong, 'placeholder="Nama, kode peminjam, atau no. referensi"', "petunjuk kolom nama");
ada(kosong, "Pendana", "label saringan pendana");
ada(kosong, 'aria-label="Pendana"', "trigger pendana diberi nama");
ada(kosong, "Menampilkan 13 dari 13 pengajuan pada tab ini", "jumlah tampil vs total");
ok(
  kosong.includes("Semua pendana"),
  "tanpa pilihan, trigger menyebut \"Semua pendana\"",
);
ok(!kosong.includes("Kosongkan filter"), "tombol kosongkan tidak muncul tanpa filter");
ok(!kosong.includes("filter aktif"), "tanpa filter tidak diklaim sedang menyaring");
bersih(kosong, "markup saringan tanpa filter");

// ===== Filter aktif: wajah dropdown ikut pilihan =====
const tersaring = render({ cari: "fathur", pendana: "ROBERT", tampil: 1, total: 5 });

ada(tersaring, 'value="fathur"', "kata kunci tercetak di kolom nama");
ada(tersaring, "Menampilkan 1 dari 5 pengajuan pada tab ini · filter aktif", "jumlah tersaring");
ada(tersaring, "Kosongkan filter", "tombol kosongkan muncul saat ada filter");
// Wajah trigger harus menyebut pendana yang dipilih, bukan label "semua".
ok(tersaring.includes(">ROBERT<") || tersaring.includes("ROBERT</span>"), "trigger menyebut pendana terpilih");
ok(
  !tersaring.includes(">Semua pendana<") && !tersaring.includes("Semua pendana</span>"),
  "trigger tidak lagi menyebut \"Semua pendana\" saat pendana dipilih",
);

// Nilai sentinel tidak boleh bocor ke layar.
ok(!tersaring.includes(SEMUA_PENDANA), "sentinel tidak tercetak saat pendana dipilih");
ok(!kosong.includes(SEMUA_PENDANA), "sentinel tidak tercetak tanpa pilihan");

// Saringan nama saja (tanpa pendana) juga dihitung sebagai filter aktif.
const cariSaja = render({ cari: "syahril", tampil: 1 });
ada(cariSaja, "filter aktif", "saringan nama saja = filter aktif");
ada(cariSaja, "Kosongkan filter", "saringan nama saja menampilkan tombol kosongkan");
// Spasi saja bukan filter.
const spasiSaja = render({ cari: "   " });
ok(!spasiSaja.includes("Kosongkan filter"), "spasi saja bukan filter aktif");

// ===== Tab gadai: tanpa pilihan pendana =====
const gadai = render({ tampilkanPendana: false });
ok(!gadai.includes('aria-label="Pendana"'), "tab gadai tanpa pilihan pendana");
ada(gadai, "Cari nama peminjam", "tab gadai tetap punya saringan nama");
ada(gadai, "Menampilkan 13 dari 13 pengajuan pada tab ini", "tab gadai tetap menghitung jumlah");

// ===== Pembaca non-admin: cari nomor referensi saja =====
const referensiSaja = render({ hanyaReferensi: true });
ada(referensiSaja, "Cari no. referensi", "label saringan non-admin menyebut nomor referensi");
ada(
  referensiSaja,
  'placeholder="No. referensi pengajuan"',
  "petunjuk saringan non-admin hanya nomor referensi",
);
ok(
  !referensiSaja.includes("Cari nama peminjam"),
  "saringan non-admin tidak menawarkan pencarian nama",
);
bersih(referensiSaja, "markup saringan non-admin");

// ===== Penyamaran label pendana (ruang /penyedia-dana) =====
// Label disamarkan, tetapi NILAI yang dipilih tetap nama asli supaya
// penyaringan datanya tidak ikut berubah.
const tersamar = renderToStaticMarkup(
  <SaringanPengajuan
    cari=""
    onCari={() => {}}
    pendana={PILIHAN[2]}
    onPendana={() => {}}
    pilihanPendana={PILIHAN}
    tampilkanPendana
    tampil={13}
    total={13}
    onReset={() => {}}
    namaTampil={samarkanNama}
  />,
);
ada(tersamar, samarkanNama(PILIHAN[2]), "wajah trigger menyebut pendana terpilih secara tersamar");
ok(
  !tersamar.includes(`>${PILIHAN[2]}<`),
  "nama pendana terpilih tidak tercetak penuh saat penyamaran dipakai",
);
bersih(tersamar, "markup saringan dengan penyamaran");

console.log(`SaringanPengajuan.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
