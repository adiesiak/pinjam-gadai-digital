/**
 * Penjaga register ponsel: membaca kelas tata letak di seluruh sumber dan
 * menolak ukuran skala-desktop yang berdiri di lebar ponsel tanpa langkah
 * breakpoint.
 *
 * Run: bun src/lib/registerPonsel.test.ts
 *
 * Kenapa ada: `DESIGN.md` §2.3 menetapkan satu register ponsel, yaitu jarak
 * vertikal bagian 40px, celah grid 24px, padding kartu 16px, dan padding kartu
 * halaman masuk 24px. Register itu mudah melenceng kembali tanpa sengaja, karena
 * nilai desktop yang disalin ke komponen baru tetap terlihat "wajar" selama
 * dibuka di jendela lebar. Uji ini membacanya sebagai teks kelas, jadi ia tidak
 * butuh peramban.
 *
 * Aturan yang MENGGAGALKAN:
 *   P-1 jarak vertikal bagian : `py|pt-(14|16|20|24)` tanpa `sm:`/`md:`/`lg:` sejenis
 *       (`pb-` sengaja tidak digerbang: jarak bawah besar biasanya justru ruang
 *       untuk bilah bawah yang hanya ada di ponsel, bukan sisa skala desktop)
 *   P-2 celah grid            : `gap-(12|14)` tanpa `sm:`/`md:`/`lg:` sejenis
 *   P-3 padding kartu         : `p-(7|8)` tanpa `sm:`/`md:`/`lg:` sejenis
 *
 * Yang DILAPORKAN saja (utang terukur, bukan klaim bersih):
 *   L-1 padding kartu 24px (`p-6`) tanpa langkah: sisa komponen admin
 *   L-2 ruang ketuk kecil pada elemen yang BENAR-BENAR bisa ditekan: tinggi
 *       atau padding di bawah 44px tanpa `min-h-11`/`h-11`/`size-11`. Hanya
 *       tombol, tautan, isian, dan elemen ber-`onClick`/`role` interaktif yang
 *       dihitung; chip, baris keterangan, dan blok tampilan tidak, supaya
 *       daftarnya tetap bisa ditindaklanjuti.
 *
 * Tiga batas yang disadari, supaya tidak dilebih-lebihkan:
 *   1. Kelas di dalam template literal yang memuat `${…}` hanya dilaporkan,
 *      bukan digagalkan: langkah breakpoint-nya bisa berasal dari potongan yang
 *      tidak terbaca statis.
 *   2. Elemen interaktif ditebak dari tag terdekat sebelum literal kelasnya
 *      beserta penanda `onClick`/`role`/`cursor-pointer` di sekitarnya. Tag
 *      pembungkus yang jauh, atau kelas yang dipakai ulang lewat prop, bisa
 *      terlewat.
 *   3. Uji ini membaca kelas, bukan piksel. Tinggi sebenarnya ditentukan juga
 *      oleh ukuran huruf dan `line-height`, jadi L-2 adalah daftar untuk
 *      diperiksa, bukan putusan. Overflow horizontal dan tata letak akhir tetap
 *      harus dilihat di peramban pada lebar ponsel.
 *
 * Konvensi yang dijaga: langkah `sm:`/`md:` diletakkan di literal kelas yang
 * SAMA dengan nilai dasarnya (`p-4 shadow-sm sm:p-6`). Bila dipisah ke dua
 * literal, uji ini akan melaporkannya sebagai kelas tanpa langkah.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const AKAR = fileURLToPath(new URL("../../", import.meta.url));
const MAP_SRC = join(AKAR, "src");

/** Ukuran skala-desktop yang tidak boleh berdiri sendiri di lebar ponsel. */
const MAKS_VERTIKAL = new Set([14, 16, 20, 24]);
const MAKS_GAP = new Set([12, 14]);
const MAKS_KARTU = new Set([7, 8]);

/** Laporan saja. */
const PADDING_KARTU_BORDERLINE = new Set([6]);

