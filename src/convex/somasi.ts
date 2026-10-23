/**
 * SURAT SOMASI — sisi server.
 *
 * Alurnya:
 *  1. `dataSomasi` menyusun pratinjau untuk admin. Surat hanya tersedia setelah
 *     keterlambatan H+3, dan ditahan bila ada janji bayar aktif atau pengaduan
 *     yang belum selesai.
 *  2. Unduhan pertama MENERBITKAN snapshot (`somasiTerbit`). Unduhan berikutnya
 *     memakai snapshot itu, jadi nomor dan angkanya tidak berubah saat dicetak
 *     ulang.
 *  3. Pengiriman email/WhatsApp hanya manual, di dalam jam kontak, dengan jeda
 *     dan kuota per admin. Pengiriman yang berhasil menandai surat sudah
 *     diserahkan.
 *
 * Tidak ada pengiriman otomatis: somasi adalah dokumen formal yang perlu
 * ditinjau petugas sebelum keluar.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { pelunasanPinjaman } from "../lib/loan";
import { bolehKontakSekarang, maskNomorTelepon } from "../lib/penagihan";
import {
  LABEL_TINDAK_LANJUT_SOMASI,
  cekSomasi,
  htmlSomasiEmail,
  namaBerkasSomasi,
  subjekSomasiEmail,
  susunSuratSomasi,
  teksSomasiWhatsapp,
  validasiTindakLanjutSomasi,
  type IdentitasBadan,
  type SuratSomasi,
  type TindakLanjutSomasi,
} from "../lib/suratSomasi";
import { buatPdfSomasi } from "../lib/suratSomasiPdf";
import { OFFSET_WIB_MS, formatTanggalWIB } from "../lib/waktu";
import { bacaAturan, kasusUntuk } from "./penagihan";
import { audit, getConfig, tarifDendaBerlaku } from "./system";
import { apiKeyGatewayWa, kirimViaGateway, type WaSettings } from "./whatsapp";

const NAMA_FALLBACK = "PINDAI";

/** Jeda minimum antar pengiriman surat yang sama ke satu kanal. */
const JEDA_KIRIM_MS = 60_000;

/** Batas pengiriman per kanal per admin per hari. */
const MAKS_KIRIM_PER_HARI = 5;

/** Batas tunggu gateway email. */
const GATEWAY_TIMEOUT_MS = 20_000;

/** Batas lampiran WhatsApp; rincian somasi jauh di bawah angka ini. */
const BATAS_LAMPIRAN_BYTE = 3_500_000;

/** Retensi berkas WhatsApp; gateway mengambil lampiran setelah menjawab. */
const RETENSI_BERKAS_MS = 60 * 60 * 1000;

/** Alasan gateway yang berarti lampiran ditolak SEBELUM pesan terkirim. */
const ALASAN_TANPA_LAMPIRAN = "belum mendukung lampiran berkas";

const KANAL = ["email", "whatsapp"] as const;
type Kanal = (typeof KANAL)[number];

const PENYERAHAN = ["manual", "email", "whatsapp"] as const;

type TerbitInfo = {
  nomorSurat: string;
  pada: number;
  olehLabel: string;
  totalKewajiban: number;
  hariTerlambat: number;
  diserahkanPada: number | null;
  diserahkanMelalui: string | null;
  diserahkanOlehLabel: string | null;
  tindakLanjut: string | null;
  tindakLanjutPada: number | null;
  tindakLanjutOlehLabel: string | null;
  tindakLanjutCatatan: string | null;
};

type HasilSusun =
  | { tersedia: false; alasan: string }
  | {
      tersedia: true;
      surat: SuratSomasi;
      terbit: TerbitInfo | null;
      /** Angka kewajiban berubah sejak surat diterbitkan. */
      berubah: boolean;
      bolehKirim: boolean;
      alasanKirim: string | null;
    };

type RiwayatKirim = {
  kanal: string;
  tujuan: string;
  status: string;
  respon: string | null;
  pada: number;
};

type HasilData =
  | { tersedia: false; alasan: string }
  | {
      tersedia: true;
      surat: SuratSomasi;
      terbit: TerbitInfo | null;
      berubah: boolean;
      bolehKirim: boolean;
      alasanKirim: string | null;
      namaBerkas: string;
      /** Ketersediaan kanal, tanpa membocorkan alamat/nomor ke pratinjau. */
      kontak: { email: boolean; whatsapp: boolean };
      riwayatKirim: RiwayatKirim[];
    };

function pesanGalat(err: unknown): string {
  return err instanceof Error ? err.message : "Pengiriman gagal tanpa keterangan.";
}

