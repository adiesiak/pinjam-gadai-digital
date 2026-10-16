/**
 * Tes pusat notifikasi in-app (`notifikasi.daftar`, `tandaiDibaca`,
 * `tandaiSemuaDibaca`).
 *
 * Yang dijaga di sini adalah janji modulnya, bukan tampilannya:
 *
 * - daftar SELALU dihitung dari catatan nyata (pengingat, peringatan lokasi,
 *   bukti pembayaran, pengumuman, keputusan KYC, perpindahan status pinjaman,
 *   dan pinjaman yang didanai akun penyedia dana) — tidak ada baris contoh yang
 *   dikarang,
 * - urutan mengikuti waktu server, terbaru lebih dulu,
 * - keadaan baca milik masing-masing pengguna dan tersimpan di server; peringatan
 *   lokasi memakai `dibacaPada` pada barisnya sendiri (satu keadaan, satu tempat),
 * - kunci yang tidak (lagi) ada di daftar ditolak, sehingga klien basi tidak bisa
 *   menumpuk baris baca untuk notifikasi yang tidak pernah ada.
 *
 * Menjalankan: bunx vitest run src/convex/notifikasi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, simpanBerkasUji, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

/** Waktu dasar yang jauh di masa lalu, supaya urutan tidak bergantung jam uji. */
const T0 = Date.UTC(2026, 8, 1, 0, 0, 0);

type Fixture = {
  loanId: Id<"loans">;
  pengingatId: Id<"pengingat">;
  lokasiId: Id<"lokasiPeringatan">;
  buktiId: Id<"manualPaymentReceipts">;
  pengumumanPada: number;
  kycRiwayatId: Id<"kycRiwayat">;
};

/**
 * Isi sumber notifikasi untuk satu pengguna. Bentuk barisnya sama
 * dengan yang ditulis proses nyata (cron pengingat, heuristik lokasi, unggahan
 * bukti pembayaran, CMS pengumuman) — bukan bentuk khusus untuk tes.
 */
async function isiNotifikasi(
  t: KonteksUji,
  userId: Id<"users">,
  opsi: { lokasiDibaca?: boolean } = {},
): Promise<Fixture> {
  const buktiPembayaranId = await simpanBerkasUji(t, "bukti-transfer");
  const pengumumanPada = T0 + 3_000;

  return t.run(async (ctx) => {
    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "Rina Notifikasi",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: "PND-NOTIF-1",
      tenorHari: 30,
      didanaiPada: T0,
    });

    const pengingatId = await ctx.db.insert("pengingat", {
      loanId,
      tanggal: T0,
      jenis: "terlambat",
      sisaHari: -2,
      jumlahKewajiban: 1_300_000,
      waktu: T0,
    });

    const lokasiId = await ctx.db.insert("lokasiPeringatan", {
      userId,
      tanda: ["koordinat_identik"],
      loanId,
      lat: -6.2,
      lng: 106.8,
      jenis: "peringatan",
      waStatus: "terkirim",
      waktu: T0 + 1_000,
      ...(opsi.lokasiDibaca === true ? { dibacaPada: T0 + 2_000 } : {}),
    });

    const buktiId = await ctx.db.insert("manualPaymentReceipts", {
      userId,
      jenis: "pinjaman",
      loanId,
      jumlah: 500_000,
      metodePembayaran: "transfer",
      tanggalTransfer: T0,
      referensiTransfer: "TRF-NOTIF-1",
      buktiPembayaranId,
      status: "menunggu_pencocokan",
      nomorReferensi: "BUKTI-NOTIF-1",
    });

    await ctx.db.insert("pengumuman", {
      slot: "global",
      teks: "Jadwal layanan kantor berubah selama libur nasional.",
      tautan: "/dashboard",
      aktif: true,
      diperbaruiPada: pengumumanPada,
    });

    // Keputusan KYC oleh petugas: transisi ini yang menjadi kabar bagi nasabah.
    const kycRiwayatId = await ctx.db.insert("kycRiwayat", {
      userId,
      dari: "PENDING_REVIEW",
      ke: "NEEDS_CORRECTION",
      aktor: "admin",
      aktorLabel: "admin@pindai.test",
      alasan: "dokumen_buram",
      catatan: "Ulangi foto KTP.",
      waktu: T0 + 500,
    });

    return { loanId, pengingatId, lokasiId, buktiId, pengumumanPada, kycRiwayatId };
  });
}

