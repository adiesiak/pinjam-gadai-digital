import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/** Kirim kode verifikasi ke email tujuan lewat layanan email Freebuff. */
export async function kirimEmailVerifikasi(email: string, token: string) {
  try {
    await axios.post(
      freebuffEmailOtpUrl(),
      {
        to: email,
        otp: token,
      },
      {
        headers: {
          ...freebuffEmailOtpHeaders(),
        },
      },
    );
  } catch (error) {
    throw freebuffEmailOtpError(error);
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

// Sign-in codes are sent by the Freebuff integrations gateway, which knows
// this project by its own key: VLY_INTEGRATION_KEY, a Convex environment
// variable set when the project was created. The email's wording is fixed by
// the gateway.
function freebuffEmailOtpUrl(): string {
  const base =
    process.env.VLY_INTEGRATION_BASE_URL || "https://integrations.vly.ai";
  return `${base.replace(/\/+$/, "")}/v1/email/otp`;
}

function freebuffEmailOtpHeaders(): Record<string, string> {
  const key = process.env.VLY_INTEGRATION_KEY;
  if (!key) {
    throw new Error(
      "VLY_INTEGRATION_KEY is not set on this Convex deployment, so email sign-in cannot send codes.",
    );
  }
  return { Authorization: `Bearer ${key}` };
}

// Never stringify the whole request error: it carries the request headers.
function freebuffEmailOtpError(error: unknown): Error {
  const response = (
    error as { response?: { status?: number; data?: { error?: unknown } } }
  )?.response;
  if (response) {
    const detail =
      typeof response.data?.error === "string" ? `: ${response.data.error}` : "";
    return new Error(
      `Could not send the sign-in code (HTTP ${response.status})${detail}`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Could not send the sign-in code: ${message}`);
}