/** Snapshot JSON → surat; null bila isinya tidak bisa dipakai. */
function bacaSnapshot(json: string): SuratSomasi | null {
  try {
    const data = JSON.parse(json) as Partial<SuratSomasi>;
    return typeof data.nomorSurat === "string" && typeof data.totalKewajiban === "number"
      ? (data as SuratSomasi)
      : null;
  } catch {
    return null;
  }
}

function infoTerbit(row: {
  nomorSurat: string;
  pada: number;
  olehLabel: string;
  totalKewajiban: number;
  hariTerlambat: number;
  diserahkanPada?: number;
  diserahkanMelalui?: string;
  diserahkanOlehLabel?: string;
  tindakLanjut?: string;
  tindakLanjutPada?: number;
  tindakLanjutOlehLabel?: string;
  tindakLanjutCatatan?: string;
}): TerbitInfo {
  return {
    nomorSurat: row.nomorSurat,
    pada: row.pada,
    olehLabel: row.olehLabel,
    totalKewajiban: row.totalKewajiban,
    hariTerlambat: row.hariTerlambat,
    diserahkanPada: row.diserahkanPada ?? null,
    diserahkanMelalui: row.diserahkanMelalui ?? null,
    diserahkanOlehLabel: row.diserahkanOlehLabel ?? null,
    tindakLanjut: row.tindakLanjut ?? null,
    tindakLanjutPada: row.tindakLanjutPada ?? null,
    tindakLanjutOlehLabel: row.tindakLanjutOlehLabel ?? null,
    tindakLanjutCatatan: row.tindakLanjutCatatan ?? null,
  };
}

/** Alasan surat tidak boleh dibuat/dikirim sekarang, atau null bila siap. */
async function alasanTidakSiap(
  ctx: QueryCtx | MutationCtx,
  loan: { status: string; _id: Id<"loans"> },
  hariTerlambat: number,
  totalKewajiban: number | null,
): Promise<string | null> {
  if (loan.status !== "didanai") {
    return loan.status === "lunas"
      ? "Pinjaman ini sudah lunas, jadi tidak ada tunggakan yang perlu disomasi."
      : "Pinjaman ini belum berjalan atau sudah ditutup, jadi belum ada tunggakan yang dapat disomasi.";
  }

  const cek = cekSomasi({ hariTerlambat, totalKewajiban });
  if (!cek.ok) return cek.alasan;

  const kasus = await kasusUntuk(ctx, loan._id);
  if (kasus !== null) {
    const janji = await ctx.db
      .query("penagihanJanji")
      .withIndex("by_kasus", (q) => q.eq("kasusId", kasus._id))
      .order("desc")
      .first();
    if (janji !== null && janji.status === "aktif") {
      return `Ada janji pembayaran aktif sampai ${formatTanggalWIB(janji.tanggalJanji)}. Somasi ditahan sampai janji itu dipenuhi, dilanggar, atau dibatalkan.`;
    }
  }

  const pengaduan = await ctx.db
    .query("pengaduanNasabah")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .collect();
  const terbuka = pengaduan.filter((p) => p.status === "baru" || p.status === "ditinjau").length;
  if (terbuka > 0) {
    return `Ada ${terbuka} pengaduan nasabah yang belum selesai. Selesaikan pengaduan lebih dulu sebelum menerbitkan somasi.`;
  }

  return null;
}

