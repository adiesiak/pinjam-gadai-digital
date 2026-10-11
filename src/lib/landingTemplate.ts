/**
 * Registry template landing page PINDAI.
 *
 * Satu sumber kebenaran untuk enam pengalaman visual 3D yang dapat dipilih admin
 * dari Panel Admin → Landing Page → Template 3D. Yang disimpan di Convex hanya
 * ID-nya (`landingTemplate`), bukan nama komponen: pengunjung tidak pernah bisa
 * menyuruh frontend memuat komponen sembarang, dan mutation backend hanya
 * menerima ID dari allowlist di bawah ini (lihat `isLandingTemplateId`).
 *
 * Modul ini SENGAJA tanpa React dan tanpa import Convex supaya dapat dipakai
 * baik oleh schema/mutation backend maupun panel admin dan landing page publik.
 *
 * Konvensi warna tetap identitas PINDAI Green: Deep Space Emerald (#021E17 →
 * #064E3B) sebagai latar dan warna dominan, hijau muda sebagai rim/glow, dan
 * kuningan (gold foil) HANYA sebagai aksen tipis pada chip/logo kartu. Biru
 * tidak pernah dipakai sebagai palet utama template.
 *
 * Mengganti ID template TIDAK merusak konfigurasi lama: nilai yang tak dikenal
 * dinormalkan ke `DEFAULT_LANDING_TEMPLATE` (`templateLandingAman`), jadi
 * landing page lama tetap tampil utuh setelah daftar ini berganti.
 */

/** ID template yang sah — urutannya juga menjadi nomor preset pada mesin 3D. */
export const LANDING_TEMPLATE_IDS = [
  "premium-card",
  "cyber-vault",
  "ai-mascot",
  "ledger-matrix",
  "loan-simulator",
  "quantum-portal",
] as const;

export type LandingTemplateId = (typeof LANDING_TEMPLATE_IDS)[number];

/**
 * Template cadangan. Dipakai saat konfigurasi tidak terbaca, nilainya tak
 * dikenal (termasuk ID template lama), atau template aktif gagal dimuat —
 * landing page tidak boleh kosong.
 */
export const DEFAULT_LANDING_TEMPLATE: LandingTemplateId = "premium-card";

export type LandingTemplateInfo = {
  id: LandingTemplateId;
  /** Nomor tampilan 2 digit ("01".."06") seperti pada kartu pemilih template. */
  nomor: string;
  nama: string;
  deskripsi: string;
  /** Ringkasan interaksi yang benar-benar aktif di scene, bukan janji di UI. */
  interaksi: readonly string[];
  /** [utama, aksen, latar] untuk thumbnail & keadaan fallback CSS. */
  palet: readonly [string, string, string];
};

