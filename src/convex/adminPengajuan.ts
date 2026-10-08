/**
 * Pencatatan pengajuan manual oleh admin (pinjaman tunai, gadai, kredit barang).
 *
 * Dipakai saat pengajuan masuk di luar aplikasi (nasabah datang ke kantor,
 * data lama dipindahkan ke sistem, atau pengajuan dicatat atas permintaan
 * nasabah). Berkas terpisah dari `admin.ts` supaya jalur ini jelas batasnya:
 *
 *  - **Hanya bentuk yang divalidasi di sini.** Semua angka uang (bunga, biaya,
 *    DP, cicilan, kewajiban) tetap dihitung mesin server saat dibaca; yang
 *    disimpan hanya data pengajuan apa adanya.
 *  - **Plafon tetap berlaku.** Pokok pinjaman yang dicatat manual melewati
 *    pemeriksaan plafon efektif nasabah yang sama dengan jalur nasabah —
 *    menaikkan plafon adalah keputusan terpisah yang punya audit sendiri
 *    (lihat `setPlafonPeminjam`).
 *  - **Identitas diambil dari data diri nasabah**, bukan diketik ulang: NIK,
 *    nomor WhatsApp, penghasilan, dan (bila ada) rekening tujuan diisi dari
 *    `nasabahProfil`. Pengajuan kredit barang menolak dicatat sebelum data
 *    diri lengkap karena kontraknya menyimpan identitas pemohon.
 *  - **Selalu menjadi pengajuan `diajukan`.** Pencatatan manual TIDAK
 *    memutuskan kredit: keputusan tetap lewat antrean review yang sudah ada,
 *    sehingga jalur audit keputusan tidak terbelah dua.
 *  - **Semua tercatat di Audit Trail** dengan aksi `pengajuan_manual_*`, agar
 *    baris yang dibuat admin dapat dibedakan dari pengajuan nasabah.
 *
 * Kill switch sengaja TIDAK menutup jalur ini: kill switch menghentikan
 * pengajuan BARU dari aplikasi nasabah, sedangkan admin memakainya justru saat
 * alur normal bermasalah dan pengajuan harus tetap dicatat.
 */
import { v } from "convex/values";

import { KREDIT_ASUMSI_AWAL, KREDIT_BARANG_POKOK_MAKS, pokokKreditBarangDalamBatas, quoteKreditBarang } from "../lib/kredit";
import { formatRupiah } from "../lib/money";
import { persenBungaEfektif } from "../lib/bunga";
import {
  nomorReferensiManual,
  validasiGadaiManual,
  validasiKreditManual,
  validasiPinjamanManual,
  type NasabahManual,
} from "../lib/pengajuanManual";
import { pesanPlafonTerlampaui, plafonPeminjam, pokokDalamPlafon } from "../lib/plafon";
import { requireAdminSession } from "./adminAuthz";
import { ROLES } from "./schema";
import { audit, getConfig } from "./system";
import { ensureKodePeminjam } from "./peminjamCode";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Gerbang admin — seluruh query/mutation di berkas ini dijaga. */
async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

/** Nasabah tujuan pencatatan: akun terverifikasi non-admin yang benar-benar ada. */
async function ambilNasabah(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Nasabah tidak ditemukan.");
  if (user.role === ROLES.ADMIN) {
    throw new Error("Pengajuan atas nama akun admin tidak dicatat dari panel ini.");
  }
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu tidak dapat memiliki pengajuan. Minta nasabah masuk dengan akun terverifikasi.",
    );
  }
  const profil = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return { user, profil };
}

/** Baris hasil pencarian nasabah untuk pemilih di panel admin. */
function ringkasNasabah(
  user: Doc<"users">,
  profil: Doc<"nasabahProfil"> | null,
): NasabahManual {
  return {
    userId: user._id,
    nama: user.name ?? profil?.namaLengkap ?? user.email ?? "Tanpa nama",
    email: user.email ?? null,
    kodePeminjam: user.kodePeminjam ?? null,
    adaDataDiri: profil !== null,
    namaBank: profil?.namaBank ?? null,
    nomorRekening: profil?.nomorRekening ?? null,
  };
}

