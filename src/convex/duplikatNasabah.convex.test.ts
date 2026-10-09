/**
 * Tes alat nasabah kembar (convex-test + vitest).
 *
 * Membuktikan deteksi NIK/WhatsApp hanya mengembalikan kelompok yang benar, dan
 * penggabungan MEMINDAHKAN riwayat keuangan ke akun utama lalu menghapus akun
 * duplikat — bukan sebaliknya. Gerbang penyedia dana juga diuji karena akun
 * berperan ganda tidak boleh digabung dari alat nasabah.
 *
 * Menjalankan: bunx vitest run src/convex/duplikatNasabah.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

async function buatProfil(
  t: KonteksUji,
  userId: Id<"users">,
  nilai: { namaLengkap: string; nik: string; nomorWhatsApp: string },
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("nasabahProfil", {
      userId,
      namaLengkap: nilai.namaLengkap,
      nik: nilai.nik,
      nomorWhatsApp: nilai.nomorWhatsApp,
      diperbaruiPada: Date.now(),
      diperbaruiOlehLabel: "admin uji",
      sumber: "admin",
    }),
  );
}

async function buatPinjaman(
  t: KonteksUji,
  userId: Id<"users">,
  nomorReferensi: string,
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Uji gabung nasabah",
      namaLengkap: "NASABAH UJI",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi,
      tenorHari: 30,
    }),
  );
}

async function buatGadai(t: KonteksUji, userId: Id<"users">, nomorReferensi: string) {
  return t.run(async (ctx) => {
    const pawnId = await ctx.db.insert("pawns", {
      userId,
      deskripsiBarang: "Laptop",
      kategori: "Elektronik",
      alamatPenilaian: "Bandung",
      namaLengkap: "NASABAH UJI",
      nomorRekening: "1234567890",
      status: "aktif",
      nomorReferensi,
      pokokGadai: 500_000,
      sisaPokok: 400_000,
    });
    await ctx.db.insert("pawnPayments", {
      pawnId,
      pokokDicicil: 100_000,
      sewaDibayar: 10_000,
      sisaPokokSetelah: 400_000,
      sewaModalBerikut: 10_000,
      userId,
      waktu: Date.now(),
    });
    return pawnId;
  });
}

describe("daftarNasabahKembar", () => {
  it("mengelompokkan profil dengan WhatsApp sama walau NIK beda", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: nyata } = await siapkanPengguna(t, "Alfian", {
      email: "alfian@pindai.test",
      role: "peminjam",
    });
    const { userId: catatan } = await buatPengguna(t, "Alifan", { role: "peminjam" });
    await t.run((ctx) => ctx.db.patch(catatan, { dibuatAdminPada: Date.now() }));
    const { userId: lain } = await siapkanPengguna(t, "Orang Lain", {
      email: "lain@pindai.test",
      role: "peminjam",
    });

    await buatProfil(t, nyata, {
      namaLengkap: "ALFIAN RIFKI",
      nik: "3174010101900001",
      nomorWhatsApp: "6281234567890",
    });
    await buatProfil(t, catatan, {
      namaLengkap: "ALIFAN",
      nik: "3174010101900019",
      nomorWhatsApp: "6281234567890",
    });
    await buatProfil(t, lain, {
      namaLengkap: "ORANG LAIN",
      nik: "3174010101909999",
      nomorWhatsApp: "628999999999",
    });

    const hasil = await admin.query(api.duplikatNasabah.daftarNasabahKembar, {});
    expect(hasil.totalProfil).toBe(3);
    expect(hasil.kelompok).toHaveLength(1);
    expect(hasil.kelompok[0].sebab).toEqual(["whatsapp"]);
    expect(hasil.kelompok[0].baris.map((b) => b.userId).sort()).toEqual(
      [nyata, catatan].sort(),
    );
    // Akun nyata disarankan lebih dulu daripada akun catatan admin.
    expect(hasil.kelompok[0].baris[0].userId).toBe(nyata);
    expect(hasil.kelompok[0].baris[0].dibuatAdmin).toBe(false);
    expect(hasil.kelompok[0].baris[1].dibuatAdmin).toBe(true);
  });

  it("hanya admin yang boleh melihat daftar kembar", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.query(api.duplikatNasabah.daftarNasabahKembar, {}),
    ).rejects.toThrow(/admin/i);
  });
});

describe("gabungNasabah", () => {
  it("memindahkan riwayat keuangan ke akun utama lalu menghapus akun duplikat", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: utama } = await siapkanPengguna(t, "Alfian", {
      email: "alfian@pindai.test",
      role: "peminjam",
    });
    const { userId: duplikat } = await buatPengguna(t, "Alifan", { role: "peminjam" });
    await t.run((ctx) => ctx.db.patch(duplikat, { dibuatAdminPada: Date.now() }));

    await buatProfil(t, utama, {
      namaLengkap: "ALFIAN RIFKI",
      nik: "3174010101900001",
      nomorWhatsApp: "6281234567890",
    });
    await buatProfil(t, duplikat, {
      namaLengkap: "ALIFAN",
      nik: "3174010101900019",
      nomorWhatsApp: "6281234567890",
    });

    const loanId = await buatPinjaman(t, duplikat, "PGD-DUP-1");
    const pawnId = await buatGadai(t, duplikat, "GD-DUP-1");

    const hasil = await admin.mutation(api.duplikatNasabah.gabungNasabah, {
      utamaId: utama,
      sumberIds: [duplikat],
      alasan: "Kembar data lama",
    });
    expect(hasil.ok).toBe(true);
    expect(hasil.digabung).toBe(1);
    expect(hasil.ringkas.pinjaman).toBe(1);
    expect(hasil.ringkas.gadai).toBe(1);
    expect(hasil.ringkas.cicilanGadai).toBe(1);

    const state = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      pawn: await ctx.db.get(pawnId),
      pawnPayments: await ctx.db.query("pawnPayments").collect(),
      profil: await ctx.db.query("nasabahProfil").collect(),
      duplikat: await ctx.db.get(duplikat),
      utama: await ctx.db.get(utama),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(state.loan?.userId).toBe(utama);
    expect(state.pawn?.userId).toBe(utama);
    expect(state.pawnPayments[0].userId).toBe(utama);
    // Data diri duplikat dibuang karena akun utama sudah punya; yang tersisa 1.
    expect(state.profil).toHaveLength(1);
    expect(state.profil[0].userId).toBe(utama);
    expect(state.duplikat).toBeNull();
    expect(state.utama).not.toBeNull();
    expect(state.audit.some((row) => row.aksi === "nasabah_gabung")).toBe(true);
  });

  it("memindahkan data diri bila akun utama belum punya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: utama } = await siapkanPengguna(t, "Alfian", {
      email: "alfian@pindai.test",
      role: "peminjam",
    });
    const { userId: duplikat } = await buatPengguna(t, "Alifan", { role: "peminjam" });
    await buatProfil(t, duplikat, {
      namaLengkap: "ALIFAN",
      nik: "3174010101900019",
      nomorWhatsApp: "6281234567890",
    });

    const hasil = await admin.mutation(api.duplikatNasabah.gabungNasabah, {
      utamaId: utama,
      sumberIds: [duplikat],
    });
    expect(hasil.profilDipindah).toBe(1);

    const profil = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
    expect(profil).toHaveLength(1);
    expect(profil[0].userId).toBe(utama);
    expect(profil[0].nik).toBe("3174010101900019");
  });

  it("menolak akun yang juga tercatat sebagai penyedia dana", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: utama } = await siapkanPengguna(t, "Alfian", {
      email: "alfian@pindai.test",
      role: "peminjam",
    });
    const { userId: duplikat } = await siapkanPengguna(t, "Alifan", {
      email: "alifan@pindai.test",
      role: "peminjam",
    });
    // Duplikat punya setoran dana → berperan sebagai penyedia dana.
    await t.run((ctx) =>
      ctx.db.insert("deposits", {
        danaId: duplikat,
        jumlah: 1_000_000,
        referensiTransfer: "TRF-1",
        status: "terverifikasi",
        nomorReferensi: "DEP-1",
      }),
    );

    await expect(
      admin.mutation(api.duplikatNasabah.gabungNasabah, {
        utamaId: utama,
        sumberIds: [duplikat],
      }),
    ).rejects.toThrow(/penyedia dana/i);

    const sisa = await t.run((ctx) => ctx.db.get(duplikat));
    expect(sisa).not.toBeNull();
  });

  it("melindungi akun admin dan menolak pemanggil non-admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: nasabah } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: peminjam } = await siapkanPengguna(t, "eko", {
      email: "eko@pindai.test",
      role: "peminjam",
    });

    await expect(
      admin.mutation(api.duplikatNasabah.gabungNasabah, {
        utamaId: adminId,
        sumberIds: [nasabah],
      }),
    ).rejects.toThrow(/admin/i);

    await expect(
      peminjam.mutation(api.duplikatNasabah.gabungNasabah, {
        utamaId: nasabah,
        sumberIds: [adminId],
      }),
    ).rejects.toThrow(/admin/i);
  });
});
