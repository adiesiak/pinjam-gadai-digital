/**
 * Uji versi & riwayat konfigurasi sistem (`convex/system.ts`).
 *
 * Yang dibuktikan:
 *  - setiap penyimpanan membuat VERSI baru + satu baris riwayat berisi daftar
 *    perubahan "lama → baru" (bukan sekadar "konfigurasi diperbarui");
 *  - rollback menambah versi BARU yang menyalin nilai versi lama dan TIDAK
 *    menghapus riwayat (append-only);
 *  - rollback ke versi tak dikenal / versi yang sedang berlaku ditolak;
 *  - non-admin tidak dapat menyimpan maupun rollback.
 *
 * Menjalankan: bunx vitest run src/convex/systemConfig.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../lib/system-config";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

/** Argumen `saveConfig` dari nilai default — tiap tes hanya mengubah yang perlu. */
function argumenConfig(ubah: Record<string, unknown> = {}) {
  return {
    tema: DEFAULT_CONFIG.tema,
    gaya: DEFAULT_CONFIG.gaya,
    efekMusiman: DEFAULT_CONFIG.efekMusiman,
    killSwitch: DEFAULT_CONFIG.killSwitch,
    maintenanceMode: DEFAULT_CONFIG.maintenanceMode,
    persenAdmin: DEFAULT_CONFIG.persenAdmin,
    persenPlatform: DEFAULT_CONFIG.persenPlatform,
    persenBunga: DEFAULT_CONFIG.persenBunga,
    persenBiayaAdmin: DEFAULT_CONFIG.persenBiayaAdmin,
    persenAsuransi: DEFAULT_CONFIG.persenAsuransi,
    biayaEkspresTier1: DEFAULT_CONFIG.biayaEkspresTier1,
    biayaEkspresTier2: DEFAULT_CONFIG.biayaEkspresTier2,
    biayaEkspresTier3: DEFAULT_CONFIG.biayaEkspresTier3,
    persenDendaKeterlambatan: DEFAULT_CONFIG.persenDendaKeterlambatan,
    persenBiayaIntegrasi: DEFAULT_CONFIG.persenBiayaIntegrasi,
    maxLtvPersen: DEFAULT_CONFIG.maxLtvPersen,
    sessionTimeoutMenit: DEFAULT_CONFIG.sessionTimeoutMenit,
    vaultLat: DEFAULT_CONFIG.vaultLat,
    vaultLng: DEFAULT_CONFIG.vaultLng,
    gpsMismatchKm: DEFAULT_CONFIG.gpsMismatchKm,
    pencairanMaxKm: DEFAULT_CONFIG.pencairanMaxKm,
    lokasiWajib: DEFAULT_CONFIG.lokasiWajib,
    lokasiMaxUmurMenit: DEFAULT_CONFIG.lokasiMaxUmurMenit,
    wajibAplikasiNative: DEFAULT_CONFIG.wajibAplikasiNative,
    notifWhatsappAktif: DEFAULT_CONFIG.notifWhatsappAktif,
    notifEmailAktif: DEFAULT_CONFIG.notifEmailAktif,
    retensiLokasiHari: DEFAULT_CONFIG.retensiLokasiHari,
    plafonPinjaman: DEFAULT_CONFIG.plafonPinjaman,
    rekeningUsahaNama: DEFAULT_CONFIG.rekeningUsahaNama,
    rekeningUsahaBank: DEFAULT_CONFIG.rekeningUsahaBank,
    rekeningUsahaNomor: DEFAULT_CONFIG.rekeningUsahaNomor,
    qrisMerchantNama: DEFAULT_CONFIG.qrisMerchantNama,
    qrisImageId: null,
    manualDepositEnabled: DEFAULT_CONFIG.manualDepositEnabled,
    ...ubah,
  };
}