/** Susun pratinjau atau snapshot surat untuk satu pinjaman. */
async function susunUntuk(
  ctx: QueryCtx | MutationCtx,
  loanId: Id<"loans">,
): Promise<HasilSusun> {
  const loan = await ctx.db.get(loanId);
  if (loan === null) return { tersedia: false, alasan: "Pinjaman tidak ditemukan." };

  const sekarang = Date.now();
  const tarifDenda = await tarifDendaBerlaku(ctx);
  const pelunasan = pelunasanPinjaman(loan, sekarang, tarifDenda);
  const hariTerlambat = pelunasan?.hariTerlambat ?? 0;
  const totalKewajiban = pelunasan?.totalKewajibanDenganPenalti ?? null;
  const alasan = await alasanTidakSiap(ctx, loan, hariTerlambat, totalKewajiban);

  const terbitRow = await ctx.db
    .query("somasiTerbit")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .first();

  // Surat yang sudah terbit tetap bisa dibaca/diunduh walau keadaannya berubah;
  // yang diblokir hanya penerbitan baru dan pengiriman.
  if (terbitRow !== null) {
    const surat = bacaSnapshot(terbitRow.dokumenJson);
    if (surat === null) {
      return {
        tersedia: false,
        alasan: "Snapshot surat somasi tidak terbaca. Hubungi admin teknis sebelum menerbitkan ulang.",
      };
    }
    return {
      tersedia: true,
      surat,
      terbit: infoTerbit(terbitRow),
      berubah:
        surat.totalKewajiban !== (totalKewajiban ?? surat.totalKewajiban) ||
        surat.hariTerlambat !== hariTerlambat,
      bolehKirim: alasan === null,
      alasanKirim: alasan,
    };
  }

  if (alasan !== null) return { tersedia: false, alasan };
  if (pelunasan === null) {
    return { tersedia: false, alasan: "Pinjaman ini tidak punya kewajiban aktif." };
  }

  const config = await getConfig(ctx);
  const nomorRekening = config.rekeningUsahaNomor.trim();
  const namaRekening = config.rekeningUsahaNama.trim();
  const identitas: IdentitasBadan = {
    namaBadan: config.namaBadan.trim() || NAMA_FALLBACK,
    alamat: config.alamatUsaha.trim(),
    email: config.emailResmi.trim(),
    telepon: config.teleponResmi.trim(),
  };

  return {
    tersedia: true,
    surat: susunSuratSomasi(
      {
        nomorReferensi: loan.nomorReferensi,
        namaPeminjam: loan.namaLengkap,
        pokokBerjalan: pelunasan.pokokBerjalan ?? loan.pokokPinjaman,
        jatuhTempoPada: pelunasan.jatuhTempoPada,
        hariTerlambat: pelunasan.hariTerlambat,
        dendaTerlambat: pelunasan.dendaTerlambat,
        totalKewajiban: pelunasan.totalKewajibanDenganPenalti,
        persenDendaPerHari: tarifDenda,
        rekening:
          nomorRekening === ""
            ? null
            : {
                nama: namaRekening === "" ? identitas.namaBadan : namaRekening,
                bank: config.rekeningUsahaBank.trim(),
                nomor: nomorRekening,
              },
        identitas,
      },
      { sekarang },
    ),
    terbit: null,
    berubah: false,
    bolehKirim: true,
    alasanKirim: null,
  };
}

/** Pratinjau surat untuk panel penagihan (admin saja). */
export const dataSomasi = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }): Promise<HasilData> => {
    await requireAdminSession(ctx);
    const hasil = await susunUntuk(ctx, loanId);

    const rows = await ctx.db
      .query("somasiKirimLog")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(6);
    const riwayatKirim: RiwayatKirim[] = rows.map((r) => ({
      kanal: r.kanal,
      tujuan: r.kanal === "email" ? samarkanEmail(r.tujuan) : (maskNomorTelepon(r.tujuan) ?? "-"),
      status: r.status,
      respon: r.respon ?? null,
      pada: r.pada,
    }));

    if (!hasil.tersedia) return hasil;

    const loan = await ctx.db.get(loanId);
    const pemilik = loan === null ? null : await ctx.db.get(loan.userId);
    const nomor = (loan?.nomorWhatsApp ?? pemilik?.nomorWhatsApp ?? "").trim();
    return {
      ...hasil,
      namaBerkas: namaBerkasSomasi(hasil.surat),
      kontak: {
        email: (pemilik?.email ?? "").trim() !== "",
        whatsapp: nomor !== "",
      },
      riwayatKirim,
    };
  },
});

/** Salinan untuk action, yang tidak boleh membaca basis data langsung. */
export const _susun = internalQuery({
  args: { loanId: v.id("loans") },
  handler: (ctx, { loanId }): Promise<HasilSusun> => susunUntuk(ctx, loanId),
});

/** Aturan penagihan yang berlaku, untuk jam kontak dan saklar modul. */
export const _aturan = internalQuery({
  args: {},
  handler: async (ctx) => {
    const aturan = await bacaAturan(ctx);
    return { aktif: aturan.aktif, jamKontak: aturan.jamKontak };
  },
});

/** Kontak terdaftar peminjam; tidak pernah dipilih dari input klien. */
export const _kontak = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const pemilik = await ctx.db.get(loan.userId);
    return {
      email: pemilik?.email ?? null,
      whatsapp: loan.nomorWhatsApp ?? pemilik?.nomorWhatsApp ?? null,
    };
  },
});

/** Snapshot terbit untuk satu pinjaman. */
export const _dataTerbit = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const row = await ctx.db
      .query("somasiTerbit")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .first();
    if (row === null) return null;
    const surat = bacaSnapshot(row.dokumenJson);
    return surat === null ? null : { somasiId: row._id, surat, terbit: infoTerbit(row) };
  },
});

