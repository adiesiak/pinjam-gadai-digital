/**
 * Test integrasi Convex — Gerbang lokasi wajib (convex-test + vitest).
 *
 * Membuktikan janji ke user: perangkat yang mematikan lokasi TIDAK bisa
 * bertransaksi, karena server menolak aksi finansial tanpa titik GPS segar.
 *
 * Cakupan:
 *  1. Tanpa heartbeat lokasi → pengajuan ditolak dengan pesan yang jelas.
 *  2. Titik di luar wilayah Indonesia → ditolak.
 *  3. Setelah heartbeat (titik Jakarta) → pengajuan dilayani.
 *  4. Titik kedaluwarsa (lebih tua dari batas menit) → ditolak.
 *  5. Gerbang dimatikan admin (lokasiWajib: false) → pengajuan tetap dilayani.
 *  6. Titik jauh setelah jeda panjang diterima (bukan lokasi palsu).
 *  7. Kebijakan "wajib aplikasi": transaksi hanya bila titik terakhir datang
 *     dari aplikasi native — browser ditolak walau perangkat pernah terdaftar.
 *
 * Menjalankan: bunx vitest run src/convex
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { DEFAULT_CONFIG } from "../lib/system-config";

async function siapkanPengguna(
  t: ReturnType<typeof convexTest>,
  subject: string,
  opts: { email: string; role: "peminjam" | "admin" },
): Promise<ReturnType<typeof t.withIdentity>> {
  const userId = await t.mutation(async (ctx) => {
    return ctx.db.insert("users", {
      email: opts.email,
      name: subject,
      emailVerificationTime: Date.now(),
      role: opts.role,
    });
  });
  return t.withIdentity({ subject: userId, name: subject }) as never;
}

const PENGAJUAN = {
  namaBarang: "Kulkas dua pintu",
  kategori: "Elektronik",
  merchant: "Tokopedia",
  hargaBarang: 8_000_000,
  dpPersen: 20,
  tenorBulan: 12,
  marginPersenPerBulan: 3,
  namaLengkap: "Siti Peminjam",
  nik: "3201234567890003",
  nomorRekening: "1234567892",
  nomorWhatsApp: "628123456791",
};

describe("gerbang lokasi wajib", () => {
  it("menolak pengajuan tanpa titik GPS segar di server", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await siapkanPengguna(t, "peminjam-tanpa-lokasi", {
      email: "tanpa-lokasi@pindai.test",
      role: "peminjam",
    });

    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).rejects.toThrow("Lokasi wajib aktif untuk transaksi ini");
  });

  it("menolak titik di luar wilayah Indonesia dan lompatan mustahil", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await siapkanPengguna(t, "peminjam-luar", {
      email: "luar-negeri@pindai.test",
      role: "peminjam",
    });

    // New York jelas di luar bounding box Indonesia (batas kasar wilayah).
    await expect(
      asPeminjam.mutation(api.lokasi.catatLokasi, {
        lat: 40.71,
        lng: -74.0,
        akurasi: 20,
      }),
    ).rejects.toThrow("di luar wilayah Indonesia");

    // Titik pertama sah (Jakarta), lalu lompatan 44 km dalam 1 detik ditolak.
    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 20,
    });
    await expect(
      asPeminjam.mutation(api.lokasi.catatLokasi, {
        lat: -6.6,
        lng: 106.816666,
        akurasi: 20,
      }),
    ).rejects.toThrow("melompat tidak wajar");
  });

  it("menerima titik jauh setelah jeda panjang (perjalanan luar kota)", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await siapkanPengguna(t, "peminjam-perjalanan-jauh", {
      email: "perjalanan@pindai.test",
      role: "peminjam",
    });

    // Titik terakhir: Jakarta, 3 jam lalu. Nasabah sudah tiba di Surabaya
    // (±670 km) — rata-rata ±223 km/jam bila dibandingkan tanpa batas jendela,
    // yang akan salah dianggap lokasi palsu dan memblokir transaksi.
    const userId = await asPeminjam.query(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      return users[0]._id;
    });
    await t.mutation(async (ctx) => {
      await ctx.db.insert("lokasiStatus", {
        userId,
        lat: -6.2,
        lng: 106.816666,
        akurasi: 30,
        waktu: Date.now() - 3 * 60 * 60_000,
        sumber: "web",
      });
    });

    await expect(
      asPeminjam.mutation(api.lokasi.catatLokasi, {
        lat: -7.2575,
        lng: 112.7521,
        akurasi: 25,
        sumber: "web",
      }),
    ).resolves.toBeDefined();

    // Titik segar terbaru membuat pengajuan tetap dilayani.
    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).resolves.toBeDefined();
  });

  it("melayani pengajuan setelah heartbeat GPS diterima", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await siapkanPengguna(t, "peminjam-lokasi", {
      email: "dengan-lokasi@pindai.test",
      role: "peminjam",
    });

    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 30,
      sumber: "web",
    });
    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).resolves.toBeDefined();

    const status = await asPeminjam.query(api.lokasi.statusSaya, {});
    expect(status.segar).toBe(true);
    expect(status.wajib).toBe(true);
    expect(status.umurMenit).toBe(0);
  });

  it("menolak titik yang sudah kedaluwarsa", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await siapkanPengguna(t, "peminjam-basi", {
      email: "basi@pindai.test",
      role: "peminjam",
    });

    // Titik ditulis 30 menit lebih tua dari batas default (10 menit).
    const userId = await asPeminjam.query(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      return users[0]._id;
    });
    await t.mutation(async (ctx) => {
      await ctx.db.insert("lokasiStatus", {
        userId,
        lat: -6.2,
        lng: 106.816666,
        akurasi: 20,
        waktu: Date.now() - 30 * 60_000,
        sumber: "web",
      });
    });

    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).rejects.toThrow("Lokasi wajib aktif untuk transaksi ini");
  });

  it("pengajuan tetap dilayani bila admin mematikan gerbang lokasi", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await siapkanPengguna(t, "admin-lokasi", {
      email: "admin-lokasi@pindai.test",
      role: "admin",
    });
    const asPeminjam = await siapkanPengguna(t, "peminjam-bebas", {
      email: "bebas-lokasi@pindai.test",
      role: "peminjam",
    });

    await asAdmin.mutation(api.system.saveConfig, {
      ...DEFAULT_CONFIG,
      lokasiWajib: false,
    });

    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).resolves.toBeDefined();
  });
});

describe("kebijakan wajib aplikasi (transaksi hanya dari aplikasi)", () => {
  async function aktifkanKebijakan(t: ReturnType<typeof convexTest>, email: string) {
    const asAdmin = await siapkanPengguna(t, "admin-app", {
      email,
      role: "admin",
    });
    await asAdmin.mutation(api.system.saveConfig, {
      ...DEFAULT_CONFIG,
      wajibAplikasiNative: true,
    });
  }

  it("melayani transaksi setelah aplikasi native mengirim titik", async () => {
    const t = convexTest(schema, modules);
    await aktifkanKebijakan(t, "admin-app-1@pindai.test");
    const asPeminjam = await siapkanPengguna(t, "peminjam-app-1", {
      email: "app-1@pindai.test",
      role: "peminjam",
    });

    await asPeminjam.mutation(api.lokasi.daftarkanPerangkat, {
      deviceId: "android-abcdef",
      platform: "android",
      versiApp: "1.0.0",
    });
    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 20,
      sumber: "aplikasi",
      platform: "android",
      versiApp: "1.0.0",
      deviceId: "android-abcdef",
    });

    const status = await asPeminjam.query(api.lokasi.statusSaya, {});
    expect(status.wajibAplikasiNative).toBe(true);
    expect(status.perangkatTerdaftar).toBe(true);
    expect(status.sumber).toBe("aplikasi");

    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).resolves.toBeDefined();
  });

  it("menolak transaksi dari browser walau perangkat pernah terdaftar", async () => {
    const t = convexTest(schema, modules);
    await aktifkanKebijakan(t, "admin-app-2@pindai.test");
    const asPeminjam = await siapkanPengguna(t, "peminjam-app-2", {
      email: "app-2@pindai.test",
      role: "peminjam",
    });

    // Nasabah sudah memasang aplikasi dan pernah bertransaksi dari sana.
    await asPeminjam.mutation(api.lokasi.daftarkanPerangkat, {
      deviceId: "android-abcdef",
      platform: "android",
      versiApp: "1.0.0",
    });
    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 20,
      sumber: "aplikasi",
      deviceId: "android-abcdef",
    });
    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).resolves.toBeDefined();

    // Lalu kembali ke PINDAI lewat browser: titik terakhir menjadi "web",
    // sehingga perangkat yang masih terdaftar pun tidak lagi cukup.
    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 20,
      sumber: "web",
    });

    const status = await asPeminjam.query(api.lokasi.statusSaya, {});
    expect(status.perangkatTerdaftar).toBe(true);
    expect(status.sumber).toBe("web");

    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).rejects.toThrow("hanya bisa dari aplikasi PINDAI");
  });

  it("tidak menghitung klaim aplikasi tanpa ID perangkat", async () => {
    const t = convexTest(schema, modules);
    await aktifkanKebijakan(t, "admin-app-3@pindai.test");
    const asPeminjam = await siapkanPengguna(t, "peminjam-app-3", {
      email: "app-3@pindai.test",
      role: "peminjam",
    });

    // Klaim "aplikasi" tanpa perangkat diturunkan menjadi "web" oleh server,
    // sehingga kebijakan tidak bisa dipenuhi hanya dengan menulis ulang field.
    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 20,
      sumber: "aplikasi",
    });

    const status = await asPeminjam.query(api.lokasi.statusSaya, {});
    expect(status.sumber).toBe("web");
    expect(status.perangkatTerdaftar).toBe(false);
    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).rejects.toThrow("hanya bisa dari aplikasi PINDAI");
  });

  it("menolak bila perangkat tidak lagi mengirim heartbeat (lebih dari 24 jam)", async () => {
    const t = convexTest(schema, modules);
    await aktifkanKebijakan(t, "admin-app-4@pindai.test");
    const asPeminjam = await siapkanPengguna(t, "peminjam-app-4", {
      email: "app-4@pindai.test",
      role: "peminjam",
    });
    const userId = await asPeminjam.query(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      return users[0]._id;
    });

    const now = Date.now();
    await t.mutation(async (ctx) => {
      // Perangkat terdaftar lama & berhenti mengirim heartbeat > 24 jam.
      await ctx.db.insert("perangkat", {
        userId,
        deviceId: "android-lama",
        platform: "android",
        versiApp: "1.0.0",
        terdaftarPada: now - 40 * 60 * 60_000,
        terakhirDilihat: now - 25 * 60 * 60_000,
      });
      // Titik terakhir tetap segar dan mengaku dari aplikasi.
      await ctx.db.insert("lokasiStatus", {
        userId,
        lat: -6.2,
        lng: 106.816666,
        akurasi: 20,
        waktu: now,
        sumber: "aplikasi",
      });
    });

    const status = await asPeminjam.query(api.lokasi.statusSaya, {});
    expect(status.perangkatTerdaftar).toBe(false);
    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, PENGAJUAN),
    ).rejects.toThrow("belum terdaftar");
  });
});
