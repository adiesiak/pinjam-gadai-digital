/**
 * Uji render kartu "Persetujuan risiko pendana" di ruang pendana.
 * Run: bun src/components/penyediaDana/PersetujuanRisikoPendana.render.test.tsx
 *
 * Yang dijaga:
 *  - sebelum disetujui, kalimat pernyataan tampil UTUH dan tombol setuju terkunci
 *    sampai kotak centang dicentang — persetujuan tidak boleh bisa dikirim
 *    sebagai formalitas yang tak dibaca;
 *  - sesudah disetujui, yang tampil hanya versi + waktu + peran, dan tombol
 *    setuju tidak ada lagi (tidak ada ajakan menyetujui ulang versi yang sama);
 *  - admin tidak mencatat persetujuan, jadi kartunya tidak dirender untuk admin.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { PersetujuanRisikoPendana } from "./PersetujuanRisikoPendana";
import { statusPersetujuan } from "../../lib/persetujuanRisiko";
import { PERNYATAAN_PERSETUJUAN } from "../../lib/teksRisikoPendanaan";

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
/**
 * Markup tanpa komentar pemisah React (`<!-- -->`).
 *
 * Kalimat yang disusun dari teks + nilai ("Versi 1") dirender sebagai beberapa
 * simpul teks yang dipisah komentar, jadi tanpa langkah ini pemeriksaan
 * `includes("Versi 1")` gagal walau layarnya benar.
 */
function tanpaKomentar(html: string): string {
  return html.replace(/<!-- -->/g, "");
}
/** Potongan markup tombol "Saya menyetujui" — untuk memeriksa keadaannya. */
function tombolSetuju(html: string): string {
  const label = "Saya menyetujui";
  const akhir = html.indexOf(label);
  if (akhir === -1) return "";
  const mulai = html.lastIndexOf("<button", akhir);
  return mulai === -1 ? "" : html.slice(mulai, akhir + label.length);
}

const WAKTU = 1_775_000_000_000; // awal 2026 — tahunnya dipakai memastikan waktu tampil
const dasar = {
  peran: "dana",
  bolehSetuju: true,
  menyimpan: false,
  galat: null,
  onSetuju: () => {},
};

// ===== Belum menyetujui versi yang berlaku =====
const belum = tanpaKomentar(
  renderToStaticMarkup(
    <PersetujuanRisikoPendana
      {...dasar}
      status={statusPersetujuan({ versiBerlaku: 1, riwayat: [] })}
    />,
  ),
);
ada(belum, PERNYATAAN_PERSETUJUAN, "kalimat pernyataan tampil utuh");
ada(belum, "(versi 1)", "versi teks yang berlaku disebut");
ada(belum, 'role="checkbox"', "ada kotak centang");
ada(belum, "#risiko-pendanaan", "ada tautan kembali ke panel risiko");
ada(belum, "disimpan di server atas nama akun Anda", "tempat penyimpanan catatan dinyatakan");
ok(belum.includes("Saya menyetujui"), "tombol setuju ada");
ok(tombolSetuju(belum).includes("disabled"), "tombol setuju terkunci sebelum dicentang");
bersih(belum, "markup belum menyetujui");

// ===== Sudah menyetujui versi yang berlaku =====
const sudah = tanpaKomentar(
  renderToStaticMarkup(
    <PersetujuanRisikoPendana
      {...dasar}
      status={statusPersetujuan({
        versiBerlaku: 1,
        riwayat: [{ versiTeks: 1, peran: "dana", disetujuiPada: WAKTU }],
      })}
    />,
  ),
);
ada(sudah, "Persetujuan risiko tercatat", "judul keadaan tercatat");
ada(sudah, "Versi 1 · tercatat", "versi yang disetujui dan waktunya disebut");
ada(sudah, "2026", "waktu persetujuan tampil");
ada(sudah, "Penyedia dana", "peran saat menyetujui tampil");
ada(sudah, "bukan bukti transfer", "catatan bukan bukti transfer dinyatakan");
ok(!sudah.includes("Saya menyetujui"), "tanpa tombol setuju saat sudah tercatat");
ok(!sudah.includes('role="checkbox"'), "tanpa kotak centang saat sudah tercatat");
ok(!sudah.includes("Riwayat persetujuan"), "satu versi tidak perlu daftar riwayat");
bersih(sudah, "markup sudah menyetujui");

// ===== Versi teks naik: versi lama tetap terbaca, ajakan menyetujui kembali =====
const naik = tanpaKomentar(
  renderToStaticMarkup(
    <PersetujuanRisikoPendana
      {...dasar}
      status={statusPersetujuan({
        versiBerlaku: 2,
        riwayat: [{ versiTeks: 1, peran: "dana", disetujuiPada: WAKTU }],
      })}
    />,
  ),
);
ada(naik, "(versi 2)", "versi baru menjadi patokan");
ok(naik.includes("Saya menyetujui"), "versi baru meminta persetujuan lagi");
ada(naik, "belum tercatat atas nama akun Anda", "keadaan belum tercatat dinyatakan");
bersih(naik, "markup versi baru");

const riwayatDua = tanpaKomentar(
  renderToStaticMarkup(
    <PersetujuanRisikoPendana
      {...dasar}
      status={statusPersetujuan({
        versiBerlaku: 2,
        riwayat: [
          { versiTeks: 1, peran: "dana", disetujuiPada: WAKTU - 86_400_000 },
          { versiTeks: 2, peran: "dana", disetujuiPada: WAKTU },
        ],
      })}
    />,
  ),
);
ada(riwayatDua, "Riwayat persetujuan (2)", "riwayat versi lama tetap terbaca");
ada(riwayatDua, "Versi 1 ·", "baris riwayat versi lama");
bersih(riwayatDua, "markup riwayat dua versi");

// ===== Sesi kode akses bersama =====
const pengamat = tanpaKomentar(
  renderToStaticMarkup(
    <PersetujuanRisikoPendana
      {...dasar}
      peran="pengamat"
      status={statusPersetujuan({
        versiBerlaku: 1,
        riwayat: [{ versiTeks: 1, peran: "pengamat", disetujuiPada: WAKTU }],
      })}
    />,
  ),
);
ada(pengamat, "Sesi kode akses bersama", "peran pengamat disebut apa adanya");
bersih(pengamat, "markup pengamat");

// ===== Admin tidak mencatat persetujuan =====
const admin = renderToStaticMarkup(
  <PersetujuanRisikoPendana
    {...dasar}
    bolehSetuju={false}
    peran="admin"
    status={statusPersetujuan({ versiBerlaku: 1, riwayat: [] })}
  />,
);
ok(admin === "", "admin tidak melihat kartu persetujuan");

// ===== Kegagalan server tampil apa adanya =====
const gagal = tanpaKomentar(
  renderToStaticMarkup(
    <PersetujuanRisikoPendana
      {...dasar}
      galat="Teks risiko sudah diperbarui. Muat ulang halaman, baca versi terbaru, lalu setujui kembali."
      status={statusPersetujuan({ versiBerlaku: 1, riwayat: [] })}
    />,
  ),
);
ada(gagal, 'role="alert"', "kegagalan diberitakan sebagai alert");
ada(gagal, "Muat ulang halaman", "pesan kegagalan tampil apa adanya");
bersih(gagal, "markup kegagalan");

console.log(`PersetujuanRisikoPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
