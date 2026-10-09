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
import { MIN_FILE_BYTES } from "../lib/kyc";

export type KonteksUji = TestConvexForDataModelAndIdentity<DataModel>;
export type SesiUji = TestConvexForDataModel<DataModel>;

/** Secret TOTP uji — gerbang sesi hanya memerlukan secret yang terpasang. */
export const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

const MASA_SESI_MS = 60 * 60 * 1000;

export type PeranUji = "admin" | "dana" | "peminjam";

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

/**
 * Buat sesi Auth tambahan bagi pengguna yang sudah ada (mis. "perangkat lain").
 * Baris `users` tidak dibuat ulang — hanya sesi baru dengan subject produksi.
 */
export async function buatSesiLain(
  t: KonteksUji,
  nama: string,
  userId: Id<"users">,
): Promise<{ sesi: SesiUji; authSessionId: Id<"authSessions"> }> {
  const authSessionId = await t.run((ctx) =>
    ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + MASA_SESI_MS,
    }),
  );
  return {
    authSessionId,
    sesi: t.withIdentity({ subject: `${userId}|${authSessionId}`, name: nama }),
  };
}

/**
 * Pasang TOTP terverifikasi pada satu atau beberapa sesi.
 * Default: hanya `authSessionId`; beri `verifiedAuthSessionIds` eksplisit bila
 * tes perlu beberapa sesi terverifikasi sekaligus (mis. uji rotasi).
 */
export async function aktifkanTotpUntukSesi(
  t: KonteksUji,
  userId: Id<"users">,
  authSessionId: Id<"authSessions">,
  verifiedAuthSessionIds: Id<"authSessions">[] = [authSessionId],
): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("mfaSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const patch = {
      totpSecret: TEST_TOTP_SECRET,
      totpVerifiedAuthSessionIds: verifiedAuthSessionIds,
    };
    if (existing === null) {
      await ctx.db.insert("mfaSettings", { userId, ...patch });
    } else {
      await ctx.db.patch(existing._id, patch);
    }
  });
}

/** Pasang TOTP terverifikasi pada sesi utama saja. */

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

/**
 * Simpan berkas uji dengan contentType berupa GAMBAR.
 *
 * `ctx.storage.store` milik convex-test hanya menulis `{ size, sha256 }` ke
 * tabel `_storage` — `contentType` tidak pernah diisi. Karena validasi server
 * menolak berkas tanpa tipe gambar (`berkasIdentitas.periksaBerkasIdentitasStorage`),
 * berkas uji harus ditambal metadatanya agar melewati gerbang yang SAMA dengan
 * unggahan nyata dari peramban — bukan mematikan gerbangnya.
 *
 * Isinya juga di-pad melewati `MIN_FILE_BYTES`: server menolak berkas yang
 * lebih kecil sebagai "kosong", jadi blok uji beberapa byte akan gagal di
 * gerbang ukuran yang sama dengan berkas kosong di produksi.
 */
export async function simpanBerkasUji(
  t: SesiUji,
  isi: string,
  contentType = "image/png",
): Promise<Id<"_storage">> {
  return t.run(async (ctx) => {
    const byte = new TextEncoder().encode(isi);
    const buffer = new Uint8Array(Math.max(byte.byteLength, MIN_FILE_BYTES));
    buffer.set(byte);
    const id = await ctx.storage.store(new Blob([buffer], { type: contentType }));
    await (
      ctx.db as unknown as {
        patch: (table: string, id: string, value: Record<string, unknown>) => Promise<void>;
      }
    ).patch("_storage", id, { contentType });
    return id;
  });
}
