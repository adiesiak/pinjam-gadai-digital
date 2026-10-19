/**
 * Tes override notifikasi PER NASABAH.
 *
 * Yang dijaga:
 *  - admin dapat membaca keadaan default dan menyimpan pilihan satu nasabah;
 *  - nilai efektif selalu `global && override`, jadi override tidak bisa
 *    menghidupkan kanal yang dimatikan global;
 *  - non-admin tidak dapat membaca maupun mengubah pilihan nasabah lain;
 *  - perubahan tercatat di audit trail.
 *
 * Menjalankan: bunx vitest run src/convex/notifikasiNasabah.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { buatPengguna, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

async function adminDanNasabah(t: ReturnType<typeof buatKontek>) {
  const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin-notif-nasabah", {
    email: "admin-notif-nasabah@pindai.test",
    role: "admin",
  });
  const { userId: nasabahId, sesi: nasabah } = await buatPengguna(t, "Rani Notif", {
    email: "rani-notif-nasabah@pindai.test",
    role: "peminjam",
  });
  return { admin, adminId, nasabah, nasabahId };
}

describe("override notifikasi per nasabah", () => {
  it("default aktif dan admin dapat menyimpan pilihan nasabah", async () => {
    const t = buatKontek();
    const { admin, nasabahId } = await adminDanNasabah(t);

    const awal = await admin.query(api.notifikasiNasabah.preferensiNasabah, {
      userId: nasabahId,
    });
    expect(awal).toMatchObject({
      whatsapp: true,
      email: true,
      efektifWhatsapp: true,
      efektifEmail: true,
      nomorWhatsapp: null,
      emailAlamat: "rani-notif-nasabah@pindai.test",
    });

    await admin.mutation(api.notifikasiNasabah.simpanPreferensiNasabah, {
      userId: nasabahId,
      whatsapp: false,
      email: true,
    });

    const sesudah = await admin.query(api.notifikasiNasabah.preferensiNasabah, {
      userId: nasabahId,
    });
    expect(sesudah).toMatchObject({
      whatsapp: false,
      email: true,
      efektifWhatsapp: false,
      efektifEmail: true,
    });

    const tersimpan = await t.run((ctx) => ctx.db.get(nasabahId));
    expect(tersimpan?.notifWhatsapp).toBe(false);
    expect(tersimpan?.notifEmail).toBe(true);

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "ubah_notifikasi_nasabah"))
        .collect(),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].target).toBe(`users:${nasabahId}`);
  });

  it("gerbang efektif menggabungkan sakelar global dan override nasabah", async () => {
    const t = buatKontek();
    const { admin, nasabahId } = await adminDanNasabah(t);

    // Global aktif, override nasabah mati → kanal mati.
    await admin.mutation(api.notifikasiNasabah.simpanPreferensiNasabah, {
      userId: nasabahId,
      whatsapp: false,
      email: true,
    });
    expect(
      await t.query(internal.notifikasiNasabah._kanalAktif, {
        userId: nasabahId,
        kanal: "whatsapp",
      }),
    ).toBe(false);
    expect(
      await t.query(internal.notifikasiNasabah._kanalAktif, {
        userId: nasabahId,
        kanal: "email",
      }),
    ).toBe(true);

    // Override nasabah dinyalakan, tetapi global dimatikan → tetap mati.
    await admin.mutation(api.notifikasiNasabah.simpanPreferensiNasabah, {
      userId: nasabahId,
      whatsapp: true,
      email: true,
    });
    await t.run((ctx) =>
      ctx.db.insert("systemConfig", {
        slot: "global",
        notifWhatsappAktif: false,
        notifEmailAktif: false,
        diperbaruiPada: Date.now(),
      }),
    );
    expect(
      await t.query(internal.notifikasiNasabah._kanalAktif, {
        userId: nasabahId,
        kanal: "whatsapp",
      }),
    ).toBe(false);
    expect(
      await t.query(internal.notifikasiNasabah._kanalAktif, {
        userId: nasabahId,
        kanal: "email",
      }),
    ).toBe(false);

    const data = await admin.query(api.notifikasiNasabah.preferensiNasabah, {
      userId: nasabahId,
    });
    expect(data).toMatchObject({
      whatsapp: true,
      globalWhatsapp: false,
      efektifWhatsapp: false,
    });
  });

  it("non-admin tidak dapat membaca atau mengubah override nasabah", async () => {
    const t = buatKontek();
    const { nasabah, nasabahId } = await adminDanNasabah(t);

    await expect(
      nasabah.query(api.notifikasiNasabah.preferensiNasabah, { userId: nasabahId }),
    ).rejects.toThrow(/admin/i);
    await expect(
      nasabah.mutation(api.notifikasiNasabah.simpanPreferensiNasabah, {
        userId: nasabahId,
        whatsapp: false,
        email: false,
      }),
    ).rejects.toThrow(/admin/i);
  });
});
