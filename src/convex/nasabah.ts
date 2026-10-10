/**
 * INTEGRASI NASABAH ↔ KYC ↔ PLAFON ↔ PENGAJUAN (jalur baca).
 *
 * Modul ini TIDAK membuat struktur baru: ia merapikan satu pintu baca di atas
 * tabel yang sudah ada —
 *
 *   users (akun/role/plafon override)
 *     └─ nasabahProfil  (MASTER data nasabah — satu baris per akun)
 *     └─ kycProfil      (satu status KYC per nasabah, BUKAN per pengajuan)
 *     └─ loans[]        (TRANSAKSI pengajuan: status, nominal, tenor, snapshot)
 *
 * Aturan yang dijaga di sini:
 * - Semua angka plafon (maksimal/terpakai/tersedia) dihitung di SERVER dari
 *   master + riwayat pinjaman — tidak pernah diterima dari klien.
 * - KYC terhubung ke NASABAH, bukan ke pengajuan; dokumen KTP/selfie TIDAK
 *   di-copy ke tiap pengajuan, dan URL dokumen hanya keluar lewat query
 *   ber-otorisasi (`kyc.detailKycAdmin`, `admin.dokumenKycUrls`).
 * - Nasabah hanya melihat dirinya sendiri; detail orang lain hanya untuk admin
 *   ber-TOTP (`requireAdminSession`).
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { getConfig } from "./system";
import { persenBungaEfektif } from "../lib/bunga";
import { pelunasanPinjaman, quotePinjaman, simulasiBulananPinjaman } from "../lib/loan";
import {
  apakahPelunasanTepatWaktu,
  plafonPeminjam,
  ringkasPlafon,
} from "../lib/plafon";
import { profilRisiko } from "../lib/risikoNasabah";
import type { Doc, Id } from "./_generated/dataModel";

/** Batas riwayat yang dikembalikan per nasabah — cukup untuk layar detail. */
const BATAS_RIWAYAT = 100;

/** Baris pinjaman apa adanya dari DB — bentuk dokumen `loans`. */
type LoanDoc = Doc<"loans">;

/** Turunan pelunasan satu pinjaman beserta status keterlambatannya. */
function turunanPelunasan(loan: LoanDoc, now: number) {
  const info = pelunasanPinjaman(
    {
      pokokPinjaman: loan.pokokPinjaman,
      status: loan.status,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan,
      didanaiPada: loan.didanaiPada,
      persenBunga: loan.persenBunga,
    },
    now,
  );
  return {
    jatuhTempoPada: info?.jatuhTempoPada ?? null,
    hariTerlambat: info?.hariTerlambat ?? 0,
    dendaTerlambat: info?.dendaTerlambat ?? 0,
    kewajibanSaatIni: info?.totalKewajibanDenganPenalti ?? null,
  };
}

/**
 * Nilai finansial satu pengajuan DARI SNAPSHOT barisnya (nominal + tenor +
 * persenBunga yang berlaku saat itu) — bukan dari konfigurasi hari ini,
 * sehingga mengubah tarif tidak mengubah histori pengajuan lama. Semua angka
 * diturunkan dari engine harga yang sama dengan pembuatan pengajuan.
 */
function finansialPengajuan(loan: LoanDoc) {
  if (loan.tenorBulan !== undefined) {
    const sim = simulasiBulananPinjaman({
      pokokPinjaman: loan.pokokPinjaman,
      tenorBulan: loan.tenorBulan,
      ...(loan.persenBunga !== undefined ? { persenBunga: loan.persenBunga } : {}),
    });
    return {
      skema: "bulanan" as const,
      potonganDiMuka: sim.potonganDiMuka,
      bungaDibebankan: sim.bungaTotal,
      danaBersih: loan.pokokPinjaman - sim.potonganDiMuka,
      totalKewajibanPelunasan: sim.totalPengembalian,
      biayaLayananTotal: sim.biayaLayananTotal,
    };
  }
  const q = quotePinjaman({
    pokokPinjaman: loan.pokokPinjaman,
    ...(loan.persenBunga !== undefined ? { persenBunga: loan.persenBunga } : {}),
  });
  return {
    skema: "harian" as const,
    potonganDiMuka: q.totalPotonganDiMuka,
    bungaDibebankan: q.bunga,
    danaBersih: q.danaBersihDitransfer,
    totalKewajibanPelunasan: q.totalKewajibanPelunasan,
    biayaLayananTotal: q.totalPotonganDiMuka,
  };
}

