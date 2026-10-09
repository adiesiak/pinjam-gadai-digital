/**
 * Uji micro-interaction komponen UI PINDAI.
 * Run: bun src/components/ui/microinteraction.render.test.tsx
 *
 * Dua bagian:
 *  1. **Markup** — state yang dijanjikan benar-benar ada di keluaran render:
 *     tombol `loading` mengunci diri & mengumumkan `aria-busy`, tombol berstatus
 *     mengirim ikon + pengumuman pembaca layar, kartu bisa diangkat hanya kalau
 *     memintanya, dan kontrol form membawa penanda valid/invalid.
 *  2. **Konsistensi berkas** — primitif yang diaudit memakai motion token, bukan
 *     durasi/kemiringan ad-hoc, dan tidak memakai `transition-all` (yang
 *     menganimasikan properti tata letak dan memicu layout shift).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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

const render = (el: ReactElement) => renderToStaticMarkup(el);

// ===== 1. Markup =====
// Tombol biasa: fokus keyboard, tempo token, dan sentuhan.
const tombol = render(<Button>Simpan</Button>);
ada(tombol, 'data-slot="button"', "tombol punya penanda slot");
ada(tombol, "focus-visible:ring-[3px]", "fokus keyboard diberi cincin");
ada(tombol, "duration-[var(--motion-fast)]", "tempo tombol memakai motion token");
ada(tombol, "touch-manipulation", "sentuhan tidak menunggu 300 ms");
ada(tombol, "active:scale-[0.98]", "tekan diberi umpan balik halus");
tidakAda(tombol, 'aria-busy="true"', "tombol diam tidak mengaku sibuk");

// Tombol loading: terkunci + diumumkan, tetapi label tetap terbaca.
const memuat = render(<Button loading>Kirim</Button>);
ada(memuat, 'aria-busy="true"', "loading diumumkan sebagai aria-busy");
ada(memuat, "disabled", "loading mengunci tombol");
ada(memuat, 'aria-label="Memuat"', "pemintal punya label untuk pembaca layar");
ada(memuat, "Kirim", "label tetap tampil saat memuat");

// Tombol berstatus: ikon beranimasi + pengumuman hasil.
const sukses = render(<Button status="sukses">Simpan</Button>);
ada(sukses, 'data-status="sukses"', "status ditandai pada elemen");
ada(sukses, "motion-check-in", "ikon status masuk dengan animasi kecil");
ada(sukses, "Berhasil.", "hasil sukses diumumkan untuk pembaca layar");
const gagal = render(<Button status="gagal">Simpan</Button>);
ada(gagal, "Gagal.", "hasil gagal diumumkan untuk pembaca layar");

// Varian nada positif ada di design system (hijau = status positif PINDAI).
const nadaSukses = render(<Button variant="sukses">Lunas</Button>);
ada(nadaSukses, "bg-emerald-600", "variant sukses memakai nada positif tema");

// Tombol ikon: ukuran tetap, tetap punya cincin fokus, dan diberi label.
const ikon = render(
  <Button size="icon" aria-label="Tutup panel">
    ×
  </Button>,
);
ada(ikon, "size-9", "tombol ikon memakai ukuran kuadrat tetap");
ada(ikon, "focus-visible:ring-[3px]", "tombol ikon tetap terlihat saat difokus");
ada(ikon, 'aria-label="Tutup panel"', "tombol ikon punya nama untuk pembaca layar");

// `asChild`: elemen anak yang menjadi tombol, dan `Slot` hanya menerima satu anak.
const sebagaiAnak = render(
  <Button asChild status="sukses">
    <a href="#pinjaman">Lihat pinjaman</a>
  </Button>,
);
ada(sebagaiAnak, "<a href=\"#pinjaman\"", "asChild meneruskan elemen anak apa adanya");
ada(sebagaiAnak, "Lihat pinjaman", "asChild menjaga isi anak");
tidakAda(sebagaiAnak, "motion-check-in", "asChild tidak menyisipkan ikon ke dalam Slot");

// Kartu: hanya mengangkat bila memang interaktif.
const kartuStatis = render(<Card>Isi</Card>);
ada(kartuStatis, "duration-[var(--motion-normal)]", "kartu statis bertransisi halus");
tidakAda(kartuStatis, "card-lift", "kartu statis tidak bergerak saat disorot");
const kartuInteraktif = render(<Card hover>Isi</Card>);
ada(kartuInteraktif, "card-lift", "kartu interaktif memakai pengangkatan ringan");
ada(kartuInteraktif, 'data-hover="true"', "keadaan hover kartu bisa dibaca dari markup");

// Kontrol form: fokus, invalid, dan valid (opt-in).
const input = render(<Input defaultValue="Siti" />);
ada(input, "focus-visible:ring-[3px]", "input memberi cincin saat fokus");
ada(input, "user-invalid:border-destructive", "input menandai isian tidak sah sendiri");
ada(input, "data-[valid=true]:border-emerald-600", "input punya nada valid opt-in");
ada(input, "duration-[var(--motion-fast)]", "tempo input memakai motion token");

const areaTeks = render(<Textarea />);
ada(areaTeks, "data-[valid=true]:border-emerald-600", "area teks sejalan dengan input");
ada(areaTeks, "user-invalid:border-destructive", "area teks menandai isian tidak sah");

// Lencana: transisi nada memakai token.
const lencana = render(<Badge>Serah terima</Badge>);
ada(lencana, "duration-[var(--motion-fast)]", "tempo lencana memakai motion token");

// Kotak centang: tanda masuk beranimasi, tekan diberi umpan balik.
const kotak = render(<Checkbox defaultChecked aria-label="Setuju" />);
ada(kotak, "motion-check-in", "centang masuk dengan animasi kecil");
ada(kotak, "active:scale-[0.96]", "centang diberi umpan balik tekan");
ada(kotak, "touch-manipulation", "centang ramah sentuhan");
ada(kotak, 'role="checkbox"', "centang terbaca sebagai kotak centang");

// Pilihan tunggal: titik masuk beranimasi, navigasi keyboard dari Radix.
const pilihan = render(
  <RadioGroup defaultValue="a">
    <RadioGroupItem value="a" aria-label="Pilihan A" />
  </RadioGroup>,
);
ada(pilihan, "motion-check-in", "titik pilihan masuk dengan animasi kecil");
ada(pilihan, "duration-[var(--motion-fast)]", "tempo pilihan memakai motion token");
ada(pilihan, 'role="radiogroup"', "grup pilihan terbaca sebagai radiogroup");

// Sakelar: thumb meluncur dengan tempo token, bukan `transition-all`.
const sakelar = render(<Switch aria-label="Aktif" />);
ada(sakelar, "transition-transform", "thumb sakelar hanya menganimasikan transform");
ada(sakelar, "duration-[var(--motion-normal)]", "thumb meluncur dengan tempo normal");
ada(sakelar, "data-[state=checked]:translate-x-", "posisi thumb jelas per keadaan");
ada(sakelar, 'role="switch"', "sakelar terbaca sebagai switch");
tidakAda(sakelar, "transition-all", "sakelar tidak memakai transition-all");

// Tab: keadaan aktif diberi tempo token dan ramah sentuhan.
const tab = render(
  <Tabs defaultValue="satu">
    <TabsList>
      <TabsTrigger value="satu">Satu</TabsTrigger>
      <TabsTrigger value="dua">Dua</TabsTrigger>
    </TabsList>
  </Tabs>,
);
ada(tab, "touch-manipulation", "tab ramah sentuhan");
ada(tab, "duration-[var(--motion-normal)]", "tempo tab memakai motion token");
ada(tab, 'data-state="active"', "tab aktif ditandai untuk pembaca layar");
ada(tab, 'role="tablist"', "daftar tab terbaca sebagai tablist");

// Label tetap terhubung ke kontrolnya.
const label = render(<Label htmlFor="x">Nama</Label>);
ada(label, 'for="x"', "label terhubung ke kontrolnya");

// ===== 2. Konsistensi berkas =====
const baca = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), "utf8");

/** Buang komentar dulu: prosa penjelasan tidak boleh ikut diperiksa. */
const tanpaKomentar = (kode: string) =>
  kode.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Primitif yang menjadi tanggung jawab audit micro-interaction ini. */
