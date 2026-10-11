/**
 * Uji notifikasi KEPUTUSAN untuk nasabah (`convex/notifikasi.ts`).
 *
 * Dua sumber yang dibuktikan di sini:
 *  - `kycRiwayat` → keputusan verifikasi identitas (VERIFIED/REJECTED/
 *    NEEDS_CORRECTION/REVERIFICATION_REQUIRED). Transisi langkah nasabah
 *    sendiri (IN_PROGRESS) TIDAK menjadi notifikasi.
 *  - `loans` → perpindahan status pinjaman oleh petugas, dengan waktu yang
 *    berasal dari penanda perpindahan itu sendiri (`diputuskanPada` dari
 *    `setLoanStatus`, `didanaiPada`, `lunasPada`, `dibatalkanPada`).
 *
 * Yang dipegang: notifikasi TIDAK PERNAH dikarang. Baris lama tanpa penanda
 * waktu tidak menghasilkan notifikasi — lebih baik sunyi daripada salah tanggal.
 *
 * Menjalankan: bunx vitest run src/convex/notifikasiKeputusan.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji, type PenggunaUji } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

async function riwayatKyc(
  t: KonteksUji,
  userId: PenggunaUji["userId"],
  ke: string,
  aktor: "nasabah" | "admin" | "sistem",
  waktu: number,
  catatan?: string,
) {
  await t.run((ctx) =>
    ctx.db.insert("kycRiwayat", {
      userId,
      dari: "-",
      ke: ke as never,
      aktor,
      aktorLabel: aktor === "admin" ? "petugas@pindai.test" : "sistem",
      alasan: "uji",
      ...(catatan === undefined ? {} : { catatan }),
      waktu,
    }),
  );
}

async function pinjaman(
  t: KonteksUji,
  userId: PenggunaUji["userId"],
  overrides: Record<string, unknown>,
) {
  return await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456789",
      status: "diajukan",
      nomorReferensi: "PGD-NOTIF-1",
      tenorHari: 30,
      ...overrides,
    } as never),
  );
}

describe("notifikasi keputusan KYC & status pinjaman", () => {
  it("keputusan KYC muncul sebagai notifikasi dengan tautan tab KYC", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-kyc-notif", {
      email: "nasabah-kyc-notif@pindai.test",
      role: "peminjam",
    });
    const sekarang = Date.now();

    // Langkah nasabah sendiri TIDAK menjadi notifikasi.
    await riwayatKyc(t, nasabah.userId, "IN_PROGRESS", "nasabah", sekarang - 4000);
    const sebelum = await nasabah.sesi.query(api.notifikasi.daftar, {});
    expect(sebelum.item.filter((n) => n.tautan === "/dashboard?tab=kyc")).toHaveLength(0);

    await riwayatKyc(
      t,
      nasabah.userId,
      "VERIFIED",
      "admin",
      sekarang - 3000,
      "Berkas lengkap dan terbaca.",
    );
    await riwayatKyc(t, nasabah.userId, "NEEDS_CORRECTION", "admin", sekarang - 2000, "Foto KTP buram.");
    await riwayatKyc(t, nasabah.userId, "REJECTED", "sistem", sekarang - 1000, "Data tidak cocok.");

    const hasil = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const notifKyc = hasil.item.filter((n) => n.tautan === "/dashboard?tab=kyc");
    const judul = notifKyc.map((n) => n.judul);
    expect(judul).toContain("Verifikasi identitas Anda selesai");
    expect(judul).toContain("Verifikasi identitas perlu diperbaiki");
    expect(judul).toContain("Verifikasi identitas Anda ditolak");
    // Terbaru lebih dulu + catatan keputusan ikut terbaca.
    expect(notifKyc[0].judul).toBe("Verifikasi identitas Anda ditolak");
    expect(notifKyc[0].ringkasan).toContain("Data tidak cocok.");

    const jenis = new Map(notifKyc.map((n) => [n.judul, n.jenis]));
    expect(jenis.get("Verifikasi identitas Anda selesai")).toBe("sukses");
    expect(jenis.get("Verifikasi identitas Anda ditolak")).toBe("peringatan");

    // Keadaan baca: satu kunci ditandai, sisanya tetap belum dibaca.
    const belumDibacaAwal = hasil.belumDibaca;
    await nasabah.sesi.mutation(api.notifikasi.tandaiDibaca, { kunci: notifKyc[0].kunci });
    const sesudah = await nasabah.sesi.query(api.notifikasi.daftar, {});
    expect(sesudah.item.find((n) => n.kunci === notifKyc[0].kunci)?.dibaca).toBe(true);
    expect(sesudah.belumDibaca).toBe(belumDibacaAwal - 1);
  });

  it("keputusan admin atas pengajuan memberi tahu nasabah (ditolak dengan catatan)", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-pinjaman-notif", {
      email: "nasabah-pinjaman-notif@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "admin-pinjaman-notif", {
      email: "admin-pinjaman-notif@pindai.test",
      role: "admin",
    });
    const loanId = await pinjaman(t, nasabah.userId, { status: "sedang_direview" });

    await admin.sesi.mutation(api.loans.ubahStatusPinjaman, {
      loanId,
      status: "ditolak",
      reason: "Riwayat pembayaran belum memenuhi syarat penilaian.",
    });

    const hasil = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const notif = hasil.item.find((n) => n.judul === "Pengajuan pinjaman ditolak");
    expect(notif).toBeDefined();
    expect(notif?.tautan).toBe("/dashboard?tab=pinjaman");
    expect(notif?.jenis).toBe("peringatan");
    expect(notif?.ringkasan).toContain("PGD-NOTIF-1");
    expect(notif?.ringkasan).toContain("Riwayat pembayaran belum memenuhi syarat");

    // Waktu notifikasi berasal dari kolom `diputuskanPada`, bukan `_creationTime`.
    const baris = await t.run(async (ctx) => ctx.db.get(loanId));
    expect(typeof baris?.diputuskanPada).toBe("number");
    expect(notif?.waktu).toBe(baris?.diputuskanPada);
  });

  it("pinjaman berjalan, lunas, dan dibatalkan masing-masing punya kabar sendiri", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-status-notif", {
      email: "nasabah-status-notif@pindai.test",
      role: "peminjam",
    });
    const kemarin = Date.now() - 86_400_000;
    await pinjaman(t, nasabah.userId, {
      status: "didanai",
      nomorReferensi: "PGD-BERJALAN",
      didanaiPada: kemarin,
    });
    await pinjaman(t, nasabah.userId, {
      status: "lunas",
      nomorReferensi: "PGD-LUNAS",
      lunasPada: kemarin + 1000,
    });
    await pinjaman(t, nasabah.userId, {
      status: "dibatalkan",
      nomorReferensi: "PGD-BATAL",
      dibatalkanPada: kemarin + 2000,
    });

    const hasil = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const judul = hasil.item.map((n) => n.judul);
    expect(judul).toContain("Pinjaman Anda mulai berjalan");
    expect(judul).toContain("Pinjaman tercatat lunas");
    expect(judul).toContain("Pengajuan Anda dibatalkan");

    const berjalan = hasil.item.find((n) => n.judul === "Pinjaman Anda mulai berjalan");
    expect(berjalan?.tautan).toBe("/dashboard?tab=jadwal");
    const lunas = hasil.item.find((n) => n.judul === "Pinjaman tercatat lunas");
    expect(lunas?.jenis).toBe("sukses");
    const batal = hasil.item.find((n) => n.judul === "Pengajuan Anda dibatalkan");
    expect(batal?.jenis).toBe("info");
    expect(batal?.ringkasan).toContain("bukan utang");
  });

  it("baris lama tanpa penanda waktu TIDAK menghasilkan notifikasi", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-lama-notif", {
      email: "nasabah-lama-notif@pindai.test",
      role: "peminjam",
    });
    // Status keputusan tanpa tanggal penanda apa pun (data warisan).
    await pinjaman(t, nasabah.userId, { status: "ditolak", nomorReferensi: "PGD-TANPA-TANGGAL" });
    await pinjaman(t, nasabah.userId, { status: "dibatalkan", nomorReferensi: "PGD-TANPA-PADA" });

    const hasil = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const judul = hasil.item.map((n) => n.judul);
    expect(judul).not.toContain("Pengajuan pinjaman ditolak");
    expect(judul).not.toContain("Pengajuan Anda dibatalkan");
    // Tidak ada tautan kabar pinjaman yang muncul dari baris tersebut.
    expect(hasil.item.filter((n) => n.tautan === "/dashboard?tab=pinjaman")).toHaveLength(0);
  });

  it("notifikasi KYC & pinjaman hanya milik pemiliknya", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-isolasi-notif", {
      email: "nasabah-isolasi-notif@pindai.test",
      role: "peminjam",
    });
    const lain = await siapkanPengguna(t, "nasabah-isolasi-notif-b", {
      email: "nasabah-isolasi-notif-b@pindai.test",
      role: "peminjam",
    });
    await riwayatKyc(t, nasabah.userId, "VERIFIED", "admin", Date.now() - 5000);
    await pinjaman(t, nasabah.userId, { status: "lunas", lunasPada: Date.now() - 1000 });

    const hasilLain = await lain.sesi.query(api.notifikasi.daftar, {});
    expect(hasilLain.item).toHaveLength(0);
    expect(hasilLain.belumDibaca).toBe(0);
  });
});
