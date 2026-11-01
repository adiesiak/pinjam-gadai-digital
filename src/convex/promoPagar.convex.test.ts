/**
 * Tes pagar uang promo bunga (convex-test + vitest).
 *
 * Dua hal yang diuji di sini tidak terlihat di layar mana pun sampai uangnya
 * sudah keluar, jadi keduanya dijaga di server:
 *
 *  1. **Tumpukan promo + voucher.** Promo MENGGANTIKAN tarif normal, lalu voucher
 *     potongan bunga memotong lagi. Kampanye bisa menolak tumpukan, dan hasil
 *     tumpukan tidak boleh turun di bawah lantai bunga — penolakan, bukan
 *     potongan diam-diam yang membuat voucher tampak terpakai penuh.
 *  2. **Pagu subsidi per kampanye.** Pengajuan yang akan melewati pagu ditolak,
 *     dan kampanye dimatikan otomatis SETELAH transaksi berhasil (bukan di dalam
 *     mutation yang melempar, karena patch itu akan ikut dibatalkan).
 *
 * Angka acuan: pokok Rp300.000 tenor 7 hari bertarif normal 32%, jadi promo 15%
 * menyubsidi 17% × Rp300.000 = Rp51.000 per pinjaman.
 *
 * Menjalankan: bunx vitest run src/convex/promoPagar.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  seedKycTerverifikasi,
  simpanBerkasUji,
  siapkanPengguna as siapkanPenggunaDasar,
  type KonteksUji,
  type SesiUji,
} from "./test.helpers";
import { modules } from "./test.setup";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const HARI_MS = 86_400_000;
const POKOK = 300_000;

async function siapkanPeminjam(t: KonteksUji, nama: string, email: string) {
  const hasil = await siapkanPenggunaDasar(t, nama, { email, role: "peminjam" });
  await seedKycTerverifikasi(t, hasil.userId);
  await hasil.sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
  return hasil;
}

async function unggahKyc(t: KonteksUji) {
  return {
    ktp: await simpanBerkasUji(t, "ktp"),
    selfie: await simpanBerkasUji(t, "selfie"),
    slip: await simpanBerkasUji(t, "slip gaji"),
  };
}

async function ajukanHarian(
  sesi: SesiUji,
  kyc: Awaited<ReturnType<typeof unggahKyc>>,
  voucherId?: Id<"voucher">,
) {
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman: POKOK,
    ...(voucherId !== undefined ? { voucherId } : {}),
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    tenorHari: 7,
    nik: "3201234567890003",
    nomorWhatsApp: "628123456791",
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
    dokKtpId: kyc.ktp,
    dokSelfieKtpId: kyc.selfie,
    dokSlipGajiId: kyc.slip,
    lokasiAjukan: { ...TITIK, waktu: Date.now() },
    persetujuanSyarat: true,
    tandaTangan:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=",
  });
}

async function buatPromo(
  admin: SesiUji,
  isi: { bolehVoucher?: boolean; paguSubsidi?: number },
) {
  return admin.mutation(api.promoBunga.simpan, {
    nama: "Bunga 15 tenor 7",
    persenBunga: 15,
    tenor: [7],
    mulai: Date.now() - HARI_MS,
    selesai: Date.now() + 10 * HARI_MS,
    aktif: true,
    ...isi,
  });
}

async function terbitkanVoucherBunga(
  admin: SesiUji,
  pemilikId: Id<"users">,
  nilai: number,
) {
  return admin.mutation(api.voucher.terbitkanVoucher, {
    pemilikId,
    jenis: "diskon_bunga",
    judul: "Potongan bunga uji",
    nilai,
    minPokok: 100_000,
    batasPemakaian: 1,
    berlakuSampai: Date.now() + 30 * HARI_MS,
  });
}

/** Satu pinjaman peminjam pada promo (atau null bila tanpa promo). */
async function pinjamanPromo(t: KonteksUji, promoId: Id<"promoBunga">) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("loans")
      .withIndex("by_promoBunga", (q) => q.eq("promoBungaId", promoId))
      .collect();
    return rows;
  });
}

