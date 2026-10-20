import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isiEmailPengingat, subjekEmailPengingat } from "../lib/emailPengingat";

/** Batas percobaan per pengingat — gateway yang bermasalah tidak dispam tiap jam. */
const BATAS_PERCOBAAN = 3;

/**
 * Data yang dibutuhkan sebelum mengirim satu email pengingat.
 *
 * Email tujuan HANYA `users.email` milik pemilik akun. Tidak ada alamat
 * cadangan: kalau akun tidak punya email, kanal email memang tidak bisa dipakai
 * dan pengingat WhatsApp tetap berjalan sesuai pengaturan Super Admin.
 */
export const _dataKirim = internalQuery({
  args: { userId: v.id("users"), kunci: v.string() },
  handler: async (ctx, { userId, kunci }) => {
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const sebelumnya = await ctx.db
      .query("emailNotifikasiLog")
      .withIndex("by_user_kunci", (q) => q.eq("userId", userId).eq("kunci", kunci))
      .first();
    const sudahSelesai =
      sebelumnya !== null &&
      (sebelumnya.status === "terkirim" ||
        sebelumnya.status === "tanpa_konfigurasi" ||
        sebelumnya.percobaan >= BATAS_PERCOBAAN);
    return {
      email: user.email ?? null,
      sudahSelesai,
    };
  },
});

/** Tulis hasil percobaan; satu baris per (pengguna, kunci), diperbarui saat retry. */
export const _catat = internalMutation({
  args: {
    userId: v.id("users"),
    kunci: v.string(),
    jenis: v.string(),
    ke: v.string(),
    subjek: v.string(),
    status: v.string(),
    respon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ada = await ctx.db
      .query("emailNotifikasiLog")
      .withIndex("by_user_kunci", (q) =>
        q.eq("userId", args.userId).eq("kunci", args.kunci),
      )
      .first();
    if (ada === null) {
      await ctx.db.insert("emailNotifikasiLog", {
        ...args,
        percobaan: 1,
        waktu: Date.now(),
      });
      return;
    }
    await ctx.db.patch(ada._id, {
      jenis: args.jenis,
      ke: args.ke,
      subjek: args.subjek,
      status: args.status,
      respon: args.respon,
      percobaan: ada.percobaan + 1,
      waktu: Date.now(),
    });
  },
});

/** Ambil pesan galat dari balasan gateway tanpa pernah menyalin header/kredensial. */
function galatGateway(status: number, json: unknown): string {
  const isi = json as { error?: unknown; message?: unknown } | null;
  const detail =
    typeof isi?.error === "string"
      ? isi.error
      : typeof isi?.message === "string"
        ? isi.message
        : "";
  return `HTTP ${status}${detail === "" ? "" : `: ${detail}`}`.slice(0, 240);
}

/**
 * Kirim SATU email pengingat yang sudah lolos pemeriksaan.
 *
 * Tidak pernah melempar: cron tidak boleh mati karena email gagal, dan
 * pengingat WhatsApp di jalur yang sama tidak boleh ikut batal. Hasilnya
 * dikembalikan apa adanya, lalu dicatat di `emailNotifikasiLog`.
 *
 * Idempoten per `kunci` (mis. `angsuran:<id>:<tanggal>:<jenis>`): cron yang
 * berjalan tiap jam tidak mengirim email yang sama dua kali, termasuk ketika
 * kanal WhatsApp dimatikan sehingga log WhatsApp tidak bisa dipakai sebagai
 * penanda.
 */
export const kirimPengingat = internalAction({
  args: {
    userId: v.id("users"),
    kunci: v.string(),
    jenis: v.string(),
    judul: v.string(),
    isi: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const data = await ctx.runQuery(internal.emailNotifikasi._dataKirim, {
      userId: args.userId,
      kunci: args.kunci,
    });
    if (data === null) return { status: "tanpa_pengguna" };
    if (data.email === null) return { status: "tanpa_email" };
    // Gerbang efektif: sakelar global admin DAN override nasabah ini.
    const emailAktif = await ctx.runQuery(internal.notifikasiNasabah._kanalAktif, {
      userId: args.userId,
      kanal: "email",
    });
    if (!emailAktif) return { status: "dimatikan" };
    if (data.sudahSelesai) return { status: "sudah_selesai" };
    const email = data.email;

    const subjek = subjekEmailPengingat(args.judul);
    const catat = (status: string, respon?: string) =>
      ctx.runMutation(internal.emailNotifikasi._catat, {
        userId: args.userId,
        kunci: args.kunci,
        jenis: args.jenis,
        ke: email,
        subjek,
        status,
        ...(respon === undefined ? {} : { respon }),
      });

    const key = process.env.VLY_INTEGRATION_KEY;
    if (!key) {
      await catat("tanpa_konfigurasi", "VLY_INTEGRATION_KEY belum diisi di environment.");
      return { status: "tanpa_konfigurasi" };
    }

    const base = (process.env.VLY_INTEGRATION_BASE_URL || "https://integrations.vly.ai")
      .replace(/\/+$/, "");
    try {
      const res = await fetch(`${base}/v1/email/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          to: email,
          subject: subjek,
          text: isiEmailPengingat(args.isi),
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      const isiJson = json as { success?: boolean; data?: { status?: string } } | null;
      const berhasil =
        res.ok && isiJson?.success !== false && isiJson?.data?.status !== "failed";
      await catat(
        berhasil ? "terkirim" : "gagal",
        berhasil ? undefined : galatGateway(res.status, json),
      );
      return { status: berhasil ? "terkirim" : "gagal" };
    } catch (error) {
      const pesan = error instanceof Error ? error.message : String(error);
      await catat("gagal", pesan.slice(0, 240));
      return { status: "gagal" };
    }
  },
});