/**
 * Terbitkan surat sekali. Pemanggil berikutnya menerima baris yang sama; tidak
 * ada nomor atau angka baru hanya karena tombol ditekan dua kali.
 */
export const _terbitkan = internalMutation({
  args: { loanId: v.id("loans"), olehUserId: v.id("users") },
  handler: async (
    ctx,
    { loanId, olehUserId },
  ): Promise<{ somasiId: Id<"somasiTerbit">; nomorSurat: string; baru: boolean }> => {
    const ada = await ctx.db
      .query("somasiTerbit")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .first();
    if (ada !== null) {
      return { somasiId: ada._id, nomorSurat: ada.nomorSurat, baru: false };
    }

    const hasil = await susunUntuk(ctx, loanId);
    if (!hasil.tersedia) throw new Error(hasil.alasan);
    if (!hasil.bolehKirim) {
      throw new Error(hasil.alasanKirim ?? "Surat somasi belum dapat diterbitkan.");
    }

    const admin = await ctx.db.get(olehUserId);
    const label = admin?.email ?? admin?.name ?? "admin";
    const somasiId = await ctx.db.insert("somasiTerbit", {
      loanId,
      nomorSurat: hasil.surat.nomorSurat,
      dokumenJson: JSON.stringify(hasil.surat),
      namaBerkas: namaBerkasSomasi(hasil.surat),
      totalKewajiban: hasil.surat.totalKewajiban,
      hariTerlambat: hasil.surat.hariTerlambat,
      olehUserId,
      olehLabel: label,
      pada: Date.now(),
    });

    const loan = await ctx.db.get(loanId);
    await audit(
      ctx,
      olehUserId,
      label,
      "somasi_diterbitkan",
      loan?.nomorReferensi ?? loanId,
      `Surat ${hasil.surat.nomorSurat} diterbitkan untuk ${loan?.namaLengkap ?? "peminjam"} (terlambat ${hasil.surat.hariTerlambat} hari).`,
    );

    return { somasiId, nomorSurat: hasil.surat.nomorSurat, baru: true };
  },
});

/** Catat unduhan; penerbitan sudah punya catatannya sendiri. */
export const _catatUnduh = internalMutation({
  args: {
    loanId: v.id("loans"),
    olehUserId: v.id("users"),
    nomorSurat: v.string(),
  },
  handler: async (ctx, { loanId, olehUserId, nomorSurat }) => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return;
    const admin = await ctx.db.get(olehUserId);
    await audit(
      ctx,
      olehUserId,
      admin?.email ?? admin?.name ?? "admin",
      "somasi_diunduh",
      loan.nomorReferensi,
      `Surat somasi ${nomorSurat} diunduh.`,
    );
  },
});

/** Base64 dari byte PDF; dipotong 8 KB agar `fromCharCode` tidak meluap. */
function keBase64(byte: Uint8Array): string {
  let biner = "";
  const potong = 0x2000;
  for (let i = 0; i < byte.length; i += potong) {
    biner += String.fromCharCode(...byte.subarray(i, i + potong));
  }
  return btoa(biner);
}

/** Unduh surat somasi; penerbitan pertama membekukan snapshotnya. */
export const unduhSomasi = action({
  args: { loanId: v.id("loans") },
  handler: async (
    ctx,
    { loanId },
  ): Promise<{
    namaBerkas: string;
    base64: string;
    nomorSurat: string;
    batasBayarTeks: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    await ctx.runQuery(api.security.assertAdminSession, {});

    const terbit = await ctx.runMutation(internal.somasi._terbitkan, {
      loanId,
      olehUserId: userId,
    });
    const data = await ctx.runQuery(internal.somasi._dataTerbit, { loanId });
    if (data === null) throw new Error("Snapshot surat somasi tidak ditemukan.");

    const byte = buatPdfSomasi(data.surat);
    await ctx.runMutation(internal.somasi._catatUnduh, {
      loanId,
      olehUserId: userId,
      nomorSurat: terbit.nomorSurat,
    });

    return {
      namaBerkas: namaBerkasSomasi(data.surat),
      base64: keBase64(byte),
      nomorSurat: data.surat.nomorSurat,
      batasBayarTeks: data.surat.batasBayarTeks,
    };
  },
});

