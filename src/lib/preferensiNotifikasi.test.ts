/**
 * Uji aturan preferensi kanal notifikasi (fungsi murni).
 * Run: bun src/lib/preferensiNotifikasi.test.ts
 *
 * Yang dijaga: akun lama tetap menerima pengingat (kosong = aktif), hanya
 * `false` eksplisit yang mematikan kanal, dan pilihan satu kanal tidak
 * mengubah kanal lain.
 */
import {
  PREFERENSI_BAWAAN,
  kanalAktif,
  labelKanalAktif,
  preferensiDariUser,
  type PreferensiNotifikasi,
} from "./preferensiNotifikasi";

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

// ===== Bawaan =====
eq(PREFERENSI_BAWAAN.whatsapp, true, "WhatsApp aktif secara bawaan");
eq(PREFERENSI_BAWAAN.email, true, "email aktif secara bawaan");
eq(kanalAktif(undefined), true, "kanal tanpa pilihan tetap aktif (akun lama)");
eq(kanalAktif(true), true, "kanal yang dinyatakan aktif tetap aktif");
eq(kanalAktif(false), false, "hanya false eksplisit yang mematikan kanal");

// ===== Baris pengguna =====
const bawaan: PreferensiNotifikasi = preferensiDariUser({});
eq(bawaan.whatsapp, true, "pengguna tanpa kolom WhatsApp menerima pengingat");
eq(bawaan.email, true, "pengguna tanpa kolom email menerima pengingat");

const hanyaEmail: PreferensiNotifikasi = preferensiDariUser({
  notifWhatsapp: false,
  notifEmail: true,
});
eq(hanyaEmail.whatsapp, false, "WhatsApp bisa dimatikan sendiri");
eq(hanyaEmail.email, true, "mematikan WhatsApp tidak mematikan email");

const hanyaWa: PreferensiNotifikasi = preferensiDariUser({
  notifWhatsapp: true,
  notifEmail: false,
});
eq(hanyaWa.whatsapp, true, "email bisa dimatikan sendiri");
eq(hanyaWa.email, false, "mematikan email tidak mematikan WhatsApp");

const keduanyaMati = preferensiDariUser({ notifWhatsapp: false, notifEmail: false });
ok(
  !keduanyaMati.whatsapp && !keduanyaMati.email,
  "kedua kanal bisa dimatikan sekaligus",
);

const tanpaUser = preferensiDariUser(null);
eq(tanpaUser.whatsapp, true, "tanpa baris pengguna, WhatsApp dianggap aktif");
eq(tanpaUser.email, true, "tanpa baris pengguna, email dianggap aktif");

// ===== Label =====
eq(labelKanalAktif(true), "Aktif", "kanal aktif berlabel teks");
eq(labelKanalAktif(false), "Nonaktif", "kanal mati berlabel teks");

console.log(`preferensiNotifikasi.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