describe("pusat notifikasi: daftar dari sumber nyata", () => {
  it("menyusun item dari sumber nyata (termasuk status pinjaman), terurut waktu server terbaru dulu", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "peminjam-notif", {
      email: "peminjam-notif@pindai.test",
      role: "peminjam",
    });
    const f = await isiNotifikasi(t, userId);

    const hasil = await sesi.query(api.notifikasi.daftar, {});

    // Bukti pembayaran dibuat "sekarang" (creationTime) — paling baru.
    expect(hasil.item.map((it) => it.kunci)).toEqual([
      `bukti:${f.buktiId}`,
      `pengumuman:${f.pengumumanPada}`,
      `lokasi:${f.lokasiId}`,
      `kyc:${f.kycRiwayatId}`,
      `pengingat:${f.pengingatId}`,
      // Sumber baru: perpindahan status pinjaman (waktu dari didanaiPada).
      `pinjaman:${f.loanId}:didanai`,
    ]);
    expect(hasil.belumDibaca).toBe(6);

    const cari = (kunci: string) => {
      const it = hasil.item.find((x) => x.kunci === kunci);
      if (it === undefined) throw new Error(`tidak ada item ${kunci}`);
      return it;
    };

    // Item status pinjaman: kabar nyata dari perpindahan status, bukan karangan.
    const pinjaman = cari(`pinjaman:${f.loanId}:didanai`);
    expect(pinjaman.jenis).toBe("sukses");
    expect(pinjaman.judul).toBe("Pinjaman Anda mulai berjalan");
    expect(pinjaman.ringkasan).toContain("PND-NOTIF-1");
    expect(pinjaman.tautan).toBe("/dashboard?tab=jadwal");

    // Item keputusan KYC: hanya transisi keputusan yang menjadi kabar.
    const kyc = cari(`kyc:${f.kycRiwayatId}`);
    expect(kyc.jenis).toBe("peringatan");
    expect(kyc.judul).toBe("Verifikasi identitas perlu diperbaiki");
    expect(kyc.ringkasan).toContain("admin@pindai.test");
    expect(kyc.ringkasan).toContain("Ulangi foto KTP.");
    expect(kyc.tautan).toBe("/dashboard?tab=kyc");

    // Keempat jenis dibedakan, dan isinya berasal dari catatan nyata.
    const pengingat = cari(`pengingat:${f.pengingatId}`);
    expect(pengingat.jenis).toBe("error");
    expect(pengingat.judul).toBe("Catatan pinjaman terlambat 2 hari");
    expect(pengingat.ringkasan).toContain("PND-NOTIF-1");
    expect(pengingat.tautan).toBe("/dashboard?tab=jadwal");

    const lokasi = cari(`lokasi:${f.lokasiId}`);
    expect(lokasi.jenis).toBe("peringatan");
    expect(lokasi.ringkasan).toContain("koordinat_identik");
    // Status pengiriman WhatsApp dilaporkan apa adanya — bukan diasumsikan.
    expect(lokasi.ringkasan).toContain("tercatat terkirim");

    const bukti = cari(`bukti:${f.buktiId}`);
    expect(bukti.jenis).toBe("info");
    expect(bukti.tautan).toBe("/dashboard?tab=riwayat");

    const pengumuman = cari(`pengumuman:${f.pengumumanPada}`);
    expect(pengumuman.jenis).toBe("info");
    expect(pengumuman.ringkasan).toBe(
      "Jadwal layanan kantor berubah selama libur nasional.",
    );
  });

  it("tidak mengarang notifikasi: pengumuman nonaktif/kosong dan sumber lain yang tidak ada tidak muncul", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPengguna(t, "peminjam-kosong", {
      email: "peminjam-kosong@pindai.test",
      role: "peminjam",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("pengumuman", {
        slot: "global",
        teks: "Teks ada tapi bar tidak aktif.",
        aktif: false,
        diperbaruiPada: T0,
      });
    });

    const hasil = await sesi.query(api.notifikasi.daftar, {});
    expect(hasil.item).toEqual([]);
    expect(hasil.belumDibaca).toBe(0);
  });

  it("memisahkan keadaan baca antar pengguna", async () => {
    const t = convexTest(schema, modules);
    const { sesi: sesiA, userId: userIdA } = await siapkanPengguna(t, "peminjam-a", {
      email: "peminjam-a@pindai.test",
      role: "peminjam",
    });
    const { sesi: sesiB } = await siapkanPengguna(t, "peminjam-b", {
      email: "peminjam-b@pindai.test",
      role: "peminjam",
    });
    const f = await isiNotifikasi(t, userIdA);

    await sesiA.mutation(api.notifikasi.tandaiSemuaDibaca, {});

    const hasilA = await sesiA.query(api.notifikasi.daftar, {});
    expect(hasilA.belumDibaca).toBe(0);

    // Pengguna lain tidak melihat notifikasi pribadi milik A, dan keadaan baca A
    // tidak menular: pengumuman (satu baris global) memang terlihat semua orang,
    // tapi tetap belum dibaca bagi B.
    const hasilB = await sesiB.query(api.notifikasi.daftar, {});
    expect(hasilB.item.map((it) => it.kunci)).toEqual([`pengumuman:${f.pengumumanPada}`]);
    expect(hasilB.belumDibaca).toBe(1);

    // Baris baca tersimpan per pengguna.
    const baca = await t.run((ctx) => ctx.db.query("notifikasiBaca").collect());
    expect(baca.every((b) => b.userId === userIdA)).toBe(true);
    expect(baca.map((b) => b.kunci).sort()).toEqual(
      [
        `bukti:${f.buktiId}`,
        `pengumuman:${f.pengumumanPada}`,
        `kyc:${f.kycRiwayatId}`,
        `pengingat:${f.pengingatId}`,
        `pinjaman:${f.loanId}:didanai`,
      ].sort(),
    );
  });

  it("menolak akun tamu", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await buatPengguna(t, "tamu-notif", { isAnonymous: true });
    await expect(sesi.query(api.notifikasi.daftar, {})).rejects.toThrow(
      /Masuk dengan akun terverifikasi/,
    );
  });
});

