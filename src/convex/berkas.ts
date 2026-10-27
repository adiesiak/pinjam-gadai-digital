import type { Id } from "./_generated/dataModel";

/**
 * Tautan berumur pendek untuk berkas penyimpanan Convex.
 *
 * `ctx.storage.getUrl()` menghasilkan URL PERMANEN yang bisa dibuka siapa pun
 * yang memegangnya — Convex tidak punya izin per-berkas. Untuk KTP, selfie,
 * slip gaji, dan foto jaminan itu terlalu terbuka: satu tautan yang pernah
 * diteruskan tetap hidup selamanya.
 *
 * Di sini URL dibuat sendiri: `/berkas?id=…&exp=…&sig=…`. Tanda tangannya
 * HMAC-SHA256 atas id + waktu kedaluwarsa memakai rahasia server. Endpoint
 * `/berkas` (lihat `http.ts`) memeriksa tanda tangan itu sebelum menyajikan
 * berkas, jadi tautan yang bocor mati sepuluh menit kemudian.
 *
 * Sepuluh menit, bukan satu jam: tautan ini adalah kredensial bearer — siapa
 * pun yang memegangnya bisa membuka KTP tanpa login — jadi jendela bocornya
 * harus sependek yang masih nyaman untuk sekali peninjauan admin. Halaman yang
 * masih terbuka cukup dimuat ulang untuk mendapat tautan baru.
 */

/** Umur tautan; cukup untuk satu sesi peninjauan admin, bukan untuk dibagikan. */
export const MASA_TAUTAN_BERKAS_MS = 10 * 60 * 1000;

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
 * Variabel environment yang boleh menyediakan rahasia penanda tangan, berurutan
 * menurut prioritas. `JWT_PRIVATE_KEY` disetel Convex Auth pada deployment yang
 * memakai autentikasi, jadi sebagian besar deployment tidak perlu menyetel apa pun.
 */
export const RAHASIA_TAUTAN_VARIABEL = ["BERKAS_LINK_SECRET", "JWT_PRIVATE_KEY"] as const;

/**
 * Rahasia penanda tangan dari environment.
 *
 * Sengaja MELEMPAR bila tidak ada rahasia asli: cadangan yang tertulis di kode
 * membuat tanda tangan bisa dihitung siapa pun yang membaca repositori, dan
 * tautan palsu itu cukup untuk mengunduh KTP, selfie, dan slip gaji.
 */
function rahasiaTautan(): string {
  for (const nama of RAHASIA_TAUTAN_VARIABEL) {
    const nilai = process.env[nama];
    if (nilai !== undefined && nilai.trim() !== "") return nilai;
  }
  throw new Error(
    `Rahasia penanda tangan tautan berkas tidak ada. Setel ${RAHASIA_TAUTAN_VARIABEL.join(
      " atau ",
    )} di environment deployment; tanpa itu tautan berkas sensitif tidak bisa dibuat.`,
  );
}

/**
 * Kunci HMAC di-cache per isolate: `importKey` mahal dan rahasianya tidak
 * berubah selama isolate hidup. Kunci disimpan bersama rahasianya supaya
 * pergantian rahasia (rotasi env) tidak diam-diam memakai kunci lama.
 */
let kunciTersimpan: { rahasia: string; kunci: Promise<CryptoKey> } | null = null;

function kunciHmac(rahasia: string): Promise<CryptoKey> {
  if (kunciTersimpan?.rahasia !== rahasia) {
    kunciTersimpan = {
      rahasia,
      kunci: crypto.subtle.importKey(
        "raw",
        keBytes(rahasia) as unknown as ArrayBuffer,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    };
  }
  return kunciTersimpan.kunci;
}

/**
 * HMAC-SHA256, bukan `SHA-256(rahasia + pesan)`.
 *
 * Hash biasa dengan rahasia di depan rentan *length extension*: siapa pun yang
 * melihat satu tanda tangan bisa menghitung tanda tangan untuk pesan yang
 * ditambah di belakangnya tanpa mengetahui rahasianya. HMAC tidak punya sifat
 * itu. Versi pesan dinaikkan ke `v2` supaya tautan lama (v1) langsung mati,
 * bukan diam-diam masih diterima dengan aturan lama.
 */
async function tandaTangan(id: string, kedaluwarsa: number): Promise<string> {
  const kunci = await kunciHmac(rahasiaTautan());
  const pesan = keBytes(`pindai:berkas:v2:${id}:${kedaluwarsa}`);
  const digest = await crypto.subtle.sign(
    "HMAC",
    kunci,
    pesan as unknown as ArrayBuffer,
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
