/**
 * Uji render seksi promo di landing page (`PromoSection`).
 * Run: bun src/pages/LandingPromo.render.test.tsx
 *
 * Dirender lewat react-dom/server (tanpa DOM, tanpa browser). Uji ini menjaga
 * dua hal sekaligus:
 *  1. Seksi promo benar-benar ada di landing dan MENGARAHKAN ke /promo — CTA
 *     dan setiap kartu poster memakai tautan `/promo`, dan label CTA berubah
 *     jujur sesuai status masuk (rute itu ada di balik RequireAuth).
 *  2. Isinya berasal dari data kampanye, bukan angka yang ditulis ulang di sini:
 *     tiga poster pertama `promoPostersAktif()` muncul lengkap, poster keempat
 *     tidak, dan jumlah poster di keterangan mengikuti data.
 * Geraknya ikut dijaga: setiap kartu poster tercetak dalam keadaan awal
 * tersembunyi (`opacity:0` + geser), sehingga browser menganimasikannya masuk.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { promoPostersAktif } from "@/lib/promoPosters";

import { PromoSection } from "./Landing";

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
function jumlah(html: string, teks: string): number {
  return html.split(teks).length - 1;
}
/** Teks untuk dibandingkan dengan markup: React meloloskan & < > ". */
function esc(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const poster = promoPostersAktif();
const contoh = poster.slice(0, 3);
const keempat = poster[3];

function render(sudahMasuk: boolean): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <PromoSection sudahMasuk={sudahMasuk} />
    </MemoryRouter>,
  );
}

const tamu = render(false);
const masuk = render(true);

// ===== Seksi promo ada di landing =====
ada(tamu, 'id="promo"', "seksi promo punya jangkar sendiri");
ada(tamu, "Materi kampanye", "eyebrow seksi promo");
ada(tamu, "Poster promo siap dibagikan", "judul seksi promo");
ada(
  tamu,
  `${poster.length} poster berukuran 1080 × 1350 px`,
  "keterangan menyebut jumlah poster dari data",
);
ada(tamu, "PNG 1080 × 1350", "poin ukuran berkas");
ada(tamu, "Identitas PINDAI", "poin identitas visual");
ada(tamu, "Tanpa klaim berlebihan", "poin batas klaim");
ada(tamu, `Contoh ${contoh.length} dari ${poster.length} poster`, "keterangan tumpukan poster");

// ===== Semua tautan mengarah ke /promo =====
// Tiga kartu poster + satu tombol CTA = empat tautan.
ok(
  jumlah(tamu, 'href="/promo"') === contoh.length + 1,
  `setiap kartu poster dan CTA menautkan /promo (${contoh.length + 1})`,
);

for (const p of contoh) {
  const judul = esc(p.title);
  ada(tamu, `aria-label="Buka poster ${judul} di pusat materi promo"`, `kartu "${p.title}" menautkan /promo`);
  ada(tamu, `>${esc(p.nomor)}</span>`, `nomor poster "${p.nomor}" tampil`);
  ada(tamu, esc(p.badge), `lencana poster "${p.badge}" tampil`);
  ada(tamu, esc(p.headline), `headline poster "${p.title}" tampil`);
  ada(tamu, esc(p.description), `keterangan poster "${p.title}" tampil`);
}
ok(
  keempat !== undefined && !tamu.includes(esc(keempat.title)),
  `seksi menampilkan ${contoh.length} contoh saja, bukan seluruh galeri`,
);

// ===== CTA jujur soal akun =====
ada(tamu, "Masuk untuk membuka poster", "pengunjung belum masuk diarahkan masuk dulu");
ada(
  tamu,
  "Halaman promo perlu akun PINDAI; Anda akan diminta masuk lebih dulu.",
  "keterangan bahwa /promo perlu akun",
);
ada(masuk, "Buka pusat materi promo", "pengguna yang sudah masuk melihat CTA langsung");
ok(
  !masuk.includes("Masuk untuk membuka poster"),
  "CTA pengguna yang sudah masuk tidak menyuruh masuk lagi",
);

// ===== Gerak: keadaan awal tersembunyi tercetak =====
ok(
  jumlah(tamu, "opacity:0;transform:translateY(30px)") === contoh.length,
  `setiap kartu poster tercetak tersembunyi (${contoh.length})`,
);
ok(
  jumlah(tamu, "opacity:0;transform:translateX(-12px)") === 3,
  "tiga poin promo muncul berurutan",
);
ada(tamu, "opacity:0;transform:translateY(22px)", "judul seksi direveal saat masuk viewport");

bersih(tamu, "markup seksi promo (pengunjung)");
bersih(masuk, "markup seksi promo (sudah masuk)");

console.log(`LandingPromo.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
