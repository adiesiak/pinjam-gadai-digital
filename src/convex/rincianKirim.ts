import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { buatPdfRincian } from "../lib/rincianPdf";
import {
  htmlRincianEmail,
  namaBerkasRincian,
  teksRincianEmail,
  teksRincianWhatsapp,
  type DokumenRincianPinjaman,
} from "../lib/rincianPinjaman";
import { apiKeyGatewayWa, kirimViaGateway, type WaSettings } from "./whatsapp";

/**
 * PENGIRIMAN DOKUMEN RINCIAN.
 *
 * Dokumen dibangun sekali di sini (`buatPdfRincian`) lalu dikirim lewat dua
 * kanal: email dengan lampiran PDF, dan WhatsApp dengan lampiran PDF yang
 * diambil gateway dari URL berkas Convex. Hanya admin yang sudah lolos TOTP
 * yang boleh memicu pengiriman, dan tujuannya selalu kontak terdaftar milik
 * peminjam itu (email akun atau nomor KYC), bukan alamat bebas yang diketik.
 */

/** Batas tunggu gateway email; di atas ini pengiriman dianggap gagal. */
const GATEWAY_TIMEOUT_MS = 20_000;

/**
 * Batas ukuran lampiran. Fonnte menolak berkas 4 MB ke atas, sedangkan rincian
 * ini hanya puluhan kilobita; pagar ini menahan kasus aneh sebelum gateway
 * menolaknya dengan pesan yang lebih membingungkan.
 */
const BATAS_LAMPIRAN_BYTE = 3_500_000;

/**
 * Lama berkas rincian disimpan sebelum dihapus. Gateway menjawab "masuk
 * antrean" lebih dulu dan mengambil berkasnya beberapa saat kemudian, jadi
 * berkas tidak boleh dihapus segera setelah kiriman dijawab.
 */
const RETENSI_BERKAS_MS = 60 * 60 * 1000;

/** Alasan gateway yang berarti "lampiran tidak dikenal, pesan belum dikirim". */
const ALASAN_TANPA_LAMPIRAN = "belum mendukung lampiran berkas";

type DataRincian = {
  dokumen: DokumenRincianPinjaman;
  bolehKirim: boolean;
  email: string | null;
  whatsapp: string | null;
};

/** Pesan galat yang aman ditampilkan ke admin. */
function pesanGalat(err: unknown): string {
  return err instanceof Error ? err.message : "Pengiriman gagal tanpa keterangan.";
}

/**
 * Base64 dari byte PDF. Dipakai lampiran email; potongannya 8 KB supaya
 * `String.fromCharCode` tidak kehabisan argumen pada dokumen panjang.
 */
function keBase64(byte: Uint8Array): string {
  let biner = "";
  const potong = 0x2000;
  for (let i = 0; i < byte.length; i += potong) {
    biner += String.fromCharCode(...byte.subarray(i, i + potong));
  }
  return btoa(biner);
}

/**
 * Gerbang admin + data rincian. `assertAdminSession` membaca sesi TOTP yang
 * sama dengan panel, jadi admin yang belum memverifikasi TOTP ditolak sebelum
 * satu pun byte dikirim.
 */
async function siapkanKirim(
  ctx: ActionCtx,
  loanId: Id<"loans">,
): Promise<{ userId: Id<"users">; data: DataRincian }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  await ctx.runQuery(api.security.assertAdminSession, {});
  const data = await ctx.runQuery(api.rincianPinjaman.dataRincian, { loanId });
  if (!data.bolehKirim) {
    throw new Error("Akun ini tidak berwenang mengirim rincian pinjaman.");
  }
  return { userId, data };
}

/** Tutup baris log kirim dengan hasil sebenarnya. */
async function catatHasil(
  ctx: ActionCtx,
  logId: Id<"rincianKirimLog">,
  status: "terkirim" | "gagal",
  respon?: string,
): Promise<void> {
  await ctx.runMutation(internal.rincianPinjaman.selesaikanKirim, {
    logId,
    status,
    ...(respon === undefined ? {} : { respon }),
  });
}

