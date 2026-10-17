/**
 * Tes pratinjau Super Admin ("masuk sebagai") — convex-test + vitest.
 *
 * Yang dijaga di sini bukan tampilannya, melainkan pagarnya: siapa yang boleh
 * menerbitkan tiket, tiket yang hanya bisa dipakai sekali, batas waktunya, dan
 * pencabutan sesi saat pratinjau diakhiri dari panel. Fitur ini memberi sesi
 * NYATA akun orang lain, jadi tiap pagar harus punya tesnya sendiri.
 *
 * Menjalankan: bunx vitest run src/convex/pratinjau.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

/** Nonce uji — panjang & bentuknya sama dengan yang dibuat klien. */
const NONCE = "9f2c1d4b7a6e5c8d3f0a1b2c4d5e6f70";

async function barisPratinjau(t: KonteksUji) {
  return t.run((ctx) => ctx.db.query("pratinjauSesi").collect());
}

async function aksiAudit(t: KonteksUji, aksi: string) {
  const semua = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return semua.filter((baris) => baris.aksi === aksi);
}

async function idAuditSesi(t: KonteksUji, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect(),
  );
}

describe("pratinjau Super Admin — tiket", () => {
  it("menerbitkan tiket sekali pakai dan menukarnya jadi sesi akun target", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const pendana = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });

    const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: pendana.userId,
      nonce: NONCE,
      alasan: "memeriksa portofolio pendana",
    });
    expect(tiket.targetNama).toBe("Robert");
    expect(tiket.tujuan).toBe("/penyedia-dana");

    const hasil = await t.mutation(internal.pratinjau._pakaiTiket, {
      tiketId: tiket.tiketId,
    });
    expect(hasil.userId).toBe(pendana.userId);

    // Sesi pratinjau dibuat server: sesi admin TIDAK ikut terhapus, dan
    // barisnya mencatat sesi mana yang harus dicabut bila admin menutup paksa.
    const baris = await barisPratinjau(t);
    expect(baris[0].sesiPratinjauId).toBe(hasil.sessionId);
    const sesiAdmin = await idAuditSesi(t, admin.userId);
    expect(sesiAdmin.map((s) => s._id)).toContain(admin.authSessionId);

    // Tiket tidak bisa dipakai dua kali.
    await expect(
      t.mutation(internal.pratinjau._pakaiTiket, { tiketId: tiket.tiketId }),
    ).rejects.toThrow(/sudah dipakai/i);

    const catatan = await aksiAudit(t, "pratinjau_mulai");
    expect(catatan).toHaveLength(1);
    expect(catatan[0].aktorLabel).toBe("admin@pindai.test");
    expect(catatan[0].target).toBe("Robert");
    expect(catatan[0].detail).toContain("memeriksa portofolio pendana");
  });

  it("mengarahkan pratinjau peminjam ke dashboard", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: peminjam.userId,
      nonce: NONCE,
    });
    expect(tiket.tujuan).toBe("/dashboard");
  });

  it("menolak nonce yang tidak berbentuk penanda acak", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    await expect(
      admin.sesi.mutation(api.pratinjau.mintaTiket, {
        targetId: peminjam.userId,
        nonce: "pendek",
      }),
    ).rejects.toThrow(/Penanda pratinjau tidak valid/i);
  });

  it("menolak akun tim dan akun tamu sebagai target", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const adminLain = await siapkanPengguna(t, "admin kedua", {
      email: "admin2@pindai.test",
      role: "admin",
    });
    const tamu = await buatPengguna(t, "Pemantau bersama", { isAnonymous: true });

    await expect(
      admin.sesi.mutation(api.pratinjau.mintaTiket, {
        targetId: adminLain.userId,
        nonce: NONCE,
      }),
    ).rejects.toThrow(/tidak dapat dipratinjau/i);

    await expect(
      admin.sesi.mutation(api.pratinjau.mintaTiket, {
        targetId: tamu.userId,
        nonce: NONCE,
      }),
    ).rejects.toThrow(/Akun tamu/i);
  });

  it("menolak tiket yang kedaluwarsa", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: peminjam.userId,
      nonce: NONCE,
    });
    await t.run(async (ctx) => {
      const baris = await ctx.db.query("pratinjauSesi").first();
      if (baris === null) throw new Error("baris pratinjau tidak ditemukan");
      await ctx.db.patch(baris._id, { kedaluwarsa: Date.now() - 1 });
    });

    await expect(
      t.mutation(internal.pratinjau._pakaiTiket, { tiketId: tiket.tiketId }),
    ).rejects.toThrow(/kedaluwarsa/i);
  });

  it("membatasi jumlah pratinjau aktif per admin", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    for (let ke = 0; ke < 3; ke += 1) {
      const nonce = `${NONCE}${ke}`;
      const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
        targetId: peminjam.userId,
        nonce,
      });
      await t.mutation(internal.pratinjau._pakaiTiket, { tiketId: tiket.tiketId });
    }

    await expect(
      admin.sesi.mutation(api.pratinjau.mintaTiket, {
        targetId: peminjam.userId,
        nonce: `${NONCE}x`,
      }),
    ).rejects.toThrow(/pratinjau aktif/i);
  });
});

