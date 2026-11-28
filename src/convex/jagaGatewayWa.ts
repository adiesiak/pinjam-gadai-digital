import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { ROLES } from "./schema";
import { urlKesehatanGateway } from "../lib/waUrl";

/**
 * Pemantau gateway WhatsApp — PROAKTIF, bukan menunggu kegagalan.
 *
 * Kenapa modul ini ada: `monitoring.susunPeringatan` sudah mendeteksi
 * "Pengiriman WhatsApp gagal", tetapi hanya dari baris `waLogs` — yaitu SETELAH
 * ada yang mencoba mengirim. Gateway yang mati pada malam hari tidak
 * meninggalkan satu baris pun sampai ada pengguna yang gagal masuk, dan pada
 * titik itu mereka sudah terlanjur tidak bisa masuk lewat WhatsApp.
 *
 * Di sini endpoint gateway ditanya langsung (`GET <apiUrl>/health`) setiap
 * beberapa menit. Bila tidak sehat, operator diberi tahu lewat EMAIL — sengaja
 * bukan WhatsApp, karena kanal yang sedang diperiksa tidak boleh menjadi
 * satu-satunya kanal pemberitahuan.
 */

const SLOT = "global";

/** Jarak minimum antar peringatan untuk gangguan yang sama. */
const JEDA_PERINGATAN_MS = 6 * 60 * 60 * 1000;

/** Batas waktu satu pemeriksaan; di bawah timeout pengiriman (10 detik). */
const BATAS_CEK_MS = 8_000;

/**
 * URL pemeriksaan kesehatan dari `apiUrl` gateway.
 *
 * `null` berarti gateway ini tidak punya endpoint kesehatan yang bisa ditanya.
 * Fungsi murninya hidup di `lib/waUrl` supaya bisa diuji tanpa runtime Convex.
 */
export const urlKesehatan = urlKesehatanGateway;

/** Konfigurasi gateway yang sedang aktif (internal). */
export const _konfigurasi = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("waSettings")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    return {
      apiUrl: (row?.apiUrl ?? "").trim(),
      aktif: row?.aktif === true,
    };
  },
});

/** Email operator penerima peringatan: seluruh admin yang punya email. */
export const _emailOperator = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), ROLES.ADMIN))
      .collect();
    return admin
      .map((u) => (u.email ?? "").trim())
      .filter((e) => e !== "");
  },
});

/**
 * Kirim satu email operasional lewat Resend.
 *
 * Tidak memakai `auth/emailOtp.kirimEmailVerifikasi` karena fungsi itu khusus
 * kode masuk: subjek dan isinya terikat pada token. Di sini isinya kalimat
 * peringatan, dan kegagalan pengiriman TIDAK boleh melempar — pemeriksa
 * terjadwal harus tetap selesai supaya status tersimpan.
 */
