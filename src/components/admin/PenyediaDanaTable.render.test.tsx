/**
 * Run: bun src/components/admin/PenyediaDanaTable.render.test.tsx
 *
 * Uji render tabel "Daftar Akun Pendana & Pemantau" lewat react-dom/server
 * (tanpa DOM, tanpa browser): memastikan peran ([Pendana] / [Pengamat] /
 * warisan), lencana status, avatar inisial, dan sakelar akses tampil benar —
 * termasuk akun pemantau bersama yang sengaja TIDAK punya sakelar. Ini
 * satu-satunya "jendela" ke tampilan tab Nasabah & Pendana di lingkungan tanpa
 * browser.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { TabelAkunPendana, type BarisAkunTampil } from "./PenyediaDanaTable";

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

const baris = (o: Partial<BarisAkunTampil> = {}): BarisAkunTampil => ({
  userId: "users_1",
  nama: "Rani Puspita",
  email: "rani@pindai.test",
  peran: "dana",
  peranLegacy: false,
  akunBersama: false,
  aksesAktif: true,
  ...o,
});

const tanpaUbah = () => {};

// ===== 1. Keadaan memuat =====
{
  const html = renderToStaticMarkup(
    <TabelAkunPendana baris={undefined} busy={null} onUbahAkses={tanpaUbah} />,
  );
  ada(html, "Daftar Akun Pendana &amp; Pemantau", "judul tabel");
  ok(!html.includes(" akun · "), "lencana jumlah tidak tampil saat memuat");
  bersih(html, "tabel memuat");
}

// ===== 2. Tabel terisi: pendana aktif, pemantau bersama, warisan =====
{
  const html = renderToStaticMarkup(
    <TabelAkunPendana
      baris={[
        baris(),
        baris({
          userId: "users_2",
          nama: "Pemantau bersama",
          email: null,
          peran: "pengamat",
          akunBersama: true,
          aksesAktif: false,
        }),
        baris({
          userId: "users_3",
          nama: "Budi Lama",
          email: "budi@pindai.test",
          peran: "pendana",
          peranLegacy: true,
          aksesAktif: false,
        }),
      ]}
      busy={null}
      onUbahAkses={tanpaUbah}
    />,
  );
  ada(html, "3 akun · 1 aktif", "lencana jumlah akun & akses");
  ada(html, "RP", "avatar inisial dua huruf");
  ada(html, "rani@pindai.test", "email tampil");
  ada(html, "Pendana", "peran pendana tampil");
  ada(html, "Pengamat", "peran pengamat tampil");
  ada(html, "Pendana (lama)", "peran warisan ditandai");
  ada(html, "Aktif", "status aktif tampil");
  ada(html, "Nonaktif", "status nonaktif tampil");
  ada(html, "via kode bersama", "pemantau bersama tanpa sakelar");
  ada(html, "Cabut akses untuk Rani Puspita", "sakelar aktif berlabel cabut");
  ada(html, "Beri akses untuk Budi Lama", "sakelar nonaktif berlabel beri");
  ok(html.includes('role="switch"'), "sakelar akses dirender");
  bersih(html, "tabel terisi");
}

// ===== 3. Kosong =====
{
  const html = renderToStaticMarkup(
    <TabelAkunPendana baris={[]} busy={null} onUbahAkses={tanpaUbah} />,
  );
  ada(html, "0 akun · 0 aktif", "lencana nol");
  ada(html, "Belum ada akun pendana atau pemantau", "pesan kosong tampil");
  bersih(html, "tabel kosong");
}

// ===== 4. Kolom Tindakan: hanya dirender bila pemanggil menyediakannya =====
{
  const html = renderToStaticMarkup(
    <TabelAkunPendana baris={[baris()]} busy={null} onUbahAkses={tanpaUbah} />,
  );
  ok(!html.includes("Tindakan"), "kolom tindakan tidak muncul tanpa renderAksi");
  bersih(html, "tabel tanpa kolom tindakan");
}

{
  const html = renderToStaticMarkup(
    <TabelAkunPendana
      baris={[
        baris(),
        baris({
          userId: "users_2",
          nama: "Pemantau bersama",
          email: null,
          peran: "pengamat",
          akunBersama: true,
          aksesAktif: false,
        }),
      ]}
      busy={null}
      onUbahAkses={tanpaUbah}
      renderAksi={(r) =>
        r.akunBersama ? (
          <span>tanpa tindakan</span>
        ) : (
          <span>{`aksi-${r.userId}`}</span>
        )
      }
    />,
  );
  ada(html, "Tindakan", "kolom tindakan muncul saat renderAksi diberikan");
  ada(html, "aksi-users_1", "tindakan dirender per baris pendana");
  ada(html, "tanpa tindakan", "pemantau bersama tanpa tindakan");
  bersih(html, "tabel dengan kolom tindakan");
}

console.log(`\nPenyediaDanaTable.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
