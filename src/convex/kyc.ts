import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { audit } from "./system";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdminSession } from "./adminAuthz";
import { simpanDataDiriProfil } from "./dataDiriProfil";
import { bacaDataDiri, galatDataDiri, type DataDiriForm } from "../lib/dataDiri";
import {
  bolehTransisi,
  keputusanWajibAlasan,
  kekuranganKyc,
  lengkapKyc,
  perluVerifikasiUlang,
  statusSetelahSunting,
  stempelIdentitas,
  type AktorKyc,
  type IsianKycRingkas,
  type StatusKyc,
  type StempelIdentitas,
} from "../lib/kycStatus";

/**
 * MODUL KYC MANDIRI — terpisah dari formulir pengajuan pinjaman.
 *
 * Batas modul ini (dijaga `src/lib/kycStatus.ts`):
 *
 * - Nasabah dapat **memulai**, **menyimpan progres**, **melanjutkan**, dan
 *   **mengirim** pengajuan KYC tanpa membuat pengajuan pinjaman apa pun.
 * - Tujuh status: NOT_STARTED → IN_PROGRESS → PENDING_REVIEW →
 *   (VERIFIED | NEEDS_CORRECTION | REJECTED), plus VERIFIED →
 *   REVERIFICATION_REQUIRED bila data identitas penting berubah.
 * - **Setiap** perubahan status divalidasi di sini memakai `bolehTransisi()`;
 *   transisi tak sah ditolak, termasuk upaya menaikkan status sendiri.
 * - Setiap perubahan penting menulis satu baris `kycRiwayat` (waktu server,
 *   aktor + label, alasan terstruktur, catatan) dan satu entri `auditLog`.
 * - Modul ini **tidak** menyentuh `loans`, ledger, pencairan, pembayaran, atau
 *   gadai. Status VERIFIED berarti identitas sudah diperiksa petugas — BUKAN
 *   persetujuan pinjaman dan BUKAN bukti dana cair.
 *
 * Dokumen (KTP/selfie/bukti penghasilan) hanya boleh ditautkan bila isinya sudah
 * diperiksa server (magic bytes) — lihat `pastikanBerkasTerverifikasi()`.
 */

type KunciIsianKyc =
  | "namaLengkap"
  | "nik"
  | "nomorWhatsApp"
  | "alamat"
  | "pekerjaan"
  | "sumberPenghasilan"
  | "namaBank"
  | "nomorRekening"
  | "catatanPeminjam";

/** Gerbang jalur mandiri: harus masuk, dan bukan akun tamu. */
async function requireNasabah(ctx: QueryCtx): Promise<{ userId: Id<"users">; label: string }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Akun tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk memakai modul KYC.",
    );
  }
  return { userId, label: user.email ?? user.name ?? "nasabah" };
}

/** Isian ringkas dari baris KYC — bentuk yang dipakai aturan murni. */
function ringkas(row: Doc<"kycProfil"> | null): IsianKycRingkas {
  if (row === null) return {};
  return {
    namaLengkap: row.namaLengkap ?? null,
    nik: row.nik ?? null,
    nomorWhatsApp: row.nomorWhatsApp ?? null,
    penghasilanBulanan: row.penghasilanBulanan ?? null,
    sumberPenghasilan: row.sumberPenghasilan ?? null,
    ktpId: row.ktpId ?? null,
    selfieKtpId: row.selfieKtpId ?? null,
    buktiPenghasilanId: row.buktiPenghasilanId ?? null,
  };
}

/** Stempel verifikasi dari baris, atau null bila belum pernah diverifikasi. */
function stempel(row: Doc<"kycProfil">): StempelIdentitas | null {
  const s = row.stempelTerverifikasi;
  if (s === undefined) return null;
  return {
    namaLengkap: s.namaLengkap,
    nik: s.nik,
    ktpId: s.ktpId,
    selfieKtpId: s.selfieKtpId,
    buktiPenghasilanId: s.buktiPenghasilanId,
  };
}

/**
 * Pastikan sebuah berkas benar-benar sudah diperiksa isinya oleh server.
 *
 * Tanpa ini, klien bisa memanggil mutation dengan storage id apa pun yang tipe
 * MIME-nya mengaku gambar — metadata saja bukan bukti (lihat
 * `convex/berkasIdentitas.ts`). Penanda hanya ditulis action setelah membaca
 * isi berkas, dan harus dibuat oleh pengguna yang sama (atau petugas).
 */
