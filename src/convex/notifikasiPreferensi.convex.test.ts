/**
 * Tes preferensi kanal notifikasi (`notifikasiPreferensi.saya/simpan` dan
 * gerbang internal `_kanalAktif`).
 *
 * Yang dijaga:
 *  - akun lama (kolom kosong) tetap menerima pengingat di kedua kanal;
 *  - pilihan disimpan di server dan dibaca ulang oleh gerbang pengiriman;
 *  - nomor tujuan WhatsApp dibaca dari data KYC, bukan dikarang UI;
 *  - akun tamu tidak bisa membaca/mengubah pilihan, dan pilihan satu akun tidak
 *    mengubah akun lain.
 *
 * Menjalankan: bunx vitest run src/convex/notifikasiPreferensi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { buatPengguna } from "./test.helpers";
import { modules } from "./test.setup";

describe("preferensi notifikasi", () => {
  it("bawaan aktif untuk akun lama, tanpa nomor tujuan", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await buatPengguna(t, "Rina Bawaan", {
      email: "rina-bawaan@pindai.test",
    });

    const data = await sesi.query(api.notifikasiPreferensi.saya, {});
    expect(data).toMatchObject({
      whatsapp: true,
      email: true,
      nomorWhatsapp: null,
      emailAlamat: "rina-bawaan@pindai.test",
    });
  });

  it("menyimpan pilihan dan gerbang internal membacanya", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await buatPengguna(t, "Budi Pilih", {
      email: "budi-pilih@pindai.test",
    });

    const hasil = await sesi.mutation(api.notifikasiPreferensi.simpan, {
      whatsapp: false,
      email: true,
    });
    expect(hasil).toEqual({ whatsapp: false, email: true });

    const data = await sesi.query(api.notifikasiPreferensi.saya, {});
    expect(data).toMatchObject({ whatsapp: false, email: true });

    expect(
      await t.query(internal.notifikasiPreferensi._kanalAktif, {
        userId,
        kanal: "whatsapp",
      }),
    ).toBe(false);
    expect(
      await t.query(internal.notifikasiPreferensi._kanalAktif, {
        userId,
        kanal: "email",
      }),
    ).toBe(true);

    // Tersimpan di baris pengguna, bukan hanya dikembalikan mutation.
    const tersimpan = await t.run((ctx) => ctx.db.get(userId));
    expect(tersimpan?.notifWhatsapp).toBe(false);
    expect(tersimpan?.notifEmail).toBe(true);
  });

  it("nomor WhatsApp diambil dari data KYC", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await buatPengguna(t, "Sari KYC", {
      email: "sari-kyc@pindai.test",
    });
    await t.run((ctx) =>
      ctx.db.insert("kycProfil", {
        userId,
        status: "VERIFIED",
        namaLengkap: "SARI KYC",
        nomorWhatsApp: "628123450001",
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      }),
    );

    const data = await sesi.query(api.notifikasiPreferensi.saya, {});
    expect(data.nomorWhatsapp).toBe("628123450001");
  });

  it("akun tamu ditolak membaca dan mengubah pilihan", async () => {
    const t = convexTest(schema, modules);
    const tamu = await buatPengguna(t, "Tamu", {
      email: "tamu-notif@pindai.test",
      isAnonymous: true,
    });

    await expect(tamu.sesi.query(api.notifikasiPreferensi.saya, {})).rejects.toThrow(
      /tamu/i,
    );
    await expect(
      tamu.sesi.mutation(api.notifikasiPreferensi.simpan, {
        whatsapp: false,
        email: false,
      }),
    ).rejects.toThrow(/tamu/i);
  });

  it("pilihan satu akun tidak mengubah akun lain", async () => {
    const t = convexTest(schema, modules);
    const first = await buatPengguna(t, "Akun Satu", { email: "satu@pindai.test" });
    const second = await buatPengguna(t, "Akun Dua", { email: "dua@pindai.test" });

    await first.sesi.mutation(api.notifikasiPreferensi.simpan, {
      whatsapp: false,
      email: false,
    });

    const data = await second.sesi.query(api.notifikasiPreferensi.saya, {});
    expect(data).toMatchObject({ whatsapp: true, email: true });
    expect(
      await t.query(internal.notifikasiPreferensi._kanalAktif, {
        userId: second.userId,
        kanal: "whatsapp",
      }),
    ).toBe(true);
  });
});