describe("pagar promo bunga", () => {
  it("kampanye yang menolak tumpukan menolak voucher potongan bunga", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-pagar", {
      email: "admin-pagar@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-pagar",
      "rani-pagar@pindai.test",
    );
    const kyc = await unggahKyc(t);
    await buatPromo(admin, { bolehVoucher: false });
    const { id: voucherId } = await terbitkanVoucherBunga(admin, userId, 5);

    await expect(ajukanHarian(peminjam, kyc, voucherId)).rejects.toThrow(
      /tidak dapat digabung dengan voucher potongan bunga/,
    );

    // Voucher tidak hangus karena pengajuan ditolak: kuotanya masih utuh.
    const sesudah = await peminjam.query(api.voucher.daftarVoucherSaya, {});
    expect(sesudah!.daftar[0]?.terpakai ?? 0).toBe(0);
  });

  it("tumpukan di bawah lantai bunga ditolak, bukan dipotong diam-diam", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-lantai", {
      email: "admin-lantai@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-lantai",
      "rani-lantai@pindai.test",
    );
    const kyc = await unggahKyc(t);
    const { id: promoId } = await buatPromo(admin, { bolehVoucher: true });

    // Promo 15% − voucher 12 poin = 3%, di bawah lantai 5%.
    const { id: terlaluDalam } = await terbitkanVoucherBunga(admin, userId, 12);
    await expect(ajukanHarian(peminjam, kyc, terlaluDalam)).rejects.toThrow(
      /batas minimum 5%/,
    );

    // Voucher 5 poin menghasilkan 10% — di atas lantai, jadi diterima dan
    // angkanya dibekukan pada pinjaman.
    const { id: wajar } = await terbitkanVoucherBunga(admin, userId, 5);
    const hasil = await ajukanHarian(peminjam, kyc, wajar);
    const rows = await pinjamanPromo(t, promoId);
    const loan = rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    expect(loan?.persenBunga).toBe(10);
    expect(loan?.promoBungaPersen).toBe(15);
    expect(loan?.promoBungaPersenNormal).toBe(32);
    expect(loan?.voucherDiskonBunga).toBe(5);
  });

  it("pagu subsidi menolak pengajuan yang melewatinya, lalu kampanye berhenti sendiri", async () => {
    // Waktu palsu HARUS aktif sebelum transaksi: penjadwal convex-test
    // menumpangkan `runAfter(0)` pada timer yang ada saat itu.
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-pagu", {
        email: "admin-pagu@pindai.test",
        role: "admin",
      });
      const { sesi: peminjam } = await siapkanPeminjam(
        t,
        "rani-pagu",
        "rani-pagu@pindai.test",
      );
      const kyc = await unggahKyc(t);
      // Subsidi satu pinjaman tepat Rp51.000; pagu dibuat pas di angka itu supaya
      // pengajuan pertama masih masuk dan pengajuan kedua sudah ditolak.
      const { id: promoId } = await buatPromo(admin, { paguSubsidi: 51_000 });

      await ajukanHarian(peminjam, kyc);
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const promo = await t.run((ctx) => ctx.db.get(promoId));
      expect(promo?.aktif).toBe(false);
      expect(promo?.paguPeringatan).toBe("100");

      const audit = await t.run(async (ctx) => {
        const rows = await ctx.db.query("auditLog").collect();
        return rows.find((row) => row.aksi === "promo_bunga_dihentikan_pagu");
      });
      expect(audit?.target).toBe("Bunga 15 tenor 7");

      // Pengajuan berikutnya tidak ditolak mentah-mentah: promo sudah nonaktif,
      // jadi pinjaman berjalan dengan tarif normal tanpa promo — bukan diam-diam
      // memakai tarif promo yang pagunya sudah habis.
      const kedua = await ajukanHarian(peminjam, kyc);
      const rows = await t.run(async (ctx) => {
        const semua = await ctx.db.query("loans").collect();
        return semua.find((row) => row.nomorReferensi === kedua.nomorReferensi);
      });
      expect(rows?.persenBunga).toBe(32);
      expect(rows?.promoBungaId).toBeUndefined();
      expect(await pinjamanPromo(t, promoId)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pengajuan yang akan melewati pagu ditolak sebelum pinjaman tercatat", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-pagu-tolak", {
      email: "admin-pagu-tolak@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-pagu-tolak",
      "rani-pagu-tolak@pindai.test",
    );
    const kyc = await unggahKyc(t);
    // Rp55.000: pinjaman pertama (Rp51.000 = 93% pagu) masih masuk dan memicu
    // peringatan 80%, pinjaman kedua akan membuat total Rp102.000 — harus ditolak,
    // bukan dicatat lalu disesali.
    const { id: promoId } = await buatPromo(admin, { paguSubsidi: 55_000 });

    await ajukanHarian(peminjam, kyc);
    await expect(ajukanHarian(peminjam, kyc)).rejects.toThrow(/Pagu subsidi promo/);

    const promo = await t.run((ctx) => ctx.db.get(promoId));
    expect(promo?.aktif).toBe(true);
    expect(await pinjamanPromo(t, promoId)).toHaveLength(1);

    // Penghentian otomatis tetap idempoten saat dipanggil ulang.
    await t.mutation(internal.promoBunga.hentikanPromoJikaPaguHabis, { promoBungaId: promoId });
    await t.mutation(internal.promoBunga.hentikanPromoJikaPaguHabis, { promoBungaId: promoId });
    const audit = await t.run(async (ctx) => {
      const rows = await ctx.db.query("auditLog").collect();
      return rows.filter((row) => row.aksi === "promo_bunga_pagu_80");
    });
    expect(audit).toHaveLength(1);
  });
});
