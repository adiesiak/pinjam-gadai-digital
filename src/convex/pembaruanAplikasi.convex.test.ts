/**
 * Tes pengingat pembaruan aplikasi (`convex/pembaruanAplikasi.ts`).
 *
 * Yang dijaga di sini adalah janji modulnya, bukan tampilan panel:
 *
 * - hanya admin dengan sesi TOTP terverifikasi yang boleh mengumumkan versi;
 * - satu `versionCode` hanya bisa diumumkan sekali — itulah yang membuat
 *   notifikasi dan pesan WhatsApp tidak berulang untuk versi yang sama;
 * - tautan yang tidak bisa dibuka penerima ditolak sebelum tersimpan;
 * - pengumuman langsung muncul di pusat notifikasi setiap akun dengan kunci
 *   `pembaruan:<kode>`, dan versi berikutnya memakai kunci baru;
 * - daftar penerima hanya berisi akun bernomor sah, tanpa admin/tamu, dan satu
 *   nomor hanya sekali;
 * - penerima yang sudah menerima versi itu dilewati pada pengiriman berikutnya.
 *
 * Menjalankan: bunx vitest run src/convex/pembaruanAplikasi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const TAUTAN = "https://pindai.example/pindai.apk";

/** Isi `nasabahProfil` seperti yang ditulis panel data diri. */
async function pasangNomor(
  t: KonteksUji,
  userId: Id<"users">,
  namaLengkap: string,
  nomorWhatsApp: string,
): Promise<void> {
  const now = Date.now();
  await t.run((ctx) =>
    ctx.db.insert("nasabahProfil", {
      userId,
      namaLengkap,
      nik: "3201234567890001",
      nomorWhatsApp,
      diperbaruiPada: now,
      diperbaruiOlehLabel: "uji",
    }),
  );
}