async function pastikanBerkasTerverifikasi(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  label: string,
  pemilik: Id<"users">,
): Promise<void> {
  const penanda = await ctx.db
    .query("berkasTerverifikasi")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (penanda === null) {
    throw new Error(
      `${label} belum diperiksa server. Unggah ulang lewat formulir KYC (unggahan lewat jalur lain ditolak).`,
    );
  }
  if (penanda.olehUserId !== undefined && penanda.olehUserId !== pemilik) {
    throw new Error(`${label} bukan milik akun ini. Unggah ulang lewat formulir KYC.`);
  }
}

/** Tulis satu baris riwayat + satu entri audit untuk perubahan status. */
async function catatPerubahanStatus(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    dari: StatusKyc | null;
    ke: StatusKyc;
    aktor: AktorKyc;
    aktorLabel: string;
    aktorUserId?: Id<"users">;
    alasan: string;
    catatan?: string;
    waktu: number;
  },
): Promise<void> {
  await ctx.db.insert("kycRiwayat", {
    userId: args.userId,
    dari: args.dari ?? "-",
    ke: args.ke,
    aktor: args.aktor,
    aktorLabel: args.aktorLabel,
    ...(args.aktorUserId === undefined ? {} : { aktorUserId: args.aktorUserId }),
    alasan: args.alasan,
    ...(args.catatan === undefined ? {} : { catatan: args.catatan }),
    waktu: args.waktu,
  });
  await audit(
    ctx,
    args.aktorUserId ?? args.userId,
    args.aktorLabel,
    `kyc_${args.ke.toLowerCase()}`,
    args.userId,
    `${args.dari ?? "baru"} → ${args.ke} (aktor: ${args.aktor}). Alasan: ${args.alasan}` +
      (args.catatan === undefined ? "" : `. Catatan: ${args.catatan}`),
  );
}

/**
 * Lakukan transisi status dengan validasi.
 *
 * Satu pintu untuk SEMUA perubahan status: nasabah mengirim/menarik, petugas
 * memutuskan, dan sistem menandai verifikasi ulang. Dengan begitu aturan
 * transisi (`bolehTransisi`) dan kewajiban alasan tidak bisa terlewat di satu
 * jalur saja.
 */
async function ubahStatus(
  ctx: MutationCtx,
  row: Doc<"kycProfil">,
  args: {
    ke: StatusKyc;
    aktor: AktorKyc;
    aktorLabel: string;
    aktorUserId?: Id<"users">;
    alasan: string;
    catatan?: string;
    sekarang: number;
    /** Keputusan petugas yang ikut disimpan pada baris. */
    keputusan?: { olehLabel: string; catatan?: string };
  },
): Promise<void> {
  const dari = row.status as StatusKyc;
  if (dari === args.ke) {
    throw new Error(`Status KYC sudah ${args.ke}.`);
  }
  if (!bolehTransisi(dari, args.ke, args.aktor)) {
    throw new Error(
      `Perpindahan status KYC ${dari} → ${args.ke} tidak diizinkan (aktor: ${args.aktor}).`,
    );
  }
  if (args.ke === "PENDING_REVIEW") {
    const kurang = kekuranganKyc(ringkas(row));
    if (kurang.length > 0) {
      throw new Error(`KYC belum lengkap: ${kurang.join(", ")}.`);
    }
  }
  if (keputusanWajibAlasan(args.ke) && (args.catatan ?? "").trim().length < 3) {
    throw new Error(
      args.ke === "REJECTED"
        ? "Alasan penolakan wajib diisi (minimal 3 karakter)."
        : "Catatan perbaikan wajib diisi (minimal 3 karakter).",
    );
  }

  await ctx.db.patch(row._id, {
    status: args.ke,
    diperbaruiPada: args.sekarang,
    ...(args.ke === "PENDING_REVIEW" ? { diajukanPada: args.sekarang } : {}),
    ...(args.keputusan === undefined
      ? {}
      : {
          diputuskanPada: args.sekarang,
          diputuskanOlehLabel: args.keputusan.olehLabel,
          // Catatan keputusan selalu diganti — keputusan lama tidak berlaku lagi.
          keputusanCatatan: args.keputusan.catatan ?? undefined,
        }),
    ...(args.ke === "VERIFIED"
      ? {
          // Normalisasi nama/NIK tetap milik `lib/kycStatus.ts`; id berkas diambil
          // dari baris (bentuknya `Id<"_storage">`, bukan string).
          stempelTerverifikasi: {
            namaLengkap: stempelIdentitas(ringkas(row)).namaLengkap,
            nik: stempelIdentitas(ringkas(row)).nik,
            ktpId: row.ktpId ?? null,
            selfieKtpId: row.selfieKtpId ?? null,
            buktiPenghasilanId: row.buktiPenghasilanId ?? null,
            pada: args.sekarang,
          },
        }
      : {}),
    // Keluar dari VERIFIED (verifikasi ulang) membuang stempel lama: putusan itu
    // diambil atas data lain, jadi tidak boleh dipakai membandingkan lagi.
    ...(dari === "VERIFIED" && args.ke === "REVERIFICATION_REQUIRED"
      ? { stempelTerverifikasi: undefined }
      : {}),
  });

  await catatPerubahanStatus(ctx, {
    userId: row.userId,
    dari,
    ke: args.ke,
    aktor: args.aktor,
    aktorLabel: args.aktorLabel,
    ...(args.aktorUserId === undefined ? {} : { aktorUserId: args.aktorUserId }),
    alasan: args.alasan,
    ...(args.catatan === undefined ? {} : { catatan: args.catatan }),
    waktu: args.sekarang,
  });
}