/** Identitas KYC ringkas (tanpa dokumen) untuk ditampilkan di layar nasabah. */
function ringkasKyc(row: Doc<"kycProfil"> | null) {
  if (row === null) return null;
  return {
    status: row.status,
    diajukanPada: row.diajukanPada ?? null,
    diputuskanPada: row.diputuskanPada ?? null,
    diputuskanOlehLabel: row.diputuskanOlehLabel ?? null,
    keputusanCatatan: row.keputusanCatatan ?? null,
    /** Ada tidaknya berkas disajikan sebagai penanda — bukan URL dokumen. */
    adaFotoKtp: row.ktpId !== undefined,
    adaSelfie: row.selfieKtpId !== undefined,
    adaBuktiPenghasilan: row.buktiPenghasilanId !== undefined,
    terverifikasiPada: row.stempelTerverifikasi?.pada ?? null,
  };
}

/**
 * Plafon MASTER nasabah yang sedang masuk — maksimal/terpakai/tersedia.
 * Angka dihitung server; UI memakai hasil ini apa adanya.
 */
export const plafonRingkasSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || user.isAnonymous === true) return null;
    const [maksimal, cfg, loans] = await Promise.all([
      plafonPeminjam(ctx, userId),
      getConfig(ctx),
      ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    const ringkas = ringkasPlafon(maksimal, loans);
    return {
      ...ringkas,
      plafonPribadi: user.plafonPinjaman ?? null,
      persenBungaEfektif: persenBungaEfektif(user.persenBunga, cfg.persenBunga),
      /**
       * Slider pengajuan memakai `tersedia`, BUKAN maksimal: pinjaman aktif
       * mengurangi jatah pengajuan berikutnya (aturan yang sama dengan server).
       */
    };
  },
});

/**
 * Gerbang admin untuk seluruh data lintas-nasabah di berkas ini.
 * `requireAdminSession` menuntut peran admin + TOTP terverifikasi pada sesi.
 */
async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

/**
 * DETAIL NASABAH (admin) — profil, KYC, plafon, profil risiko, hitungan
 * pinjaman, dan riwayat pengajuan kronologis. Satu pintu untuk halaman
 * "Detail Nasabah" di panel admin.
 *
 * Dokumen KYC TIDAK dikirim di sini (hanya penanda ada/tidak); URL bertanda
 * tangan tetap lewat `kyc.detailKycAdmin` supaya otorisasinya satu jalur.
 */
