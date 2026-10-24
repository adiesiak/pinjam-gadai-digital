/**
 * Uji deteksi jenis kredensial di medan masuk tunggal.
 * Run: bun src/lib/masukKredensial.test.ts
 *
 * Yang dijaga: nomor WhatsApp (bentuk apa pun yang lazim ditulis orang) masuk
 * jalur WhatsApp, email ber-`@` masuk jalur email tanpa diubah selain dipangkas,
 * dan sisanya ditolak SEBELUM ada permintaan kode apa pun dikirim.
 */
import { kredensialMasuk } from "./masukKredensial";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const sama = JSON.stringify(actual) === JSON.stringify(expected);
  if (sama) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ===== jalur WhatsApp =====

eq(
  kredensialMasuk("08123456789"),
  { jenis: "nomor", nomor: "628123456789" },
  "nomor 08… jadi jalur WhatsApp dalam bentuk 62…",
);
eq(
  kredensialMasuk("+62 812-3456-789"),
  { jenis: "nomor", nomor: "628123456789" },
  "spasi, tanda hubung, dan +62 diterima",
);
eq(
  kredensialMasuk("  628123456789  "),
  { jenis: "nomor", nomor: "628123456789" },
  "spasi di tepi dipangkas",
);
eq(
  kredensialMasuk("8123456789"),
  { jenis: "nomor", nomor: "628123456789" },
  "nomor tanpa 0 di depan tetap dikenali",
);

// ===== jalur email =====

eq(
  kredensialMasuk("budi@contoh.com"),
  { jenis: "email", email: "budi@contoh.com" },
  "email masuk jalur email",
);
eq(
  kredensialMasuk("  Budi@Contoh.COM "),
  { jenis: "email", email: "Budi@Contoh.COM" },
  "email hanya dipangkas, huruf besarnya TIDAK diubah (harus cocok persis dengan akun)",
);
eq(
  kredensialMasuk("08123456789@gmail.com"),
  { jenis: "email", email: "08123456789@gmail.com" },
  "alamat ber-@ tidak pernah dibaca sebagai nomor",
);

// ===== ditolak =====

eq(kredensialMasuk(""), { jenis: "tidak-valid" }, "kosong ditolak");
eq(kredensialMasuk("   "), { jenis: "tidak-valid" }, "hanya spasi ditolak");
eq(kredensialMasuk("budi"), { jenis: "tidak-valid" }, "tanpa @ dan bukan nomor ditolak");
eq(
  kredensialMasuk("12345"),
  { jenis: "tidak-valid" },
  "angka terlalu pendek ditolak sebelum dikirim ke gateway",
);
eq(
  kredensialMasuk("+49 151 2345 6789"),
  { jenis: "nomor", nomor: "4915123456789" },
  "nomor pendana luar Indonesia masuk jalur WhatsApp",
);
eq(
  kredensialMasuk("+1 555 0100"),
  { jenis: "tidak-valid" },
  "nomor yang terlalu pendek tetap ditolak",
);

console.log(`masukKredensial: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