/**
 * Proyeksikan isian KYC ke `nasabahProfil` (data diri) — SATU ARAH, pada momen
 * yang jelas (saat pengajuan dikirim atau saat petugas memutuskan).
 *
 * Kenapa ada: modul KYC adalah pemilik data identitas sekarang, sementara panel
 * Data Diri admin dan praisi formulir pengajuan membaca `nasabahProfil`. Menyalin
 * pada momen yang jelas lebih baik daripada dua arah yang bisa berbeda diam-diam;
 * `simpanDataDiriProfil` juga mereset putusan `verifikasiIdentitas` bila identitas
 * berubah — kebijakan yang sama dengan verifikasi ulang di modul ini.
 */
async function selaraskanDataDiri(
  ctx: MutationCtx,
  row: Doc<"kycProfil">,
  args: {
    sumber: "nasabah" | "admin";
    olehLabel: string;
    verifikasi?: "terverifikasi" | "ditolak" | null;
  },
): Promise<void> {
  const isian = ringkas(row);
  await simpanDataDiriProfil(ctx, {
    userId: row.userId,
    isian: {
      namaLengkap: isian.namaLengkap ?? "",
      nik: isian.nik ?? "",
      nomorWhatsApp: isian.nomorWhatsApp ?? "",
      alamat: row.alamat ?? "",
      pekerjaan: row.pekerjaan ?? "",
      penghasilanBulanan: row.penghasilanBulanan ?? null,
      namaBank: row.namaBank ?? "",
      nomorRekening: row.nomorRekening ?? "",
    },
    fotoKtpId: row.ktpId ?? undefined,
    sumber: args.sumber,
    olehLabel: args.olehLabel,
  });

  if (args.verifikasi === undefined) return;
  const profil = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_user", (q) => q.eq("userId", row.userId))
    .first();
  if (profil === null) return;
  await ctx.db.patch(profil._id, {
    verifikasiIdentitas:
      args.verifikasi === null
        ? undefined
        : {
            status: args.verifikasi,
            pada: Date.now(),
            olehLabel: args.olehLabel,
          },
  });
}

/* ==========================================================================
 * Query — nasabah
 * ========================================================================== */

/**
 * Keadaan KYC milik pengguna yang sedang masuk, plus riwayat terakhir.
 *
 * `adaBaris: false` berarti modul belum pernah disentuh sama sekali
 * (NOT_STARTED). Dokumen dikembalikan sebagai URL bertanda tangan — hanya untuk
 * pemiliknya sendiri, dan hanya untuk berkas yang memang sudah diunggah.
 */