export const detailNasabah = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);

    const [user, profil, kyc, loans, receipts] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("nasabahProfil")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("manualPaymentReceipts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    if (user === null) return null;

    const now = Date.now();
    const cfg = await getConfig(ctx);
    const maksimal = await plafonPeminjam(ctx, userId);
    const ringkas = ringkasPlafon(maksimal, loans);

    // Riwayat pengajuan KRONOLOGIS (paling lama → terbaru) dengan nomor urut
    // #001, #002, … supaya cerita nasabah terbaca sebagai urutan.
    const diurut = [...loans].sort(
      (a, b) =>
        (a.diajukanPada ?? a._creationTime) - (b.diajukanPada ?? b._creationTime) ||
        a._creationTime - b._creationTime,
    );
    const riwayatPengajuan = diurut.map((loan, i) => {
      const turunan = turunanPelunasan(loan, now);
      return {
        nomorUrut: i + 1,
        id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        pokokDiajukan: loan.pokokDiajukan ?? loan.pokokPinjaman,
        pokokPinjaman: loan.pokokPinjaman,
        tenorHari: loan.tenorHari,
        tenorBulan: loan.tenorBulan ?? null,
        status: loan.status,
        diajukanPada: loan.diajukanPada ?? loan._creationTime,
        didanaiPada: loan.didanaiPada ?? null,
        lunasPada: loan.lunasPada ?? null,
        jatuhTempoPada: turunan.jatuhTempoPada,
        hariTerlambat: turunan.hariTerlambat,
        kewajibanSaatIni: turunan.kewajibanSaatIni,
        kycStatusSaatPengajuan: loan.kycStatusSaatPengajuan ?? null,
        // Relasi master: bila kosong (baris lama) UI jatuh ke `userId`.
        nasabahUserId: loan.nasabahUserId ?? loan.userId,
      };
    });

    // Pembayaran dari dua sumber yang sudah ada: bukti transfer manual dan
    // pelunasan pinjaman. Tidak ada salinan baru — hanya gabungan baca.
    const pembayaranManual = receipts.map((r) => ({
      waktu: r.tanggalTransfer,
      jumlah: r.jumlah,
      jenis: "bukti_manual" as const,
      label: `${r.metodePembayaran} · ${r.nomorReferensi}`,
      status: r.status,
      loanId: r.loanId ?? null,
      referensi: r.referensiTransfer,
    }));
    const pelunasan = diurut
      .filter((l) => l.lunasPada !== undefined)
      .map((l) => ({
        waktu: l.lunasPada as number,
        jumlah: l.pokokPinjaman,
        jenis: "pelunasan" as const,
        label: l.nomorReferensi,
        status: "lunas" as const,
        loanId: l._id as Id<"loans"> | null,
        referensi: l.nomorReferensi,
      }));
    const riwayatPembayaran = [...pembayaranManual, ...pelunasan].sort(
      (a, b) => b.waktu - a.waktu,
    );

    const jumlahAktif = loans.filter((l) => l.status === "didanai").length;
    const jumlahLunas = loans.filter((l) => l.status === "lunas").length;
    const jumlahDitolak = loans.filter((l) => l.status === "ditolak").length;
    const jumlahTerlambat = diurut.filter(
      (l) => turunanPelunasan(l, now).hariTerlambat > 0,
    ).length;

    return {
      userId,
      nama: user.name ?? user.email ?? "Nasabah",
      email: user.email ?? null,
      kodePeminjam: user.kodePeminjam ?? null,
      role: user.role ?? null,
      profil:
        profil === null
          ? null
          : {
              namaLengkap: profil.namaLengkap,
              nik: profil.nik,
              nomorWhatsApp: profil.nomorWhatsApp,
              alamat: profil.alamat ?? null,
              pekerjaan: profil.pekerjaan ?? null,
              penghasilanBulanan: profil.penghasilanBulanan ?? null,
              namaBank: profil.namaBank ?? null,
              nomorRekening: profil.nomorRekening ?? null,
              adaFotoKtp: profil.fotoKtpId !== undefined,
              verifikasiIdentitas: profil.verifikasiIdentitas ?? null,
              diperbaruiPada: profil.diperbaruiPada,
              sumber: profil.sumber ?? null,
              dibuatMigrasi: profil.dibuatMigrasi === true,
            },
      kyc: ringkasKyc(kyc),
      plafon: {
        ...ringkas,
        plafonPribadi: user.plafonPinjaman ?? null,
        persenBungaEfektif: persenBungaEfektif(user.persenBunga, cfg.persenBunga),
        persenBungaPribadi: user.persenBunga ?? null,
      },
      ringkasan: {
        jumlahPengajuan: loans.length,
        pinjamanAktif: jumlahAktif,
        pinjamanLunas: jumlahLunas,
        pinjamanDitolak: jumlahDitolak,
        pinjamanTerlambat: jumlahTerlambat,
        pelunasanTepatWaktu: loans.filter(apakahPelunasanTepatWaktu).length,
      },
      profilRisiko: profilRisiko(
        diurut.map((l) => ({
          status: l.status,
          hariTerlambat: turunanPelunasan(l, now).hariTerlambat,
          tepatWaktu: apakahPelunasanTepatWaktu(l),
        })),
      ),
      riwayatPengajuan: riwayatPengajuan.slice(-BATAS_RIWAYAT),
      riwayatPembayaran: riwayatPembayaran.slice(0, BATAS_RIWAYAT),
    };
  },
});

