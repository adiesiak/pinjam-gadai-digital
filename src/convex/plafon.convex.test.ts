/**
 * Tes kebijakan plafon tunai dan batas kredit barang (convex-test + vitest).
 *
 * Tunai mulai dari Rp1 juta; setelah pelunasan penuh pinjaman tunai pokok
 * minimal Rp1 juta, plafon otomatis menjadi Rp10 juta. Override admin tetap
 * didahulukan. Kredit barang memiliki batas pokok Rp10 juta sendiri dan tenor
 * pengajuan 1/3/6 bulan, tanpa mewarisi plafon tunai.
 *
 * Tes repayment menanam pinjaman didanai langsung ke DB agar tidak bergantung
 * pada storageGetMetadata yang belum didukung convexTest untuk pengajuan KYC.
 *
 * Menjalankan: bunx vitest run src/convex/plafon.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { PLAFON_BATAS, PLAFON_DEFAULT } from "../lib/plafon";
import { DEFAULT_CONFIG } from "../lib/system-config";

type Sesi = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
type Tx = ReturnType<typeof convexTest>;

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };

async function siapkanPengguna(
  t: Tx,
  subject: string,
  opts: { email: string; role: "peminjam" | "admin" },
): Promise<{ sesi: Sesi; userId: Id<"users"> }> {
  const userId = await t.mutation(async (ctx) => {
    return ctx.db.insert("users", {
      email: opts.email,
      name: subject,
      emailVerificationTime: Date.now(),
      role: opts.role,
    });
  });
  return { sesi: t.withIdentity({ subject: userId, name: subject }) as never, userId };
}

/** Titik Jakarta — gerbang lokasi wajib harus lolos sebelum plafon dicek. */
async function aktifkanLokasi(sesi: Sesi) {
  await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
}

/** Tiga dokumen KYC di storage — createLoanApplication mewajibkannya. */
async function unggahKyc(t: Tx) {
  return t.run(async (ctx) => ({
    ktp: await ctx.storage.store(new Blob(["ktp"])),
    selfie: await ctx.storage.store(new Blob(["selfie"])),
    slip: await ctx.storage.store(new Blob(["slip gaji"])),
  }));
}/**
 * Pengajuan kredit barang; DP 0% pada tenor 1/3/6 berarti harga = pokok
 * dibiayai. Tenor lama tetap dapat dibaca engine, tetapi tidak boleh diterbitkan.
 */

async function ajukanKredit(
  sesi: Sesi,
  hargaBarang: number,
  dpPersen: number,
  tenorBulan = 6,
) {
  return sesi.mutation(api.kredit.ajukanKreditBarang, {
    namaBarang: "Kulkas dua pintu",
    kategori: "Elektronik",
    merchant: "Tokopedia",
    hargaBarang,
    dpPersen,
    tenorBulan,
    marginPersenPerBulan: 3,
    namaLengkap: "Rani Peminjam",
    nik: "3201234567890003",
    nomorRekening: "1234567892",
    nomorWhatsApp: "628123456791",
  });
}

/** Pengajuan pinjaman tunai (skema bulanan 3 bulan). */
async function ajukanTunai(
  sesi: Sesi,
  kyc: Awaited<ReturnType<typeof unggahKyc>>,
  pokokPinjaman: number,
) {
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman,
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    nomorRekening: "1234567890",
    tenorHari: 30,
    tenorBulan: 3,
    nik: "3201234567890003",
    nomorWhatsApp: "628123456791",
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
    dokKtpId: kyc.ktp,
    dokSelfieKtpId: kyc.selfie,
    dokSlipGajiId: kyc.slip,
    lokasiAjukan: { ...TITIK, waktu: Date.now() },
  });
}

