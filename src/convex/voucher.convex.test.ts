/**
 * Tes voucher nasabah terhadap plafon pembiayaan (convex-test + vitest).
 *
 * Yang dijaga di sini adalah aturan yang mudah salah kalau dihitung klien:
 *  - kelayakan voucher memakai plafon TERSEDIA, dan voucher yang minimal
 *    pengajuannya di atas limit ditandai tidak layak beserta alasannya;
 *  - voucher boost menaikkan batas pengajuan SEKALI pakai lalu hangus, tanpa
 *    mengubah plafon pokok;
 *  - voucher potongan biaya admin tidak mengembalikan limit: plafon yang
 *    terpakai tetap sebesar pokok, dan potongannya dibatasi biaya admin nyata;
 *  - voucher milik akun lain tidak bisa dipakai.
 *
 * Menjalankan: bunx vitest run src/convex/voucher.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
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

type Sesi = SesiUji;
type Tx = KonteksUji;

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const HARI_MS = 86_400_000;

/** Peminjam ber-KYC VERIFIED — gerbang pengajuan finansial. */
async function siapkanPeminjam(t: Tx, nama: string, email: string) {
  const hasil = await siapkanPenggunaDasar(t, nama, { email, role: "peminjam" });
  await seedKycTerverifikasi(t, hasil.userId);
  await hasil.sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
  return hasil;
}

/** Tiga berkas KYC bergambar — createLoanApplication mewajibkannya. */
async function unggahKyc(t: Tx) {
  return {
    ktp: await simpanBerkasUji(t, "ktp"),
    selfie: await simpanBerkasUji(t, "selfie"),
    slip: await simpanBerkasUji(t, "slip gaji"),
  };
}

