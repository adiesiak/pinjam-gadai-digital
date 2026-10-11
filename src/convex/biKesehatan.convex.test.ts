/**
 * Uji modul BI (`convex/bi.ts`) dan kesehatan sistem (`convex/kesehatan.ts`).
 *
 * Yang dibuktikan:
 *  - gerbang admin ber-TOTP: akun non-admin tidak dapat membaca angka lintas
 *    nasabah;
 *  - metrik SIAP dihitung dari sumber yang benar: pengajuan baru per periode,
 *    yang masuk tinjauan, pinjaman disalurkan beserta POKOK YANG DISALURKAN
 *    (bukan pokok diajukan), gadai, kredit, KYC, dan kasus penagihan terbuka;
 *  - metrik TUNDA tidak pernah muncul sebagai angka 0 di daftar metrik;
 *  - sinyal kesehatan menyebut sumbernya dan melaporkan apa adanya (mis. WA
 *    gagal 24 jam, pengaduan terbuka, konfigurasi kill switch);
 *  - sinyal yang tidak terukur dinyatakan sebagai tidak terukur.
 *
 * Menjalankan: bunx vitest run src/convex/biKesehatan.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { METRIK_TUNDA, KODE_METRIK_SIAP } from "../lib/biMetrik";
import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI_MS = 86_400_000;
const buatKontek = () => convexTest(schema, modules);

async function seed(t: KonteksUji) {
  const { userId } = await siapkanPengguna(t, "peminjam-bi", {
    email: "peminjam-bi@pindai.test",
    role: "peminjam",
  });
  const sekarang = Date.now();
  await t.run(async (ctx) => {
    // Baru — dihitung pada periode apa pun yang mencakup hari ini.
    await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      pokokDiajukan: 1_200_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456789",
      status: "diajukan",
      nomorReferensi: "PGD-BI-BARU",
      tenorHari: 30,
      diajukanPada: sekarang - 1000,
    });
    // Disalurkan: pokok DISALURKAN 900.000 (bukan 1.200.000 yang diajukan).
    await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 900_000,
      pokokDiajukan: 1_200_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456789",
      status: "didanai",
      nomorReferensi: "PGD-BI-SALUR",
      tenorHari: 30,
      diajukanPada: sekarang - 5000,
      didanaiPada: sekarang - 1000,
    });
    // Lama: di luar jendela 24 jam dan di luar bulan berjalan.
    await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 5_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456789",
      status: "lunas",
      nomorReferensi: "PGD-BI-LAMA",
      tenorHari: 30,
      diajukanPada: sekarang - 90 * HARI_MS,
      didanaiPada: sekarang - 90 * HARI_MS,
    });
    await ctx.db.insert("pawns", {
      userId,
      deskripsiBarang: "Kalung emas",
      kategori: "Emas",
      alamatPenilaian: "Jl. Contoh No. 1",
      namaLengkap: "RANI PEMINJAM",
      nomorRekening: "1234567890",
      status: "aktif",
      nomorReferensi: "PGD-BI-GADAI",
    });
    await ctx.db.insert("penagihanKasus", {
      loanId: (await ctx.db.query("loans").first())!._id,
      userId,
      nomorReferensi: "PGD-BI-KASUS",
      status: "ditangani",
      tingkatEskalasi: 1,
      statusPembayaran: "belum_bayar",
      jumlahTindakan: 1,
      dibuatPada: sekarang,
      diperbaruiPada: sekarang,
    });
    await ctx.db.insert("kycProfil", {
      userId,
      status: "VERIFIED",
      dibuatPada: sekarang,
      diperbaruiPada: sekarang,
    });
    await ctx.db.insert("waLogs", {
      nomorTujuan: "628123456789",
      jenis: "pengingat",
      isiPesan: "Pengingat jatuh tempo",
      status: "gagal",
      respon: "gateway: token tidak valid",
      waktu: sekarang - 1000,
    });
  });
  return { userId };
}

describe("BI & kesehatan sistem", () => {
  it("menghitung metrik siap dari sumber yang benar", async () => {
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "admin-bi", {
      email: "admin-bi@pindai.test",
      role: "admin",
    });
    await seed(t);

    const hasil = await admin.sesi.query(api.bi.ringkasanBI, { periode: "kumulatif" });
    const nilai = new Map(hasil.metrik.map((m) => [m.kode, m.nilai]));
    expect(nilai.get("BI-L1")).toBe(3);
    expect(nilai.get("BI-L3")).toBe(2);
    // Pokok DISALURKAN: 900.000 + 5.000.000 — bukan pokok yang diajukan.
    expect(nilai.get("BI-L4")).toBe(5_900_000);
    expect(nilai.get("BI-P1")).toBe(1);
    expect(nilai.get("BI-P2")).toBe(1);
    expect(nilai.get("BI-C1")).toBe(1);
    expect(nilai.get("BI-A1")).toBe(1);

    // Periode harian hanya mencakup baris hari ini.
    const harian = await admin.sesi.query(api.bi.ringkasanBI, { periode: "harian" });
    const nilaiHarian = new Map(harian.metrik.map((m) => [m.kode, m.nilai]));
    expect(nilaiHarian.get("BI-L1")).toBe(2);
    expect(nilaiHarian.get("BI-L4")).toBe(900_000);

    // Metrik yang ditunda TIDAK dikembalikan sebagai angka.
    const kodeTampil = hasil.metrik.map((m) => m.kode);
    for (const tunda of METRIK_TUNDA) {
      expect(kodeTampil).not.toContain(tunda.kode);
    }
    // Dan seluruh yang tampil memang terdaftar sebagai siap.
    expect(kodeTampil.every((k) => KODE_METRIK_SIAP.includes(k))).toBe(true);
    expect(typeof hasil.dihitungPada).toBe("number");
  });

  it("menolak akun non-admin pada BI maupun kesehatan", async () => {
    const t = buatKontek();
    const peminjam = await buatSesi(t, "peminjam-bi-tolak", {
      email: "peminjam-bi-tolak@pindai.test",
      role: "peminjam",
    });
    await expect(peminjam.query(api.bi.ringkasanBI, {})).rejects.toThrow(/Super Admin/i);
    await expect(peminjam.query(api.kesehatan.kesehatanSistem, {})).rejects.toThrow(/Super Admin/i);
  });

  it("sinyal kesehatan melaporkan keadaan apa adanya, bukan hijau karangan", async () => {
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "admin-kes", {
      email: "admin-kes@pindai.test",
      role: "admin",
    });
    await seed(t);

    const kes = await admin.sesi.query(api.kesehatan.kesehatanSistem, {});
    const peta = new Map(kes.sinyal.map((s) => [s.kunci, s]));

    const wa = peta.get("wa");
    expect(wa?.nilai).toBe(1);
    expect(wa?.contoh).toContain("token tidak valid");
    expect(wa?.sumber).toContain("waLogs");

    const pengaduan = peta.get("pengaduan");
    expect(pengaduan?.nilai).toBe(0);
    expect(pengaduan?.keterangan).toContain("0 terbuka");

    const penagihan = peta.get("penagihan");
    expect(penagihan).toBeUndefined();

    const kyc = peta.get("kyc");
    expect(kyc?.nilai).toBe(0);
    expect(kyc?.keterangan).toContain("menunggu perbaikan nasabah");

    expect(kes.konfigurasi.killSwitch).toBe(false);
    expect(typeof kes.konfigurasi.versi).toBe("number");
    expect(kes.tidakTerukur.length).toBeGreaterThan(0);
    expect(kes.tidakTerukur.map((t2) => t2.judul)).toContain("Latency & error rate HTTP");
    // Setiap sinyal menyebut sumber + jendelanya.
    for (const s of kes.sinyal) {
      expect(s.sumber.trim().length).toBeGreaterThan(0);
      expect(s.ambang.trim().length).toBeGreaterThan(0);
    }
  });

  it("menghitung kasus penagihan terbuka sebagai sinyal dan metrik", async () => {
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "admin-kes2", {
      email: "admin-kes2@pindai.test",
      role: "admin",
    });
    const { userId } = await seed(t);
    await t.run(async (ctx) => {
      // Kasus yang sudah selesai TIDAK dihitung sebagai terbuka.
      const loan = (await ctx.db.query("loans").first())!;
      await ctx.db.insert("penagihanKasus", {
        loanId: loan._id,
        userId,
        nomorReferensi: "PGD-BI-KASUS-TUTUP",
        status: "selesai",
        tingkatEskalasi: 2,
        statusPembayaran: "lunas_dicatat",
        jumlahTindakan: 3,
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
        selesaiPada: Date.now(),
      });
      await ctx.db.insert("pengaduanNasabah", {
        userId,
        kanal: "aplikasi",
        kategori: "salah_tagih",
        isi: "Nominal tagihan berbeda dari catatan saya.",
        status: "baru",
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      });
    });

    const bi = await admin.sesi.query(api.bi.ringkasanBI, { periode: "kumulatif" });
    expect(new Map(bi.metrik.map((m) => [m.kode, m.nilai])).get("BI-A1")).toBe(1);

    const kes = await admin.sesi.query(api.kesehatan.kesehatanSistem, {});
    const pengaduan = kes.sinyal.find((s) => s.kunci === "pengaduan");
    expect(pengaduan?.nilai).toBe(1);
    expect(pengaduan?.keterangan).toContain("1 belum punya penanggung jawab");
  });
});