describe("pusat notifikasi: menandai dibaca", () => {
  it("menyimpan keadaan baca satu notifikasi dan menurunkan jumlah belum dibaca", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "peminjam-baca", {
      email: "peminjam-baca@pindai.test",
      role: "peminjam",
    });
    const f = await isiNotifikasi(t, userId);

    const hasil = await sesi.mutation(api.notifikasi.tandaiDibaca, {
      kunci: `pengingat:${f.pengingatId}`,
    });
    expect(hasil).toEqual({ ok: true, sudahDibaca: false });

    const setelah = await sesi.query(api.notifikasi.daftar, {});
    expect(setelah.belumDibaca).toBe(5);
    expect(setelah.item.find((it) => it.kunci === `pengingat:${f.pengingatId}`)?.dibaca).toBe(true);

    // Satu baris baca, dan pengulangan tidak menambah baris kedua.
    const ulang = await sesi.mutation(api.notifikasi.tandaiDibaca, {
      kunci: `pengingat:${f.pengingatId}`,
    });
    expect(ulang).toEqual({ ok: true, sudahDibaca: true });
    const baca = await t.run((ctx) => ctx.db.query("notifikasiBaca").collect());
    expect(baca).toHaveLength(1);
    expect(baca[0]).toMatchObject({
      userId,
      kunci: `pengingat:${f.pengingatId}`,
      sumber: "pengingat",
    });
  });

  it("peringatan lokasi dibaca lewat dibacaPada pada barisnya sendiri", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "peminjam-lokasi", {
      email: "peminjam-lokasi@pindai.test",
      role: "peminjam",
    });
    const f = await isiNotifikasi(t, userId);

    await sesi.mutation(api.notifikasi.tandaiDibaca, { kunci: `lokasi:${f.lokasiId}` });

    const baris = await t.run((ctx) => ctx.db.get(f.lokasiId));
    expect(baris?.dibacaPada).toBeTypeOf("number");
    // Satu keadaan, satu tempat: peringatan lokasi TIDAK menulis notifikasiBaca.
    const baca = await t.run((ctx) => ctx.db.query("notifikasiBaca").collect());
    expect(baca).toHaveLength(0);

    const setelah = await sesi.query(api.notifikasi.daftar, {});
    expect(setelah.item.find((it) => it.kunci === `lokasi:${f.lokasiId}`)?.dibaca).toBe(true);
    expect(setelah.belumDibaca).toBe(5);
  });

  it("menghormati dibacaPada yang sudah ada dan tidak menimpanya", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "peminjam-sudah", {
      email: "peminjam-sudah@pindai.test",
      role: "peminjam",
    });
    const f = await isiNotifikasi(t, userId, { lokasiDibaca: true });

    const hasil = await sesi.query(api.notifikasi.daftar, {});
    expect(hasil.item.find((it) => it.kunci === `lokasi:${f.lokasiId}`)?.dibaca).toBe(true);
    expect(hasil.belumDibaca).toBe(5);

    await sesi.mutation(api.notifikasi.tandaiDibaca, { kunci: `lokasi:${f.lokasiId}` });
    const baris = await t.run((ctx) => ctx.db.get(f.lokasiId));
    expect(baris?.dibacaPada).toBe(T0 + 2_000);
  });

  it("menolak kunci yang tidak ada di daftar yang sedang berlaku", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "peminjam-palsu", {
      email: "peminjam-palsu@pindai.test",
      role: "peminjam",
    });
    await isiNotifikasi(t, userId);

    await expect(
      sesi.mutation(api.notifikasi.tandaiDibaca, { kunci: "pengingat:tidak-ada" }),
    ).rejects.toThrow(/tidak ditemukan atau sudah tidak berlaku/);
    const baca = await t.run((ctx) => ctx.db.query("notifikasiBaca").collect());
    expect(baca).toHaveLength(0);
  });

  it("tandai semua dibaca memakai daftar dari server, bukan daftar klien", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "peminjam-semua", {
      email: "peminjam-semua@pindai.test",
      role: "peminjam",
    });
    const f = await isiNotifikasi(t, userId);

    const hasil = await sesi.mutation(api.notifikasi.tandaiSemuaDibaca, {});
    expect(hasil).toEqual({ ok: true, ditandai: 6 });

    const setelah = await sesi.query(api.notifikasi.daftar, {});
    expect(setelah.belumDibaca).toBe(0);
    expect(setelah.item.every((it) => it.dibaca)).toBe(true);

    // Peringatan lokasi tetap lewat kolomnya sendiri.
    const baris = await t.run((ctx) => ctx.db.get(f.lokasiId));
    expect(baris?.dibacaPada).toBeTypeOf("number");

    const kosong = await sesi.mutation(api.notifikasi.tandaiSemuaDibaca, {});
    expect(kosong).toEqual({ ok: true, ditandai: 0 });
  });
});