/** Tandai surat sudah diserahkan kepada peminjam. */
export const tandaiSomasiDiserahkan = mutation({
  args: { loanId: v.id("loans"), melalui: v.optional(v.string()) },
  handler: async (ctx, { loanId, melalui }) => {
    const { userId, user } = await requireAdminSession(ctx);
    const cara = melalui ?? "manual";
    if (!PENYERAHAN.includes(cara as (typeof PENYERAHAN)[number])) {
      throw new Error("Cara penyerahan tidak dikenal.");
    }

    const row = await ctx.db
      .query("somasiTerbit")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .first();
    if (row === null) throw new Error("Terbitkan surat somasi lebih dulu.");
    if (row.diserahkanPada !== undefined) {
      throw new Error(
        `Surat ini sudah ditandai diserahkan pada ${formatTanggalWIB(row.diserahkanPada)}.`,
      );
    }

    const label = user.email ?? user.name ?? "admin";
    await ctx.db.patch(row._id, {
      diserahkanMelalui: cara,
      diserahkanPada: Date.now(),
      diserahkanOlehLabel: label,
    });

    const loan = await ctx.db.get(loanId);
    await audit(
      ctx,
      userId,
      label,
      "somasi_diserahkan",
      loan?.nomorReferensi ?? loanId,
      `Surat ${row.nomorSurat} ditandai diserahkan melalui ${cara}.`,
    );

    return { ok: true as const, melalui: cara };
  },
});

/** Koreksi bila tanda "sudah diserahkan" salah tekan. */
export const batalkanPenyerahanSomasi = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { userId, user } = await requireAdminSession(ctx);
    const row = await ctx.db
      .query("somasiTerbit")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .first();
    if (row === null) throw new Error("Surat somasi belum diterbitkan.");
    if (row.diserahkanPada === undefined) throw new Error("Surat ini belum ditandai diserahkan.");

    await ctx.db.patch(row._id, {
      diserahkanMelalui: undefined,
      diserahkanPada: undefined,
      diserahkanOlehLabel: undefined,
    });

    const loan = await ctx.db.get(loanId);
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "somasi_penyerahan_dibatalkan",
      loan?.nomorReferensi ?? loanId,
      `Tanda penyerahan surat ${row.nomorSurat} dibatalkan.`,
    );

    return { ok: true as const };
  },
});

/**
 * Catat hasil pasca-somasi setelah surat diserahkan.
 *
 * Yang disimpan adalah KEPUTUSAN petugas, bukan akibat finansialnya: pembayaran
 * tetap dicatat lewat jalur pinjaman, dan perubahan tenor lewat modul
 * restrukturisasi. Karena itu catatan ini tidak mengubah status pinjaman.
 */
export const catatTindakLanjutSomasi = mutation({
  args: {
    loanId: v.id("loans"),
    tindakLanjut: v.string(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, tindakLanjut, catatan }) => {
    const { userId, user } = await requireAdminSession(ctx);
    const sah = validasiTindakLanjutSomasi(tindakLanjut);
    if (!sah.ok) throw new Error(sah.alasan);

    const row = await ctx.db
      .query("somasiTerbit")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .first();
    if (row === null) throw new Error("Terbitkan surat somasi lebih dulu.");
    if (row.diserahkanPada === undefined) {
      throw new Error("Tandai surat sudah diserahkan dulu sebelum mencatat tindak lanjut.");
    }

    const isiCatatan = catatan?.trim() ?? "";
    if (isiCatatan.length > 500) {
      throw new Error("Catatan tindak lanjut maksimal 500 karakter.");
    }
    const label = user.email ?? user.name ?? "admin";
    const labelHasil = LABEL_TINDAK_LANJUT_SOMASI[sah.nilai as TindakLanjutSomasi];
    await ctx.db.patch(row._id, {
      tindakLanjut: sah.nilai,
      tindakLanjutPada: Date.now(),
      tindakLanjutOlehLabel: label,
      tindakLanjutCatatan: isiCatatan === "" ? undefined : isiCatatan,
    });

    const loan = await ctx.db.get(loanId);
    await audit(
      ctx,
      userId,
      label,
      "somasi_tindak_lanjut",
      loan?.nomorReferensi ?? loanId,
      `Tindak lanjut surat ${row.nomorSurat}: ${labelHasil}${isiCatatan === "" ? "." : ` · ${isiCatatan}`}`,
    );

    return { ok: true as const, tindakLanjut: sah.nilai, label: labelHasil };
  },
});

