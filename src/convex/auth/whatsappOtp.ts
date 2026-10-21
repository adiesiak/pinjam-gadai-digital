/**
 * PROVIDER LOGIN WHATSAPP OTP untuk peminjam lama DAN peminjam baru PINDAI.
 *
 * Kenapa provider kredensial khusus, bukan `Phone` bawaan Convex Auth: provider
 * `Phone` memasangkan akun lewat `authAccounts` (provider + nomor), sehingga
 * nomor yang sudah ada di data impor akan membuat akun BARU yang kosong. Di
 * sini kode OTP diverifikasi oleh `klaimPeminjam._klaimUntukMasuk`: nomor
 * pemilik data lama masuk ke akun pemiliknya sendiri, sedangkan nomor baru
 * memakai akun yang sudah terhubung ke nomor itu atau mendapat akun peminjam
 * baru setelah kode benar.
 *
 * Alur lengkap:
 *  1. Klien meminta kode: `POST klaimPeminjam.mintaKodeKlaim({ nomor })`.
 *     Nomor lama maupun baru sama-sama menerima kode; balasannya tidak
 *     mengungkap apakah nomor itu sudah punya akun.
 *  2. Klien memanggil `signIn("whatsapp-otp", { phoneNumber, otpCode })`.
 *  3. `authorize` menjalankan verifikasi di satu mutation internal, lalu
 *     mengembalikan `userId` akun yang berhak atas nomor tersebut.
 *
 * Tidak ada kode yang melewati provider ini: verifikasi, pembatas percobaan,
 * sekali pakai, dan penentuan akun semuanya hidup di `convex/klaimPeminjam.ts`
 * supaya hitungan percobaan tidak bisa dilewati lewat jalur lain.
 */
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { AuthProviderConfig } from "@convex-dev/auth/server";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/** Ambil nilai string dari kredensial (nilai bisa berupa angka/boolean/undefined). */
function teks(nilai: unknown): string {
  return typeof nilai === "string" ? nilai : "";
}

/**
 * Tipe ditulis EKSPLISIT supaya inferensi tidak berputar: provider ini memakai
 * `internal` (berkas api hasil generate), sedangkan `auth.ts` mengimpor provider
 * ini — tanpa anotasi, lingkaran itu membuat seluruh tipe fungsi Convex di
 * proyek ini jatuh menjadi `any`.
 */
export const whatsappOtp: AuthProviderConfig = ConvexCredentials({
  id: "whatsapp-otp",
  /**
   * `ctx` sengaja diberi tipe EKSPLISIT (sama seperti `auth/emailOtp.ts`): tanpa
   * itu inferensi tipe `ConvexCredentials` menelusuri `internal` → berkas api
   * hasil generate → `auth.ts` yang mengimpor provider ini, dan lingkaran itu
   * membuat seluruh tipe fungsi Convex jatuh menjadi `any`.
   */
  authorize: async (credentials, ctx: ActionCtx) => {
    const nomor = teks(credentials.phoneNumber).trim();
    const kode = teks(credentials.otpCode).trim();
    const ip = teks(credentials.ip).trim();
    const userAgent = teks(credentials.userAgent).trim();

    if (nomor === "" || kode === "") {
      throw new Error("Nomor WhatsApp dan kode OTP wajib diisi.");
    }

    const hasil = await ctx.runMutation(internal.klaimPeminjam._klaimUntukMasuk, {
      nomor,
      kode,
      ...(ip === "" ? {} : { ip: ip.slice(0, 64) }),
      ...(userAgent === "" ? {} : { userAgent: userAgent.slice(0, 200) }),
    });
    if (!hasil.ok) throw new Error(hasil.pesan);

    return { userId: hasil.userId };
  },
});