describe("pratinjau Super Admin — pagar akses", () => {
  it("menolak akun pendana yang bukan admin", async () => {
    const t = convexTest(schema, modules);
    const pendana = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    await expect(
      pendana.sesi.mutation(api.pratinjau.mintaTiket, {
        targetId: peminjam.userId,
        nonce: NONCE,
      }),
    ).rejects.toThrow(/Super Admin/i);

    await expect(pendana.sesi.query(api.pratinjau.daftarPratinjauAktif, {})).rejects.toThrow(
      /Super Admin/i,
    );
  });

  it("menolak admin yang sesinya belum lolos TOTP", async () => {
    const t = convexTest(schema, modules);
    // Sengaja tanpa `aktifkanTotpUntukSesi`: peran admin saja tidak cukup.
    const admin = await buatPengguna(t, "super admin", {
      email: "admin@pindai.test",
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    await expect(
      admin.sesi.mutation(api.pratinjau.mintaTiket, {
        targetId: peminjam.userId,
        nonce: NONCE,
      }),
    ).rejects.toThrow(/TOTP/i);
  });
});

describe("pratinjau Super Admin — bilah dan penutupan", () => {
  it("menampilkan pratinjau hanya kepada akun target dengan nonce yang cocok", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: peminjam.userId,
      nonce: NONCE,
    });
    await t.mutation(internal.pratinjau._pakaiTiket, { tiketId: tiket.tiketId });

    const tampil = await peminjam.sesi.query(api.pratinjau.pratinjauAktif, {
      nonce: NONCE,
    });
    expect(tampil?.adminLabel).toBe("admin@pindai.test");
    expect(tampil?.targetLabel).toBe("Rani");
    expect(tampil?.tujuan).toBe("/dashboard");

    // Nonce lain, dan peramban akun lain: tidak ada yang bocor.
    expect(await peminjam.sesi.query(api.pratinjau.pratinjauAktif, { nonce: `${NONCE}9` })).toBe(
      null,
    );
    expect(await admin.sesi.query(api.pratinjau.pratinjauAktif, { nonce: NONCE })).toBe(null);
  });

  it("menandai pratinjau berjalan, dan menganggap usang setelah ditutup atau kedaluwarsa", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: peminjam.userId,
      nonce: NONCE,
    });

    // Tiket yang belum ditukar bukan pratinjau berjalan: salinan sesi admin di
    // peramban tidak boleh menahan pratinjau baru karenanya.
    expect(await admin.sesi.query(api.pratinjau.pratinjauBerjalan, { nonce: NONCE })).toBe(
      false,
    );

    await t.mutation(internal.pratinjau._pakaiTiket, { tiketId: tiket.tiketId });
    expect(await admin.sesi.query(api.pratinjau.pratinjauBerjalan, { nonce: NONCE })).toBe(
      true,
    );

    // Nonce lain dan pemanggil tanpa sesi tidak mendapat jawaban "berjalan".
    expect(
      await admin.sesi.query(api.pratinjau.pratinjauBerjalan, { nonce: `${NONCE}9` }),
    ).toBe(false);
    expect(await t.query(api.pratinjau.pratinjauBerjalan, { nonce: NONCE })).toBe(false);

    // Pratinjau berakhir sendiri: penanda di peramban menjadi usang.
    const baris = await barisPratinjau(t);
    await t.run((ctx) =>
      ctx.db.patch(baris[0]._id, { berlakuHingga: Date.now() - 1 }),
    );
    expect(await admin.sesi.query(api.pratinjau.pratinjauBerjalan, { nonce: NONCE })).toBe(
      false,
    );

    // Ditutup dari bilah: juga usang, walau batas waktunya belum lewat.
    const nonceKedua = `${NONCE}1`;
    const tiketKedua = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: peminjam.userId,
      nonce: nonceKedua,
    });
    await t.mutation(internal.pratinjau._pakaiTiket, { tiketId: tiketKedua.tiketId });
    await peminjam.sesi.mutation(api.pratinjau.akhiriPratinjau, { nonce: nonceKedua });
    expect(
      await admin.sesi.query(api.pratinjau.pratinjauBerjalan, { nonce: nonceKedua }),
    ).toBe(false);
  });

  it("menutup pratinjau dari bilah hanya oleh akun target", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: peminjam.userId,
      nonce: NONCE,
    });
    await t.mutation(internal.pratinjau._pakaiTiket, { tiketId: tiket.tiketId });

    // Akun lain tidak bisa menutup pratinjau ini.
    expect(
      await admin.sesi.mutation(api.pratinjau.akhiriPratinjau, { nonce: NONCE }),
    ).toEqual({ ok: false, sudahSelesai: false });

    const ditutup = await peminjam.sesi.mutation(api.pratinjau.akhiriPratinjau, {
      nonce: NONCE,
    });
    expect(ditutup).toEqual({ ok: true, sudahSelesai: false });
    expect(await peminjam.sesi.query(api.pratinjau.pratinjauAktif, { nonce: NONCE })).toBe(null);
    expect(await aksiAudit(t, "pratinjau_selesai")).toHaveLength(1);
  });
});

