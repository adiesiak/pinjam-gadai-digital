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
 * Konvensi warna tetap identitas PINDAI Green: hijau emerald sebagai warna
 * dominan, kuningan (brass) hanya aksen. Biru tidak pernah dipakai sebagai
 * palet utama template.
 */

/** ID template yang sah — urutannya juga menjadi nomor preset pada mesin 3D. */
export const LANDING_TEMPLATE_IDS = [
  "moonlit",
  "floating-green",
  "digital-gate",
  "orbit",
  "vault",
  "city",
] as const;

export type LandingTemplateId = (typeof LANDING_TEMPLATE_IDS)[number];

/**
 * Template cadangan. Dipakai saat konfigurasi tidak terbaca, nilainya tak
 * dikenal, atau template aktif gagal dimuat — landing page tidak boleh kosong.
 */
export const DEFAULT_LANDING_TEMPLATE: LandingTemplateId = "moonlit";

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
    id: "moonlit",
    nomor: "01",
    nama: "Moonlit PINDAI",
    deskripsi:
      "Pengalaman finansial sinematik: laut malam, riak air, gerbang kuningan, dan kartu PINDAI yang mengikuti pointer.",
    interaksi: ["Mouse tilt", "Hover lift", "Pointer lighting", "Water ripple", "Parallax"],
    palet: ["#0f3d3a", "#c9a86a", "#04100c"],
  },
  {
    id: "floating-green",
    nomor: "02",
    nama: "Floating Green Card",
    deskripsi:
      "Fintech premium modern: kartu PINDAI melayang sebagai focal point dengan cahaya emerald dan partikel halus.",
    interaksi: ["Mouse tilt", "Hover lift", "Highlight cursor", "Parallax", "Soft particles"],
    palet: ["#1f6a62", "#7fe3b8", "#061512"],
  },
  {
    id: "digital-gate",
    nomor: "03",
    nama: "Digital Gate",
    deskripsi:
      "Gerbang digital futuristik: kisi elektronik, jalur cahaya hijau, dan kartu yang menanggapi arah pointer.",
    interaksi: ["Cursor parallax", "Gate response", "Card tilt", "Light trails", "Fog halus"],
    palet: ["#0c3b34", "#4fd6a4", "#03100d"],
  },
  {
    id: "orbit",
    nomor: "04",
    nama: "PINDAI Orbit",
    deskripsi:
      "Kartu PINDAI sebagai pusat orbit: dua cincin berputar, node digital, dan kedalaman lapisan berbeda.",
    interaksi: ["Card tilt", "Orbit depth", "Pointer lighting", "Node parallax", "Camera halus"],
    palet: ["#12463d", "#62e0aa", "#04120f"],
  },
  {
    id: "vault",
    nomor: "05",
    nama: "PINDAI Vault",
    deskripsi:
      "Gerbang aman futuristik: cincin mekanis berlapis yang membuka sedikit saat hover, kartu di pusat ruang.",
    interaksi: ["Camera parallax", "Vault response", "Ring movement", "Hover membuka", "Depth"],
    palet: ["#0e3a34", "#c9a86a", "#050f0d"],
  },
  {
    id: "city",
    nomor: "06",
    nama: "PINDAI City",
    deskripsi:
      "Ekosistem finansial terhubung: miniatur kota low-poly dengan jalur cahaya rumah → toko → node → PINDAI.",
    interaksi: ["Camera parallax", "City depth", "Network pulse", "Light trails", "Focal stabil"],
    palet: ["#113f38", "#8ff0c4", "#051411"],
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

/** Nama tampilan template, mis. "04 — PINDAI Orbit". */
export function labelTemplateLanding(nilai: string | null | undefined): string {
  const info = landingTemplateInfo(nilai);
  return `${info.nomor} — ${info.nama.toUpperCase()}`;
}
