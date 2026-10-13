/** Run: bun src/lib/promoPosters.test.ts */
import {
  KATEGORI_POSTER,
  SHARE_TEKS,
  TAGLINE,
  kategoriTerpakai,
  promoPosters,
  promoPostersAktif,
  tautanPoster,
} from "./promoPosters";
import { KREDIT_TENOR_PENGAJUAN_OPTIONS } from "./kredit";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
function ok(syarat: boolean, label: string): void {
  eq(syarat, true, label);
}

// ===== 1. Struktur dasar =====
eq(promoPosters.length, 9, "ada 9 poster");
eq(promoPostersAktif().length, 9, "semua poster aktif");
eq(new Set(promoPosters.map((p) => p.id)).size, 9, "id unik");
eq(new Set(promoPosters.map((p) => p.file)).size, 9, "nama file unik");
eq(
  promoPostersAktif()
    .map((p) => p.order)
    .join(","),
  "1,2,3,4,5,6,7,8,9",
  "order 1–9 tanpa duplikat",
);

// ===== 2. Nama file persis sesuai spesifikasi =====
eq(
  promoPosters.map((p) => p.file).join("|"),
  [
    "pindai-pinjaman.png",
    "pindai-gadai.png",
    "pindai-kredit.png",
    "pindai-cara-kerja.png",
    "pindai-biaya.png",
    "pindai-keamanan.png",
    "pindai-faq.png",
    "pindai-trust.png",
    "pindai-cta.png",
  ].join("|"),
  "nama file unduhan sesuai spesifikasi",
);

// ===== 3. Setiap poster punya field wajib =====
for (const p of promoPosters) {
  ok(p.title.trim().length > 0, `${p.id}: title terisi`);
  ok(p.badge.trim().length > 0, `${p.id}: badge terisi`);
  ok(p.headline.trim().length > 0, `${p.id}: headline terisi`);
  ok(p.cta.trim().length > 0, `${p.id}: cta terisi`);
  ok(p.disclaimer.trim().length > 0, `${p.id}: disclaimer terisi`);
  ok(typeof p.description === "string", `${p.id}: description berupa string`);
  ok(Array.isArray(p.features), `${p.id}: features berupa array`);
  ok(p.enabled === true, `${p.id}: aktif`);
  eq(p.nomor, String(p.order).padStart(2, "0"), `${p.id}: nomor = urutan`);
}

// ===== 4. Kategori & filter =====
const kategoriPoster = KATEGORI_POSTER.filter((k) => k !== "Semua");
for (const p of promoPosters) {
  ok(
    kategoriPoster.includes(p.category as (typeof kategoriPoster)[number]),
    `${p.id}: kategori "${p.category}" valid`,
  );
}
eq(kategoriTerpakai().length, 6, "enam kategori terpakai");
for (const k of kategoriPoster) {
  ok(kategoriTerpakai().includes(k), `kategori "${k}" punya poster`);
}

// ===== 5. Larangan klaim (kampanye resmi) =====
const TERLARANG = [
  "pasti cair",
  "pasti disetujui",
  "tanpa risiko",
  "dijamin untung",
  "100% aman",
  "tanpa biaya",
];
const seluruhTeks = JSON.stringify(promoPosters).toLowerCase();
for (const frasa of TERLARANG) {
  ok(!seluruhTeks.includes(frasa), `tidak memuat klaim terlarang: "${frasa}"`);
}
ok(!JSON.stringify(promoPosters).includes("investor"), 'istilah "Pendana" tidak diganti');
ok(SHARE_TEKS === "Kenali PINDAI: Pinjam & Gadai Digital.", "teks share sesuai spesifikasi");
eq(TAGLINE, "PINJAM • GADAI DIGITAL", "tagline resmi");

// ===== 6. Angka mengikuti sistem, bukan hard-coded =====
const kredit = promoPosters.find((p) => p.id === "kredit");
eq(
  kredit?.features[1],
  `Tenor ${KREDIT_TENOR_PENGAJUAN_OPTIONS.join(" / ")} bulan`,
  "tenor kredit diambil dari konstanta produk",
);
const biaya = promoPosters.find((p) => p.id === "biaya");
for (const baris of biaya?.items ?? []) {
  ok(!/\d/.test(baris.teks), `biaya "${baris.judul}" tanpa angka hard-coded`);
}
eq(biaya?.pemisah?.join(""), "+=", "pemisah baris biaya + dan =");
ok(
  (biaya?.catatan ?? "").includes("simulasi"),
  "catatan biaya menyarankan memeriksa simulasi",
);

// ===== 7. Konten spesifik per poster =====
const cari = (id: string) => promoPosters.find((p) => p.id === id);
eq(cari("pinjaman")?.headline, "Dana Cepat,\nTanpa Ribet.", "headline poster 01");
eq(cari("gadai")?.badge, "PUNYA BARANG BERHARGA?", "badge poster 02");
eq(cari("cara-kerja")?.items?.length, 4, "poster 04 punya 4 langkah");
eq(cari("faq")?.items?.length, 4, "poster 07 punya 4 pertanyaan");
eq(cari("trust")?.tautan?.length, 4, "poster 08 punya 4 tautan kebijakan");
eq(cari("trust")?.items?.length, 4, "poster 08 punya 4 pilar");
eq(cari("cta")?.bentuk, "hero", "poster 09 poster hero");
eq(cari("cta")?.layanan?.join("/"), "PINJAMAN/GADAI/KREDIT", "tiga layanan poster 09");
eq(cari("cta")?.subCta, "Pelajari PINDAI", "CTA sekunder poster 09");
eq(cari("cta")?.headline, "Saat Butuh,\nPINDAI Dulu.", "headline poster 09");

