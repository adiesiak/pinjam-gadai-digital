/**
 * Uji penilaian risiko nasabah: grade sistem + override admin berjejak.
 *
 * Yang dibuktikan:
 *  - detail nasabah membawa grade sistem + komponen berbobot (7 komponen,
 *    total bobot 100) dan menghitung sinyal KYC/data diri dari DATA SERVER,
 *    bukan dari payload klien;
 *  - override admin menyimpan grade sistem apa adanya (selisih terlihat),
 *    menulis audit trail, dan TIDAK menyentuh pinjaman;
 *  - override append-only: riwayat lama tidak pernah ditimpa/dihapus;
 *  - alasan terlalu pendek / grade tak dikenal / akun non-admin ditolak.
 *
 * Menjalankan: bunx vitest run src/convex/risiko.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { BOBOT_RISIKO } from "../lib/risikoNasabah";
import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI_MS = 86_400_000;
const buatKontek = () => convexTest(schema, modules);

/** Nasabah dengan satu pinjaman LUNAS tepat waktu + profil & KYC lengkap. */
async function seed(t: KonteksUji) {
  const { userId } = await siapkanPengguna(t, "peminjam-risiko", {
    email: "peminjam-risiko@pindai.test",
    role: "peminjam",
  });
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456789",
      status: "lunas",
      nomorReferensi: "PGD-RISIKO-1",
      tenorHari: 30,
      didanaiPada: now - 40 * HARI_MS,
      lunasPada: now - 20 * HARI_MS,
    });
    await ctx.db.insert("nasabahProfil", {
      userId,
      namaLengkap: "RANI PEMINJAM",
      nik: "3201234567890001",
      nomorWhatsApp: "628123456789",
      alamat: "Jl. Contoh No. 1",
      pekerjaan: "Pedagang",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      diperbaruiPada: now,
      diperbaruiOlehLabel: "admin",
    });
    await ctx.db.insert("kycProfil", {
      userId,
      status: "VERIFIED",
      dibuatPada: now,
      diperbaruiPada: now,
    });
  });
  return { userId };
}

describe("risiko nasabah: grade sistem & override", () => {
  it("detail nasabah membawa grade sistem berbobot + komponen", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-risiko", {
      email: "admin-risiko@pindai.test",
      role: "admin",
    });
    const { userId } = await seed(t);

    const detail = await asAdmin.query(api.nasabah.detailNasabah, { userId });
    expect(detail).not.toBeNull();
    const risiko = detail!.profilRisiko;
    expect(risiko.komponen).toHaveLength(7);
    expect(risiko.komponen.reduce((a, k) => a + k.bobot, 0)).toBe(100);
    // Pelunasan tepat waktu + KYC VERIFIED + data diri lengkap → grade baik.
    expect(["A", "B"]).toContain(risiko.grade);
    expect(risiko.jumlah.lunas).toBe(1);
    // Sinyal identitas dibaca dari server, bukan dari klien.
    const kyc = risiko.komponen.find((k) => k.kunci === "verifikasiIdentitas");
    expect(kyc?.kontribusi).toBe(BOBOT_RISIKO.verifikasiIdentitas);
    expect(detail!.risiko.gradeEfektif).toBe(risiko.grade);
    expect(detail!.risiko.ditimpa).toBe(false);
    expect(detail!.riwayatOverrideRisiko).toHaveLength(0);
  });

  it("override mencatat grade sistem, alasan, dan audit — pinjaman tidak berubah", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-risiko2", {
      email: "admin-risiko2@pindai.test",
      role: "admin",
    });
    const { userId } = await seed(t);

    const hasil = await asAdmin.mutation(api.nasabah.overrideRisiko, {
      userId,
      grade: "D",
      alasan: "Temuan lapangan menunjukkan risiko gagal bayar yang belum tercatat.",
    });
    expect(hasil.ok).toBe(true);
    expect(hasil.gradeSistem).not.toBe("D");

    const detail = await asAdmin.query(api.nasabah.detailNasabah, { userId });
    expect(detail!.risiko.gradeEfektif).toBe("D");
    expect(detail!.risiko.gradeSistem).toBe(hasil.gradeSistem);
    expect(detail!.risiko.ditimpa).toBe(true);
    expect(detail!.riwayatOverrideRisiko).toHaveLength(1);
    expect(detail!.riwayatOverrideRisiko[0].gradeSistem).toBe(hasil.gradeSistem);
    expect(detail!.riwayatOverrideRisiko[0].skorSistem).toBe(hasil.skorSistem);

    // Override risiko TIDAK boleh menyentuh data pinjaman.
    const loans = await t.run((ctx) => ctx.db.query("loans").collect());
    expect(loans).toHaveLength(1);
    expect(loans[0].status).toBe("lunas");

    const auditRows = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "override_risiko"))
        .collect(),
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].detail).toContain("D");
  });

  it("override kedua menambah riwayat tanpa menghapus yang pertama", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-risiko3", {
      email: "admin-risiko3@pindai.test",
      role: "admin",
    });
    const { userId } = await seed(t);

    await asAdmin.mutation(api.nasabah.overrideRisiko, {
      userId,
      grade: "D",
      alasan: "Temuan lapangan menunjukkan risiko gagal bayar yang belum tercatat.",
    });
    await asAdmin.mutation(api.nasabah.overrideRisiko, {
      userId,
      grade: "B",
      alasan: "Nasabah melunasi tunggakan dan menyerahkan jaminan tambahan.",
    });

    const detail = await asAdmin.query(api.nasabah.detailNasabah, { userId });
    expect(detail!.riwayatOverrideRisiko).toHaveLength(2);
    // Terbaru lebih dulu → yang berlaku adalah B.
    expect(detail!.riwayatOverrideRisiko[0].gradeOverride).toBe("B");
    expect(detail!.riwayatOverrideRisiko[1].gradeOverride).toBe("D");
    expect(detail!.risiko.gradeEfektif).toBe("B");
  });

  it("menolak alasan pendek, grade tak dikenal, dan akun non-admin", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-risiko4", {
      email: "admin-risiko4@pindai.test",
      role: "admin",
    });
    const { sesi: asPeminjam } = await siapkanPengguna(t, "peminjam-risiko4", {
      email: "peminjam-risiko4@pindai.test",
      role: "peminjam",
    });
    const { userId } = await seed(t);

    await expect(
      asAdmin.mutation(api.nasabah.overrideRisiko, { userId, grade: "B", alasan: "singkat" }),
    ).rejects.toThrow(/minimal/i);
    await expect(
      asAdmin.mutation(api.nasabah.overrideRisiko, {
        userId,
        grade: "Z",
        alasan: "Alasan yang cukup panjang untuk lolos validasi.",
      }),
    ).rejects.toThrow(/tidak dikenali/i);
    await expect(
      asPeminjam.mutation(api.nasabah.overrideRisiko, {
        userId,
        grade: "A",
        alasan: "Mencoba menaikkan grade sendiri tanpa wewenang.",
      }),
    ).rejects.toThrow(/Super Admin/i);

    // Tidak ada satu pun override yang tersimpan dari percobaan gagal.
    const rows = await t.run((ctx) => ctx.db.query("risikoOverride").collect());
    expect(rows).toHaveLength(0);
  });
});
