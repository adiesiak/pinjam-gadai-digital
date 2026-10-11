/**
 * Uji perangkat milik nasabah (`convex/lokasi.ts`): daftar + pencabutan.
 *
 * Yang dibuktikan:
 *  - nasabah hanya melihat perangkat MILIKNYA;
 *  - token perangkat TIDAK pernah ikut terkirim ke klien (kredensialnya hanya
 *    keluar sekali saat pendaftaran);
 *  - pencabutan menghapus baris sehingga token itu tidak lagi dikenal — inilah
 *    satu-satunya cara mematikan akses lokasi perangkat yang hilang;
 *  - perangkat milik akun lain ditolak dan tidak terhapus.
 *
 * Menjalankan: bunx vitest run src/convex/perangkatSaya.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi, siapkanPengguna, type KonteksUji, type PenggunaUji } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

async function daftarPerangkatUji(
  t: KonteksUji,
  userId: PenggunaUji["userId"],
  deviceId: string,
  token: string,
  terakhirDilihat: number,
) {
  return await t.run((ctx) =>
    ctx.db.insert("perangkat", {
      userId,
      deviceId,
      platform: "android",
      versiApp: "1.4.0",
      token,
      terdaftarPada: terakhirDilihat - 1000,
      terakhirDilihat,
    }),
  );
}

describe("perangkat aplikasi milik nasabah", () => {
  it("mengembalikan perangkat sendiri tanpa membocorkan token", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-perangkat", {
      email: "nasabah-perangkat@pindai.test",
      role: "peminjam",
    });
    const lain = await siapkanPengguna(t, "nasabah-perangkat-b", {
      email: "nasabah-perangkat-b@pindai.test",
      role: "peminjam",
    });
    const sekarang = Date.now();
    await daftarPerangkatUji(t, nasabah.userId, "device-aaaaaa", "token-rahasia-a", sekarang - 1000);
    await daftarPerangkatUji(t, nasabah.userId, "device-bbbbbb", "token-rahasia-b", sekarang - 40 * 60 * 60 * 1000);
    await daftarPerangkatUji(t, lain.userId, "device-cccccc", "token-rahasia-c", sekarang - 1000);

    const hasil = await nasabah.sesi.query(api.lokasi.perangkatSaya, {});
    expect(hasil).toHaveLength(2);
    expect(hasil.map((p) => p.deviceId).sort()).toEqual(["device-aaaaaa", "device-bbbbbb"]);
    // Perangkat orang lain tidak pernah muncul.
    expect(hasil.some((p) => p.deviceId === "device-cccccc")).toBe(false);
    // Token tidak ikut dikirim — hanya penanda ada/tidak.
    for (const p of hasil) {
      expect(Object.keys(p)).not.toContain("token");
      expect(JSON.stringify(p)).not.toContain("token-rahasia");
      expect(p.punyaToken).toBe(true);
    }
    // Urutan: yang terakhir terlihat lebih dulu; status aktif dihitung 24 jam.
    expect(hasil[0].deviceId).toBe("device-aaaaaa");
    expect(hasil[0].aktif).toBe(true);
    expect(hasil[1].aktif).toBe(false);
  });

  it("pencabutan mematikan token perangkat (barisnya hilang)", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-cabut", {
      email: "nasabah-cabut@pindai.test",
      role: "peminjam",
    });
    const perangkatId = await daftarPerangkatUji(
      t,
      nasabah.userId,
      "device-hilang",
      "token-hilang",
      Date.now(),
    );

    await nasabah.sesi.mutation(api.lokasi.cabutPerangkat, { perangkatId });

    const sisa = await nasabah.sesi.query(api.lokasi.perangkatSaya, {});
    expect(sisa).toHaveLength(0);
    // Token itu tidak lagi dapat ditemukan lewat indeks token → heartbeat
    // perangkat tersebut akan ditolak server.
    const lewatToken = await t.run((ctx) =>
      ctx.db
        .query("perangkat")
        .withIndex("by_token", (q) => q.eq("token", "token-hilang"))
        .first(),
    );
    expect(lewatToken).toBeNull();
  });

  it("menolak mencabut perangkat milik akun lain", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-cabut-b", {
      email: "nasabah-cabut-b@pindai.test",
      role: "peminjam",
    });
    const lain = await siapkanPengguna(t, "nasabah-cabut-c", {
      email: "nasabah-cabut-c@pindai.test",
      role: "peminjam",
    });
    const perangkatLain = await daftarPerangkatUji(
      t,
      lain.userId,
      "device-orang-lain",
      "token-orang-lain",
      Date.now(),
    );

    await expect(
      nasabah.sesi.mutation(api.lokasi.cabutPerangkat, { perangkatId: perangkatLain }),
    ).rejects.toThrow(/tidak ditemukan/i);

    // Baris milik orang lain tetap utuh.
    const masihAda = await t.run((ctx) =>
      ctx.db
        .query("perangkat")
        .withIndex("by_device", (q) => q.eq("deviceId", "device-orang-lain"))
        .first(),
    );
    expect(masihAda).not.toBeNull();
  });

  it("menolak pembacaan daftar perangkat tanpa sesi", async () => {
    const t = buatKontek();
    await buatSesi(t, "nasabah-tanpa-sesi", {
      email: "nasabah-tanpa-sesi@pindai.test",
      role: "peminjam",
    });
    const anonim = t.withIdentity({ subject: "bukan-siapa" });
    await expect(anonim.query(api.lokasi.perangkatSaya, {})).rejects.toThrow();
  });
});
