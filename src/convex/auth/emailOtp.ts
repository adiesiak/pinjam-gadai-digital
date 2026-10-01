import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/** Kirim kode verifikasi ke email tujuan lewat layanan email Freebuff. */
export async function kirimEmailVerifikasi(email: string, token: string) {
  try {
    await axios.post(
      "https://auth.freebuff.app/send_otp",
      {
        to: email,
        otp: token,
        appName: process.env.VLY_APP_NAME || "a freebuff.com application",
      },
      {
        headers: {
          "x-api-key": "fb_email_2crN1hqIArZP2bEfvjp5Qik4",
        },
      },
    );
  } catch (error) {
    throw new Error(JSON.stringify(error));
  }
}

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  /**
   * Convex Auth mengirimkan action ctx sebagai argumen kedua (belum ada di
   * tipe paketnya), jadi di sini kita bisa memeriksa apakah alamat ini Super
   * Admin. Kode OTP email memang tidak pernah bisa dipakai admin — admin masuk
   * dengan kata sandi + TOTP — tetapi permintaannya tetap dijawab sukses dan
   * emailnya sengaja tidak dikirim: alamat admin tidak boleh bisa dibedakan
   * dari alamat biasa, dan kotak masuk admin tidak boleh bisa dibanjiri OTP.
   */
  async sendVerificationRequest({ identifier: email, token }, ctx?: ActionCtx) {
    if (ctx !== undefined) {
      const alamatAdmin = await ctx.runQuery(
        internal.users.isAdminEmailForPasswordAuth,
        { email },
      );
      if (alamatAdmin) return;
    }
    await kirimEmailVerifikasi(email, token);
  },
});
