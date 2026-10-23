/**
 * Tes pengajuan akad syariah.
 *
 * Yang dijaga:
 *  - pengajuan hanya dilayani untuk akun ber-KYC VERIFIED dan bukan admin;
 *  - angka akad dihitung mesin `lib/syariah/akad`, bukan dari klien;
 *  - akad aktif DAN pengajuan yang sudah disetujui menahan plafon yang sama
 *    dengan pinjaman konvensional, tanpa menghitung akadnya dua kali;
 *  - satu akun hanya punya satu pengajuan yang menunggu keputusan;
 *  - admin bisa menyetujui dengan angka final atau menolak dengan alasan.
 *
 * Tidak ada uang yang berpindah di modul ini: persetujuan tidak boleh membuat
 * baris `akadSyariah`, jurnal, atau tiket. Pencatatan akad tetap tertutup
 * gerbang pembayaran sampai integrasinya dibuka.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { SYSTEM_SLOT } from "./system";
import { modules } from "./test.setup";
import {
  seedKycTerverifikasi,
  siapkanPengguna,
  type KonteksUji,
} from "./test.helpers";

const HARI_MS = 86_400_000;

async function siapkanPeminjam(t: KonteksUji, nama: string, email: string) {
  const hasil = await siapkanPengguna(t, nama, { email, role: "peminjam" });
  await seedKycTerverifikasi(t, hasil.userId);
  return hasil;
}

function ajukan(
  sesi: Awaited<ReturnType<typeof siapkanPeminjam>>["sesi"],
  args: {
    jenis?: "murabahah" | "rahn" | "qardh";
    pokok?: number;
    tenorHari?: number;
    tujuan?: string;
    namaBarang?: string;
    nilaiTaksiran?: number;
    katalogId?: string;
    nomorTujuan?: string;
  } = {},
) {
  return sesi.mutation(api.syariahPengajuan.ajukan, {
    jenis: args.jenis ?? "murabahah",
    pokok: args.pokok ?? 300_000,
    tenorHari: args.tenorHari ?? 30,
    tujuan: args.tujuan ?? "Membeli mesin jahit untuk usaha",
    namaBarang: args.namaBarang ?? "Mesin jahit",
    ...(args.nilaiTaksiran === undefined ? {} : { nilaiTaksiran: args.nilaiTaksiran }),
    ...(args.katalogId === undefined ? {} : { katalogId: args.katalogId }),
    ...(args.nomorTujuan === undefined ? {} : { nomorTujuan: args.nomorTujuan }),
  });
}

describe("pengajuan syariah — pengiriman", () => {
  it("menolak akun tanpa KYC sebelum menyimpan apa pun", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPengguna(t, "Belum KYC", {
      email: "belum-kyc-syariah@pindai.test",
      role: "peminjam",
    });

    await expect(ajukan(sesi)).rejects.toThrow("KYC diperlukan");
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("pengajuanSyariah").collect()).length,
      ),
    ).toBe(0);
  });

  it("menyimpan Murabahah dengan margin bawaan 20% dan status menunggu", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPeminjam(
      t,
      "Rani Murabahah",
      "rani-murabahah@pindai.test",
    );

    const hasil = await ajukan(sesi);
    const row = await t.run((ctx) => ctx.db.get(hasil.id));

    expect(row?.status).toBe("diajukan");
    expect(row?.jenis).toBe("murabahah");
    expect(row?.pokok).toBe(300_000);
    expect(row?.marginPersen).toBe(20);
    expect(row?.marginTotal).toBe(60_000);
    expect(row?.hargaJual).toBe(360_000);
    expect(row?.totalKewajiban).toBe(360_000);
    expect(row?.nisbahPendana).toBe(55_200);
    expect(row?.nisbahPlatform).toBe(4_800);
    expect(row?.namaPeminjam).toBe("RANI PEMINJAM");
    expect(row?.userId).toBe(userId);
  });

  it("memakai margin dari konfigurasi global dan membekukannya di pengajuan", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPeminjam(
      t,
      "Rani Margin Global",
      "rani-margin-global@pindai.test",
    );

    await t.run((ctx) =>
      ctx.db.insert("systemConfig", {
        slot: SYSTEM_SLOT,
        persenMarginSyariah: 17,
        diperbaruiPada: Date.now(),
      }),
    );

    const hasil = await ajukan(sesi);
    const row = await t.run((ctx) => ctx.db.get(hasil.id));
    expect(row?.marginPersen).toBe(17);
    expect(row?.marginTotal).toBe(51_000);
    expect(row?.hargaJual).toBe(351_000);

    // Angka yang sudah diajukan tidak bergerak saat konfigurasi diubah.
    await t.run(async (ctx) => {
      const baris = await ctx.db.query("systemConfig").first();
      if (baris !== null) {
        await ctx.db.patch(baris._id, { persenMarginSyariah: 20 });
      }
    });
    const tetap = await t.run((ctx) => ctx.db.get(hasil.id));
    expect(tetap?.marginPersen).toBe(17);
    expect(tetap?.hargaJual).toBe(351_000);
  });

  it("menolak pengajuan kedua selama yang pertama menunggu", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPeminjam(
      t,
      "Rani Ganda",
      "rani-ganda-syariah@pindai.test",
    );
    await ajukan(sesi);
    await expect(ajukan(sesi, { jenis: "qardh", pokok: 200_000 })).rejects.toThrow(
      "Masih ada pengajuan syariah yang menunggu keputusan",
    );
  });

  it("Rahn wajib bertaksiran dan pokok tidak boleh melebihi taksiran", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPeminjam(
      t,
      "Rani Rahn",
      "rani-rahn-syariah@pindai.test",
    );

    await expect(ajukan(sesi, { jenis: "rahn", namaBarang: "Motor" })).rejects.toThrow(
      "Nilai taksiran barang jaminan wajib diisi",
    );
    await expect(
      ajukan(sesi, {
        jenis: "rahn",
        namaBarang: "Motor",
        pokok: 400_000,
        nilaiTaksiran: 300_000,
      }),
    ).rejects.toThrow("Pokok gadai tidak boleh melebihi nilai taksiran");
  });

  it("akad aktif menahan plafon yang sama dengan pinjaman", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPeminjam(
      t,
      "Rani Plafon",
      "rani-plafon-syariah@pindai.test",
    );
    const { userId: adminId } = await siapkanPengguna(t, "Admin Plafon Syariah", {
      email: "admin-plafon-syariah@pindai.test",
      role: "admin",
    });

    await t.run((ctx) =>
      ctx.db.insert("akadSyariah", {
        jenis: "qardh",
        nomorReferensi: "SYR-AKTIF-1",
        pendanaId: adminId,
        peminjamId: userId,
        peminjamNama: "RANI PLAFON",
        pokok: 300_000,
        tenorHari: 30,
        totalKewajiban: 300_000,
        pendanaTerima: 300_000,
        nisbahPendana: 0,
        nisbahPlatform: 0,
        marginTotal: 0,
        tiketDoorprize: 0,
        status: "aktif",
        jatuhTempoPada: Date.now() + 30 * HARI_MS,
        dibuatPada: Date.now(),
        dibuatOleh: adminId,
      }),
    );

    // Plafon awal Rp500.000, Rp300.000 sudah tertahan akad → sisa Rp200.000.
    await expect(ajukan(sesi, { jenis: "qardh", pokok: 250_000 })).rejects.toThrow(
      "sisa yang dapat diajukan Rp 200.000",
    );
    await expect(
      ajukan(sesi, { jenis: "qardh", pokok: 200_000, tujuan: "Modal usaha kecil" }),
    ).resolves.toMatchObject({ nomorReferensi: expect.stringContaining("PSY-") });
  });

  it("pengajuan yang disetujui menahan plafon, bukan hanya akad aktif", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPeminjam(
      t,
      "Rani Disetujui",
      "rani-disetujui-syariah@pindai.test",
    );
    const admin = await siapkanPengguna(t, "Admin Disetujui Syariah", {
      email: "admin-disetujui-syariah@pindai.test",
      role: "admin",
    });

    const { id } = await ajukan(sesi, { jenis: "qardh", pokok: 300_000 });
    await admin.sesi.mutation(api.syariahPengajuan.putuskan, {
      id,
      keputusan: "setujui",
    });

    // Plafon awal Rp500.000. Rp300.000 sudah DISETUJUI, jadi hanya Rp200.000
    // yang boleh diajukan lagi sebelum akadnya dicatat.
    await expect(ajukan(sesi, { jenis: "qardh", pokok: 250_000 })).rejects.toThrow(
      "sisa yang dapat diajukan Rp 200.000",
    );
    await expect(
      ajukan(sesi, { jenis: "qardh", pokok: 200_000, tujuan: "Modal usaha kecil" }),
    ).resolves.toMatchObject({ nomorReferensi: expect.stringContaining("PSY-") });
  });

  it("akad yang sudah tercatat tidak dihitung dua kali dengan persetujuannya", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPeminjam(
      t,
      "Rani Akad Ganda",
      "rani-akad-ganda-syariah@pindai.test",
    );
    const admin = await siapkanPengguna(t, "Admin Akad Ganda Syariah", {
      email: "admin-akad-ganda-syariah@pindai.test",
      role: "admin",
    });

    const { id } = await ajukan(sesi, { jenis: "qardh", pokok: 300_000 });
    await admin.sesi.mutation(api.syariahPengajuan.putuskan, {
      id,
      keputusan: "setujui",
    });

    // Setelah akadnya tercatat, pengajuan tidak lagi menahan plafon sendiri;
    // yang menahan adalah baris akad. Tanpa aturan ini nominalnya terhitung
    // dua kali dan sisa plafon menjadi nol.
    await t.run(async (ctx) => {
      const akadId = await ctx.db.insert("akadSyariah", {
        jenis: "qardh",
        nomorReferensi: "SYR-GANDA-1",
        pendanaId: admin.userId,
        peminjamId: userId,
        peminjamNama: "RANI AKAD GANDA",
        pengajuanId: id,
        pokok: 300_000,
        tenorHari: 30,
        totalKewajiban: 300_000,
        pendanaTerima: 300_000,
        nisbahPendana: 0,
        nisbahPlatform: 0,
        marginTotal: 0,
        tiketDoorprize: 0,
        status: "aktif",
        jatuhTempoPada: Date.now() + 30 * HARI_MS,
        dibuatPada: Date.now(),
        dibuatOleh: admin.userId,
      });
      await ctx.db.patch(id, { akadNomor: "SYR-GANDA-1" });
      return akadId;
    });

    // Sisa plafon tetap Rp200.000, bukan nol.
    await expect(ajukan(sesi, { jenis: "qardh", pokok: 250_000 })).rejects.toThrow(
      "sisa yang dapat diajukan Rp 200.000",
    );
    await expect(
      ajukan(sesi, { jenis: "qardh", pokok: 200_000, tujuan: "Modal usaha kecil" }),
    ).resolves.toMatchObject({ nomorReferensi: expect.stringContaining("PSY-") });
  });
});

describe("pengajuan syariah — katalog Murabahah", () => {
  it("harga dan nama barang datang dari katalog, bukan dari kiriman klien", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPeminjam(
      t,
      "Rani Katalog",
      "rani-katalog-syariah@pindai.test",
    );

    const hasil = await ajukan(sesi, {
      pokok: 100_000,
      namaBarang: "Barang karangan peminjam",
      katalogId: "el-setrika-uap",
      tujuan: "Membeli setrika untuk usaha laundry",
    });
    const row = await t.run((ctx) => ctx.db.get(hasil.id));

    expect(row?.pokok).toBe(350_000);
    expect(row?.namaBarang).toBe("Setrika uap 1.800 W");
    expect(row?.katalogId).toBe("el-setrika-uap");
    expect(row?.jenisBarang).toBe("fisik");
    expect(row?.nomorTujuan).toBeUndefined();
    expect(row?.marginTotal).toBe(70_000);
    expect(row?.totalKewajiban).toBe(420_000);
  });

  it("pulsa/PPOB wajib nomor tujuan dan hanya angkanya yang disimpan", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPeminjam(
      t,
      "Rani Pulsa",
      "rani-pulsa-syariah@pindai.test",
    );

    await expect(
      ajukan(sesi, { katalogId: "pl-pulsa-100", tujuan: "Pulsa untuk usaha" }),
    ).rejects.toThrow("Nomor tujuan pulsa/PPOB wajib diisi 6-20 angka");

    const hasil = await ajukan(sesi, {
      katalogId: "pl-pulsa-100",
      nomorTujuan: "0812-3456 7890",
      pokok: 300_000,
    });
    const row = await t.run((ctx) => ctx.db.get(hasil.id));

    expect(row?.pokok).toBe(100_000);
    expect(row?.jenisBarang).toBe("digital");
    expect(row?.nomorTujuan).toBe("081234567890");
  });

  it("barang katalog hanya untuk Murabahah, dan id asing ditolak", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPeminjam(
      t,
      "Rani Katalog Salah",
      "rani-katalog-salah@pindai.test",
    );

    await expect(
      ajukan(sesi, {
        jenis: "rahn",
        nilaiTaksiran: 2_000_000,
        katalogId: "el-setrika-uap",
      }),
    ).rejects.toThrow("Katalog barang hanya berlaku untuk akad Murabahah");

    await expect(ajukan(sesi, { katalogId: "tidak-ada" })).rejects.toThrow(
      "Barang katalog tidak ditemukan",
    );
  });

  it("harga katalog terbaru berlaku untuk pengajuan baru, pengajuan lama tetap", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Ubah Harga", {
      email: "admin-ubah-harga-syariah@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "Rani Harga",
      "rani-harga-katalog@pindai.test",
    );
    // Persetujuan pertama (Rp350.000) menahan plafon, jadi naikkan limit uji
    // supaya tes ini tetap menguji snapshot harga katalog, bukan plafon.
    await admin.mutation(api.admin.setPlafonPeminjam, {
      userId,
      plafon: 2_000_000,
      alasan: "uji snapshot harga katalog",
    });
    const lama = await ajukan(peminjam, {
      katalogId: "el-setrika-uap",
      tujuan: "Membeli setrika untuk usaha laundry",
    });

    // Harga mitra naik sesudah pengajuan dikirim.
    await admin.mutation(api.katalog.simpanBarang, {
      kode: "el-setrika-uap",
      nama: "Setrika uap 1.800 W",
      kategori: "Elektronik",
      jenisBarang: "fisik",
      harga: 400_000,
      aktif: true,
    });

    await admin.mutation(api.syariahPengajuan.putuskan, {
      id: lama.id,
      keputusan: "setujui",
    });
    const lamaSetelah = await t.run((ctx) => ctx.db.get(lama.id));
    expect(lamaSetelah?.pokok).toBe(350_000);

    const baru = await ajukan(peminjam, {
      katalogId: "el-setrika-uap",
      tujuan: "Membeli setrika untuk usaha laundry",
    });
    const baruRow = await t.run((ctx) => ctx.db.get(baru.id));
    expect(baruRow?.pokok).toBe(400_000);
  });

  it("keputusan admin tidak mengubah harga barang katalog", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Katalog Syariah", {
      email: "admin-katalog-syariah@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "Rani Setrika",
      "rani-setrika-katalog@pindai.test",
    );
    const { id } = await ajukan(peminjam, {
      katalogId: "el-setrika-uap",
      tujuan: "Membeli setrika untuk usaha laundry",
    });

    await admin.mutation(api.syariahPengajuan.putuskan, {
      id,
      keputusan: "setujui",
      pokok: 100_000,
      marginPersen: 20,
    });
    const row = await t.run((ctx) => ctx.db.get(id));

    expect(row?.pokok).toBe(350_000);
    expect(row?.totalKewajiban).toBe(420_000);
  });
});

describe("pengajuan syariah — penyerahan barang", () => {
  async function siapkan(t: KonteksUji) {
    const { sesi: admin } = await siapkanPengguna(t, "Admin Serah Syariah", {
      email: "admin-serah-syariah@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "Rani Serah",
      "rani-serah-syariah@pindai.test",
    );
    const { id } = await ajukan(peminjam, {
      katalogId: "el-setrika-uap",
      tujuan: "Membeli setrika untuk usaha laundry",
    });
    return { admin, peminjam, id };
  }

  it("menolak penyerahan sebelum pengajuan disetujui", async () => {
    const t = convexTest(schema, modules);
    const { admin, id } = await siapkan(t);

    await expect(
      admin.mutation(api.syariahPengajuan.tandaiPenyerahan, {
        id,
        referensi: "RESI-001",
      }),
    ).rejects.toThrow("sudah disetujui");
  });

  it("admin mencatat penyerahan dan peminjam melihat referensinya", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, id } = await siapkan(t);

    await admin.mutation(api.syariahPengajuan.putuskan, {
      id,
      keputusan: "setujui",
    });
    const sebelum = await peminjam.query(api.syariahPengajuan.daftarSaya, {});
    expect(sebelum.find((row) => row._id === id)?.statusPenyerahan).toBe(
      "belum",
    );

    await admin.mutation(api.syariahPengajuan.tandaiPenyerahan, {
      id,
      referensi: "  RESI-JNE-123  ",
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.statusPenyerahan).toBe("terkirim");
    expect(row?.referensiPenyerahan).toBe("RESI-JNE-123");
    expect(row?.diserahkanPada).toBeTypeOf("number");

    const sesudah = await peminjam.query(api.syariahPengajuan.daftarSaya, {});
    const saya = sesudah.find((baris) => baris._id === id);
    expect(saya?.statusPenyerahan).toBe("terkirim");
    expect(saya?.referensiPenyerahan).toBe("RESI-JNE-123");

    await expect(
      admin.mutation(api.syariahPengajuan.tandaiPenyerahan, {
        id,
        referensi: "RESI-LAIN",
      }),
    ).rejects.toThrow("sudah ditandai terkirim");
  });
});

describe("pengajuan syariah — keputusan admin", () => {
  it("menyetujui dengan margin final tanpa membuat akad atau jurnal", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Syariah Baru", {
      email: "admin-syariah-baru@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "Rani Setuju",
      "rani-setuju-syariah@pindai.test",
    );
    const { id } = await ajukan(peminjam);

    await admin.mutation(api.syariahPengajuan.putuskan, {
      id,
      keputusan: "setujui",
      marginPersen: 20,
    });

    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.status).toBe("disetujui");
    expect(row?.marginPersen).toBe(20);
    expect(row?.marginTotal).toBe(60_000);
    expect(row?.totalKewajiban).toBe(360_000);
    expect(row?.nisbahPendana).toBe(55_200);
    expect(row?.nisbahPlatform).toBe(4_800);
    expect(row?.diputuskanPada).toBeTypeOf("number");

    const isi = await t.run(async (ctx) => ({
      akad: await ctx.db.query("akadSyariah").collect(),
      ledger: await ctx.db.query("ledger_entries").collect(),
      tiket: await ctx.db.query("doorprizeTiket").collect(),
    }));
    expect(isi.akad).toHaveLength(0);
    expect(isi.ledger).toHaveLength(0);
    expect(isi.tiket).toHaveLength(0);
  });

  it("menolak pengajuan dengan alasan, dan peminjam tidak bisa memutuskan sendiri", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Tolak Syariah", {
      email: "admin-tolak-syariah@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "Rani Tolak",
      "rani-tolak-syariah@pindai.test",
    );
    const { id } = await ajukan(peminjam);

    await expect(
      peminjam.mutation(api.syariahPengajuan.putuskan, {
        id,
        keputusan: "setujui",
      }),
    ).rejects.toThrow("Akses khusus Super Admin.");

    await expect(
      admin.mutation(api.syariahPengajuan.putuskan, {
        id,
        keputusan: "tolak",
        alasanTolak: "no",
      }),
    ).rejects.toThrow("Alasan penolakan minimal 5 karakter.");

    await admin.mutation(api.syariahPengajuan.putuskan, {
      id,
      keputusan: "tolak",
      alasanTolak: "Barang jaminan belum dapat ditaksir.",
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.status).toBe("ditolak");
    expect(row?.alasanTolak).toBe("Barang jaminan belum dapat ditaksir.");
  });

  it("peminjam bisa menarik pengajuan selama belum diputuskan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "Rani Tarik",
      "rani-tarik-syariah@pindai.test",
    );
    const { id } = await ajukan(peminjam);

    await peminjam.mutation(api.syariahPengajuan.batalkan, { id });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.status).toBe("dibatalkan");

    await expect(
      peminjam.mutation(api.syariahPengajuan.batalkan, { id }),
    ).rejects.toThrow("Hanya pengajuan yang belum diputuskan");
  });

  it("menghitung pengajuan menunggu untuk lencana menu, lalu turun setelah diputuskan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Lencana Syariah", {
      email: "admin-lencana-syariah@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "Rani Lencana",
      "rani-lencana-syariah@pindai.test",
    );
    const { id } = await ajukan(peminjam);

    expect(await admin.query(api.syariahPengajuan.cacahMenunggu, {})).toBe(1);
    await expect(
      peminjam.query(api.syariahPengajuan.cacahMenunggu, {}),
    ).rejects.toThrow("Akses khusus Super Admin.");

    await admin.mutation(api.syariahPengajuan.putuskan, {
      id,
      keputusan: "setujui",
      marginPersen: 20,
    });
    expect(await admin.query(api.syariahPengajuan.cacahMenunggu, {})).toBe(0);
  });
});
