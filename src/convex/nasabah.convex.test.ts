/**
 * Tes INTEGRASI NASABAH ↔ KYC ↔ PLAFON ↔ PENGAJUAN.
 *
 * Menutup skenario yang diminta produk:
 *  - nasabah baru → KYC (VERIFIED) → membuat pengajuan, terhubung ke master;
 *  - nasabah VERIFIED → pengajuan kedua TANPA KYC ulang (satu baris KYC);
 *  - satu nasabah punya beberapa pengajuan;
 *  - plafon dihitung server: pinjaman aktif mengurangi tersedia, lunas memulihkan;
 *  - pengajuan ditolak server bila melebihi plafon TERSEDIA;
 *  - pengajuan lama tetap dapat dibuka;
 *  - nasabah/pendana tidak dapat membaca data nasabah lain / dokumen KYC;
 *  - migrasi data lama idempoten, tidak mengarang KYC, dapat dibatalkan.
 *
 * Menjalankan: bunx vitest run src/convex/nasabah.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { simpanBerkasUji, siapkanPengguna, type SesiUji } from "./test.helpers";
import { modules } from "./test.setup";
import { PLAFON_DEFAULT } from "../lib/plafon";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const TTD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";

type Tx = Parameters<typeof siapkanPengguna>[0];

async function aktifkanLokasi(sesi: SesiUji) {
  await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
}

/** Tiga berkas KYC uji (metadata gambar ditambal agar lolos gerbang server). */
async function unggahKyc(t: Tx) {
  return {
    ktp: await simpanBerkasUji(t, "ktp"),
    selfie: await simpanBerkasUji(t, "selfie"),
    slip: await simpanBerkasUji(t, "slip"),
  };
}

/** Ajukan pinjaman tunai 30 hari lewat jalur publik (server memvalidasi plafon). */
async function ajukan(
  t: Tx,
  sesi: SesiUji,
  pokokPinjaman: number,
  identitas: { nik: string; wa: string } = { nik: "3201234567890003", wa: "628123456791" },
) {
  const kyc = await unggahKyc(t);
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman,
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    tenorHari: 30,
    nik: identitas.nik,
    nomorWhatsApp: identitas.wa,
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
    dokKtpId: kyc.ktp,
    dokSelfieKtpId: kyc.selfie,
    dokSlipGajiId: kyc.slip,
    lokasiAjukan: { ...TITIK, waktu: Date.now() },
    persetujuanSyarat: true,
    tandaTangan: TTD,
  });
}

/** Seed baris KYC master (mewakili hasil modul KYC) untuk satu nasabah. */
async function seedKyc(t: Tx, userId: Id<"users">, status: string) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("kycProfil", {
      userId,
      status: status as never,
      namaLengkap: "RANI PEMINJAM",
      nik: "3201234567890003",
      nomorWhatsApp: "628123456791",
      dibuatPada: now,
      diperbaruiPada: now,
    }),
  );
}

/** Seed pinjaman didanai (untuk menguji plafon terpakai/tersedia). */
async function seedPinjamanDidanai(
  t: Tx,
  userId: Id<"users">,
  pokokPinjaman: number,
  nomorReferensi = "PGD-SEED-1",
): Promise<Id<"loans">> {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      nasabahUserId: userId,
      pokokPinjaman,
      tujuan: "Modal usaha kecil",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi,
      tenorHari: 30,
      didanaiPada: now,
      kycStatusSaatPengajuan: "VERIFIED",
    }),
  );
}

