/**
 * Tes override notifikasi PER NASABAH.
 *
 * Yang dijaga:
 *  - admin dapat membaca keadaan default dan menyimpan pilihan satu nasabah;
 *  - nasabah dapat mematikan pengingat WhatsApp miliknya sendiri;
 *  - nilai efektif selalu `global && preferensi`, jadi preferensi tidak bisa
 *    menghidupkan kanal yang dimatikan global;
 *  - non-admin tidak dapat memakai jalur admin untuk membaca atau mengubah
 *    pilihan nasabah lain;
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

  it("nasabah dapat mematikan pengingat WhatsApp miliknya sendiri", async () => {
    const t = buatKontek();
    const { admin, nasabah, nasabahId } = await adminDanNasabah(t);

    const awal = await nasabah.query(api.notifikasiNasabah.preferensiSaya, {});
    expect(awal).toMatchObject({
      whatsapp: true,
      efektifWhatsapp: true,
      globalWhatsapp: true,
      nomorWhatsapp: null,
    });

    await nasabah.mutation(api.notifikasiNasabah.simpanPreferensiSaya, {
      whatsapp: false,
    });

    const sesudah = await nasabah.query(api.notifikasiNasabah.preferensiSaya, {});
    expect(sesudah).toMatchObject({
      whatsapp: false,
      efektifWhatsapp: false,
      globalWhatsapp: true,
    });
    expect(
      await t.query(internal.notifikasiNasabah._kanalAktif, {
        userId: nasabahId,
        kanal: "whatsapp",
      }),
    ).toBe(false);

    const tersimpan = await t.run((ctx) => ctx.db.get(nasabahId));
    expect(tersimpan?.notifWhatsapp).toBe(false);

    // Admin melihat pilihan yang sama, sehingga tidak ada dua sumber kebenaran.
    const dariAdmin = await admin.query(api.notifikasiNasabah.preferensiNasabah, {
      userId: nasabahId,
    });
    expect(dariAdmin).toMatchObject({ whatsapp: false, efektifWhatsapp: false });

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "ubah_preferensi_notifikasi_saya"))
        .collect(),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].aktorUserId).toBe(nasabahId);
    expect(audit[0].target).toBe(`users:${nasabahId}`);
  });

  it("menampilkan nomor WhatsApp dari Data Diri bila KYC belum diisi", async () => {
    const t = buatKontek();
    const { nasabah, nasabahId } = await adminDanNasabah(t);
    await t.run((ctx) =>
      ctx.db.insert("nasabahProfil", {
        userId: nasabahId,
        namaLengkap: "Rani Notif",
        nik: "3201234567890003",
        nomorWhatsApp: "628123450999",
        diperbaruiPada: Date.now(),
        diperbaruiOlehLabel: "nasabah",
        sumber: "nasabah",
      }),
    );

    const data = await nasabah.query(api.notifikasiNasabah.preferensiSaya, {});
    expect(data.nomorWhatsapp).toBe("628123450999");
  });

  it("akun tamu tidak dapat membaca atau mengubah preferensi sendiri", async () => {
    const t = buatKontek();
    const { sesi: tamu } = await buatPengguna(t, "Tamu Notif", { isAnonymous: true });

    await expect(
      tamu.query(api.notifikasiNasabah.preferensiSaya, {}),
    ).rejects.toThrow(/tamu/i);
    await expect(
      tamu.mutation(api.notifikasiNasabah.simpanPreferensiSaya, { whatsapp: false }),
    ).rejects.toThrow(/tamu/i);
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
