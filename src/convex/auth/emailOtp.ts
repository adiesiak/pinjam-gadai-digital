import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/** Kirim kode verifikasi ke email tujuan lewat layanan email Freebuff. */
export async function kirimEmailVerifikasi(email: string, token: string) {
  // Resend didahulukan bila dikonfigurasi: ia punya kuota gratis yang tidak
  // bergantung pada langganan VLY, dan API-nya cukup satu permintaan HTTP.
  // Gateway VLY tetap dipakai sebagai cadangan supaya deployment lama yang
  // sudah punya VLY_INTEGRATION_KEY tidak berubah perilakunya.
  if ((process.env.RESEND_API_KEY ?? "") !== "") {
    await kirimLewatResend(email, token);
    return;
  }

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
        // Tanpa batas waktu, permintaan masuk bisa menggantung sampai Convex
        // memutus action dan pengguna tidak pernah tahu kodenya gagal dikirim.
        timeout: 15_000,
      },
    );
  } catch (error) {
    throw freebuffEmailOtpError(error);
  }
}

/**
 * Kirim kode lewat Resend (https://resend.com) — kuota gratis 100 email/hari.
 *
 * `EMAIL_FROM` wajib memakai domain yang sudah diverifikasi di Resend. Untuk
 * uji cepat tanpa domain, isi `onboarding@resend.dev`; Resend hanya
 * mengizinkannya ke alamat pemilik akun sendiri.
 */
async function kirimLewatResend(email: string, token: string) {
  const kunci = process.env.RESEND_API_KEY ?? "";
  const pengirim = process.env.EMAIL_FROM ?? "PINDAI <onboarding@resend.dev>";

  let respons: Response;
  try {
    // `AbortSignal.timeout` tidak dijamin ada di semua runtime Convex, jadi
    // dipakai hanya bila tersedia; batas waktu tetap dijaga oleh action.
    const sinyal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(15_000)
        : undefined;
    respons = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kunci}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: pengirim,
        to: [email],
        subject: `Kode masuk PINDAI: ${token}`,
        html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1a15">
  <p>Kode masuk PINDAI Anda:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${token}</p>
  <p style="font-size:13px;color:#6f6858">Berlaku 15 menit. Jangan bagikan kode ini kepada siapa pun, termasuk yang mengaku petugas PINDAI.</p>
</div>`,
        text: `Kode masuk PINDAI Anda: ${token}\n\nBerlaku 15 menit. Jangan bagikan kode ini kepada siapa pun.`,
      }),
      ...(sinyal === undefined ? {} : { signal: sinyal }),
    });
  } catch (galat) {
    const pesan = galat instanceof Error ? galat.message : String(galat);
    throw new Error(`Could not send the sign-in code: ${pesan}`);
  }

  if (respons.ok) return;

  // Pesan dari Resend berguna untuk operator (domain belum diverifikasi, kuota
  // habis, API key salah), jadi diteruskan — tetapi hanya potongan pendek dan
  // tanpa header permintaan.
  let rincian = "";
  try {
    const isi = (await respons.json()) as { message?: unknown };
    if (typeof isi.message === "string") rincian = `: ${isi.message.slice(0, 200)}`;
  } catch {
    // Balasan bukan JSON: cukup statusnya.
  }
  throw new Error(
    `Could not send the sign-in code (Resend HTTP ${respons.status})${rincian}`,
  );
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
      typeof response.data?.error === "string"
        ? `: ${response.data.error}`
        : "";
    return new Error(
      `Could not send the sign-in code (HTTP ${response.status})${detail}`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Could not send the sign-in code: ${message}`);
}
