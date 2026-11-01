/**
 * Materi banner promo PINDAI.
 *
 * Menghasilkan SVG sumber dan metadata kampanye di public/banner-promo/.
 * PNG 1600×600 dan 1080×1350 dibuat dari SVG yang sama dengan rsvg-convert,
 * jadi dua rasio tidak pernah berbeda isi.
 *
 * Jalankan: bun scripts/buat-banner-promo.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Promo = {
  id: string;
  nama: string;
  judul: string;
  headline: string;
  subhead: string;
  detail: string;
  sealTop: string;
  sealBig: string;
  sealBottom: string;
  prioritas: number;
  ukuranSeal?: number;
  catatan: string;
};

const PROMOS: Promo[] = [
  {
    id: "tenor-7-bunga-15",
    nama: "Tenor 7 hari · bunga 15%",
    judul: "Promo tenor 7 hari, bunga 15%",
    headline: "BUNGA 15%",
    subhead: "TENOR 7 HARI",
    detail:
      "Pinjaman harian PINDAI untuk kebutuhan mendesak. Ajukan langsung dari aplikasi.",
    sealTop: "BUNGA",
    sealBig: "15%",
    sealBottom: "TENOR 7 HARI",
    prioritas: 10,
    catatan:
      "Siap dipasang. Buat Promo Bunga tenor 7 hari dengan bunga 15%, lalu tautkan ke banner ini.",
  },
  {
    id: "tenor-10-bunga-20",
    nama: "Tenor 10 hari · bunga 20%",
    judul: "Promo tenor 10 hari, bunga 20%",
    headline: "BUNGA 20%",
    subhead: "TENOR 10 HARI",
    detail:
      "Tenor lebih longgar, bunga tetap ringan. Ajukan langsung dari aplikasi PINDAI.",
    sealTop: "BUNGA",
    sealBig: "20%",
    sealBottom: "TENOR 10 HARI",
    prioritas: 11,
    catatan:
      "Siap dipasang. Buat Promo Bunga tenor 10 hari dengan bunga 20%; tenor 10 ditambahkan lewat kolom tenor lain di panel Promo Bunga.",
  },
  {
    id: "potongan-5-semua-tenor",
    nama: "Potongan 5% bunga · semua tenor maksimal 30 hari",
    judul: "Potongan 5% bunga untuk semua tenor maksimal 30 hari",
    headline: "POTONGAN 5%",
    subhead: "BUNGA SEMUA TENOR",
    detail:
      "Berlaku untuk pinjaman dengan tenor maksimal 30 hari. Semakin cepat, semakin ringan.",
    sealTop: "POTONGAN",
    sealBig: "5%",
    sealBottom: "TENOR MAKS. 30 HARI",
    prioritas: 12,
    catatan:
      "Desain siap. Tenor 7–30 bisa ditambahkan lewat kolom tenor lain, tetapi model promo saat ini mengganti bunga, bukan memotong 5 poin dari bunga. Perlu aturan potongan per tenor atau voucher.",
  },
  {
    id: "bebas-biaya-admin",
    nama: "Bebas biaya admin",
    judul: "Promo bebas biaya admin",
    headline: "BEBAS BIAYA",
    subhead: "ADMIN PINJAMAN",
    detail:
      "Tanpa potongan biaya admin di muka. Dana pinjaman lebih utuh untuk kebutuhan Anda.",
    sealTop: "BIAYA ADMIN",
    sealBig: "Rp0",
    sealBottom: "PROMO PINDAI",
    prioritas: 13,
    ukuranSeal: 76,
    catatan:
      "Desain siap, tetapi bebas biaya admin belum menjadi kampanye massal. Saat ini hanya voucher diskon admin per nasabah.",
  },
];

const WARNA = {
  gelap: "#081f1e",
  hijau: "#0f3d3a",
  hijauTerang: "#145a54",
  krem: "#f7f1e3",
  emas: "#d8c28c",
  kuningan: "#b08d57",
} as const;

const SANS = "Liberation Sans, Arial, sans-serif";
const SERIF = "Bitstream Charter, Liberation Serif, serif";
const AKAR = process.cwd();
const TUJUAN = join(AKAR, "public", "banner-promo");

function esc(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pecah teks menjadi baris yang masih muat pada lebar tertentu. */
function pecah(teks: string, maks: number): string[] {
  const kata = teks.split(/\s+/);
  const baris: string[] = [];
  let sekarang = "";
  for (const k of kata) {
    const calon = sekarang === "" ? k : `${sekarang} ${k}`;
    if (calon.length > maks && sekarang !== "") {
      baris.push(sekarang);
      sekarang = k;
    } else {
      sekarang = calon;
    }
  }
  if (sekarang !== "") baris.push(sekarang);
  return baris;
}

