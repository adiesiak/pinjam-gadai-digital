import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

import { kirimEmailVerifikasi } from "./emailOtp";

/** Challenge email khusus untuk aktivasi dan reset password Super Admin. */
export const adminPasswordOtp = Email({
  id: "admin-password-otp",
  maxAge: 60 * 15,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(
      random,
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      32,
    );
  },
  // Token aktivasi/reset selalu dikirim: alamat admin sudah lolos pemeriksaan
  // di adminPassword.authorize, jadi tidak boleh memakai penahan OTP publik.
  sendVerificationRequest: ({ identifier, token }) =>
    kirimEmailVerifikasi(identifier, token),
});
