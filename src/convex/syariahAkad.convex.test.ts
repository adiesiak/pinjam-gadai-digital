/**
 * Tes modul akad syariah.
 *
 * Dua hal yang dijaga:
 *  1. Pencatatan tetap TERTUTUP selama gerbang pembayaran belum dibuka — sama
 *     dengan seluruh mutation uang lain. Tidak ada baris akad atau jurnal yang
 *     boleh terbentuk dari percobaan yang ditolak.
 *  2. Portofolio hanya mengirim akad atas nama pembaca, dengan angka snapshot
 *     dan tanpa field internal.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";

type Tx = KonteksUji;

type SeedAkad = {
  pendanaId: Awaited<ReturnType<typeof siapkanPengguna>>["userId"];
  dibuatOleh: Awaited<ReturnType<typeof siapkanPengguna>>["userId"];
  jenis: "murabahah" | "rahn" | "qardh";
  nomorReferensi: string;
  peminjamNama?: string;
  pokok: number;
  nisbahPendana: number;
  nisbahPlatform: number;
  status?: "aktif" | "selesai" | "dibatalkan";
  jatuhTempoPada: number;
};

/** Tanam satu akad langsung ke tabel — jalur pencatatan masih ditutup gerbang. */
async function seedAkad(t: Tx, data: SeedAkad) {
  const nisbahPendana = data.nisbahPendana;
  return t.run((ctx) =>
    ctx.db.insert("akadSyariah", {
      jenis: data.jenis,
      nomorReferensi: data.nomorReferensi,
      pendanaId: data.pendanaId,
      peminjamNama: data.peminjamNama ?? "Rina Wati",
      pokok: data.pokok,
      tenorHari: 30,
      totalKewajiban: data.pokok + nisbahPendana + data.nisbahPlatform,
      pendanaTerima: data.pokok + nisbahPendana,
      nisbahPendana,
      nisbahPlatform: data.nisbahPlatform,
      marginTotal: nisbahPendana + data.nisbahPlatform,
      tiketDoorprize: Math.floor(data.pokok / 1_000_000),
      status: data.status ?? "aktif",
      jatuhTempoPada: data.jatuhTempoPada,
      dibuatPada: Date.now(),
      dibuatOleh: data.dibuatOleh,
    }),
  );
}

