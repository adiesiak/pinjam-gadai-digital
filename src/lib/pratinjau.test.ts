/**
 * Run: bun src/lib/pratinjau.test.ts
 *
 * Uji util pratinjau. Inti yang dijaga: salinan sesi admin harus benar-benar
 * bisa dikembalikan — kalau tidak, "masuk sebagai" akan mengunci Super Admin di
 * akun orang lain. Karena itu yang diuji adalah perilaku penyimpanan token
 * (termasuk saat penyimpanan lokal kosong atau rusak), bukan sekadar bentuk
 * nilainya.
 *
 * Penyimpanan lokal dipalsukan agar util ini teruji di lingkungan tanpa DOM.
 */
import {
  adaSesiAsli,
  bacaNonce,
  bersihkanPenandaPratinjau,
  buatNonce,
  KUNCI_NONCE,
  KUNCI_SESI_ASLI,
  pulihkanSesiAsli,
  simpanNonce,
  simpanSesiAsli,
} from "./pratinjau";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

/** Penyimpanan lokal palsu — cukup lengkap untuk util ini. */
class PenyimpananPalsu {
  private peta = new Map<string, string>();
  get length(): number {
    return this.peta.size;
  }
  key(i: number): string | null {
    return [...this.peta.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.peta.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.peta.set(k, String(v));
  }
  removeItem(k: string): void {
    this.peta.delete(k);
  }
  clear(): void {
    this.peta.clear();
  }
}

const penyimpanan = new PenyimpananPalsu();
(globalThis as unknown as { window: unknown }).window = { localStorage: penyimpanan };

/** Alamat deployment dipakai sebagai namespace kunci Convex Auth. */
const NS = "httpsxyzconvexcloud";
const KUNCI_JWT = `__convexAuthJWT_${NS}`;
const KUNCI_REFRESH = `__convexAuthRefreshToken_${NS}`;

function setAdmin(padaJwt = "token-admin", padaRefresh = "refresh-admin"): void {
  penyimpanan.setItem(KUNCI_JWT, padaJwt);
  penyimpanan.setItem(KUNCI_REFRESH, padaRefresh);
}

// ===== 1. Nonce acak yang cocok dengan pagar server =====
{
  const a = buatNonce();
  const b = buatNonce();
  ok(/^[0-9a-f]{48}$/.test(a), "nonce berbentuk heksadesimal 48 karakter");
  ok(a.length >= 16 && a.length <= 64, "panjang nonce masuk rentang yang diterima server");
  ok(a !== b, "dua permintaan menghasilkan nonce berbeda");
}

// ===== 2. Tanpa kunci Convex Auth, sesi admin tidak bisa disalin =====
{
  penyimpanan.clear();
  ok(!adaSesiAsli(), "belum ada salinan sesi admin");
  ok(!simpanSesiAsli(), "penyalinan ditolak bila tidak ada token untuk disalin");
}

// ===== 3. Salinan sesi admin dibuat hanya saat tokennya ada =====
{
  penyimpanan.clear();
  setAdmin();
  ok(simpanSesiAsli(), "sesi admin tersalin saat token tersedia");
  ok(adaSesiAsli(), "salinan sesi admin terbaca kembali");
}

// ===== 4. Nonce disimpan dan dibersihkan bersama penandanya =====
{
  penyimpanan.clear();
  ok(bacaNonce() === null, "belum ada nonce sebelum pratinjau");
  simpanNonce("abcdef0123456789abcdef0123456789");
  ok(bacaNonce() === "abcdef0123456789abcdef0123456789", "nonce tersimpan & terbaca");
  setAdmin();
  simpanSesiAsli();
  bersihkanPenandaPratinjau();
  ok(bacaNonce() === null, "nonce dibuang");
  ok(!adaSesiAsli(), "salinan sesi admin dibuang");
}

// ===== 5. Sesi admin benar-benar pulih setelah dipakai sesi akun target =====
{
  penyimpanan.clear();
  penyimpanan.setItem("pindai.sessionId", "sesi-perangkat");
  setAdmin("token-admin", "refresh-admin");
  ok(simpanSesiAsli(), "sesi admin tersalin sebelum berpindah");
  simpanNonce("0123456789abcdef0123456789abcdef");

  // Sesi berpindah: Convex Auth menulis token akun target.
  setAdmin("token-target", "refresh-target");
  penyimpanan.setItem(`__convexAuthServerStateFetchTime_${NS}`, "123");

  ok(pulihkanSesiAsli(), "sesi admin dipulihkan");
  ok(penyimpanan.getItem(KUNCI_JWT) === "token-admin", "JWT admin kembali");
  ok(penyimpanan.getItem(KUNCI_REFRESH) === "refresh-admin", "refresh token admin kembali");
  ok(
    penyimpanan.getItem(`__convexAuthServerStateFetchTime_${NS}`) === null,
    "cap waktu milik sesi target tidak tertinggal",
  );
  ok(bacaNonce() === null, "penanda pratinjau dibersihkan setelah pulih");
  ok(!adaSesiAsli(), "salinan sesi admin dibuang setelah dipulihkan");
  ok(
    penyimpanan.getItem("pindai.sessionId") === "sesi-perangkat",
    "kunci non-auth tidak ikut tersentuh",
  );
}

// ===== 6. Salinan hilang atau rusak: pulihkan mengembalikan false =====
{
  penyimpanan.clear();
  setAdmin("token-target");
  ok(!pulihkanSesiAsli(), "pulih gagal bila tidak ada salinan sesi admin");
  ok(penyimpanan.getItem(KUNCI_JWT) === "token-target", "token target tidak dihapus saat gagal");

  penyimpanan.setItem(KUNCI_SESI_ASLI, "{bukan json");
  ok(!pulihkanSesiAsli(), "pulih gagal bila salinan rusak");

  penyimpanan.setItem(KUNCI_SESI_ASLI, JSON.stringify({ pada: Date.now(), token: {} }));
  ok(!pulihkanSesiAsli(), "pulih gagal bila salinan kosong");
}

console.log(`\npratinjau: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
