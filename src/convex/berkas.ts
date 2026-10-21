import type { Id } from "./_generated/dataModel";

/**
 * Tautan berumur pendek untuk berkas penyimpanan Convex.
 *
 * `ctx.storage.getUrl()` menghasilkan URL PERMANEN yang bisa dibuka siapa pun
 * yang memegangnya — Convex tidak punya izin per-berkas. Untuk KTP, selfie,
 * slip gaji, dan foto jaminan itu terlalu terbuka: satu tautan yang pernah
 * diteruskan tetap hidup selamanya.
 *
 * Di sini URL dibuat sendiri: `/berkas?id=…&exp=…&sig=…` dengan tanda tangan
 * SHA-256 atas id + waktu kedaluwarsa memakai rahasia server. Endpoint
 * `/berkas` (lihat `http.ts`) memeriksa tanda tangan itu sebelum menyajikan
 * berkas, jadi tautan yang bocor mati setelah satu jam.
 */

/** Umur tautan; cukup untuk satu sesi peninjauan admin, bukan untuk dibagikan. */
export const MASA_TAUTAN_BERKAS_MS = 60 * 60 * 1000;

function keHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** ASCII → byte tanpa TextEncoder (aman di seluruh runtime Convex). */
function keBytes(teks: string): Uint8Array {
  const bytes = new Uint8Array(teks.length);
  for (let i = 0; i < teks.length; i += 1) bytes[i] = teks.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Rahasia penanda tangan. `BERKAS_LINK_SECRET` disarankan di produksi;
 * `JWT_PRIVATE_KEY` (sudah ada untuk Convex Auth) dipakai sebagai cadangan
 * supaya tautan tetap tidak bisa dipalsukan tanpa konfigurasi tambahan.
 */
function rahasiaTautan(): string {
  return (
    process.env.BERKAS_LINK_SECRET ??
    process.env.JWT_PRIVATE_KEY ??
    "pindai-berkas-lokal"
  );
}

async function tandaTangan(id: string, kedaluwarsa: number): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    keBytes(`pindai:berkas:v1:${rahasiaTautan()}:${id}:${kedaluwarsa}`) as unknown as ArrayBuffer,
  );
  return keHex(new Uint8Array(digest));
}

/**
 * Alamat deployment Convex (`.convex.site`), bukan `.convex.cloud`.
 * `SITE_URL` dipakai sebagai cadangan untuk deployment yang menyetelnya manual.
 */
function dasarSitus(): string {
  return (process.env.CONVEX_SITE_URL ?? process.env.SITE_URL ?? "").replace(/\/+$/, "");
}

/** Bandingkan dua tanda tangan tanpa berhenti di byte pertama yang beda. */
function sama(masukan: string, diharapkan: string): boolean {
  let beda = masukan.length ^ diharapkan.length;
  const panjang = Math.max(masukan.length, diharapkan.length);
  for (let i = 0; i < panjang; i += 1) {
    beda |= (masukan.charCodeAt(i) || 0) ^ (diharapkan.charCodeAt(i) || 0);
  }
  return beda === 0;
}

/** URL sementara untuk satu berkas; null bila tidak ada berkas. */
export async function tautanBerkas(
  id: Id<"_storage"> | null | undefined,
  sekarang: number = Date.now(),
): Promise<string | null> {
  if (id === null || id === undefined) return null;
  const kedaluwarsa = sekarang + MASA_TAUTAN_BERKAS_MS;
  const sig = await tandaTangan(id, kedaluwarsa);
  return `${dasarSitus()}/berkas?id=${encodeURIComponent(id)}&exp=${kedaluwarsa}&sig=${sig}`;
}

/** Sah bila tanda tangan cocok dan belum kedaluwarsa. */
export async function periksaTautanBerkas({
  id,
  exp,
  sig,
  sekarang = Date.now(),
}: {
  id: string;
  exp: number;
  sig: string;
  sekarang?: number;
}): Promise<boolean> {
  if (id === "" || sig === "" || !Number.isFinite(exp)) return false;
  if (exp <= sekarang) return false;
  // Tolak tautan berumur panjang meski ditandatangani: umur hanya boleh
  // sepanjang yang diterbitkan `tautanBerkas`.
  if (exp > sekarang + MASA_TAUTAN_BERKAS_MS) return false;
  return sama(sig, await tandaTangan(id, exp));
}