/**
 * Nasabah yang dapat dipilih admin sebagai pemilik pengajuan manual.
 * `kueri` kosong mengembalikan daftar awal (diurutkan nama) supaya panel tidak
 * tampil kosong sebelum diketik. Akun admin dan akun tamu tidak ditawarkan.
 */
export const cariNasabah = query({
  args: { kueri: v.string() },
  handler: async (ctx, { kueri }) => {
    await requireAdmin(ctx);
    const [users, profilRows] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("nasabahProfil").collect(),
    ]);
    const profilPerUser = new Map(profilRows.map((p) => [p.userId as string, p]));
    const needle = kueri.trim().toLowerCase();
    const hasil: NasabahManual[] = [];
    for (const user of users) {
      if (user.role === ROLES.ADMIN) continue;
      if (user.isAnonymous === true) continue;
      const profil = profilPerUser.get(user._id) ?? null;
      if (needle !== "") {
        const kandidat = [
          user.name ?? "",
          user.email ?? "",
          user.kodePeminjam ?? "",
          profil?.nik ?? "",
        ];
        if (!kandidat.some((teks) => teks.toLowerCase().includes(needle))) continue;
      }
      hasil.push(ringkasNasabah(user, profil));
    }
    hasil.sort((a, b) => a.nama.localeCompare(b.nama));
    return { hasil: hasil.slice(0, 20), total: hasil.length };
  },
});

/** Label aktor untuk audit trail — email lebih mudah ditelusuri daripada nama. */
function labelAdmin(admin: Doc<"users">): string {
  return admin.email ?? admin.name ?? "admin";
}

/**
 * Nasabah yang menerima pengajuan harus tampil di ruang peminjam, jadi peran
 * akun disamakan dengan jalur pengajuan nasabah: akun tanpa peran atau akun
 * penyedia dana yang mengajukan sendiri dicatat sebagai Peminjam.
 */
async function pastikanPeranPeminjam(
  ctx: MutationCtx,
  userId: Id<"users">,
  user: Doc<"users">,
): Promise<void> {
  if (user.role === undefined || user.role === ROLES.DANA) {
    await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
  }
}

/** Catat satu pengajuan pinjaman tunai atas nama nasabah — admin. */
export const catatPinjamanManual = mutation({
  args: {
    userIdTarget: v.id("users"),
    pokokPinjaman: v.number(),
    /** Skema harian (7/14/30 hari). Diabaikan bila `tenorBulan` diisi. */
    tenorHari: v.optional(v.number()),
    /** Skema bulanan (1/3/6 bulan). */
    tenorBulan: v.optional(v.number()),
    tujuan: v.string(),
    /** Kosong = pakai nama bank dari data diri nasabah. */
    namaBank: v.optional(v.string()),
    /** Kosong = pakai nomor rekening dari data diri nasabah. */
    nomorRekening: v.optional(v.string()),
    /** Kosong = pakai nama dari data diri/akun nasabah. */
    namaLengkap: v.optional(v.string()),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const { user, profil } = await ambilNasabah(ctx, args.userIdTarget);
    const bersih = validasiPinjamanManual({
      pokokPinjaman: args.pokokPinjaman,
      tenorHari: args.tenorHari,
      tenorBulan: args.tenorBulan,
      tujuan: args.tujuan,
      namaLengkap: args.namaLengkap ?? profil?.namaLengkap ?? user.name ?? user.email ?? "",
      namaBank: args.namaBank ?? profil?.namaBank ?? "",
      nomorRekening: args.nomorRekening ?? profil?.nomorRekening ?? "",
      catatanPeminjam: args.catatanPeminjam,
    });

    // Plafon efektif nasabah — jalur manual tidak boleh menjadi celah
    // melewati batas kredit. Menaikkan plafon adalah keputusan terpisah.
    const plafon = await plafonPeminjam(ctx, args.userIdTarget);
    if (!pokokDalamPlafon(bersih.pokokPinjaman, plafon)) {
      throw new Error(pesanPlafonTerlampaui(plafon));
    }

    const cfg = await getConfig(ctx);
    await pastikanPeranPeminjam(ctx, args.userIdTarget, user);
    await ensureKodePeminjam(ctx, args.userIdTarget);

    const now = Date.now();
    const nomorReferensi = nomorReferensiManual("pinjaman", now);
    const loanId = await ctx.db.insert("loans", {
      userId: args.userIdTarget,
      pokokPinjaman: bersih.pokokPinjaman,
      pokokDiajukan: bersih.pokokPinjaman,
      tujuan: bersih.tujuan,
      catatanPeminjam: bersih.catatanPeminjam,
      namaLengkap: bersih.namaLengkap,
      namaBank: bersih.namaBank,
      nomorRekening: bersih.nomorRekening,
      status: "diajukan",
      nomorReferensi,
      tenorHari: bersih.tenorHari,
      tenorBulan: bersih.tenorBulan,
      // Snapshot bunga efektif nasabah — angka pinjaman ini stabil setelahnya.
      persenBunga: persenBungaEfektif(user.persenBunga, cfg.persenBunga),
      // Identitas dari data diri tersimpan, tidak diketik ulang admin.
      nik: profil?.nik,
      nomorWhatsApp: profil?.nomorWhatsApp,
      penghasilanBulanan: profil?.penghasilanBulanan,
      sumberPenghasilan: profil?.pekerjaan,
    });
    await audit(
      ctx,
      adminId,
      labelAdmin(admin),
      "pengajuan_manual_pinjaman",
      nomorReferensi,
      `Pencatatan manual oleh admin untuk ${bersih.namaLengkap} — pokok ${formatRupiah(
        bersih.pokokPinjaman,
      )}${bersih.tenorBulan !== undefined ? `, tenor ${bersih.tenorBulan} bulan` : `, tenor ${bersih.tenorHari} hari`}, plafon nasabah ${formatRupiah(
        plafon,
      )}. Status awal "diajukan" — keputusan tetap lewat antrean review.`,
    );
    return { appId: loanId, nomorReferensi };
  },
});