async function kirimEmailOperator(
  ke: string[],
  subjek: string,
  teks: string,
): Promise<{ terkirim: boolean; alasan: string }> {
  const kunci = (process.env.RESEND_API_KEY ?? "").trim();
  if (kunci === "") {
    return { terkirim: false, alasan: "RESEND_API_KEY belum diisi" };
  }
  const pengirim = process.env.EMAIL_FROM ?? "PINDAI <onboarding@resend.dev>";
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1a15;line-height:1.6">
  <p style="font-size:15px;font-weight:600;margin:0 0 12px">${subjek}</p>
  <p style="font-size:14px;margin:0 0 12px">${teks.replace(/\n/g, "<br>")}</p>
  <p style="font-size:12px;color:#6f6858;margin:16px 0 0">
    Diperiksa otomatis oleh pemantau PINDAI. Tidak perlu dibalas.
  </p>
</div>`;

  try {
    const sinyal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(15_000)
        : undefined;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kunci}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: pengirim,
        to: ke,
        subject: subjek,
        html,
        text: `${subjek}\n\n${teks}`,
      }),
      ...(sinyal === undefined ? {} : { signal: sinyal }),
    });
    if (res.ok) return { terkirim: true, alasan: "" };
    const potongan = (await res.text()).slice(0, 200);
    return { terkirim: false, alasan: `HTTP ${res.status}: ${potongan}` };
  } catch (galat) {
    const pesan = galat instanceof Error ? galat.message : String(galat);
    return { terkirim: false, alasan: pesan.slice(0, 200) };
  }
}

/**
 * Simpan hasil pemeriksaan dan putuskan apakah operator perlu diberi tahu.
 *
 * Mengembalikan `perluPeringatan: true` hanya saat gangguan ini BELUM
 * dilaporkan dalam `JEDA_PERINGATAN_MS`. Tanpa penahan itu, gateway yang mati
 * semalaman akan mengirim puluhan email dan kuota Resend 100/hari habis —
 * yang justru mematikan OTP email, satu-satunya jalur masuk yang masih hidup.
 */
export const _simpanStatus = internalMutation({
  args: {
    sehat: v.boolean(),
    apiUrl: v.string(),
    alasan: v.optional(v.string()),
    /**
     * Tulis penanda "sudah diperingatkan". `false` untuk pemeriksaan manual
     * dari panel: admin sedang melihat hasilnya sendiri, dan menulis penanda
     * berarti menelan jatah email alarm untuk 6 jam ke depan.
     */
    tandaiSaatDiperiksa: v.optional(v.boolean()),
  },
  handler: async (
    ctx: MutationCtx,
    { sehat, apiUrl, alasan, tandaiSaatDiperiksa = true },
  ): Promise<{ perluPeringatan: boolean; gagalBerturut: number }> => {
    const sekarang = Date.now();
    const existing = await ctx.db
      .query("gatewayWaStatus")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();

    const gagalBerturut = sehat ? 0 : (existing?.gagalBerturut ?? 0) + 1;

    // Gangguan sesaat (satu kali gagal) belum layak membangunkan operator;
    // dua kali berturut-turut berarti bukan kebetulan.
    const AMBANG_PERINGATAN = 2;
    const terakhirPeringatan = existing?.terakhirPeringatanPada ?? 0;
    const bolehPeringatkan =
      !sehat &&
      gagalBerturut >= AMBANG_PERINGATAN &&
      sekarang - terakhirPeringatan >= JEDA_PERINGATAN_MS;

    /**
     * Penanda waktu peringatan hanya ditulis bila email BENAR-BENAR akan
     * dikirim. Pemeriksaan manual dari panel (`kirimPeringatan: false`) tidak
     * boleh "memakan" jatah 6 jam — kalau boleh, admin yang menekan tombol
     * periksa sekali akan menelan satu-satunya email alarm untuk gangguan itu.
     */
    const tandaiPeringatan = bolehPeringatkan && tandaiSaatDiperiksa;

    const patch = {
      slot: SLOT,
      sehat,
      apiUrl,
      alasan: sehat ? undefined : (alasan ?? "tidak diketahui").slice(0, 300),
      diperiksaPada: sekarang,
      gagalBerturut,
      ...(sehat
        ? { terakhirSehatPada: sekarang }
        : existing?.terakhirSehatPada === undefined
          ? {}
          : { terakhirSehatPada: existing.terakhirSehatPada }),
      ...(tandaiPeringatan ? { terakhirPeringatanPada: sekarang } : {}),
    };

    if (existing === null) {
      await ctx.db.insert("gatewayWaStatus", patch);
    } else {
      await ctx.db.patch(existing._id, patch);
    }

    // Jejak audit hanya saat gangguan dilaporkan, bukan setiap pemeriksaan.
    if (tandaiPeringatan) {
      await ctx.db.insert("auditLog", {
        aktorLabel: "pemantau gateway WhatsApp",
        aksi: "gateway_wa_tidak_sehat",
        target: "gatewayWa",
        detail: `Pemeriksaan ${apiUrl} gagal ${gagalBerturut}× berturut: ${(alasan ?? "").slice(0, 160)}`,
        waktu: sekarang,
      });
    }

    return { perluPeringatan: bolehPeringatkan, gagalBerturut };
  },
});

/** Tandai peringatan sudah terkirim (agar tidak diulang tiap pemeriksaan). */
export const _catatPeringatanTerkirim = internalMutation({
  args: { berhasil: v.boolean(), catatan: v.string() },
  handler: async (ctx, { berhasil, catatan }) => {
    const existing = await ctx.db
      .query("gatewayWaStatus")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (existing === null) return { ok: false as const };
    // Bila email GAGAL terkirim, kosongkan penanda agar pemeriksaan berikutnya
    // mencoba lagi — kegagalan mengirim alarm tidak boleh menenggelamkan alarm.
    await ctx.db.patch(existing._id, {
      ...(berhasil ? {} : { terakhirPeringatanPada: undefined }),
    });
    await ctx.db.insert("auditLog", {
      aktorLabel: "pemantau gateway WhatsApp",
      aksi: berhasil ? "peringatan_gateway_terkirim" : "peringatan_gateway_gagal",
      target: "gatewayWa",
      detail: catatan.slice(0, 200),
      waktu: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * Satu putaran pemeriksaan (dipanggil cron).
 *
 * Urutan: baca konfigurasi → bila gateway tidak aktif/tidak punya endpoint
 * kesehatan, lewati → tanya `/health` → simpan status → kirim email bila perlu.
 */
export const cekGateway = internalAction({
  args: {
    /**
     * Kirim email peringatan bila memang perlu. Cron memakai `true`;
     * pemeriksaan manual dari panel memakai `false` karena admin sedang
     * menatap hasilnya sendiri.
     */
    kirimPeringatan: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { kirimPeringatan = true },
  ): Promise<{ diperiksa: boolean; sehat: boolean }> => {
    const cfg = await ctx.runQuery(internal.jagaGatewayWa._konfigurasi, {});
    if (!cfg.aktif || cfg.apiUrl === "") {
      return { diperiksa: false, sehat: false };
    }
    const url = urlKesehatan(cfg.apiUrl);
    if (url === null) {
      // Gateway tanpa endpoint kesehatan (mis. Fonnte): tidak ada yang bisa
      // ditanya tanpa menghasilkan peringatan palsu.
      return { diperiksa: false, sehat: false };
    }

    let sehat = false;
    let alasan = "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BATAS_CEK_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const teks = (await res.text()).slice(0, 400);
      if (!res.ok) {
        alasan = `HTTP ${res.status}: ${teks}`;
      } else {
        // Gateway membalas `{ok:true,siap:true}`. `siap:false` berarti prosesnya
        // hidup tetapi WhatsApp belum tertaut — sama tidak bisanya mengirim.
        let data: unknown = null;
        try {
          data = JSON.parse(teks);
        } catch {
          data = null;
        }
        const rec =
          data !== null && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null;
        if (rec !== null && rec.siap === false) {
          sehat = false;
          alasan =
            typeof rec.alasan === "string"
              ? `Belum siap: ${rec.alasan}`
              : "Gateway menjawab tetapi belum siap mengirim.";
        } else {
          sehat = true;
        }
      }
    } catch (galat) {
      const nama = galat instanceof Error ? galat.name : "";
      alasan =
        nama === "AbortError" || nama === "TimeoutError"
          ? `Tidak menjawab dalam ${Math.round(BATAS_CEK_MS / 1000)} detik`
          : `Tidak dapat dihubungi: ${
              galat instanceof Error ? galat.message : String(galat)
            }`;
    } finally {
      clearTimeout(timer);
    }

    const { perluPeringatan, gagalBerturut } = await ctx.runMutation(
      internal.jagaGatewayWa._simpanStatus,
      { sehat, apiUrl: cfg.apiUrl, alasan, tandaiSaatDiperiksa: kirimPeringatan },
    );

    if (perluPeringatan && kirimPeringatan) {
      const penerima = await ctx.runQuery(
        internal.jagaGatewayWa._emailOperator,
        {},
      );
      if (penerima.length === 0) {
        await ctx.runMutation(internal.jagaGatewayWa._catatPeringatanTerkirim, {
          berhasil: false,
          catatan: "Tidak ada email admin yang bisa dihubungi.",
        });
        return { diperiksa: true, sehat };
      }
      const hasil = await kirimEmailOperator(
        penerima,
        "PINDAI: gateway WhatsApp tidak dapat dihubungi",
        [
          `Pemeriksaan otomatis gagal ${gagalBerturut}× berturut-turut.`,
          ``,
          `Endpoint : ${cfg.apiUrl}`,
          `Alasan   : ${alasan}`,
          ``,
          `Dampak: kode OTP WhatsApp dan pengingat tagihan TIDAK terkirim.`,
          `Pengguna yang hanya memakai WhatsApp tidak bisa masuk.`,
          ``,
          `Yang perlu dilakukan:`,
          `1. Pastikan proses tunnel/gateway di VPS masih berjalan.`,
          `2. Bila URL tunnel berubah, perbarui apiUrl di panel admin tab WhatsApp.`,
          `3. Setelah pulih, pemeriksaan berikutnya akan menandai sehat sendiri.`,
          ``,
          `Sementara itu, arahkan pengguna memakai OTP EMAIL — jalur itu tidak`,
          `bergantung pada gateway ini.`,
        ].join("\n"),
      );
      await ctx.runMutation(internal.jagaGatewayWa._catatPeringatanTerkirim, {
        berhasil: hasil.terkirim,
        catatan: hasil.terkirim
          ? `Peringatan dikirim ke ${penerima.join(", ")}.`
          : `Gagal mengirim peringatan: ${hasil.alasan}`,
      });
    }

    return { diperiksa: true, sehat };
  },
});

/**
 * Status gateway untuk panel admin.
 *
 * Memakai `requireAdminSession` (wajib TOTP), sama seperti konfigurasi WhatsApp
 * lain. Isinya hanya status kesehatan — tidak ada rahasia.
 */
export const statusGateway = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const row = await ctx.db
      .query("gatewayWaStatus")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (row === null) return null;
    return {
      sehat: row.sehat,
      apiUrl: row.apiUrl ?? null,
      alasan: row.alasan ?? null,
      diperiksaPada: row.diperiksaPada,
      terakhirSehatPada: row.terakhirSehatPada ?? null,
      gagalBerturut: row.gagalBerturut,
    };
  },
});

/**
 * Periksa gateway SEKARANG, dipicu admin dari panel.
 *
 * Kenapa perlu tombol manual padahal sudah ada cron tiap 15 menit: saat admin
 * baru mengganti `apiUrl`, menunggu seperempat jam untuk tahu apakah URL barunya
 * benar itu terlalu lama — dan kesalahan URL adalah penyebab kegagalan yang
 * paling sering. Pemeriksaan manual memberi jawaban seketika.
 *
 * Peringatan TIDAK dikirim dari jalur ini. Admin sedang menatap layarnya; email
 * alarm untuk kegagalan yang sudah terlihat sendiri hanya menambah kebisingan.
 */
export const periksaSekarang = action({
  args: {},
  handler: async (ctx): Promise<{ sehat: boolean; alasan: string | null }> => {
    // Gerbang yang sama dengan seluruh konfigurasi WhatsApp lain: admin + TOTP.
    await ctx.runQuery(api.security.assertAdminSession, {});
    // `kirimPeringatan: false` — admin sedang menatap layarnya, dan pemeriksaan
    // manual tidak boleh menelan jatah email alarm 6 jam ke depan.
    await ctx.runAction(internal.jagaGatewayWa.cekGateway, {
      kirimPeringatan: false,
    });
    const row = await ctx.runQuery(internal.jagaGatewayWa._statusTersimpan, {});
    return { sehat: row?.sehat === true, alasan: row?.alasan ?? null };
  },
});

/** Status tersimpan tanpa gerbang — dipakai action yang sudah memeriksa admin. */
export const _statusTersimpan = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("gatewayWaStatus")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (row === null) return null;
    return {
      sehat: row.sehat,
      alasan: row.alasan ?? null,
      diperiksaPada: row.diperiksaPada,
    };
  },
});