/** Enam template, urut sesuai penomoran resmi. */
export const LANDING_TEMPLATES: readonly LandingTemplateInfo[] = [
  {
    id: "premium-card",
    nomor: "01",
    nama: "3D Premium Card (Tilt & Scroll)",
    deskripsi:
      "Kartu PINDAI material emerald matte dengan aksen gold foil tipis. Memiringkan diri mengikuti kursor dan menyesuaikan sudut saat halaman digulir.",
    interaksi: ["Mouse tilt", "Scroll rotation", "Gold foil accent", "Hover lift", "Pointer lighting"],
    palet: ["#064E3B", "#C9A86A", "#021E17"],
  },
  {
    id: "cyber-vault",
    nomor: "02",
    nama: "3D Cyber Vault & Asset Security",
    deskripsi:
      "Brankas 3D melayang dengan pendar hijau emerald berlapis, visualisasi bahwa jaminan tersimpan terkunci dan terpantau.",
    interaksi: ["Camera parallax", "Vault membuka saat hover", "Ring rotation", "Emerald pulse", "Depth"],
    palet: ["#064E3B", "#34D399", "#021E17"],
  },
  {
    id: "ai-mascot",
    nomor: "03",
    nama: "3D Cyber Mascot (A.I. Assistant)",
    deskripsi:
      "Maskot A.I. Cyber Assistant 3D yang melayang dan menjaga kontak mata dengan kursor pengunjung, siap menjawab pertanyaan produk.",
    interaksi: ["Mata mengikuti kursor", "Hover respons", "Cahaya pointer", "Orbit partikel", "Napas halus"],
    palet: ["#04372A", "#5EEAD4", "#021E17"],
  },
  {
    id: "ledger-matrix",
    nomor: "04",
    nama: "3D Ledger Matrix & Node Network",
    deskripsi:
      "Jaringan node dan balok 3D transparan yang menyalurkan pulse transaksi — gambaran ledger internal yang tercatat dan dapat ditelusuri.",
    interaksi: ["Node network", "Pulse transaksi", "Mouse parallax", "Grid depth", "Light trails"],
    palet: ["#04372A", "#6EE7B7", "#021E17"],
  },
  {
    id: "loan-simulator",
    nomor: "05",
    nama: "3D Interactive Loan Simulator",
    deskripsi:
      "Simulator 3D interaktif: geser tenor dan koin emerald berputar mengikuti perubahan, memberi gambaran biaya sebelum mengajukan.",
    interaksi: ["Slider tenor", "Koin 3D berputar", "Live counter", "Mouse tilt", "Depth ring"],
    palet: ["#064E3B", "#FBBF24", "#021E17"],
  },
  {
    id: "quantum-portal",
    nomor: "06",
    nama: "3D Gateway & Quantum Portal",
    deskripsi:
      "Gerbang portal berstruktur geometri dengan partikel melayang, menandai pintu masuk digital ke layanan PINDAI.",
    interaksi: ["Portal particle", "Geometri berputar", "Cursor parallax", "Scan ring", "Depth fog"],
    palet: ["#021E17", "#4ADE80", "#021E17"],
  },
];

/** Indeks preset scene (0..5); template tak dikenal jatuh ke preset default. */
export function landingTemplatePreset(nilai: string | null | undefined): number {
  const index = LANDING_TEMPLATE_IDS.indexOf(nilai as LandingTemplateId);
  if (index >= 0) return index;
  return LANDING_TEMPLATE_IDS.indexOf(DEFAULT_LANDING_TEMPLATE);
}

/** Pemeriksa allowlist — satu-satunya gerbang yang dipakai backend & klien. */
export function isLandingTemplateId(nilai: unknown): nilai is LandingTemplateId {
  return typeof nilai === "string" && (LANDING_TEMPLATE_IDS as readonly string[]).includes(nilai);
}

/**
 * Normalisasi nilai apa pun menjadi template yang selalu dapat dirender.
 * Nilai tak dikenal TIDAK dianggap error: landing page memakai default agar
 * pengunjung tidak pernah melihat halaman kosong.
 */
export function templateLandingAman(nilai: string | null | undefined): LandingTemplateId {
  return isLandingTemplateId(nilai) ? nilai : DEFAULT_LANDING_TEMPLATE;
}

/** Metadata satu template (untuk kartu admin, label, dan fallback CSS). */
export function landingTemplateInfo(nilai: string | null | undefined): LandingTemplateInfo {
  const id = templateLandingAman(nilai);
  const info = LANDING_TEMPLATES.find((template) => template.id === id);
  // `LANDING_TEMPLATES` selalu memuat default, jadi cabang ini hanya pengaman tipe.
  return info ?? LANDING_TEMPLATES[0];
}

/** Nama tampilan template, mis. "04 — 3D LEDGER MATRIX & NODE NETWORK". */
export function labelTemplateLanding(nilai: string | null | undefined): string {
  const info = landingTemplateInfo(nilai);
  return `${info.nomor} — ${info.nama.toUpperCase()}`;
}