function defs(): string {
  return `
  <defs>
    <linearGradient id="latar" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${WARNA.hijauTerang}"/>
      <stop offset="0.52" stop-color="${WARNA.hijau}"/>
      <stop offset="1" stop-color="${WARNA.gelap}"/>
    </linearGradient>
    <radialGradient id="cahaya" cx="0.72" cy="0.2" r="0.7">
      <stop offset="0" stop-color="${WARNA.emas}" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="${WARNA.emas}" stop-opacity="0.05"/>
      <stop offset="1" stop-color="${WARNA.emas}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="garis" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="${WARNA.krem}" stroke-opacity="0.035"/>
    </pattern>
  </defs>`;
}

function latar(lebar: number, tinggi: number): string {
  return `
  <rect width="${lebar}" height="${tinggi}" fill="url(#latar)"/>
  <rect width="${lebar}" height="${tinggi}" fill="url(#garis)"/>
  <rect width="${lebar}" height="${tinggi}" fill="url(#cahaya)"/>`;
}

function labelKecil(x: number, y: number, teks: string): string {
  return `
  <g font-family="${SANS}" font-size="17" font-weight="700" letter-spacing="4.5" fill="${WARNA.emas}">
    <rect x="${x}" y="${y - 15}" width="34" height="3" fill="${WARNA.emas}"/>
    <text x="${x + 50}" y="${y - 8}">${esc(teks)}</text>
  </g>`;
}

function detailTeks(
  x: number,
  y: number,
  teks: string,
  maks: number,
  ukuran: number,
  jarak: number,
): string {
  return pecah(teks, maks)
    .map(
      (baris, i) =>
        `<tspan x="${x}" dy="${i === 0 ? 0 : jarak}">${esc(baris)}</tspan>`,
    )
    .join("");
}

function segel(
  cx: number,
  cy: number,
  r: number,
  promo: Promo,
): string {
  const besar = promo.ukuranSeal ?? 96;
  return `
  <g transform="translate(${cx} ${cy})">
    <circle r="${r + 18}" fill="${WARNA.gelap}" fill-opacity="0.22"/>
    <circle r="${r}" fill="none" stroke="${WARNA.emas}" stroke-opacity="0.45" stroke-width="1.5"/>
    <circle r="${r - 16}" fill="${WARNA.gelap}" fill-opacity="0.58" stroke="${WARNA.emas}" stroke-width="2"/>
    <circle r="${r - 38}" fill="none" stroke="${WARNA.emas}" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="3 8"/>
    <text y="${-r * 0.36}" text-anchor="middle" font-family="${SANS}" font-size="14" font-weight="700" letter-spacing="3.5" fill="${WARNA.emas}">${esc(promo.sealTop)}</text>
    <text y="${besar * 0.24}" text-anchor="middle" font-family="${SERIF}" font-size="${besar}" font-weight="700" fill="${WARNA.krem}">${esc(promo.sealBig)}</text>
    <text y="${r * 0.44}" text-anchor="middle" font-family="${SANS}" font-size="13" font-weight="700" letter-spacing="3" fill="${WARNA.emas}">${esc(promo.sealBottom)}</text>
  </g>`;
}

