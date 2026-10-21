/**
 * Tes matriks tenor & bunga harian di jalur pengajuan nyata.
 * Menjalankan: bunx vitest run src/convex/tenorBunga.convex.test.ts
 *
 * UI boleh menyembunyikan tenor yang tidak berlaku, tetapi server tetap harus
 * menolak kombinasi nominal/tenor di luar matriks. Tes ini memastikan:
 *  - tenor 7/14/28 diterima pada setiap tier nominal;
 *  - snapshot bunga berasal dari matriks tier (26–40%), bukan angka global;
 *  - tenor 30 hari ditolak mutation.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi, seedKycTerverifikasiEmail, simpanBerkasUji, type SesiUji } from "./test.helpers";
import { modules } from "./test.setup";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const TTD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";

type Tx = ReturnType<typeof convexTest>;

/** Peminjam siap-KYC + lokasi aktif — prasyarat gerbang pengajuan. */
async function peminjamSiap(
  t: Tx,
  email: string,
  plafon?: number,
): Promise<SesiUji> {
  const sesi = await buatSesi(t, "peminjam-tenor", { email, role: "peminjam" });
  if (plafon !== undefined) {
    await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      const user = users.find((row) => row.email === email);
      if (user === null) throw new Error("Pengguna uji tidak ditemukan.");
      await ctx.db.patch(user._id, { plafonPinjaman: plafon });
    });
  }
  await seedKycTerverifikasiEmail(t, email);
  await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
  return sesi;
}

async function ajukan(
  t: Tx,
  sesi: SesiUji,
  pokokPinjaman: number,
  tenorHari: number,
  urutan: string,
  opsi: { cairEkspres?: boolean } = {},
) {
  const ktp = await simpanBerkasUji(t, `ktp-${urutan}`);
  const selfie = await simpanBerkasUji(t, `selfie-${urutan}`);
  const slip = await simpanBerkasUji(t, `slip-${urutan}`);
  return sesi.mutation(api.loans.createLoanApplication, {
    ...opsi,
    pokokPinjaman,
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    tenorHari,
    nik: "3201234567890003",
    nomorWhatsApp: "628123456791",
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
    dokKtpId: ktp,
    dokSelfieKtpId: selfie,
    dokSlipGajiId: slip,
    lokasiAjukan: { ...TITIK, waktu: Date.now() },
    persetujuanSyarat: true,
    tandaTangan: TTD,
  });
}

async function pinjamanTerakhir(t: Tx) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query("loans").collect();
    return rows[rows.length - 1];
  });
}

