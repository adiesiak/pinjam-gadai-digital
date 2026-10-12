/**
 * Tes integrasi KLAIM & LOGIN PEMINJAM LAMA (convex-test + vitest).
 *
 * Yang dijaga berkas ini — semuanya lewat pintu yang sama dengan aplikasi
 * (action pengiriman kode, mutation klaim, query ringkasan), bukan memanggil
 * aturan murni langsung:
 *
 *  - nomor yang TIDAK punya data lama ditolak jujur (tidak ada akun kosong yang
 *    dikarang, tidak ada satu pun permintaan yang dikirim);
 *  - kode yang benar memulihkan AKUN PEMILIK data lama (login peminjam lama),
 *    dan tidak memindahkan berkas ke mana-mana karena pemiliknya sudah tepat;
 *  - kode yang benar pada jalur SESI AKTIF memindahkan KEPEMILIKAN berkas
 *    (pinjaman, gadai, kredit, master identitas) ke akun sesi, sementara nominal
 *    dan status baris tidak berubah;
 *  - kode salah, kode sekali pakai, dan batas percobaan tidak bisa dilewati;
 *  - data ganda (satu nomor pada beberapa akun) MENAHAN klaim otomatis;
 *  - kode aslinya tidak pernah tersimpan (hanya hash + salt) dan jejak klaim
 *    tercatat di `klaimPeminjam`, audit trail, dan log login.
 *
 * Fonnte dipanggil dari server, jadi tes mengganti `globalThis.fetch` dan
 * membaca kode dari PESAN KELUAR — satu-satunya tempat kode aslinya hidup.
 *
 * Menjalankan: bunx vitest run src/convex/klaimPeminjam.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const NOMOR = "6281234567890";
const NOMOR_BARU = "628111222333";
const TOKEN_UJI = "token-uji-fonnte";

type KeluarFonnte = { target: string; message: string };

/** Ganti `fetch` dengan Fonnte palsu yang selalu sukses. */
function pasangFonnte() {
  const asli = globalThis.fetch;
  const keluar: KeluarFonnte[] = [];
  process.env.FONNTE_TOKEN = TOKEN_UJI;
  globalThis.fetch = (async (
    _url: unknown,
    init?: { body?: unknown },
  ) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push({
      target: body.get("target") ?? "",
      message: body.get("message") ?? "",
    });
    return new Response(JSON.stringify({ status: true, detail: "success! message in queue" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    keluar,
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    },
  };
}

/** Kode 6 digit yang benar-benar dikirim keluar. */
function kodeTerkirim(keluar: KeluarFonnte[]): string {
  const kode = (keluar[0]?.message ?? "").match(/\d{6}/)?.[0] ?? "";
  expect(kode).toHaveLength(6);
  return kode;
}

/**
 * Data lama satu nasabah: 1 pinjaman berjalan (Rp1.000.000), 1 gadai, 1 kredit
 * barang, plus master identitas + KYC — semuanya milik SATU akun (akun impor
 * yang dibuat admin, tanpa kredensial).
 */
async function seedPeminjamLama(
  t: KonteksUji,
  nomor = NOMOR,
  nama = "PEMINJAM LAMA",
): Promise<Id<"users">> {
  const { userId } = await buatPengguna(t, nama, { role: "peminjam" });
  await t.run(async (ctx) => {
    // Akun impor: dibuat admin (tanpa kredensial) — nomor tidak disimpan di
    // `users`, melainkan pada master identitas & pengajuan, seperti data nyata.
    await ctx.db.patch(userId, { dibuatAdminPada: Date.now() });
    await ctx.db.insert("nasabahProfil", {
      userId,
      namaLengkap: nama,
      nik: "3201234567890001",
      nomorWhatsApp: nomor,
      diperbaruiPada: Date.now(),
      diperbaruiOlehLabel: "migrasi data lama",
      sumber: "admin",
    });
    await ctx.db.insert("kycProfil", {
      userId,
      status: "VERIFIED",
      namaLengkap: nama,
      nik: "3201234567890001",
      nomorWhatsApp: nomor,
      dibuatPada: Date.now(),
      diperbaruiPada: Date.now(),
    });
    await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha warung",
      namaLengkap: nama,
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: "PGD-LAMA-1",
      tenorHari: 30,
      nomorWhatsApp: nomor,
      didanaiPada: Date.now() - 5 * 24 * 60 * 60 * 1000,
    });
    await ctx.db.insert("pawns", {
      userId,
      deskripsiBarang: "Laptop",
      kategori: "Elektronik",
      alamatPenilaian: "Bandung",
      namaLengkap: nama,
      nomorRekening: "1234567890",
      status: "aktif",
      nomorReferensi: "PGD-LAMA-G1",
      pokokGadai: 500_000,
      sisaPokok: 400_000,
    });
    await ctx.db.insert("kreditBarang", {
      userId,
      nomorReferensi: "PGD-LAMA-K1",
      namaBarang: "Laptop Uji",
      kategori: "Elektronik",
      merchant: "Toko Elektronik Uji",
      hargaBarang: 2_000_000,
      dpPersen: 20,
      tenorBulan: 3,
      marginPersenPerBulan: 2,
      status: "didanai",
      namaLengkap: nama,
      nik: "3201234567890001",
      nomorRekening: "1234567890",
      nomorWhatsApp: nomor,
    });
  });
  return userId;
}

