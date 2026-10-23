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

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit, getConfig, tarifDendaBerlaku } from "./system";
import { persenBungaEfektif } from "../lib/bunga";
import { pelunasanPinjaman, quotePinjaman, simulasiBulananPinjaman } from "../lib/loan";
import { apakahPelunasanTepatWaktu } from "../lib/plafon";
import { plafonDenganEksposurSyariah } from "./syariahPengajuan";
import {
  profilRisiko,
  ringkasRisiko,
  validasiOverrideRisiko,
  type GradeRisiko,
  type OverrideRisikoAktif,
} from "../lib/risikoNasabah";
import type { Doc, Id } from "./_generated/dataModel";

/** Batas riwayat yang dikembalikan per nasabah — cukup untuk layar detail. */
const BATAS_RIWAYAT = 100;

/** Baris pinjaman apa adanya dari DB — bentuk dokumen `loans`. */
type LoanDoc = Doc<"loans">;

/** Label aktor admin untuk audit trail (nama/email, bukan id mentah). */
function labelAktorNasabah(user: { email?: string; name?: string }): string {
  return user.email ?? user.name ?? "admin";
}

/**
 * Kelengkapan data diri = baris profil ada DAN kolom inti terisi.
 *
 * Sengaja tidak cukup "baris ada": profil yang dibuat migrasi bisa ada tanpa
 * NIK/alamat/rekening. Aturan ini satu tempat, dipakai penilaian risiko.
 */
function dataDiriLengkapProfil(profil: Doc<"nasabahProfil"> | null): boolean {
  if (profil === null) return false;
  return (
    profil.nik.trim().length > 0 &&
    (profil.alamat ?? "").trim().length > 0 &&
    (profil.namaBank ?? "").trim().length > 0 &&
    (profil.nomorRekening ?? "").trim().length > 0
  );
}

/**
 * Hitung profil risiko dari riwayat pinjaman + konteks identitas nasabah.
 * Dipakai BERSAMA oleh detail nasabah dan override admin, supaya grade sistem
 * yang direkam saat override adalah hasil model yang sama persis.
 */
function hitungProfilRisiko(
  loans: readonly LoanDoc[],
  profil: Doc<"nasabahProfil"> | null,
  kyc: Doc<"kycProfil"> | null,
  now: number,
) {
  return profilRisiko(
    loans.map((l) => ({
      status: l.status,
      hariTerlambat: turunanPelunasan(l, now).hariTerlambat,
      tepatWaktu: apakahPelunasanTepatWaktu(l),
    })),
    {
      dataDiriLengkap: dataDiriLengkapProfil(profil),
      kycTerverifikasi: kyc?.status === "VERIFIED",
    },
  );
}

