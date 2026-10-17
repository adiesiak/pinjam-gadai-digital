/**
 * Uji aturan pintu masuk Google yang murni (tanpa Convex/browser).
 * Run: bun src/lib/akunGoogle.test.ts
 *
 * Yang dijaga: hanya identitas dengan email TERVERIFIKASI Google yang diterima
 * (dasar penautan otomatis ke akun lama), dan alamat kembali selalu jalur
 * relatif satu situs dengan parameter lain tetap utuh.
 */
import {
  NILAI_GOOGLE_KEMBALI,
  PARAM_GOOGLE_KEMBALI,
  identitasGoogle,
  urlPulangGoogle,
} from "./akunGoogle";

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

// ===== identitasGoogle =====

eq(
  identitasGoogle({
    sub: "1234567890",
    email: "budi@contoh.com",
    email_verified: true,
  }),
  { sub: "1234567890", email: "budi@contoh.com" },
  "profil Google lengkap diterima apa adanya",
);

eq(
  identitasGoogle({
    sub: "1234567890",
    email: "budi@contoh.com",
    emailVerified: true,
  }),
  { sub: "1234567890", email: "budi@contoh.com" },
  "kunci emailVerified (profil yang sudah dinormalkan) juga diterima",
);

eq(
  identitasGoogle({ sub: "1", email: "budi@contoh.com" }),
  null,
  "tanpa penanda verifikasi email, profil ditolak",
);

eq(
  identitasGoogle({
    sub: "1",
    email: "budi@contoh.com",
    email_verified: false,
  }),
  null,
  "email yang dinyatakan TIDAK terverifikasi ditolak",
);

eq(
  identitasGoogle({
    sub: "1",
    email: "budi@contoh.com",
    email_verified: "true",
  }),
  null,
  "penanda verifikasi harus boolean, bukan teks",
);

eq(
  identitasGoogle({ sub: "1", email_verified: true }),
  null,
  "tanpa email sama sekali tidak ada yang bisa ditautkan",
);

eq(
  identitasGoogle({ email: "budi@contoh.com", email_verified: true }),
  null,
  "tanpa sub, akun Google tidak punya identitas stabil",
);

eq(
  identitasGoogle({
    sub: "  1  ",
    email: "  budi@contoh.com  ",
    email_verified: true,
  }),
  { sub: "1", email: "budi@contoh.com" },
  "spasi di tepi sub/email dipangkas",
);

eq(
  identitasGoogle({ sub: "", email: "   ", email_verified: true }),
  null,
  "teks kosong dianggap tidak ada",
);

eq(
  identitasGoogle({ sub: 7, email: "budi@contoh.com", email_verified: true }),
  null,
  "sub non-teks ditolak",
);

// ===== urlPulangGoogle =====

const tanpaParameter = new URLSearchParams();
eq(
  urlPulangGoogle(tanpaParameter, "/auth"),
  `/auth?${PARAM_GOOGLE_KEMBALI}=${NILAI_GOOGLE_KEMBALI}`,
  "alamat kembali selalu membawa penanda Google",
);

const denganReturnTo = new URLSearchParams({ returnTo: "/dashboard?tab=kyc" });
eq(
  urlPulangGoogle(denganReturnTo, "/auth"),
  `/auth?returnTo=%2Fdashboard%3Ftab%3Dkyc&${PARAM_GOOGLE_KEMBALI}=${NILAI_GOOGLE_KEMBALI}`,
  "returnTo dipertahankan supaya tujuan akhir tidak hilang",
);

eq(
  urlPulangGoogle(new URLSearchParams({ [PARAM_GOOGLE_KEMBALI]: "0" }), "/auth"),
  `/auth?${PARAM_GOOGLE_KEMBALI}=${NILAI_GOOGLE_KEMBALI}`,
  "penanda lama ditimpa, bukan ditumpuk",
);

const asal = new URLSearchParams({ returnTo: "/dashboard" });
urlPulangGoogle(asal, "/auth");
eq(
  asal.toString(),
  "returnTo=%2Fdashboard",
  "parameter masukan tidak diubah di tempat",
);

eq(
  new URL(urlPulangGoogle(new URLSearchParams(), "/auth"), "https://pindai.test")
    .origin,
  "https://pindai.test",
  "alamat kembali relatif, jadi tetap di situs aplikasi",
);

console.log(`akunGoogle: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
