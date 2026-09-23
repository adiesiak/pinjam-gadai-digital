"use node";

/**
 * STOP-UP! — Telegram Alert Bot.
 *
 * Cron berkala memeriksa dua kondisi operasional paling mahal bagi kiosk:
 * 1. Saldo deposit supplier H2H < ambang → transaksi akan gagal sebentar lagi.
 * 2. Kertas printer habis / printer terputus → struk tidak bisa dicetak.
 *
 * Pesan dikirim ke chat admin memakai Bot API Telegram (gratis, tanpa gateway
 * berbayar). Bila token/chat id belum diisi, action hanya melaporkan nonaktif.
 */
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export type HasilAlert = {
  ok: boolean;
  terkirim?: boolean;
  pesan?: string;
  status?: number;
};

export const cekDanKirimAlert = internalAction({
  args: {},
  handler: async (ctx): Promise<HasilAlert> => {
    const data = await ctx.runQuery(internal.stopup.settings.dataAlert, {});
    if (!data.telegramAktif || !data.token || !data.chatId) {
      return { ok: false, pesan: "Telegram alert belum aktif." };
    }

    const bagian: string[] = [];
    if (data.supplierRendah.length > 0) {
      bagian.push(
        `⚠️ *Saldo supplier rendah* (ambang Rp${data.ambang.toLocaleString("id-ID")}):\n` +
          data.supplierRendah.map((s: string) => `• ${s}`).join("\n"),
      );
    }
    if (data.printerBermasalah.length > 0) {
      bagian.push(
        `🖨️ *Printer bermasalah*:\n` +
          data.printerBermasalah.map((s: string) => `• ${s}`).join("\n"),
      );
    }
    if (bagian.length === 0) return { ok: true, terkirim: false };

    const pesan = `*STOP-UP! — Peringatan Operasional*\n\n${bagian.join("\n\n")}`;
    try {
      const res: Response = await fetch(
        `https://api.telegram.org/bot${data.token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: data.chatId,
            text: pesan,
            parse_mode: "Markdown",
          }),
        },
      );
      return { ok: res.ok, terkirim: true, status: res.status };
    } catch (err) {
      return { ok: false, pesan: err instanceof Error ? err.message : String(err) };
    }
  },
});
