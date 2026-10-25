/**
 * Uji DRAF pengajuan pinjaman + pembatalan pengajuan (convex-test + vitest).
 *
 * Yang dijaga berkas ini:
 *  - draf bisa disimpan TANPA KYC (draf bukan pengajuan) — gerbang KYC hanya
 *    berlaku pada PENGIRIMAN;
 *  - draf hidup di tabelnya sendiri: tidak menahan plafon dan tidak muncul di
 *    daftar pinjaman peminjam;
 *  - draf hanya milik pemiliknya (baca/ubah/hapus orang lain ditolak);
 *  - pembatalan pengajuan: hanya milik sendiri, hanya pra-pencairan, dan
 *    ditolak bila sudah ada alokasi dana.
 *
 * Menjalankan: bunx vitest run src/convex/draftPinjaman.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PLAFON_DEFAULT } from "../lib/plafon";
import schema from "./schema";
import {
  buatSesi,
  seedKycTerverifikasi,
  simpanBerkasUji,
  siapkanPengguna,
  type SesiUji,
} from "./test.helpers";
import { modules } from "./test.setup";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const TTD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";

type Tx = ReturnType<typeof convexTest>;

const DRAF = {
  skema: "harian",
  pokokPinjaman: 750_000,
  tenorHari: 28,
  tujuan: "Modal usaha kecil",
  catatanPeminjam: "Belum lengkap, lanjut besok",
};

describe("draf pengajuan pinjaman", () => {
  it("disimpan tanpa KYC dan tidak menahan plafon", async () => {
    const t = convexTest(schema, modules);
    const sesi = await buatSesi(t, "draf-peminjam", {
      email: "draf@pindai.test",
      role: "peminjam",
    });

    const { draftId } = await sesi.mutation(api.draftPinjaman.simpanDraft, DRAF);
    expect(draftId).toBeDefined();

    const draf = await sesi.query(api.draftPinjaman.draftSaya, {});
    expect(draf?.pokokPinjaman).toBe(750_000);
    expect(draf?.tujuan).toBe("Modal usaha kecil");
    expect(draf?.status).toBe("draft");

    // Draf BUKAN pengajuan: tidak muncul di daftar pinjaman.
    expect(await sesi.query(api.loans.listMyLoans, {})).toHaveLength(0);
    // Plafon tetap utuh — hanya pinjaman `didanai` yang menahan plafon.
    const ringkas = await sesi.query(api.nasabah.plafonRingkasSaya, {});
    expect(ringkas?.terpakai).toBe(0);
    expect(ringkas?.tersedia).toBe(PLAFON_DEFAULT);
  });

  it("pengajuan tetap DITOLAK tanpa KYC walau draf ada", async () => {
    const t = convexTest(schema, modules);
    const sesi = await buatSesi(t, "draf-tanpa-kyc", {
      email: "draf-tanpa-kyc@pindai.test",
      role: "peminjam",
    });
    await sesi.mutation(api.draftPinjaman.simpanDraft, DRAF);
    await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });

    const ktp = await simpanBerkasUji(t, "ktp-draf");
    const selfie = await simpanBerkasUji(t, "selfie-draf");
    const slip = await simpanBerkasUji(t, "slip-draf");
    await expect(
      sesi.mutation(api.loans.createLoanApplication, {
        pokokPinjaman: DRAF.pokokPinjaman,
        tujuan: DRAF.tujuan,
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        tenorHari: 28,
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
      }),
    ).rejects.toThrow(/KYC diperlukan/i);
  });

  it("diperbarui di tempat dan hanya oleh pemiliknya", async () => {
    const t = convexTest(schema, modules);
    const sesi = await buatSesi(t, "draf-pemilik", {
      email: "draf-pemilik@pindai.test",
      role: "peminjam",
    });
    const { draftId } = await sesi.mutation(api.draftPinjaman.simpanDraft, DRAF);

    await sesi.mutation(api.draftPinjaman.simpanDraft, {
      ...DRAF,
      draftId,
      pokokPinjaman: 900_000,
    });
    const draf = await sesi.query(api.draftPinjaman.draftSaya, {});
    expect(draf?.pokokPinjaman).toBe(900_000);
    expect(draf?._id).toBe(draftId);

    const orangLain = await buatSesi(t, "draf-orang-lain", {
      email: "draf-orang-lain@pindai.test",
      role: "peminjam",
    });
    await expect(
      orangLain.mutation(api.draftPinjaman.simpanDraft, { ...DRAF, draftId }),
    ).rejects.toThrow(/bukan milik Anda/i);
    await expect(
      orangLain.mutation(api.draftPinjaman.hapusDraft, { draftId }),
    ).rejects.toThrow(/bukan milik Anda/i);
  });

  it("menolak isian draf di luar skema", async () => {
    const t = convexTest(schema, modules);
    const sesi = await buatSesi(t, "draf-tidak-sah", {
      email: "draf-tidak-sah@pindai.test",
      role: "peminjam",
    });

    await expect(
      sesi.mutation(api.draftPinjaman.simpanDraft, { ...DRAF, skema: "mingguan" }),
    ).rejects.toThrow(/harian.*bulanan/i);
    await expect(
      sesi.mutation(api.draftPinjaman.simpanDraft, { ...DRAF, pokokPinjaman: 999_999_999 }),
    ).rejects.toThrow(/antara/i);
    await expect(
      sesi.mutation(api.draftPinjaman.simpanDraft, {
        ...DRAF,
        skema: "bulanan",
        // 24 bulan bukan tenor resmi (1/3/6/9/12).
        tenorBulan: 24,
      }),
    ).rejects.toThrow(/tenor/i);
  });

  it("dihapus oleh pemiliknya", async () => {
    const t = convexTest(schema, modules);
    const sesi = await buatSesi(t, "draf-hapus", {
      email: "draf-hapus@pindai.test",
      role: "peminjam",
    });
    const { draftId } = await sesi.mutation(api.draftPinjaman.simpanDraft, DRAF);

    const hasil = await sesi.mutation(api.draftPinjaman.hapusDraft, { draftId });
    expect(hasil.dihapus).toBe(true);
    expect(await sesi.query(api.draftPinjaman.draftSaya, {})).toBeNull();
  });
});

describe("pembatalan pengajuan oleh peminjam", () => {
  async function pinjamanTerkirim(
    t: Tx,
    email: string,
  ): Promise<{ appId: Id<"loans">; sesi: SesiUji; userId: Id<"users"> }> {
    // `siapkanPengguna` mengembalikan userId sekaligus — dipakai untuk menandai
    // KYC VERIFIED tanpa membaca ulang tabel `users`.
    const { sesi, userId } = await siapkanPengguna(t, "batal-peminjam", {
      email,
      role: "peminjam",
    });
    await seedKycTerverifikasi(t, userId);
    await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
    const ktp = await simpanBerkasUji(t, "ktp-batal");
    const selfie = await simpanBerkasUji(t, "selfie-batal");
    const slip = await simpanBerkasUji(t, "slip-batal");
    const appId = await sesi.mutation(api.loans.createLoanApplication, {
      pokokPinjaman: 500_000,
      tujuan: "Modal usaha kecil",
      namaLengkap: "Rani Peminjam",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      tenorHari: 28,
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
    return { appId: appId.appId, sesi, userId };
  }

  it("menarik pengajuan sendiri sebelum pencairan", async () => {
    const t = convexTest(schema, modules);
    const { appId, sesi } = await pinjamanTerkirim(t, "batal-ok@pindai.test");

    const hasil = await sesi.mutation(api.loans.batalkanPengajuan, {
      loanId: appId,
      alasan: "Batal karena kebutuhan sudah terpenuhi",
    });
    expect(hasil.status).toBe("dibatalkan");

    const daftar = await sesi.query(api.loans.listMyLoans, {});
    expect(daftar[0]?.status).toBe("dibatalkan");
    // Pengajuan yang ditarik bukan utang — plafon tidak berubah.
    const ringkas = await sesi.query(api.nasabah.plafonRingkasSaya, {});
    expect(ringkas?.terpakai).toBe(0);
  });

  it("tidak dapat membatalkan pengajuan orang lain", async () => {
    const t = convexTest(schema, modules);
    const { appId } = await pinjamanTerkirim(t, "batal-korban@pindai.test");
    const lain = await buatSesi(t, "batal-lain", {
      email: "batal-lain@pindai.test",
      role: "peminjam",
    });

    await expect(
      lain.mutation(api.loans.batalkanPengajuan, { loanId: appId }),
    ).rejects.toThrow(/bukan milik Anda/i);
  });

  it("menolak pembatalan bila sudah ada alokasi dana", async () => {
    const t = convexTest(schema, modules);
    const { appId, sesi, userId: pemilikId } = await pinjamanTerkirim(
      t,
      "batal-alokasi@pindai.test",
    );

    // Alokasi dana dari penyedia dana (tanpa memandang siapa pendananya):
    // gerbang pembatalan hanya memeriksa KEBERADAAN alokasi, karena alokasi
    // tidak boleh menjadi yatim.
    await t.run(async (ctx) => {
      await ctx.db.insert("fundings", {
        loanId: appId,
        danaId: pemilikId,
        jumlahAlokasi: 500_000,
        imbalHasil: 150_000,
        status: "dialokasikan",
        nomorReferensi: "FND-BATAL-1",
      });
    });

    await expect(
      sesi.mutation(api.loans.batalkanPengajuan, { loanId: appId }),
    ).rejects.toThrow(/alokasi dana/i);
  });

  it("tidak dapat membatalkan pinjaman yang sudah tersalurkan", async () => {
    const t = convexTest(schema, modules);
    const { appId, sesi } = await pinjamanTerkirim(t, "batal-cair@pindai.test");
    await t.run((ctx) => ctx.db.patch(appId, { status: "didanai", didanaiPada: Date.now() }));

    await expect(
      sesi.mutation(api.loans.batalkanPengajuan, { loanId: appId }),
    ).rejects.toThrow(/tidak dapat dibatalkan sendiri/i);
  });
});
