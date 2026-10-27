/**
 * PROVIDER MASUK DENGAN NIK KTP.
 *
 * NIK di sini hanya nama pengguna. Kode 6 angka tetap dikirim ke nomor WhatsApp
 * yang tercatat pada profil pemilik NIK itu, dan verifikasinya memakai mesin
 * yang sama dengan pintu nomor (`klaimPeminjam._klaimUntukMasukDenganNik`):
 * batas percobaan, sekali pakai, dan penentuan akun tidak punya versi kedua yang
 * lebih longgar.
 *
 * Tidak ada akun baru dari pintu ini. NIK harus sudah menunjuk tepat satu
 * profil, dan nomor pada profil itu tidak boleh menunjuk akun lain.
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
 * Tipe ditulis EKSPLISIT dengan alasan yang sama seperti `auth/whatsappOtp.ts`:
 * berkas ini memakai `internal` dan diimpor `auth.ts`, dan inferensi tanpa
 * anotasi membuat tipe fungsi Convex di proyek ini jatuh menjadi `any`.
 */
export const nikOtp: AuthProviderConfig = ConvexCredentials({
  id: "nik-otp",
  authorize: async (credentials, ctx: ActionCtx) => {
    const nik = teks(credentials.nik).trim();
    const kode = teks(credentials.otpCode).trim();
    const ip = teks(credentials.ip).trim();
    const userAgent = teks(credentials.userAgent).trim();

    if (nik === "" || kode === "") {
      throw new Error("NIK dan kode OTP wajib diisi.");
    }

    const hasil = await ctx.runMutation(
      internal.klaimPeminjam._klaimUntukMasukDenganNik,
      {
        nik,
        kode,
        ...(ip === "" ? {} : { ip: ip.slice(0, 64) }),
        ...(userAgent === "" ? {} : { userAgent: userAgent.slice(0, 200) }),
      },
    );
    if (!hasil.ok) throw new Error(hasil.pesan);

    return { userId: hasil.userId };
  },
});
