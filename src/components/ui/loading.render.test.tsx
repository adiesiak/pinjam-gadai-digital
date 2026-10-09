/**
 * Uji kosakata pemuatan PINDAI (`src/components/ui/loading.tsx`).
 * Run: bun src/components/ui/loading.render.test.tsx
 *
 * Dua bagian:
 *  1. **Markup** — setiap bentuk pemuatan membawa janjinya sendiri: rangka
 *     punya `role="status"` + teks untuk pembaca layar, barisnya bertinggi tetap
 *     (`h-14`) supaya isi sungguhan tidak menggeser halaman, dan isi dekoratifnya
 *     `aria-hidden` supaya tidak ada pengumuman ganda.
 *  2. **Batas yang tidak boleh dilanggar** — tidak ada persentase palsu
 *     (`aria-valuenow`/tanda persen), tidak ada `transition-all`, dan animasi
 *     yang dipakai hanya dua yang memang disengaja: `animate-spin` (aktivitas)
 *     serta `motion-bilah` (bilah tak tentu, yang wajib punya opt-out
 *     reduced-motion di CSS).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BilahTakTentu,
  GalatMuat,
  IndikatorSibuk,
  KerangkaAdmin,
  KerangkaRuangPendana,
  MemuatBaris,
  SkeletonBarisDaftar,
  SkeletonDetail,
  SkeletonKartu,
  SkeletonTabel,
} from "@/components/ui/loading";

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
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const jumlah = (html: string, pola: RegExp) => (html.match(pola) ?? []).length;

const baca = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), "utf8");

// ===== 1. Markup =====
const barisDaftar = render(<SkeletonBarisDaftar baris={2} />);
ada(barisDaftar, 'role="status"', "rangka daftar adalah wilayah status");
ada(barisDaftar, "Memuat daftar…", "rangka daftar menjelaskan dirinya");
ada(barisDaftar, 'aria-hidden="true"', "isi rangka daftar disembunyikan dari pembaca layar");
ok(jumlah(barisDaftar, /animate-pulse/g) >= 6, "rangka daftar berisi baris berdenyut");

const kartu = render(<SkeletonKartu />);
ada(kartu, 'aria-hidden="true"', "kartu rangka bersifat dekoratif");
ok(jumlah(kartu, /animate-pulse/g) >= 3, "kartu rangka punya isi berdenyut");

const tabel = render(<SkeletonTabel kolom={4} baris={3} keterangan="Memuat tabel pengajuan…" />);
ada(tabel, "Memuat tabel pengajuan…", "tabel rangka menjelaskan dirinya");
ada(tabel, "h-14", "baris tabel rangka bertinggi TETAP (anti layout shift)");
ada(tabel, "grid-template-columns:repeat(4", "jumlah kolom rangka mengikuti permintaan");
ok(jumlah(tabel, /animate-pulse/g) >= 4, "tabel rangka berisi sel berdenyut");
ok(jumlah(tabel, /h-14/g) === 3, "jumlah baris tabel rangka sesuai permintaan");

const detail = render(<SkeletonDetail baris={4} keterangan="Memuat rincian pinjaman…" />);
ada(detail, "Memuat rincian pinjaman…", "rincian rangka menjelaskan dirinya");
ada(detail, "divide-y", "rincian rangka memakai baris bergaris seperti isinya");
ok(jumlah(detail, /py-3/g) === 4, "jumlah baris rincian rangka sesuai permintaan");

const baris = render(<MemuatBaris teks="Memuat berkas…" />);
ada(baris, 'role="status"', "baris pemuatan adalah wilayah status");
ada(baris, "Memuat berkas…", "teks baris pemuatan tampil");
ada(baris, 'aria-hidden="true"', "pemintal baris pemuatan bersifat dekoratif");
tidakAda(baris, 'aria-label="Memuat"', "tidak ada pengumuman \"Memuat\" ganda");

const sibuk = render(<IndikatorSibuk />);
ada(sibuk, "Menyegarkan…", "indikator sibuk menjelaskan dirinya untuk pembaca layar");
ada(sibuk, 'aria-hidden="true"', "pemintal indikator sibuk bersifat dekoratif");
tidakAda(sibuk, 'role="status"', "penyegaran rutin tidak mengumumkan apa pun");

const bilah = render(<BilahTakTentu label="Mengunggah berkas…" />);
ada(bilah, 'role="progressbar"', "bilah tak tentu adalah progressbar");
ada(bilah, "Mengunggah berkas…", "label bilah tampil dan diumumkan");
ada(bilah, "motion-bilah", "bilah memakai kelas animasi bersama");
tidakAda(bilah, "aria-valuenow", "bilah TAK TENTU tanpa nilai angka");
tidakAda(bilah, "%", "tidak ada persentase sama sekali di bilah");

const galat = render(<GalatMuat pesan="Catatan gagal dimuat." onCoba={() => {}} />);
ada(galat, 'role="alert"', "galat diumumkan sebagai alert");
ada(galat, "Catatan gagal dimuat.", "pesan galat tampil");
ada(galat, "Coba lagi", "tombol coba lagi tersedia");
const galatTanpaTombol = render(<GalatMuat pesan="Tidak ada jalan ulang." />);
tidakAda(galatTanpaTombol, "Coba lagi", "tanpa pengulang tidak ada tombol palsu");

const kerangkaAdmin = render(<KerangkaAdmin />);
ada(kerangkaAdmin, "Memuat panel operasional…", "rangka admin menjelaskan dirinya");
ada(kerangkaAdmin, "sm:h-16", "bilah atas rangka admin setinggi header aslinya");
ada(kerangkaAdmin, 'aria-hidden="true"', "isi rangka admin dekoratif");
ok(jumlah(kerangkaAdmin, /sm:grid-cols-3/g) >= 1, "kartu statistik rangka memakai kisi aslinya");

const kerangkaPendana = render(<KerangkaRuangPendana />);
ada(kerangkaPendana, "Memuat catatan pengajuan…", "rangka pendana menjelaskan dirinya");
ada(kerangkaPendana, "bg-navy", "panel judul rangka pendana meniru panel aslinya");
ada(kerangkaPendana, "grid-cols-2", "baris angka rangka pendana punya kisi");

// ===== 2. Batas yang tidak boleh dilanggar =====
// Komentar menjelaskan aturannya sendiri, jadi prosa dibuang lebih dulu supaya
// pemeriksaan ini benar-benar membaca kode.
const modul = baca("src/components/ui/loading.tsx")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
tidakAda(modul, "transition-all", "tidak memakai transisi menyeluruh");
tidakAda(modul, "aria-valuenow", "tidak ada nilai progres yang dikarang");
ok(!/aria-valuetext="\d/.test(modul), "tidak ada teks nilai progres berangka");
ok(!/\d+\s*%/.test(modul), "tidak ada persen hardcode di kode pemuatan");
ok(
  !/bg-\[linear-gradient|conic-gradient/.test(modul),
  "tidak ada cincin progres dekoratif yang menyamar sebagai progres nyata",
);

// Hanya dua animasi yang diizinkan: pemintal (aktivitas) dan `animate-masuk`
// (kemunculan panel yang sudah punya opt-out reduced-motion di index.css).
const animasi = [...new Set(modul.match(/\banimate-[a-z][a-z-]*/g) ?? [])].sort();
const DIIZINKAN = ["animate-masuk", "animate-spin"];
ok(
  animasi.every((a) => DIIZINKAN.includes(a)),
  `hanya animasi yang disengaja dipakai (dapat: ${animasi.join(", ") || "—"})`,
);
ada(modul, "motion-bilah", "bilah tak tentu memakai kelas animasi bersama");

// Kelas `motion-bilah` wajib dimatikan saat pengunjung meminta gerak dikurangi.
const css = baca("src/index.css");
const blokReduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
ada(blokReduce, ".motion-bilah", "reduce: bilah tak tentu berhenti bergerak");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`loading: ${passed} lulus`);