// ===== 8. Tautan berbagi =====
eq(
  tautanPoster("pinjaman", "https://contoh.id/promo"),
  "https://contoh.id/promo?poster=pinjaman",
  "tautan poster membawa id",
);

// ===== 9. Teks kampanye persis sesuai spesifikasi =====
const SPESIFIKASI: Record<
  string,
  { badge: string; headline: string; cta: string }
> = {
  pinjaman: {
    badge: "BUTUH DANA?",
    headline: "Dana Cepat,\nTanpa Ribet.",
    cta: "Ajukan Sekarang →",
  },
  gadai: {
    badge: "PUNYA BARANG BERHARGA?",
    headline: "Ubah Barang\nJadi Dana.",
    cta: "Taksir Barang →",
  },
  kredit: {
    badge: "MAU BARANG YANG DIBUTUHKAN?",
    headline: "Bawa Pulang,\nCicil Tenang.",
    cta: "Mulai Cicil →",
  },
  "cara-kerja": {
    badge: "SEMUANYA DIGITAL",
    headline: "Ajukan.\nPeriksa.\nSelesaikan.",
    cta: "Lihat Cara Kerja →",
  },
  biaya: {
    badge: "TRANSPARANSI DI DEPAN",
    headline: "Tahu Biayanya,\nSebelum Memutuskan.",
    cta: "Lihat Kalkulator →",
  },
  keamanan: {
    badge: "KEAMANAN DIGITAL",
    headline: "Data Anda,\nKami Jaga.",
    cta: "Lihat Keamanan →",
  },
  faq: {
    badge: "MASIH BINGUNG?",
    headline: "Pertanyaan Anda,\nJawabannya Ada.",
    cta: "Lihat FAQ →",
  },
  trust: {
    badge: "KENALI PINDAI",
    headline: "Transparan.\nDigital.\nTerukur.",
    cta: "Kenali PINDAI →",
  },
  cta: {
    badge: "PINDAI",
    headline: "Saat Butuh,\nPINDAI Dulu.",
    cta: "Mulai Sekarang →",
  },
};
for (const [id, harap] of Object.entries(SPESIFIKASI)) {
  const p = promoPosters.find((x) => x.id === id);
  ok(p !== undefined, `poster "${id}" ada`);
  eq(p?.badge, harap.badge, `${id}: badge persis spesifikasi`);
  eq(p?.headline, harap.headline, `${id}: headline persis spesifikasi`);
  eq(p?.cta, harap.cta, `${id}: CTA persis spesifikasi`);
}

// Deskripsi (subheadline) persis untuk yang punya.
const DESKRIPSI: Record<string, string> = {
  pinjaman: "Ajukan kebutuhan dana secara digital dengan informasi yang jelas.",
  gadai: "Ajukan gadai dengan proses taksiran yang transparan.",
  kredit: "Dapatkan barang yang Anda butuhkan dengan pilihan tenor yang tersedia.",
  "cara-kerja": "Semua proses dapat dipantau melalui akun PINDAI.",
  biaya:
    "PINDAI menampilkan komponen biaya dan kewajiban secara jelas sebelum pengajuan diselesaikan.",
  keamanan:
    "PINDAI dirancang dengan kontrol keamanan dan proses verifikasi untuk membantu menjaga data pengguna.",
  trust:
    "PINDAI menghadirkan pengalaman pinjam, gadai, dan kredit dalam satu platform digital.",
  cta: "Pinjaman, gadai, dan kredit\ndalam satu platform digital.",
};
for (const [id, teks] of Object.entries(DESKRIPSI)) {
  eq(
    promoPosters.find((x) => x.id === id)?.description,
    teks,
    `${id}: subheadline persis spesifikasi`,
  );
}

// Fitur persis untuk poster fitur.
const FITUR: Record<string, string[]> = {
  pinjaman: ["Tenor fleksibel", "Pengajuan digital", "Informasi biaya transparan"],
  gadai: ["Taksiran transparan", "Barang tersimpan aman", "Proses terstruktur"],
  kredit: ["DP sesuai ketentuan", `Tenor ${KREDIT_TENOR_PENGAJUAN_OPTIONS.join(" / ")} bulan`, "Pilihan barang"],
  keamanan: [
    "Verifikasi identitas",
    "Perlindungan data",
    "Kontrol akses",
    "Riwayat aktivitas",
  ],
};
for (const [id, daftar] of Object.entries(FITUR)) {
  eq(
    promoPosters.find((x) => x.id === id)?.features.join("|"),
    daftar.join("|"),
    `${id}: fitur persis spesifikasi`,
  );
}

console.log(`\npromoPosters: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