/**
 * DETAIL PENGAJUAN (admin) — satu pengajuan lengkap: nasabah, status KYC,
 * nominal/tenor, biaya berlaku, dana bersih, kewajiban, status, pendanaan,
 * pencairan, pembayaran, dan keterlambatan.
 *
 * Nilai finansial dibaca dari SNAPSHOT yang tersimpan di baris `loans` (bukan
 * dihitung ulang dari konfigurasi hari ini), sehingga mengubah tarif tidak
 * mengubah histori pengajuan lama.
 */
export const detailPengajuan = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);

    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;

    const now = Date.now();
    const [user, profil, kyc, fundings, receipts, pendana] = await Promise.all([
      ctx.db.get(loan.userId),
      ctx.db
        .query("nasabahProfil")
        .withIndex("by_user", (q) => q.eq("userId", loan.userId))
        .first(),
      ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", loan.userId))
        .first(),
      ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
      ctx.db
        .query("manualPaymentReceipts")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
      loan.pendanaId !== undefined ? ctx.db.get(loan.pendanaId) : Promise.resolve(null),
    ]);

    const turunan = turunanPelunasan(loan, now);
    const disalurkan = fundings
      .filter((f) => f.status === "dialokasikan")
      .reduce((t, f) => t + f.jumlahAlokasi, 0);

    return {
      id: loan._id,
      nomorReferensi: loan.nomorReferensi,
      // ===== Relasi master =====
      nasabah: {
        userId: loan.nasabahUserId ?? loan.userId,
        nama: user?.name ?? user?.email ?? "Nasabah",
        email: user?.email ?? null,
        kodePeminjam: user?.kodePeminjam ?? null,
        punyaProfil: profil !== null,
        alamat: profil?.alamat ?? null,
        nomorWhatsApp: profil?.nomorWhatsApp ?? loan.nomorWhatsApp ?? null,
      },
      kyc: ringkasKyc(kyc),
      // ===== Snapshot pengajuan =====
      tujuan: loan.tujuan,
      pokokDiajukan: loan.pokokDiajukan ?? loan.pokokPinjaman,
      nominal: loan.pokokPinjaman,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan ?? null,
      persenBunga: loan.persenBunga ?? null,
      /** Biaya & dana bersih yang BERLAKU untuk pengajuan ini (snapshot). */
      finansial: finansialPengajuan(loan),
      kewajibanSaatIni: turunan.kewajibanSaatIni,
      // ===== Status & alur =====
      status: loan.status,
      diajukanPada: loan.diajukanPada ?? loan._creationTime,
      didanaiPada: loan.didanaiPada ?? null,
      lunasPada: loan.lunasPada ?? null,
      jatuhTempoPada: turunan.jatuhTempoPada,
      hariTerlambat: turunan.hariTerlambat,
      dendaTerlambat: turunan.dendaTerlambat,
      // ===== Pendanaan =====
      pendanaan: {
        totalDisalurkan: disalurkan,
        jumlahAlokasi: fundings.length,
        pendanaId: loan.pendanaId ?? null,
        pendanaNama: pendana?.name ?? pendana?.email ?? loan.pendanaNama ?? null,
      },
      // ===== Pembayaran =====
      pembayaran: receipts
        .sort((a, b) => b.tanggalTransfer - a.tanggalTransfer)
        .map((r) => ({
          waktu: r.tanggalTransfer,
          jumlah: r.jumlah,
          metode: r.metodePembayaran,
          status: r.status,
          nomorReferensi: r.nomorReferensi,
          referensi: r.referensiTransfer,
        })),
    };
  },
});