describe("pusat notifikasi: kabar untuk penyedia dana", () => {
  /** Pinjaman lunas dengan pemilik kanonik `pendanaId`. */
  async function seedPinjamanLunas(
    t: KonteksUji,
    opsi: { peminjamId: Id<"users">; pendanaId: Id<"users">; nomorReferensi: string },
  ): Promise<Id<"loans">> {
    return t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: opsi.peminjamId,
        pokokPinjaman: 2_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "lunas",
        nomorReferensi: opsi.nomorReferensi,
        tenorHari: 30,
        didanaiPada: T0,
        lunasPada: T0 + 86_400_000,
        pendanaId: opsi.pendanaId,
      }),
    );
  }

  it("pendana dikabari saat pinjaman yang didanainya lunas, peminjam tidak", async () => {
    const t = convexTest(schema, modules);
    const { sesi: sesiPendana, userId: pendanaId } = await siapkanPengguna(t, "Chatur Surya", {
      email: "chatur@pindai.test",
      role: "dana",
    });
    const { sesi: sesiPeminjam, userId: peminjamId } = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani-pendana@pindai.test",
      role: "peminjam",
    });
    const loanId = await seedPinjamanLunas(t, {
      peminjamId,
      pendanaId,
      nomorReferensi: "PND-PENDANA-1",
    });

    const kunci = `pendana:${loanId}:lunas`;
    const hasilPendana = await sesiPendana.query(api.notifikasi.daftar, {});
    expect(hasilPendana.item.map((it) => it.kunci)).toEqual([kunci]);
    expect(hasilPendana.belumDibaca).toBe(1);

    const kabar = hasilPendana.item.find((it) => it.kunci === kunci);
    expect(kabar?.jenis).toBe("sukses");
    expect(kabar?.judul).toBe("Pinjaman yang Anda danai tercatat lunas");
    expect(kabar?.ringkasan).toContain("PND-PENDANA-1");
    expect(kabar?.ringkasan).toContain("Rp 2.000.000");
    expect(kabar?.tautan).toBe("/penyedia-dana");

    // Sisi peminjam hanya menerima kabar pinjamannya sendiri.
    const hasilPeminjam = await sesiPeminjam.query(api.notifikasi.daftar, {});
    expect(hasilPeminjam.item.map((it) => it.kunci)).toEqual([`pinjaman:${loanId}:lunas`]);
  });

  it("baris warisan tanpa pendanaId tetap dikabari lewat alokasi lama, dan bisa ditandai dibaca", async () => {
    const t = convexTest(schema, modules);
    const { sesi: sesiPendana, userId: pendanaId } = await siapkanPengguna(t, "Asep Pendana", {
      email: "asep@pindai.test",
      role: "dana",
    });
    const { userId: peminjamId } = await buatPengguna(t, "Rani Warisan", {
      email: "rani-warisan@pindai.test",
      role: "peminjam",
    });

    // Pinjaman warisan: belum punya `pendanaId`, hanya baris alokasi lama.
    const loanId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Warisan",
        nomorRekening: "1234567890",
        status: "lunas",
        nomorReferensi: "PND-WARISAN-1",
        tenorHari: 30,
        didanaiPada: T0,
        lunasPada: T0 + 2_000,
      });
      await ctx.db.insert("fundings", {
        loanId: id,
        danaId: pendanaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "selesai",
        nomorReferensi: "ALO-WARISAN-1",
        diselesaikanPada: T0 + 2_000,
        imbalHasilNet: 1_170_000,
      });
      return id;
    });

    const kunci = `pendana:${loanId}:lunas`;
    const hasil = await sesiPendana.query(api.notifikasi.daftar, {});
    expect(hasil.item.map((it) => it.kunci)).toEqual([kunci]);

    const hasilBaca = await sesiPendana.mutation(api.notifikasi.tandaiDibaca, { kunci });
    expect(hasilBaca).toEqual({ ok: true, sudahDibaca: false });
    const setelah = await sesiPendana.query(api.notifikasi.daftar, {});
    expect(setelah.belumDibaca).toBe(0);

    const baca = await t.run((ctx) => ctx.db.query("notifikasiBaca").collect());
    expect(baca).toHaveLength(1);
    expect(baca[0]).toMatchObject({ userId: pendanaId, kunci, sumber: "pendana" });
  });

  it("tombol admin \"Tandai lunas\" menulis lunasPada dan mengabari peminjam serta pendana", async () => {
    const t = convexTest(schema, modules);
    const { sesi: sesiAdmin } = await siapkanPengguna(t, "admin-notif", {
      email: "admin-notif@pindai.test",
      role: "admin",
    });
    const { sesi: sesiPendana, userId: pendanaId } = await siapkanPengguna(t, "Chatur Surya", {
      email: "chatur2@pindai.test",
      role: "dana",
    });
    const { sesi: sesiPeminjam, userId: peminjamId } = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani-admin-lunas@pindai.test",
      role: "peminjam",
    });
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PND-ADMIN-LUNAS-1",
        tenorHari: 30,
        didanaiPada: T0,
        pendanaId,
      }),
    );

    await sesiAdmin.mutation(api.loans.ubahStatusPinjaman, { loanId, status: "lunas" });

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("lunas");
    expect(loan?.lunasPada).toBeTypeOf("number");

    const hasilPendana = await sesiPendana.query(api.notifikasi.daftar, {});
    expect(hasilPendana.item.map((it) => it.kunci)).toEqual([`pendana:${loanId}:lunas`]);

    const hasilPeminjam = await sesiPeminjam.query(api.notifikasi.daftar, {});
    expect(hasilPeminjam.item.map((it) => it.kunci)).toEqual([`pinjaman:${loanId}:lunas`]);
  });
});