/** Catat hasil pengiriman pada baris log. */
export const _selesaikanKirim = internalMutation({
  args: {
    logId: v.id("somasiKirimLog"),
    status: v.string(),
    respon: v.optional(v.string()),
  },
  handler: async (ctx, { logId, status, respon }) => {
    const row = await ctx.db.get(logId);
    if (row === null) return;
    await ctx.db.patch(logId, {
      status,
      ...(respon === undefined ? {} : { respon: respon.slice(0, 500) }),
    });
  },
});

/** Tandai surat diserahkan setelah pengiriman berhasil. */
export const _catatPenyerahan = internalMutation({
  args: {
    somasiId: v.id("somasiTerbit"),
    kanal: v.string(),
    olehUserId: v.id("users"),
  },
  handler: async (ctx, { somasiId, kanal, olehUserId }) => {
    const row = await ctx.db.get(somasiId);
    if (row === null) return;
    // Kiriman ulang lewat kanal lain tetap tercatat di log, tetapi tanggal
    // penyerahan pertama tidak boleh bergeser oleh kiriman berikutnya.
    if (row.diserahkanPada !== undefined) return;
    const admin = await ctx.db.get(olehUserId);
    const label = admin?.email ?? admin?.name ?? "admin";
    await ctx.db.patch(somasiId, {
      diserahkanMelalui: kanal,
      diserahkanPada: Date.now(),
      diserahkanOlehLabel: label,
    });
    await audit(
      ctx,
      olehUserId,
      label,
      "somasi_diserahkan",
      row.nomorSurat,
      `Surat somasi ${row.nomorSurat} dikirim melalui ${kanal}.`,
    );
  },
});

function samarkanEmail(email: string): string {
  const [nama, domain] = email.split("@");
  if (domain === undefined || nama === "") return email;
  return `${nama.slice(0, 1)}***@${domain}`;
}

