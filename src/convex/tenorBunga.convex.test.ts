/**
 * Tes matriks tenor & bunga harian di jalur pengajuan nyata.
 * Menjalankan: bunx vitest run src/convex/tenorBunga.convex.test.ts
 *
 * UI boleh menyembunyikan tenor yang tidak berlaku, tetapi server tetap harus
 * menolak kombinasi nominal/tenor di luar matriks. Tes ini memastikan:
 *  - tenor 7/14/28 diterima hanya pada nominal yang tepat;
 *  - snapshot bunga yang disimpan berasal dari matriks (30/35/40%), bukan
 *    angka global lama 30% untuk semua tenor;
 *  - kombinasi terkunci (Rp500.000/7 hari, Rp1 juta/14 hari) ditolak mutation.
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
async function peminjamSiap(t: Tx, email: string): Promise<SesiUji> {
  const sesi = await buatSesi(t, "peminjam-tenor", { email, role: "peminjam" });
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
) {
  const ktp = await simpanBerkasUji(t, `ktp-${urutan}`);
  const selfie = await simpanBerkasUji(t, `selfie-${urutan}`);
  const slip = await simpanBerkasUji(t, `slip-${urutan}`);
  return sesi.mutation(api.loans.createLoanApplication, {
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

  it("Rp500.000 tenor 14 hari memakai bunga 35%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-menengah@pindai.test");
    await ajukan(t, sesi, 500_000, 14, "menengah");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(14);
    expect(loan?.persenBunga).toBe(35);
  });

  it("Rp1 juta tenor 28 hari memakai bunga 35%", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-penuh@pindai.test");
    await ajukan(t, sesi, 1_000_000, 28, "penuh");

    const loan = await pinjamanTerakhir(t);
    expect(loan?.tenorHari).toBe(28);
    expect(loan?.persenBunga).toBe(35);
  });

  it("Rp500.000 menolak tenor 7 hari", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-tolak-menengah@pindai.test");

    await expect(ajukan(t, sesi, 500_000, 7, "tolak-menengah")).rejects.toThrow(
      /tenor yang tersedia 14 \/ 28 hari/,
    );
  });

  it("Rp1 juta menolak tenor 14 hari", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "tenor-tolak-penuh@pindai.test");

    await expect(ajukan(t, sesi, 1_000_000, 14, "tolak-penuh")).rejects.toThrow(
      /tenor yang tersedia 28 hari/,
    );
  });
});
