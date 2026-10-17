/**
 * Uji penjaga pintu masuk Google — convex-test + vitest.
 *
 * Yang dijaga di sini (aturan yang hidup DI DALAM transaksi masuk, lihat
 * `convex/auth/google.ts` dan `convex/auth.ts`):
 * - Akun Super Admin ditolak lewat pintu Google, dan penolakannya tidak
 *   meninggalkan jejak apa pun: peran serta waktu verifikasi emailnya utuh dan
 *   tidak ada baris audit yang ditulis.
 * - Penautan pertama akun Google dicatat sebagai `masuk_google`, sementara data
 *   akun tidak diubah sama sekali — terutama `name`, karena nama akun adalah
 *   kunci warisan kepemilikan pinjaman penyedia dana.
 * - Penyedia dana (peran `dana`) juga boleh lewat pintu ini.
 * - Masuk ulang dengan akun Google yang sudah tertaut tidak menulis audit lagi.
 * - Pengguna Google baru tanpa peran tetap diperlakukan sebagai peminjam, sama
 *   seperti pengguna jalur email (lihat `requirePeminjam` di `convex/loans.ts`).
 *
 * Menjalankan: bunx vitest run src/convex/auth/google.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { buatPengguna, type KonteksUji } from "../test.helpers";
import { modules } from "../test.setup";
import { jagaMasukGoogle } from "./google";

/** Panggil penjaga persis seperti `convex/auth.ts` memanggilnya. */
function jalankanPenjaga(
  t: KonteksUji,
  arg: { userId: Id<"users">; existingUserId: Id<"users"> | null },
) {
  return t.run((ctx) => jagaMasukGoogle(ctx as unknown as MutationCtx, arg));
}

async function barisAudit(t: KonteksUji) {
  return t.run((ctx) => ctx.db.query("auditLog").collect());
}

describe("kesiapan pintu Google", () => {
  it("melaporkan ada/tidaknya kredensial tanpa membocorkan isinya", async () => {
    const t = convexTest(schema, modules);
    const semula = {
      id: process.env.AUTH_GOOGLE_ID,
      secret: process.env.AUTH_GOOGLE_SECRET,
    };
    try {
      delete process.env.AUTH_GOOGLE_ID;
      delete process.env.AUTH_GOOGLE_SECRET;
      await expect(t.query(api.users.googleSiap, {})).resolves.toBe(false);

      process.env.AUTH_GOOGLE_ID = "1234567890-abc.apps.googleusercontent.com";
      await expect(t.query(api.users.googleSiap, {})).resolves.toBe(false);

      process.env.AUTH_GOOGLE_SECRET = "GOCSPX-rahasia";
      await expect(t.query(api.users.googleSiap, {})).resolves.toBe(true);
    } finally {
      // `process.env.X = undefined` menyimpan teks "undefined", jadi harus dihapus.
      if (semula.id === undefined) delete process.env.AUTH_GOOGLE_ID;
      else process.env.AUTH_GOOGLE_ID = semula.id;
      if (semula.secret === undefined) delete process.env.AUTH_GOOGLE_SECRET;
      else process.env.AUTH_GOOGLE_SECRET = semula.secret;
    }
  });
});

describe("pintu masuk Google", () => {
  it("menolak akun Super Admin tanpa mengubah data atau menulis audit", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      emailVerificationTime: 111,
      role: "admin",
    });

    await expect(
      jalankanPenjaga(t, { userId, existingUserId: null }),
    ).rejects.toThrow(/Super Admin/);

    const setelah = await t.run((ctx) => ctx.db.get(userId));
    expect(setelah?.role).toBe("admin");
    expect(setelah?.email).toBe("admin@pindai.test");
    expect(setelah?.emailVerificationTime).toBe(111);
    expect(await barisAudit(t)).toHaveLength(0);
  });

  it("mencatat penautan pertama tanpa mengubah nama atau peran akun", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      emailVerificationTime: 222,
      role: "peminjam",
    });

    await jalankanPenjaga(t, { userId, existingUserId: null });

    const audit = await barisAudit(t);
    expect(audit).toHaveLength(1);
    expect(audit[0].aksi).toBe("masuk_google");
    expect(audit[0].target).toBe("rani@pindai.test");
    expect(audit[0].aktorUserId).toBe(userId);

    const setelah = await t.run((ctx) => ctx.db.get(userId));
    expect(setelah?.name).toBe("Rani Peminjam");
    expect(setelah?.role).toBe("peminjam");
    expect(setelah?.emailVerificationTime).toBe(222);
  });

  it("mengizinkan penyedia dana (peran dana) lewat Google", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Penyedia Dana", {
      email: "dana@pindai.test",
      emailVerificationTime: 333,
      role: "dana",
    });

    await jalankanPenjaga(t, { userId, existingUserId: null });

    expect(await barisAudit(t)).toHaveLength(1);
    const setelah = await t.run((ctx) => ctx.db.get(userId));
    expect(setelah?.role).toBe("dana");
  });

  it("mengizinkan peran pemantau (pengamat) tanpa mengubah perannya", async () => {
    const t = convexTest(schema, modules);
    // `buatPengguna` hanya menerima peran uji admin/dana/peminjam, jadi baris
    // pemantau disisipkan langsung supaya peran produksi `pengamat` tetap teruji.
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Pemantau Dana",
        email: "pantau@pindai.test",
        emailVerificationTime: 555,
        role: "pengamat",
      }),
    );

    await jalankanPenjaga(t, { userId, existingUserId: null });

    const setelah = await t.run((ctx) => ctx.db.get(userId));
    expect(setelah?.role).toBe("pengamat");
    expect(setelah?.name).toBe("Pemantau Dana");
    expect(await barisAudit(t)).toHaveLength(1);
  });

  it("tidak menulis audit saat akun Google yang sama masuk lagi", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      emailVerificationTime: 444,
      role: "peminjam",
    });

    await jalankanPenjaga(t, { userId, existingUserId: userId });

    expect(await barisAudit(t)).toHaveLength(0);
    const setelah = await t.run((ctx) => ctx.db.get(userId));
    expect(setelah?.name).toBe("Rani Peminjam");
  });

  it("pengguna Google baru tanpa peran tetap bisa membaca pinjamannya", async () => {
    const t = convexTest(schema, modules);
    const { userId, sesi } = await buatPengguna(t, "Budi", {
      email: "budi@pindai.test",
      emailVerificationTime: Date.now(),
    });

    await jalankanPenjaga(t, { userId, existingUserId: null });

    // Tanpa peran eksplisit pun akun ini bukan akun tamu, jadi gate peminjam
    // (`convex/loans.ts`) menerimanya dan daftarnya kosong, bukan error.
    await expect(sesi.query(api.loans.listMyLoans, {})).resolves.toEqual([]);
    const pengguna = await sesi.query(api.users.currentUser);
    expect(pengguna?.email).toBe("budi@pindai.test");
    expect(pengguna?.role).toBeUndefined();
  });
});