function lambang(x: number, y: number, ukuran: number): string {
  const skala = ukuran / 64;
  return `
  <g transform="translate(${x} ${y}) scale(${skala})">
    <rect x="5" y="6" width="54" height="50" rx="12" fill="${WARNA.hijau}" stroke="${WARNA.kuningan}" stroke-width="2"/>
    <path d="M15 10h34" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2" stroke-linecap="round"/>
    <rect x="11" y="12" width="42" height="38" rx="7" fill="${WARNA.krem}"/>
    <rect x="14" y="15" width="36" height="32" rx="5" stroke="#d9d2c1" stroke-width="1.5"/>
    <rect x="7" y="19" width="5" height="7" rx="2.5" fill="${WARNA.emas}"/>
    <rect x="7" y="36" width="5" height="7" rx="2.5" fill="${WARNA.emas}"/>
    <circle cx="31" cy="31" r="10" fill="${WARNA.hijau}"/>
    <circle cx="31" cy="31" r="7.2" stroke="${WARNA.emas}" stroke-width="1.5"/>
    <path d="M31 31l7-5M31 24v2M38 31h-2M31 38v-2M24 31h2" stroke="${WARNA.krem}" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="31" cy="31" r="2.2" fill="${WARNA.emas}"/>
    <path d="M20 57h8M36 57h8" stroke="${WARNA.gelap}" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function kataMerek(x: number, y: number, ukuran: number, warna: string): string {
  return `<text x="${x}" y="${y}" font-family="${SERIF}" font-size="${ukuran}" font-weight="700" letter-spacing="8" fill="${warna}">PINDAI</text>`;
}

function desktop(p: Promo): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600">
${defs()}
${latar(1600, 600)}
<path d="M0 492C270 442 518 540 824 480C1120 422 1340 392 1600 456V600H0Z" fill="${WARNA.gelap}" fill-opacity="0.46"/>
<path d="M96 72V410" stroke="${WARNA.emas}" stroke-opacity="0.28" stroke-width="1"/>
${labelKecil(96, 106, "PROMO PINJAMAN HARIAN")}
<text x="96" y="224" font-family="${SERIF}" font-size="102" font-weight="700" fill="${WARNA.krem}">${esc(p.headline)}</text>
<text x="96" y="292" font-family="${SANS}" font-size="38" font-weight="700" letter-spacing="2.2" fill="${WARNA.emas}">${esc(p.subhead)}</text>
<text x="96" y="350" font-family="${SANS}" font-size="23" fill="${WARNA.krem}" fill-opacity="0.78">${detailTeks(96, 350, p.detail, 58, 23, 34)}</text>
${segel(1326, 296, 170, p)}
${lambang(96, 490, 46)}
${kataMerek(154, 532, 30, WARNA.emas)}
<text x="154" y="560" font-family="${SANS}" font-size="14" fill="${WARNA.krem}" fill-opacity="0.56">Pinjaman harian berbasis teknologi</text>
<text x="1504" y="532" text-anchor="end" font-family="${SANS}" font-size="18" font-weight="700" fill="${WARNA.krem}">pindai.biz.id</text>
<text x="1504" y="560" text-anchor="end" font-family="${SANS}" font-size="13" fill="${WARNA.krem}" fill-opacity="0.56">Syarat dan ketentuan berlaku.</text>
</svg>`;
}

function mobile(p: Promo): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
${defs()}
${latar(1080, 1350)}
<path d="M0 1010C238 960 430 1056 704 1000C884 964 1000 962 1080 992V1350H0Z" fill="${WARNA.gelap}" fill-opacity="0.48"/>
<path d="M80 93V520" stroke="${WARNA.emas}" stroke-opacity="0.28" stroke-width="1"/>
${labelKecil(80, 130, "PROMO PINJAMAN HARIAN")}
<text x="80" y="300" font-family="${SERIF}" font-size="94" font-weight="700" fill="${WARNA.krem}">${esc(p.headline)}</text>
<text x="80" y="382" font-family="${SANS}" font-size="46" font-weight="700" letter-spacing="2" fill="${WARNA.emas}">${esc(p.subhead)}</text>
<text x="80" y="450" font-family="${SANS}" font-size="31" fill="${WARNA.krem}" fill-opacity="0.8">${detailTeks(80, 450, p.detail, 34, 31, 46)}</text>
${segel(540, 850, 190, p)}
<g>
  <rect x="80" y="1120" width="452" height="86" rx="43" fill="${WARNA.emas}"/>
  <text x="306" y="1174" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="700" letter-spacing="1.6" fill="${WARNA.gelap}">AJUKAN SEKARANG</text>
</g>
${lambang(80, 1232, 44)}
${kataMerek(136, 1282, 28, WARNA.emas)}
<text x="80" y="1312" font-family="${SANS}" font-size="15" fill="${WARNA.krem}" fill-opacity="0.56">Syarat dan ketentuan berlaku.</text>
<text x="1000" y="1282" text-anchor="end" font-family="${SANS}" font-size="17" font-weight="700" fill="${WARNA.krem}">pindai.biz.id</text>
</svg>`;
}

mkdirSync(TUJUAN, { recursive: true });

for (const promo of PROMOS) {
  writeFileSync(join(TUJUAN, `${promo.id}-desktop.svg`), desktop(promo));
  writeFileSync(join(TUJUAN, `${promo.id}-mobile.svg`), mobile(promo));
}

const metadata = PROMOS.map((promo) => ({
  id: promo.id,
  nama: promo.nama,
  judul: promo.judul,
  tautan: "/pinjaman/konvensional",
  penempatan: ["beranda", "dashboard", "promo"],
  prioritas: promo.prioritas,
  desktop: `/banner-promo/${promo.id}-desktop.png`,
  mobile: `/banner-promo/${promo.id}-mobile.png`,
  catatan: promo.catatan,
}));

writeFileSync(
  join(TUJUAN, "metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

console.log(`8 SVG + metadata dibuat di ${TUJUAN}`);
