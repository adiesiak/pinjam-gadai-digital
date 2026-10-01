/**
 * Helper identitas uji bersama untuk convex-test.
 *
 * Gerbang administrasi memerlukan kombinasi yang sama di semua tes: baris
 * `users`, baris `authSessions`, dan — untuk admin — `mfaSettings` dengan TOTP
 * terverifikasi pada sesi itu, serta subject berformat
 * `<userId>|<authSessionId>` seperti di produksi. Modul ini menyatukan pola
 * tersebut supaya tiap file tes tidak menyalinnya sendiri.
 *
 * Nama file memakai titik (bukan tanda hubung) karena Convex menolak tanda
 * hubung pada path modul.
 */
import type {
  TestConvexForDataModel,
  TestConvexForDataModelAndIdentity,
} from "convex-test";

import type { DataModel, Id } from "./_generated/dataModel";

export type KonteksUji = TestConvexForDataModelAndIdentity<DataModel>;
export type SesiUji = TestConvexForDataModel<DataModel>;

/** Secret TOTP uji — gerbang sesi hanya memerlukan secret yang terpasang. */
export const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

const MASA_SESI_MS = 60 * 60 * 1000;

export type PeranUji = "admin" | "pendana" | "peminjam";

export type OpsiPenggunaUji = {
  email?: string;
  emailVerificationTime?: number;
  isAnonymous?: boolean;
  role?: PeranUji;
};

export type PenggunaUji = {
  sesi: SesiUji;
  userId: Id<"users">;
  authSessionId: Id<"authSessions">;
};

/**
 * Buat baris `users` + `authSessions` dan kembalikan sesinya dengan subject
 * produksi. Field hanya diisi bila diberikan (tanpa TOTP otomatis).
 */
export async function buatPengguna(
  t: KonteksUji,
  nama: string,
  opsi: OpsiPenggunaUji = {},
): Promise<PenggunaUji> {
  const userId = await t.mutation((ctx) =>
    ctx.db.insert("users", {
      ...(opsi.email !== undefined ? { email: opsi.email } : {}),
      ...(opsi.emailVerificationTime !== undefined
        ? { emailVerificationTime: opsi.emailVerificationTime }
        : {}),
      ...(opsi.isAnonymous !== undefined ? { isAnonymous: opsi.isAnonymous } : {}),
      name: nama,
      ...(opsi.role !== undefined ? { role: opsi.role } : {}),
    }),
  );
  const authSessionId = await t.run((ctx) =>
    ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + MASA_SESI_MS,
    }),
  );
  return {
    userId,
    authSessionId,
    sesi: t.withIdentity({ subject: `${userId}|${authSessionId}`, name: nama }),
  };
}

/** Pasang TOTP terverifikasi pada sesi tertentu (mis. sesi perangkat lain). */
export async function aktifkanTotpUntukSesi(
  t: KonteksUji,
  userId: Id<"users">,
  authSessionId: Id<"authSessions">,
): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("mfaSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const patch = {
      totpSecret: TEST_TOTP_SECRET,
      totpVerifiedAuthSessionIds: [authSessionId],
    };
    if (existing === null) {
      await ctx.db.insert("mfaSettings", { userId, ...patch });
    } else {
      await ctx.db.patch(existing._id, patch);
    }
  });
}

/** Email terverifikasi + TOTP otomatis untuk admin — dipakai mayoritas tes. */
export async function siapkanPengguna(
  t: KonteksUji,
  nama: string,
  opsi: { email: string; role: PeranUji },
): Promise<PenggunaUji> {
  const pengguna = await buatPengguna(t, nama, {
    email: opsi.email,
    emailVerificationTime: Date.now(),
    role: opsi.role,
  });
  if (opsi.role === "admin") {
    await aktifkanTotpUntukSesi(t, pengguna.userId, pengguna.authSessionId);
  }
  return pengguna;
}

/** Varian ringkas bagi tes yang hanya butuh objek sesinya. */
export async function buatSesi(
  t: KonteksUji,
  nama: string,
  opsi: { email: string; role: PeranUji },
): Promise<SesiUji> {
  return (await siapkanPengguna(t, nama, opsi)).sesi;
}
