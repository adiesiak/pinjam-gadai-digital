/**
 * Test integrasi Convex — Plafon pinjaman per nasabah (convex-test + vitest).
 *
 * Membuktikan janji ke user: batas kredit tidak lagi ratusan juta. Default
 * platform Rp 1 juta, dan angka yang boleh disimpan admin maksimal Rp 10 juta
 * — ditegakkan di SERVER, bukan sekadar slider di UI. Admin juga bisa
 * menaikkan/menurunkan plafon per orang.
 *
 * Cakupan:
 *  1. Default global 1 juta; pinjaman tunai & kredit barang di atasnya ditolak
 *     dengan pesan yang menyebut plafon nasabah.
 *  2. Admin menaikkan plafon → pengajuan yang sama langsung dilayani.
 *  3. Nilai di luar rentang di-clamp (bukan ditolak) ke 100 ribu / 10 juta.
 *  4. `plafon: null` mengembalikan nasabah ke default global.
 *  5. Non-admin tidak boleh mengubah plafon siapa pun.
 *  6. Kredit barang mengukur POKOK DIBIAYAI, bukan harga barang.
 *  7. Default global di Pengaturan Sistem juga di-clamp, dan setiap
 *     perubahan tercatat di audit trail.
 *
 * Pinjaman tunai yang LOLOS butuh dokumen KYC di storage, sedangkan
 * `convexTest` belum mendukung syscall `storageGetMetadata` — jadi jalur sukses
 * dibuktikan lewat kredit barang (tanpa storage), sedangkan jalur penolakan
 * diuji memakai storage id KYC asli dari `t.run` (argumen wajibnya tetap sah).
 *
 * Menjalankan: bunx vitest run src/convex
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
}

/**
 * Pengajuan kredit barang. Pokok dibiayai = harga × (1 − DP/100), jadi harga
 * 9 juta DP 10% → pokok 8,1 juta; harga 12 juta DP 20% → pokok 9,6 juta.
 */
async function ajukanKredit(
  sesi: Sesi,
  hargaBarang: number,
  dpPersen: number,
) {
  return sesi.mutation(api.kredit.ajukanKreditBarang, {
    namaBarang: "Kulkas dua pintu",
    kategori: "Elektronik",
    merchant: "Tokopedia",
    hargaBarang,
    dpPersen,
    tenorBulan: 12,
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

describe("plafon pinjaman per nasabah", () => {
  it("default global Rp 1 juta dan pengajuan di atasnya ditolak server", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const kyc = await unggahKyc(t);
    await aktifkanLokasi(peminjam);

    expect(PLAFON_DEFAULT).toBe(1_000_000);
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);

    // Pinjaman tunai 5 juta: ditolak karena plafon Default, dengan pesan
    // yang menyebut angka plafon (bukan batas mesin).
    await expect(ajukanTunai(peminjam, kyc, 5_000_000)).rejects.toThrow(
      /Batas pinjaman Anda saat ini Rp 1\.000\.000/,
    );
    // Kredit barang: pokok dibiayai 8,1 juta (harga 9 juta, DP 10%).
    await expect(ajukanKredit(peminjam, 9_000_000, 10)).rejects.toThrow(
      /Batas pinjaman Anda saat ini Rp 1\.000\.000/,
    );
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

    // Pokok 8,1 juta kini di bawah plafon 8,2 juta → dilayani.
    await expect(ajukanKredit(peminjam, 9_000_000, 10)).resolves.toBeDefined();
    // Pokok 9,6 juta masih di atas plafon → ditolak dengan angka terbaru.
    await expect(ajukanKredit(peminjam, 12_000_000, 20)).rejects.toThrow(
      /Batas pinjaman Anda saat ini Rp 8\.200\.000/,
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
