/**
 * TOTP (RFC 6238) tests for PINDAI 2FA — dependency-free, same convention as
 * financial.test.ts: runs via `bun test src/lib/totp.test.ts` or plain tsx/node.
 */
import { base32Decode, base32Encode, otpauthUri, totpAt, verifyTotpCode } from "./totp";

let passed = 0;
let failed = 0;

function ok(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}

function arrEq(a: Uint8Array, b: Uint8Array, label: string) {
  eq(Array.from(a).join(","), Array.from(b).join(","), label);
}

async function main() {
  // ---- base32: vektor RFC 4648 (tanpa padding) ----
  const enc = (s: string) => base32Encode(new TextEncoder().encode(s));
  eq(enc(""), "", "base32 encode kosong");
  eq(enc("f"), "MY", "base32 encode 'f'");
  eq(enc("fo"), "MZXQ", "base32 encode 'fo'");
  eq(enc("foo"), "MZXW6", "base32 encode 'foo'");
  eq(enc("foob"), "MZXW6YQ", "base32 encode 'foob'");
  eq(enc("fooba"), "MZXW6YTB", "base32 encode 'fooba'");
  eq(enc("foobar"), "MZXW6YTBOI", "base32 encode 'foobar'");

  // ---- base32 roundtrip ----
  for (const s of ["", "a", "abc", "secret key pindai", "1234567890abcdef"]) {
    const bytes = new TextEncoder().encode(s);
    const back = new TextDecoder().decode(base32Decode(base32Encode(bytes)));
    eq(back, s, `base32 roundtrip '${s}'`);
  }

  // ---- decode menerima lowercase & spasi ----
  arrEq(base32Decode("MZXW6YTBOI"), base32Decode("mzxw 6ytb oi"), "decode toleran format");

  // ---- TOTP: secret test RFC 6238 (ASCII "12345678901234567890") ----
  const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

  const code59 = await totpAt(RFC_SECRET, Math.floor(59 / 30));
  ok(/^\d{6}$/.test(code59), "kode T=59 berformat 6 digit");

  // Deterministik & beda antar counter.
  const c = Math.floor(1_700_000_000 / 30);
  eq(await totpAt(RFC_SECRET, c), await totpAt(RFC_SECRET, c), "totpAt deterministik");
  ok(
    (await totpAt(RFC_SECRET, 1000)) !== (await totpAt(RFC_SECRET, 1001)),
    "kode beda antar counter",
  );

  // ---- verifyTotpCode window ±1 step ----
  const atMs = 1_700_000_000_000;
  const counter = Math.floor(atMs / 30_000);
  const now = await totpAt(RFC_SECRET, counter);
  const prev = await totpAt(RFC_SECRET, counter - 1);
  const next = await totpAt(RFC_SECRET, counter + 1);
  const far = await totpAt(RFC_SECRET, counter + 5);

  eq(await verifyTotpCode(RFC_SECRET, now, atMs), true, "verify kode saat ini");
  eq(await verifyTotpCode(RFC_SECRET, prev, atMs), true, "verify kode -1 step");
  eq(await verifyTotpCode(RFC_SECRET, next, atMs), true, "verify kode +1 step");
  eq(await verifyTotpCode(RFC_SECRET, far, atMs), false, "tolak kode di luar window");
  eq(await verifyTotpCode(RFC_SECRET, "000000", atMs), false, "tolak kode salah");
  eq(await verifyTotpCode(RFC_SECRET, "abc123", atMs), false, "tolak format non-digit");
  eq(await verifyTotpCode(RFC_SECRET, "12345", atMs), false, "tolak kode pendek");

  // ---- otpauth URI ----
  const uri = otpauthUri("JBSWY3DPEHPK3PXP", "admin@pindai.biz.id");
  ok(uri.startsWith("otpauth://totp/PINDAI%3Aadmin%40pindai.biz.id?"), "otpauth label ter-encode");
  ok(uri.includes("secret=JBSWY3DPEHPK3PXP"), "otpauth berisi secret");
  ok(uri.includes("issuer=PINDAI"), "otpauth berisi issuer");
  ok(uri.includes("digits=6") && uri.includes("period=30"), "otpauth parameter 6 digit / 30 detik");

  console.log(`totp tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
