/**
 * Uji registry template landing 3D (murni, tanpa server & tanpa React).
 * Run: bun src/lib/landingTemplate.test.ts
 *
 * Yang dijaga:
 *  - tepat ENAM template terdaftar dengan ID dari allowlist;
 *  - nomor tampilan berurutan 01..06 dan tidak ada ID ganda;
 *  - nilai tak dikenal (null/undefined/string asing/objek) jatuh ke default,
 *    bukan melempar error — landing page tidak boleh kosong;
 *  - pemeriksa allowlist menolak apa pun yang bukan string ID yang sah
 *    (ini gerbang yang sama dipakai mutation backend).
 */
import {
  DEFAULT_LANDING_TEMPLATE,
  isLandingTemplateId,
  labelTemplateLanding,
  LANDING_TEMPLATE_IDS,
  LANDING_TEMPLATES,
  landingTemplateInfo,
  landingTemplatePreset,
  templateLandingAman,
} from "./landingTemplate";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== 1. Jumlah & urutan =====
eq(LANDING_TEMPLATE_IDS.length, 6, "enam ID template terdaftar");
eq(LANDING_TEMPLATES.length, 6, "enam metadata template terdaftar");
eq(
  LANDING_TEMPLATES.map((template) => template.id).join(","),
  LANDING_TEMPLATE_IDS.join(","),
  "urutan metadata mengikuti urutan allowlist (nomor preset stabil)",
);
eq(
  LANDING_TEMPLATES.map((template) => template.nomor).join(","),
  "01,02,03,04,05,06",
  "penomoran tampilan 01..06 berurutan",
);
ok(
  new Set(LANDING_TEMPLATE_IDS).size === LANDING_TEMPLATE_IDS.length,
  "tidak ada ID template ganda",
);
ok(
  LANDING_TEMPLATES.every(
    (template) => template.nama.trim() !== "" && template.deskripsi.trim() !== "",
  ),
  "setiap template punya nama & deskripsi",
);
ok(
  LANDING_TEMPLATES.every((template) => template.interaksi.length > 0),
  "setiap template mencantumkan interaksi yang aktif",
);
ok(isLandingTemplateId(DEFAULT_LANDING_TEMPLATE), "default template ada di allowlist");

// ===== 2. Allowlist menolak yang tidak sah =====
ok(isLandingTemplateId("orbit"), "ID sah diterima");
ok(!isLandingTemplateId("ORBIT"), "ID beda huruf besar ditolak (whitelist persis)");
ok(!isLandingTemplateId(""), "string kosong ditolak");
ok(!isLandingTemplateId("__proto__"), "kunci proto ditolak");
ok(!isLandingTemplateId("<script>"), "injeksi nama komponen ditolak");
ok(!isLandingTemplateId(null), "null ditolak");
ok(!isLandingTemplateId(undefined), "undefined ditolak");
ok(!isLandingTemplateId(4), "angka ditolak");
ok(!isLandingTemplateId({ template: "orbit" }), "objek ditolak");

// ===== 3. Fallback aman =====
eq(templateLandingAman("vault"), "vault", "ID sah dikembalikan apa adanya");
eq(templateLandingAman(null), DEFAULT_LANDING_TEMPLATE, "null → default");
eq(templateLandingAman(undefined), DEFAULT_LANDING_TEMPLATE, "undefined → default");
eq(templateLandingAman(""), DEFAULT_LANDING_TEMPLATE, "kosong → default");
eq(templateLandingAman("tema-lama"), DEFAULT_LANDING_TEMPLATE, "nilai lama/asing → default");
eq(
  landingTemplateInfo("entah").id,
  DEFAULT_LANDING_TEMPLATE,
  "info template tak dikenal memakai metadata default",
);
eq(landingTemplateInfo("city").nomor, "06", "info template sah memakai metadatanya sendiri");
eq(labelTemplateLanding("orbit"), "04 — PINDAI ORBIT", "label template lengkap dengan nomor");
eq(
  labelTemplateLanding(undefined),
  `01 — ${landingTemplateInfo(DEFAULT_LANDING_TEMPLATE).nama.toUpperCase()}`,
  "label fallback tetap menyebut nomor & nama",
);

// ===== 4. Nomor preset scene =====
eq(landingTemplatePreset("moonlit"), 0, "preset pertama = moonlit");
eq(landingTemplatePreset("city"), 5, "preset terakhir = city");
eq(landingTemplatePreset("asing"), 0, "preset tak dikenal jatuh ke preset default");
ok(
  LANDING_TEMPLATE_IDS.every((id, index) => landingTemplatePreset(id) === index),
  "setiap ID memetakan ke indeksnya sendiri (tidak ada preset bertabrakan)",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`landingTemplate: ${passed} lulus`);
