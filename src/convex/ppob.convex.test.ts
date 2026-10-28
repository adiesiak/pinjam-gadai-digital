/**
 * Tes integrasi Convex — PPOB publik.
 *
 * Yang dijaga:
 *  - harga dan laba DIBEKUKAN saat pesanan dibuat, bukan dibaca ulang saat dibayar;
 *  - klik ganda tidak membuat dua tagihan;
 *  - etalase yang ditutup menolak pesanan, dan nomor tujuan divalidasi server;
 *  - hanya admin bertotp yang boleh mengubah pengaturan, harga, dan status bayar;
 *  - status final tidak bisa dibalik oleh pesan provider yang lebih tua;
 *  - sinkron harga mempertahankan harga manual selama masih di atas lantai.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const PENGATURAN = {
  aktif: true,
  provider: "digiflazz",
  baseUrl: "",
  username: "pindai-uji",
  markupPersen: 5,
  markupMin: 500,
  instruksi: "Transfer sesuai nominal, cantumkan kode pesanan.",
};

async function siapkanEtalase(t: ReturnType<typeof convexTest>) {
  const { sesi: admin } = await siapkanPengguna(t, "Admin PPOB", {
    email: "admin-ppob@pindai.test",
    role: "admin",
  });
  await admin.mutation(api.ppob.simpanPengaturan, PENGATURAN);
  const produkId = await t.run((ctx) =>
    ctx.db.insert("ppobProduk", {
      kode: "TSEL10",
      nama: "Telkomsel 10.000",
      kategori: "pulsa",
      operator: "Telkomsel",
      hargaModal: 9_850,
      hargaJual: 10_400,
      aktif: true,
      tersedia: true,
      diperbaruiPada: Date.now(),
      dibuatPada: Date.now(),
    }),
  );
  return { admin, produkId };
}

async function pesan(
  t: ReturnType<typeof convexTest>,
  nomorTujuan = "081234567890",
) {
  return await t.mutation(api.ppob.buatPesanan, {
    kodeProduk: "TSEL10",
    nomorTujuan,
    nama: "Rani",
    whatsapp: "081298765432",
  });
}

describe("PPOB publik", () => {
  it("membuat pesanan dengan harga dan laba yang dibekukan", async () => {
    const t = convexTest(schema, modules);
    const { admin, produkId } = await siapkanEtalase(t);

    const hasil = await pesan(t);
    expect(hasil.ulang).toBe(false);
    expect(hasil.kodePesanan).toMatch(/^PPOB-\d{6}-[A-Z0-9]{6}$/);

    const baris = await t.run((ctx) =>
      ctx.db
        .query("ppobPesanan")
        .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", hasil.kodePesanan))
        .first(),
    );
    expect(baris?.hargaModal).toBe(9_850);
    expect(baris?.hargaJual).toBe(10_400);
    expect(baris?.laba).toBe(550);
    expect(baris?.status).toBe("menunggu_bayar");
    expect(baris?.nomorTujuan).toBe("081234567890");

    // Admin menaikkan harga produk setelah pesanan dibuat: pesanan lama tetap.
    await admin.mutation(api.ppob.setHargaJual, {
      id: produkId,
      hargaJual: 11_000,
    });
    const ulang = await t.run((ctx) =>
      ctx.db
        .query("ppobPesanan")
        .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", hasil.kodePesanan))
        .first(),
    );
    expect(ulang?.hargaJual).toBe(10_400);
  });

  it("klik ganda mengembalikan pesanan yang sama, bukan tagihan baru", async () => {
    const t = convexTest(schema, modules);
    await siapkanEtalase(t);
    const pertama = await pesan(t);
    const kedua = await pesan(t);
    expect(kedua.kodePesanan).toBe(pertama.kodePesanan);
    expect(kedua.ulang).toBe(true);

    const jumlah = await t.run((ctx) => ctx.db.query("ppobPesanan").collect());
    expect(jumlah).toHaveLength(1);
  });

  it("menolak etalase yang ditutup dan nomor yang tidak valid", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await siapkanEtalase(t);

    await expect(
      pesan(t, "0712345678"),
    ).rejects.toThrow(/08/);

    await admin.mutation(api.ppob.simpanPengaturan, {
      ...PENGATURAN,
      aktif: false,
    });
    await expect(pesan(t)).rejects.toThrow(/ditutup/);
  });

  it("status publik menyamarkan nomor dan tidak membocorkan data admin", async () => {
    const t = convexTest(schema, modules);
    await siapkanEtalase(t);
    const { kodePesanan } = await pesan(t);
    const status = await t.query(api.ppob.statusPesanan, { kode: kodePesanan });
    expect(status?.nomorTujuan).toBe("0812••••7890");
    expect(status?.hargaJual).toBe(10_400);
    expect(status).not.toHaveProperty("refId");
    expect(status).not.toHaveProperty("whatsapp");
  });

  it("hanya admin bertotp yang boleh mengubah pengaturan dan menandai bayar", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await siapkanEtalase(t);
    const { sesi: nasabah } = await siapkanPengguna(t, "Nasabah", {
      email: "nasabah-ppob@pindai.test",
      role: "peminjam",
    });
    const { kodePesanan } = await pesan(t);
    const pesanan = await t.run((ctx) =>
      ctx.db
        .query("ppobPesanan")
        .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", kodePesanan))
        .first(),
    );

    await expect(
      nasabah.mutation(api.ppob.simpanPengaturan, PENGATURAN),
    ).rejects.toThrow(/Super Admin/);
    await expect(
      nasabah.query(api.ppob.getPengaturan, {}),
    ).rejects.toThrow(/Super Admin/);
    await expect(
      nasabah.mutation(api.ppob.tandaiDibayar, { id: pesanan!._id }),
    ).rejects.toThrow(/Super Admin/);

    await admin.mutation(api.ppob.tandaiDibayar, { id: pesanan!._id });
    const sesudah = await t.run((ctx) => ctx.db.get(pesanan!._id));
    expect(sesudah?.status).toBe("dibayar");
    expect(sesudah?.diverifikasiOleh).toBeDefined();
  });

  it("menerapkan status provider dan tidak membalik status final", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await siapkanEtalase(t);
    const { kodePesanan } = await pesan(t);
    const pesanan = await t.run((ctx) =>
      ctx.db
        .query("ppobPesanan")
        .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", kodePesanan))
        .first(),
    );

    // Provider tidak boleh memproses pesanan yang belum dibayar.
    const ditahan = await t.mutation(internal.ppob.terapkanStatus, {
      refId: pesanan!.refId,
      status: "Sukses",
      rc: "00",
      sn: "SN-1",
    });
    expect(ditahan.diabaikan).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(pesanan!._id)))?.status).toBe(
      "menunggu_bayar",
    );

    await admin.mutation(api.ppob.tandaiDibayar, { id: pesanan!._id });
    await t.mutation(internal.ppob.tandaiDiproses, { id: pesanan!._id });
    await t.mutation(internal.ppob.terapkanStatus, {
      refId: pesanan!.refId,
      status: "Sukses",
      rc: "00",
      sn: "SN-1",
      pesan: "Transaksi Sukses",
    });
    const sukses = await t.run((ctx) => ctx.db.get(pesanan!._id));
    expect(sukses?.status).toBe("sukses");
    expect(sukses?.sn).toBe("SN-1");
    expect(sukses?.selesaiPada).toBeDefined();

    const susulan = await t.mutation(internal.ppob.terapkanStatus, {
      refId: pesanan!.refId,
      status: "Gagal",
      rc: "02",
    });
    expect(susulan.diabaikan).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(pesanan!._id)))?.status).toBe("sukses");
  });

  it("sinkron mempertahankan harga manual di atas lantai, mengoreksi yang di bawahnya", async () => {
    const t = convexTest(schema, modules);
    await siapkanEtalase(t);

    const manual = await t.run((ctx) =>
      ctx.db
        .query("ppobProduk")
        .withIndex("by_kode", (q) => q.eq("kode", "TSEL10"))
        .first(),
    );
    await t.run((ctx) =>
      ctx.db.patch(manual!._id, { hargaManual: true, hargaJual: 12_000 }),
    );

    await t.mutation(internal.ppob.simpanHasilSinkron, {
      produk: [
        {
          kode: "TSEL10",
          nama: "Telkomsel 10.000",
          kategori: "pulsa",
          operator: "Telkomsel",
          hargaModal: 9_900,
          tersedia: true,
        },
        {
          kode: "TSEL5",
          nama: "Telkomsel 5.000",
          kategori: "pulsa",
          operator: "Telkomsel",
          hargaModal: 4_900,
          tersedia: true,
        },
      ],
    });

    const setelah = await t.run((ctx) =>
      ctx.db
        .query("ppobProduk")
        .withIndex("by_kode", (q) => q.eq("kode", "TSEL10"))
        .first(),
    );
    expect(setelah?.hargaJual).toBe(12_000);
    expect(setelah?.hargaManual).toBe(true);
    expect(setelah?.hargaModal).toBe(9_900);

    // Modal naik melewati harga manual: harga dihitung ulang agar tidak rugi.
    await t.mutation(internal.ppob.simpanHasilSinkron, {
      produk: [
        {
          kode: "TSEL10",
          nama: "Telkomsel 10.000",
          kategori: "pulsa",
          operator: "Telkomsel",
          hargaModal: 12_500,
          tersedia: true,
        },
      ],
    });
    const koreksi = await t.run((ctx) =>
      ctx.db
        .query("ppobProduk")
        .withIndex("by_kode", (q) => q.eq("kode", "TSEL10"))
        .first(),
    );
    expect(koreksi?.hargaJual).toBeGreaterThan(12_500);
    expect(koreksi?.hargaManual).toBe(false);

    const baru = await t.run((ctx) =>
      ctx.db
        .query("ppobProduk")
        .withIndex("by_kode", (q) => q.eq("kode", "TSEL5"))
        .first(),
    );
    expect(baru).not.toBeNull();
    expect(baru?.hargaJual).toBe(5_400);
  });

  it("menandai produk yang hilang dari sinkron sebagai tidak tersedia", async () => {
    const t = convexTest(schema, modules);
    await siapkanEtalase(t);
    const sebelum = Date.now() + 10;
    const { dimatikan } = await t.mutation(internal.ppob.matikanProdukLama, {
      sebelum,
    });
    expect(dimatikan).toBe(1);
    const produk = await t.run((ctx) =>
      ctx.db
        .query("ppobProduk")
        .withIndex("by_kode", (q) => q.eq("kode", "TSEL10"))
        .first(),
    );
    expect(produk?.tersedia).toBe(false);
  });

  it("membatalkan hanya sebelum dikirim, dan refund dicatat terpisah", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await siapkanEtalase(t);
    const { kodePesanan } = await pesan(t);
    const pesanan = await t.run((ctx) =>
      ctx.db
        .query("ppobPesanan")
        .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", kodePesanan))
        .first(),
    );

    await admin.mutation(api.ppob.batalkanPesanan, {
      id: pesanan!._id,
      alasan: "nomor tujuan salah",
    });
    const batal = await t.run((ctx) => ctx.db.get(pesanan!._id));
    expect(batal?.status).toBe("gagal");
    expect(batal?.pesanProvider).toContain("Dibatalkan admin");

    // Pesanan lain: sudah dikirim ke provider tidak boleh dibatalkan.
    await admin.mutation(api.ppob.simpanPengaturan, PENGATURAN);
    const kedua = await pesan(t, "081234567891");
    const baris = await t.run((ctx) =>
      ctx.db
        .query("ppobPesanan")
        .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", kedua.kodePesanan))
        .first(),
    );
    await admin.mutation(api.ppob.tandaiDibayar, { id: baris!._id });
    await t.mutation(internal.ppob.tandaiDiproses, { id: baris!._id });
    await expect(
      admin.mutation(api.ppob.batalkanPesanan, {
        id: baris!._id,
        alasan: "berubah pikiran",
      }),
    ).rejects.toThrow(/sudah dikirim/);
  });

  it("pesanan tanpa admin tetap bisa dilacak lewat kode", async () => {
    const t = convexTest(schema, modules);
    await siapkanEtalase(t);
    const { kodePesanan } = await pesan(t);
    expect(await t.query(api.ppob.statusPesanan, { kode: "PPOB-000000-AAAAAA" })).toBeNull();
    expect((await t.query(api.ppob.statusPesanan, { kode: kodePesanan }))?.status).toBe(
      "menunggu_bayar",
    );
  });

  it("markup per kategori menggantikan tarif global, bukan menambah di atasnya", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await siapkanEtalase(t);
    await admin.mutation(api.ppob.simpanPengaturan, {
      ...PENGATURAN,
      markupMin: 0,
      markupKategori: { pulsa: 2, tokenListrik: 7, game: 10 },
    });
    await t.mutation(internal.ppob.simpanHasilSinkron, {
      produk: [
        { kode: "PULSA-A", nama: "Pulsa A", kategori: "pulsa", hargaModal: 10_000, tersedia: true },
        { kode: "GAME-A", nama: "Game A", kategori: "game", hargaModal: 10_000, tersedia: true },
        {
          kode: "PLN-A",
          nama: "Token A",
          kategori: "token-listrik",
          hargaModal: 100_000,
          tersedia: true,
        },
        { kode: "DATA-A", nama: "Data A", kategori: "data", hargaModal: 10_000, tersedia: true },
      ],
    });

    const harga = async (kode: string) =>
      (
        await t.run((ctx) =>
          ctx.db
            .query("ppobProduk")
            .withIndex("by_kode", (q) => q.eq("kode", kode))
            .first(),
        )
      )?.hargaJual;

    expect(await harga("PULSA-A")).toBe(10_200);
    expect(await harga("GAME-A")).toBe(11_000);
    expect(await harga("PLN-A")).toBe(107_000);
    expect(await harga("DATA-A")).toBe(10_500);
  });

  it("laporan memisahkan hari ini, bulan ini, dan per kategori", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await siapkanEtalase(t);
    await t.run((ctx) =>
      ctx.db.insert("ppobProduk", {
        kode: "ML10",
        nama: "Mobile Legends 10 Diamond",
        kategori: "game",
        hargaModal: 9_000,
        hargaJual: 10_000,
        aktif: true,
        tersedia: true,
        diperbaruiPada: Date.now(),
        dibuatPada: Date.now(),
      }),
    );

    const pertama = await pesan(t);
    const kedua = await t.mutation(api.ppob.buatPesanan, {
      kodeProduk: "ML10",
      nomorTujuan: "12345678(1234)",
      nama: "Rani",
      whatsapp: "081298765432",
    });
    const ketiga = await t.mutation(api.ppob.buatPesanan, {
      kodeProduk: "TSEL10",
      nomorTujuan: "081234567891",
      nama: "Rani",
      whatsapp: "081298765432",
    });

    await t.run(async (ctx) => {
      const cari = async (kode: string) =>
        (await ctx.db
          .query("ppobPesanan")
          .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", kode))
          .first())!;
      const a = await cari(pertama.kodePesanan);
      const b = await cari(kedua.kodePesanan);
      const c = await cari(ketiga.kodePesanan);
      await ctx.db.patch(a._id, { status: "sukses", selesaiPada: Date.now() });
      await ctx.db.patch(b._id, { status: "sukses", selesaiPada: Date.now() });
      await ctx.db.patch(c._id, {
        status: "gagal",
        pesanProvider: "Nomor tujuan tidak terdaftar",
        selesaiPada: Date.now(),
      });
    });

    const laporan = await admin.query(api.ppob.laporanPpob, {});
    expect(laporan.hariIni.sukses).toBe(2);
    expect(laporan.hariIni.omzet).toBe(10_400 + 10_000);
    expect(laporan.hariIni.laba).toBe(550 + 1_000);
    expect(laporan.hariIni.gagal).toBe(1);
    expect(laporan.bulanIni.pesanan).toBe(3);
    expect(laporan.bulanIni.laba).toBe(1_550);

    const pulsa = laporan.perKategori.find((item) => item.kategori === "pulsa");
    const game = laporan.perKategori.find((item) => item.kategori === "game");
    expect(pulsa?.pesanan).toBe(2);
    expect(pulsa?.sukses).toBe(1);
    expect(pulsa?.laba).toBe(550);
    expect(game?.laba).toBe(1_000);
    expect(laporan.daftarGagal).toHaveLength(1);
    expect(laporan.daftarGagal[0]?.kodePesanan).toBe(ketiga.kodePesanan);
  });

  it("pembeli yang masuk hanya melihat pesanannya sendiri", async () => {
    const t = convexTest(schema, modules);
    await siapkanEtalase(t);
    const { sesi: pembeli } = await siapkanPengguna(t, "Rani Pembeli", {
      email: "pembeli-ppob@pindai.test",
      role: "peminjam",
    });

    const milik = await pembeli.mutation(api.ppob.buatPesanan, {
      kodeProduk: "TSEL10",
      nomorTujuan: "081234567892",
      nama: "Rani Pembeli",
      whatsapp: "081298765433",
    });
    await pesan(t);

    const daftar = await pembeli.query(api.ppob.pesananSaya, {});
    expect(daftar).toHaveLength(1);
    expect(daftar[0]?.kodePesanan).toBe(milik.kodePesanan);
    expect(daftar[0]?.nomorTujuan).toBe("081234567892");
    expect(await t.query(api.ppob.pesananSaya, {})).toEqual([]);
  });
});