/**
 * Kirim dokumen rincian lewat WhatsApp dan tutup baris lognya.
 *
 * Melempar bila gateway menolak, sehingga pemanggil otomatis bisa mencoba
 * email sebagai cadangan. `lampiran: false` berarti pesan teksnya terkirim
 * tetapi gateway belum mendukung berkas.
 */
async function kirimPdfWhatsapp(
  ctx: ActionCtx,
  input: { nomor: string; dokumen: DokumenRincianPinjaman; logId: Id<"rincianKirimLog"> },
): Promise<{ lampiran: boolean }> {
  let ditutup = false;
  const tutup = async (status: "terkirim" | "gagal", respon: string) => {
    if (ditutup) return;
    ditutup = true;
    await catatHasil(ctx, input.logId, status, respon);
  };

  const isi = teksRincianWhatsapp(input.dokumen);
  try {
    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    if (settings.aktif !== true || !settings.apiUrl) {
      throw new Error("Integrasi WhatsApp belum aktif, jadi rincian tidak dikirim.");
    }
    const apiKey = apiKeyGatewayWa();
    if (apiKey === "") {
      throw new Error("WHATSAPP_API_KEY belum diisi di environment.");
    }

    const byte = buatPdfRincian(input.dokumen);
    if (byte.length > BATAS_LAMPIRAN_BYTE) {
      throw new Error(`Dokumen rincian terlalu besar untuk lampiran WhatsApp (${byte.length} byte).`);
    }
    // Salinan tipis dari byte: `BlobPart` menuntut buffer yang pasti.
    const berkasId = await ctx.storage.store(
      new Blob([new Uint8Array(byte)], { type: "application/pdf" }),
    );
    const url = await ctx.storage.getUrl(berkasId);
    if (url === null) throw new Error("Berkas rincian gagal disiapkan di penyimpanan.");

    const hasil = await kirimViaGateway(apiKey, settings, input.nomor, isi, {
      url,
      nama: namaBerkasRincian(input.dokumen),
    });

    // Berkas dihapus belakangan: gateway mengambil lampirannya setelah
    // menjawab, dan penghapusan terjadwal tetap membuat tautannya berumur
    // pendek walau kiriman gagal.
    await ctx.scheduler.runAfter(RETENSI_BERKAS_MS, internal.laporanPendana._hapusBerkas, {
      storageId: berkasId,
    });

    if (hasil.ok) {
      await tutup("terkirim", "WhatsApp dengan lampiran PDF");
      return { lampiran: true };
    }

    // Gateway generik menolak lampiran SEBELUM pesan dikirim, jadi pesan
    // ringkasnya masih boleh menyusul tanpa risiko kiriman ganda.
    if (hasil.respon.includes(ALASAN_TANPA_LAMPIRAN)) {
      const teks = await kirimViaGateway(apiKey, settings, input.nomor, isi);
      if (teks.ok) {
        await tutup("terkirim", `tanpa lampiran PDF: ${hasil.respon}`);
        return { lampiran: false };
      }
      throw new Error(teks.respon);
    }

    throw new Error(hasil.respon);
  } catch (err) {
    const pesan = pesanGalat(err);
    await tutup("gagal", pesan);
    throw new Error(pesan);
  }
}

/** Kirim dokumen rincian lewat email gateway dan tutup baris lognya. */
async function kirimPdfEmail(
  ctx: ActionCtx,
  input: { email: string; dokumen: DokumenRincianPinjaman; logId: Id<"rincianKirimLog"> },
): Promise<void> {
  try {
    await kirimEmailGateway({
      email: input.email,
      subjek: `Rincian pinjaman ${input.dokumen.nomorReferensi} - PINDAI`,
      html: htmlRincianEmail(input.dokumen),
      teks: teksRincianEmail(input.dokumen),
      namaBerkas: namaBerkasRincian(input.dokumen),
      pdf: buatPdfRincian(input.dokumen),
    });
    await catatHasil(ctx, input.logId, "terkirim", "email dengan lampiran PDF");
  } catch (err) {
    const pesan = pesanGalat(err);
    await catatHasil(ctx, input.logId, "gagal", pesan);
    throw new Error(pesan);
  }
}