export const kycSaya = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireNasabah(ctx);
    const row = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (row === null) {
      return {
        adaBaris: false,
        status: "NOT_STARTED" as StatusKyc,
        isian: {
          namaLengkap: "",
          nik: "",
          nomorWhatsApp: "",
          alamat: "",
          pekerjaan: "",
          penghasilan: "",
          sumberPenghasilan: "",
          namaBank: "",
          nomorRekening: "",
          catatanPeminjam: "",
        },
        dokumen: { ktpId: null, selfieKtpId: null, buktiPenghasilanId: null },
        url: { ktp: null, selfie: null, buktiPenghasilan: null },
        kekurangan: kekuranganKyc({}),
        lengkap: false,
        diajukanPada: null,
        diputuskanPada: null,
        diputuskanOlehLabel: null,
        keputusanCatatan: null,
        diperbaruiPada: null,
        riwayat: [],
      };
    }

    const [ktp, selfie, bukti] = await Promise.all([
      row.ktpId ? ctx.storage.getUrl(row.ktpId) : null,
      row.selfieKtpId ? ctx.storage.getUrl(row.selfieKtpId) : null,
      row.buktiPenghasilanId ? ctx.storage.getUrl(row.buktiPenghasilanId) : null,
    ]);
    const riwayat = await ctx.db
      .query("kycRiwayat")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const r = ringkas(row);

    return {
      adaBaris: true,
      status: row.status as StatusKyc,
      isian: {
        namaLengkap: row.namaLengkap ?? "",
        nik: row.nik ?? "",
        nomorWhatsApp: row.nomorWhatsApp ?? "",
        alamat: row.alamat ?? "",
        pekerjaan: row.pekerjaan ?? "",
        // Penghasilan dikirim sebagai teks terformat agar form tidak menghitung
        // ulang aturan tampilan di klien.
        penghasilan:
          row.penghasilanBulanan === undefined
            ? ""
            : new Intl.NumberFormat("id-ID").format(row.penghasilanBulanan),
        sumberPenghasilan: row.sumberPenghasilan ?? "",
        namaBank: row.namaBank ?? "",
        nomorRekening: row.nomorRekening ?? "",
        catatanPeminjam: row.catatanPeminjam ?? "",
      },
      dokumen: {
        ktpId: row.ktpId ?? null,
        selfieKtpId: row.selfieKtpId ?? null,
        buktiPenghasilanId: row.buktiPenghasilanId ?? null,
      },
      url: { ktp, selfie, buktiPenghasilan: bukti },
      kekurangan: kekuranganKyc(r),
      lengkap: lengkapKyc(r),
      diajukanPada: row.diajukanPada ?? null,
      diputuskanPada: row.diputuskanPada ?? null,
      diputuskanOlehLabel: row.diputuskanOlehLabel ?? null,
      keputusanCatatan: row.keputusanCatatan ?? null,
      diperbaruiPada: row.diperbaruiPada,
      riwayat: riwayat
        .sort((a, b) => b.waktu - a.waktu)
        .slice(0, 20)
        .map((it) => ({
          dari: it.dari,
          ke: it.ke,
          aktor: it.aktor,
          aktorLabel: it.aktorLabel,
          alasan: it.alasan,
          catatan: it.catatan ?? null,
          waktu: it.waktu,
        })),
    };
  },
});

/* ==========================================================================
 * Mutation — nasabah: mulai, simpan progres, ajukan
 * ========================================================================== */

/**
 * URL unggah berkas KYC — digerbang jalur mandiri (tamu & pengunjung ditolak).
 *
 * Setelah unggah berhasil, klien WAJIB menjalankan action pemeriksa isi
 * (`berkasIdentitas.periksaIsiBerkasKyc`); tanpa penandanya, `simpanProgresKyc`
 * menolak berkas itu — jadi URL ini tidak bisa dipakai menyelundupkan berkas
 * bukan gambar.
 */
export const urlUnggahBerkasKyc = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireNasabah(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Mulai modul KYC (NOT_STARTED → IN_PROGRESS). Idempoten. */
export const mulaiKyc = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, label } = await requireNasabah(ctx);
    const row = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const sekarang = Date.now();
    if (row === null) {
      await ctx.db.insert("kycProfil", {
        userId,
        status: "IN_PROGRESS",
        dibuatPada: sekarang,
        diperbaruiPada: sekarang,
      });
      await catatPerubahanStatus(ctx, {
        userId,
        dari: null,
        ke: "IN_PROGRESS",
        aktor: "nasabah",
        aktorLabel: label,
        aktorUserId: userId,
        alasan: "kyc_dimulai",
        waktu: sekarang,
      });
      return { status: "IN_PROGRESS" as StatusKyc };
    }
    if (row.status === "NOT_STARTED") {
      await ubahStatus(ctx, row, {
        ke: "IN_PROGRESS",
        aktor: "nasabah",
        aktorLabel: label,
        aktorUserId: userId,
        alasan: "kyc_dimulai",
        sekarang,
      });
    }
    return { status: row.status as StatusKyc };
  },
});

/**
 * Simpan PROGRES KYC (boleh setengah jalan).
 *
 * Aturan yang dijaga server:
 * - Isian yang DIISI harus sah menurut aturan yang sama dengan form
 *   (`galatDataDiri()` dari lib/dataDiri.ts) — isian kosong tetap boleh, karena
 *   ini progres, bukan pengajuan.
 * - Dokumen hanya bisa ditautkan bila isinya sudah diperiksa server
 *   (`berkasTerverifikasi`).
 * - Perubahan data saat `PENDING_REVIEW` menarik pengajuan kembali ke
 *   `IN_PROGRESS` (petugas tidak boleh meninjau data yang berubah di belakangnya).
 * - Perubahan data identitas penting saat `VERIFIED` memindahkan status ke
 *   `REVERIFICATION_REQUIRED` — diputuskan oleh `perluVerifikasiUlang()`.
 */