describe("pratinjau Super Admin — pengawasan panel", () => {
  it("mencabut sesi hasil pratinjau saat diakhiri dari panel", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    const tiket = await admin.sesi.mutation(api.pratinjau.mintaTiket, {
      targetId: peminjam.userId,
      nonce: NONCE,
    });
    const hasilTiket = await t.mutation(internal.pratinjau._pakaiTiket, {
      tiketId: tiket.tiketId,
    });

    // Sesi pratinjau dibuat server saat tiket ditukar; sesi asli pemilik akun
    // sudah ada sejak awal dan tidak boleh ikut dicabut.
    const sesiPratinjauId = hasilTiket.sessionId;

    const daftar = await admin.sesi.query(api.pratinjau.daftarPratinjauAktif, {});
    expect(daftar.rows).toHaveLength(1);
    expect(daftar.rows[0].adminLabel).toBe("admin@pindai.test");
    expect(daftar.rows[0].targetLabel).toBe("Rani");

    const hasil = await admin.sesi.mutation(api.pratinjau.akhiriPratinjauOlehAdmin, {
      id: daftar.rows[0].id,
      alasan: "sesi pratinjau ditinggal terbuka",
    });
    expect(hasil).toMatchObject({ ok: true, sudahSelesai: false, dicabut: 1 });

    const sesiTersisa = await idAuditSesi(t, peminjam.userId);
    expect(sesiTersisa.map((s) => s._id)).not.toContain(sesiPratinjauId);
    // Sesi sungguhan milik pemilik akun tidak ikut dicabut.
    expect(sesiTersisa.map((s) => s._id)).toContain(peminjam.authSessionId);

    const sesudah = await admin.sesi.query(api.pratinjau.daftarPratinjauAktif, {});
    expect(sesudah.rows).toHaveLength(0);
    expect(await aksiAudit(t, "pratinjau_diakhiri_admin")).toHaveLength(1);
  });
});

