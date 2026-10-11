/**
 * Uji aturan tombol modal "Perjanjian Pinjaman" (`src/lib/perjanjianTtd.ts`)
 * plus perkabelan komponennya (`src/components/contract/ContractSigningDialog.tsx`).
 * Run: bun src/lib/perjanjianTtd.test.ts
 *
 * Dua bagian:
 *  1. **Aturan murni** — kapan tanda tangan dianggap siap dan kapan tombol kirim
 *     boleh ditekan. Termasuk kasus yang paling mudah rusak: gambar tanda tangan
 *     yang sudah termuat dari perjanjian ini harus membuat tombol aktif TANPA
 *     syarat rintangan tambahan.
 *  2. **Perkabelan di komponen** — karena keadaan persetujuan diisi otomatis di
 *     dalam efek React (tidak bisa dirender tanpa DOM/kanvas), sumber dialognya
 *     dibaca sebagai teks dan diperiksa: pengisian otomatis saat modal dibuka,
 *     pengisian otomatis saat goresan dimulai, tombol yang memakai aturan murni,
 *     serta kotak centang yang tetap bisa dimatikan peminjam sendiri.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  bolehKirimPerjanjian,
  KELAS_TOMBOL_SETUJU_PERJANJIAN,
  tandaTanganSiap,
} from "@/lib/perjanjianTtd";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(teks: string, cari: string, label: string): void {
  ok(teks.includes(cari), `${label} (memuat "${cari}")`);
}
function tidakAda(teks: string, cari: string, label: string): void {
  ok(!teks.includes(cari), `${label} (tidak memuat "${cari}")`);
}

// ===== 1. Aturan murni =====
const GAMBAR_LAMA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

ok(tandaTanganSiap(false, null) === false, "kanvas kosong tanpa gambar lama: belum siap");
ok(tandaTanganSiap(true, null) === true, "ada goresan baru: siap ditandatangani");
ok(
  tandaTanganSiap(false, GAMBAR_LAMA) === true,
  "gambar tanda tangan lama yang termuat: langsung siap TANPA goresan baru",
);
ok(tandaTanganSiap(true, GAMBAR_LAMA) === true, "goresan baru + gambar lama: tetap siap");

ok(
  bolehKirimPerjanjian({ busy: false, consentChecked: true, siap: true }) === true,
  "persetujuan otomatis + tanda tangan siap: satu klik boleh mengirim",
);
ok(
  bolehKirimPerjanjian({ busy: false, consentChecked: false, siap: true }) === false,
  "persetujuan dibatalkan sendiri: tombol terkunci lagi",
);
ok(
  bolehKirimPerjanjian({ busy: false, consentChecked: true, siap: false }) === false,
  "belum ada tanda tangan sama sekali: tombol belum aktif",
);
ok(
  bolehKirimPerjanjian({ busy: true, consentChecked: true, siap: true }) === false,
  "mutasi berjalan: tombol terkunci (tidak terkirim dua kali)",
);

for (const kelas of ["bg-emerald-800", "hover:bg-emerald-900", "text-white", "cursor-pointer"]) {
  ada(KELAS_TOMBOL_SETUJU_PERJANJIAN, kelas, "tombol perjanjian memakai kelas yang diminta");
}
tidakAda(KELAS_TOMBOL_SETUJU_PERJANJIAN, "#064E3B", "tombol tidak lagi memakai hijau lama");
ada(
  KELAS_TOMBOL_SETUJU_PERJANJIAN,
  "disabled:cursor-not-allowed",
  "tombol terkunci tetap terbaca terkunci",
);

// ===== 2. Perkabelan di komponen =====
// Komentar menjelaskan aturannya sendiri, jadi prosa dibuang lebih dulu supaya
// pemeriksaan ini benar-benar membaca kode.
const dialog = readFileSync(
  fileURLToPath(new URL("../components/contract/ContractSigningDialog.tsx", import.meta.url)),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

ada(dialog, 'from "@/lib/perjanjianTtd"', "dialog memakai aturan bersama, bukan salinan aturan");

// Pengisian otomatis #1: saat modal dibuka.
const blokBuka = dialog.slice(
  dialog.indexOf("if (open !== prevOpen) {"),
  dialog.indexOf("const siapTandaTangan"),
);
ok(blokBuka.length > 0, "blok penyegaran keadaan saat modal dibuka ada");
ada(blokBuka, "setConsentChecked(true)", "membuka modal = persetujuan tercentang otomatis");
ada(blokBuka, "setHasSignature(false)", "kanvas dimulai bersih setiap modal dibuka");

// Pengisian otomatis #2: saat peminjam menggambar di kanvas.
ada(
  dialog,
  "const mulaiGores = () => setConsentChecked(true);",
  "menyentuh kanvas = persetujuan tercentang otomatis",
);
ada(
  dialog,
  "pad.addEventListener(\"beginStroke\", mulaiGores)",
  "peristiwa goresan awal terpasang pada kanvas",
);
ada(dialog, "if (!pad.isEmpty()) setConsentChecked(true);", "goresan selesai menyegarkan persetujuan");

// Pengisian otomatis adalah kenyamanan, bukan pencabutan kendali.
ada(dialog, "if (!consentChecked) {", "pengiriman tetap menolak bila persetujuan dimatikan sendiri");
ada(dialog, "setConsentChecked(checked === true);", "kotak centang tetap bisa diubah peminjam");
ada(dialog, 'id="borrower-contract-consent"', "kotak centang persetujuan masih ada dan berlabel");
ada(
  dialog,
  "Saya telah membaca dan menyetujui isi perjanjian ini",
  "kalimat persetujuan yang dicatat masih yang diminta produk",
);

// Tombol: memakai aturan murni, bukan syarat goresan baru.
ada(dialog, "className={KELAS_TOMBOL_SETUJU_PERJANJIAN}", "tombol memakai kelas bersama");
ada(dialog, "disabled={!bolehKirimPerjanjian({", "tombol memakai aturan bersama");
ada(dialog, "siap: siapTandaTangan", "tombol memakai kesiapan tanda tangan bersama");
ada(dialog, "tandaTanganSiap(hasSignature, signature)", "kesiapan tanda tangan memasukkan gambar lama");
tidakAda(
  dialog,
  "disabled={busy || !consentChecked || !hasSignature}",
  "tombol tidak lagi menuntut goresan baru bila gambar lama sudah ada",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`perjanjianTtd: ${passed} lulus`);