/**
 * Pengecualian harus jarang dan beralasan. Tambahkan entri HANYA untuk pola yang
 * memang tidak perlu register ponsel, bukan untuk membungkam temuan.
 */
const PENGECUALIAN: { pola: RegExp; aturan: string; alasan: string }[] = [
  {
    pola: /^src\/pages\/NotFound\.tsx$/,
    aturan: "P-1",
    alasan:
      "satu layar penuh yang isinya dipusatkan; jarak atas-bawah besar adalah komposisi halamannya, bukan register bagian",
  },
];

// ===== Pengumpulan berkas =====

const LEWATI_MAP = new Set([
  "_generated",
  "node_modules",
  "dist",
  "isolate",
  "android",
  "native",
  "migration-convex",
  "data",
  "agent",
  "anti-slop",
]);

function kumpulkanBerkas(direktori: string, keluaran: string[] = []): string[] {
  for (const nama of readdirSync(direktori)) {
    const jalur = join(direktori, nama);
    const info = statSync(jalur);
    if (info.isDirectory()) {
      if (LEWATI_MAP.has(nama)) continue;
      kumpulkanBerkas(jalur, keluaran);
      continue;
    }
    if (!nama.endsWith(".tsx")) continue;
    if (nama.includes(".test.") || nama.includes(".d.ts")) continue;
    keluaran.push(jalur);
  }
  return keluaran;
}

/**
 * Penanda isi kelas. Prosa tidak lolos: kandidat harus punya spasi dan minimal
 * dua penanda kelas, dan setiap tokennya harus berbentuk token kelas.
 */
const PENANDA_KELAS = [
  "border",
  "bg-",
  "rounded",
  "text-",
  "flex",
  "grid",
  "shadow",
  "gap-",
  "px-",
  "py-",
  "p-",
  "w-",
  "min-h-",
  "ring-",
  "space-",
  "justify",
  "items-",
];