export const simpanProgresKyc = mutation({
  args: {
    namaLengkap: v.optional(v.string()),
    nik: v.optional(v.string()),
    nomorWhatsApp: v.optional(v.string()),
    alamat: v.optional(v.string()),
    pekerjaan: v.optional(v.string()),
    penghasilanBulanan: v.optional(v.union(v.number(), v.null())),
    sumberPenghasilan: v.optional(v.string()),
    namaBank: v.optional(v.string()),
    nomorRekening: v.optional(v.string()),
    catatanPeminjam: v.optional(v.string()),
    ktpId: v.optional(v.union(v.id("_storage"), v.null())),
    selfieKtpId: v.optional(v.union(v.id("_storage"), v.null())),
    buktiPenghasilanId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const { userId, label } = await requireNasabah(ctx);
    const sekarang = Date.now();
    const lama = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Isian baru = isian lama + yang dikirim sekarang (undefined = jangan ubah).
    const isian: Record<KunciIsianKyc, string | undefined> = {
      namaLengkap: args.namaLengkap ?? lama?.namaLengkap,
      nik: args.nik ?? lama?.nik,
      nomorWhatsApp: args.nomorWhatsApp ?? lama?.nomorWhatsApp,
      alamat: args.alamat ?? lama?.alamat,
      pekerjaan: args.pekerjaan ?? lama?.pekerjaan,
      sumberPenghasilan: args.sumberPenghasilan ?? lama?.sumberPenghasilan,
      namaBank: args.namaBank ?? lama?.namaBank,
      nomorRekening: args.nomorRekening ?? lama?.nomorRekening,
      catatanPeminjam: args.catatanPeminjam ?? lama?.catatanPeminjam,
    };
    const penghasilanBulanan =
      args.penghasilanBulanan === undefined
        ? (lama?.penghasilanBulanan ?? null)
        : args.penghasilanBulanan;
    const dokumen = {
      ktpId: args.ktpId === undefined ? (lama?.ktpId ?? null) : args.ktpId,
      selfieKtpId:
        args.selfieKtpId === undefined ? (lama?.selfieKtpId ?? null) : args.selfieKtpId,
      buktiPenghasilanId:
        args.buktiPenghasilanId === undefined
          ? (lama?.buktiPenghasilanId ?? null)
          : args.buktiPenghasilanId,
    };

    // 1) Dokumen: hanya yang sudah diperiksa server isinya.
    const labelBerkas: Array<[Id<"_storage"> | null, string]> = [
      [dokumen.ktpId, "Foto KTP"],
      [dokumen.selfieKtpId, "Selfie dengan KTP"],
      [dokumen.buktiPenghasilanId, "Bukti penghasilan"],
    ];
    for (const [id, nama] of labelBerkas) {
      if (id !== null) await pastikanBerkasTerverifikasi(ctx, id, nama, userId);
    }

    // 2) Isian yang diisi harus sah — memakai aturan yang sama dengan form.
    const form: DataDiriForm = {
      namaLengkap: isian.namaLengkap ?? "",
      nik: isian.nik ?? "",
      nomorWhatsApp: isian.nomorWhatsApp ?? "",
      alamat: isian.alamat ?? "",
      pekerjaan: isian.pekerjaan ?? "",
      penghasilan: penghasilanBulanan === null ? "" : String(penghasilanBulanan),
      namaBank: isian.namaBank ?? "",
      nomorRekening: isian.nomorRekening ?? "",
    };
    const galat = galatDataDiri(form);
    const dikirim: Array<[keyof typeof galat, string | undefined]> = [
      ["namaLengkap", args.namaLengkap],
      ["nik", args.nik],
      ["nomorWhatsApp", args.nomorWhatsApp],
      ["alamat", args.alamat],
      ["pekerjaan", args.pekerjaan],
      ["namaBank", args.namaBank],
      ["nomorRekening", args.nomorRekening],
      [
        "penghasilan",
        args.penghasilanBulanan === undefined || args.penghasilanBulanan === null
          ? undefined
          : String(args.penghasilanBulanan),
      ],
    ];
    for (const [kunci, nilai] of dikirim) {
      const pesan = galat[kunci];
      if (pesan !== undefined && (nilai ?? "").trim() !== "") {
        throw new Error(`Isian KYC ditolak: ${pesan}`);
      }
    }
    if ((isian.sumberPenghasilan ?? "").trim() !== "" && (isian.sumberPenghasilan ?? "").trim().length < 3) {
      throw new Error("Isian KYC ditolak: Sumber penghasilan minimal 3 karakter.");
    }

    // `null` pada dokumen berarti "kosongkan berkas ini" — di Convex, patch
    // dengan `undefined` yang menghapus kolomnya (pola yang sama dipakai
    // `dataDiriProfil.ts` saat menghapus foto KTP lama).
    const isi = {
      ...isian,
      penghasilanBulanan: penghasilanBulanan === null ? undefined : penghasilanBulanan,
      ktpId: dokumen.ktpId ?? undefined,
      selfieKtpId: dokumen.selfieKtpId ?? undefined,
      buktiPenghasilanId: dokumen.buktiPenghasilanId ?? undefined,
      diperbaruiPada: sekarang,
    };

    // 3) Simpan (baris baru = memulai modul).
    let row: Doc<"kycProfil">;
    if (lama === null) {
      const id = await ctx.db.insert("kycProfil", {
        userId,
        status: "IN_PROGRESS",
        dibuatPada: sekarang,
        ...isi,
      });
      row = (await ctx.db.get(id))!;
      await catatPerubahanStatus(ctx, {
        userId,
        dari: null,
        ke: "IN_PROGRESS",
        aktor: "nasabah",
        aktorLabel: label,
        aktorUserId: userId,
        alasan: "kyc_dimulai",
        waktu: sekarang,
      });
    } else {
      await ctx.db.patch(lama._id, isi);
      row = (await ctx.db.get(lama._id))!;

      // 4) Status setelah suntingan — diputuskan oleh aturan murni.
      const statusBaru = statusSetelahSunting(lama.status as StatusKyc, stempel(lama), ringkas(row));
      if (statusBaru !== lama.status) {
        const dari = lama.status as StatusKyc;
        const alasan =
          dari === "VERIFIED"
            ? "data_identitas_berubah"
            : dari === "PENDING_REVIEW"
              ? "pengajuan_ditarik_karena_diubah"
              : "peninjauan_ulang_dimulai";
        await ubahStatus(ctx, row, {
          ke: statusBaru,
          // Verifikasi ulang dipicu SISTEM (kebijakan atas perubahan data),
          // bukan klaim nasabah bahwa datanya sudah benar.
          aktor: dari === "VERIFIED" ? "sistem" : "nasabah",
          aktorLabel: dari === "VERIFIED" ? "sistem" : label,
          ...(dari === "VERIFIED" ? {} : { aktorUserId: userId }),
          alasan,
          catatan:
            dari === "VERIFIED"
              ? "Data identitas penting berubah setelah verifikasi; putusan lama tidak berlaku lagi."
              : undefined,
          sekarang,
        });
      }
    }

    const akhir = await ctx.db.get(row._id);
    return { status: (akhir?.status ?? "IN_PROGRESS") as StatusKyc };
  },
});

