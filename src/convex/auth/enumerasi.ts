/**
 * Balasan seragam untuk menutup enumerasi akun Super Admin.
 *
 * Email Super Admin tidak boleh bisa ditebak dari perbedaan respons endpoint
 * autentikasi. Karena itu permintaan untuk alamat non-admin dibalas persis
 * seperti Convex Auth membalas alamat yang tidak punya akun kata sandi, dan
 * blokir OTP email untuk admin memakai pesan kode salah yang sama.
 *
 * String di bawah disalin persis dari Convex Auth:
 * - "Invalid credentials"   → providers/Password.ts (flow signIn)
 * - "Invalid code"          → providers/Password.ts (flow reset-verification)
 * - "Could not verify code" → server/implementation/signIn.ts (kode email/telepon
 *                             yang tidak cocok — inilah yang dilihat klien)
 */

/** Pesan kode verifikasi email/telepon yang tidak cocok (Convex Auth). */
export const PESAN_KODE_VERIFIKASI_SALAH = "Could not verify code";

/** Pesan kode reset kata sandi yang tidak cocok (Convex Auth). */
export const PESAN_KODE_RESET_SALAH = "Invalid code";

/** Pesan kredensial salah (Convex Auth) untuk alamat tanpa akun kata sandi. */
export const PESAN_KREDENSIAL_SALAH = "Invalid credentials";

/** True untuk flow yang memverifikasi kode token aktivasi/reset. */
export function alurVerifikasiKode(flow: string): boolean {
  return flow === "reset-verification" || flow === "email-verification";
}

/** True untuk flow yang memang dikenal provider Password Convex Auth. */
export function alurKataSandiDikenal(flow: string): boolean {
  return (
    flow === "signIn" ||
    flow === "signUp" ||
    flow === "reset" ||
    flow === "reset-verification" ||
    flow === "email-verification"
  );
}

/** Pesan kode salah yang dipakai Convex Auth pada flow verifikasi kode. */
export function pesanKodeSalah(flow: string): string {
  return flow === "reset-verification"
    ? PESAN_KODE_RESET_SALAH
    : PESAN_KODE_VERIFIKASI_SALAH;
}

/**
 * Balasan untuk alamat yang bukan Super Admin terverifikasi pada provider kata
 * sandi. `null` berarti permintaan diperlakukan seperti permintaan token biasa
 * (aktivasi/reset) — tanpa mengirim email apa pun — sehingga bentuk responsnya
 * identik dengan permintaan token milik admin.
 */
export function pesanSandiNonAdmin(flow: string): string | null {
  if (flow === "signIn") return PESAN_KREDENSIAL_SALAH;
  if (alurVerifikasiKode(flow)) return pesanKodeSalah(flow);
  return null;
}

/**
 * Pesan blokir OTP email untuk akun Super Admin.
 *
 * Tahap permintaan kode (`"email"`) tidak boleh membocorkan apa pun, sedangkan
 * tahap verifikasi memakai pesan kode salah yang sama persis dengan kode salah
 * milik email biasa.
 */
export function pesanBlokirOtpAdmin(tahap: string, admin: boolean): string | null {
  if (tahap !== "email" && admin) return PESAN_KODE_VERIFIKASI_SALAH;
  return null;
}
