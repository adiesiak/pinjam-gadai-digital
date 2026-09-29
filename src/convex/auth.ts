// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

import { adminPasswordOtp } from "./auth/adminPasswordOtp";
import { emailOtp } from "./auth/emailOtp";
import { internal } from "./_generated/api";
import { ROLES } from "./schema";

const passwordProvider = Password({
  verify: adminPasswordOtp,
  reset: adminPasswordOtp,
  profile: (params) => {
    const email = params.email;
    if (typeof email !== "string" || email.length === 0) {
      throw new Error("Email admin wajib diisi.");
    }
    return { email };
  },
});

// Password provider authorization runs in an action; preflight the verified
// admin identity before sign-in, account activation, or password reset starts.
const adminPassword: typeof passwordProvider = {
  ...passwordProvider,
  authorize: async (params, ctx) => {
    const email = params.email;
    if (typeof email !== "string" || email.length === 0) {
      throw new Error("Email admin wajib diisi.");
    }
    const isVerifiedAdmin = await ctx.runQuery(
      internal.users.isAdminEmailForPasswordAuth,
      { email },
    );
    if (!isVerifiedAdmin) {
      throw new Error("Akun admin terverifikasi tidak ditemukan.");
    }
    return passwordProvider.authorize(params, ctx);
  },
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, adminPassword, Anonymous],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, provider, type }) {
      const user = await ctx.db.get(userId);
      // Email OTP public stays available to borrowers/funders, but not admins.
      if (provider.id === emailOtp.id) {
        if (user?.role === ROLES.ADMIN) {
          throw new Error(
            "Super Admin masuk dengan kata sandi; OTP email hanya untuk aktivasi atau reset kata sandi.",
          );
        }
        return;
      }

      // A concurrent role change cannot make a password activation/create
      // account commit for a non-admin. Normal password sign-ins do not upsert
      // users and therefore don't invoke this callback.
      if (
        provider.id !== "password" ||
        (type !== "credentials" && type !== "verification")
      ) {
        return;
      }
      if (!user?.email || user.role !== ROLES.ADMIN || user.emailVerificationTime === undefined || user.isAnonymous === true) {
        throw new Error("Password hanya tersedia untuk akun Super Admin terverifikasi.");
      }
    },
  },
});