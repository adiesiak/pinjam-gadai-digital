/**
 * Tes agregasi ringkasan admin (`admin.adminStats`).
 *
 * Menjaga angka "sedang berjalan" untuk gadai & kredit — dipakai kartu utama
 * panel admin (tab Pinjaman / Gadai / Kredit). Agregat pinjaman sudah diuji di
 * tempat lain; di sini fokus pada dua produk baru.
 *
 * Menjalankan: bunx vitest run src/convex/adminStats.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";
import { quoteKreditBarang } from "../lib/kredit";

const NIK = "3201234567890003";
const REKENING = "1234567890";
const WA = "628123456791";

describe("ringkasan admin: total sedang berjalan", () => {
  it("menjumlahkan sisa pokok gadai aktif dan pokok dibiayai kredit berjalan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-stats", {
      email: "admin-stats@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "peminjam-stats", {
      email: "peminjam-stats@pindai.test",
      role: "peminjam",
    });

    await t.run(async (ctx) => {
      // Gadai AKTIF: sisa pokok menurun (2 jt) — yang dihitung.
      await ctx.db.insert("pawns", {
        userId,
        deskripsiBarang: "Kalung emas 10 gram",
        kategori: "Emas",
        alamatPenilaian: "Jl. Contoh No. 1",
        namaLengkap: "Rani Peminjam",
        nomorRekening: REKENING,
        status: "aktif",
        nomorReferensi: "PGD-STATS-1",
        pokokGadai: 2_500_000,
        sisaPokok: 2_000_000,
      });
      // Gadai sudah lepas — diabaikan.
      await ctx.db.insert("pawns", {
        userId,
        deskripsiBarang: "Motor",
        kategori: "Kendaraan",
        alamatPenilaian: "Jl. Contoh No. 2",
        namaLengkap: "Rani Peminjam",
        nomorRekening: REKENING,
        status: "lunas_dilepas",
        nomorReferensi: "PGD-STATS-2",
        pokokGadai: 9_000_000,
        sisaPokok: 0,
      });
      // Kredit BERJALAN: 6 jt − DP 20% = 4,8 jt dibiayai.
      await ctx.db.insert("kreditBarang", {
        userId,
        nomorReferensi: "PJD-STATS-1",
        namaBarang: "Kulkas dua pintu",
        kategori: "Elektronik",
        merchant: "Tokopedia",
        hargaBarang: 6_000_000,
        dpPersen: 20,
        tenorBulan: 6,
        marginPersenPerBulan: 3,
        status: "didanai",
        namaLengkap: "Rani Peminjam",
        nik: NIK,
        nomorRekening: REKENING,
        nomorWhatsApp: WA,
      });
      // Kredit masih diajukan — diabaikan.
      await ctx.db.insert("kreditBarang", {
        userId,
        nomorReferensi: "PJD-STATS-2",
        namaBarang: "Televisi",
        kategori: "Elektronik",
        merchant: "Shopee",
        hargaBarang: 3_000_000,
        dpPersen: 20,
        tenorBulan: 3,
        marginPersenPerBulan: 3,
        status: "diajukan",
        namaLengkap: "Rani Peminjam",
        nik: NIK,
        nomorRekening: REKENING,
        nomorWhatsApp: WA,
      });
    });

    const stats = await asAdmin.query(api.admin.adminStats, {});

    expect(stats.totalGadaiBerjalan).toBe(2_000_000);

    // Nilai kredit dihitung dari helper yang sama dengan produksi agar tidak
    // ada dua sumber kebenaran untuk pokok dibiayai.
    const dibiayai = quoteKreditBarang({
      hargaBarang: 6_000_000,
      dpPersen: 20,
      tenorBulan: 6,
      marginPersenPerBulan: 3,
    }).pokokDibiayai;
    expect(stats.totalKreditBerjalan).toBe(dibiayai);
  });
});
