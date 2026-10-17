/**
 * MIGRASI DATA LAMA — memetakan nasabah/pengajuan lama ke struktur MASTER.
 *
 * Tujuan: memisahkan MASTER DATA NASABAH dari TRANSAKSI PENGAJUAN tanpa
 * menghapus/mengubah histori pinjaman yang sudah ada. Migrasi ini:
 *
 *  1. TIDAK menyentuh baris `loans` selain MENAMBAH relasi yang masih kosong
 *     (`nasabahUserId`, `kycProfilId`, `kycStatusSaatPengajuan`) — nominal,
 *     status, tanggal, dan seluruh nilai finansial lama tidak diubah.
 *  2. Membuat `nasabahProfil` HANYA bila akun punya pinjaman tetapi belum punya
 *     master data, dan hanya dari identitas yang sudah tercatat di pinjamannya.
 *     Baris yang sudah ada TIDAK PERNAH ditimpa.
 *  3. TIDAK PERNAH mengarang status KYC. Status yang disalin hanya status yang
 *     benar-benar ada di `kycProfil`; bila tidak ada, pengajuan dicatat
 *     `NOT_STARTED` (bukan VERIFIED).
 *  4. Duplikat TIDAK digabung otomatis. Kelompok kembar hanya DILAPORKAN;
 *     penggabungan tetap keputusan admin lewat alat yang sudah ada
 *     (`duplikatNasabah.gabungNasabah`).
 *  5. Dapat dibatalkan: setiap baris yang dibuat/diubah menyimpan penanda
 *     `migrasiPada`, dan `batalkanMigrasiNasabah` hanya membersihkan baris
 *     dengan penanda itu.
 *
 * Semua aksi tercatat di Audit Trail (`migrasi_nasabah` / `batal_migrasi_nasabah`).
 */
import { v } from "convex/values";

import { kelompokkanKembar } from "../lib/duplikatNasabah";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";
import type { Doc, Id } from "./_generated/dataModel";

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  return requireAdminSession(ctx as QueryCtx);
}

/** NIK 16 digit — sama dengan validasi jalur pengajuan. */
function nikValid(nilai: string | undefined): nilai is string {
  return nilai !== undefined && /^\d{16}$/.test(nilai);
}

/** WhatsApp format 62… tanpa +/spasi — sama dengan validasi jalur pengajuan. */
function waValid(nilai: string | undefined): nilai is string {
  return nilai !== undefined && /^62\d{8,13}$/.test(nilai);
}

/** Identitas pengajuan yang lengkap untuk dijadikan master nasabah. */
function identitasDariPinjaman(loan: Doc<"loans">) {
  const nama = loan.namaLengkap?.trim() ?? "";
  const nik = loan.nik?.replace(/\s+/g, "");
  const wa = loan.nomorWhatsApp?.replace(/[\s+-]/g, "");
  const lengkap =
    nama.length >= 3 && nikValid(nik) && waValid(wa);
  return { nama, nik, wa, lengkap };
}

/**
 * LAPORAN MIGRASI (dry-run, admin) — apa yang akan dilakukan dan apa yang
 * perlu ditinjau MANUAL. Tidak mengubah data.
 */
export const laporanMigrasiNasabah = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const [loans, profils, kycRows, users, pawns, kredits] = await Promise.all([
      ctx.db.query("loans").collect(),
      ctx.db.query("nasabahProfil").collect(),
      ctx.db.query("kycProfil").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("pawns").collect(),
      ctx.db.query("kreditBarang").collect(),
    ]);

    const profilPer = new Set(profils.map((p) => p.userId as string));
    const kycPer = new Set(kycRows.map((k) => k.userId as string));

    // Pengguna yang punya minimal satu pengajuan.
    const idPeminjam = new Set<string>(loans.map((l) => l.userId as string));

    let penggunaTanpaProfil = 0;
    let penggunaPerluReviewManual = 0;
    const contohPerluReview: Array<{ userId: string; sebab: string }> = [];
    const pinjamanTanpaRelasi = loans.filter((l) => l.nasabahUserId === undefined).length;
    const pinjamanTanpaKycLink = loans.filter((l) => l.kycProfilId === undefined).length;

    for (const userId of idPeminjam) {
      const loansUser = loans.filter((l) => (l.userId as string) === userId);
      if (!profilPer.has(userId)) {
        penggunaTanpaProfil += 1;
        const punyaIdentitas = loansUser.some((l) => identitasDariPinjaman(l).lengkap);
        if (!punyaIdentitas) {
          penggunaPerluReviewManual += 1;
          if (contohPerluReview.length < 25) {
            contohPerluReview.push({
              userId,
              sebab: "Punya pinjaman tetapi identitas (nama/NIK/WhatsApp) belum lengkap — master nasabah tidak dapat dibuat otomatis.",
            });
          }
        }
      }
      if (!kycPer.has(userId) && loansUser.some((l) => l.dokKtpId !== undefined)) {
        if (contohPerluReview.length < 25) {
          contohPerluReview.push({
            userId,
            sebab: "Ada dokumen KTP lama di pengajuan, tetapi belum ada baris KYC master — verifikasi ulang melalui modul KYC.",
          });
        }
      }
    }

    // Kandidat duplikat (dilaporkan, TIDAK digabung).
    const hitungBerkas = (userId: string) =>
      loans.filter((l) => (l.userId as string) === userId).length +
      pawns.filter((p) => (p.userId as string) === userId).length +
      kredits.filter((k) => (k.userId as string) === userId).length;
    const namaPer = new Map(users.map((u) => [u._id as string, u.name ?? u.email ?? ""]));
    const kelompok = kelompokkanKembar(
      profils.map((p) => ({
        userId: p.userId as string,
        nama: namaPer.get(p.userId as string) ?? p.namaLengkap,
        nik: p.nik,
        nomorWhatsApp: p.nomorWhatsApp,
        jumlahBerkas: hitungBerkas(p.userId as string),
        dibuatAdmin: users.find((u) => u._id === p.userId)?.dibuatAdminPada !== undefined,
      })),
    );

    return {
      totalPinjaman: loans.length,
      totalProfilMaster: profils.length,
      totalKycMaster: kycRows.length,
      profilDibuatMigrasi: profils.filter((p) => p.dibuatMigrasi === true).length,
      penggunaDenganPinjaman: idPeminjam.size,
      penggunaTanpaProfil,
      penggunaPerluReviewManual,
      pinjamanTanpaRelasiMaster: pinjamanTanpaRelasi,
      pinjamanTanpaKycLink,
      kandidatDuplikat: kelompok.length,
      contohPerluReview,
    };
  },
});

