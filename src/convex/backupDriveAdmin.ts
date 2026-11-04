import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { kesiapanBackupDrive } from "../lib/backupDrive";
import { audit } from "./system";

/**
 * Status dan pemicu manual backup Google Drive — hanya admin.
 *
 * Query ini tidak pernah mengembalikan kredensial. Yang terlihat hanya nama
 * variabel yang belum diisi, nama folder, dan catatan audit terakhir.
 */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const kesiapan = kesiapanBackupDrive(process.env);
    const [terakhirBackup, gagal] = await Promise.all([
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "backup"))
        .order("desc")
        .take(100),
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "backup_drive_gagal"))
        .order("desc")
        .first(),
    ]);
    const terakhir =
      terakhirBackup.find((row) => (row.detail ?? "").startsWith("google-drive:")) ??
      null;
    return {
      ...kesiapan,
      terakhir:
        terakhir === null
          ? null
          : {
              waktu: terakhir.waktu,
              status: (terakhir.detail ?? "").startsWith("google-drive: sebagian")
                ? ("sebagian" as const)
                : ("lengkap" as const),
              detail: terakhir.detail ?? "",
            },
      gagal:
        gagal === null
          ? null
          : { waktu: gagal.waktu, detail: gagal.detail ?? "" },
    };
  },
});

export const minta = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireAdminSession(ctx);
    const kesiapan = kesiapanBackupDrive(process.env);
    if (!kesiapan.siap) {
      throw new Error(kesiapan.alasan ?? "Backup Google Drive belum siap.");
    }
    await ctx.scheduler.runAfter(0, internal.backupDrive.jalankan, {
      pemicu: "manual",
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "backup_drive_diminta",
      "google-drive",
      `Backup manual KYC & pinjaman dijadwalkan ke folder ${kesiapan.folder}.`,
    );
    return { ok: true as const, folder: kesiapan.folder };
  },
});