/**
 * Ajukan KYC untuk peninjauan (IN_PROGRESS | NEEDS_CORRECTION |
 * REVERIFICATION_REQUIRED → PENDING_REVIEW).
 *
 * Server memvalidasi ulang SELURUH isian dengan `bacaDataDiri()` dan memastikan
 * ketiga berkas ada serta sudah diperiksa isinya. Jadi mengirim pengajuan tidak
 * bisa melewati kelengkapan hanya karena tombolnya ada di klien.
 */
export const ajukanKyc = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, label } = await requireNasabah(ctx);
    const row = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row === null) throw new Error("KYC belum dimulai. Simpan isian dulu.");
    const sekarang = Date.now();

    const { tersimpan, pesan } = bacaDataDiri({
      namaLengkap: row.namaLengkap ?? "",
      nik: row.nik ?? "",
      nomorWhatsApp: row.nomorWhatsApp ?? "",
      alamat: row.alamat ?? "",
      pekerjaan: row.pekerjaan ?? "",
      penghasilan:
        row.penghasilanBulanan === undefined ? "" : String(row.penghasilanBulanan),
      namaBank: row.namaBank ?? "",
      nomorRekening: row.nomorRekening ?? "",
    });
    if (tersimpan === null) throw new Error(pesan ?? "Isian KYC tidak valid.");

    if ((row.sumberPenghasilan ?? "").trim().length < 3) {
      throw new Error("Sumber penghasilan wajib diisi (minimal 3 karakter).");
    }
    for (const [id, nama] of [
      [row.ktpId ?? null, "Foto KTP"],
      [row.selfieKtpId ?? null, "Selfie dengan KTP"],
      [row.buktiPenghasilanId ?? null, "Bukti penghasilan"],
    ] as Array<[Id<"_storage"> | null, string]>) {
      if (id === null) throw new Error(`${nama} belum diunggah.`);
      await pastikanBerkasTerverifikasi(ctx, id, nama, userId);
    }

    await ubahStatus(ctx, row, {
      ke: "PENDING_REVIEW",
      aktor: "nasabah",
      aktorLabel: label,
      aktorUserId: userId,
      alasan:
        row.status === "NEEDS_CORRECTION"
          ? "perbaikan_dikirim_ulang"
          : row.status === "REVERIFICATION_REQUIRED"
            ? "verifikasi_ulang_diajukan"
            : "kyc_diajukan",
      sekarang,
    });

    // Nilai yang sudah DINORMALKAN (nama HURUF BESAR, NIK digit saja) ditulis
    // kembali ke baris KYC, lalu baris itu yang diproyeksikan — supaya data diri
    // dan modul KYC menyimpan bentuk yang sama persis.
    await ctx.db.patch(row._id, {
      namaLengkap: tersimpan.namaLengkap,
      nik: tersimpan.nik,
      nomorWhatsApp: tersimpan.nomorWhatsApp,
      alamat: tersimpan.alamat ?? undefined,
      pekerjaan: tersimpan.pekerjaan ?? undefined,
      penghasilanBulanan: tersimpan.penghasilanBulanan ?? undefined,
      namaBank: tersimpan.namaBank ?? undefined,
      nomorRekening: tersimpan.nomorRekening ?? undefined,
    });
    const sesudahAjuan = await ctx.db.get(row._id);
    if (sesudahAjuan !== null) {
      await selaraskanDataDiri(ctx, sesudahAjuan, {
        sumber: "nasabah",
        olehLabel: label,
      });
    }

    return { status: "PENDING_REVIEW" as StatusKyc };
  },
});