/**
 * JALANKAN MIGRASI (admin) — idempoten & aditif. Aman dijalankan berulang kali:
 * baris yang sudah punya master tidak disentuh lagi.
 *
 * Mengembalikan `migrasiPada` yang HARUS disimpan pemanggil bila nanti ingin
 * membatalkan lewat `batalkanMigrasiNasabah`.
 */
export const jalankanMigrasiNasabah = mutation({
  args: {
    /** Batas maksimum pengguna yang diproses sekali jalan (default 200). */
    batas: v.optional(v.number()),
  },
  handler: async (ctx, { batas }) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const limit = batas === undefined ? 200 : Math.max(1, Math.min(2000, Math.floor(batas)));
    const migrasiPada = Date.now();

    const [loans, profils, kycRows] = await Promise.all([
      ctx.db.query("loans").collect(),
      ctx.db.query("nasabahProfil").collect(),
      ctx.db.query("kycProfil").collect(),
    ]);
    const profilPer = new Set(profils.map((p) => p.userId as string));
    const kycPerUser = new Map<string, Doc<"kycProfil">>();
    for (const k of kycRows) kycPerUser.set(k.userId as string, k);

    // Kelompokkan pinjaman per pemilik agar satu pengguna = satu profil master.
    const pinjamanPer = new Map<string, Doc<"loans">[]>();
    for (const l of loans) {
      const key = l.userId as string;
      const arr = pinjamanPer.get(key);
      if (arr === undefined) pinjamanPer.set(key, [l]);
      else arr.push(l);
    }

    let profilDibuat = 0;
    let penggunaDilewatiTanpaIdentitas = 0;
    let pinjamanDilekati = 0;
    let selesai = 0;

    for (const [userId, loansUser] of pinjamanPer) {
      if (selesai >= limit) break;
      selesai += 1;
      const uid = userId as Id<"users">;

      // 1. Backfill MASTER nasabah bila belum ada — hanya dari identitas yang
      //    memang sudah tercatat, dan hanya bila lengkap.
      if (!profilPer.has(userId)) {
        // Pilih pengajuan dengan identitas lengkap; yang terbaru menang.
        const kandidat = loansUser
          .filter((l) => identitasDariPinjaman(l).lengkap)
          .sort((a, b) => (b.diajukanPada ?? b._creationTime) - (a.diajukanPada ?? a._creationTime))[0];
        const ident = kandidat === undefined ? null : identitasDariPinjaman(kandidat);
        // Jaring pengaman ganda: tanpa NIK/WhatsApp yang sah, jangan buat master
        // (dan jangan mengarang nilai kosong).
        if (
          kandidat === undefined ||
          ident === null ||
          !nikValid(ident.nik) ||
          !waValid(ident.wa)
        ) {
          penggunaDilewatiTanpaIdentitas += 1;
        } else {
          await ctx.db.insert("nasabahProfil", {
            userId: uid,
            namaLengkap: ident.nama.toUpperCase(),
            nik: ident.nik,
            nomorWhatsApp: ident.wa,
            penghasilanBulanan: kandidat.penghasilanBulanan,
            namaBank: kandidat.namaBank,
            nomorRekening: kandidat.nomorRekening,
            sumber: "nasabah",
            diperbaruiPada: migrasiPada,
            diperbaruiOlehLabel: "migrasi data lama",
            dibuatMigrasi: true,
          });
          profilDibuat += 1;
        }
      }

      // 2. Lekati relasi master pada pengajuan yang belum punya (aditif saja).
      const kyc = kycPerUser.get(userId);
      for (const l of loansUser) {
        const patch: Partial<Doc<"loans">> = {};
        if (l.nasabahUserId === undefined) patch.nasabahUserId = uid;
        if (l.kycProfilId === undefined && kyc !== undefined) patch.kycProfilId = kyc._id;
        if (l.kycStatusSaatPengajuan === undefined) {
          patch.kycStatusSaatPengajuan = kyc?.status ?? "NOT_STARTED";
        }
        if (Object.keys(patch).length === 0) continue;
        patch.migrasiPada = migrasiPada;
        await ctx.db.patch(l._id, patch);
        pinjamanDilekati += 1;
      }
    }

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "migrasi_nasabah",
      "nasabahProfil/loans",
      `Migrasi master nasabah dijalankan: ${profilDibuat} master nasabah dibuat, ` +
        `${pinjamanDilekati} pengajuan dilekati relasi master, ` +
        `${penggunaDilewatiTanpaIdentitas} pemilik dilewati karena identitas tidak lengkap ` +
        `(perlu review manual). Penanda migrasi: ${migrasiPada}.`,
    );

    return {
      ok: true,
      migrasiPada,
      profilDibuat,
      pinjamanDilekati,
      penggunaDilewatiTanpaIdentitas,
      penggunaDiproses: selesai,
    };
  },
});

