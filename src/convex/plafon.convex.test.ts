/**
 * Tes kebijakan plafon tunai dan batas kredit barang (convex-test + vitest).
 *
 * Tunai mulai dari Rp1 juta; kenaikan plafon berbasis pelunasan hanya dapat
 * terjadi setelah transaksi pembayaran terverifikasi. Guard saat ini menutupnya.
 * Override admin tetap didahulukan. Kredit barang memiliki batas pokok Rp10 juta sendiri dan tenor
 * pengajuan 1/3/6 bulan, tanpa mewarisi plafon tunai.
 *
 * Tes gerbang pelunasan menanam pinjaman didanai langsung ke DB agar tidak
 * bergantung pada storageGetMetadata yang belum didukung convexTest untuk KYC.
 * Persetujuan Syarat & Ketentuan saat pengajuan tidak dapat diuji lewat
 * `createLoanApplication` karena keterbatasan yang sama; yang diuji di sini
 * adalah efeknya pada penghapusan (persetujuan pengajuan BUKAN akad resmi).
 *
 * Menjalankan: bunx vitest run src/convex/plafon.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji, type SesiUji } from "./test.helpers";
import { modules } from "./test.setup";
import { PLAFON_BATAS, PLAFON_DEFAULT } from "../lib/plafon";
import { DEFAULT_CONFIG } from "../lib/system-config";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";

type Sesi = SesiUji;
type Tx = KonteksUji;

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };

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
    namaBank: "BCA",
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
    persetujuanSyarat: true,
    // Tanda tangan wajib pada pengajuan pinjaman.
    tandaTangan:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=",
  });
}

/** Seed pinjaman berstatus didanai untuk menguji pelunasan yang ditutup. */
async function siapkanPinjamanTunaiDidanai(
  t: Tx,
  userId: Id<"users">,
  pokokPinjaman: number,
  hariLalu = 0,
): Promise<Id<"loans">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const danaId = await ctx.db.insert("users", {
      email: `dana-${pokokPinjaman}@pindai.test`,
      name: "Penyedia dana seed",
      emailVerificationTime: now,
      role: "dana",
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
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: `PGD-SEED-${pokokPinjaman}`,
      tenorHari: 30,
      didanaiPada: now - hariLalu * 86_400_000,
    });
    await ctx.db.insert("fundings", {
      loanId,
      danaId,
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

  it("persetujuan pengajuan tidak menghalangi penghapusan; akad resmi menghalangi", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin-ttd", {
      email: "admin-ttd@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani-ttd", {
      email: "rani-ttd@pindai.test",
      role: "peminjam",
    });
    const now = Date.now();

    // Persetujuan SAAT MENGAJUKAN (`persetujuanPengajuan*`) adalah catatan
    // pengiriman, BUKAN akad resmi — pengajuan yang belum berjalan tetap dapat
    // dihapus walau peminjam sudah mencentang Syarat & Ketentuan.
    const loanPengajuan = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha kecil",
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "diajukan",
        nomorReferensi: "PGD-TTD-1",
        tenorHari: 30,
        persetujuanPengajuanPada: now,
        persetujuanPengajuanVersi: CONTRACT_TERMS_VERSION,
      }),
    );
    await expect(
      admin.mutation(api.loans.hapusPinjaman, {
        loanId: loanPengajuan,
        reason: "Data uji salah input, dihapus admin.",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(await t.run((ctx) => ctx.db.get(loanPengajuan))).toBeNull();
  });

  it("menolak pelunasan tanpa settlement; status dan plafon tidak berubah", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "lina", {
      email: "lina@pindai.test",
      role: "peminjam",
    });
    const loanId = await siapkanPinjamanTunaiDidanai(t, userId, 1_000_000);

    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
    const ledgerCountBefore = await t.run(async (ctx) =>
      (await ctx.db.query("ledger_entries").collect()).length,
    );
    await expect(
      peminjam.mutation(api.loans.repayLoan, { loanId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");

    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
    const keadaan = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      loan: await ctx.db.get(loanId),
      audit: await ctx.db.query("auditLog").collect(),
      ledger: await ctx.db.query("ledger_entries").collect(),
    }));
    expect(keadaan.user?.plafonPinjamanNaikPada).toBeUndefined();
    expect(keadaan.loan?.status).toBe("didanai");
    expect(keadaan.ledger).toHaveLength(ledgerCountBefore);
    expect(keadaan.audit.some((row) => row.aksi === "plafon_naik_otomatis")).toBe(false);
  });

  it("pelunasan lewat tanggal acuan tetap ditolak tanpa perubahan status", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "maya-lambat", {
      email: "maya-lambat@pindai.test",
      role: "peminjam",
    });
    const loanId = await siapkanPinjamanTunaiDidanai(t, userId, 1_000_000, 31);

    await expect(
      peminjam.mutation(api.loans.repayLoan, { loanId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");

    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(loan?.status).toBe("didanai");
    expect(user?.plafonPinjamanNaikPada).toBeUndefined();
  });

  it("pelunasan simulasi pinjaman di bawah Rp1 juta juga ditolak", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "maya", {
      email: "maya@pindai.test",
      role: "peminjam",
    });
    const loanId = await siapkanPinjamanTunaiDidanai(t, userId, 999_999);

    await expect(
      peminjam.mutation(api.loans.repayLoan, { loanId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");

    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(loan?.status).toBe("didanai");
    expect(user?.plafonPinjamanNaikPada).toBeUndefined();
  });

  it("override admin tetap berlaku saat pelunasan belum terverifikasi", async () => {
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
    await expect(
      peminjam.mutation(api.loans.repayLoan, { loanId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(4_000_000);
    expect(await t.run((ctx) => ctx.db.get(loanId))).toMatchObject({ status: "didanai" });

    const reset = await admin.mutation(api.admin.setPlafonPeminjam, { userId, plafon: null });
    expect(reset.plafonEfektif).toBe(PLAFON_DEFAULT);
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(PLAFON_DEFAULT);
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

  it("pengajuan baru bertanda tangan masih dapat dihapus admin; kontrak yang sudah disetujui tidak", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-hapus@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hapus@pindai.test",
      role: "peminjam",
    });

    const ttd =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";
    const now = Date.now();

    // convexTest belum mendukung syscall storageGetMetadata yang dipakai
    // createLoanApplication untuk KYC, jadi pengajuan ditanam langsung ke DB
    // (pola yang sama dengan tes gerbang pelunasan di berkas ini).
    // Dokumen storage sengaja dibiarkan kosong agar pembersihan storage di
    // hapusPinjaman tidak memicu syscall yang belum didukung.
    const loanBaru = await t.run(async (ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha kecil",
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "diajukan",
        nomorReferensi: "PGD-HAPUS-1",
        tenorHari: 30,
        // Tanda tangan formulir — sejak alur submit baru, semua pengajuan
        // baru menyimpan ini; TIDAK boleh memblokir penghapusan.
        tandaTanganPeminjam: ttd,
        tandaTanganPada: now,
      }),
    );

    await expect(
      admin.mutation(api.loans.hapusPinjaman, {
        loanId: loanBaru,
        reason: "Data uji salah input, dihapus admin.",
      }),
    ).resolves.toMatchObject({ ok: true });
    const terhapus = await t.run((ctx) => ctx.db.get(loanBaru));
    expect(terhapus).toBeNull();

    // Kontrak yang sudah disetujui (persetujuanSyaratPada) tetap dilindungi.
    const loanKontrak = await t.run(async (ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha kecil",
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "diajukan",
        nomorReferensi: "PGD-HAPUS-2",
        tenorHari: 30,
        tandaTanganPeminjam: ttd,
        tandaTanganPada: now,
        persetujuanSyaratPada: now,
      }),
    );
    await expect(
      admin.mutation(api.loans.hapusPinjaman, {
        loanId: loanKontrak,
        reason: "Mencoba hapus kontrak bertanda tangan.",
      }),
    ).rejects.toThrow(/persetujuan tercatat/);
  });

  it("pinjaman kosong tanpa persetujuan dihapus walau ada catatan operasional; alokasi dana tetap memblokir", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-hapus2@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hapus2@pindai.test",
      role: "peminjam",
    });
    const { userId: danaId } = await siapkanPengguna(t, "dana-uji", {
      email: "dana-uji@pindai.test",
      role: "dana",
    });

    const ttd =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";
    const now = Date.now();

    // Pengajuan kosong (tanpa `persetujuanSyaratPada`) disertai catatan
    // operasional: pengingat, log WhatsApp, jejak & peringatan lokasi.
    const loanId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha kecil",
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "diajukan",
        nomorReferensi: "PGD-HAPUS-3",
        tenorHari: 30,
        tandaTanganPeminjam: ttd,
        tandaTanganPada: now,
      });
      await ctx.db.insert("pengingat", {
        loanId: id,
        tanggal: now,
        jenis: "h_minus_3",
        sisaHari: 3,
        jumlahKewajiban: 1_500_000,
        waktu: now,
      });
      await ctx.db.insert("waLogs", {
        loanId: id,
        nomorTujuan: "628123456789",
        jenis: "pengingat",
        isiPesan: "Pengingat jatuh tempo",
        status: "terkirim",
        waktu: now,
      });
      await ctx.db.insert("lokasiJejak", {
        userId,
        loanId: id,
        lat: -6.2,
        lng: 106.816666,
        akurasi: 25,
        waktu: now,
      });
      await ctx.db.insert("lokasiPeringatan", {
        userId,
        tanda: ["koordinat_identik"],
        loanId: id,
        lat: -6.2,
        lng: 106.816666,
        jenis: "peringatan",
        waktu: now,
      });
      return id;
    });

    await expect(
      admin.mutation(api.loans.hapusPinjaman, {
        loanId,
        reason: "Hapus data uji yang salah input total.",
      }),
    ).resolves.toMatchObject({ ok: true });

    // Pinjaman DAN seluruh catatan operasionalnya ikut terhapus.
    const sisa = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      pengingat: await ctx.db
        .query("pengingat")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
      waLogs: await ctx.db
        .query("waLogs")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
      jejak: await ctx.db
        .query("lokasiJejak")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
      peringatan: await ctx.db
        .query("lokasiPeringatan")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
    }));
    expect(sisa.loan).toBeNull();
    expect(sisa.pengingat).toHaveLength(0);
    expect(sisa.waLogs).toHaveLength(0);
    expect(sisa.jejak).toHaveLength(0);
    expect(sisa.peringatan).toHaveLength(0);

    // Alokasi dana (catatan keuangan) tetap memblokir penghapusan.
    const loanDialokasikan = await t.run(async (ctx) => {
      const id = await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha kecil",
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "diajukan",
        nomorReferensi: "PGD-HAPUS-4",
        tenorHari: 30,
        tandaTanganPeminjam: ttd,
        tandaTanganPada: now,
      });
      await ctx.db.insert("fundings", {
        loanId: id,
        danaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "dialokasikan",
        nomorReferensi: "ALOK-HAPUS-1",
      });
      return id;
    });
    await expect(
      admin.mutation(api.loans.hapusPinjaman, {
        loanId: loanDialokasikan,
        reason: "Mencoba hapus pinjaman yang sudah dialokasikan.",
      }),
    ).rejects.toThrow(/alokasi atau jurnal/);
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
