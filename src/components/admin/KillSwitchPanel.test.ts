/**
 * Uji gerbang pengaman kill switch (`KillSwitchPanel.tsx`), tanpa DOM.
 * Run: bun src/components/admin/KillSwitchPanel.test.ts
 *
 * Kenapa ada: kill switch memblokir SEMUA pengajuan baru. Sejak panelnya pindah
 * ke menu "Keamanan & Audit" (bukan lagi tombol di kepala panel), satu-satunya
 * yang menahan salah klik adalah dua gerbang ini: kata `NONAKTIFKAN` DAN alasan.
 * Keduanya murni dan diuji di sini supaya aturannya tidak bisa dilonggarkan
 * diam-diam di JSX.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  alasanKillSah,
  KATA_KONFIRMASI_KILL,
  konfirmasiKillSah,
  MIN_ALASAN_KILL,
} from "./KillSwitchPanel";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${String(expected)}, dapat ${String(actual)}`);
  }
}

function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

// ===== Kata kunci =====
eq("kata kunci resmi", KATA_KONFIRMASI_KILL, "NONAKTIFKAN");
ok("kata kunci yang benar diterima", konfirmasiKillSah("NONAKTIFKAN"));
ok("huruf besar/kecil tidak masalah", konfirmasiKillSah("nonaktifkan"));
ok("spasi tepi diabaikan", konfirmasiKillSah("  NONAKTIFKAN  "));
ok("kata lama BEKUKAN tidak lagi sah", !konfirmasiKillSah("BEKUKAN"));
ok("teks kosong ditolak", !konfirmasiKillSah(""));
ok("salah ketik ditolak", !konfirmasiKillSah("NON AKTIFKAN"));

// ===== Alasan =====
eq("panjang minimum alasan", MIN_ALASAN_KILL, 10);
ok("alasan cukup panjang diterima", alasanKillSah("dugaan penyalahgunaan akun"));
ok("alasan pendek ditolak", !alasanKillSah("darurat"));
ok(
  "alasan tepat di ambang diterima",
  alasanKillSah("a".repeat(MIN_ALASAN_KILL)),
);
ok(
  "alasan satu karakter kurang ditolak",
  !alasanKillSah("a".repeat(MIN_ALASAN_KILL - 1)),
);
ok("alasan berisi spasi saja ditolak", !alasanKillSah("          "));

// ===== Perkabelan di dialog: dua gerbang wajib, dan tidak ada kata lama =====
const sumber = readFileSync(
  fileURLToPath(new URL("./KillSwitchPanel.tsx", import.meta.url)),
  "utf8",
);
ok(
  "tombol eksekusi menuntut kata kunci DAN alasan",
  sumber.includes("disabled={!sah || !alasanSah || busy}"),
);
ok("tidak ada sisa kata BEKUKAN", !sumber.includes("BEKUKAN"));
ok(
  "alasan menyatakan terus terang bahwa ia tidak dikirim ke server",
  sumber.includes("tidak") && sumber.includes("hanya menerima"),
);

console.log(`KillSwitchPanel tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