/* ==========================================================================
 * Query & mutation — petugas (admin ber-TOTP)
 * ========================================================================== */

const STATUS_ANTREAN: StatusKyc[] = [
  "PENDING_REVIEW",
  "NEEDS_CORRECTION",
  "REVERIFICATION_REQUIRED",
  "VERIFIED",
  "REJECTED",
  "IN_PROGRESS",
];

/** Daftar KYC untuk panel admin, dengan cacah per status. */
export const daftarKycAdmin = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireAdminSession(ctx);
    const rows = await ctx.db.query("kycProfil").collect();
    const users = await ctx.db.query("users").collect();
    const namaPerUser = new Map(users.map((u) => [u._id as string, u.name ?? u.email ?? "—"]));
    const emailPerUser = new Map(users.map((u) => [u._id as string, u.email ?? null]));

    const cacah: Record<string, number> = {};
    for (const s of STATUS_ANTREAN) cacah[s] = 0;
    for (const r of rows) {
      if (cacah[r.status] !== undefined) cacah[r.status] += 1;
    }

    const saring = status === undefined || status === "" ? null : status;
    const item = rows
      .filter((r) => saring === null || r.status === saring)
      .sort((a, b) => (b.diajukanPada ?? b.diperbaruiPada) - (a.diajukanPada ?? a.diperbaruiPada))
      .slice(0, 100)
      .map((r) => ({
        userId: r.userId,
        nama: namaPerUser.get(r.userId) ?? "—",
        email: emailPerUser.get(r.userId) ?? null,
        status: r.status as StatusKyc,
        kekurangan: kekuranganKyc(ringkas(r)),
        diajukanPada: r.diajukanPada ?? null,
        diperbaruiPada: r.diperbaruiPada,
        diputuskanPada: r.diputuskanPada ?? null,
      }));

    return { item, cacah, total: rows.length };
  },
});

/** Detail satu KYC (termasuk URL dokumen ber-watermark) + riwayatnya. */
export const detailKycAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdminSession(ctx);
    const row = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row === null) return null;

    const [ktp, selfie, bukti] = await Promise.all([
      row.ktpId ? ctx.storage.getUrl(row.ktpId) : null,
      row.selfieKtpId ? ctx.storage.getUrl(row.selfieKtpId) : null,
      row.buktiPenghasilanId ? ctx.storage.getUrl(row.buktiPenghasilanId) : null,
    ]);
    const riwayat = await ctx.db
      .query("kycRiwayat")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return {
      userId,
      status: row.status as StatusKyc,
      namaLengkap: row.namaLengkap ?? null,
      nik: row.nik ?? null,
      nomorWhatsApp: row.nomorWhatsApp ?? null,
      alamat: row.alamat ?? null,
      pekerjaan: row.pekerjaan ?? null,
      penghasilanBulanan: row.penghasilanBulanan ?? null,
      sumberPenghasilan: row.sumberPenghasilan ?? null,
      catatanPeminjam: row.catatanPeminjam ?? null,
      kekurangan: kekuranganKyc(ringkas(row)),
      diajukanPada: row.diajukanPada ?? null,
      diputuskanPada: row.diputuskanPada ?? null,
      diputuskanOlehLabel: row.diputuskanOlehLabel ?? null,
      keputusanCatatan: row.keputusanCatatan ?? null,
      verifikasiUlangTertunda: perluVerifikasiUlang(stempel(row), ringkas(row)),
      url: { ktp, selfie, buktiPenghasilan: bukti },
      riwayat: riwayat
        .sort((a, b) => b.waktu - a.waktu)
        .slice(0, 30)
        .map((it) => ({
          dari: it.dari,
          ke: it.ke,
          aktor: it.aktor,
          aktorLabel: it.aktorLabel,
          alasan: it.alasan,
          catatan: it.catatan ?? null,
          waktu: it.waktu,
        })),
    };
  },
});

