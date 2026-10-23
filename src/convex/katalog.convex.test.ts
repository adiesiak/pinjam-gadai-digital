/**
 * Tes katalog Murabahah berbasis tabel.
 *
 * Yang dijaga:
 *  - hanya admin yang boleh memuat dan mengubah katalog;
 *  - "muat katalog awal" idempoten;
 *  - mengubah harga menulis riwayat, dan riwayat hanya untuk perubahan harga;
 *  - barang nonaktif hilang dari formulir tetapi tetap terlihat di panel;
 *  - harga di luar rentang akad ditolak.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";

async function siapkanAdmin(t: KonteksUji, email: string) {
  return siapkanPengguna(t, "Admin Katalog", { email, role: "admin" });
}

describe("katalog syariah — pengelolaan", () => {
  it("hanya admin yang boleh memuat dan mengubah katalog", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "Bukan Admin", {
      email: "bukan-admin-katalog@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.mutation(api.katalog.muatKatalogAwal, {}),
    ).rejects.toThrow("Akses khusus Super Admin.");
    await expect(
      peminjam.mutation(api.katalog.simpanBarang, {
        kode: "el-setrika-uap",
        nama: "Setrika uap",
        kategori: "Elektronik",
        jenisBarang: "fisik",
        harga: 350_000,
        aktif: true,
      }),
    ).rejects.toThrow("Akses khusus Super Admin.");
    await expect(
      peminjam.query(api.katalog.daftarKatalogAdmin, {}),
    ).rejects.toThrow("Akses khusus Super Admin.");
  });

  it("memuat katalog awal bersifat idempoten", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanAdmin(t, "admin-muat-katalog@pindai.test");

    const pertama = await admin.mutation(api.katalog.muatKatalogAwal, {});
    expect(pertama.ditambahkan).toBeGreaterThan(10);

    const kedua = await admin.mutation(api.katalog.muatKatalogAwal, {});
    expect(kedua.ditambahkan).toBe(0);

    const panel = await admin.query(api.katalog.daftarKatalogAdmin, {});
    expect(panel.belumDimuat).toBe(0);
  });

  it("mengubah harga menulis riwayat, dan hanya saat harga berubah", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanAdmin(t, "admin-riwayat-katalog@pindai.test");

    await admin.mutation(api.katalog.simpanBarang, {
      kode: "el-setrika-uap",
      nama: "Setrika uap 1.800 W",
      kategori: "Elektronik",
      jenisBarang: "fisik",
      harga: 350_000,
      aktif: true,
    });

    // Nama berubah, harga tetap: tidak ada baris riwayat baru.
    await admin.mutation(api.katalog.simpanBarang, {
      kode: "el-setrika-uap",
      nama: "Setrika uap 1.800 W (garansi resmi)",
      kategori: "Elektronik",
      jenisBarang: "fisik",
      harga: 350_000,
      aktif: true,
    });
    expect(
      await admin.query(api.katalog.riwayatHarga, { kode: "el-setrika-uap" }),
    ).toHaveLength(0);

    await admin.mutation(api.katalog.simpanBarang, {
      kode: "el-setrika-uap",
      nama: "Setrika uap 1.800 W (garansi resmi)",
      kategori: "Elektronik",
      jenisBarang: "fisik",
      harga: 375_000,
      aktif: true,
      catatan: "Harga mitra naik",
    });
    const riwayat = await admin.query(api.katalog.riwayatHarga, {
      kode: "el-setrika-uap",
    });
    expect(riwayat).toHaveLength(1);
    expect(riwayat[0]).toMatchObject({
      hargaLama: 350_000,
      hargaBaru: 375_000,
      catatan: "Harga mitra naik",
    });
  });

  it("barang nonaktif hilang dari formulir tetapi tetap ada di panel", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanAdmin(t, "admin-nonaktif-katalog@pindai.test");
    const { sesi: peminjam } = await siapkanPengguna(t, "Nasabah Katalog", {
      email: "nasabah-katalog@pindai.test",
      role: "peminjam",
    });

    await admin.mutation(api.katalog.simpanBarang, {
      kode: "pl-pulsa-100",
      nama: "Pulsa 100.000",
      kategori: "Pulsa & data",
      jenisBarang: "digital",
      harga: 100_000,
      aktif: false,
    });

    const untukForm = await peminjam.query(api.katalog.daftarKatalog, {});
    expect(untukForm.some((barang) => barang.kode === "pl-pulsa-100")).toBe(false);
    expect(untukForm.length).toBeGreaterThan(0);

    const panel = await admin.query(api.katalog.daftarKatalogAdmin, {});
    const baris = panel.baris.find((barang) => barang.kode === "pl-pulsa-100");
    expect(baris?.aktif).toBe(false);
    expect(baris?.harga).toBe(100_000);
  });

  it("menolak harga di luar rentang akad", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanAdmin(t, "admin-harga-katalog@pindai.test");

    await expect(
      admin.mutation(api.katalog.simpanBarang, {
        kode: "el-setrika-uap",
        nama: "Setrika uap",
        kategori: "Elektronik",
        jenisBarang: "fisik",
        harga: 50_000,
        aktif: true,
      }),
    ).rejects.toThrow("Harga katalog harus rupiah bulat");

    await expect(
      admin.mutation(api.katalog.simpanBarang, {
        kode: "el-setrika-uap",
        nama: "Setrika uap",
        kategori: "Elektronik",
        jenisBarang: "fisik",
        harga: 350_000.5,
        aktif: true,
      }),
    ).rejects.toThrow("Harga katalog harus rupiah bulat");
  });
});