/** Pengajuan tunai harian 7 hari. */
async function ajukanHarian(
  sesi: Sesi,
  kyc: Awaited<ReturnType<typeof unggahKyc>>,
  pokokPinjaman: number,
  voucherId?: Id<"voucher">,
) {
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman,
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

/** Pengajuan tunai bulanan 3 bulan (dipakai agar boost bisa menembus plafon). */
async function ajukanBulanan(
  sesi: Sesi,
  kyc: Awaited<ReturnType<typeof unggahKyc>>,
  pokokPinjaman: number,
  voucherId?: Id<"voucher">,
) {
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman,
    ...(voucherId !== undefined ? { voucherId } : {}),
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    // Tenor 1 bulan: tenor 3/6 bulan punya minimum pokok Rp3.000.000, sedangkan
    // berkas uji ini memakai plafon kecil. Tarif bulanan tetap dipakai.
    tenorHari: 30,
    tenorBulan: 1,
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

async function terbitkan(
  admin: Sesi,
  args: {
    pemilikId: Id<"users">;
    jenis:
      | "diskon_admin"
      | "diskon_ujrah"
      | "diskon_margin"
      | "boost_plafon"
      | "diskon_bunga"
      | "tambah_tenor";
    nilai: number;
    minPokok: number;
    judul?: string;
    batasPemakaian?: number;
  },
) {
  return admin.mutation(api.voucher.terbitkanVoucher, {
    pemilikId: args.pemilikId,
    jenis: args.jenis,
    judul: args.judul ?? "Voucher uji",
    nilai: args.nilai,
    minPokok: args.minPokok,
    batasPemakaian: args.batasPemakaian ?? 1,
    berlakuSampai: Date.now() + 30 * HARI_MS,
  });
}

describe("voucher nasabah dan limit pembiayaan", () => {
  it("menandai voucher di atas limit sebagai tidak layak dan menyebut kedua angkanya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-vcr", {
      email: "admin-vcr@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-vcr",
      "rani-vcr@pindai.test",
    );

    await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_admin",
      nilai: 20_000,
      minPokok: 100_000,
    });
    await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_admin",
      nilai: 50_000,
      minPokok: 2_000_000,
    });
    await terbitkan(admin, {
      pemilikId: userId,
      jenis: "boost_plafon",
      nilai: 500_000,
      minPokok: 1_000_000,
    });

    const data = await peminjam.query(api.voucher.daftarVoucherSaya, {});
    expect(data).not.toBeNull();
    // Plafon awal Rp500.000, tanpa pinjaman berjalan.
    expect(data!.limit.tersedia).toBe(500_000);
    // Boost +Rp500.000 membuat minimal Rp1.000.000-nya tercapai.
    expect(data!.limit.boostTersedia).toBe(500_000);
    expect(data!.limit.batasPengajuan).toBe(1_000_000);

    const kecil = data!.daftar.find((row) => row.nilai === 20_000);
    expect(kecil?.layak).toBe(true);
    expect(kecil?.alasan).toBeNull();

    const besar = data!.daftar.find((row) => row.nilai === 50_000);
    expect(besar?.layak).toBe(false);
    expect(besar?.alasan).toContain("Minimal pengajuan Rp 2.000.000");
    expect(besar?.alasan).toContain("Limit Anda saat ini Rp 500.000");

    // Badge hanya menghitung voucher yang benar-benar bisa dipakai.
    expect(data!.jumlahAktif).toBe(2);
  });

  it("dua voucher boost tidak dijumlahkan menjadi satu batas pengajuan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-boost-dua", {
      email: "admin-boost-dua@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-boost-dua",
      "rani-boost-dua@pindai.test",
    );

    await terbitkan(admin, {
      pemilikId: userId,
      jenis: "boost_plafon",
      nilai: 500_000,
      minPokok: 1_000_000,
    });
    await terbitkan(admin, {
      pemilikId: userId,
      jenis: "boost_plafon",
      nilai: 250_000,
      minPokok: 750_000,
    });

    const data = await peminjam.query(api.voucher.daftarVoucherSaya, {});
    expect(data!.limit.tersedia).toBe(500_000);
    // Satu pengajuan hanya memakai satu voucher: batas tertinggi mengikuti
    // boost terbesar (Rp500.000), bukan jumlah keduanya (Rp750.000).
    expect(data!.limit.boostTersedia).toBe(500_000);
    expect(data!.limit.batasPengajuan).toBe(1_000_000);
  });

  it("boost menembus plafon sekali pakai lalu hangus", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-boost", {
      email: "admin-boost@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-boost",
      "rani-boost@pindai.test",
    );
    const kyc = await unggahKyc(t);
    const { id: voucherId } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "boost_plafon",
      nilai: 500_000,
      minPokok: 1_000_000,
    });

    // Tanpa voucher, Rp1.000.000 melewati plafon Rp500.000.
    await expect(ajukanBulanan(peminjam, kyc, 1_000_000)).rejects.toThrow(
      /Batas pinjaman Anda saat ini Rp 500\.000/,
    );

    const hasil = await ajukanBulanan(peminjam, kyc, 1_000_000, voucherId);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const voucher = await ctx.db.get(voucherId);
      return { loan: rows.find((row) => row.nomorReferensi === hasil.nomorReferensi), voucher };
    });
    expect(loan.loan?.voucherBoost).toBe(500_000);
    expect(loan.loan?.voucherDiskon).toBe(0);
    // Sekali pakai: kuota habis dan status berubah.
    expect(loan.voucher?.terpakai).toBe(1);
    expect(loan.voucher?.status).toBe("terpakai");
    expect(loan.voucher?.dipakaiLoanId).toBe(loan.loan?._id);

    // Plafon pokok tidak berubah dan boost sudah hangus: pengajuan yang
    // tersimpan bukan utang sampai dicairkan, jadi tersedia tetap Rp500.000.
    const sesudah = await peminjam.query(api.voucher.daftarVoucherSaya, {});
    expect(sesudah!.limit.tersedia).toBe(500_000);
    expect(sesudah!.limit.boostTersedia).toBe(0);
    expect(sesudah!.limit.batasPengajuan).toBe(500_000);
  });

  it("potongan biaya admin dibatasi biaya nyata dan tidak mengembalikan limit", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-diskon", {
      email: "admin-diskon@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-diskon",
      "rani-diskon@pindai.test",
    );
    const kyc = await unggahKyc(t);
    const { id: voucherId } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_admin",
      nilai: 100_000,
      minPokok: 100_000,
    });

    const hasil = await ajukanHarian(peminjam, kyc, 300_000, voucherId);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });

    // Biaya admin 2% dari Rp300.000 = Rp6.000; voucher Rp100.000 tidak
    // berubah menjadi uang tunai.
    expect(loan?.voucherDiskon).toBe(6_000);

    const sesudah = await peminjam.query(api.voucher.daftarVoucherSaya, {});
    expect(sesudah!.limit.tersedia).toBe(500_000);
  });

  it("voucher potongan bunga menurunkan bunga pinjaman tanpa mengubah tarif normal pendana", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-bunga", {
      email: "admin-bunga@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-bunga",
      "rani-bunga@pindai.test",
    );
    const kyc = await unggahKyc(t);
    const { id: voucherId } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_bunga",
      nilai: 5,
      minPokok: 100_000,
    });

    const hasil = await ajukanHarian(peminjam, kyc, 300_000, voucherId);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });

    // Tarif 7 hari untuk Rp300.000 adalah 32%; voucher 5 poin menurunkannya
    // menjadi 27%, dan tarif normal tetap disimpan untuk hak pendana.
    expect(loan?.persenBunga).toBe(27);
    expect(loan?.promoBungaPersenNormal).toBe(32);
    expect(loan?.voucherDiskonBunga).toBe(5);
    expect(loan?.voucherDiskon).toBe(0);
  });

  it("voucher tambah tenor memundurkan jatuh tempo dengan tarif tenor semula", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-tenor", {
      email: "admin-tenor@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-tenor",
      "rani-tenor@pindai.test",
    );
    const kyc = await unggahKyc(t);
    const { id: voucherId } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "tambah_tenor",
      nilai: 7,
      minPokok: 100_000,
    });

    const hasil = await ajukanHarian(peminjam, kyc, 300_000, voucherId);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });

    // Tenor tersimpan 7 + 7 hari, tetapi bunga tetap tarif 7 hari (32%).
    expect(loan?.tenorHari).toBe(14);
    expect(loan?.persenBunga).toBe(32);
    expect(loan?.voucherTambahTenor).toBe(7);
  });

  it("potongan bunga dan tambah tenor ditolak untuk skema bulanan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-bulan-bunga", {
      email: "admin-bulan-bunga@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-bulan-bunga",
      "rani-bulan-bunga@pindai.test",
    );
    const kyc = await unggahKyc(t);
    const { id: potongan } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_bunga",
      nilai: 5,
      minPokok: 100_000,
    });
    const { id: tenor } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "tambah_tenor",
      nilai: 7,
      minPokok: 100_000,
    });

    await expect(ajukanBulanan(peminjam, kyc, 300_000, potongan)).rejects.toThrow(
      /hanya berlaku untuk pinjaman harian/,
    );
    await expect(ajukanBulanan(peminjam, kyc, 300_000, tenor)).rejects.toThrow(
      /hanya berlaku untuk pinjaman harian/,
    );
  });

  it("menutup pinjaman dari panel admin menerbitkan voucher apresiasi", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-tutup", {
      email: "admin-tutup@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPenggunaDasar(t, "rani-tutup", {
      email: "rani-tutup@pindai.test",
      role: "peminjam",
    });
    const loanId = await t.run(async (ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Tutup",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-TUTUP-PANEL",
        tenorHari: 30,
        didanaiPada: Date.now() - 10 * HARI_MS,
      }),
    );

    await admin.mutation(api.loans.ubahStatusPinjaman, {
      loanId,
      status: "lunas",
      reason: "Pembayaran penuh dicatat admin.",
    });

    const voucher = await t.run((ctx) =>
      ctx.db
        .query("voucher")
        .withIndex("by_referensi", (q) => q.eq("referensi", "PGD-TUTUP-PANEL"))
        .first(),
    );
    expect(voucher?.pemilikId).toBe(userId);
    expect(voucher?.sumber).toBe("apresiasi");
    expect(voucher?.nilai).toBe(10_000);
  });

  it("menyisir voucher apresiasi untuk pinjaman lunas lama, sekali saja", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPenggunaDasar(t, "rani-sisir", {
      email: "rani-sisir@pindai.test",
      role: "peminjam",
    });
    const lunasPada = Date.now() - 5 * HARI_MS;
    await t.run(async (ctx) => {
      // Lunas lewat jalur lama: telat, dan tidak ada promo yang aktif. Kedua
      // syarat itu dulu menahan voucher; sekarang tidak lagi.
      await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Sisir",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "lunas",
        nomorReferensi: "PGD-SISIR-LUNAS",
        tenorHari: 30,
        didanaiPada: lunasPada - 40 * HARI_MS,
        lunasPada,
        terlambatAngsuran: true,
      });
      await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 500_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Sisir",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        // Bukan lunas, jadi tidak boleh menghasilkan voucher; status ditolak
        // dipilih supaya tidak menahan plafon yang dipakai voucher apresiasi.
        status: "ditolak",
        nomorReferensi: "PGD-SISIR-BERJALAN",
        tenorHari: 30,
        didanaiPada: Date.now() - 2 * HARI_MS,
      });
    });

    const pertama = await peminjam.mutation(api.voucher.pastikanVoucherApresiasiSaya, {});
    expect(pertama.diterbitkan).toBe(1);

    const data = await peminjam.query(api.voucher.daftarVoucherSaya, {});
    expect(data!.daftar).toHaveLength(1);
    expect(data!.daftar[0].judul).toBe("Voucher apresiasi pelunasan");
    expect(data!.daftar[0].nilai).toBe(10_000);
    expect(data!.daftar[0].jenis).toBe("diskon_admin");
    expect(data!.daftar[0].layak).toBe(true);

    // Idempoten: kunjungan berikutnya tidak menggandakan voucher.
    const kedua = await peminjam.mutation(api.voucher.pastikanVoucherApresiasiSaya, {});
    expect(kedua.diterbitkan).toBe(0);
    const semua = await t.run((ctx) =>
      ctx.db
        .query("voucher")
        .withIndex("by_pemilik", (q) => q.eq("pemilikId", userId))
        .collect(),
    );
    expect(semua).toHaveLength(1);
  });

  it("menolak voucher milik akun lain dan voucher akad syariah di pinjaman konvensional", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-asing", {
      email: "admin-asing@pindai.test",
      role: "admin",
    });
    const { userId: pemilikLain } = await siapkanPeminjam(
      t,
      "sari-asing",
      "sari-asing@pindai.test",
    );
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-asing",
      "rani-asing@pindai.test",
    );
    const kyc = await unggahKyc(t);

    const { id: voucherAsing } = await terbitkan(admin, {
      pemilikId: pemilikLain,
      jenis: "diskon_admin",
      nilai: 10_000,
      minPokok: 100_000,
    });
    await expect(ajukanHarian(peminjam, kyc, 300_000, voucherAsing)).rejects.toThrow(
      "Voucher tidak ditemukan pada akun Anda.",
    );

    const { id: voucherSyariah } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_ujrah",
      nilai: 10_000,
      minPokok: 100_000,
    });
    await expect(ajukanHarian(peminjam, kyc, 300_000, voucherSyariah)).rejects.toThrow(
      "Voucher akad syariah belum bisa dipakai untuk pinjaman konvensional.",
    );
  });
});