describe("mintaKodeKlaim", () => {
  it("menolak nomor tanpa data lama dan tidak mengirim apa pun", async () => {
    const t = convexTest(schema, modules);
    const fonnte = pasangFonnte();
    try {
      const hasil = await t.action(api.klaimPeminjam.mintaKodeKlaim, { nomor: NOMOR_BARU });
      expect(hasil.ok).toBe(false);
      expect(hasil.terkirim).toBe(false);
      expect(hasil.pesan).toMatch(/belum terdaftar/i);
      expect(fonnte.keluar).toHaveLength(0);
      const tantangan = await t.run((ctx) => ctx.db.query("klaimOtp").collect());
      expect(tantangan).toHaveLength(0);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("mengirim kode ke pemilik data lama dan hanya menyimpan hash-nya", async () => {
    const t = convexTest(schema, modules);
    await seedPeminjamLama(t);
    const fonnte = pasangFonnte();
    try {
      const hasil = await t.action(api.klaimPeminjam.mintaKodeKlaim, {
        nomor: "081234567890",
      });
      expect(hasil.ok).toBe(true);
      expect(hasil.terkirim).toBe(true);
      expect(hasil.nomorTampil).toBe("62812•••••890");
      expect(hasil.berkasLama).toBe(3);
      expect(fonnte.keluar[0]?.target).toBe(NOMOR);

      const kode = kodeTerkirim(fonnte.keluar);
      const baris = await t.run((ctx) => ctx.db.query("klaimOtp").collect());
      expect(baris).toHaveLength(1);
      expect(baris[0].nomor).toBe(NOMOR);
      expect(baris[0].statusPengiriman).toBe("terkirim");
      expect(baris[0].kodeHash).not.toBe(kode);
      expect(baris[0].salt.length).toBeGreaterThan(0);
      // Kode aslinya tidak boleh ada di baris mana pun.
      expect(JSON.stringify(baris[0])).not.toContain(kode);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("menahan klaim saat satu nomor tercatat pada lebih dari satu akun", async () => {
    const t = convexTest(schema, modules);
    await seedPeminjamLama(t);
    const duplikat = await seedPeminjamLama(t, NOMOR, "PEMINJAM GANDA");
    expect(duplikat).toBeTruthy();
    const fonnte = pasangFonnte();
    try {
      const hasil = await t.action(api.klaimPeminjam.mintaKodeKlaim, { nomor: NOMOR });
      expect(hasil.ok).toBe(false);
      expect(hasil.pesan).toMatch(/akun berbeda/i);
      expect(fonnte.keluar).toHaveLength(0);
    } finally {
      fonnte.pulihkan();
    }
  });
});

describe("login peminjam lama (kode → akun pemilik data)", () => {
  it("masuk ke akun pemilik data lama tanpa memindahkan berkas", async () => {
    const t = convexTest(schema, modules);
    const akunLama = await seedPeminjamLama(t);
    const fonnte = pasangFonnte();
    try {
      const minta = await t.action(api.klaimPeminjam.mintaKodeKlaim, { nomor: NOMOR });
      expect(minta.ok).toBe(true);
      const kode = kodeTerkirim(fonnte.keluar);

      const masuk = await t.mutation(internal.klaimPeminjam._klaimUntukMasuk, {
        nomor: NOMOR,
        kode,
      });
      expect(masuk.ok).toBe(true);
      if (!masuk.ok) throw new Error("klaim seharusnya berhasil");
      expect(masuk.userId).toBe(akunLama);

      // Berkass tetap pada pemiliknya (tidak ada yang berpindah).
      const loans = await t.run((ctx) => ctx.db.query("loans").collect());
      expect(loans).toHaveLength(1);
      expect(loans[0].userId).toBe(akunLama);
      expect(loans[0].klaimDariUserId).toBeUndefined();

      // Jejak klaim tetap tercatat sebagai cara masuk.
      const jejak = await t.run((ctx) => ctx.db.query("klaimPeminjam").collect());
      expect(jejak).toHaveLength(1);
      expect(jejak[0].metode).toBe("otp_whatsapp");
      expect(jejak[0].userId).toBe(akunLama);
      expect(jejak[0].akunLamaUserId).toBeUndefined();

      const log = await t.run((ctx) => ctx.db.query("loginLogs").collect());
      expect(log.some((baris) => baris.metode === "otp_whatsapp" && baris.status === "berhasil")).toBe(
        true,
      );
    } finally {
      fonnte.pulihkan();
    }
  });

  it("menolak kode salah, menghitungnya, lalu menerima kode yang benar", async () => {
    const t = convexTest(schema, modules);
    await seedPeminjamLama(t);
    const fonnte = pasangFonnte();
    try {
      await t.action(api.klaimPeminjam.mintaKodeKlaim, { nomor: NOMOR });
      const kode = kodeTerkirim(fonnte.keluar);
      const salah = kode === "000000" ? "111111" : "000000";

      const gagal = await t.mutation(internal.klaimPeminjam._klaimUntukMasuk, {
        nomor: NOMOR,
        kode: salah,
      });
      expect(gagal.ok).toBe(false);
      if (gagal.ok) throw new Error("kode salah tidak boleh lolos");
      expect(gagal.pesan).toMatch(/salah/i);

      const baris = await t.run((ctx) => ctx.db.query("klaimOtp").collect());
      expect(baris[0].percobaanGagal).toBe(1);
      expect(baris[0].dipakaiPada).toBeUndefined();

      const benar = await t.mutation(internal.klaimPeminjam._klaimUntukMasuk, {
        nomor: NOMOR,
        kode,
      });
      expect(benar.ok).toBe(true);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("menolak pemakaian ulang kode yang sudah dipakai", async () => {
    const t = convexTest(schema, modules);
    await seedPeminjamLama(t);
    const fonnte = pasangFonnte();
    try {
      await t.action(api.klaimPeminjam.mintaKodeKlaim, { nomor: NOMOR });
      const kode = kodeTerkirim(fonnte.keluar);
      const pertama = await t.mutation(internal.klaimPeminjam._klaimUntukMasuk, {
        nomor: NOMOR,
        kode,
      });
      expect(pertama.ok).toBe(true);

      const kedua = await t.mutation(internal.klaimPeminjam._klaimUntukMasuk, {
        nomor: NOMOR,
        kode,
      });
      expect(kedua.ok).toBe(false);
      if (kedua.ok) throw new Error("kode sekali pakai tidak boleh dipakai dua kali");
      expect(kedua.pesan).toMatch(/sudah dipakai/i);
    } finally {
      fonnte.pulihkan();
    }
  });
});

describe("claimOrLoginBorrower dari sesi aktif", () => {
  it("menautkan berkas impor ke akun sesi tanpa mengubah nilai finansialnya", async () => {
    const t = convexTest(schema, modules);
    const akunLama = await seedPeminjamLama(t);
    const { sesi, userId: akunSesi } = await buatPengguna(t, "Peminjam Sesi", {
      email: "sesi@pindai.test",
      role: "peminjam",
    });
    expect(akunSesi).not.toBe(akunLama);

    const fonnte = pasangFonnte();
    try {
      await t.action(api.klaimPeminjam.mintaKodeKlaim, { nomor: NOMOR });
      const kode = kodeTerkirim(fonnte.keluar);

      const hasil = await sesi.mutation(api.klaimPeminjam.claimOrLoginBorrower, {
        phoneNumber: NOMOR,
        otpCode: kode,
      });
      expect(hasil.ok).toBe(true);
      expect(hasil.dipindahkan.pinjaman).toBe(1);
      expect(hasil.dipindahkan.gadai).toBe(1);
      expect(hasil.dipindahkan.kredit).toBe(1);
      expect(hasil.dipindahkan.pokokPinjaman).toBe(1_000_000);

      const loans = await t.run((ctx) => ctx.db.query("loans").collect());
      expect(loans[0].userId).toBe(akunSesi);
      expect(loans[0].nasabahUserId).toBe(akunSesi);
      expect(loans[0].klaimDariUserId).toBe(akunLama);
      // Nilai finansial TIDAK berubah.
      expect(loans[0].pokokPinjaman).toBe(1_000_000);
      expect(loans[0].status).toBe("didanai");

      const profil = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
      expect(profil[0].userId).toBe(akunSesi);
      const kyc = await t.run((ctx) => ctx.db.query("kycProfil").collect());
      expect(kyc[0].userId).toBe(akunSesi);
      const pawns = await t.run((ctx) => ctx.db.query("pawns").collect());
      expect(pawns[0].userId).toBe(akunSesi);
      const kredit = await t.run((ctx) => ctx.db.query("kreditBarang").collect());
      expect(kredit[0].userId).toBe(akunSesi);

      const jejak = await t.run((ctx) => ctx.db.query("klaimPeminjam").collect());
      expect(jejak).toHaveLength(1);
      expect(jejak[0].userId).toBe(akunSesi);
      expect(jejak[0].akunLamaUserId).toBe(akunLama);
      expect(jejak[0].metode).toBe("sesi_aktif");
      expect(jejak[0].pinjaman).toBe(1);

      const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
      expect(audit.some((baris) => baris.aksi === "klaim_peminjam_lama")).toBe(true);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("butuh sesi: klaim tanpa masuk ditolak", async () => {
    const t = convexTest(schema, modules);
    await seedPeminjamLama(t);
    await expect(
      t.mutation(api.klaimPeminjam.claimOrLoginBorrower, {
        phoneNumber: NOMOR,
        otpCode: "123456",
      }),
    ).rejects.toThrow(/Harus masuk/i);
  });
});

describe("ringkasanKlaimSaya", () => {
  it("menampilkan riwayat historis peminjam lama (bukan dashboard kosong)", async () => {
    const t = convexTest(schema, modules);
    await seedPeminjamLama(t);
    const { sesi, userId } = await buatPengguna(t, "Peminjam Sesi", {
      email: "riwayat@pindai.test",
      role: "peminjam",
    });
    const fonnte = pasangFonnte();
    try {
      await t.action(api.klaimPeminjam.mintaKodeKlaim, { nomor: NOMOR });
      const kode = kodeTerkirim(fonnte.keluar);
      await sesi.mutation(api.klaimPeminjam.claimOrLoginBorrower, {
        phoneNumber: NOMOR,
        otpCode: kode,
      });

      const ringkas = await sesi.query(api.klaimPeminjam.ringkasanKlaimSaya, {});
      expect(ringkas).not.toBeNull();
      if (ringkas === null) throw new Error("ringkasan seharusnya ada");
      expect(ringkas.sudahKlaim).toBe(true);
      expect(ringkas.klaimTerbaru?.nomorTampil).toBe("62812•••••890");
      expect(ringkas.ringkasan.pinjaman).toBe(1);
      expect(ringkas.ringkasan.pinjamanAktif).toBe(1);
      expect(ringkas.ringkasan.pinjamanLunas).toBe(0);
      expect(ringkas.ringkasan.pokokPinjaman).toBe(1_000_000);
      expect(ringkas.ringkasan.gadai).toBe(1);
      expect(ringkas.ringkasan.kredit).toBe(1);
      expect(ringkas.pinjaman[0]?.nomorReferensi).toBe("PGD-LAMA-1");
      expect(ringkas.pinjaman[0]?.skema).toBe("harian");
      expect(userId).toBeTruthy();
    } finally {
      fonnte.pulihkan();
    }
  });

  it("menawarkan klaim bila nomor akun ini masih punya data lama milik akun lain", async () => {
    const t = convexTest(schema, modules);
    await seedPeminjamLama(t);
    const { sesi } = await buatPengguna(t, "Peminjam Baru", {
      email: "baru@pindai.test",
      role: "peminjam",
    });
    // Nomor lama dipasang pada akun BARU (mis. hasil sinkronisasi KYC), sedangkan
    // pemilik berkas lama masih akun impor.
    await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      const baru = users.find((u) => u.email === "baru@pindai.test");
      if (baru === undefined) throw new Error("pengguna uji tidak ditemukan");
      await ctx.db.insert("nasabahProfil", {
        userId: baru._id,
        namaLengkap: "PEMINJAM BARU",
        nik: "3201234567890009",
        nomorWhatsApp: NOMOR,
        diperbaruiPada: Date.now(),
        diperbaruiOlehLabel: "nasabah",
        sumber: "nasabah",
      });
    });

    const ringkas = await sesi.query(api.klaimPeminjam.ringkasanKlaimSaya, {});
    expect(ringkas).not.toBeNull();
    if (ringkas === null) throw new Error("ringkasan seharusnya ada");
    expect(ringkas.sudahKlaim).toBe(false);
    expect(ringkas.nomorTersimpanTampil).toBe("62812•••••890");
    expect(ringkas.tawaranKlaim).not.toBeNull();
    expect(ringkas.tawaranKlaim?.berkas.pinjaman).toBeGreaterThan(0);
  });
});