/** Kirim email lewat gateway integrasi (VLY) beserta lampiran PDF. */
async function kirimEmailGateway(input: {
  email: string;
  subjek: string;
  html: string;
  teks: string;
  namaBerkas: string;
  pdf: Uint8Array;
}): Promise<void> {
  const key = process.env.VLY_INTEGRATION_KEY;
  if (!key) {
    throw new Error(
      "VLY_INTEGRATION_KEY belum diatur di environment Convex, jadi email rincian tidak bisa dikirim.",
    );
  }
  const dasar = (process.env.VLY_INTEGRATION_BASE_URL || "https://integrations.vly.ai").replace(
    /\/+$/,
    "",
  );

  const kontrol = new AbortController();
  const jam = setTimeout(() => kontrol.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(`${dasar}/v1/email/send`, {
      method: "POST",
      // Tanpa mengikuti pengalihan: endpoint tetap harus yang diatur gateway.
      redirect: "error",
      signal: kontrol.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        to: [input.email],
        subject: input.subjek,
        html: input.html,
        text: input.teks,
        attachments: [
          {
            filename: input.namaBerkas,
            content: keBase64(input.pdf),
            encoding: "base64",
          },
        ],
      }),
    });
    const teks = (await res.text()).slice(0, 500);
    if (!res.ok) {
      throw new Error(hapusKredensial(`Gateway email menolak kiriman (HTTP ${res.status}): ${teks}`));
    }
    if (teks.includes('"success":false')) {
      throw new Error("Gateway email menolak kiriman.");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gateway email tidak menjawab dalam ${GATEWAY_TIMEOUT_MS / 1000} detik.`);
    }
    throw err instanceof Error ? err : new Error("Gagal mengirim email.");
  } finally {
    clearTimeout(jam);
  }
}

/**
 * Balasan galat gateway tidak boleh memuat kredensial bila ia menggemakan
 * permintaannya; teksnya dicukur dan URL-nya cukup disebut sebagai endpoint.
 */
function hapusKredensial(teks: string): string {
  return teks.replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 300);
}

/** Kirim dokumen rincian ke email akun peminjam. */
export const kirimRincianEmail = action({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { userId, data } = await siapkanKirim(ctx, loanId);
    const email = data.email?.trim() ?? "";
    if (email === "" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(
        "Peminjam belum punya alamat email yang sah di akunnya, jadi rincian tidak bisa dikirim lewat email.",
      );
    }

    const siap = await ctx.runMutation(internal.rincianPinjaman.mulaiKirim, {
      loanId,
      kanal: "email",
      tujuan: email,
      olehUserId: userId,
    });
    if (!siap.ok) throw new Error(siap.pesan);

    await kirimPdfEmail(ctx, { email, dokumen: data.dokumen, logId: siap.logId });
    return { ok: true as const, kanal: "email" as const, tujuan: email };
  },
});

/**
 * Kirim dokumen rincian ke WhatsApp peminjam.
 *
 * Berkasnya disimpan di storage Convex karena gateway (Fonnte) mengunduh
 * lampirannya sendiri lewat URL publik, lalu dijadwalkan terhapus seperti
 * laporan pendana supaya tautan ke rincian keuangan tidak menggantung.
 */
export const kirimRincianWhatsapp = action({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { userId, data } = await siapkanKirim(ctx, loanId);
    const nomor = data.whatsapp?.trim() ?? "";
    if (nomor === "") {
      throw new Error(
        "Peminjam belum punya nomor WhatsApp di data KYC maupun di akunnya, jadi rincian tidak bisa dikirim lewat WhatsApp.",
      );
    }

    const siap = await ctx.runMutation(internal.rincianPinjaman.mulaiKirim, {
      loanId,
      kanal: "whatsapp",
      tujuan: nomor,
      olehUserId: userId,
    });
    if (!siap.ok) throw new Error(siap.pesan);

    const hasil = await kirimPdfWhatsapp(ctx, {
      nomor,
      dokumen: data.dokumen,
      logId: siap.logId,
    });
    return { ok: true as const, kanal: "whatsapp" as const, tujuan: nomor, lampiran: hasil.lampiran };
  },
});

type HasilKirimRincian = {
  ok: boolean;
  kanal: "whatsapp" | "email" | null;
  respon: string;
};

/**
 * Kirim rincian tanpa klik admin, dipicu penjadwal saat pinjaman ditandai
 * tersalurkan.
 *
 * WhatsApp dicoba lebih dulu karena peminjam membacanya paling cepat; email
 * menjadi cadangan bila nomornya kosong atau gatewaynya menolak. Hasilnya
 * dikembalikan, bukan dilempar: pencairan yang sah tidak boleh terlihat gagal
 * hanya karena gateway sedang tidak bisa dihubungi.
 */
export const kirimRincianOtomatis = internalAction({
  args: { loanId: v.id("loans"), olehUserId: v.id("users") },
  handler: async (ctx, { loanId, olehUserId }): Promise<HasilKirimRincian> => {
    const data = await ctx.runQuery(internal.rincianPinjaman._dataKirim, { loanId });
    if (data === null) {
      return { ok: false, kanal: null, respon: "Pinjaman tidak ditemukan." };
    }

    const nomor = data.whatsapp?.trim() ?? "";
    const email = data.email?.trim() ?? "";
    const emailSah = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const kegagalan: string[] = [];

    if (nomor !== "") {
      const siap = await ctx.runMutation(internal.rincianPinjaman.mulaiKirimOtomatis, {
        loanId,
        kanal: "whatsapp",
        tujuan: nomor,
        olehUserId,
      });
      if (!siap.ok) {
        return { ok: true, kanal: "whatsapp", respon: "Rincian sudah dikirim otomatis sebelumnya." };
      }
      try {
        const hasil = await kirimPdfWhatsapp(ctx, {
          nomor,
          dokumen: data.dokumen,
          logId: siap.logId,
        });
        return {
          ok: true,
          kanal: "whatsapp",
          respon: hasil.lampiran ? "WhatsApp dengan lampiran PDF" : "WhatsApp tanpa lampiran PDF",
        };
      } catch (err) {
        kegagalan.push(`WhatsApp: ${pesanGalat(err)}`);
      }
    }

    if (emailSah) {
      const siap = await ctx.runMutation(internal.rincianPinjaman.mulaiKirimOtomatis, {
        loanId,
        kanal: "email",
        tujuan: email,
        olehUserId,
      });
      if (!siap.ok) {
        return { ok: true, kanal: "email", respon: "Rincian sudah dikirim otomatis sebelumnya." };
      }
      try {
        await kirimPdfEmail(ctx, { email, dokumen: data.dokumen, logId: siap.logId });
        return { ok: true, kanal: "email", respon: "email dengan lampiran PDF" };
      } catch (err) {
        kegagalan.push(`email: ${pesanGalat(err)}`);
      }
    }

    return {
      ok: false,
      kanal: null,
      respon:
        kegagalan.length > 0
          ? kegagalan.join(" | ")
          : "Peminjam belum punya nomor WhatsApp maupun email, jadi rincian tidak dikirim otomatis.",
    };
  },
});

/**
 * Dokumen PDF untuk disimpan admin dari panel. Dipakai saat pengiriman
 * otomatis belum bisa jalan (mis. gateway WhatsApp belum diatur atau peminjam
 * tidak punya email), supaya rincian tetap bisa diserahkan secara manual.
 */
export const unduhRincianPdf = action({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { data } = await siapkanKirim(ctx, loanId);
    const byte = buatPdfRincian(data.dokumen);
    return {
      namaBerkas: namaBerkasRincian(data.dokumen),
      base64: keBase64(byte),
    };
  },
});