describe("master nasabah ↔ KYC ↔ plafon ↔ pengajuan", () => {
  it("nasabah baru → KYC VERIFIED → pengajuan terhubung ke master, bukan menyalin KYC", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    await aktifkanLokasi(peminjam);
    const kycId = await seedKyc(t, userId, "VERIFIED");

    const hasil = await ajukan(t, peminjam, 500_000);
    expect(hasil.nomorReferensi).toMatch(/^PGD/);

    // Relasi master terpasang, snapshot status KYC terekam.
    const loan = await t.run((ctx) => ctx.db.get(hasil.appId));
    expect(loan?.userId).toBe(userId);
    expect(loan?.nasabahUserId).toBe(userId);
    expect(loan?.kycProfilId).toBe(kycId);
    expect(loan?.kycStatusSaatPengajuan).toBe("VERIFIED");

    // KYC tetap SATU baris milik nasabah — tidak ada salinan per pengajuan.
    const jumlahKyc = await t.run(async (ctx) =>
      (await ctx.db.query("kycProfil").collect()).length,
    );
    expect(jumlahKyc).toBe(1);
  });

  it("nasabah VERIFIED → pengajuan kedua TANPA KYC ulang (satu KYC, banyak pengajuan)", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "rani2", {
      email: "rani2@pindai.test",
      role: "peminjam",
    });
    await aktifkanLokasi(peminjam);
    const kycId = await seedKyc(t, userId, "VERIFIED");

    const a = await ajukan(t, peminjam, 300_000);
    const b = await ajukan(t, peminjam, 200_000);

    const loans = await t.run(async (ctx) =>
      ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    );
    expect(loans).toHaveLength(2);
    expect(loans.every((l) => l.kycProfilId === kycId)).toBe(true);
    const jumlahKyc = await t.run(async (ctx) =>
      (await ctx.db.query("kycProfil").collect()).length,
    );
    expect(jumlahKyc).toBe(1);
    expect(a.appId).not.toBe(b.appId);
  });

  it("plafon: pinjaman aktif mengurangi tersedia; lunas memulihkan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "plafon", {
      email: "plafon@pindai.test",
      role: "peminjam",
    });
    const loanId = await seedPinjamanDidanai(t, userId, 500_000);

    const aktif = await peminjam.query(api.nasabah.plafonRingkasSaya, {});
    expect(aktif?.maksimal).toBe(PLAFON_DEFAULT);
    expect(aktif?.terpakai).toBe(500_000);
    expect(aktif?.tersedia).toBe(500_000);

    // Lunas → plafon kembali tersedia penuh.
    await t.run((ctx) => ctx.db.patch(loanId, { status: "lunas", lunasPada: Date.now() }));
    const lunas = await peminjam.query(api.nasabah.plafonRingkasSaya, {});
    expect(lunas?.terpakai).toBe(0);
    expect(lunas?.tersedia).toBe(PLAFON_DEFAULT);
  });

  it("server menolak pengajuan yang melebihi plafon TERSEDIA", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "habis", {
      email: "habis@pindai.test",
      role: "peminjam",
    });
    await seedKyc(t, userId, "VERIFIED");
    await aktifkanLokasi(peminjam);
    // Pinjaman aktif 1 juta menutup seluruh plafon default.
    await seedPinjamanDidanai(t, userId, PLAFON_DEFAULT, "PGD-SEED-HABIS");

    await expect(ajukan(t, peminjam, 500_000)).rejects.toThrow(
      /sisa yang dapat diajukan/i,
    );
  });

  it("detailNasabah: master, KYC, plafon, riwayat kronologis, dan pembayaran dari DB", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani-detail", {
      email: "rani-detail@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin-detail", {
      email: "admin-detail@pindai.test",
      role: "admin",
    });
    const now = Date.now();
    await t.run((ctx) =>
      ctx.db.insert("nasabahProfil", {
        userId,
        namaLengkap: "RANI PEMINJAM",
        nik: "3201234567890003",
        nomorWhatsApp: "628123456791",
        alamat: "Jl. Mawar 1",
        sumber: "nasabah",
        diperbaruiPada: now,
        diperbaruiOlehLabel: "nasabah",
      }),
    );
    await seedKyc(t, userId, "VERIFIED");
    // Dua pengajuan: satu lama (lunas), satu berjalan.
    const sekarang = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("loans", {
        userId,
        nasabahUserId: userId,
        pokokPinjaman: 400_000,
        tujuan: "Modal",
        namaLengkap: "RANI PEMINJAM",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "lunas",
        nomorReferensi: "PGD-LAMA",
        tenorHari: 30,
        diajukanPada: sekarang - 40 * 86_400_000,
        didanaiPada: sekarang - 40 * 86_400_000,
        lunasPada: sekarang - 35 * 86_400_000,
        kycStatusSaatPengajuan: "VERIFIED",
      });
      await ctx.db.insert("loans", {
        userId,
        nasabahUserId: userId,
        pokokPinjaman: 300_000,
        tujuan: "Modal",
        namaLengkap: "RANI PEMINJAM",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-BERJALAN",
        tenorHari: 30,
        diajukanPada: sekarang - 5 * 86_400_000,
        didanaiPada: sekarang - 5 * 86_400_000,
        kycStatusSaatPengajuan: "VERIFIED",
      });
    });

    const detail = await admin.query(api.nasabah.detailNasabah, { userId });
    expect(detail).not.toBeNull();
    expect(detail?.profil?.nik).toBe("3201234567890003");
    expect(detail?.kyc?.status).toBe("VERIFIED");
    expect(detail?.plafon.terpakai).toBe(300_000);
    expect(detail?.plafon.tersedia).toBe(PLAFON_DEFAULT - 300_000);
    expect(detail?.ringkasan.jumlahPengajuan).toBe(2);
    expect(detail?.ringkasan.pinjamanLunas).toBe(1);
    expect(detail?.ringkasan.pinjamanAktif).toBe(1);
    // Kronologis: #001 = pengajuan lama, #002 = berjalan.
    expect(detail?.riwayatPengajuan[0].nomorReferensi).toBe("PGD-LAMA");
    expect(detail?.riwayatPengajuan[0].nomorUrut).toBe(1);
    expect(detail?.riwayatPengajuan[1].nomorReferensi).toBe("PGD-BERJALAN");
    expect(detail?.profilRisiko.jumlah.lunas).toBe(1);
  });

  it("pengajuan lama tanpa relasi master tetap dapat dibuka (fallback ke userId)", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "legacy", {
      email: "legacy@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin-legacy", {
      email: "admin-legacy@pindai.test",
      role: "admin",
    });
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 250_000,
        tujuan: "Modal",
        namaLengkap: "RANI PEMINJAM",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "ditolak",
        nomorReferensi: "PGD-LEGACY",
        tenorHari: 30,
      }),
    );
    const detail = await admin.query(api.nasabah.detailPengajuan, { loanId });
    expect(detail?.nomorReferensi).toBe("PGD-LEGACY");
    expect(detail?.nasabah.userId).toBe(userId);
    expect(detail?.status).toBe("ditolak");
    // Snapshot finansial tetap dihitung dari data barisnya.
    expect(detail?.finansial.danaBersih).toBeGreaterThan(0);
  });

  it("keamanan: nasabah tidak dapat membaca detail nasabah lain; pendana tidak dapat membuka KYC", async () => {
    const t = convexTest(schema, modules);
    const { userId: korban } = await siapkanPengguna(t, "korban", {
      email: "korban@pindai.test",
      role: "peminjam",
    });
    const { sesi: penyusup } = await siapkanPengguna(t, "penyusup", {
      email: "penyusup@pindai.test",
      role: "peminjam",
    });
    const { sesi: pendana } = await siapkanPengguna(t, "pendana", {
      email: "pendana@pindai.test",
      role: "dana",
    });
    await seedKyc(t, korban, "VERIFIED");

    // Nasabah lain: ditolak (bukan admin).
    await expect(
      penyusup.query(api.nasabah.detailNasabah, { userId: korban }),
    ).rejects.toThrow(/admin/i);
    // Pendana: dokumen KYC ditolak.
    await expect(
      pendana.query(api.kyc.detailKycAdmin, { userId: korban }),
    ).rejects.toThrow(/admin/i);
    // Pemilik sendiri boleh membaca ringkasan KYC-nya (tanpa URL dokumen).
    const sendiri = await penyusup.query(api.nasabah.plafonRingkasSaya, {});
    expect(sendiri).not.toBeNull();
  });

  it("migrasi: backfill idempoten, tidak mengarang KYC, dan dapat dibatalkan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "migrasi", {
      email: "migrasi@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin-migrasi", {
      email: "admin-migrasi@pindai.test",
      role: "admin",
    });
    // Pinjaman lama lengkap identitas tetapi belum punya master & KYC.
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 500_000,
        tujuan: "Modal",
        namaLengkap: "rani peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-MIGRASI",
        tenorHari: 30,
        nik: "3201234567890003",
        nomorWhatsApp: "628123456791",
        penghasilanBulanan: 3_000_000,
        dokKtpId: undefined,
      }),
    );

    const laporan = await admin.query(api.migrasiNasabah.laporanMigrasiNasabah, {});
    expect(laporan.penggunaTanpaProfil).toBeGreaterThanOrEqual(1);
    expect(laporan.pinjamanTanpaRelasiMaster).toBeGreaterThanOrEqual(1);

    const hasil = await admin.mutation(api.migrasiNasabah.jalankanMigrasiNasabah, {});
    expect(hasil.profilDibuat).toBeGreaterThanOrEqual(1);
    const profil = await t.run(async (ctx) =>
      ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    );
    expect(profil?.nik).toBe("3201234567890003");
    expect(profil?.dibuatMigrasi).toBe(true);
    // Tidak ada KYC yang dikarang: status snapshot = NOT_STARTED, bukan VERIFIED.
    const loanSetelah = await t.run((ctx) => ctx.db.get(loanId));
    expect(loanSetelah?.nasabahUserId).toBe(userId);
    expect(loanSetelah?.kycStatusSaatPengajuan).toBe("NOT_STARTED");
    expect(loanSetelah?.kycProfilId).toBeUndefined();

    // Idempoten: jalan kedua tidak membuat master baru.
    const kedua = await admin.mutation(api.migrasiNasabah.jalankanMigrasiNasabah, {});
    expect(kedua.profilDibuat).toBe(0);

    // Rollback membersihkan hanya baris migrasi; histori pinjaman tetap ada.
    const batal = await admin.mutation(api.migrasiNasabah.batalkanMigrasiNasabah, {
      migrasiPada: hasil.migrasiPada,
    });
    expect(batal.profilDihapus).toBeGreaterThanOrEqual(1);
    const profilHilang = await t.run(async (ctx) =>
      ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    );
    expect(profilHilang).toBeNull();
    const loanMasihAda = await t.run((ctx) => ctx.db.get(loanId));
    expect(loanMasihAda).not.toBeNull();
    expect(loanMasihAda?.nasabahUserId).toBeUndefined();
  });

  it("duplikat nasabah hanya DILAPORKAN, tidak digabung otomatis", async () => {
    const t = convexTest(schema, modules);
    const { userId: a } = await siapkanPengguna(t, "kembar-a", {
      email: "a@pindai.test",
      role: "peminjam",
    });
    const { userId: b } = await siapkanPengguna(t, "kembar-b", {
      email: "b@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin-kembar", {
      email: "admin-kembar@pindai.test",
      role: "admin",
    });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("nasabahProfil", {
        userId: a,
        namaLengkap: "SAMA ORANG",
        nik: "3201234567890003",
        nomorWhatsApp: "628123456791",
        diperbaruiPada: now,
        diperbaruiOlehLabel: "admin",
      });
      await ctx.db.insert("nasabahProfil", {
        userId: b,
        namaLengkap: "SAMA ORANG",
        nik: "3201234567890003",
        nomorWhatsApp: "628123456791",
        diperbaruiPada: now,
        diperbaruiOlehLabel: "admin",
      });
    });

    const laporan = await admin.query(api.migrasiNasabah.laporanMigrasiNasabah, {});
    expect(laporan.kandidatDuplikat).toBeGreaterThanOrEqual(1);

    // Kedua baris tetap ada — migrasi tidak menggabungkan apa pun sendiri.
    const jumlahProfil = await t.run(async (ctx) =>
      (await ctx.db.query("nasabahProfil").collect()).length,
    );
    expect(jumlahProfil).toBe(2);
  });
});