describe("pengaturan voucher oleh admin", () => {
  it("mendaftar voucher dengan pemilik, hitungan status, dan saringan jenis", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-daftar-vcr", {
      email: "admin-daftar-vcr@pindai.test",
      role: "admin",
    });
    const { userId: rani } = await siapkanPenggunaDasar(t, "rani-daftar-vcr", {
      email: "rani-daftar-vcr@pindai.test",
      role: "peminjam",
    });
    const { userId: sari } = await siapkanPenggunaDasar(t, "sari-daftar-vcr", {
      email: "sari-daftar-vcr@pindai.test",
      role: "peminjam",
    });

    await terbitkan(admin, {
      pemilikId: rani,
      jenis: "diskon_admin",
      nilai: 25_000,
      minPokok: 100_000,
      judul: "Bebas admin Rani",
    });
    await terbitkan(admin, {
      pemilikId: sari,
      jenis: "boost_plafon",
      nilai: 200_000,
      minPokok: 100_000,
      judul: "Tambah limit Sari",
    });
    // Voucher yang masa berlakunya sudah lewat: status simpan tetap "aktif",
    // jadi panel harus membacanya sebagai kedaluwarsa.
    await t.run((ctx) =>
      ctx.db.insert("voucher", {
        kode: "VCR-LAMPAU-001",
        jenis: "diskon_admin",
        judul: "Voucher lama",
        nilai: 10_000,
        minPokok: 100_000,
        batasPemakaian: 1,
        terpakai: 0,
        pemilikId: rani,
        sumber: "admin",
        status: "aktif",
        berlakuSampai: Date.now() - 2 * HARI_MS,
        dibuatPada: Date.now() - 40 * HARI_MS,
      }),
    );

    const semua = await admin.query(api.voucher.daftarVoucherAdmin, {});
    expect(semua.item).toHaveLength(3);
    expect(semua.ringkas.total).toBe(3);
    expect(semua.ringkas.aktif).toBe(2);
    expect(semua.ringkas.kedaluwarsa).toBe(1);
    expect(semua.ringkas.nilaiAktif).toBe(225_000);

    // Nama pemilik ikut dibaca supaya panel bisa dicari dengan nama nasabah.
    const bebas = semua.item.find((row) => row.kode.startsWith("VCR-") && row.jenis === "diskon_admin" && row.statusTampil === "aktif");
    expect(bebas?.pemilik.userId).toBe(rani);
    expect(bebas?.pemilik.nama).toContain("rani-daftar-vcr");

    const boost = await admin.query(api.voucher.daftarVoucherAdmin, {
      jenis: "boost_plafon",
    });
    expect(boost.item).toHaveLength(1);
    expect(boost.item[0].pemilik.userId).toBe(sari);

    const kedaluwarsa = await admin.query(api.voucher.daftarVoucherAdmin, {
      status: "kedaluwarsa",
    });
    expect(kedaluwarsa.item.map((row) => row.kode)).toEqual(["VCR-LAMPAU-001"]);

    // Saringan asing jatuh ke "semua", bukan daftar kosong.
    const asing = await admin.query(api.voucher.daftarVoucherAdmin, { status: "entah" });
    expect(asing.item).toHaveLength(3);
  });

  it("menyunting kuota dan masa berlaku, serta menolak kuota di bawah pemakaian", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-ubah-vcr", {
      email: "admin-ubah-vcr@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPenggunaDasar(t, "rani-ubah-vcr", {
      email: "rani-ubah-vcr@pindai.test",
      role: "peminjam",
    });
    const { id } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_admin",
      nilai: 25_000,
      minPokok: 100_000,
      batasPemakaian: 3,
    });
    // Sudah dipakai dua kali — menurunkan kuota ke 1 akan membuat sisa negatif.
    await t.run((ctx) => ctx.db.patch(id, { terpakai: 2 }));

    await expect(
      admin.mutation(api.voucher.ubahVoucher, { voucherId: id, batasPemakaian: 1 }),
    ).rejects.toThrow(/sudah dipakai 2 kali/);
    await expect(
      admin.mutation(api.voucher.ubahVoucher, { voucherId: id, judul: "ab" }),
    ).rejects.toThrow(/3–80 karakter/);
    await expect(
      admin.mutation(api.voucher.ubahVoucher, {
        voucherId: id,
        berlakuSampai: Date.now() - HARI_MS,
      }),
    ).rejects.toThrow(/masa depan/);

    const berlakuSampai = Date.now() + 45 * HARI_MS;
    const hasil = await admin.mutation(api.voucher.ubahVoucher, {
      voucherId: id,
      judul: "Bebas admin diperpanjang",
      batasPemakaian: 4,
      berlakuSampai,
    });
    expect(hasil.perubahan).toBe(3);

    const sesudah = await t.run((ctx) => ctx.db.get(id));
    expect(sesudah?.judul).toBe("Bebas admin diperpanjang");
    expect(sesudah?.batasPemakaian).toBe(4);
    expect(sesudah?.berlakuSampai).toBe(berlakuSampai);
    expect(sesudah?.nilai).toBe(25_000);

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "voucher_diubah"))
        .first(),
    );
    expect(audit?.detail).toContain("kuota 3 → 4 kali");
  });

  it("mencabut voucher wajib beralasan dan menolak pencabutan ganda", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-cabut-vcr", {
      email: "admin-cabut-vcr@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPenggunaDasar(t, "rani-cabut-vcr", {
      email: "rani-cabut-vcr@pindai.test",
      role: "peminjam",
    });
    const { id } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_admin",
      nilai: 15_000,
      minPokok: 100_000,
    });

    await expect(
      admin.mutation(api.voucher.cabutVoucher, { voucherId: id, alasan: "  " }),
    ).rejects.toThrow(/3–200 karakter/);

    await admin.mutation(api.voucher.cabutVoucher, {
      voucherId: id,
      alasan: "Salah input nominal.",
    });
    const sesudah = await t.run((ctx) => ctx.db.get(id));
    expect(sesudah?.status).toBe("dicabut");

    await expect(
      admin.mutation(api.voucher.cabutVoucher, { voucherId: id, alasan: "Ulangi" }),
    ).rejects.toThrow(/tidak perlu dicabut/);
    await expect(
      admin.mutation(api.voucher.ubahVoucher, { voucherId: id, judul: "Ganti judul" }),
    ).rejects.toThrow(/dicabut/);
  });

  it("menolak nasabah memakai jalur pengaturan admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPeminjam(
      t,
      "rani-bukan-admin-vcr",
      "rani-bukan-admin-vcr@pindai.test",
    );
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-bukan-admin-vcr", {
      email: "admin-bukan-admin-vcr@pindai.test",
      role: "admin",
    });
    const { id } = await terbitkan(admin, {
      pemilikId: userId,
      jenis: "diskon_admin",
      nilai: 10_000,
      minPokok: 100_000,
    });

    await expect(peminjam.query(api.voucher.daftarVoucherAdmin, {})).rejects.toThrow(
      /Akses khusus Super Admin/,
    );
    await expect(
      peminjam.mutation(api.voucher.ubahVoucher, { voucherId: id, judul: "Ambil alih" }),
    ).rejects.toThrow(/Akses khusus Super Admin/);
    await expect(
      peminjam.mutation(api.voucher.cabutVoucher, { voucherId: id, alasan: "coba" }),
    ).rejects.toThrow(/Akses khusus Super Admin/);
  });

  it("menerbitkan voucher yang sama untuk beberapa nasabah, satu baris per akun", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-massal-vcr", {
      email: "admin-massal-vcr@pindai.test",
      role: "admin",
    });
    const { userId: rani } = await siapkanPenggunaDasar(t, "rani-massal-vcr", {
      email: "rani-massal-vcr@pindai.test",
      role: "peminjam",
    });
    const { userId: sari } = await siapkanPenggunaDasar(t, "sari-massal-vcr", {
      email: "sari-massal-vcr@pindai.test",
      role: "peminjam",
    });
    const dasar = {
      jenis: "diskon_bunga" as const,
      judul: "Bunga lebih ringan",
      nilai: 5,
      minPokok: 100_000,
      batasPemakaian: 1,
      berlakuSampai: Date.now() + 30 * HARI_MS,
    };

    const hasil = await admin.mutation(api.voucher.terbitkanVoucherMassal, {
      ...dasar,
      // Duplikat dalam satu kiriman tidak boleh menghasilkan dua voucher.
      pemilikIds: [rani, sari, rani],
    });
    expect(hasil.jumlah).toBe(2);
    expect(new Set(hasil.kode).size).toBe(2);

    const rows = await t.run((ctx) => ctx.db.query("voucher").collect());
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.pemilikId).sort()).toEqual([rani, sari].sort());
    expect(rows.every((row) => row.jenis === "diskon_bunga" && row.nilai === 5)).toBe(true);

    await expect(
      admin.mutation(api.voucher.terbitkanVoucherMassal, { ...dasar, pemilikIds: [] }),
    ).rejects.toThrow(/minimal satu nasabah/);

    const { userId: adminKedua } = await siapkanPenggunaDasar(t, "admin-kedua-vcr", {
      email: "admin-kedua-vcr@pindai.test",
      role: "admin",
    });
    await expect(
      admin.mutation(api.voucher.terbitkanVoucherMassal, {
        ...dasar,
        pemilikIds: [rani, adminKedua],
      }),
    ).rejects.toThrow(/akun admin/);
    // Satu penerima tidak sah membatalkan seluruh kiriman: tidak ada voucher
    // tambahan yang terlanjur terbit.
    const sesudah = await t.run((ctx) => ctx.db.query("voucher").collect());
    expect(sesudah).toHaveLength(2);
  });
});
