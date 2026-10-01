/**
 * Tes integrasi Convex — CMS konten situs oleh admin.
 *
 * Membuktikan halaman publik memakai default, perubahan admin langsung
 * terbaca publik setelah disimpan, dan konten kembali ke default saat reset.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";
import { DEFAULTS } from "./announcements";

describe("CMS situs publik — pengaturan admin", () => {
  it("admin mengubah konten landing, publik melihatnya, lalu reset ke default", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin CMS", {
      email: "admin-cms@pindai.test",
      role: "admin",
    });

    // Pengunjung belum login tetap bisa membaca konten publik bawaan.
    const defaultPublik = await t.query(api.announcements.getPublic, {});
    expect(defaultPublik.heroJudul).toBe(DEFAULTS.hero.judul);
    expect(defaultPublik.barAktif).toBe(true);
    expect(await t.query(api.announcements.getCmsRow, {})).toBeNull();

    await expect(
      admin.mutation(api.announcements.save, {
        teks: "  Promo Ramadan PINDAI  ",
        tautan: "/auth?mode=signup",
        barAktif: false,
        popupJudul: "Promo khusus",
        floatDelayDetik: 90,
        heroJudul: "PINDAI untuk usaha",
        heroCta1: "Ajukan sekarang",
      }),
    ).resolves.toEqual({ ok: true });

    const tersimpan = await admin.query(api.announcements.getCmsRow, {});
    expect(tersimpan).toMatchObject({
      slot: "global",
      teks: "Promo Ramadan PINDAI",
      tautan: "/auth?mode=signup",
      aktif: false,
      popupJudul: "Promo khusus",
      floatDelayDetik: 60,
      heroJudul: "PINDAI untuk usaha",
      heroCta1: "Ajukan sekarang",
    });

    const publik = await t.query(api.announcements.getPublic, {});
    expect(publik).toMatchObject({
      barTeks: "Promo Ramadan PINDAI",
      barAktif: false,
      popupJudul: "Promo khusus",
      floatDelayDetik: 60,
      heroJudul: "PINDAI untuk usaha",
      heroCta1: "Ajukan sekarang",
      heroJudul2: DEFAULTS.hero.judul2,
    });

    await expect(admin.mutation(api.announcements.resetToDefaults, {})).resolves.toEqual({
      ok: true,
    });
    expect(await admin.query(api.announcements.getCmsRow, {})).toBeNull();
    expect(await t.query(api.announcements.getPublic, {})).toMatchObject({
      heroJudul: DEFAULTS.hero.judul,
      barTeks: DEFAULTS.bar.teks,
      barAktif: true,
    });
  });

  it("non-admin boleh baca konten publik tetapi tidak melihat baris CMS atau mengubahnya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "Peminjam", {
      email: "peminjam-cms@pindai.test",
      role: "peminjam",
    });

    await expect(peminjam.query(api.announcements.getPublic, {})).resolves.toMatchObject({
      heroJudul: DEFAULTS.hero.judul,
    });
    await expect(peminjam.query(api.announcements.getCmsRow, {})).resolves.toBeNull();
    await expect(
      peminjam.mutation(api.announcements.save, { heroJudul: "Teks tidak sah" }),
    ).rejects.toThrow(/admin/i);
    await expect(peminjam.mutation(api.announcements.resetToDefaults, {})).rejects.toThrow(
      /admin/i,
    );
  });
});