describe("akad syariah — pencatatan", () => {
  it("menolak pencatatan dari akun bukan admin sebelum menyentuh data", async () => {
    const t = convexTest(schema, modules);
    const { sesi: dana, userId: danaId } = await siapkanPengguna(
      t,
      "Dana Syariah",
      { email: "dana-syariah@pindai.test", role: "dana" },
    );
    const { sesi: admin } = await siapkanPengguna(t, "Admin Syariah", {
      email: "admin-syariah@pindai.test",
      role: "admin",
    });

    await expect(
      dana.mutation(api.syariahAkad.catatAkadSyariah, {
        jenis: "qardh",
        pendanaId: danaId,
        peminjamNama: "Rina Wati",
        pokok: 1_000_000,
      }),
    ).rejects.toThrow("Akses khusus Super Admin.");

    // Admin lolos kewenangan, lalu ditahan gerbang pembayaran yang sama dengan
    // seluruh alur dana lain.
    await expect(
      admin.mutation(api.syariahAkad.catatAkadSyariah, {
        jenis: "qardh",
        pendanaId: danaId,
        peminjamNama: "Rina Wati",
        pokok: 1_000_000,
      }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");

    const isi = await t.run(async (ctx) => ({
      akad: await ctx.db.query("akadSyariah").collect(),
      ledger: await ctx.db.query("ledger_entries").collect(),
      tiket: await ctx.db.query("doorprizeTiket").collect(),
    }));
    expect(isi.akad).toHaveLength(0);
    expect(isi.ledger).toHaveLength(0);
    expect(isi.tiket).toHaveLength(0);
  });

  it("menahan pelunasan dan pembatalan akad selama gerbang pembayaran tertutup", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(
      t,
      "Admin Syariah 2",
      { email: "admin-syariah-2@pindai.test", role: "admin" },
    );
    const { userId: danaId } = await siapkanPengguna(t, "Dana Syariah 2", {
      email: "dana-syariah-2@pindai.test",
      role: "dana",
    });
    const akadId = await seedAkad(t, {
      pendanaId: danaId,
      dibuatOleh: adminId,
      jenis: "murabahah",
      nomorReferensi: "SYR-UJI-1",
      pokok: 1_000_000,
      nisbahPendana: 127_500,
      nisbahPlatform: 22_500,
      jatuhTempoPada: Date.now() + 30 * 86_400_000,
    });

    await expect(
      admin.mutation(api.syariahAkad.selesaikanAkadSyariah, { akadId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      admin.mutation(api.syariahAkad.batalkanAkadSyariah, {
        akadId,
        alasan: "Akad batal di luar sistem.",
      }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");

    const akad = await t.run((ctx) => ctx.db.get(akadId));
    expect(akad?.status).toBe("aktif");
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("ledger_entries").collect()).length,
      ),
    ).toBe(0);
  });
});

describe("akad syariah — portofolio", () => {
  it("hanya mengirim akad atas nama pendana, dengan ringkasan snapshot", async () => {
    const t = convexTest(schema, modules);
    const { userId: adminId } = await siapkanPengguna(t, "Admin Portofolio", {
      email: "admin-portofolio@pindai.test",
      role: "admin",
    });
    const { sesi: robert, userId: robertId } = await siapkanPengguna(
      t,
      "Robert",
      { email: "robert-syariah@pindai.test", role: "dana" },
    );
    const { userId: asepId } = await siapkanPengguna(t, "Asep", {
      email: "asep-syariah@pindai.test",
      role: "dana",
    });

    const sekarang = Date.now();
    const dekat = sekarang + 5 * 86_400_000;
    const jauh = sekarang + 40 * 86_400_000;

    await seedAkad(t, {
      pendanaId: robertId,
      dibuatOleh: adminId,
      jenis: "murabahah",
      nomorReferensi: "SYR-ROBERT-1",
      pokok: 1_000_000,
      nisbahPendana: 127_500,
      nisbahPlatform: 22_500,
      jatuhTempoPada: dekat,
    });
    await seedAkad(t, {
      pendanaId: robertId,
      dibuatOleh: adminId,
      jenis: "rahn",
      nomorReferensi: "SYR-ROBERT-2",
      pokok: 2_000_000,
      nisbahPendana: 68_000,
      nisbahPlatform: 12_000,
      jatuhTempoPada: jauh,
    });
    await seedAkad(t, {
      pendanaId: robertId,
      dibuatOleh: adminId,
      jenis: "qardh",
      nomorReferensi: "SYR-ROBERT-BATAL",
      pokok: 3_000_000,
      nisbahPendana: 0,
      nisbahPlatform: 0,
      status: "dibatalkan",
      jatuhTempoPada: dekat,
    });
    await seedAkad(t, {
      pendanaId: asepId,
      dibuatOleh: adminId,
      jenis: "qardh",
      nomorReferensi: "SYR-ASEP-1",
      pokok: 5_000_000,
      nisbahPendana: 0,
      nisbahPlatform: 0,
      jatuhTempoPada: dekat,
    });

    const milikRobert = await robert.query(api.syariahAkad.portofolioSaya, {});
    expect(milikRobert.baris.map((b) => b.nomorReferensi).sort()).toEqual([
      "SYR-ROBERT-1",
      "SYR-ROBERT-2",
      "SYR-ROBERT-BATAL",
    ]);
    // Akad pendana lain tidak pernah ikut.
    expect(
      milikRobert.baris.some((b) => b.nomorReferensi === "SYR-ASEP-1"),
    ).toBe(false);
    // Ringkasan hanya menghitung akad aktif + selesai, bukan yang dibatalkan.
    expect(milikRobert.ringkasan).toEqual({
      jumlahAktif: 2,
      jumlahSelesai: 0,
      totalPokok: 3_000_000,
      totalNisbah: 195_500,
      proyeksiReturnTerdekat: dekat,
    });
    expect(milikRobert.baris[0]).not.toHaveProperty("dibuatOleh");
    expect(milikRobert.baris[0]).not.toHaveProperty("catatan");
  });

  it("menolak pembaca yang bukan penyedia dana atau admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "Peminjam Biasa", {
      email: "peminjam-syariah@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.query(api.syariahAkad.portofolioSaya, {}),
    ).rejects.toThrow("Portofolio syariah hanya untuk akun penyedia dana.");
  });

  it("admin membaca seluruh akad, tetap lewat whitelist yang sama", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(
      t,
      "Admin Semua Akad",
      { email: "admin-semua-akad@pindai.test", role: "admin" },
    );
    const { userId: danaId } = await siapkanPengguna(t, "Dana Satu", {
      email: "dana-satu-syariah@pindai.test",
      role: "dana",
    });
    await seedAkad(t, {
      pendanaId: danaId,
      dibuatOleh: adminId,
      jenis: "qardh",
      nomorReferensi: "SYR-ADMIN-1",
      pokok: 4_000_000,
      nisbahPendana: 0,
      nisbahPlatform: 0,
      jatuhTempoPada: Date.now() + 30 * 86_400_000,
    });

    const semua = await admin.query(api.syariahAkad.portofolioSaya, {});
    expect(semua.baris).toHaveLength(1);
    expect(semua.baris[0].pendanaNama).toBe("Dana Satu");
    expect(semua.baris[0].nomorReferensi).toBe("SYR-ADMIN-1");
  });
});

