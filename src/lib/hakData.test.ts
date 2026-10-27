/** Run: bun src/lib/hakData.test.ts — aturan hak subjek data (pure). */
import {
  KONFIRMASI_HAPUS_AKUN,
  konfirmasiCocok,
  namaBerkasSalinanData,
  posisiTertutup,
} from "./hakData";

let passed = 0;
let failed = 0;
function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`);
  }
}

// --- Frasa konfirmasi -----------------------------------------------------
eq("frasa tepat diterima", konfirmasiCocok(KONFIRMASI_HAPUS_AKUN), true);
eq("spasi tepi diabaikan", konfirmasiCocok(`  ${KONFIRMASI_HAPUS_AKUN} `), true);
eq("besar-kecil huruf diabaikan", konfirmasiCocok("hapus akun saya"), true);
eq("frasa lain ditolak", konfirmasiCocok("HAPUS"), false);
eq("kalimat panjang ditolak", konfirmasiCocok("saya ingin HAPUS AKUN SAYA"), false);
eq("kosong ditolak", konfirmasiCocok(""), false);

// --- Posisi tertutup per jenis catatan ------------------------------------
eq("pinjaman lunas tertutup", posisiTertutup("pinjaman", "lunas"), true);
eq("pinjaman ditolak tertutup", posisiTertutup("pinjaman", "ditolak"), true);
eq("pinjaman dibatalkan tertutup", posisiTertutup("pinjaman", "dibatalkan"), true);
eq("pinjaman didanai masih berjalan", posisiTertutup("pinjaman", "didanai"), false);
eq("pinjaman tahap tinjauan masih berjalan", posisiTertutup("pinjaman", "sedang_direview"), false);
eq("gadai dilepas tertutup", posisiTertutup("gadai", "lunas_dilepas"), true);
eq("gadai aktif masih berjalan", posisiTertutup("gadai", "aktif"), false);
eq("gadai menunggu pelepasan masih berjalan", posisiTertutup("gadai", "menunggu_pelepasan"), false);
eq("kredit lunas tertutup", posisiTertutup("kredit barang", "lunas"), true);
eq("kredit didanai masih berjalan", posisiTertutup("kredit barang", "didanai"), false);

// --- Nama berkas salinan --------------------------------------------------
eq(
  "nama berkas memuat tanggal",
  namaBerkasSalinanData("2026-10-27"),
  "pindai-data-saya-2026-10-27.json",
);

console.log(`hakData tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
