/**
 * Run: bun src/components/admin/PemulihanJejakPratinjauPanel.render.test.tsx
 *
 * Uji render kartu "Pemulihan jejak pratinjau" lewat react-dom/server. Kartu
 * ini menulis data lokasi nasabah, jadi yang dipastikan: langkah kering
 * dijelaskan sebagai perkiraan, tombol tulis tidak aktif sebelum ada dampak
 * yang terukur, dan hasil kosong tidak tampil seperti kegagalan.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  KartuPemulihanJejak,
  type HasilPemulihanJejak,
} from "./PemulihanJejakPratinjauPanel";

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

const tanpaAksi = () => {};

const hasil = (o: Partial<HasilPemulihanJejak> = {}): HasilPemulihanJejak => ({
  kering: true,
  jumlahTarget: 2,
  titikDikecualikan: 5,
  statusDipulihkan: 1,
  statusDihapus: 1,
  target: [
    {
      userId: "users_1",
      label: "Rani Puspita",
      titikDikecualikan: 3,
      status: "dipulihkan",
      sumberStatus: "jejak",
      statusLama: { lat: -7.5, lng: 110.4, waktu: Date.now() },
      statusBaru: { lat: -6.2, lng: 106.8, waktu: Date.now() - 3_600_000 },
    },
    {
      userId: "users_2",
      label: "Hasbi Sukmanda",
      titikDikecualikan: 2,
      status: "dihapus",
      sumberStatus: null,
      statusLama: null,
      statusBaru: null,
    },
  ],
  ...o,
});

// ===== 1. Belum diperiksa =====
{
  const html = renderToStaticMarkup(
    <KartuPemulihanJejak
      hasil={null}
      busy={false}
      onPeriksa={tanpaAksi}
      onTerapkan={tanpaAksi}
    />,
  );
  ada(html, "Pemulihan jejak pratinjau", "judul kartu");
  ada(html, "Periksa dampak", "tombol periksa tersedia");
  ada(html, "Periksa dulu", "langkah pertama dijelaskan");
  ada(html, "tidak mengubah data", "sifat pemeriksaan dijelaskan");
  ok(html.includes("disabled"), "tombol terapkan nonaktif sebelum ada dampak");
  bersih(html, "kartu awal");
}

// ===== 2. Hasil pemeriksaan kering =====
{
  const html = renderToStaticMarkup(
    <KartuPemulihanJejak
      hasil={hasil()}
      busy={false}
      onPeriksa={tanpaAksi}
      onTerapkan={tanpaAksi}
    />,
  );
  ada(html, "Perkiraan dampak", "hasil kering disebut perkiraan");
  ada(html, "2 akun", "jumlah akun tampil");
  ada(html, "5 titik", "jumlah titik tampil");
  ada(html, "Rani Puspita", "akun terdampak tampil");
  ada(html, "jejak sebelum pratinjau", "sumber pemulihan dijelaskan");
  ada(html, "tidak ada titik asli", "akun tanpa titik asli dijelaskan");
  ada(html, "Terapkan pemulihan", "tombol terapkan tersedia");
  bersih(html, "kartu kering");
}

// ===== 3. Tidak ada dampak =====
{
  const html = renderToStaticMarkup(
    <KartuPemulihanJejak
      hasil={hasil({ jumlahTarget: 0, titikDikecualikan: 0, statusDipulihkan: 0, statusDihapus: 0, target: [] })}
      busy={false}
      onPeriksa={tanpaAksi}
      onTerapkan={tanpaAksi}
    />,
  );
  ada(html, "Tidak ada jejak pratinjau yang perlu dipulihkan", "keadaan bersih");
  ok(html.includes("disabled"), "tombol terapkan nonaktif saat tidak ada dampak");
  bersih(html, "kartu kosong");
}

// ===== 4. Sudah diterapkan =====
{
  const html = renderToStaticMarkup(
    <KartuPemulihanJejak
      hasil={hasil({ kering: false })}
      busy={false}
      onPeriksa={tanpaAksi}
      onTerapkan={tanpaAksi}
    />,
  );
  ada(html, "Sudah dipulihkan", "hasil penerapan disebut");
  ada(html, "Pemulihan diterapkan", "lencana penerapan tampil");
  bersih(html, "kartu terterap");
}

// ===== 5. Sedang berjalan =====
{
  const html = renderToStaticMarkup(
    <KartuPemulihanJejak
      hasil={hasil()}
      busy
      onPeriksa={tanpaAksi}
      onTerapkan={tanpaAksi}
    />,
  );
  ada(html, "disabled", "tombol nonaktif saat proses berjalan");
  bersih(html, "kartu sibuk");
}

console.log(`\nPemulihanJejakPratinjauPanel.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
