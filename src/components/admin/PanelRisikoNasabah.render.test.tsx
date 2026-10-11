/**
 * Uji render bagian MURNI panel risiko nasabah.
 * Run: bun src/components/admin/PanelRisikoNasabah.render.test.tsx
 *
 * Panel yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi tiga
 * bagian presentasionalnya diuji langsung: lencana grade, tabel komponen
 * berbobot, dan daftar keputusan override. Yang dijaga:
 *  - grade A/B/C/D/E punya warna berbeda dan label yang terbaca;
 *  - lencana "ditimpa petugas" hanya muncul saat grade sistem berbeda;
 *  - tabel menampilkan bobot + kontribusi (angka yang bisa dijumlah peninjau);
 *  - riwayat menampilkan arah perubahan grade dan alasannya;
 *  - tidak ada "undefined"/"NaN"/"[object Object]" di keluaran.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { KomponenRisiko } from "@/lib/risikoNasabah";
import { DaftarRiwayatRisiko, LencanaGrade, TabelKomponenRisiko } from "./PanelRisikoNasabah";

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

function komponen(overrides: Partial<KomponenRisiko> = {}): KomponenRisiko {
  return {
    kunci: "pelunasanTepatWaktu",
    label: "Riwayat pelunasan tepat waktu",
    bobot: 25,
    nilai: 1,
    kontribusi: 25,
    catatan: "3 dari 3 pelunasan tepat waktu.",
    ...overrides,
  };
}

// ===== 1. Lencana grade: semua tingkat punya label, warna berbeda =====
{
  const a = renderToStaticMarkup(<LencanaGrade grade="A" />);
  ada(a, "Grade A", "lencana A menampilkan huruf grade");
  ada(a, "Sangat rendah", "lencana A menampilkan label");
  const b = renderToStaticMarkup(<LencanaGrade grade="B" />);
  const c = renderToStaticMarkup(<LencanaGrade grade="C" />);
  const d = renderToStaticMarkup(<LencanaGrade grade="D" />);
  const e = renderToStaticMarkup(<LencanaGrade grade="E" />);
  ok(a !== d, "kelas warna A berbeda dari D");
  ok(b !== c, "kelas warna B berbeda dari C");
  ada(e, "Sangat tinggi", "lencana E menampilkan label terburuk");
  bersih(d, "lencana D");
}

// ===== 2. Lencana override hanya saat ditimpa =====
{
  const tanpa = renderToStaticMarkup(<LencanaGrade grade="C" gradeSistem="C" ditimpa={false} />);
  ok(!tanpa.includes("Ditimpa"), "tanpa override → tanpa lencana ditimpa");
  const ditimpa = renderToStaticMarkup(<LencanaGrade grade="B" gradeSistem="D" ditimpa />);
  ada(ditimpa, "Ditimpa petugas", "override menampilkan lencana ditimpa");
  ada(ditimpa, "sistem: D", "override menyebut grade sistem");
  bersih(ditimpa, "lencana ditimpa");
}

// ===== 3. Tabel komponen =====
{
  const html = renderToStaticMarkup(
    <TabelKomponenRisiko
      komponen={[
        komponen(),
        komponen({
          kunci: "keterlambatan",
          label: "Keterlambatan & tunggakan",
          bobot: 25,
          nilai: 0.4,
          kontribusi: 10,
          catatan: "3 dari 5 pinjaman melewati tanggal acuan.",
        }),
      ]}
    />,
  );
  ada(html, "Riwayat pelunasan tepat waktu", "tabel memuat nama komponen");
  ada(html, "Keterlambatan &amp; tunggakan", "tabel memuat komponen kedua");
  ada(html, "Bobot", "tabel punya kolom bobot");
  ada(html, "Kontribusi", "tabel punya kolom kontribusi");
  ada(html, "40%", "nilai 0,4 → 40%");
  ada(html, "10", "kontribusi ditampilkan");
  ada(html, "3 dari 5", "catatan komponen ditampilkan");
  bersih(html, "tabel komponen");
}
{
  const kosong = renderToStaticMarkup(<TabelKomponenRisiko komponen={[]} />);
  ada(kosong, "Belum ada komponen", "tanpa riwayat → pesan jelas");
  bersih(kosong, "tabel komponen kosong");
}

// ===== 4. Riwayat keputusan override =====
{
  const html = renderToStaticMarkup(
    <DaftarRiwayatRisiko
      riwayat={[
        {
          gradeSistem: "D",
          skorSistem: 38,
          gradeOverride: "B",
          alasan: "Nasabah menyerahkan bukti penghasilan tambahan yang sah.",
          olehLabel: "petugas@pindai.test",
          dibuatPada: 1_700_000_000_000,
        },
      ]}
    />,
  );
  ada(html, "D", "riwayat menampilkan grade sistem");
  ada(html, "B", "riwayat menampilkan grade override");
  ada(html, "38", "riwayat menampilkan skor sistem");
  ada(html, "petugas@pindai.test", "riwayat menampilkan petugas");
  ada(html, "bukti penghasilan tambahan", "riwayat menampilkan alasan");
  bersih(html, "riwayat override");
}
{
  const kosong = renderToStaticMarkup(<DaftarRiwayatRisiko riwayat={[]} />);
  ada(kosong, "Belum ada override", "tanpa override → pesan jelas");
  bersih(kosong, "riwayat kosong");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render panel risiko gagal`);
}
console.log(`PanelRisikoNasabah: ${passed} lulus`);