describe("Mode Nasabah — pemilih akun uji", () => {
  it("hanya menawarkan akun peminjam dan pendaftar baru", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const rani = await siapkanPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const pendaftar = await buatPengguna(t, "Budi", { email: "budi@pindai.test" });
    const pendana = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    await t.run((ctx) =>
      ctx.db.insert("users", { name: "Pemantau", email: "pantau@pindai.test", role: "pengamat" }),
    );
    await buatPengguna(t, "Tamu", { isAnonymous: true });

    const hasil = await admin.sesi.query(api.pratinjau.cariNasabahUji, { kueri: "" });
    expect(hasil.siap).toBe(true);
    expect(hasil.total).toBe(2);
    expect(hasil.hasil.map((r) => r.userId).sort()).toEqual(
      [rani.userId, pendaftar.userId].sort(),
    );
    expect(hasil.hasil.map((r) => r.nama)).not.toContain("ROBERT");
    expect(hasil.hasil.map((r) => r.nama)).not.toContain("TAMU");
    expect(hasil.hasil.map((r) => r.userId)).not.toContain(pendana.userId);
  });

  it("mencocokkan kode nasabah dan NIK tanpa mengirim NIK ke peramban", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "super admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const rani = await buatPengguna(t, "Rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(rani.userId, { kodePeminjam: "PMN-7K2QX9" });
      await ctx.db.insert("nasabahProfil", {
        userId: rani.userId,
        namaLengkap: "RANI PUSPITA",
        nik: "3201234567890003",
        nomorWhatsApp: "628123456791",
        diperbaruiPada: Date.now(),
        diperbaruiOlehLabel: "admin uji",
      });
      await ctx.db.insert("kycProfil", {
        userId: rani.userId,
        status: "VERIFIED",
        namaLengkap: "RANI PUSPITA",
        nik: "3201234567890003",
        nomorWhatsApp: "628123456791",
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      });
    });

    const lewatNik = await admin.sesi.query(api.pratinjau.cariNasabahUji, {
      kueri: "3201234567890003",
    });
    expect(lewatNik.total).toBe(1);
    expect(lewatNik.hasil[0]).toMatchObject({
      userId: rani.userId,
      nama: "RANI PUSPITA",
      kodePeminjam: "PMN-7K2QX9",
      kycStatus: "VERIFIED",
      punyaDataDiri: true,
      punyaPinjaman: false,
    });

    const lewatKode = await admin.sesi.query(api.pratinjau.cariNasabahUji, {
      kueri: "pmn-7k2qx9",
    });
    expect(lewatKode.hasil).toHaveLength(1);

    // NIK dan nomor WhatsApp hanya dipakai untuk mencocokkan, tidak dikirim.
    const teks = JSON.stringify(lewatNik.hasil);
    expect(teks).not.toContain("3201234567890003");
    expect(teks).not.toContain("628123456791");
  });

  it("menahan daftar untuk admin yang belum lolos TOTP", async () => {
    const t = convexTest(schema, modules);
    const admin = await buatPengguna(t, "super admin", {
      email: "admin@pindai.test",
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    await siapkanPengguna(t, "Rani", { email: "rani@pindai.test", role: "peminjam" });

    // Bukan galat: layar harus bisa menampilkan langkah verifikasinya.
    const hasil = await admin.sesi.query(api.pratinjau.cariNasabahUji, { kueri: "" });
    expect(hasil).toEqual({ siap: false, hasil: [], total: 0 });
  });

  it("menolak peran selain Super Admin", async () => {
    const t = convexTest(schema, modules);
    const pendana = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });

    await expect(
      pendana.sesi.query(api.pratinjau.cariNasabahUji, { kueri: "" }),
    ).rejects.toThrow(/Super Admin/i);
  });
});
