/**
 * Run: bun src/components/admin/PratinjauAktifPanel.render.test.tsx
 *
 * Uji render kartu "Pratinjau Aktif" lewat react-dom/server. Kartu ini jaring
 * pengaman fitur "masuk sebagai": tiap pratinjau yang masih hidup harus
 * menyebut SIAPA membuka akun SIAPA, sejak kapan, sampai kapan, dan menyediakan
 * tombol untuk mengakhirinya. Keadaan kosong pun harus menjelaskan bahwa
 * pratinjau berakhir sendiri, bukan sekadar memperlihatkan ruang kosong.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { DaftarPratinjauAktif, type BarisPratinjauAktif } from "./PratinjauAktifPanel";

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

const mulai = new Date("2026-10-16T07:15:00+07:00").getTime();
const baris = (o: Partial<BarisPratinjauAktif> = {}): BarisPratinjauAktif => ({
  id: "pratinjauSesi_1",
  adminLabel: "admin@pindai.test",
  targetLabel: "Robert Tanaya",
  targetPeran: "dana",
  mulai,
  berlakuHingga: mulai + 2 * 60 * 60 * 1000,
  alasan: null,
  ...o,
});

const tanpaAksi = () => {};

// ===== 1. Keadaan memuat =====
{
  const html = renderToStaticMarkup(
    <DaftarPratinjauAktif baris={undefined} busy={null} onAkhiri={tanpaAksi} />,
  );
  ada(html, "Pratinjau Aktif", "judul kartu");
  ok(!/\d+ berjalan/.test(html), "lencana jumlah tidak tampil saat memuat");
  bersih(html, "kartu memuat");
}

// ===== 2. Kosong =====
{
  const html = renderToStaticMarkup(
    <DaftarPratinjauAktif baris={[]} busy={null} onAkhiri={tanpaAksi} />,
  );
  ada(html, "Tidak ada pratinjau berjalan", "keadaan kosong dijelaskan");
  ada(html, "berakhir sendiri", "batas waktu pratinjau disebut");
  bersih(html, "kartu kosong");
}

// ===== 3. Ada pratinjau berjalan =====
{
  const html = renderToStaticMarkup(
    <DaftarPratinjauAktif
      baris={[
        baris({ alasan: "memeriksa keluhan saldo" }),
        baris({
          id: "pratinjauSesi_2",
          adminLabel: "admin2@pindai.test",
          targetLabel: "Rani Puspita",
          targetPeran: "peminjam",
        }),
      ]}
      busy={null}
      onAkhiri={tanpaAksi}
    />,
  );
  ada(html, "2 berjalan", "lencana jumlah pratinjau");
  ada(html, "admin@pindai.test", "admin pembuka tampil");
  ada(html, "Robert Tanaya", "akun pendana yang dibuka tampil");
  ada(html, "Peran pendana", "peran akun diterjemahkan");
  ada(html, "Peran peminjam", "peran peminjam tampil");
  ada(html, "Alasan: memeriksa keluhan saldo", "alasan pratinjau tampil");
  ada(html, "Akhiri pratinjau", "tombol mengakhiri tersedia");
  bersih(html, "kartu terisi");
}

// ===== 4. Sedang mengakhiri: tombol nonaktif =====
{
  const html = renderToStaticMarkup(
    <DaftarPratinjauAktif baris={[baris()]} busy="pratinjauSesi_1" onAkhiri={tanpaAksi} />,
  );
  ada(html, "disabled", "tombol nonaktif saat proses berjalan");
  bersih(html, "kartu sibuk");
}

console.log(`\nPratinjauAktifPanel.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
