/**
 * Uji verifikasi kontrak digital + laporan aging portofolio.
 *
 * Menjalankan: bunx vitest run src/convex/risikoDigital.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { hashDokumen, payloadKontrakPinjaman } from "../lib/kontrakDigital";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;
const TTD = `data:image/png;base64,${"A".repeat(64)}`;

const buatKontek = () => convexTest(schema, modules);

async function seedPinjaman(
  t: KonteksUji,
  opsi: { hariLalu?: number; referensi?: string; pokok?: number } = {},
): Promise<{ userId: Id<"users">; loanId: Id<"loans"> }> {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "SITI PEMINJAM", role: "peminjam" }),
  );
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: opsi.pokok ?? 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "SITI PEMINJAM",
      nik: "3201010101010001",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: opsi.referensi ?? "KD-UJI-1",
      tenorHari: 30,
      didanaiPada: Date.now() - (opsi.hariLalu ?? 10) * HARI,
    }),
  );
  return { userId, loanId };
}

describe("sidik jari kontrak", () => {
  it("menerbitkan kode & hash saat ditandatangani, lalu bisa diverifikasi publik", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t);
    const admin = await siapkanPengguna(t, "Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    await admin.sesi.mutation(api.admin.simpanTandaTangan, {
      loanId,
      dataUrl: TTD,
      persetujuanPeminjam: true,
    });

    const baris = await t.run((ctx) =>
      ctx.db
        .query("kontrakDigital")
        .withIndex("by_ref", (q) => q.eq("refId", loanId))
        .first(),
    );
    expect(baris).not.toBeNull();
    expect(baris?.jenis).toBe("pinjaman");
    expect(baris?.hash).toHaveLength(64);
    expect(baris?.kode).toHaveLength(10);
    expect(baris?.pokok).toBe(1_000_000);

    const publik = await t.query(api.kontrakDigital.verifikasiPublik, {
      kode: baris!.kode,
    });
    expect(publik?.hash).toBe(baris?.hash);
    expect(publik?.nomorReferensi).toBe("KD-UJI-1");
    // Halaman publik tidak boleh membawa identitas peminjam.
    expect(JSON.stringify(publik)).not.toContain("SITI");
    expect(JSON.stringify(publik)).not.toContain("3201010101010001");

    // Kode dinormalisasi: huruf kecil tetap menemukan dokumen.
    const kecil = await t.query(api.kontrakDigital.verifikasiPublik, {
      kode: baris!.kode.toLowerCase(),
    });
    expect(kecil?.kode).toBe(baris?.kode);

    const asing = await t.query(api.kontrakDigital.verifikasiPublik, {
      kode: "TIDAKADA1",
    });
    expect(asing).toBeNull();
  });

  it("hash berubah bila data kontrak berubah setelah terbit", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t);
    const admin = await siapkanPengguna(t, "Admin", {
      email: "admin2@pindai.test",
      role: "admin",
    });
    await admin.sesi.mutation(api.admin.simpanTandaTangan, {
      loanId,
      dataUrl: TTD,
      persetujuanPeminjam: true,
    });
    const baris = await t.run((ctx) =>
      ctx.db
        .query("kontrakDigital")
        .withIndex("by_ref", (q) => q.eq("refId", loanId))
        .first(),
    );

    await t.run((ctx) => ctx.db.patch(loanId, { pokokPinjaman: 2_000_000 }));
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    const hashSekarang = hashDokumen(
      payloadKontrakPinjaman({
        nomorReferensi: loan!.nomorReferensi,
        namaLengkap: loan!.namaLengkap,
        nik: loan!.nik ?? null,
        pokokPinjaman: loan!.pokokPinjaman,
        tenorHari: loan!.tenorHari,
        tenorBulan: loan!.tenorBulan ?? null,
        persenBunga: loan!.persenBunga ?? null,
        tandaTanganPada: loan!.tandaTanganPada ?? 0,
      }),
    );
    expect(hashSekarang).not.toBe(baris?.hash);
    const publik = await t.query(api.kontrakDigital.verifikasiPublik, {
      kode: baris!.kode,
    });
    expect(publik?.hash).toBe(baris?.hash);
  });

  it("pemilik bisa membaca info, pengguna lain tidak", async () => {
    const t = buatKontek();
    const { userId, loanId } = await seedPinjaman(t);
    const admin = await siapkanPengguna(t, "Admin", {
      email: "admin3@pindai.test",
      role: "admin",
    });
    await admin.sesi.mutation(api.admin.simpanTandaTangan, {
      loanId,
      dataUrl: TTD,
      persetujuanPeminjam: true,
    });

    const pemilik = await buatPengguna(t, "SITI PEMINJAM");
    await t.run((ctx) => ctx.db.patch(loanId, { userId: pemilik.userId }));
    const info = await pemilik.sesi.query(api.kontrakDigital.infoPinjaman, { loanId });
    expect(info?.hash).toHaveLength(64);

    const lain = await buatPengguna(t, "ORANG LAIN");
    const infoLain = await lain.sesi.query(api.kontrakDigital.infoPinjaman, { loanId });
    expect(infoLain).toBeNull();
    expect(userId).toBeDefined();
  });
});

describe("laporan aging", () => {
  it("mengelompokkan pinjaman berjalan menurut DPD", async () => {
    const t = buatKontek();
    await seedPinjaman(t, { hariLalu: 35, referensi: "AG-1" });
    await seedPinjaman(t, { hariLalu: 75, referensi: "AG-2", pokok: 2_000_000 });
    await seedPinjaman(t, { hariLalu: 100, referensi: "AG-3", pokok: 3_000_000 });
    const admin = await siapkanPengguna(t, "Admin", {
      email: "admin4@pindai.test",
      role: "admin",
    });

    const hasil = await admin.sesi.query(api.laporanRisiko.ringkasanRisiko, {});
    expect(hasil.aging.totalPokok).toBe(6_000_000);
    expect(hasil.aging.baris.find((b) => b.bucket === "lancar")?.jumlah).toBe(0);
    expect(hasil.aging.baris.find((b) => b.bucket === "1-30")?.jumlah).toBe(1);
    expect(hasil.aging.baris.find((b) => b.bucket === "31-60")?.jumlah).toBe(1);
    expect(hasil.aging.baris.find((b) => b.bucket === "61-90")?.jumlah).toBe(1);
    expect(hasil.aging.totalMenunggak).toBe(6_000_000);
    expect(hasil.konsentrasi[0]?.produk).toBe("Pinjaman harian");
    expect(hasil.konsentrasi[0]?.pokokTercatat).toBe(6_000_000);
  });

  it("menolak pengguna non-admin", async () => {
    const t = buatKontek();
    const user = await buatPengguna(t, "Bukan Admin");
    await expect(
      user.sesi.query(api.laporanRisiko.ringkasanRisiko, {}),
    ).rejects.toThrow();
  });
});