/** Seed pinjaman tunai didanai dan posisi Pendana untuk mengetes pelunasan. */
async function siapkanPinjamanTunaiDidanai(
  t: Tx,
  userId: Id<"users">,
  pokokPinjaman: number,
): Promise<Id<"loans">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const pendanaId = await ctx.db.insert("users", {
      email: `pendana-${pokokPinjaman}@pindai.test`,
      name: "Pendana seed",
      emailVerificationTime: now,
      role: "pendana",
    });
    await ctx.db.insert("lokasiStatus", {
      userId,
      lat: TITIK.lat,
      lng: TITIK.lng,
      akurasi: TITIK.akurasi,
      waktu: now,
      sumber: "web",
    });
    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman,
      tujuan: "Modal usaha kecil",
      namaLengkap: "Rani Peminjam",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: `PGD-SEED-${pokokPinjaman}`,
      tenorHari: 30,
      didanaiPada: now,
    });
    await ctx.db.insert("fundings", {
      loanId,
      pendanaId,
      jumlahAlokasi: pokokPinjaman,
      imbalHasil: Math.round(pokokPinjaman * 0.3),
      status: "dialokasikan",
      nomorReferensi: `FND-SEED-${pokokPinjaman}`,
    });
    return loanId;
  });
}

describe("plafon pinjaman per nasabah", () => {
  it("default tunai Rp1 juta; kredit barang memakai batas terpisah Rp10 juta", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const kyc = await unggahKyc(t);
    await aktifkanLokasi(peminjam);

    expect(PLAFON_DEFAULT).toBe(1_000_000);
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);

    // Tunai di atas plafon awal tetap ditolak di server.
    await expect(ajukanTunai(peminjam, kyc, 5_000_000)).rejects.toThrow(
      /Batas pinjaman Anda saat ini Rp 1\.000\.000/,
    );
    // Kredit barang tidak mewarisi plafon tunai: pokok Rp10 juta lolos.
    await expect(ajukanKredit(peminjam, 10_000_000, 0)).resolves.toBeDefined();
    await expect(ajukanKredit(peminjam, 10_000_001, 0)).rejects.toThrow(
      /Pokok dibiayai kredit barang maksimal Rp 10\.000\.000/,
    );
    await expect(ajukanKredit(peminjam, 2_000_000, 0, 7)).rejects.toThrow(
      /Tenor kredit barang baru harus 1 \/ 3 \/ 6 bulan/,
    );
    await expect(ajukanKredit(peminjam, 2_000_000, 0, 12)).rejects.toThrow(
      /Tenor kredit barang baru harus 1 \/ 3 \/ 6 bulan/,
    );
  });

  it("menaikkan plafon otomatis setelah pinjaman tunai Rp1 juta lunas penuh", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "lina", {
      email: "lina@pindai.test",
      role: "peminjam",
    });
    const loanId = await siapkanPinjamanTunaiDidanai(t, userId, 1_000_000);

    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
    const hasil = await peminjam.mutation(api.loans.repayLoan, { loanId });

    expect(hasil.totalDibayar).toBe(1_300_000);
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(10_000_000);
    const keadaan = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      loan: await ctx.db.get(loanId),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(keadaan.user?.plafonPinjamanNaikPada).toBeDefined();
    expect(keadaan.loan?.status).toBe("lunas");
    expect(keadaan.audit.some((row) => row.aksi === "plafon_naik_otomatis")).toBe(true);
  });

  it("pelunasan pinjaman di bawah Rp1 juta tidak menaikkan plafon", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "maya", {
      email: "maya@pindai.test",
      role: "peminjam",
    });
    const loanId = await siapkanPinjamanTunaiDidanai(t, userId, 999_999);

    await peminjam.mutation(api.loans.repayLoan, { loanId });

    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.plafonPinjamanNaikPada).toBeUndefined();
  });

  it("override admin tetap berlaku sesudah pelunasan, reset kembali ke otomatis Rp10 juta", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "nina", {
      email: "nina@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin-override", {
      email: "admin-override@pindai.test",
      role: "admin",
    });
    const loanId = await siapkanPinjamanTunaiDidanai(t, userId, 1_000_000);

    await admin.mutation(api.admin.setPlafonPeminjam, { userId, plafon: 4_000_000 });
    await peminjam.mutation(api.loans.repayLoan, { loanId });
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(4_000_000);

    const reset = await admin.mutation(api.admin.setPlafonPeminjam, { userId, plafon: null });
    expect(reset.plafonEfektif).toBe(10_000_000);
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(10_000_000);
  });

  it("admin menaikkan plafon → pengajuan yang sama dilayani", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "budi", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    await aktifkanLokasi(peminjam);

    const hasil = await admin.mutation(api.admin.setPlafonPeminjam, {
      userId,
      plafon: 8_200_000,
      alasan: "Riwayat pembayaran lancar, naikkan plafon",
    });
    expect(hasil.plafonEfektif).toBe(8_200_000);
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(8_200_000);

    // Kredit barang tetap tunduk pada batas tetapnya, bukan override tunai.
    await expect(ajukanKredit(peminjam, 10_000_000, 0)).resolves.toBeDefined();
    await expect(ajukanKredit(peminjam, 10_000_001, 0)).rejects.toThrow(
      /Pokok dibiayai kredit barang maksimal Rp 10\.000\.000/,
    );

    // Daftar admin ikut menyesuaikan: override per orang vs default global.
    const daftar = await admin.query(api.admin.daftarPlafonPeminjam, {});
    expect(daftar.default).toBe(PLAFON_DEFAULT);
    const baris = daftar.rows.find((r) => r.userId === userId);
    expect(baris?.plafonPribadi).toBe(8_200_000);
    expect(baris?.plafonEfektif).toBe(8_200_000);
  });

  it("nilai di luar rentang di-clamp ke 100 ribu / 10 juta", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "dina", {
      email: "dina@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    expect(PLAFON_BATAS.maks).toBe(10_000_000);
    expect(PLAFON_BATAS.min).toBe(100_000);

    const atas = await admin.mutation(api.admin.setPlafonPeminjam, {
      userId,
      plafon: 250_000_000,
    });
    expect(atas.plafonEfektif).toBe(PLAFON_BATAS.maks);

    const bawah = await admin.mutation(api.admin.setPlafonPeminjam, {
      userId,
      plafon: 1,
    });
    expect(bawah.plafonEfektif).toBe(PLAFON_BATAS.min);
  });

  it("plafon null mengembalikan nasabah ke default global", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "sari", {
      email: "sari@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const kyc = await unggahKyc(t);
    await aktifkanLokasi(peminjam);

    await admin.mutation(api.admin.setPlafonPeminjam, { userId, plafon: 5_000_000 });
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(5_000_000);

    await admin.mutation(api.admin.setPlafonPeminjam, { userId, plafon: null });
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
    await expect(ajukanTunai(peminjam, kyc, 5_000_001)).rejects.toThrow(
      /Batas pinjaman Anda saat ini Rp 1\.000\.000/,
    );
  });

  it("perubahan plafon masuk audit trail, dan hanya admin yang boleh", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "tomi", {
      email: "tomi@pindai.test",
      role: "peminjam",
    });
    const { userId: targetId } = await siapkanPengguna(t, "bayu", {
      email: "bayu@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    // Non-admin ditolak, dan target tidak tersentuh.
    await expect(
      peminjam.mutation(api.admin.setPlafonPeminjam, {
        userId: targetId,
        plafon: 9_000_000,
      }),
    ).rejects.toThrow(/admin/i);
    const tetap = await t.query(async (ctx) => {
      const u = await ctx.db.get(targetId);
      return (u as { plafonPinjaman?: number } | null)?.plafonPinjaman ?? null;
    });
    expect(tetap).toBeNull();

    // Admin berhasil → tercatat di audit trail, menyebut angka barunya.
    await admin.mutation(api.admin.setPlafonPeminjam, {
      userId,
      plafon: 3_000_000,
      alasan: "Test audit",
    });
    const jejak = await admin.query(api.system.getConfigAdmin, {});
    const entri = jejak.auditTerbaru.find((j) => j.aksi === "ubah_plafon");
    expect(entri).toBeDefined();
    expect(entri?.detail ?? "").toContain("3.000.000");
    expect(entri?.detail ?? "").toContain("Test audit");
  });

  it("default global di Pengaturan Sistem ikut ter-clamp", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    await admin.mutation(api.system.saveConfig, {
      ...DEFAULT_CONFIG,
      plafonPinjaman: 999_000_000,
    });
    const jejak = await admin.query(api.system.getConfigAdmin, {});
    expect(jejak.config.plafonPinjaman).toBe(PLAFON_BATAS.maks);
  });
});
