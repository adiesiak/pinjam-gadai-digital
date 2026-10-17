/**
 * Uji bentuk konfigurasi yang dikirim panel admin ke `system.saveConfig`.
 * Run: bun src/lib/system-config.test.ts
 *
 * Kenapa ada: `versi` dimiliki SERVER — ia dinaikkan sendiri pada setiap simpan
 * dan rollback. Panel admin menyimpan seluruh `SystemConfig` di state formulir,
 * jadi nomor versi itu ikut terbawa saat objeknya di-spread. Validator Convex
 * menolak field tak dikenal, sehingga SATU field sisa membuat seluruh
 * penyimpanan gagal ("Object contains extra field `versi`"). Uji ini menjaga
 * pembuangan itu tetap terpasang di setiap jalur simpan.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG, tanpaVersiConfig } from "./system-config";

let passed = 0;
let failed = 0;

function ok(label: string, kondisi: boolean): void {
  if (kondisi) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

/** Punya kunci sendiri — `lib` proyek ini di bawah ES2022, jadi tanpa `Object.hasOwn`. */
function punya(objek: object, kunci: string): boolean {
  return Object.prototype.hasOwnProperty.call(objek, kunci);
}

// ===== Helper =====
const bersih = tanpaVersiConfig(DEFAULT_CONFIG);
ok("versi dibuang", !punya(bersih, "versi"));
ok(
  "tidak ada pengaturan lain yang ikut terbuang",
  Object.keys(bersih).length === Object.keys(DEFAULT_CONFIG).length - 1,
);
ok("nilai pengaturan tidak berubah", bersih.persenBunga === DEFAULT_CONFIG.persenBunga);
ok("nilai bawaan tidak dimutasi", punya(DEFAULT_CONFIG, "versi"));

// ===== Payload yang dulu gagal =====
// Bentuk persis keluhan server: seluruh konfigurasi tersimpan PLUS `versi`.
const tersimpan = { ...DEFAULT_CONFIG, versi: 7, persenBunga: 24 };
const dikirim = tanpaVersiConfig({ ...DEFAULT_CONFIG, ...tersimpan });
ok("payload simpan tanpa versi", !punya(dikirim, "versi"));
ok("perubahan admin tetap terkirim", dikirim.persenBunga === 24);
ok("rekening ikut terkirim", dikirim.rekeningUsahaBank === DEFAULT_CONFIG.rekeningUsahaBank);

// ===== Perkabelan di panel: setiap jalur simpan melewati helper =====
const sumber = readFileSync(
  fileURLToPath(new URL("../components/admin/SystemConfigPanel.tsx", import.meta.url)),
  "utf8",
);
ok("tombol Simpan mengirim payload bersih", sumber.includes("save(tanpaVersiConfig(form))"));
ok(
  "kill switch mengirim payload bersih",
  sumber.includes("tanpaVersiConfig({ ...form, killSwitch"),
);
ok(
  "cast yang menyembunyikan field ekstra sudah hilang",
  !sumber.includes("as Parameters<typeof save>[0]"),
);
ok("formulir diisi dari nilai tersimpan tanpa versi", sumber.includes("setForm(formTersimpan())"));

console.log(`system-config tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