/**
 * BATALKAN MIGRASI (admin) — membersihkan HANYA baris yang dibuat/ditandai oleh
 * satu jalannya migrasi (dicocokkan dengan `migrasiPada`). Histori pinjaman
 * tidak pernah dihapus; yang dibersihkan hanya relasi master yang ditambahkan.
 */
export const batalkanMigrasiNasabah = mutation({
  args: { migrasiPada: v.number() },
  handler: async (ctx, { migrasiPada }) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);

    const profils = await ctx.db.query("nasabahProfil").collect();
    const profilMigrasi = profils.filter(
      (p) => p.dibuatMigrasi === true && p.diperbaruiPada === migrasiPada,
    );
    for (const p of profilMigrasi) await ctx.db.delete(p._id);

    const loans = await ctx.db.query("loans").collect();
    const pinjamanTandai = loans.filter((l) => l.migrasiPada === migrasiPada);
    for (const l of pinjamanTandai) {
      await ctx.db.patch(l._id, {
        nasabahUserId: undefined,
        kycProfilId: undefined,
        kycStatusSaatPengajuan: undefined,
        migrasiPada: undefined,
      });
    }

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "batal_migrasi_nasabah",
      "nasabahProfil/loans",
      `Migrasi dibatalkan (penanda ${migrasiPada}): ${profilMigrasi.length} master nasabah hasil migrasi dihapus, ` +
        `${pinjamanTandai.length} relasi master pada pengajuan dibersihkan. Histori pinjaman tidak disentuh.`,
    );

    return {
      ok: true,
      profilDihapus: profilMigrasi.length,
      relasiDibersihkan: pinjamanTandai.length,
    };
  },
});

/**
 * PERBAIKAN DATA SATU BARIS — hapus nomor WhatsApp yang salah menempel pada
 * sebuah pinjaman. Internal-only: tidak bisa dipanggil dari aplikasi, hanya
 * lewat CLI operator, dan nomornya harus cocok dengan isi baris supaya tidak
 * ada pinjaman lain yang ikut tersentuh. Nominal, status, dan tanggal tidak
 * berubah — hanya kolom nomor yang dihapus, dengan jejak di Audit Trail.
 */
export const _hapusNomorPinjaman = internalMutation({
  args: { pinjamanId: v.id("loans"), nomor: v.string() },
  handler: async (ctx, { pinjamanId, nomor }) => {
    const pinjaman = await ctx.db.get(pinjamanId);
    if (pinjaman === null) throw new Error("Pinjaman tidak ditemukan.");
    if (pinjaman.nomorWhatsApp !== nomor) {
      throw new Error("Nomor pada pinjaman tidak cocok; tidak ada yang diubah.");
    }
    await ctx.db.patch(pinjamanId, { nomorWhatsApp: undefined });
    await audit(
      ctx,
      undefined,
      "perbaikan data operator",
      "hapus_nomor_pinjaman",
      `loans/${pinjamanId}`,
      `Nomor WhatsApp dihapus dari pinjaman ${pinjaman.nomorReferensi} (${pinjaman.namaLengkap}) atas permintaan pemilik data. ` +
        "Nominal, status, dan tanggal tidak diubah.",
    );
    return { ok: true, nomorReferensi: pinjaman.nomorReferensi };
  },
});