describe("matriks tenor & bunga harian", () => {
  it("Rp250.000 tenor 7 hari memakai bunga dasar 30%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-kecil@pindai.test");
    await ajukan(t, sesi, 250_000, 7, "kecil");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(7);
    expect(loan?.persenBunga).toBe(30);
  });

  it("Rp250.000 tenor 28 hari memakai bunga 40%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-kecil-panjang@pindai.test");
    await ajukan(t, sesi, 250_000, 28, "kecil-panjang");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(28);
    expect(loan?.persenBunga).toBe(40);
  });

  it("Rp500.000 tenor 14 hari memakai bunga 32%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-menengah@pindai.test");
    await ajukan(t, sesi, 500_000, 14, "menengah");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(14);
    expect(loan?.persenBunga).toBe(32);
  });

  it("Rp500.000 tenor 7 hari memakai bunga 28%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-menengah-pendek@pindai.test");
    await ajukan(t, sesi, 500_000, 7, "menengah-pendek");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(7);
    expect(loan?.persenBunga).toBe(28);
  });

  it("Rp1 juta tenor 28 hari memakai bunga 30%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-penuh@pindai.test", 1_000_000);
    await ajukan(t, sesi, 1_000_000, 28, "penuh");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(28);
    expect(loan?.persenBunga).toBe(30);
  });

  it("plafon khusus Rp2 juta membuka pokok harian Rp2 juta", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-plafon-khusus@pindai.test", 2_000_000);
    await ajukan(t, sesi, 2_000_000, 28, "plafon-khusus");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.pokokPinjaman).toBe(2_000_000);
    expect(loan?.persenBunga).toBe(30);
  });

  it("tanpa plafon khusus, pokok harian di atas Rp1 juta ditolak", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-plafon-bawaan@pindai.test", 1_000_000);

    await expect(ajukan(t, sesi, 1_500_000, 28, "plafon-bawaan")).rejects.toThrow(
      /Batas pinjaman Anda/,
    );
  });

  it("Rp1 juta tenor 14 hari memakai bunga 28%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-penuh-mid@pindai.test", 1_000_000);
    await ajukan(t, sesi, 1_000_000, 14, "penuh-mid");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(14);
    expect(loan?.persenBunga).toBe(28);
  });

  it("bunga khusus akun tidak menimpa tarif tenor", async () => {
    const t = convexTest(schema, modules);
    const email = "tenor-override@pindai.test";
    const sesi = await peminjamSiap(t, email);
    // Sisa override lama dari fitur bunga per akun tidak boleh mengubah tarif:
    // tabel tenor adalah aturan website yang berlaku.
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect()).find((row) => row.email === email);
      if (user === undefined) throw new Error("Pengguna uji tidak ditemukan.");
      await ctx.db.patch(user._id, { persenBunga: 42 });
    });

    await ajukan(t, sesi, 500_000, 14, "override-harian");
    expect((await pinjamanTerakhir(t))?.persenBunga).toBe(32);

    // Skema bulanan memakai tarif tenor (3 bulan = 25% per bulan).
    const ktp = await simpanBerkasUji(t, "ktp-override-bulanan");
    const selfie = await simpanBerkasUji(t, "selfie-override-bulanan");
    const slip = await simpanBerkasUji(t, "slip-override-bulanan");
    await sesi.mutation(api.loans.createLoanApplication, {
      pokokPinjaman: 100_000,
      tujuan: "Modal usaha kecil",
      namaLengkap: "Rani Peminjam",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      tenorHari: 28,
      tenorBulan: 3,
      nik: "3201234567890003",
      nomorWhatsApp: "628123456791",
      penghasilanBulanan: 4_000_000,
      sumberPenghasilan: "Usaha warung",
      dokKtpId: ktp,
      dokSelfieKtpId: selfie,
      dokSlipGajiId: slip,
      lokasiAjukan: { ...TITIK, waktu: Date.now() },
      persetujuanSyarat: true,
      tandaTangan: TTD,
    });
    expect((await pinjamanTerakhir(t))?.persenBunga).toBe(25);
  });

  it("tenor 30 hari ditolak pada semua tier", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-tolak-tigapuluh@pindai.test");

    await expect(ajukan(t, sesi, 500_000, 30, "tolak-tigapuluh")).rejects.toThrow(
      /tenor yang tersedia 7 \/ 14 \/ 28 hari/,
    );
  });
});

describe("pilihan cair ekspres dari peminjam", () => {
  it("tanpa centang: biaya ekspres nol dan dana bersih 98%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "ekspres-tidak@pindai.test", 1_000_000);
    await ajukan(t, sesi, 1_000_000, 28, "ekspres-tidak", { cairEkspres: false });

    const loan = await pinjamanTerakhir(t);
    expect(loan?.cairEkspres).toBe(false);

    const admin = await buatSesi(t, "admin-ekspres", {
      email: "admin-ekspres@pindai.test",
      role: "admin",
    });
    const detail = await admin.query(api.admin.contractDetail, { loanId: loan!._id });
    expect(detail?.quote.biayaAdmin).toBe(20_000);
    expect(detail?.quote.biayaExpress).toBe(0);
    expect(detail?.quote.totalPotonganDiMuka).toBe(20_000);
    expect(detail?.quote.danaBersihDitransfer).toBe(980_000);
    // Bunga tetap ditagih penuh: pilihan ekspres tidak mengubah kewajiban.
    expect(detail?.quote.totalKewajibanPelunasan).toBe(1_300_000);
  });

  it("dengan centang: biaya ekspres tetap dipotong seperti sebelumnya", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "ekspres-ya@pindai.test", 1_000_000);
    await ajukan(t, sesi, 1_000_000, 28, "ekspres-ya", { cairEkspres: true });

    const loan = await pinjamanTerakhir(t);
    expect(loan?.cairEkspres).toBe(true);

    const admin = await buatSesi(t, "admin-ekspres-ya", {
      email: "admin-ekspres-ya@pindai.test",
      role: "admin",
    });
    const detail = await admin.query(api.admin.contractDetail, { loanId: loan!._id });
    expect(detail?.quote.biayaExpress).toBe(10_000);
    expect(detail?.quote.totalPotonganDiMuka).toBe(30_000);
    expect(detail?.quote.danaBersihDitransfer).toBe(970_000);
  });
});
