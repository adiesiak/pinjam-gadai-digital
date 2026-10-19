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
import { BATAS_LANDING, KONTEN_LANDING_DEFAULT } from "../lib/landing-cms";

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

  it("admin mengubah teks beranda, publik memakai teks CMS, field kosong kembali ke bawaan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Landing", {
      email: "admin-landing@pindai.test",
      role: "admin",
    });

    // Sebelum disimpan: publik membaca konten utuh dari bawaan, termasuk tiga
    // kartu dan tiga panduan — bukan undefined yang harus dirakit klien.
    const awal = await t.query(api.announcements.getPublic, {});
    expect(awal.landing.heroJudul1).toBe(KONTEN_LANDING_DEFAULT.heroJudul1);
    expect(awal.landing.layanan).toHaveLength(3);
    expect(awal.landing.panduan).toHaveLength(3);

    await expect(
      admin.mutation(api.announcements.save, {
        landing: {
          heroJudul1: "  Biaya yang terbaca  ",
          // Kosong → pembacaan memakai bawaan, bukan judul kosong.
          heroJudul2: "   ",
          heroMikro: "m".repeat(BATAS_LANDING.heroMikro + 40),
          layanan: [
            { judul: "Kartu utama", ringkasan: "Ringkasan utama", detail: "Detail utama" },
          ],
          panduan: [{ judul: "Langkah satu", isi: "Isi langkah satu" }],
          footerDeskripsi: "Footer baru.",
        },
      }),
    ).resolves.toEqual({ ok: true });

    // Baris mentah hanya menyimpan yang dikirim, sudah dipangkas dan dipotong.
    const baris = await admin.query(api.announcements.getCmsRow, {});
    expect(baris?.landing?.heroJudul1).toBe("Biaya yang terbaca");
    expect(baris?.landing?.heroJudul2).toBeUndefined();
    expect(baris?.landing?.heroMikro).toHaveLength(BATAS_LANDING.heroMikro);
    expect(baris?.landing?.layanan).toHaveLength(1);

    const publik = await t.query(api.announcements.getPublic, {});
    expect(publik.landing.heroJudul1).toBe("Biaya yang terbaca");
    expect(publik.landing.heroJudul2).toBe(
      KONTEN_LANDING_DEFAULT.heroJudul2,
    );
    expect(publik.landing.heroMikro).toHaveLength(BATAS_LANDING.heroMikro);
    expect(publik.landing.layanan[0].judul).toBe("Kartu utama");
    // Kartu yang tidak dikirim dilengkapi bawaan pada indeks yang sama.
    expect(publik.landing.layanan[1].judul).toBe(
      KONTEN_LANDING_DEFAULT.layanan[1].judul,
    );
    expect(publik.landing.panduan[0].judul).toBe("Langkah satu");
    expect(publik.landing.panduan[2].judul).toBe(
      KONTEN_LANDING_DEFAULT.panduan[2].judul,
    );
    expect(publik.landing.footerDeskripsi).toBe("Footer baru.");

    // Bar pengumuman tidak ikut berubah hanya karena teks beranda disimpan.
    expect(publik.barTeks).toBe(DEFAULTS.bar.teks);
  });

  it("migrasi membersihkan teks CMS lama era penyedia dana dan idempoten", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Migrasi", {
      email: "admin-migrasi@pindai.test",
      role: "admin",
    });

    // Tanpa baris CMS: tidak ada yang perlu dibersihkan.
    await expect(admin.mutation(api.announcements.bersihkanTeksLama, {})).resolves.toEqual({
      ok: true,
      diganti: [],
    });

    // Simulasi konten lama era "Pendana" yang benar-benar tersimpan di DB —
    // literalnya dibiarkan apa adanya agar migrasi terbukti mengenalinya;
    // satu teks kustom bersih untuk memastikan tidak ikut dihapus.
    await expect(
      admin.mutation(api.announcements.save, {
        teks: "Alokasi dana Pendana kini tersedia untuk pinjaman pilihan.",
        tautan: "/pendana",
        popupJudul: "Pendana baru bergabung",
        heroSub: "Sisa bagi hasil untuk Pendana tercatat otomatis.",
        pinjamanJudul: "Pinjaman tunai untuk semua",
      }),
    ).resolves.toEqual({ ok: true });

    const hasil = await admin.mutation(api.announcements.bersihkanTeksLama, {});
    expect(hasil.ok).toBe(true);
    expect(hasil.diganti).toEqual(
      expect.arrayContaining(["Teks berjalan", "Tautan CTA bar", "Judul popup", "Sub-judul hero"]),
    );
    expect(hasil.diganti).not.toContain("Judul kartu pinjaman");

    // Field lama dikosongkan → publik memakai default baru; teks kustom tetap.
    const baris = await admin.query(api.announcements.getCmsRow, {});
    expect(baris?.teks).toBeUndefined();
    expect(baris?.tautan).toBeUndefined();
    expect(baris?.popupJudul).toBeUndefined();
    expect(baris?.heroSub).toBeUndefined();
    expect(baris?.pinjamanJudul).toBe("Pinjaman tunai untuk semua");

    const publik = await t.query(api.announcements.getPublic, {});
    expect(publik.barTeks).toBe(DEFAULTS.bar.teks);
    expect(publik.barTautan).toBe(DEFAULTS.bar.tautan);
    expect(publik.heroSub).toBe(DEFAULTS.hero.sub);
    // Default pengganti harus teks baru — bukan teks lama era penyedia dana.
    expect(DEFAULTS.bar.teks).not.toMatch(/pendana|alokasi/i);

    // Idempoten: pemanggilan kedua tidak mengubah apa pun.
    await expect(admin.mutation(api.announcements.bersihkanTeksLama, {})).resolves.toEqual({
      ok: true,
      diganti: [],
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
    await expect(
      peminjam.mutation(api.announcements.save, {
        landing: { heroJudul1: "Teks tidak sah" },
      }),
    ).rejects.toThrow(/admin/i);
    await expect(peminjam.mutation(api.announcements.resetToDefaults, {})).rejects.toThrow(
      /admin/i,
    );
    await expect(
      peminjam.mutation(api.announcements.bersihkanTeksLama, {}),
    ).rejects.toThrow(/admin/i);
  });
});
