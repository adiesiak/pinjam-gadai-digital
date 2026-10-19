/**
 * Uji teks email pengingat (fungsi murni).
 * Run: bun src/lib/emailPengingat.test.ts
 *
 * Yang dijaga: kalimat pengingat dari WhatsApp dipakai APA ADANYA (tidak ada
 * angka atau status yang dikarang), subjek tetap dikenali sebagai PINDAI, dan
 * keterangan cara mematikan kanal selalu ikut — tanpa sisa placeholder.
 */
import { isiEmailPengingat, subjekEmailPengingat } from "./emailPengingat";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ada(teks: string, bagian: string, label: string): void {
  ok(teks.includes(bagian), `${label} (memuat "${bagian}")`);
}

// ===== Subjek =====
eq(
  subjekEmailPengingat("Pengingat angsuran ke-2 pinjaman PND-1"),
  "PINDAI · Pengingat angsuran ke-2 pinjaman PND-1",
  "subjek diberi nama produk",
);
eq(
  subjekEmailPengingat("  Jatuh tempo hari ini  "),
  "PINDAI · Jatuh tempo hari ini",
  "spasi berlebih di subjek dibuang",
);

// ===== Badan email =====
const isiWa =
  "Halo Rani, angsuran ke-2 pinjaman PND-1 jatuh tempo HARI INI (3 November 2026). Tagihan Rp550.000.";
const email = isiEmailPengingat(isiWa);
ok(email.startsWith(isiWa), "kalimat pengingat dari WhatsApp dipakai apa adanya");
ada(email, "pengingat lewat email aktif", "menjelaskan alasan email dikirim");
ada(email, "Profil & Rekening", "menyebut tempat mematikan kanal");
ok(!email.includes("undefined"), "tidak ada sisa undefined");
ok(!email.includes("NaN"), "tidak ada NaN");
ok(!email.includes("{"), "tidak ada placeholder tersisa");

// Isi dengan spasi di tepi tidak menyisakan baris kosong di awal.
const rapi = isiEmailPengingat("  Halo Budi.  ");
ok(rapi.startsWith("Halo Budi."), "spasi tepi dibuang");
ok(!rapi.startsWith("\n"), "email tidak dimulai dengan baris kosong");

console.log(`emailPengingat.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
