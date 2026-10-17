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