/** Catat satu pengajuan gadai atas nama nasabah — admin. */
export const catatGadaiManual = mutation({
  args: {
    userIdTarget: v.id("users"),
    deskripsiBarang: v.string(),
    kategori: v.string(),
    alamatPenilaian: v.string(),
    /** Kosong = pakai nama bank dari data diri nasabah. */
    namaBank: v.optional(v.string()),
    /** Kosong = pakai nomor rekening dari data diri nasabah. */
    nomorRekening: v.optional(v.string()),
    /** Kosong = pakai nama dari data diri/akun nasabah. */
    namaLengkap: v.optional(v.string()),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const { user, profil } = await ambilNasabah(ctx, args.userIdTarget);
    const bersih = validasiGadaiManual({
      deskripsiBarang: args.deskripsiBarang,
      kategori: args.kategori,
      alamatPenilaian: args.alamatPenilaian,
      namaLengkap: args.namaLengkap ?? profil?.namaLengkap ?? user.name ?? user.email ?? "",
      namaBank: args.namaBank ?? profil?.namaBank ?? "",
      nomorRekening: args.nomorRekening ?? profil?.nomorRekening ?? "",
      catatanPeminjam: args.catatanPeminjam,
    });

    await pastikanPeranPeminjam(ctx, args.userIdTarget, user);
    await ensureKodePeminjam(ctx, args.userIdTarget);

    const now = Date.now();
    const nomorReferensi = nomorReferensiManual("gadai", now);
    const pawnId = await ctx.db.insert("pawns", {
      userId: args.userIdTarget,
      deskripsiBarang: bersih.deskripsiBarang,
      kategori: bersih.kategori,
      alamatPenilaian: bersih.alamatPenilaian,
      namaLengkap: bersih.namaLengkap,
      namaBank: bersih.namaBank,
      nomorRekening: bersih.nomorRekening,
      catatanPeminjam: bersih.catatanPeminjam,
      // Nilai taksiran, harga pasar, dan kondisi fisik sengaja kosong: itu
      // penilaian tim, bukan data yang bisa ditebak saat pencatatan manual.
      status: "diajukan",
      nomorReferensi,
    });
    await audit(
      ctx,
      adminId,
      labelAdmin(admin),
      "pengajuan_manual_gadai",
      nomorReferensi,
      `Pencatatan manual oleh admin untuk ${bersih.namaLengkap} — ${bersih.kategori}: ${bersih.deskripsiBarang}. Status awal "diajukan"; nilai taksiran menunggu penilaian tim.`,
    );
    return { appId: pawnId, nomorReferensi };
  },
});

