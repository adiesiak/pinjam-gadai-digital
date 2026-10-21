/** Run: bun src/lib/promoPosters.test.ts */
import {
  KATEGORI_POSTER,
  SHARE_TEKS,
  TAGLINE,
  kategoriTerpakai,
  promoPosters,
  promoPostersAktif,
  promoPostersDenganTarif,
  tautanPoster,
} from "./promoPosters";
import { quoteLoan } from "./loan";
import { formatRupiah } from "./money";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}
function ok(condition: boolean, label: string): void {
  eq(condition, true, label);
}

const ids = [
  "pinjaman",
  "gadai",
  "kredit",
  "cara-kerja",
  "biaya",
  "keamanan",
  "faq",
  "trust",
  "cta",
];
eq(promoPosters.length, ids.length, "sembilan poster didefinisikan");
eq(promoPostersAktif().length, ids.length, "semua poster aktif");
eq(
  promoPosters.map((p) => p.id).join("|"),
  ids.join("|"),
  "urutan poster sesuai katalog",
);
eq(new Set(promoPosters.map((p) => p.id)).size, ids.length, "id poster unik");
eq(
  new Set(promoPosters.map((p) => p.file)).size,
  ids.length,
  "nama berkas unik",
);
eq(
  promoPostersAktif()
    .map((p) => p.order)
    .join(","),
  "1,2,3,4,5,6,7,8,9",
  "urutan aktif berkesinambungan",
);

for (const poster of promoPosters) {
  ok(poster.title.trim().length > 0, `${poster.id}: judul terisi`);
  ok(poster.badge.trim().length > 0, `${poster.id}: badge terisi`);
  ok(poster.headline.trim().length > 0, `${poster.id}: headline terisi`);
  ok(poster.cta.trim().length > 0, `${poster.id}: CTA terisi`);
  ok(poster.disclaimer.trim().length > 0, `${poster.id}: disclaimer terisi`);
  ok(poster.enabled, `${poster.id}: aktif`);
  eq(
    poster.nomor,
    String(poster.order).padStart(2, "0"),
    `${poster.id}: nomor sesuai urutan`,
  );
}

const kategoriPoster = KATEGORI_POSTER.filter((item) => item !== "Semua");
for (const poster of promoPosters) {
  ok(
    kategoriPoster.includes(poster.category),
    `${poster.id}: kategori dikenal`,
  );
}
eq(kategoriTerpakai().length, 6, "enam kategori dipakai");
for (const kategori of kategoriPoster) {
  ok(kategoriTerpakai().includes(kategori), `kategori ${kategori} dipakai`);
}

eq(TAGLINE, "PINJAM • GADAI DIGITAL", "tagline PINDAI");
eq(SHARE_TEKS, "Kenali PINDAI: Pinjam & Gadai Digital.", "teks berbagi PINDAI");
const copySemua = JSON.stringify(promoPosters).toLowerCase();
for (const klaim of [
  "pasti cair",
  "pasti disetujui",
  "tanpa risiko",
  "dijamin untung",
  "100% aman",
  "tanpa biaya",
]) {
  ok(!copySemua.includes(klaim), `tidak memuat klaim “${klaim}”`);
}
ok(!copySemua.includes("investor"), "istilah produk Pendana tetap dipakai");

eq(
  promoPosters.map((poster) => poster.file).join("|"),
  ids.map((id) => `pindai-${id}.png`).join("|"),
  "nama berkas poster sesuai id",
);

const contoh = quoteLoan(500_000);
const posterBiaya = promoPosters.find((poster) => poster.id === "biaya");
eq(
  posterBiaya?.items?.map((item) => item.teks).join("|"),
  [contoh.pokok, contoh.biayaAdmin, contoh.totalKewajibanPelunasan]
    .map(formatRupiah)
    .join("|"),
  "rincian biaya dihasilkan oleh kalkulator pinjaman",
);
eq(posterBiaya?.pemisah?.join(""), "+=", "pemisah contoh biaya");
ok(
  posterBiaya?.catatan?.includes(formatRupiah(contoh.pokok)) ?? false,
  "catatan menyebut nominal yang dihitung",
);

// Poster biaya juga materi kampanye: saat admin mengubah tarif, angka pada
// poster harus ikut, bukan tertinggal di 2% bawaan.
const posterTarif = promoPostersDenganTarif({
  adminPersen: 4,
  asuransiPersen: 1,
  ekspres: { tier1: 9_000, tier2: 9_000, tier3: 9_000 },
}).find((poster) => poster.id === "biaya");
eq(
  posterTarif?.items?.[1]?.teks,
  formatRupiah(20_000),
  "poster biaya memakai persen admin yang berlaku",
);
ok(
  posterTarif?.catatan?.includes("admin 4% + asuransi 1% + ekspres") ?? false,
  "catatan poster menyebut seluruh potongan yang berlaku",
);
eq(
  promoPostersDenganTarif().length,
  promoPosters.length,
  "semua poster tetap ada saat tarif diteruskan",
);

eq(
  promoPosters.find((poster) => poster.id === "kredit")?.features[0],
  "Simulasi mengikuti fungsi hitung aplikasi",
  "poster kredit mengarahkan ke simulasi aplikasi",
);
eq(
  promoPosters.find((poster) => poster.id === "cara-kerja")?.items?.length,
  3,
  "poster alur mengikuti tindakan yang dicantumkan",
);
eq(
  promoPosters.find((poster) => poster.id === "faq")?.items?.length,
  4,
  "poster informasi memuat empat pertanyaan",
);
eq(
  promoPosters.find((poster) => poster.id === "trust")?.tautan?.length,
  4,
  "poster brand mencantumkan empat tautan kebijakan",
);
eq(
  promoPosters.find((poster) => poster.id === "trust")?.items?.length,
  4,
  "poster brand memuat empat pilar",
);
eq(
  promoPosters.find((poster) => poster.id === "cta")?.layanan?.join("/"),
  "PINJAMAN/GADAI/KREDIT",
  "poster penutup mencantumkan layanan",
);
eq(
  tautanPoster("pinjaman", "https://contoh.id/promo"),
  "https://contoh.id/promo?poster=pinjaman",
  "tautan poster menyertakan id pilihan",
);

console.log(`promoPosters: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
