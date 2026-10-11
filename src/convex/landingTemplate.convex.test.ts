/**
 * Tes integrasi `system.setLandingTemplate` + `system.getLandingTemplatePublic`.
 *
 * Yang dijaga (inilah kontrak yang membuat "ganti template tanpa deploy" aman):
 *  1. Pembacaan PUBLIK selalu memberi template yang dapat dirender — sebelum
 *     pernah diset sekalipun (default), dan mengabaikan nilai tak dikenal.
 *  2. Hanya ADMIN bersesi sah yang boleh menulis. Tamu, Peminjam, dan Penyedia
 *     Dana ditolak oleh BACKEND (bukan sekadar tombol yang disembunyikan).
 *  3. Nilai di luar allowlist ditolak validator — tidak ada nama komponen atau
 *     kode yang bisa disuntikkan lewat argumen.
 *  4. Template tersimpan dan langsung terbaca halaman publik, sementara kolom
 *     konfigurasi lain (mis. `tema`) TIDAK ikut tertimpa.
 *  5. Setiap pergantian tercatat di Audit Trail berisi template asal → tujuan
 *     dan pelakunya; permintaan idempoten tidak menambah baris audit.
 *
 * Menjalankan: bunx vitest run src/convex/landingTemplate.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

/** Login admin ber-TOTP (gerbang sesi admin memerlukannya). */
async function admin(t: ReturnType<typeof convexTest>) {
  const { sesi } = await siapkanPengguna(t, "admin-landing", {
    email: "admin-landing@pindai.test",
    role: "admin",
  });
  return sesi;
}

describe("template landing 3D: pembacaan publik", () => {
  it("memakai default saat baris konfigurasi belum ada", async () => {
    const t = convexTest(schema, modules);
    const hasil = await t.query(api.system.getLandingTemplatePublic, {});
    expect(hasil.template).toBe("moonlit");
  });

  it("menormalkan nilai tak dikenal menjadi default, bukan error", async () => {
    const t = convexTest(schema, modules);
    // Baris lama/tidak valid: ditulis langsung ke DB, melewati mutation.
    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        slot: "global",
        // Nilai yang tidak ada di allowlist saat ini.
        landingTemplate: "tema-usang" as never,
        diperbaruiPada: Date.now(),
      });
    });
    const hasil = await t.query(api.system.getLandingTemplatePublic, {});
    expect(hasil.template).toBe("moonlit");
  });
});

describe("template landing 3D: otorisasi backend", () => {
  it("menolak tamu yang belum masuk", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.system.setLandingTemplate, { template: "orbit" }),
    ).rejects.toThrow();
  });

  it("menolak Peminjam dan Penyedia Dana meski sesinya sah", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "peminjam-landing", {
      email: "peminjam-landing@pindai.test",
      role: "peminjam",
    });
    const { sesi: pendana } = await siapkanPengguna(t, "dana-landing", {
      email: "dana-landing@pindai.test",
      role: "dana",
    });

    await expect(
      peminjam.mutation(api.system.setLandingTemplate, { template: "orbit" }),
    ).rejects.toThrow();
    await expect(
      pendana.mutation(api.system.setLandingTemplate, { template: "orbit" }),
    ).rejects.toThrow();

    // Tidak ada yang tersimpan: permintaan tidak sah tidak boleh berbekas.
    const hasil = await t.query(api.system.getLandingTemplatePublic, {});
    expect(hasil.template).toBe("moonlit");
  });

  it("menolak ID di luar allowlist walau sesinya admin", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await admin(t);
    await expect(
      asAdmin.mutation(api.system.setLandingTemplate, {
        template: "komponen-sembarang" as never,
      }),
    ).rejects.toThrow();
  });
});

describe("template landing 3D: penggantian oleh admin", () => {
  it("menyimpan pilihan, langsung terbaca publik, lain-lain tidak tertimpa", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await admin(t);

    // Konfigurasi yang sudah ada — harus tetap utuh setelah ganti template.
    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        slot: "global",
        versi: 7,
        tema: "salju",
        persenAdmin: 5,
        diperbaruiPada: Date.now(),
      });
    });

    const hasil = await asAdmin.mutation(api.system.setLandingTemplate, {
      template: "vault",
    });
    expect(hasil).toMatchObject({ ok: true, template: "vault", sebelumnya: "moonlit", berubah: true });

    const publik = await t.query(api.system.getLandingTemplatePublic, {});
    expect(publik.template).toBe("vault");

    const baris = await t.run(async (ctx) =>
      ctx.db
        .query("systemConfig")
        .withIndex("by_slot", (q) => q.eq("slot", "global"))
        .first(),
    );
    expect(baris?.landingTemplate).toBe("vault");
    // Ganti template TIDAK menyentuh versi form maupun tema visual.
    expect(baris?.versi).toBe(7);
    expect(baris?.tema).toBe("salju");
    expect(baris?.persenAdmin).toBe(5);
  });

  it("mencatat audit berisi template asal → tujuan dan pelakunya", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await admin(t);

    await asAdmin.mutation(api.system.setLandingTemplate, { template: "digital-gate" });
    await asAdmin.mutation(api.system.setLandingTemplate, { template: "city" });

    const audit = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "template_landing_3d"))
        .collect(),
    );
    expect(audit).toHaveLength(2);
    const terbaru = audit[audit.length - 1];
    expect(terbaru.detail).toContain("DIGITAL GATE");
    expect(terbaru.detail).toContain("PINDAI CITY");
    expect(terbaru.aktorUserId).toBeDefined();
    expect(terbaru.waktu).toBeGreaterThan(0);
  });

  it("idempoten: memilih template yang sama tidak menambah baris audit", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await admin(t);

    await asAdmin.mutation(api.system.setLandingTemplate, { template: "floating-green" });
    const ulang = await asAdmin.mutation(api.system.setLandingTemplate, {
      template: "floating-green",
    });
    expect(ulang.berubah).toBe(false);

    const audit = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "template_landing_3d"))
        .collect(),
    );
    expect(audit).toHaveLength(1);
  });

  it("mengubah template visual website (tema) tetap jalan berdampingan", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await admin(t);

    await asAdmin.mutation(api.system.setLandingTemplate, { template: "orbit" });
    const tema = await asAdmin.mutation(api.system.setWebsiteTemplate, { tema: "karnival" });

    expect(tema.ok).toBe(true);
    const publik = await t.query(api.system.getThemePublic, {});
    expect(publik.tema).toBe("karnival");
    // Ganti tema warna tidak mengembalikan template 3D ke default.
    const landing = await t.query(api.system.getLandingTemplatePublic, {});
    expect(landing.template).toBe("orbit");
  });
});
