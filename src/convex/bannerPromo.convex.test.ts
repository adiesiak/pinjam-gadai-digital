/**
 * Tes integrasi Convex — banner promo bergambar.
 *
 * Membuktikan pemilihan banner memakai prioritas, jadwal, penempatan, dan promo
 * bunga yang diikat; gambar hanya bisa ditautkan setelah isinya diperiksa; dan
 * hanya admin yang boleh mengubah kampanye.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;

function blobPng(): Blob {
  return new Blob(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
    { type: "image/png" },
  );
}

type ArgSimpan = Partial<{
  nama: string;
  judul: string;
  tautan: string;
  penempatan: ("beranda" | "dashboard" | "promo")[];
  mulai: number;
  selesai: number;
  aktif: boolean;
  promoBungaId: Id<"promoBunga"> | null;
  prioritas: number;
}>;

async function simpanBanner(
  admin: Awaited<ReturnType<typeof siapkanPengguna>>["sesi"],
  args: ArgSimpan = {},
) {
  const sekarang = Date.now();
  return await admin.mutation(api.bannerPromo.simpan, {
    nama: "Kampanye tes",
    judul: "Promo PINDAI",
    tautan: "/promo",
    penempatan: ["beranda", "dashboard"],
    mulai: sekarang - HARI,
    selesai: sekarang + 7 * HARI,
    aktif: true,
    promoBungaId: null,
    prioritas: 10,
    ...args,
  });
}

describe("banner promo bergambar", () => {
  it("memilih banner berdasarkan penempatan, prioritas, dan sakelar", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Banner", {
      email: "admin-banner-gambar@pindai.test",
      role: "admin",
    });

    expect(await t.query(api.bannerPromo.aktif, { penempatan: "beranda" })).toBeNull();

    const sekarang = Date.now();
    const utama = await simpanBanner(admin);
    const utamaBerkas = await t.run((ctx) => ctx.storage.store(blobPng()));
    await admin.action(api.bannerPromo.pasangGambar, {
      id: utama.id,
      varian: "desktop",
      berkasId: utamaBerkas,
    });

    // Tanpa gambar ponsel, server mengirim mobileUrl null; klien memakai rasio
    // desktop, bukan memotong gambar lebar menjadi 4:5.
    const beranda = await t.query(api.bannerPromo.aktif, {
      penempatan: "beranda",
    });
    expect(beranda?._id).toBe(utama.id);
    expect(beranda?.desktopUrl).toMatch(/^https?:/);
    expect(beranda?.mobileUrl).toBeNull();

    // Penempatan lain tidak ikut tampil.
    expect(
      await t.query(api.bannerPromo.aktif, { penempatan: "promo" }),
    ).toBeNull();
    expect(
      (await t.query(api.bannerPromo.aktif, { penempatan: "dashboard" }))?._id,
    ).toBe(utama.id);

    // Kampanye berprioritas paling kecil tetapi belum berjalan tetap dilewati.
    const belum = await simpanBanner(admin, {
      nama: "Kampanye mendatang",
      penempatan: ["beranda"],
      prioritas: 1,
      mulai: sekarang + 2 * HARI,
      selesai: sekarang + 4 * HARI,
    });
    const belumBerkas = await t.run((ctx) => ctx.storage.store(blobPng()));
    await admin.action(api.bannerPromo.pasangGambar, {
      id: belum.id,
      varian: "desktop",
      berkasId: belumBerkas,
    });
    expect(
      (await t.query(api.bannerPromo.aktif, { penempatan: "beranda" }))?._id,
    ).toBe(utama.id);

    // Kampanye prioritas lebih kecil yang sedang berjalan mengambil alih beranda.
    const cadangan = await simpanBanner(admin, {
      nama: "Kampanye cadangan",
      penempatan: ["beranda"],
      prioritas: 5,
    });
    const cadanganBerkas = await t.run((ctx) => ctx.storage.store(blobPng()));
    await admin.action(api.bannerPromo.pasangGambar, {
      id: cadangan.id,
      varian: "desktop",
      berkasId: cadanganBerkas,
    });
    expect(
      (await t.query(api.bannerPromo.aktif, { penempatan: "beranda" }))?._id,
    ).toBe(cadangan.id);
    // Dashboard tetap memakai kampanye utama karena cadangan hanya beranda.
    expect(
      (await t.query(api.bannerPromo.aktif, { penempatan: "dashboard" }))?._id,
    ).toBe(utama.id);

    // Sakelar mematikan kampanye prioritas tinggi mengembalikan yang berikutnya.
    await admin.mutation(api.bannerPromo.setAktif, {
      id: cadangan.id,
      aktif: false,
    });
    expect(
      (await t.query(api.bannerPromo.aktif, { penempatan: "beranda" }))?._id,
    ).toBe(utama.id);
  });

  it("gambar ponsel punya URL sendiri dan isi berkas diperiksa", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Gambar", {
      email: "admin-gambar-banner@pindai.test",
      role: "admin",
    });
    const banner = await simpanBanner(admin, { penempatan: ["beranda"] });

    const teks = await t.run((ctx) =>
      ctx.storage.store(new Blob(["bukan gambar"], { type: "image/png" })),
    );
    await expect(
      admin.action(api.bannerPromo.pasangGambar, {
        id: banner.id,
        varian: "desktop",
        berkasId: teks,
      }),
    ).rejects.toThrow(/JPG, PNG, atau WebP/i);

    const desktop = await t.run((ctx) => ctx.storage.store(blobPng()));
    const mobile = await t.run((ctx) => ctx.storage.store(blobPng()));
    await admin.action(api.bannerPromo.pasangGambar, {
      id: banner.id,
      varian: "desktop",
      berkasId: desktop,
    });
    await admin.action(api.bannerPromo.pasangGambar, {
      id: banner.id,
      varian: "mobile",
      berkasId: mobile,
    });

    const tampil = await t.query(api.bannerPromo.aktif, {
      penempatan: "beranda",
    });
    expect(tampil?.desktopUrl).toMatch(/^https?:/);
    expect(tampil?.mobileUrl).toMatch(/^https?:/);

    // Dua varian benar-benar tersimpan sebagai berkas terpisah.
    const tersimpan = await t.run((ctx) => ctx.db.get(banner.id));
    expect(tersimpan?.gambarDesktopId).toBeDefined();
    expect(tersimpan?.gambarMobileId).toBeDefined();
    expect(tersimpan?.gambarDesktopId).not.toBe(tersimpan?.gambarMobileId);

    const daftar = await admin.query(api.bannerPromo.daftar, {});
    expect(daftar[0]).toMatchObject({
      nama: "Kampanye tes",
      desktopUrl: expect.stringMatching(/^https?:/),
      mobileUrl: expect.stringMatching(/^https?:/),
    });
  });

  it("promo yang diikat menahan banner dan memotong tanggal berakhirnya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Promo Banner", {
      email: "admin-promo-banner@pindai.test",
      role: "admin",
    });
    const sekarang = Date.now();
    const promoId = await t.run((ctx) =>
      ctx.db.insert("promoBunga", {
        nama: "Promo banner",
        persenBunga: 15,
        tenor: [7],
        mulai: sekarang + HARI,
        selesai: sekarang + 2 * HARI,
        aktif: true,
        dibuatPada: sekarang,
        diperbaruiPada: sekarang,
        diperbaruiOleh: "tes",
      }),
    );

    const banner = await simpanBanner(admin, { promoBungaId: promoId });
    const berkas = await t.run((ctx) => ctx.storage.store(blobPng()));
    await admin.action(api.bannerPromo.pasangGambar, {
      id: banner.id,
      varian: "desktop",
      berkasId: berkas,
    });

    // Promo belum berjalan: banner ikut menunggu.
    expect(
      await t.query(api.bannerPromo.aktif, { penempatan: "beranda" }),
    ).toBeNull();

    await t.run((ctx) =>
      ctx.db.patch(promoId, {
        mulai: sekarang - HARI,
        selesai: sekarang + 2 * HARI,
      }),
    );
    const tampil = await t.query(api.bannerPromo.aktif, {
      penempatan: "beranda",
    });
    expect(tampil?.promoNama).toBe("Promo banner");
    expect(tampil?.selesai).toBe(sekarang + 2 * HARI);

    // Promo dinonaktifkan: banner ikut hilang walau jadwalnya masih panjang.
    await t.run((ctx) => ctx.db.patch(promoId, { aktif: false }));
    expect(
      await t.query(api.bannerPromo.aktif, { penempatan: "beranda" }),
    ).toBeNull();
  });

  it("menolak jadwal/tautan yang salah dan hanya mengizinkan admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Validasi", {
      email: "admin-validasi-banner@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPengguna(t, "Peminjam", {
      email: "peminjam-banner-gambar@pindai.test",
      role: "peminjam",
    });
    const sekarang = Date.now();

    await expect(
      admin.mutation(api.bannerPromo.simpan, {
        nama: " ",
        judul: "",
        tautan: "",
        penempatan: ["beranda"],
        mulai: sekarang,
        selesai: sekarang + HARI,
        aktif: true,
        promoBungaId: null,
        prioritas: 10,
      }),
    ).rejects.toThrow(/Nama kampanye/i);

    await expect(
      simpanBanner(admin, { tautan: "https://situs-luar.test" }),
    ).rejects.toThrow(/path internal/i);
    await expect(
      simpanBanner(admin, { penempatan: [] }),
    ).rejects.toThrow(/tempat tampil/i);
    await expect(
      simpanBanner(admin, { selesai: sekarang - 2 * HARI }),
    ).rejects.toThrow(/setelah tanggal mulai/i);

    await expect(
      peminjam.query(api.bannerPromo.daftar, {}),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.bannerPromo.simpan, {
        nama: "Bukan haknya",
        judul: "",
        tautan: "",
        penempatan: ["beranda"],
        mulai: sekarang,
        selesai: sekarang + HARI,
        aktif: true,
        promoBungaId: null,
        prioritas: 1,
      }),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.bannerPromo.generateUploadUrl, {}),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.action(api.bannerPromo.pasangGambar, {
        id: (await simpanBanner(admin)).id,
        varian: "desktop",
        berkasId: await t.run((ctx) => ctx.storage.store(blobPng())),
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("hapus kampanye membersihkan baris dan gambarnya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Hapus Banner", {
      email: "admin-hapus-banner@pindai.test",
      role: "admin",
    });
    const banner = await simpanBanner(admin, { penempatan: ["promo"] });
    const berkas = await t.run((ctx) => ctx.storage.store(blobPng()));
    await admin.action(api.bannerPromo.pasangGambar, {
      id: banner.id,
      varian: "desktop",
      berkasId: berkas,
    });
    expect(
      await t.query(api.bannerPromo.aktif, { penempatan: "promo" }),
    ).not.toBeNull();

    await expect(
      admin.mutation(api.bannerPromo.hapus, { id: banner.id }),
    ).resolves.toEqual({ ok: true });
    expect(await admin.query(api.bannerPromo.daftar, {})).toHaveLength(0);
    expect(
      await t.query(api.bannerPromo.aktif, { penempatan: "promo" }),
    ).toBeNull();
  });
});
