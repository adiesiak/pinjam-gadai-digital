/**
 * TOTP (RFC 6238) — implementasi tanpa dependensi eksternal.
 *
 * Dipakai untuk 2FA Super Admin (Google Authenticator/Authy kompatibel):
 * - Secret di-encode Base32 standar (RFC 4648, tanpa padding).
 * - HMAC-SHA1 via Web Crypto (tersedia di Convex runtime & browser modern).
 * - Window verifikasi ±1 periode untuk toleransi drift jam.
 *
 * Semua fungsi murni & sinkron kecuali verifikasi (async untuk crypto.subtle).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode Uint8Array ke Base32 tanpa padding. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode Base32 ke Uint8Array — menerima lowercase & spasi. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error("Secret TOTP mengandung karakter tidak valid.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Secret acak 20 byte (160 bit) — standar Google Authenticator. */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/** URL otpauth:// untuk QR code Google Authenticator. */
export function otpauthUri(secret: string, account: string, issuer = "PINDAI"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message as unknown as ArrayBuffer);
  return new Uint8Array(sig);
}

/** Hitung kode TOTP pada counter tertentu (30 detik / step). */
export async function totpAt(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  // 64-bit big-endian counter (cukup 8 byte; JS counter selalu < 2^53).
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const digest = await hmacSha1(key, msg);
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

/** Kode TOTP saat ini (berdasarkan waktu). */
export async function totpNow(secret: string, atMs: number = Date.now()): Promise<string> {
  return totpAt(secret, Math.floor(atMs / 30_000));
}

/**
 * Verifikasi kode dengan window ±1 step (toleransi drift ±30 detik).
 * Tanpa window, satu ketidakselarasan jam akan mengunci admin selamanya.
 */
export async function verifyTotpCode(
  secret: string,
  code: string,
  atMs: number = Date.now(),
): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(atMs / 30_000);
  for (const step of [counter, counter - 1, counter + 1]) {
    if (step < 0) continue;
    if ((await totpAt(secret, step)) === clean) return true;
  }
  return false;
}
