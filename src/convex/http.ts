import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Selisih waktu maksimum yang masih diterima (anti replay attack). */
const TOLERANSI_DETIK = 5 * 60;

/** HMAC-SHA256 hex memakai Web Crypto (tersedia di runtime V8 Convex). */
async function hitungHmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function balas(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Callback pembayaran QRIS.
 *
 * POST /stopup/qris/callback
 * Header: `X-Signature` = HMAC-SHA256(rawBody, qrisWebhookSecret) dalam hex.
 * Body  : { invoiceId, eventId, status, amount, timestamp }
 *
 * Keamanan:
 * - Tanda tangan diverifikasi konstan-waktu (perbandingan hex panjang tetap).
 * - Timestamp wajib dalam ±5 menit → mencegah replay attack.
 * - Idempotensi ditegakkan di `prosesCallback` (kunci: eventId).
 */
http.route({
  path: "/stopup/qris/callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const signature = request.headers.get("x-signature") ?? "";

    // 1) Rahasia & verifikasi tanda tangan.
    const rahasia = await ctx.runQuery(internal.stopup.settings.rahasiaWebhook, {});
    if (!rahasia) {
      return balas({ ok: false, pesan: "Webhook belum dikonfigurasi." }, 503);
    }
    const diharapkan = await hitungHmac(rahasia.secret, raw);
    if (diharapkan.length !== signature.length || diharapkan !== signature.toLowerCase()) {
      return balas({ ok: false, pesan: "Tanda tangan tidak valid." }, 401);
    }

    // 2) Payload.
    let isi: {
      invoiceId?: string;
      eventId?: string;
      status?: string;
      amount?: number;
      timestamp?: number;
    };
    try {
      isi = JSON.parse(raw);
    } catch {
      return balas({ ok: false, pesan: "Body bukan JSON." }, 400);
    }

    const { invoiceId, eventId, status, amount, timestamp } = isi;
    if (!invoiceId || !eventId || !status) {
      return balas({ ok: false, pesan: "Field invoiceId, eventId, status wajib." }, 400);
    }

    // 3) Anti replay.
    const sekarangDetik = Math.floor(Date.now() / 1000);
    if (typeof timestamp !== "number" || Math.abs(sekarangDetik - timestamp) > TOLERANSI_DETIK) {
      return balas({ ok: false, pesan: "Timestamp di luar toleransi 5 menit." }, 408);
    }

    if (status.toUpperCase() !== "PAID") {
      // Status selain PAID hanya dicatat, tidak mengubah apa pun.
      return balas({ ok: true, diterapkan: false, pesan: `Status ${status} diabaikan.` });
    }

    const hasil = await ctx.runMutation(internal.stopup.transactions.prosesCallback, {
      invoiceId,
      eventId,
      payload: typeof amount === "number" ? raw : raw,
    });

    return balas({ ok: true, ...hasil });
  }),
});

export default http;
