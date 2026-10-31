/**
 * Uji aturan tombol modal "Perjanjian Pinjaman" (`src/lib/perjanjianTtd.ts`)
 * plus perkabelan komponennya (`src/components/contract/ContractSigningDialog.tsx`).
 * Run: bun src/lib/perjanjianTtd.test.ts
 *
 * Dua bagian:
 *  1. **Aturan murni** — kapan tanda tangan dianggap siap dan kapan tombol kirim
 *     boleh ditekan. Persetujuan harus bisa dicatat TANPA gambar tanda tangan
 *     untuk alur TTD manual; gambar lama yang sudah termuat tetap dikenali.
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
  bolehKirimPerjanjian({ busy: false, consentChecked: true }) === true,
  "persetujuan tercentang: boleh dikirim walau belum ada tanda tangan",
);
ok(
  bolehKirimPerjanjian({ busy: false, consentChecked: false }) === false,
  "persetujuan dibatalkan sendiri: tombol terkunci lagi",
);
ok(
  bolehKirimPerjanjian({ busy: true, consentChecked: true }) === false,
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
ada(dialog, "bolehKirimPerjanjian({ busy, consentChecked })", "tombol memakai aturan bersama");
ada(
  dialog,
  "(!menungguTandaTangan || siapTandaTangan)",
  "tombol hanya menuntut gambar saat melengkapi persetujuan yang sudah tersimpan",
);
ada(dialog, "tandaTanganSiap(hasSignature, signature)", "kesiapan tanda tangan memasukkan gambar lama");
ada(dialog, "Setujui Perjanjian", "tombol menawarkan persetujuan tanpa tanda tangan");
ada(
  dialog,
  "dokumen tetap dapat diunduh untuk TTD manual",
  "dialog menjelaskan alur unduh untuk tanda tangan manual",
);
tidakAda(
  dialog,
  "Bubuhkan tanda tangan pada kanvas untuk mengaktifkan tombol kirim.",
  "tanda tangan tidak lagi menjadi syarat tombol persetujuan",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`perjanjianTtd: ${passed} lulus`);