/**
 * Putusan petugas: VERIFIED | NEEDS_CORRECTION | REJECTED.
 *
 * Server memaksa:
 * - transisi sah dari status saat ini (PENDING_REVIEW → keputusan),
 * - alasan tertulis untuk penolakan & permintaan perbaikan,
 * - VERIFIED hanya bila isian lengkap & ketiga berkas sudah diperiksa server,
 * - setiap keputusan meninggalkan riwayat + entri audit.
 */
export const tinjauKyc = mutation({
  args: {
    userId: v.id("users"),
    keputusan: v.union(
      v.literal("VERIFIED"),
      v.literal("NEEDS_CORRECTION"),
      v.literal("REJECTED"),
      v.literal("REVERIFICATION_REQUIRED"),
    ),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, { userId, keputusan, catatan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const row = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row === null) throw new Error("Baris KYC nasabah tidak ditemukan.");
    const olehLabel = admin.email ?? admin.name ?? "admin";
    const bersih = (catatan ?? "").trim();
    if (bersih.length > 300) throw new Error("Catatan keputusan maksimal 300 karakter.");
    const sekarang = Date.now();

    if (keputusan === "VERIFIED") {
      const kurang = kekuranganKyc(ringkas(row));
      if (kurang.length > 0) {
        throw new Error(`Belum bisa diverifikasi — isian belum lengkap: ${kurang.join(", ")}.`);
      }
      for (const [id, nama] of [
        [row.ktpId ?? null, "Foto KTP"],
        [row.selfieKtpId ?? null, "Selfie dengan KTP"],
        [row.buktiPenghasilanId ?? null, "Bukti penghasilan"],
      ] as Array<[Id<"_storage"> | null, string]>) {
        if (id === null) throw new Error(`${nama} belum diunggah.`);
        await pastikanBerkasTerverifikasi(ctx, id, nama, userId);
      }
    }

    await ubahStatus(ctx, row, {
      ke: keputusan,
      aktor: "admin",
      aktorLabel: olehLabel,
      aktorUserId: adminId,
      alasan:
        keputusan === "VERIFIED"
          ? "identitas_terverifikasi"
          : keputusan === "REJECTED"
            ? "identitas_ditolak"
            : keputusan === "NEEDS_CORRECTION"
              ? "perbaikan_diminta"
              : "verifikasi_ulang_diminta_petugas",
      catatan: bersih === "" ? undefined : bersih,
      sekarang,
      keputusan: {
        olehLabel,
        ...(bersih === "" ? {} : { catatan: bersih }),
      },
    });

    // Keputusan identitas diselaraskan ke data diri (satu arah) supaya panel data
    // diri dan modul KYC tidak pernah berbeda pendapat.
    const sesudah = await ctx.db.get(row._id);
    if (sesudah !== null) {
      await selaraskanDataDiri(ctx, sesudah, {
        sumber: "admin",
        olehLabel,
        verifikasi:
          keputusan === "VERIFIED"
            ? "terverifikasi"
            : keputusan === "REJECTED"
              ? "ditolak"
              : null,
      });
    }
    return { ok: true as const, status: keputusan as StatusKyc };
  },
});

/* ==========================================================================
 * Internal — penanda berkas terverifikasi (dipanggil action magic bytes)
 * ========================================================================== */

/**
 * Catat bahwa ISI sebuah berkas sudah diperiksa server.
 *
 * Hanya dipanggil `action` pemeriksa isi (`berkasIdentitas.periksaIsiBerkasKyc`)
 * setelah magic bytes-nya cocok — jadi baris di sini berarti "berkas ini benar
 * gambar menurut isinya", bukan menurut klaim klien.
 */
export const catatBerkasTerverifikasi = internalMutation({
  args: {
    storageId: v.id("_storage"),
    label: v.string(),
    jenis: v.string(),
    olehUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { storageId, label, jenis, olehUserId }) => {
    const lama = await ctx.db
      .query("berkasTerverifikasi")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first();
    const waktu = Date.now();
    if (lama === null) {
      await ctx.db.insert("berkasTerverifikasi", {
        storageId,
        label: label.slice(0, 60),
        jenis,
        ...(olehUserId === undefined ? {} : { olehUserId }),
        waktu,
      });
      return { ok: true as const };
    }
    await ctx.db.patch(lama._id, {
      label: label.slice(0, 60),
      jenis,
      ...(olehUserId === undefined ? {} : { olehUserId }),
      waktu,
    });
    return { ok: true as const };
  },
});