/** Baris override risiko terakhir untuk satu nasabah (null bila belum ada). */
async function ambilOverrideAktif(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<OverrideRisikoAktif | null> {
  const row = await ctx.db
    .query("risikoOverride")
    .withIndex("by_user_dibuatPada", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  if (row === null) return null;
  return {
    gradeOverride: row.gradeOverride as GradeRisiko,
    alasan: row.alasan,
    olehLabel: row.olehLabel,
    dibuatPada: row.dibuatPada,
  };
}

/** Turunan pelunasan satu pinjaman beserta status keterlambatannya. */
function turunanPelunasan(loan: LoanDoc, now: number, tarifDenda?: number) {
  const info = pelunasanPinjaman(
    {
      pokokPinjaman: loan.pokokPinjaman,
      status: loan.status,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan,
      didanaiPada: loan.didanaiPada,
      persenBunga: loan.persenBunga,
      tarifBulanan: loan.tarifBulanan ?? null,
    },
    now,
    tarifDenda,
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
      tarifBulanan: loan.tarifBulanan ?? null,
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
    // Pinjaman lama tanpa kolom ini tetap dihitung ekspres (perilaku lama).
    ...(loan.cairEkspres !== undefined ? { cairEkspres: loan.cairEkspres } : {}),
    ...(loan.tarifBiaya !== undefined ? { tarifBiaya: loan.tarifBiaya } : {}),
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
    const [ringkas, cfg] = await Promise.all([
      plafonDenganEksposurSyariah(ctx, userId),
      getConfig(ctx),
    ]);
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
async function requireAdmin(ctx: QueryCtx | MutationCtx) {
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
    const ringkas = await plafonDenganEksposurSyariah(ctx, userId);

    // Riwayat pengajuan KRONOLOGIS (paling lama → terbaru) dengan nomor urut
    // #001, #002, … supaya cerita nasabah terbaca sebagai urutan.
    const diurut = [...loans].sort(
      (a, b) =>
        (a.diajukanPada ?? a._creationTime) - (b.diajukanPada ?? b._creationTime) ||
        a._creationTime - b._creationTime,
    );
    const riwayatPengajuan = diurut.map((loan, i) => {
      const turunan = turunanPelunasan(loan, now, cfg.persenDendaKeterlambatan);
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

    // Profil risiko + override admin: grade SISTEM selalu ikut dikirim supaya
    // peninjau bisa melihat selisih antara hitungan mesin dan keputusan petugas.
    const profilRisikoNasabah = hitungProfilRisiko(loans, profil, kyc, now);
    const overrideAktif = await ambilOverrideAktif(ctx, userId);
    const risiko = ringkasRisiko(profilRisikoNasabah.grade, overrideAktif);
    const riwayatOverride = (
      await ctx.db
        .query("risikoOverride")
        .withIndex("by_user_dibuatPada", (q) => q.eq("userId", userId))
        .order("desc")
        .take(BATAS_RIWAYAT)
    ).map((r) => ({
      gradeSistem: r.gradeSistem,
      skorSistem: r.skorSistem,
      gradeOverride: r.gradeOverride,
      alasan: r.alasan,
      olehLabel: r.olehLabel,
      dibuatPada: r.dibuatPada,
    }));

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
      profilRisiko: profilRisikoNasabah,
      risiko,
      riwayatOverrideRisiko: riwayatOverride,
      riwayatPengajuan: riwayatPengajuan.slice(-BATAS_RIWAYAT),
      riwayatPembayaran: riwayatPembayaran.slice(0, BATAS_RIWAYAT),
    };
  },
});

/**
 * Buka dashboard milik nasabah dalam pratinjau baca-saja. Akses tetap memakai
 * sesi admin ber-TOTP dan ditulis ke audit trail sebelum data dikembalikan.
 */
export const dashboardNasabahUntukAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (user === null) return null;

    const [loans, profil, kyc] = await Promise.all([
      ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("kycProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    ]);
    const pinjamanAktif = loans.filter((loan) => loan.status === "didanai").length;
    const pinjamanLunas = loans.filter((loan) => loan.status === "lunas").length;
    const pinjamanMenunggu = loans.filter((loan) =>
      loan.status === "diajukan" || loan.status === "sedang_direview",
    ).length;

    return {
      nama: user.name ?? user.email ?? "Nasabah",
      email: user.email ?? null,
      kodePeminjam: user.kodePeminjam ?? null,
      role: user.role ?? null,
      kycStatus: kyc?.status ?? "NOT_STARTED",
      profilAda: profil !== null,
      jumlahPengajuan: loans.length,
      pinjamanAktif,
      pinjamanLunas,
      pinjamanMenunggu,
      pinjamanDitolak: loans.filter((loan) => loan.status === "ditolak").length,
      pengajuanTerbaru: [...loans]
        .sort((a, b) => (b.diajukanPada ?? b._creationTime) - (a.diajukanPada ?? a._creationTime))
        .slice(0, 20)
        .map((loan) => ({
          id: loan._id,
          nomorReferensi: loan.nomorReferensi,
          pokokPinjaman: loan.pokokPinjaman,
          status: loan.status,
          diajukanPada: loan.diajukanPada ?? loan._creationTime,
          tenorHari: loan.tenorHari,
          tenorBulan: loan.tenorBulan ?? null,
        })),
    };
  },
});

/** Catat pembukaan pratinjau dashboard nasabah oleh Super Admin ber-TOTP. */
export const catatLihatDashboardNasabah = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const admin = await requireAdminSession(ctx);
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Nasabah tidak ditemukan.");
    await audit(
      ctx,
      admin.userId,
      labelAktorNasabah(admin.user),
      "lihat_dashboard_nasabah",
      userId,
      `Pratinjau dashboard baca-saja untuk ${user.email ?? user.name ?? userId}`,
    );
    return { ok: true };
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

    const tarifDenda = await tarifDendaBerlaku(ctx);
    const turunan = turunanPelunasan(loan, now, tarifDenda);
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

/**
 * OVERRIDE RISIKO (admin ber-TOTP) — ganti grade yang BERLAKU, dengan alasan.
 *
 * Append-only: tiap keputusan menambah baris baru dan tidak menghapus riwayat.
 * Grade hasil model sistem direkam apa adanya, sehingga selisih antara
 * hitungan mesin dan keputusan petugas selalu terlihat dan dapat ditinjau.
 *
 * Yang TIDAK dilakukan fungsi ini: mengubah plafon, pinjaman, pembayaran, atau
 * perpindahan dana apa pun. Override hanya memengaruhi GRADE penilaian yang
 * ditampilkan di detail nasabah, dan seluruhnya tercatat di `auditLog`.
 */
export const overrideRisiko = mutation({
  args: {
    userId: v.id("users"),
    grade: v.string(),
    alasan: v.string(),
  },
  handler: async (ctx, { userId, grade, alasan }) => {
    const admin = await requireAdmin(ctx);
    const sah = validasiOverrideRisiko(grade, alasan);
    if (!sah.ok) throw new Error(sah.alasan);

    const [user, profil, kyc, loans] = await Promise.all([
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
    ]);
    if (user === null) throw new Error("Nasabah tidak ditemukan.");

    const now = Date.now();
    const sistem = hitungProfilRisiko(loans, profil, kyc, now);
    const gradeOverride = grade as GradeRisiko;
    const alasanBersih = alasan.trim();
    const actor = labelAktorNasabah(admin.user);

    const overrideId = await ctx.db.insert("risikoOverride", {
      userId,
      gradeSistem: sistem.grade,
      skorSistem: sistem.skor,
      gradeOverride,
      alasan: alasanBersih,
      olehUserId: admin.userId,
      olehLabel: actor,
      dibuatPada: now,
    });

    await audit(
      ctx,
      admin.userId,
      actor,
      "override_risiko",
      user.email ?? user.name ?? "nasabah",
      `Grade ${sistem.grade} (skor ${sistem.skor}) → ${gradeOverride} · ${alasanBersih}`,
    );

    return {
      ok: true,
      overrideId,
      gradeSistem: sistem.grade,
      skorSistem: sistem.skor,
    };
  },
});