const PRIMITIF = [
  "src/components/ui/button-variants.ts",
  "src/components/ui/button.tsx",
  "src/components/ui/card.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/textarea.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/checkbox.tsx",
  "src/components/ui/radio-group.tsx",
  "src/components/ui/switch.tsx",
  "src/components/ui/badge-variants.ts",
  "src/components/ui/tabs.tsx",
  "src/components/ui/tooltip.tsx",
];

/** Potong isi berkas menjadi bagian kelas CSS/Tailwind, lalu buang tanda baca tepi. */
const potongan = (isi: string) =>
  isi
    .split(/[\s"'`{}]+/)
    .map((t) => t.replace(/^[;,()]+/, "").replace(/[;,)]+$/, ""))
    .filter(Boolean);

/** Kelas bermasalah: transisi menyeluruh, atau durasi/easing yang bukan token. */
function pelanggaranMotion(isi: string): string[] {
  return potongan(isi).filter((t) =>
    /(^|:)transition-all$/.test(t) ||
    /(^|:)duration-(75|100|150|200|300|500|700)$/.test(t) ||
    /(^|:)ease-(linear|in|out|in-out)$/.test(t),
  );
}

for (const berkas of PRIMITIF) {
  const isi = tanpaKomentar(baca(berkas));
  const langgar = pelanggaranMotion(isi);
  ok(
    langgar.length === 0,
    `${berkas}: hanya motion token (ditemukan: ${langgar.join(", ") || "—"})`,
  );
  ok(
    !isi.includes("prefers-reduced-motion"),
    `${berkas}: tidak menimpa aturan reduced-motion sendiri`,
  );
}

// Kontrol yang disentuh jari wajib menghilangkan jeda 300 ms.
for (const berkas of [
  "src/components/ui/button-variants.ts",
  "src/components/ui/tabs.tsx",
  "src/components/ui/checkbox.tsx",
  "src/components/ui/radio-group.tsx",
  "src/components/ui/switch.tsx",
  "src/components/ui/select.tsx",
]) {
  ada(tanpaKomentar(baca(berkas)), "touch-manipulation", `${berkas} ramah sentuhan`);
}

// Setiap state interaktif yang dijanjikan ada di primitifnya.
const variants = tanpaKomentar(baca("src/components/ui/button-variants.ts"));
ada(variants, "focus-visible:ring", "tombol: fokus keyboard");
ada(variants, "disabled:", "tombol: state terkunci");
ada(variants, "aria-busy:", "tombol: state sibuk");
ada(variants, "sukses:", "tombol: nada sukses tersedia");
ada(variants, "destructive:", "tombol: nada error tersedia");

// Animasi tanda centang & pengangkatan kartu wajib dimatikan saat reduce.
const css = baca("src/index.css");
const blokReduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
ada(blokReduce, ".motion-check-in", "reduce: animasi tanda centang dimatikan");
ada(blokReduce, ".card-lift", "reduce: pengangkatan kartu dimatikan");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`microinteraction: ${passed} lulus`);
