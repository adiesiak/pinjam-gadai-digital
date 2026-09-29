import { Email } from "@convex-dev/auth/providers/Email";

import { emailOtp } from "./emailOtp";

/** Challenge email khusus untuk aktivasi dan reset password Super Admin. */
export const adminPasswordOtp = Email({
  id: "admin-password-otp",
  maxAge: 60 * 15,
  generateVerificationToken: emailOtp.generateVerificationToken,
  sendVerificationRequest: emailOtp.sendVerificationRequest,
});