const POLA_TOKEN_KELAS = /^!?[-a-zA-Z0-9:[\]/.%#(),=+'"]+$/;

function terlihatSepertiKelas(teks: string): boolean {
  if (teks.length < 10 || !teks.includes(" ")) return false;
  const token = teks.trim().split(/\s+/);
  if (token.length < 2) return false;
  if (!token.every((satu) => POLA_TOKEN_KELAS.test(satu))) return false;
  return PENANDA_KELAS.filter((penanda) => teks.includes(penanda)).length >= 2;
}

type Kandidat = {
  berkas: string;
  baris: number;
  teks: string;
  /** Nama tag pemilik literal kelas ini, mis. `button` atau `span`. */
  elemen: string | null;
  /** Tag pembukanya saja, sudah dipotong pada `>` terakhir. */
  tag: string | null;
  /** Template literal berisi `${…}`: langkah breakpoint bisa tak terbaca. */
  ragu: boolean;
};

const POLA_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

/** Jendela pencarian tag: cukup lebar untuk atribut panjang, tetap terbatas. */
const JENDELA_SEBELUM = 1200;

/**
 * Tag pembuka yang MEMILIKI literal kelas ini. Dipotong pada `>` di kedalaman
 * kurung nol, sambil memperhitungkan kurung kurawal (`onClick={() => …}`) dan
 * tanda kutip, supaya `onClick` milik elemen induk tidak dianggap milik anaknya.
 * Dengan begitu `<p>` di dalam `<button>` tidak dilaporkan dua kali.
 */
function tagPemilik(
  isi: string,
  indeksLiteral: number,
): { elemen: string | null; tag: string | null } {
  const awalJendela = Math.max(0, indeksLiteral - JENDELA_SEBELUM);
  const sebelum = isi.slice(awalJendela, indeksLiteral);
  const awalRelatif = sebelum.lastIndexOf("<");
  if (awalRelatif === -1) return { elemen: null, tag: null };
  const awalTag = awalJendela + awalRelatif;
  const elemen = /^<([A-Za-z][\w.$]*)/.exec(isi.slice(awalTag))?.[1] ?? null;

  let dalamKutip: string | null = null;
  let kurung = 0;
  for (let i = awalTag; i < isi.length && i - awalTag < 4000; i += 1) {
    const huruf = isi[i];
    if (dalamKutip !== null) {
      if (huruf === dalamKutip) dalamKutip = null;
      continue;
    }
    if (huruf === '"' || huruf === "'" || huruf === "`") {
      dalamKutip = huruf;
      continue;
    }
    if (huruf === "{") {
      kurung += 1;
      continue;
    }
    if (huruf === "}") {
      kurung -= 1;
      continue;
    }
    if (huruf === ">" && kurung === 0) {
      return { elemen, tag: isi.slice(awalTag, i + 1) };
    }
  }
  return { elemen, tag: null };
}

function kumpulkanKandidat(berkas: string, isi: string): Kandidat[] {
  const hasil: Kandidat[] = [];
  for (const cocok of isi.matchAll(POLA_LITERAL)) {
    const teks = cocok[1] ?? cocok[2] ?? cocok[3] ?? "";
    if (!terlihatSepertiKelas(teks)) continue;
    const { elemen, tag } = tagPemilik(isi, cocok.index);
    hasil.push({
      berkas,
      baris: isi.slice(0, cocok.index).split("\n").length,
      teks,
      elemen,
      tag,
      ragu: teks.includes("${"),
    });
  }
  return hasil;
}

// ===== Pembacaan kelas =====

type TokenKelas = { varian: string | null; inti: string; asli: string };

function uraikan(teks: string): TokenKelas[] {
  return teks
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((asli) => {
      const pisah = asli.lastIndexOf(":");
      if (pisah === -1) return { varian: null, inti: asli, asli };
      return { varian: asli.slice(0, pisah), inti: asli.slice(pisah + 1), asli };
    });
}

const BREAKPOINT = /^(sm|md|lg|xl|2xl)$/;

function adaLangkah(token: TokenKelas[], awalanInti: string): boolean {
  return token.some(
    (satu) =>
      satu.varian !== null &&
      BREAKPOINT.test(satu.varian) &&
      satu.inti.startsWith(awalanInti),
  );
}

function nilai(token: TokenKelas[], awalan: string, varian: string | null): number[] {
  const angka: number[] = [];
  for (const satu of token) {
    if (satu.varian !== varian) continue;
    if (!satu.inti.startsWith(awalan)) continue;
    const sisa = satu.inti.slice(awalan.length);
    if (!/^\d+$/.test(sisa)) continue;
    angka.push(Number(sisa));
  }
  return angka;
}

// ===== Elemen yang benar-benar bisa ditekan =====

/** Elemen HTML yang tidak pernah jadi sasaran sentuh dengan sendirinya. */
const HOST_NETRAL = new Set([
  "p", "span", "div", "code", "pre", "li", "ul", "ol", "td", "th", "tr",
  "table", "thead", "tbody", "h1", "h2", "h3", "h4", "h5", "h6", "section",
  "article", "aside", "header", "footer", "nav", "main", "dl", "dt", "dd",
  "figure", "figcaption", "blockquote", "em", "strong", "small", "time",
]);

/** Tag HTML yang memang jadi sasaran sentuh. */
const TAG_INTERAKTIF = new Set([
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "summary",
  "details",
  "label",
  "option",
]);

/** Komponen sendiri yang selalu kontrol, dikenali dari akhiran namanya. */
const AKHIRAN_INTERAKTIF =
  /(Button|Link|Trigger|Item|Input|Select|Textarea|Checkbox|Switch|Toggle|Tab|Option)$/;

/** Penanda interaktif pada tag pemiliknya sendiri. */
const PENANDA_INTERAKTIF = [
  /role="(button|tab|switch|checkbox|menuitem|option|link)"/,
  /\bon[A-Z][A-Za-z]*=/,
  /\bcursor-pointer\b/,
  /\btype="(submit|button|reset)"/,
];

/**
 * Apakah literal kelas ini menempel pada kontrol yang benar-benar bisa ditekan.
 * Elemen netral hanya dihitung bila tag-nya sendiri ber-`onClick`/`role`; nama
 * komponen yang tidak dikenal hanya dihitung bila akhiran namanya kontrol.
 */
function tampakInteraktif(kandidat: Kandidat): boolean {
  const tag = kandidat.tag ?? "";
  const punyaPenanda = PENANDA_INTERAKTIF.some((pola) => pola.test(tag));
  if (kandidat.elemen === null) return punyaPenanda;
  if (HOST_NETRAL.has(kandidat.elemen.toLowerCase())) return punyaPenanda;
  if (TAG_INTERAKTIF.has(kandidat.elemen.toLowerCase())) return true;
  return AKHIRAN_INTERAKTIF.test(kandidat.elemen) || punyaPenanda;
}

// ===== Pemeriksaan =====

type Temuan = { aturan: string; berkas: string; baris: number; detail: string };

const gagal: Temuan[] = [];
const ragu: Temuan[] = [];
const laporanPadding: Temuan[] = [];
const laporanSentuh: Temuan[] = [];

function catat(
  aturan: string,
  kandidat: Kandidat,
  detail: string,
  tujuan: Temuan[],
): void {
  if (
    PENGECUALIAN.some(
      (satu) =>
        satu.aturan === aturan &&
        satu.pola.test(relative(AKAR, kandidat.berkas).split(sep).join("/")),
    )
  ) {
    return;
  }
  tujuan.push({
    aturan,
    berkas: relative(AKAR, kandidat.berkas).split(sep).join("/"),
    baris: kandidat.baris,
    detail,
  });
}

function periksa(kandidat: Kandidat): void {
  const token = uraikan(kandidat.teks);
  const temuan: { aturan: string; detail: string }[] = [];

  // P-1: jarak vertikal bagian. `pb-` tidak digerbang (lihat catatan di atas).
  for (const sumbu of ["y", "t"]) {
    const awalan = `p${sumbu}-`;
    for (const angka of nilai(token, awalan, null)) {
      if (!MAKS_VERTIKAL.has(angka)) continue;
      if (adaLangkah(token, awalan)) continue;
      temuan.push({
        aturan: "P-1",
        detail: `${awalan}${angka} tanpa langkah sm:/md:/lg:${awalan}`,
      });
    }
  }

  // P-2: celah grid.
  for (const angka of nilai(token, "gap-", null)) {
    if (!MAKS_GAP.has(angka)) continue;
    if (adaLangkah(token, "gap-")) continue;
    temuan.push({
      aturan: "P-2",
      detail: `gap-${angka} tanpa langkah sm:/md:/lg:gap-`,
    });
  }

  // P-3: padding kartu.
  for (const angka of nilai(token, "p-", null)) {
    if (!MAKS_KARTU.has(angka)) continue;
    if (adaLangkah(token, "p-")) continue;
    temuan.push({ aturan: "P-3", detail: `p-${angka} tanpa langkah sm:/md:/lg:p-` });
  }

  for (const satu of temuan) {
    catat(satu.aturan, kandidat, satu.detail, kandidat.ragu ? ragu : gagal);
  }

  // L-1: padding kartu 24px, utang yang sudah terukur.
  for (const angka of nilai(token, "p-", null)) {
    if (!PADDING_KARTU_BORDERLINE.has(angka)) continue;
    if (adaLangkah(token, "p-")) continue;
    catat("L-1", kandidat, `p-${angka} tanpa langkah`, laporanPadding);
  }

  // L-2: ruang ketuk kecil, hanya pada elemen yang bisa ditekan.
  if (!tampakInteraktif(kandidat)) return;
  const adaYangKecil = token.some(
    (satu) =>
      satu.varian === null &&
      /^(py-1|py-1\.5|py-2|h-7|h-8|h-9|h-10)$/.test(satu.inti),
  );
  const adaSasaranBesar = token.some((satu) =>
    /^(min-h-1[12]|h-1[12]|size-1[12]|min-h-\[44px\])$/.test(satu.inti),
  );
  const adaPx = token.some((satu) => satu.inti.startsWith("px-"));
  if (adaYangKecil && !adaSasaranBesar && adaPx) {
    catat(
      "L-2",
      kandidat,
      `${kandidat.elemen ?? "elemen tak dikenal"} tanpa min-h-11/h-11/size-11`,
      laporanSentuh,
    );
  }
}

const berkas = kumpulkanBerkas(MAP_SRC).sort();
let jumlahKandidat = 0;
for (const satu of berkas) {
  for (const kandidat of kumpulkanKandidat(satu, readFileSync(satu, "utf8"))) {
    jumlahKandidat += 1;
    periksa(kandidat);
  }
}

// ===== Laporan =====

function kelompokkan(temuan: Temuan[], kunci: (satu: Temuan) => string) {
  const peta = new Map<string, Temuan[]>();
  for (const satu of temuan) {
    const k = kunci(satu);
    peta.set(k, [...(peta.get(k) ?? []), satu]);
  }
  return peta;
}

function cetak(judul: string, temuan: Temuan[], maksimal: number): void {
  if (temuan.length === 0) return;
  console.log(`\n${judul}`);
  for (const satu of temuan.slice(0, maksimal)) {
    console.log(`  ${satu.berkas}:${satu.baris}  ${satu.detail}`);
  }
  if (temuan.length > maksimal) {
    console.log(`  … dan ${temuan.length - maksimal} lagi`);
  }
}

const perAturan = kelompokkan(gagal, (satu) => satu.aturan);
for (const aturan of ["P-1", "P-2", "P-3"]) {
  const daftar = perAturan.get(aturan) ?? [];
  if (daftar.length === 0) continue;
  cetak(`GAGAL ${aturan} (${daftar.length}):`, daftar, 40);
}
if (ragu.length > 0) {
  cetak(`PERLU DILIHAT: langkah di template literal (${ragu.length}):`, ragu, 20);
}

console.log(
  `\nregisterPonsel: ${berkas.length} berkas, ${jumlahKandidat} literal kelas diperiksa`,
);

function perBerkas(temuan: Temuan[]): string {
  const peta = kelompokkan(temuan, (satu) => satu.berkas);
  return [...peta.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([nama, daftar]) => `${nama} ×${daftar.length}`)
    .join(", ");
}

cetak(`L-1 utang padding kartu 24px (${laporanPadding.length}):`, laporanPadding, 20);
console.log(
  `\nL-2 ruang ketuk kecil pada elemen yang bisa ditekan: ${laporanSentuh.length} literal` +
    (laporanSentuh.length > 0 ? `\n  terbanyak: ${perBerkas(laporanSentuh)}` : ""),
);
const perElemen = kelompokkan(laporanSentuh, (satu) => satu.detail.split(" ")[0]);
for (const [elemen, daftar] of [...perElemen.entries()].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`  ${elemen}: ${daftar.length}`);
}  cetak("  daftarnya:", laporanSentuh, 200);
for (const satu of PENGECUALIAN) {
  console.log(`PENGECUALIAN ${satu.aturan} ${satu.pola.source}: ${satu.alasan}`);
}

if (gagal.length > 0) {
  console.error(
    `\nFAIL registerPonsel: ${gagal.length} pelanggaran. Pakai ` +
      `\`sm:\`/\`md:\`/\`lg:\` untuk memberi langkah desktop, atau ` +
      `\`p-4 sm:p-6\`-gaya yang sama di literal kelas yang sama.`,
  );
  process.exit(1);
}
console.log("\nregisterPonsel: lulus");
