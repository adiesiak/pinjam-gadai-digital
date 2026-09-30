import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

import { emailOtp } from "./emailOtp";

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
  sendVerificationRequest: emailOtp.sendVerificationRequest,
});