describe("akad syariah — proyeksi ringkasan", () => {
  it("hanya menjumlahkan akad berjalan milik pendana itu", async () => {
    const t = convexTest(schema, modules);
    const { userId: adminId } = await siapkanPengguna(t, "Admin Proyeksi", {
      email: "admin-proyeksi@pindai.test",
      role: "admin",
    });
    const { sesi: robert, userId: robertId } = await siapkanPengguna(
      t,
      "Robert Proyeksi",
      { email: "robert-proyeksi@pindai.test", role: "dana" },
    );
    const { userId: asepId } = await siapkanPengguna(t, "Asep Proyeksi", {
      email: "asep-proyeksi@pindai.test",
      role: "dana",
    });
    const dekat = Date.now() + 10 * 86_400_000;

    await seedAkad(t, {
      pendanaId: robertId,
      dibuatOleh: adminId,
      jenis: "murabahah",
      nomorReferensi: "SYR-PROY-1",
      pokok: 1_000_000,
      nisbahPendana: 127_500,
      nisbahPlatform: 22_500,
      jatuhTempoPada: dekat,
    });
    await seedAkad(t, {
      pendanaId: robertId,
      dibuatOleh: adminId,
      jenis: "rahn",
      nomorReferensi: "SYR-PROY-SELESAI",
      pokok: 2_000_000,
      nisbahPendana: 68_000,
      nisbahPlatform: 12_000,
      status: "selesai",
      jatuhTempoPada: dekat,
    });
    await seedAkad(t, {
      pendanaId: robertId,
      dibuatOleh: adminId,
      jenis: "qardh",
      nomorReferensi: "SYR-PROY-BATAL",
      pokok: 3_000_000,
      nisbahPendana: 0,
      nisbahPlatform: 0,
      status: "dibatalkan",
      jatuhTempoPada: dekat,
    });
    await seedAkad(t, {
      pendanaId: asepId,
      dibuatOleh: adminId,
      jenis: "murabahah",
      nomorReferensi: "SYR-PROY-ASEP",
      pokok: 5_000_000,
      nisbahPendana: 90_000,
      nisbahPlatform: 10_000,
      jatuhTempoPada: dekat,
    });

    // Snapshot akad selesai dan batal tidak ikut diproyeksikan lagi.
    expect(await robert.query(api.syariahAkad.proyeksiPendanaSaya, {})).toEqual({
      pokokAktif: 1_000_000,
      nisbahAktif: 127_500,
    });
  });

  it("mengembalikan null, bukan galat, untuk peran tanpa portofolio syariah", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "Peminjam Proyeksi", {
      email: "peminjam-proyeksi@pindai.test",
      role: "peminjam",
    });
    expect(
      await peminjam.query(api.syariahAkad.proyeksiPendanaSaya, {}),
    ).toBeNull();
  });
});
