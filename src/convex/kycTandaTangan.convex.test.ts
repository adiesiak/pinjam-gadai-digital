/**
 * Tes tanda tangan KYC → pengajuan pinjaman.
 * Menjalankan: bunx vitest run src/convex/kycTandaTangan.convex.test.ts
 *
 * Aturan yang dijaga:
 *  - tanda tangan disimpan SEKALI di baris KYC (setelah persetujuan pemrosesan);
 *  - pengajuan pinjaman memakai gambar itu walau formulir tidak mengirim
 *    `tandaTangan` sama sekali;
 *  - tanpa tanda tangan di KYC (dan tanpa kiriman cadangan), pengajuan ditolak
 *    dengan pesan yang mengarahkan nasabah ke halaman KYC.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi, seedKycTerverifikasiEmail, simpanBerkasUji } from "./test.helpers";
import { modules } from "./test.setup";
import { VERSI_PERSETUJUAN_KYC } from "../lib/persetujuanKyc";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const TTD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";

type Tx = ReturnType<typeof convexTest>;

/** Peminjam ber-KYC VERIFIED, sudah menyetujui pemrosesan, lokasi aktif. */
async function peminjamSiap(t: Tx, email: string) {
  const sesi = await buatSesi(t, "peminjam-ttd", { email, role: "peminjam" });
  await seedKycTerverifikasiEmail(t, email);
  await sesi.mutation(api.kyc.catatPersetujuanKyc, { versi: VERSI_PERSETUJUAN_KYC });
  await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
  return sesi;
}

async function ajukan(t: Tx, sesi: Awaited<ReturnType<typeof peminjamSiap>>, urutan: string) {
  const ktp = await simpanBerkasUji(t, `ktp-${urutan}`);
  const selfie = await simpanBerkasUji(t, `selfie-${urutan}`);
  const slip = await simpanBerkasUji(t, `slip-${urutan}`);
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman: 300_000,
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    tenorHari: 14,
    nik: "3201234567890003",
    nomorWhatsApp: "628123456791",
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
    dokKtpId: ktp,
    dokSelfieKtpId: selfie,
    dokSlipGajiId: slip,
    lokasiAjukan: { ...TITIK, waktu: Date.now() },
    persetujuanSyarat: true,
    // Sengaja TANPA `tandaTangan`: formulir pengajuan tidak lagi menggambar
    // tanda tangan sendiri.
  });
}

async function pinjamanTerakhir(t: Tx) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query("loans").collect();
    return rows[rows.length - 1];
  });
}

describe("tanda tangan KYC dipakai ulang oleh pengajuan", () => {
  it("menyimpan tanda tangan di KYC tanpa mengubah status verifikasi", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "ttd-simpan@pindai.test");

    await sesi.mutation(api.kyc.simpanTandaTanganKyc, { tandaTangan: TTD });

    const kyc = await sesi.query(api.kyc.kycSaya, {});
    expect(kyc.tandaTangan).toBe(TTD);
    expect(kyc.tandaTanganPada).not.toBeNull();
    expect(kyc.status).toBe("VERIFIED");
  });

  it("pengajuan memakai gambar KYC walau argumen tandaTangan tidak dikirim", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "ttd-pakai@pindai.test");
    await sesi.mutation(api.kyc.simpanTandaTanganKyc, { tandaTangan: TTD });

    await ajukan(t, sesi, "pakai");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tandaTanganPeminjam).toBe(TTD);
    expect(loan?.tandaTanganPada).toBeTypeOf("number");
  });

  it("pengajuan ditolak bila KYC belum punya tanda tangan", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "ttd-kosong@pindai.test");

    await expect(ajukan(t, sesi, "kosong")).rejects.toThrow(/tanda tangan belum tercatat di kyc/i);

    const rows = await t.run(async (ctx) => ctx.db.query("loans").collect());
    expect(rows).toHaveLength(0);
  });

  it("tanda tangan hanya bisa disimpan setelah persetujuan pemrosesan", async () => {
    const t = convexTest(schema, modules);
    const sesi = await buatSesi(t, "peminjam-ttd", {
      email: "ttd-tanpa-setuju@pindai.test",
      role: "peminjam",
    });
    await seedKycTerverifikasiEmail(t, "ttd-tanpa-setuju@pindai.test");

    await expect(
      sesi.mutation(api.kyc.simpanTandaTanganKyc, { tandaTangan: TTD }),
    ).rejects.toThrow(/persetujuan/i);
  });
});
