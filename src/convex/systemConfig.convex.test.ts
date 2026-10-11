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
import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

/** Argumen `saveConfig` dari nilai default — tiap tes hanya mengubah yang perlu. */
function argumenConfig(ubah: Record<string, unknown> = {}) {
  return {
    tema: DEFAULT_CONFIG.tema,
    killSwitch: DEFAULT_CONFIG.killSwitch,
    maintenanceMode: DEFAULT_CONFIG.maintenanceMode,
    persenAdmin: DEFAULT_CONFIG.persenAdmin,
    persenPlatform: DEFAULT_CONFIG.persenPlatform,
    persenBunga: DEFAULT_CONFIG.persenBunga,
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