describe("pembaruanAplikasi", () => {
  it("admin mengumumkan versi, pengguna menerima satu notifikasi", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Pembaruan", {
      email: "admin.pembaruan@pindai.test",
      role: "admin",
    });
    const nasabah = await buatPengguna(t, "Rina Nasabah", {
      email: "rina.pembaruan@pindai.test",
    });

    await admin.sesi.mutation(api.pembaruanAplikasi.umumkan, {
      versiKode: 3,
      versiNama: "1.2.0",
      tautan: TAUTAN,
      catatan: "Perbaikan layar KYC.",
    });

    const terbaru = await t.query(api.pembaruanAplikasi.terbaru, {});
    expect(terbaru?.versiKode).toBe(3);
    expect(terbaru?.versiNama).toBe("1.2.0");
    expect(terbaru?.tautan).toBe(TAUTAN);

    const notifikasi = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const kabar = notifikasi.item.filter((it) => it.kunci === "pembaruan:3");
    expect(kabar).toHaveLength(1);
    expect(kabar[0].judul).toContain("1.2.0");
    expect(kabar[0].dibaca).toBe(false);

    // Dibaca sekali — kunci yang sama tidak muncul lagi sebagai belum dibaca.
    await nasabah.sesi.mutation(api.notifikasi.tandaiDibaca, { kunci: "pembaruan:3" });
    const sesudah = await nasabah.sesi.query(api.notifikasi.daftar, {});
    expect(sesudah.item.find((it) => it.kunci === "pembaruan:3")?.dibaca).toBe(true);

    // Versi berikutnya memakai kunci baru; versi lama tidak diumumkan ulang.
    await admin.sesi.mutation(api.pembaruanAplikasi.umumkan, {
      versiKode: 4,
      versiNama: "1.3.0",
      tautan: TAUTAN,
    });
    const lagi = await nasabah.sesi.query(api.notifikasi.daftar, {});
    expect(lagi.item.filter((it) => it.kunci.startsWith("pembaruan:")).length).toBeGreaterThan(0);
    expect(lagi.item.some((it) => it.kunci === "pembaruan:4" && !it.dibaca)).toBe(true);
  });

  it("menolak versi ganda, tautan tidak sah, dan non-admin", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Pembaruan", {
      email: "admin.ganda@pindai.test",
      role: "admin",
    });

    await admin.sesi.mutation(api.pembaruanAplikasi.umumkan, {
      versiKode: 5,
      versiNama: "1.4.0",
      tautan: TAUTAN,
    });
    await expect(
      admin.sesi.mutation(api.pembaruanAplikasi.umumkan, {
        versiKode: 5,
        versiNama: "1.4.1",
        tautan: TAUTAN,
      }),
    ).rejects.toThrow(/sudah diumumkan/i);

    await expect(
      admin.sesi.mutation(api.pembaruanAplikasi.umumkan, {
        versiKode: 6,
        versiNama: "1.5.0",
        tautan: "/pindai.apk",
      }),
    ).rejects.toThrow(/http\(s\) utuh/i);

    const nasabah = await buatPengguna(t, "Rina Nasabah", {
      email: "rina.tolak@pindai.test",
    });
    await expect(
      nasabah.sesi.mutation(api.pembaruanAplikasi.umumkan, {
        versiKode: 7,
        versiNama: "1.6.0",
        tautan: TAUTAN,
      }),
    ).rejects.toThrow();

    expect(await nasabah.sesi.query(api.pembaruanAplikasi.status, {})).toBeNull();
    expect(await nasabah.sesi.query(api.pembaruanAplikasi.penerima, {})).toBeNull();
  });

  it("menyusun penerima bernomor tanpa admin, tamu, dan nomor ganda", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Pembaruan", {
      email: "admin.penerima@pindai.test",
      role: "admin",
    });
    await pasangNomor(t, admin.userId, "Admin Pembaruan", "628111000111");

    const rina = await buatPengguna(t, "Rina Nasabah", {
      email: "rina.penerima@pindai.test",
    });
    await pasangNomor(t, rina.userId, "Rina Nasabah", "6281234567890");

    // Akun kedua memakai nomor yang sama — hanya satu pesan untuk nomor itu.
    const budi = await buatPengguna(t, "Budi Kembar", {
      email: "budi.penerima@pindai.test",
    });
    await pasangNomor(t, budi.userId, "Budi Kembar", "+62 812-3456-7890");

    // Nomor rusak tidak pernah dianggap punya nomor.
    const tanpaNomor = await buatPengguna(t, "Sari Tanpa Nomor", {
      email: "sari.penerima@pindai.test",
    });
    await pasangNomor(t, tanpaNomor.userId, "Sari Tanpa Nomor", "123");

    const tamu = await buatPengguna(t, "Tamu", { isAnonymous: true });
    await pasangNomor(t, tamu.userId, "Tamu", "628999000111");

    await admin.sesi.mutation(api.pembaruanAplikasi.umumkan, {
      versiKode: 8,
      versiNama: "1.7.0",
      tautan: TAUTAN,
    });

    const ringkas = await admin.sesi.query(api.pembaruanAplikasi.status, {});
    expect(ringkas?.jumlahPenerima).toBe(1);
    expect(ringkas?.duplikat).toBe(1);
    // Tamu tidak pernah dihitung sebagai penerima, jadi yang "tanpa nomor"
    // hanya Sari — yang punya akun tetapi nomornya tidak bisa dibaca.
    expect(ringkas?.tanpaNomor).toBe(1);

    const daftar = await admin.sesi.query(api.pembaruanAplikasi.penerima, {});
    expect(daftar?.daftar).toEqual([
      { nama: "Rina Nasabah", nomor: "6281234567890", status: "belum" },
    ]);
  });

  it("melewati penerima yang sudah menerima versi itu", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Pembaruan", {
      email: "admin.kirim@pindai.test",
      role: "admin",
    });
    const rina = await buatPengguna(t, "Rina Nasabah", {
      email: "rina.kirim@pindai.test",
    });
    await pasangNomor(t, rina.userId, "Rina Nasabah", "6281234567890");
    const budi = await buatPengguna(t, "Budi Nasabah", {
      email: "budi.kirim@pindai.test",
    });
    await pasangNomor(t, budi.userId, "Budi Nasabah", "6281234567891");

    await admin.sesi.mutation(api.pembaruanAplikasi.umumkan, {
      versiKode: 9,
      versiNama: "1.8.0",
      tautan: TAUTAN,
    });

    await t.run((ctx) =>
      ctx.db.insert("pembaruanAplikasiWa", {
        versiKode: 9,
        userId: rina.userId,
        nomor: "6281234567890",
        status: "terkirim",
        respon: "ok",
        pada: Date.now(),
      }),
    );

    const konteks = await t.query(internal.pembaruanAplikasi._konteksKirim, { versiKode: 9 });
    expect(konteks.penerima).toHaveLength(2);
    expect(konteks.sudah).toEqual([rina.userId]);

    // Non-admin tidak bisa memicu pengiriman sama sekali.
    await expect(
      rina.sesi.action(api.pembaruanAplikasi.kirimWhatsapp, { versiKode: 9 }),
    ).rejects.toThrow();
  });
});