describe("konfigurasi: versi, riwayat, rollback", () => {
  it("menyimpan menaikkan versi dan mencatat perubahan lama → baru", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-cfg", {
      email: "admin-cfg@pindai.test",
      role: "admin",
    });

    const simpan1 = await asAdmin.mutation(
      api.system.saveConfig,
      argumenConfig({ persenBunga: 25 }),
    );
    expect(simpan1.versi).toBe(2);

    const simpan2 = await asAdmin.mutation(
      api.system.saveConfig,
      argumenConfig({ persenBunga: 20, killSwitch: true }),
    );
    expect(simpan2.versi).toBe(3);

    const riwayat = await asAdmin.query(api.system.riwayatConfig, {});
    expect(riwayat).toHaveLength(2);
    // Terbaru lebih dulu.
    expect(riwayat[0].versi).toBe(3);
    expect(riwayat[0].jenis).toBe("simpan");
    expect(riwayat[0].dariVersi).toBeNull();
    const kunci = riwayat[0].perubahan.map((p) => p.kunci).sort();
    expect(kunci).toEqual(["killSwitch", "persenBunga"]);
    const bunga = riwayat[0].perubahan.find((p) => p.kunci === "persenBunga");
    expect(bunga?.lama).toBe(25);
    expect(bunga?.baru).toBe(20);

    // Riwayat pertama mencatat nilai default → 25.
    const bunga1 = riwayat[1].perubahan.find((p) => p.kunci === "persenBunga");
    expect(bunga1?.lama).toBe(DEFAULT_CONFIG.persenBunga);
    expect(bunga1?.baru).toBe(25);

    // Kill switch ikut tercatat sebagai aksi audit tersendiri.
    const auditRows = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "kill_switch"))
        .collect(),
    );
    expect(auditRows).toHaveLength(1);
  });

  it("sakelar notifikasi tersimpan sebagai keputusan global admin", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-notif", {
      email: "admin-notif@pindai.test",
      role: "admin",
    });

    await asAdmin.mutation(
      api.system.saveConfig,
      argumenConfig({ notifWhatsappAktif: false, notifEmailAktif: false }),
    );

    expect(
      await t.query(internal.system._kanalNotifikasiAktif, { kanal: "whatsapp" }),
    ).toBe(false);
    expect(
      await t.query(internal.system._kanalNotifikasiAktif, { kanal: "email" }),
    ).toBe(false);

    const cfg = await asAdmin.query(api.system.getConfigAdmin, {});
    expect(cfg.config.notifWhatsappAktif).toBe(false);
    expect(cfg.config.notifEmailAktif).toBe(false);

    // Perubahan ikut terlihat di riwayat dengan label yang bisa dibaca admin.
    const riwayat = await asAdmin.query(api.system.riwayatConfig, {});
    expect(
      riwayat[0].perubahan
        .map((p) => p.kunci)
        .filter((kunci) => kunci.startsWith("notif"))
        .sort(),
    ).toEqual(["notifEmailAktif", "notifWhatsappAktif"]);
  });

  it("sakelar produk tersimpan dan terbaca publik", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-produk", {
      email: "admin-produk@pindai.test",
      role: "admin",
    });

    await asAdmin.mutation(
      api.system.saveConfig,
      argumenConfig({ produkPinjamanAktif: false, produkGadaiAktif: false }),
    );

    expect(await t.query(api.system.getProdukAktif, {})).toEqual({
      pinjaman: false,
      kredit: true,
      gadai: false,
    });

    const cfg = await asAdmin.query(api.system.getConfigAdmin, {});
    expect(cfg.config.produkPinjamanAktif).toBe(false);
    expect(cfg.config.produkGadaiAktif).toBe(false);
    expect(cfg.config.produkKreditAktif).toBe(true);

    const riwayat = await asAdmin.query(api.system.riwayatConfig, {});
    expect(
      riwayat[0].perubahan
        .map((p) => p.kunci)
        .filter((kunci) => kunci.startsWith("produk"))
        .sort(),
    ).toEqual(["produkGadaiAktif", "produkPinjamanAktif"]);
  });

  it("baris konfigurasi lama tanpa sakelar produk tetap membuka semua produk", async () => {
    const t = buatKontek();
    await t.run((ctx) =>
      ctx.db.insert("systemConfig", { slot: "global", versi: 4, diperbaruiPada: 0 }),
    );

    expect(await t.query(api.system.getProdukAktif, {})).toEqual({
      pinjaman: true,
      kredit: true,
      gadai: true,
    });
  });

  it("rollback membuat versi baru tanpa menghapus riwayat", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-cfg2", {
      email: "admin-cfg2@pindai.test",
      role: "admin",
    });

    await asAdmin.mutation(api.system.saveConfig, argumenConfig({ persenBunga: 25 }));
    await asAdmin.mutation(api.system.saveConfig, argumenConfig({ persenBunga: 20 }));

    // Kembalikan ke nilai versi 2 (bunga 25) → menjadi versi 4.
    const hasil = await asAdmin.mutation(api.system.rollbackConfig, { versi: 2 });
    expect(hasil.versi).toBe(4);

    const cfg = await asAdmin.query(api.system.getConfigAdmin, {});
    expect(cfg.config.persenBunga).toBe(25);

    const riwayat = await asAdmin.query(api.system.riwayatConfig, {});
    expect(riwayat).toHaveLength(3);
    expect(riwayat[0].versi).toBe(4);
    expect(riwayat[0].jenis).toBe("rollback");
    expect(riwayat[0].dariVersi).toBe(2);
    // Riwayat lama tetap utuh (append-only) — versi 3 masih ada.
    expect(riwayat.map((r) => r.versi).sort()).toEqual([2, 3, 4]);

    const auditRows = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "rollback_config"))
        .collect(),
    );
    expect(auditRows).toHaveLength(1);
  });

  it("menolak rollback ke versi tak dikenal dan ke versi yang sedang berlaku", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-cfg3", {
      email: "admin-cfg3@pindai.test",
      role: "admin",
    });
    await asAdmin.mutation(api.system.saveConfig, argumenConfig({ persenBunga: 25 }));

    await expect(
      asAdmin.mutation(api.system.rollbackConfig, { versi: 99 }),
    ).rejects.toThrow(/tidak ada di riwayat/i);

    // Versi 2 sedang berlaku → tidak ada yang perlu dikembalikan.
    await expect(
      asAdmin.mutation(api.system.rollbackConfig, { versi: 2 }),
    ).rejects.toThrow(/sedang berlaku/i);
  });

  it("menyimpan tarif denda keterlambatan dan menerbitkannya ke halaman publik", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-cfg4", {
      email: "admin-cfg4@pindai.test",
      role: "admin",
    });

    await asAdmin.mutation(
      api.system.saveConfig,
      argumenConfig({ persenDendaKeterlambatan: 4 }),
    );

    const publik = await t.query(api.system.getKetentuanBiaya, {});
    expect(publik.persenDendaKeterlambatan).toBe(4);
    expect(publik.maksDendaPersen).toBe(100);

    // Nilai di luar kebijakan ditolak, bukan disimpan diam-diam.
    await expect(
      asAdmin.mutation(
        api.system.saveConfig,
        argumenConfig({ persenDendaKeterlambatan: 101 }),
      ),
    ).rejects.toThrow(/Denda keterlambatan/i);
  });

  it("menyimpan margin Murabahah syariah dan menolak angka di luar rentang", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-margin-sy", {
      email: "admin-margin-sy@pindai.test",
      role: "admin",
    });

    await asAdmin.mutation(
      api.system.saveConfig,
      argumenConfig({ persenMarginSyariah: 17 }),
    );

    const publik = await t.query(api.system.getKetentuanBiaya, {});
    expect(publik.persenMarginSyariah).toBe(17);
    const admin = await asAdmin.query(api.system.getConfigAdmin, {});
    expect(admin.config.persenMarginSyariah).toBe(17);
    // Porsi bagi hasil disimpan terpisah dari margin, dan ikut terbit publik.
    expect(publik.persenNisbahPendanaSyariah).toBe(92);

    await asAdmin.mutation(
      api.system.saveConfig,
      argumenConfig({ persenNisbahPendanaSyariah: 90 }),
    );
    expect(
      (await t.query(api.system.getKetentuanBiaya, {})).persenNisbahPendanaSyariah,
    ).toBe(90);

    await expect(
      asAdmin.mutation(
        api.system.saveConfig,
        argumenConfig({ persenNisbahPendanaSyariah: 40 }),
      ),
    ).rejects.toThrow(/Nisbah pendana/i);

    await expect(
      asAdmin.mutation(
        api.system.saveConfig,
        argumenConfig({ persenMarginSyariah: 25 }),
      ),
    ).rejects.toThrow(/Margin Murabahah/i);
    await expect(
      asAdmin.mutation(
        api.system.saveConfig,
        argumenConfig({ persenMarginSyariah: 14 }),
      ),
    ).rejects.toThrow(/Margin Murabahah/i);
  });

  it("template punya tiga sumbu terpisah: palet, gaya, efek musiman", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-template", {
      email: "admin-template@pindai.test",
      role: "admin",
    });

    // Bawaan: palet tinta, gaya lembaga, efek musiman mati.
    const awal = await t.query(api.system.getThemePublic, {});
    expect(awal).toMatchObject({
      tema: DEFAULT_CONFIG.tema,
      gaya: DEFAULT_CONFIG.gaya,
      efekMusiman: false,
    });

    // Mengubah palet TIDAK boleh mereset gaya yang sudah dipilih.
    await asAdmin.mutation(api.system.setWebsiteTemplate, {
      gaya: "komunitas",
    });
    await asAdmin.mutation(api.system.setWebsiteTemplate, { tema: "pesisir" });
    const setelahPalet = await t.query(api.system.getThemePublic, {});
    expect(setelahPalet.tema).toBe("pesisir");
    expect(setelahPalet.gaya).toBe("komunitas");

    // Efek musiman bisa dinyalakan terpisah dari palet.
    await asAdmin.mutation(api.system.setWebsiteTemplate, {
      efekMusiman: true,
    });
    const menyala = await t.query(api.system.getThemePublic, {});
    expect(menyala.efekMusiman).toBe(true);
    expect(menyala.tema).toBe("pesisir");

    // Nilai asing ditolak, bukan disimpan diam-diam.
    await expect(
      asAdmin.mutation(api.system.setWebsiteTemplate, {
        gaya: "liar" as never,
      }),
    ).rejects.toThrow();
    await expect(
      asAdmin.mutation(api.system.setWebsiteTemplate, {}),
    ).rejects.toThrow(/Tidak ada perubahan/i);

    // Data lama tanpa kolom gaya/efekMusiman tetap terbaca dengan bawaan.
    await t.run(async (ctx) => {
      const baris = await ctx.db.query("systemConfig").first();
      if (baris) {
        await ctx.db.patch(baris._id, { gaya: undefined, efekMusiman: undefined });
      }
    });
    const lama = await t.query(api.system.getThemePublic, {});
    expect(lama.gaya).toBe(DEFAULT_CONFIG.gaya);
    // Data lama tanpa kolom efekMusiman: palet non-musiman berarti mati.
    expect(lama.efekMusiman).toBe(false);

    // Data lama yang memakai palet musiman: efek dianggap menyala, karena
    // sebelumnya salju/konfeti memang selalu aktif untuk palet itu.
    await t.run(async (ctx) => {
      const baris = await ctx.db.query("systemConfig").first();
      if (baris) {
        await ctx.db.patch(baris._id, { tema: "salju", efekMusiman: undefined });
      }
    });
    expect((await t.query(api.system.getThemePublic, {})).efekMusiman).toBe(
      true,
    );

    // Non-admin tidak boleh mengganti template.
    const { sesi: asPeminjam } = await siapkanPengguna(t, "peminjam-template", {
      email: "peminjam-template@pindai.test",
      role: "peminjam",
    });
    await expect(
      asPeminjam.mutation(api.system.setWebsiteTemplate, { gaya: "tenang" }),
    ).rejects.toThrow(/Super Admin/i);
  });

  it("menolak penyimpanan & rollback dari akun non-admin", async () => {
    const t = buatKontek();
    const { sesi: asPeminjam } = await siapkanPengguna(t, "peminjam-cfg", {
      email: "peminjam-cfg@pindai.test",
      role: "peminjam",
    });

    await expect(
      asPeminjam.mutation(api.system.saveConfig, argumenConfig({ persenBunga: 25 })),
    ).rejects.toThrow(/Super Admin/i);
    await expect(
      asPeminjam.mutation(api.system.rollbackConfig, { versi: 2 }),
    ).rejects.toThrow(/Super Admin/i);
    await expect(asPeminjam.query(api.system.riwayatConfig, {})).rejects.toThrow(/Super Admin/i);
  });
});