/** Catat satu pengajuan kredit barang atas nama nasabah — admin. */
export const catatKreditManual = mutation({
  args: {
    userIdTarget: v.id("users"),
    namaBarang: v.string(),
    kategori: v.string(),
    merchant: v.string(),
    tautanBarang: v.optional(v.string()),
    hargaBarang: v.number(),
    /** 1/3/6 bulan (skema bulanan: DP 0%, margin mengikuti tenor). */
    tenorBulan: v.number(),
    /** Kosong = pakai nomor rekening dari data diri nasabah. */
    nomorRekening: v.optional(v.string()),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const { user, profil } = await ambilNasabah(ctx, args.userIdTarget);
    // Kontrak kredit menyimpan identitas pemohon (nama, NIK, WhatsApp), jadi
    // data diri wajib ada lebih dulu — lebih baik ditolak daripada diisi karangan.
    if (profil === null) {
      throw new Error(
        "Data diri nasabah belum lengkap (nama, NIK, nomor WhatsApp). Lengkapi lewat menu Plafon Nasabah → Data Diri sebelum mencatat pengajuan kredit.",
      );
    }
    const bersih = validasiKreditManual({
      namaBarang: args.namaBarang,
      kategori: args.kategori,
      merchant: args.merchant,
      tautanBarang: args.tautanBarang,
      hargaBarang: args.hargaBarang,
      tenorBulan: args.tenorBulan,
      // Rekening boleh diketik admin; kalau kosong diambil dari data diri
      // nasabah — satu aturan format dengan jalur pengajuan nasabah.
      nomorRekening: args.nomorRekening ?? profil.nomorRekening ?? "",
      catatanPeminjam: args.catatanPeminjam,
    });
    // Mesin kredit yang sama dengan jalur nasabah: DP 0% dan margin tenor
    // bawaan untuk skema bulanan, sehingga rincian tidak bisa berbeda.
    const quote = quoteKreditBarang({
      hargaBarang: bersih.hargaBarang,
      dpPersen: KREDIT_ASUMSI_AWAL.dpPersen,
      tenorBulan: bersih.tenorBulan,
      marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
    });
    if (!pokokKreditBarangDalamBatas(quote.pokokDibiayai)) {
      throw new Error(
        `Pokok dibiayai kredit barang maksimal ${formatRupiah(KREDIT_BARANG_POKOK_MAKS)}.`,
      );
    }

    await pastikanPeranPeminjam(ctx, args.userIdTarget, user);
    await ensureKodePeminjam(ctx, args.userIdTarget);

    const now = Date.now();
    const nomorReferensi = nomorReferensiManual("kredit", now);
    const kreditId = await ctx.db.insert("kreditBarang", {
      userId: args.userIdTarget,
      nomorReferensi,
      namaBarang: bersih.namaBarang,
      kategori: bersih.kategori,
      merchant: bersih.merchant,
      tautanBarang: bersih.tautanBarang,
      hargaBarang: bersih.hargaBarang,
      dpPersen: KREDIT_ASUMSI_AWAL.dpPersen,
      tenorBulan: bersih.tenorBulan,
      marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
      status: "diajukan",
      namaLengkap: profil.namaLengkap,
      nik: profil.nik,
      nomorRekening: bersih.nomorRekening,
      nomorWhatsApp: profil.nomorWhatsApp,
      catatanPeminjam: bersih.catatanPeminjam,
    });
    await audit(
      ctx,
      adminId,
      labelAdmin(admin),
      "pengajuan_manual_kredit",
      nomorReferensi,
      `Pencatatan manual oleh admin untuk ${profil.namaLengkap} — ${bersih.namaBarang} (${bersih.merchant}, harga ${formatRupiah(
        bersih.hargaBarang,
      )}, tenor ${bersih.tenorBulan} bulan, cicilan ${formatRupiah(
        quote.cicilanPerBulan,
      )}). Status awal "diajukan".`,
    );
    return { appId: kreditId, nomorReferensi };
  },
});