/** Kirim email lewat gateway integrasi (VLY) beserta lampiran PDF. */
async function kirimEmailGateway(input: {
  email: string;
  subjek: string;
  html: string;
  teks: string;
  namaBerkas: string;
  pdf: Uint8Array;
}): Promise<void> {
  const key = process.env.VLY_INTEGRATION_KEY;
  if (!key) {
    throw new Error(
      "VLY_INTEGRATION_KEY belum diatur di environment Convex, jadi surat somasi tidak bisa dikirim lewat email.",
    );
  }
  const dasar = (process.env.VLY_INTEGRATION_BASE_URL || "https://integrations.vly.ai").replace(
    /\/+$/,
    "",
  );

  const kontrol = new AbortController();
  const jam = setTimeout(() => kontrol.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(`${dasar}/v1/email/send`, {
      method: "POST",
      redirect: "error",
      signal: kontrol.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        to: [input.email],
        subject: input.subjek,
        html: input.html,
        text: input.teks,
        attachments: [
          {
            filename: input.namaBerkas,
            content: keBase64(input.pdf),
            encoding: "base64",
          },
        ],
      }),
    });
    const teks = (await res.text()).slice(0, 500);
    if (!res.ok) {
      throw new Error(
        `Gateway email menolak kiriman (HTTP ${res.status}): ${teks.replace(/Bearer\s+\S+/gi, "Bearer ***")}`,
      );
    }
    if (teks.includes('"success":false')) throw new Error("Gateway email menolak kiriman.");
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Gateway email tidak menjawab dalam ${GATEWAY_TIMEOUT_MS / 1000} detik.`,
      );
    }
    throw err instanceof Error ? err : new Error("Gagal mengirim email.");
  } finally {
    clearTimeout(jam);
  }
}

/** Batas jeda dan kuota sebelum menyentuh gateway. */
async function siapkanLogKirim(
  ctx: ActionCtx,
  opsi: {
    somasiId: Id<"somasiTerbit">;
    loanId: Id<"loans">;
    kanal: Kanal;
    tujuan: string;
    olehUserId: Id<"users">;
  },
): Promise<Id<"somasiKirimLog">> {
  const [logs, hariIni] = await Promise.all([
    ctx.runQuery(internal.somasi._logTerakhir, { loanId: opsi.loanId, kanal: opsi.kanal }),
    ctx.runQuery(internal.somasi._logHariIni, {
      olehUserId: opsi.olehUserId,
      kanal: opsi.kanal,
    }),
  ]);

  if (logs !== null) {
    const sisa = Math.ceil((JEDA_KIRIM_MS - (Date.now() - logs.pada)) / 1000);
    if (sisa > 0) {
      throw new Error(`Surat baru saja dikirim lewat kanal ini. Tunggu ${sisa} detik.`);
    }
  }
  if (hariIni >= MAKS_KIRIM_PER_HARI) {
    throw new Error(
      `Batas ${MAKS_KIRIM_PER_HARI} pengiriman surat somasi lewat ${opsi.kanal} per hari sudah tercapai.`,
    );
  }

  return ctx.runMutation(internal.somasi._mulaiKirim, opsi);
}

/** Log terakhir untuk pinjaman + kanal (untuk jeda). */
export const _logTerakhir = internalQuery({
  args: { loanId: v.id("loans"), kanal: v.string() },
  handler: async (ctx, { loanId, kanal }) => {
    const rows = await ctx.db
      .query("somasiKirimLog")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(20);
    return rows.find((r) => r.kanal === kanal) ?? null;
  },
});

/** Jumlah kiriman kanal ini oleh admin yang sama sejak awal hari WIB. */
export const _logHariIni = internalQuery({
  args: { olehUserId: v.id("users"), kanal: v.string() },
  handler: async (ctx, { olehUserId, kanal }) => {
    // Hari kuota mengikuti kalender WIB, bukan UTC: pergantian kuota pukul
    // 07.00 WIB akan terasa acak bagi admin yang bekerja pada malam hari.
    const awal = Math.floor((Date.now() + OFFSET_WIB_MS) / 86_400_000) * 86_400_000 - OFFSET_WIB_MS;
    const rows = await ctx.db
      .query("somasiKirimLog")
      .withIndex("by_oleh", (q) => q.eq("olehUserId", olehUserId).gte("pada", awal))
      .collect();
    return rows.filter((r) => r.kanal === kanal).length;
  },
});

export const _mulaiKirim = internalMutation({
  args: {
    somasiId: v.id("somasiTerbit"),
    loanId: v.id("loans"),
    kanal: v.string(),
    tujuan: v.string(),
    olehUserId: v.id("users"),
  },
  handler: async (ctx, args) =>
    ctx.db.insert("somasiKirimLog", {
      somasiId: args.somasiId,
      loanId: args.loanId,
      kanal: args.kanal,
      tujuan: args.tujuan,
      status: "diproses",
      olehUserId: args.olehUserId,
      pada: Date.now(),
    }),
});

/** Gerbang admin + aturan + snapshot + kontak, dipakai kedua kanal. */
async function siapkanKirim(
  ctx: ActionCtx,
  loanId: Id<"loans">,
): Promise<{
  userId: Id<"users">;
  surat: SuratSomasi;
  somasiId: Id<"somasiTerbit">;
  email: string | null;
  whatsapp: string | null;
}> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  await ctx.runQuery(api.security.assertAdminSession, {});

  const hasil = await ctx.runQuery(internal.somasi._susun, { loanId });
  if (!hasil.tersedia) throw new Error(hasil.alasan);
  if (!hasil.bolehKirim) {
    throw new Error(hasil.alasanKirim ?? "Surat somasi belum dapat dikirim.");
  }

  const aturan = await ctx.runQuery(internal.somasi._aturan, {});
  if (!aturan.aktif) {
    throw new Error("Modul penagihan sedang dinonaktifkan, jadi somasi tidak dikirim.");
  }
  if (!bolehKontakSekarang(Date.now(), aturan.jamKontak)) {
    throw new Error(
      `Di luar jam kontak ${aturan.jamKontak.mulai}:00-${aturan.jamKontak.selesai}:00 WIB. Coba lagi di dalam jendela tersebut.`,
    );
  }

  const terbit = await ctx.runMutation(internal.somasi._terbitkan, {
    loanId,
    olehUserId: userId,
  });
  const data = await ctx.runQuery(internal.somasi._dataTerbit, { loanId });
  if (data === null) throw new Error("Snapshot surat somasi tidak ditemukan.");
  const kontak = await ctx.runQuery(internal.somasi._kontak, { loanId });

  return {
    userId,
    surat: data.surat,
    somasiId: terbit.somasiId,
    email: kontak?.email ?? null,
    whatsapp: kontak?.whatsapp ?? null,
  };
}

/** Kirim surat somasi lewat email, dengan lampiran PDF. */
export const kirimSomasiEmail = action({
  args: { loanId: v.id("loans") },
  handler: async (
    ctx,
    { loanId },
  ): Promise<{ ok: true; kanal: "email"; tujuan: string }> => {
    const siap = await siapkanKirim(ctx, loanId);
    const email = siap.email?.trim() ?? "";
    if (email === "" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(
        "Peminjam belum punya alamat email yang sah, jadi surat somasi tidak bisa dikirim lewat email.",
      );
    }

    const logId = await siapkanLogKirim(ctx, {
      somasiId: siap.somasiId,
      loanId,
      kanal: "email",
      tujuan: email,
      olehUserId: siap.userId,
    });

    try {
      await kirimEmailGateway({
        email,
        subjek: subjekSomasiEmail(siap.surat),
        html: htmlSomasiEmail(siap.surat),
        teks: teksSomasiWhatsapp(siap.surat),
        namaBerkas: namaBerkasSomasi(siap.surat),
        pdf: buatPdfSomasi(siap.surat),
      });
      await ctx.runMutation(internal.somasi._selesaikanKirim, {
        logId,
        status: "terkirim",
        respon: "email dengan lampiran PDF",
      });
      await ctx.runMutation(internal.somasi._catatPenyerahan, {
        somasiId: siap.somasiId,
        kanal: "email",
        olehUserId: siap.userId,
      });
      return { ok: true as const, kanal: "email" as const, tujuan: email };
    } catch (err) {
      const pesan = pesanGalat(err);
      await ctx.runMutation(internal.somasi._selesaikanKirim, {
        logId,
        status: "gagal",
        respon: pesan,
      });
      throw new Error(pesan);
    }
  },
});

/** Kirim surat somasi lewat WhatsApp, dengan lampiran PDF bila didukung. */
export const kirimSomasiWhatsapp = action({
  args: { loanId: v.id("loans") },
  handler: async (
    ctx,
    { loanId },
  ): Promise<{ ok: true; kanal: "whatsapp"; tujuan: string; lampiran: boolean }> => {
    const siap = await siapkanKirim(ctx, loanId);
    const nomor = siap.whatsapp?.trim() ?? "";
    if (nomor === "") {
      throw new Error(
        "Peminjam belum punya nomor WhatsApp di data KYC maupun di akunnya, jadi somasi tidak bisa dikirim lewat WhatsApp.",
      );
    }

    const logId = await siapkanLogKirim(ctx, {
      somasiId: siap.somasiId,
      loanId,
      kanal: "whatsapp",
      tujuan: nomor,
      olehUserId: siap.userId,
    });

    const isi = teksSomasiWhatsapp(siap.surat);
    try {
      const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
      if (settings.aktif !== true || !settings.apiUrl) {
        throw new Error("Integrasi WhatsApp belum aktif, jadi somasi tidak dikirim.");
      }
      const apiKey = apiKeyGatewayWa();
      if (apiKey === "") throw new Error("WHATSAPP_API_KEY belum diisi di environment.");

      const byte = buatPdfSomasi(siap.surat);
      if (byte.length > BATAS_LAMPIRAN_BYTE) {
        throw new Error(`Surat somasi terlalu besar untuk lampiran WhatsApp (${byte.length} byte).`);
      }
      const berkasId = await ctx.storage.store(
        new Blob([new Uint8Array(byte)], { type: "application/pdf" }),
      );
      const url = await ctx.storage.getUrl(berkasId);
      if (url === null) throw new Error("Berkas somasi gagal disiapkan di penyimpanan.");

      const hasil = await kirimViaGateway(apiKey, settings, nomor, isi, {
        url,
        nama: namaBerkasSomasi(siap.surat),
      });
      await ctx.scheduler.runAfter(RETENSI_BERKAS_MS, internal.laporanPendana._hapusBerkas, {
        storageId: berkasId,
      });

      let lampiran = true;
      if (!hasil.ok) {
        // Gateway yang menolak lampiran belum mengirim apa pun, jadi versi teks
        // masih boleh menyusul.
        if (!hasil.respon.includes(ALASAN_TANPA_LAMPIRAN)) throw new Error(hasil.respon);
        const teks = await kirimViaGateway(apiKey, settings, nomor, isi);
        if (!teks.ok) throw new Error(teks.respon);
        lampiran = false;
      }

      await ctx.runMutation(internal.somasi._selesaikanKirim, {
        logId,
        status: "terkirim",
        respon: lampiran ? "WhatsApp dengan lampiran PDF" : "WhatsApp teks tanpa lampiran",
      });
      await ctx.runMutation(internal.somasi._catatPenyerahan, {
        somasiId: siap.somasiId,
        kanal: "whatsapp",
        olehUserId: siap.userId,
      });
      return { ok: true as const, kanal: "whatsapp" as const, tujuan: nomor, lampiran };
    } catch (err) {
      const pesan = pesanGalat(err);
      await ctx.runMutation(internal.somasi._selesaikanKirim, {
        logId,
        status: "gagal",
        respon: pesan,
      });
      throw new Error(pesan);
    }
  },
});
