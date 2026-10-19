import { SITUS_RESMI } from "./tautanAplikasi";

/**
 * Aturan bersama pintu masuk "Masuk dengan Google".
 *
 * Ditaruh di `lib/` supaya bisa diuji tanpa Convex maupun browser (lihat
 * `akunGoogle.test.ts`): sisi server memakai `identitasGoogle` untuk memetakan
 * profil OpenID Google, sisi halaman memakai `urlPulangGoogle` untuk menyusun
 * alamat kembali yang selalu satu situs dengan aplikasi.
 */

/** Nama parameter URL penanda "pengguna baru kembali dari Google". */
export const PARAM_GOOGLE_KEMBALI = "google";

/** Nilai penanda saat halaman dimuat setelah alih-alih ke Google. */
export const NILAI_GOOGLE_KEMBALI = "1";

export type IdentitasGoogle = {
  /** `sub` Google — identitas akun yang stabil untuk orang ini. */
  sub: string;
  /** Email yang sudah diverifikasi Google. */
  email: string;
};

/** Teks berisi saja, atau `null` bila kosong/bukan teks. */
function teksBerisi(nilai: unknown): string | null {
  if (typeof nilai !== "string") return null;
  const berisi = nilai.trim();
  return berisi === "" ? null : berisi;
}

/**
 * Identitas Google yang boleh dipakai masuk, atau `null` bila profilnya tidak
 * membuktikan apa pun.
 *
 * Email WAJIB ditandai terverifikasi Google (`email_verified`): alamat yang
 * belum diverifikasi tidak membuktikan kepemilikan siapa pun, sementara
 * pemetaan inilah satu-satunya dasar penautan otomatis ke akun yang sudah ada.
 * Google mengirim kunci ini dalam bentuk `email_verified` (userinfo OIDC);
 * `emailVerified` dari pemetaan provider juga diterima supaya profil yang sudah
 * dinormalkan tidak ikut ditolak.
 */
export function identitasGoogle(
  profil: Record<string, unknown>,
): IdentitasGoogle | null {
  const sub = teksBerisi(profil.sub);
  const email = teksBerisi(profil.email);
  const terverifikasi =
    profil.email_verified === true || profil.emailVerified === true;
  if (sub === null || email === null || !terverifikasi) return null;
  return { sub, email };
}

/**
 * Apakah kredensial pintu Google sudah terpasang di lingkungan yang menjalankan
 * server.
 *
 * Hanya menjawab ADA/TIDAK — nilainya sendiri tidak pernah keluar dari server.
 * Dipakai supaya tombol "Masuk dengan Google" tidak melempar pengunjung ke
 * halaman galat Google (`401: invalid_client`) di deployment yang kredensialnya
 * belum diisi; tanpa kredensial, `client_id` yang dikirim ke Google kosong.
 *
 * Nama variabelnya mengikuti `@auth/core`: untuk provider ber-`id: "google"`
 * dibaca `AUTH_GOOGLE_ID` dan `AUTH_GOOGLE_SECRET`
 * (lihat node_modules/@auth/core/lib/utils/env.js).
 */
export function googleSiapDari(lingkungan: {
  AUTH_GOOGLE_ID?: string;
  AUTH_GOOGLE_SECRET?: string;
}): boolean {
  return (
    teksBerisi(lingkungan.AUTH_GOOGLE_ID) !== null &&
    teksBerisi(lingkungan.AUTH_GOOGLE_SECRET) !== null
  );
}

/**
 * Origin aplikasi yang dipakai bila `SITE_URL` tidak bisa dipercaya.
 *
 * `SITE_URL` disediakan platform dan pada deployment ini berisi domain BACKEND
 * Convex. Convex Auth memakai `SITE_URL` untuk menyelesaikan alamat kembali
 * OAuth, jadi alamat relatif seperti `/auth?google=1` mendarat di backend dan
 * tampil sebagai "No matching routes found". Nilai di bawah hanya cadangan:
 * begitu `SITE_URL` (atau `APP_ORIGIN`) menunjuk domain aplikasi, nilai itu
 * yang dipakai. Saat aplikasi pindah domain, cukup isi `APP_ORIGIN`.
 */
export const ORIGIN_APLIKASI_BAWAAN = SITUS_RESMI;

/** Origin halaman aplikasi; `cadangan` dipakai bila `SITE_URL` menunjuk backend. */
export function originAplikasi(siteUrl: string | undefined, cadangan: string): string {
  const dasar = cadangan.replace(/\/+$/, "");
  const nilai = teksBerisi(siteUrl);
  if (nilai === null) return dasar;
  try {
    const url = new URL(nilai);
    // Domain backend Convex tidak pernah menyajikan halaman aplikasi.
    if (url.hostname.endsWith(".convex.site") || url.hostname.endsWith(".convex.cloud")) {
      return dasar;
    }
    return url.origin;
  } catch {
    return dasar;
  }
}

/**
 * Alamat kembali setelah OAuth.
 *
 * Relatif selalu ditempel ke origin APLIKASI (bukan backend), absolut hanya
 * diterima bila origin-nya sama. Alamat asing tidak pernah dipakai — `code`
 * sekali pakai di URL itu bisa dipakai orang lain — melainkan jatuh ke beranda
 * aplikasi. Alamat relatif sengaja tetap diizinkan supaya param `returnTo` dari
 * halaman masuk tidak hilang.
 */
export function alamatKembaliGoogle(redirectTo: string | undefined, origin: string): string {
  const dasar = origin.replace(/\/+$/, "");
  const nilai = teksBerisi(redirectTo);
  if (nilai === null) return `${dasar}/`;
  // Karakter kontrol bisa menyamarkan alamat di log/UI; tidak pernah diteruskan.
  const adaKontrol = [...nilai].some((huruf) => {
    const kode = huruf.charCodeAt(0);
    return kode < 32 || kode === 127;
  });
  if (adaKontrol) return `${dasar}/`;
  if (nilai.startsWith("?")) return `${dasar}/${nilai}`;
  if (nilai.startsWith("/")) {
    // `//host` dan `/\host` adalah trik protokol-relatif: sebagian peramban
    // membacanya sebagai situs lain. Tolak ke beranda, jangan ditempel.
    if (nilai.startsWith("//") || nilai.startsWith("/\\")) return `${dasar}/`;
    return `${dasar}${nilai}`;
  }
  try {
    if (new URL(nilai).origin === dasar) return nilai;
  } catch {
    // Bukan URL yang sah — jatuh ke beranda aplikasi.
  }
  return `${dasar}/`;
}

/**
 * Alamat kembali ke halaman masuk setelah Google selesai.
 *
 * Selalu jalur relatif satu situs (halaman pemanggil yang menentukan awalnya),
 * dan seluruh parameter lain — terutama `returnTo` — dipertahankan supaya
 * tujuan akhir setelah masuk tidak hilang. Penanda `google` dipakai halaman
 * masuk untuk memberi tahu bila Google kembali tanpa membawa sesi.
 */
export function urlPulangGoogle(
  parameter: URLSearchParams,
  halaman: string,
): string {
  const lanjutan = new URLSearchParams(parameter);
  lanjutan.set(PARAM_GOOGLE_KEMBALI, NILAI_GOOGLE_KEMBALI);
  return `${halaman}?${lanjutan.toString()}`;
}
