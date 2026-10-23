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
import { tautanBerkas } from "./berkas";
import { ROLES } from "./schema";
import { simpanDataDiriProfil } from "./dataDiriProfil";
import { bacaDataDiri, galatDataDiri, type DataDiriForm } from "../lib/dataDiri";
import { normalisasiNomorWa } from "../lib/otpWa";
import {
  aturanUsang,
  keteranganAturanUsang,
  VERSI_ATURAN_KYC,
  type SlotBerkasAturan,
} from "../lib/kycAturan";
import {
  cacahPerStatus,
  hasilDariTeks,
  rentangTanggal,
  saringKycAdmin,
  statusDariTeks,
  statusDokumenKyc,
  tanggalAcuan,
  type BarisSaringKyc,
  type FilterKyc,
} from "../lib/kycAdmin";
import { bandingkanOcrDenganIsian } from "../lib/kycOcr";
import { galatKontakDarurat } from "../lib/kycTahapan";
import { VERSI_PERSETUJUAN_KYC, persetujuanAktif } from "../lib/persetujuanKyc";
import {
  bolehTerapkanOtomatis,
  putuskanKycOtomatis,
  type MasukanKeputusanKyc,
  type TeknisBerkas,
} from "../lib/kycAutoApproval";
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
  | "catatanPeminjam"
  | "namaKontakDarurat"
  | "nomorKontakDarurat"
  | "hubunganKontakDarurat";

/** Gerbang jalur mandiri: harus masuk, dan bukan akun tamu. */
async function requireNasabah(ctx: QueryCtx): Promise<{ userId: Id<"users">; label: string }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Akun tidak ditemukan.");
  if (user.role === ROLES.ADMIN) {
    throw new Error("Modul KYC hanya untuk nasabah, bukan Super Admin.");
  }
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
 * true bila bukti OTP masih mewakili nomor yang tersimpan SEKARANG.
 *
 * Verifikasi nomor tidak boleh "menempel" pada baris KYC saja: kalau nomornya
 * diganti setelah diverifikasi, bukti lama berbicara tentang nomor lain.
 * Karena itu yang dibandingkan adalah NOMOR yang dinormalkan, bukan sekadar
 * ada/tidaknya penanda.
 */
function nomorWaCocok(
  verifikasi: { nomor: string } | null | undefined,
  nomor: string | null | undefined,
): boolean {
  if (verifikasi === null || verifikasi === undefined) return false;
  const a = normalisasiNomorWa(verifikasi.nomor);
  const b = normalisasiNomorWa(nomor);
  return a !== null && b !== null && a === b;
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

/**
 * Persetujuan pemrosesan data harus TERCATAT di server sebelum data pribadi
 * dikumpulkan.
 *
 * Kenapa di sini, bukan hanya di UI: kotak centang di peramban hanyalah tampilan.
 * Kalau gerbangnya hanya di klien, mutation bisa dipanggil langsung untuk
 * menyimpan NIK/foto KTP tanpa persetujuan apa pun — dan aplikasi yang
 * mengumpulkan data sensitif tanpa dasar persetujuan melanggar UU PDP.
 */
async function pastikanPersetujuan(
  ctx: MutationCtx,
  row: Doc<"kycProfil"> | null,
  label: string,
): Promise<void> {
  if (persetujuanAktif(row?.persetujuan)) return;
  throw new Error(
    "Persetujuan pemrosesan data belum tercatat. Baca penjelasan pada tahap " +
      "\"Persetujuan pemrosesan data\", centang persetujuan, lalu simpan lagi. " +
      `(Versi penjelasan yang berlaku: ${VERSI_PERSETUJUAN_KYC}.)` +
      " Diperlukan sebelum " +
      label +
      " disimpan.",
  );
}

/** Jendela pembatas laju unggahan berkas KYC (15 menit). */
const JENDELA_UNGGAH_MS = 15 * 60 * 1000;

/**
 * Jumlah unggahan URL yang diizinkan per pengguna per jendela. Tiga slot
 * berkas plus ruang untuk beberapa percobaan ulang (berkas ditolak/diganti).
 */
const MAKS_UNGGAH_PER_JENDELA = 30;

/**
 * Batasi laju permintaan URL unggah berkas KYC per pengguna.
 *
 * Dihitung dari baris `kycUnggahLog` (waktu server), bukan dari klien; baris
 * di luar jendela dibuang selagi menghitung supaya tabel tetap kecil. Ini
 * melindungi penyimpanan & pemeriksa berkas dari pembanjiran, tanpa pernah
 * mengunci akun permanen (jendelanya bergulir).
 */
async function batasLajuUnggah(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const sekarang = Date.now();
  const sejak = sekarang - JENDELA_UNGGAH_MS;
  const baris = await ctx.db
    .query("kycUnggahLog")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let dalamJendela = 0;
  for (const b of baris) {
    if (b.waktu < sejak) await ctx.db.delete(b._id);
    else dalamJendela += 1;
  }
  if (dalamJendela >= MAKS_UNGGAH_PER_JENDELA) {
    throw new Error(
      "Terlalu banyak unggahan berkas dalam waktu singkat. Tunggu beberapa menit, lalu coba lagi.",
    );
  }
  await ctx.db.insert("kycUnggahLog", { userId, waktu: sekarang });
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
    // Dasar aturan dicatat pada barisnya sendiri: riwayat jadi bisa menjawab
    // "atas aturan apa keputusan ini diambil", bukan hanya "siapa dan kapan".
    versiAturan: VERSI_ATURAN_KYC,
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
          // Putusan disimpan bersama ATURAN yang berlaku saat itu — inilah yang
          // membuat "sudah diverifikasi" bisa ditelusuri dasarnya.
          aturanTerverifikasi: { versi: VERSI_ATURAN_KYC, pada: args.sekarang },
        }
      : {}),
    // Keluar dari VERIFIED (verifikasi ulang) membuang stempel lama: putusan itu
    // diambil atas data lain, jadi tidak boleh dipakai membandingkan lagi.
    ...(dari === "VERIFIED" && args.ke === "REVERIFICATION_REQUIRED"
      ? { stempelTerverifikasi: undefined, aturanTerverifikasi: undefined }
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

/**
 * Bukti TEKNIS satu berkas menurut pemeriksaan SERVER (`berkasTerverifikasi`).
 *
 * Mesin keputusan otomatis memakainya untuk menilai keterbacaan berkas tanpa
 * mempercayai klaim klien: "terverifikasiServer" berarti action pemeriksa isi
 * (magic bytes) sudah menandai berkas ini. Dimensi null berarti tidak tercatat
 * (mis. baris lama) — mesin memperlakukannya sebagai "tidak pasti", bukan
 * "lulus".
 */
async function teknisBerkasOtomatis(
  ctx: MutationCtx,
  id: Id<"_storage"> | undefined,
): Promise<TeknisBerkas> {
  if (id === undefined) {
    return { ada: false, terverifikasiServer: false, lebar: null, tinggi: null };
  }
  const penanda = await ctx.db
    .query("berkasTerverifikasi")
    .withIndex("by_storageId", (q) => q.eq("storageId", id))
    .first();
  if (penanda === null) {
    return { ada: true, terverifikasiServer: false, lebar: null, tinggi: null };
  }
  return {
    ada: true,
    terverifikasiServer: true,
    lebar: penanda.lebar ?? null,
    tinggi: penanda.tinggi ?? null,
  };
}

/**
 * Proyeksi satu keputusan otomatis untuk dibaca nasabah & petugas.
 *
 * Satu tempat supaya kedua sisi melihat dasar yang sama (versi aturan, sumber,
 * aktor, hasil tiap pemeriksaan) — dan terutama `diterapkan`: hasil yang TIDAK
 * diterapkan berarti mesin hanya mencatat pemeriksaannya, status TIDAK berubah,
 * sehingga pembacanya tidak menyangka status berubah sendiri.
 */
function proyeksiKeputusanOtomatis(row: Doc<"kycKeputusanOtomatis">) {
  return {
    waktu: row.waktu,
    statusSebelum: row.statusSebelum as StatusKyc,
    keputusan: row.keputusan as StatusKyc,
    alasan: row.alasan,
    ringkasan: row.ringkasan,
    versiAturan: row.versiAturan,
    sumber: row.sumber,
    aktor: row.aktor,
    diterapkan: row.diterapkan,
    aturan: row.aturan,
  };
}

/**
 * Jalankan mesin keputusan otomatis KYC lalu terapkan hasilnya.
 *
 * Kenapa di SINI, bukan di klien: seluruh pemeriksaan diturunkan dari data yang
 * sudah tersimpan di server (kelengkapan, bukti berkas dari `berkasTerverifikasi`,
 * bukti OTP). Klien hanya boleh menghadirkan snapshot OCR — itu pun ditandai
 * `sumber: "klien"` dan diperlakukan sebagai saran, bukan bukti.
 *
 * Status hanya bisa berubah bila keputusan mesin adalah `VERIFIED`
 * (`bolehTerapkanOtomatis`) DAN status SEKARANG `PENDING_REVIEW` serta
 * transisinya sah untuk aktor `sistem` (lihat `lib/kycStatus.ts`). Hasil
 * `PENDING_REVIEW` maupun `NEEDS_CORRECTION` hanya DICATAT sebagai bahan
 * peninjauan: `NEEDS_CORRECTION` adalah keputusan "nasabah harus memperbaiki"
 * milik petugas, dan dari sana hanya nasabah yang bisa mengirim ulang — mesin
 * yang menerbitkannya sendiri akan menutup pengajuan dari jalur verifikasi
 * petugas. Jadi petugas tetap pemutusnya, dengan hasil pemeriksaan mesin
 * lengkap di tangannya.
 *
 * IDEMPOTEN: satu keputusan per SIDIK JARI. Sidik jari dirangkum dari hasil
 * semua pemeriksaan + versi aturan + status yang dituju, jadi selama fakta yang
 * dibaca mesin tidak berubah — mis. nasabah mengirim ulang tanpa mengubah data
 * yang diperiksa — pemeriksaan ulang berhenti tanpa menulis keputusan/jejak
 * kedua. Fakta yang berubah selalu mengubah sidik jari, sehingga keputusan baru
 * memang layak dicatat.
 */
async function terapkanKeputusanOtomatis(
  ctx: MutationCtx,
  args: { userId: Id<"users">; sekarang: number },
): Promise<{ keputusan: StatusKyc; diterapkan: boolean; idempoten: boolean }> {
  const row = await ctx.db
    .query("kycProfil")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .first();
  if (row === null) {
    throw new Error("Baris KYC tidak ditemukan untuk keputusan otomatis.");
  }

  const [ktp, selfie, bukti] = await Promise.all([
    teknisBerkasOtomatis(ctx, row.ktpId),
    teknisBerkasOtomatis(ctx, row.selfieKtpId),
    teknisBerkasOtomatis(ctx, row.buktiPenghasilanId),
  ]);

  const masukan: MasukanKeputusanKyc = {
    isian: {
      namaLengkap: row.namaLengkap ?? null,
      nik: row.nik ?? null,
      nomorWhatsApp: row.nomorWhatsApp ?? null,
      alamat: row.alamat ?? null,
      penghasilanBulanan: row.penghasilanBulanan ?? null,
      sumberPenghasilan: row.sumberPenghasilan ?? null,
      ktpId: row.ktpId ?? null,
      selfieKtpId: row.selfieKtpId ?? null,
      buktiPenghasilanId: row.buktiPenghasilanId ?? null,
    },
    persetujuanAktif: persetujuanAktif(row.persetujuan),
    nomorWaTerverifikasi: nomorWaCocok(row.nomorWhatsAppTerverifikasi, row.nomorWhatsApp),
    teknis: { ktp, selfie, bukti },
    ocr:
      row.ocrKtp === undefined
        ? null
        : {
            konfidensi: row.ocrKtp.konfidensi,
            nik: row.ocrKtp.nik,
            nama: row.ocrKtp.nama,
            alamat: row.ocrKtp.alamat,
          },
  };

  const hasil = putuskanKycOtomatis(masukan);
  const statusSebelum = row.status as StatusKyc;

  const terakhir = await ctx.db
    .query("kycKeputusanOtomatis")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .order("desc")
    .first();
  if (terakhir !== null && terakhir.sidikJari === hasil.sidikJari) {
    // Sidik jari sama ⇒ kesimpulan mesin juga sama (versi aturan + status tujuan
    // ikut di dalamnya), jadi keputusan yang sudah tercatat masih berlaku.
    return { keputusan: hasil.target, diterapkan: false, idempoten: true };
  }

  const bolehTerapkan =
    statusSebelum === "PENDING_REVIEW" &&
    bolehTerapkanOtomatis(hasil.target) &&
    bolehTransisi(statusSebelum, hasil.target, "sistem");

  await ctx.db.insert("kycKeputusanOtomatis", {
    userId: args.userId,
    waktu: args.sekarang,
    statusSebelum,
    keputusan: hasil.target,
    alasan: hasil.alasan,
    ringkasan: hasil.ringkasan,
    versiAturan: hasil.versiAturan,
    sumber: "otomatis",
    aktor: "sistem",
    sidikJari: hasil.sidikJari,
    diterapkan: bolehTerapkan,
    aturan: hasil.aturan.map((r) => ({
      id: r.id,
      judul: r.judul,
      status: r.status,
      sumber: r.sumber,
      pesan: r.pesan,
      detail: r.detail,
    })),
  });

  if (bolehTerapkan) {
    const olehLabel = "Sistem (keputusan otomatis)";
    await ubahStatus(ctx, row, {
      ke: hasil.target,
      aktor: "sistem",
      aktorLabel: olehLabel,
      alasan: hasil.alasan,
      // Ringkasan mesin selalu panjang (>3 karakter), jadi syarat alasan untuk
      // NEEDS_CORRECTION/REJECTED terpenuhi tanpa teks tambahan.
      catatan: hasil.ringkasan,
      sekarang: args.sekarang,
      keputusan: { olehLabel, catatan: hasil.ringkasan },
    });
  }

  return { keputusan: hasil.target, diterapkan: bolehTerapkan, idempoten: false };
}

/**
 * Tandai nomor WhatsApp KYC sebagai TERVERIFIKASI lewat kode OTP.
 *
 * Sengaja fungsi biasa (bukan mutation publik): satu-satunya pemanggilnya
 * adalah `convex/otpWhatsapp.ts`, setelah hash kode benar-benar cocok. Karena
 * itu "Fonnte berhasil mengirim" tidak punya jalan mengisi kolom ini — hanya
 * verifikasi di server yang bisa.
 *
 * Nomor yang dicatat HARUS sama dengan nomor yang tersimpan di baris KYC;
 * kalau tidak, penandanya akan berbicara tentang nomor lain. Pemeriksaan itu
 * diulang di sini supaya aturan pengikatan nomor tidak bergantung pada modul
 * OTP saja.
 */
export async function tandaiNomorWaTerverifikasi(
  ctx: MutationCtx,
  args: { userId: Id<"users">; nomor: string; pada: number; olehLabel: string },
): Promise<void> {
  const row = await ctx.db
    .query("kycProfil")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .first();
  if (row === null) {
    throw new Error(
      "KYC belum dimulai — nomor WhatsApp hanya bisa diverifikasi lewat modul KYC.",
    );
  }
  const tersimpan = normalisasiNomorWa(row.nomorWhatsApp);
  if (tersimpan === null || tersimpan !== args.nomor) {
    throw new Error(
      "Nomor yang diverifikasi berbeda dari nomor KYC yang tersimpan. Simpan nomornya lebih dulu, lalu minta kode baru.",
    );
  }
  await ctx.db.patch(row._id, {
    nomorWhatsAppTerverifikasi: {
      nomor: args.nomor,
      pada: args.pada,
      metode: "wa_otp",
    },
    diperbaruiPada: args.pada,
  });
  // Nomor lengkap tidak masuk catatan audit — cukup bentuk bertopengnya, karena
  // jejak audit dibaca banyak orang dan nomor itu data pribadi.
  const topeng = `62••••${args.nomor.slice(-3)}`;
  await audit(
    ctx,
    args.userId,
    args.olehLabel,
    "kyc_nomor_wa_terverifikasi",
    args.userId,
    `Nomor WhatsApp ${topeng} diverifikasi lewat kode OTP yang dikirim ke nomor itu.`,
  );
}

/* ==========================================================================
 * Gerbang KYC — dipakai modul finansial
 * ========================================================================== */

/**
 * Gerbang KERAS: layanan finansial (pengajuan pinjaman, gadai, kredit barang)
 * hanya dilayani bila modul KYC nasabah sudah `VERIFIED`.
 *
 * Membaca MASTER `kycProfil`, bukan payload pengajuan: status `VERIFIED` hanya
 * dapat ditetapkan server (keputusan mesin ber-aturan atau petugas ber-TOTP),
 * sehingga gerbang ini tidak dapat dilewati dari klien. Ditempatkan di sini —
 * bukan diulang di tiap modul — supaya satu pesan galat dipakai semua jalur.
 *
 * Catatan produk: `VERIFIED` berarti identitas sudah diperiksa; ia BUKAN
 * persetujuan pinjaman dan tidak menjanjikan dana cair.
 */
export async function requireKycTerverifikasi(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (user?.role === ROLES.ADMIN) return;

  const row = await ctx.db
    .query("kycProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (row === null || row.status !== "VERIFIED") {
    throw new Error(
      "KYC diperlukan sebelum pengajuan dapat dikirim. Selesaikan verifikasi KYC Anda lebih dulu, lalu kirim pengajuan kembali.",
    );
  }
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
          penghasilanBulanan: null,
          sumberPenghasilan: "",
          namaBank: "",
          nomorRekening: "",
          catatanPeminjam: "",
          namaKontakDarurat: "",
          nomorKontakDarurat: "",
          hubunganKontakDarurat: "",
        },
        dokumen: { ktpId: null, selfieKtpId: null, buktiPenghasilanId: null },
        url: { ktp: null, selfie: null, buktiPenghasilan: null },
        kekurangan: kekuranganKyc({}),
        lengkap: false,
        // Belum ada baris = tidak ada bukti OTP apa pun.
        nomorWhatsAppTerverifikasi: null,
        nomorWhatsAppTerbukti: false,
        // Belum ada baris = belum ada keputusan otomatis apa pun.
        keputusanOtomatis: null,
        // Belum ada baris = belum ada persetujuan apa pun yang tercatat.
        persetujuan: null,
        persetujuanAktif: false,
        tandaTangan: null,
        tandaTanganPada: null,
        versiPersetujuan: VERSI_PERSETUJUAN_KYC,
        // Belum ada baris = belum ada putusan apa pun atas aturan apa pun.
        versiAturan: VERSI_ATURAN_KYC,
        aturanTerverifikasi: null,
        aturanUsang: false,
        diajukanPada: null,
        diputuskanPada: null,
        diputuskanOlehLabel: null,
        keputusanCatatan: null,
        diperbaruiPada: null,
        riwayat: [],
      };
    }

    // Tautan berumur pendek, bukan URL penyimpanan permanen: dokumen ini
    // identitas pribadi dan tidak boleh tetap hidup setelah sesi pemiliknya.
    const [ktp, selfie, bukti] = await Promise.all([
      tautanBerkas(row.ktpId),
      tautanBerkas(row.selfieKtpId),
      tautanBerkas(row.buktiPenghasilanId),
    ]);
    const riwayat = await ctx.db
      .query("kycRiwayat")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Keputusan otomatis TERAKHIR — supaya nasabah bisa melihat APA yang
    // diperiksa mesin dan mengapa, bukan hanya status akhirnya.
    const keputusanOtomatis = await ctx.db
      .query("kycKeputusanOtomatis")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
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
        /**
         * Angka MENTAH penghasilan (rupiah bulat, `null` bila belum diisi).
         * Teks `penghasilan` di atas untuk DIBACA; nilai ini untuk DIKIRIM —
         * formulir pengajuan memakainya ulang saat KYC sudah terverifikasi
         * (`lib/kyc.identitasPengajuanDariKyc`), dan mengurai teks berformat
         * di klien adalah cara paling mudah salah menghitung uang.
         */
        penghasilanBulanan: row.penghasilanBulanan ?? null,
        sumberPenghasilan: row.sumberPenghasilan ?? "",
        namaBank: row.namaBank ?? "",
        nomorRekening: row.nomorRekening ?? "",
        catatanPeminjam: row.catatanPeminjam ?? "",
        namaKontakDarurat: row.namaKontakDarurat ?? "",
        nomorKontakDarurat: row.nomorKontakDarurat ?? "",
        hubunganKontakDarurat: row.hubunganKontakDarurat ?? "",
      },
      dokumen: {
        ktpId: row.ktpId ?? null,
        selfieKtpId: row.selfieKtpId ?? null,
        buktiPenghasilanId: row.buktiPenghasilanId ?? null,
      },
      url: { ktp, selfie, buktiPenghasilan: bukti },
      kekurangan: kekuranganKyc(r),
      lengkap: lengkapKyc(r),
      /**
       * HASIL PEMERIKSAAN KYC: bukti bahwa nomor WhatsApp aktif milik pemilik
       * akun (bukan sekadar nomor yang diketik). `cocok` dihitung ulang setiap
       * kali dibaca, jadi mengganti nomor otomatis membatalkan bukti lama.
       */
      nomorWhatsAppTerverifikasi:
        row.nomorWhatsAppTerverifikasi === undefined
          ? null
          : {
              nomor: row.nomorWhatsAppTerverifikasi.nomor,
              pada: row.nomorWhatsAppTerverifikasi.pada,
              metode: row.nomorWhatsAppTerverifikasi.metode,
              cocok: nomorWaCocok(row.nomorWhatsAppTerverifikasi, row.nomorWhatsApp),
            },
      nomorWhatsAppTerbukti: nomorWaCocok(
        row.nomorWhatsAppTerverifikasi,
        row.nomorWhatsApp,
      ),
      // Persetujuan dikirim apa adanya (versi + waktu server) supaya antarmuka
      // bisa memblokir pengumpulan data sensitif SELAGI server belum mencatatnya,
      // dan meminta persetujuan ulang bila versi penjelasannya sudah berubah.
      persetujuan:
        row.persetujuan === undefined
          ? null
          : {
              versi: row.persetujuan.versi,
              pada: row.persetujuan.pada,
              olehLabel: row.persetujuan.olehLabel,
            },
      persetujuanAktif: persetujuanAktif(row.persetujuan),
      versiPersetujuan: VERSI_PERSETUJUAN_KYC,
      tandaTangan: row.tandaTangan ?? null,
      tandaTanganPada: row.tandaTanganPada ?? null,
      // ===== Dasar aturan verifikasi =====
      /** Aturan yang berlaku SEKARANG (dipakai UI untuk konteks). */
      versiAturan: VERSI_ATURAN_KYC,
      /** Snapshot aturan saat putusan VERIFIED terakhir, bila pernah ada. */
      aturanTerverifikasi:
        row.aturanTerverifikasi === undefined
          ? null
          : { versi: row.aturanTerverifikasi.versi, pada: row.aturanTerverifikasi.pada },
      /**
       * true bila putusan terakhir diambil dengan aturan yang sudah bukan versi
       * berlaku. Nasabah TIDAK diminta mengulang sendiri: kewenangan meminta
       * verifikasi ulang ada pada petugas (`tinjauKyc`).
       */
      aturanUsang: aturanUsang(row.aturanTerverifikasi?.versi),
      keteranganAturanUsang: keteranganAturanUsang(row.aturanTerverifikasi?.versi),
      diajukanPada: row.diajukanPada ?? null,
      diputuskanPada: row.diputuskanPada ?? null,
      diputuskanOlehLabel: row.diputuskanOlehLabel ?? null,
      keputusanCatatan: row.keputusanCatatan ?? null,
      /**
       * Hasil keputusan otomatis terakhir (mesin `lib/kycAutoApproval.ts`):
       * waktu, status tujuan, alasan, versi aturan, sumber, aktor, dan hasil
       * SETIAP pemeriksaan. Nasabah melihat ini untuk tahu apa yang diminta
       * mesin — bukan untuk menyimpulkan identitasnya sudah terbukti sah.
       */
      keputusanOtomatis:
        keputusanOtomatis === null ? null : proyeksiKeputusanOtomatis(keputusanOtomatis),
      diperbaruiPada: row.diperbaruiPada,
      // Terbaru dulu. `waktu` saja tidak cukup: dua perubahan yang tercatat di
      // milidetik yang sama membuat urutannya tidak tentu, sehingga kejadian
      // terakhir bisa tampil di baris kedua. `_creationTime` (selalu naik) jadi
      // pemecah seri yang membuat "paling baru" benar-benar paling atas.
      riwayat: riwayat
        .sort((a, b) => b.waktu - a.waktu || b._creationTime - a._creationTime)
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
    const { userId } = await requireNasabah(ctx);
    const lama = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    // Berkas KTP/selfie/bukti adalah data pribadi: URL unggahnya baru diberikan
    // setelah persetujuan tercatat, jadi tidak ada berkas sensitif yang bisa
    // mendarat di penyimpanan tanpa dasar persetujuan.
    await pastikanPersetujuan(ctx, lama, "berkas identitas");
    // Batas laju: mencegah satu akun membanjiri penyimpanan/pemeriksa berkas.
    await batasLajuUnggah(ctx, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Catat persetujuan pemrosesan data (`lib/persetujuanKyc.ts`).
 *
 * Terpisah dari `simpanProgresKyc` supaya persetujuan punya waktunya sendiri,
 * tercatat di audit, dan tetap sah walau isian berikutnya gagal disimpan.
 * Idempoten: persetujuan yang sudah berlaku tidak ditulis ulang sehingga tidak
 * ada baris audit ganda.
 */
export const catatPersetujuanKyc = mutation({
  args: { versi: v.string() },
  returns: v.object({ ok: v.literal(true), versi: v.string() }),
  handler: async (ctx, { versi }) => {
    const { userId, label } = await requireNasabah(ctx);
    if (versi !== VERSI_PERSETUJUAN_KYC) {
      throw new Error(
        "Versi penjelasan pemrosesan data sudah berubah. Muat ulang halaman, baca penjelasan " +
          "terbaru, lalu setujui lagi.",
      );
    }
    const sekarang = Date.now();
    const lama = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (persetujuanAktif(lama?.persetujuan)) {
      return { ok: true as const, versi };
    }

    if (lama === null) {
      // Menyetujui = memulai modul KYC (NOT_STARTED → IN_PROGRESS oleh nasabah).
      await ctx.db.insert("kycProfil", {
        userId,
        status: "IN_PROGRESS",
        dibuatPada: sekarang,
        diperbaruiPada: sekarang,
        persetujuan: { versi, pada: sekarang, olehLabel: label },
      });
    } else {
      await ctx.db.patch(lama._id, {
        persetujuan: { versi, pada: sekarang, olehLabel: label },
        diperbaruiPada: sekarang,
      });
    }
    await audit(
      ctx,
      userId,
      label,
      "kyc_persetujuan",
      userId,
      `Persetujuan pemrosesan data pribadi dicatat (versi penjelasan ${versi}).`,
    );
    return { ok: true as const, versi };
  },
});

/** Batas ukuran data URL tanda tangan (PNG) — sama dengan batas di `loans`. */
const BATAS_TANDA_TANGAN = 200_000;

/**
 * Simpan tanda tangan peminjam DI KYC — dicatat sekali, lalu dipakai ulang oleh
 * setiap pengajuan pinjaman (lihat `loans.createLoanApplication`).
 *
 * Sengaja terpisah dari `simpanProgresKyc`: tanda tangan bukan bagian dari
 * kelengkapan identitas (tidak pernah menahan atau mengubah status verifikasi),
 * dan boleh diperbarui kapan saja — termasuk oleh nasabah yang sudah VERIFIED —
 * tanpa memicu `REVERIFICATION_REQUIRED`.
 */
export const simpanTandaTanganKyc = mutation({
  args: { tandaTangan: v.string() },
  returns: v.object({ ok: v.literal(true), pada: v.number() }),
  handler: async (ctx, { tandaTangan }) => {
    const { userId, label } = await requireNasabah(ctx);
    const row = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row === null) {
      throw new Error("Mulai modul KYC lebih dulu, lalu bubuhkan tanda tangan di sini.");
    }
    // Tanda tangan adalah data pribadi: sama seperti isian lain, baru boleh
    // disimpan setelah persetujuan pemrosesan data tercatat di server.
    await pastikanPersetujuan(ctx, row, "tanda tangan");
    if (!tandaTangan.startsWith("data:image/png;base64,")) {
      throw new Error("Format gambar tanda tangan tidak valid. Bubuhkan tanda tangan lagi.");
    }
    if (tandaTangan.length > BATAS_TANDA_TANGAN) {
      throw new Error("Data tanda tangan terlalu besar. Hapus lalu bubuhkan tanda tangan lagi.");
    }
    const sekarang = Date.now();
    await ctx.db.patch(row._id, {
      tandaTangan,
      tandaTanganPada: sekarang,
      diperbaruiPada: sekarang,
    });
    await audit(
      ctx,
      userId,
      label,
      "kyc_tanda_tangan",
      userId,
      "Nasabah menyimpan gambar tanda tangan di KYC; gambar ini dipakai pada setiap pengajuan pinjaman.",
    );
    return { ok: true as const, pada: sekarang };
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
    namaKontakDarurat: v.optional(v.string()),
    nomorKontakDarurat: v.optional(v.string()),
    hubunganKontakDarurat: v.optional(v.string()),
    ktpId: v.optional(v.union(v.id("_storage"), v.null())),
    selfieKtpId: v.optional(v.union(v.id("_storage"), v.null())),
    buktiPenghasilanId: v.optional(v.union(v.id("_storage"), v.null())),
    /**
     * Snapshot OCR KTP terbaru dari peramban (`lib/kycOcrMesin.ts`), atau `null`
     * untuk membuangnya. `undefined` (tidak dikirim) berarti "pertahankan yang
     * tersimpan" — kecuali berkas KTP berubah, yang otomatis membuangnya.
     *
     * Disimpan bersama simpanan lain (bukan lewat mutation terpisah) supaya
     * snapshot selalu sejalan dengan berkas KTP yang benar-benar tersimpan.
     */
    ocrKtp: v.optional(
      v.union(
        v.object({
          konfidensi: v.number(),
          nik: v.union(v.string(), v.null()),
          nama: v.union(v.string(), v.null()),
          alamat: v.union(v.string(), v.null()),
        }),
        v.null(),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { userId, label } = await requireNasabah(ctx);
    const sekarang = Date.now();
    const lama = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Gerbang persetujuan: semua argumen di mutation ini adalah data pribadi.
    await pastikanPersetujuan(ctx, lama, "data KYC");

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
      namaKontakDarurat: args.namaKontakDarurat ?? lama?.namaKontakDarurat,
      nomorKontakDarurat: args.nomorKontakDarurat ?? lama?.nomorKontakDarurat,
      hubunganKontakDarurat: args.hubunganKontakDarurat ?? lama?.hubunganKontakDarurat,
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

    // 3) Kontak darurat: tahap opsional, tetapi nilai yang DIISI harus masuk
    // akal — memakai aturan yang sama dengan modul KYC (`galatKontakDarurat`).
    // Hanya kolom yang DIKIRIM sekarang yang diperiksa: baris lama yang tidak
    // punya kolom ini (atau menyimpan nilai keliru) tetap bisa disunting tanpa
    // harus membereskannya lebih dulu, persis seperti isian data diri di atas.
    const galatDarurat = galatKontakDarurat(isian);
    const dikirimDarurat: Array<[keyof typeof galatDarurat, string | undefined]> = [
      ["namaKontakDarurat", args.namaKontakDarurat],
      ["nomorKontakDarurat", args.nomorKontakDarurat],
      ["hubunganKontakDarurat", args.hubunganKontakDarurat],
    ];
    for (const [kunci, nilai] of dikirimDarurat) {
      const pesan = galatDarurat[kunci];
      if (pesan !== undefined && (nilai ?? "").trim() !== "") {
        throw new Error(`Isian KYC ditolak: ${pesan}`);
      }
    }

    // Snapshot OCR mengikuti FOTO KTP. Yang dikirim sekarang dipakai; bila tidak
    // dikirim, yang lama dipertahankan KECUALI berkas KTP berubah (teks lama
    // mewakili gambar lain). `null` eksplisit berarti membuangnya.
    const ocrKtpBerikut =
      args.ocrKtp === undefined
        ? dokumen.ktpId === (lama?.ktpId ?? null)
          ? lama?.ocrKtp
          : undefined
        : args.ocrKtp === null
          ? undefined
          : {
              konfidensi: Number.isFinite(args.ocrKtp.konfidensi)
                ? Math.max(0, Math.min(100, args.ocrKtp.konfidensi))
                : 0,
              nik: args.ocrKtp.nik === null ? null : args.ocrKtp.nik.slice(0, 32),
              nama: args.ocrKtp.nama === null ? null : args.ocrKtp.nama.slice(0, 120),
              alamat: args.ocrKtp.alamat === null ? null : args.ocrKtp.alamat.slice(0, 300),
              pada: sekarang,
              sumber: "klien",
            };

    // `null` pada dokumen berarti "kosongkan berkas ini" — di Convex, patch
    // dengan `undefined` yang menghapus kolomnya (pola yang sama dipakai
    // `dataDiriProfil.ts` saat menghapus foto KTP lama).
    const isi = {
      ...isian,
      penghasilanBulanan: penghasilanBulanan === null ? undefined : penghasilanBulanan,
      ktpId: dokumen.ktpId ?? undefined,
      selfieKtpId: dokumen.selfieKtpId ?? undefined,
      buktiPenghasilanId: dokumen.buktiPenghasilanId ?? undefined,
      // Bukti OTP terikat pada NOMOR: begitu nomornya berubah, bukti lama tidak
      // lagi mewakili nomor baru, jadi ikut dibuang di sini.
      nomorWhatsAppTerverifikasi:
        normalisasiNomorWa(isian.nomorWhatsApp) === normalisasiNomorWa(lama?.nomorWhatsApp)
          ? lama?.nomorWhatsAppTerverifikasi
          : undefined,
      ocrKtp: ocrKtpBerikut,
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

    // IDEMPOTEN: pengajuan yang SUDAH menunggu peninjauan tidak diajukan lagi.
    // Klik ganda atau percobaan ulang karena jaringan tidak boleh membuat baris
    // riwayat & audit kedua, dan tidak boleh menggeser `diajukanPada` milik
    // pengajuan yang sedang ditinjau petugas. Data yang berubah setelah
    // diajukan pasti sudah menarik statusnya kembali ke IN_PROGRESS (lihat
    // `simpanProgresKyc`), jadi PENDING_REVIEW di sini berarti pengajuan itu
    // memang pengajuan terakhir — tidak ada yang perlu dikirim.
    if (row.status === "PENDING_REVIEW") {
      return { status: "PENDING_REVIEW" as StatusKyc };
    }

    // Pertahanan berlapis: pengajuan tidak mungkin berisi data pribadi tanpa
    // persetujuan yang tercatat, tetapi diperiksa lagi di sini supaya baris lama
    // (dibuat sebelum aturan ini ada) tidak bisa diajukan tanpa persetujuan.
    await pastikanPersetujuan(ctx, row, "pengajuan KYC");
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

    // Kontak darurat opsional, jadi ia TIDAK menghalangi pengajuan saat kosong.
    // Tetapi bila terisi, pengajuan adalah gerbang terakhirnya: nilai yang tidak
    // masuk akal harus dibereskan di sini, bukan dibiarkan ikut terkirim ke
    // petugas. Aturannya sama dengan modul KYC, bukan tafsiran kedua.
    const galatDarurat = galatKontakDarurat({
      namaKontakDarurat: row.namaKontakDarurat,
      nomorKontakDarurat: row.nomorKontakDarurat,
      hubunganKontakDarurat: row.hubunganKontakDarurat,
    });
    const pesanDarurat =
      galatDarurat.namaKontakDarurat ??
      galatDarurat.nomorKontakDarurat ??
      galatDarurat.hubunganKontakDarurat;
    if (pesanDarurat !== undefined) {
      throw new Error(`Kontak darurat perlu diperbaiki: ${pesanDarurat}`);
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

    // KEPUTUSAN OTOMATIS dijalankan SETELAH pengajuan tersimpan dan status sudah
    // `PENDING_REVIEW`. Mesin hanya boleh MENERAPKAN `VERIFIED` (seluruh
    // pemeriksaan yang bisa diverifikasi mesin lulus) — `NEEDS_CORRECTION` dan
    // `PENDING_REVIEW` hanya dicatat sebagai bahan peninjauan, dan status
    // dibiarkan menunggu petugas. Idempoten — dijalankan ulang atas data yang
    // tidak berubah, ia tidak menulis keputusan/jejak kedua.
    const otomatis = await terapkanKeputusanOtomatis(ctx, { userId, sekarang });
    const akhir = await ctx.db.get(row._id);
    return {
      status: (akhir?.status ?? otomatis.keputusan) as StatusKyc,
      otomatis: { keputusan: otomatis.keputusan, diterapkan: otomatis.diterapkan },
    };
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

/**
 * Daftar KYC untuk panel petugas — pencarian, saringan, dan cacah.
 *
 * Aturan penyaringan TIDAK ditulis ulang di sini: semuanya dari
 * `lib/kycAdmin.ts` (murni & diuji), lalu dipakai juga oleh uji penyaring itu
 * sendiri. Jadi daftar yang dilihat petugas tidak bisa berbeda dari yang
 * dihitung server.
 *
 * Nilai saringan dari klien TIDAK dipercaya apa adanya: status & hasil yang
 * tidak dikenal jatuh kembali ke "tanpa saringan" (`statusDariTeks`,
 * `hasilDariTeks`), dan tanggal yang tidak berbentuk `YYYY-MM-DD` diabaikan.
 *
 * Fakta yang MAHAL hanya diambil bila saringannya memang meminta:
 * - keputusan otomatis terakhir per baris → hanya untuk saringan `otomatis_*`;
 * - penanda `berkasTerverifikasi` tiap slot → hanya untuk
 *   `dokumen_belum_diperiksa`.
 * Daftar tanpa saringan hasil karena itu tetap ringan.
 *
 * `cacah` dihitung dari baris yang lolos saringan SELAIN status — angka di
 * tombol status berarti "berapa hasil yang muncul bila status ini dipilih",
 * bukan angka tabel yang tidak nyambung dengan pencarian yang aktif.
 */
export const daftarKycAdmin = query({
  args: {
    status: v.optional(v.string()),
    /** Kata kunci: nama, email, atau kode nasabah. */
    cari: v.optional(v.string()),
    /** Saringan hasil pemeriksaan (`lib/kycAdmin.ts`). */
    hasil: v.optional(v.string()),
    /** Tanggal `YYYY-MM-DD`; `sampai` inklusif. */
    dari: v.optional(v.string()),
    sampai: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const rows = await ctx.db.query("kycProfil").collect();
    const users = await ctx.db.query("users").collect();
    const userPerId = new Map(users.map((u) => [u._id as string, u]));

    const { dari, sampai } = rentangTanggal(args.dari, args.sampai);
    const filter: FilterKyc = {
      cari: args.cari ?? "",
      status: statusDariTeks(args.status),
      hasil: hasilDariTeks(args.hasil),
      dari,
      sampai,
    };

    const perluKeputusan = filter.hasil.startsWith("otomatis_");
    const perluBerkas = filter.hasil === "dokumen_belum_diperiksa";

    /** Keputusan otomatis TERAKHIR milik satu nasabah (bila saringan minta). */
    const bacaKeputusan = async (userId: Id<"users">) => {
      if (!perluKeputusan) return null;
      const k = await ctx.db
        .query("kycKeputusanOtomatis")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .first();
      return k === null ? null : { keputusan: k.keputusan as StatusKyc, diterapkan: k.diterapkan, waktu: k.waktu };
    };

    /**
     * Ada berkas yang TERTAUT tetapi belum lolos pemeriksaan isi di server
     * (bila saringan minta). Slot yang belum diunggah TIDAK termasuk — itu
     * sudah dilaporkan sebagai `kekurangan`.
     */
    const bacaBerkasBelumDiperiksa = async (r: Doc<"kycProfil">) => {
      if (!perluBerkas) return false;
      const slots = [r.ktpId, r.selfieKtpId, r.buktiPenghasilanId];
      for (const id of slots) {
        if (id === undefined) continue;
        const penanda = await ctx.db
          .query("berkasTerverifikasi")
          .withIndex("by_storageId", (q) => q.eq("storageId", id))
          .first();
        if (penanda === null) return true;
      }
      return false;
    };

    const baris: Array<{ row: Doc<"kycProfil">; saring: BarisSaringKyc & { kunci: string } }> = [];
    for (const r of rows) {
      const u = userPerId.get(r.userId);
      baris.push({
        row: r,
        saring: {
          kunci: r._id as string,
          nama: u?.name ?? u?.email ?? "—",
          email: u?.email ?? null,
          kodePeminjam: u?.kodePeminjam ?? null,
          status: r.status as StatusKyc,
          kekurangan: kekuranganKyc(ringkas(r)),
          aturanUsang: aturanUsang(r.aturanTerverifikasi?.versi),
          nomorWhatsAppTerbukti: nomorWaCocok(r.nomorWhatsAppTerverifikasi, r.nomorWhatsApp),
          verifikasiUlangTertunda: perluVerifikasiUlang(stempel(r), ringkas(r)),
          dokumenBelumDiperiksa: await bacaBerkasBelumDiperiksa(r),
          diajukanPada: r.diajukanPada ?? null,
          diperbaruiPada: r.diperbaruiPada,
          keputusanOtomatis: await bacaKeputusan(r.userId),
        },
      });
    }

    // Cacah per status: saringan yang sama TANPA bagian status.
    const lolosTanpaStatus = saringKycAdmin(
      baris.map((b) => b.saring),
      { ...filter, status: null },
    );
    const cacah = cacahPerStatus(lolosTanpaStatus);
    const kunciLolos = new Set(lolosTanpaStatus.map((b) => b.kunci));

    const item = baris
      .filter((b) => kunciLolos.has(b.saring.kunci))
      .filter((b) => filter.status === null || b.saring.status === filter.status)
      .sort((a, b) => tanggalAcuan(b.saring) - tanggalAcuan(a.saring))
      .slice(0, 100)
      .map(({ row: r, saring: s }) => ({
        userId: r.userId,
        nama: s.nama,
        email: s.email,
        /** Kode pseudonim nasabah — dipakai petugas menyebut kasus tanpa NIK. */
        kodePeminjam: s.kodePeminjam,
        status: s.status,
        kekurangan: s.kekurangan,
        /** Putusan terakhir diambil dengan aturan yang sudah tidak berlaku. */
        aturanUsang: s.aturanUsang,
        /** Nomor WhatsApp benar-benar dibuktikan lewat OTP (bukan "kode terkirim"). */
        nomorWhatsAppTerbukti: s.nomorWhatsAppTerbukti,
        verifikasiUlangTertunda: s.verifikasiUlangTertunda,
        /** Keputusan mesin terakhir — apa pun hasilnya (bahan peninjauan). */
        keputusanOtomatis: s.keputusanOtomatis ?? null,
        diajukanPada: r.diajukanPada ?? null,
        diperbaruiPada: r.diperbaruiPada,
        diputuskanPada: r.diputuskanPada ?? null,
      }));

    return {
      item,
      cacah,
      total: rows.length,
      tampil: item.length,
      /** Urutan status yang ditampilkan panel (IN_PROGRESS = sedang diproses). */
      urutanStatus: STATUS_ANTREAN,
    };
  },
});

/**
 * Detail satu KYC untuk petugas: identitas, bukti OTP, status tiap dokumen,
 * hasil OCR beserta ketidaksesuaiannya, hasil pemeriksaan otomatis, riwayat
 * status, dan jejak audit nasabah ini.
 *
 * URL dokumen KTP/selfie keluar HANYA dari sini (dan `admin.dokumenKycUrls`):
 * keduanya menuntut admin ber-TOTP, dan URL-nya bertanda tangan + berumur
 * pendek (`berkas.tautanBerkas`), bukan URL penyimpanan permanen. Tidak ada
 * query sisi penyedia dana / pemantau yang mengembalikan berkas identitas.
 */
export const detailKycAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdminSession(ctx);
    const [row, user] = await Promise.all([
      ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db.get(userId),
    ]);
    if (row === null) return null;

    // Tautan berumur pendek, bukan URL penyimpanan permanen: dokumen ini
    // identitas pribadi dan tidak boleh tetap hidup setelah sesi pemiliknya.
    const [ktp, selfie, bukti] = await Promise.all([
      tautanBerkas(row.ktpId),
      tautanBerkas(row.selfieKtpId),
      tautanBerkas(row.buktiPenghasilanId),
    ]);
    const riwayat = await ctx.db
      .query("kycRiwayat")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const keputusanOtomatis = await ctx.db
      .query("kycKeputusanOtomatis")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    // Jejak audit PER NASABAH ini (bukan 20 entri admin terakhir, yang bisa
    // sama sekali tidak menyangkut dirinya). Dibaca dari indeks `by_target`:
    // aksi ber-subjek nasabah mencatat id pengguna di kolom `target`.
    const auditTerkait = await ctx.db
      .query("auditLog")
      .withIndex("by_target", (q) => q.eq("target", userId))
      .order("desc")
      .take(20);

    return {
      userId,
      status: row.status as StatusKyc,
      /** Kode pseudonim + email: cara petugas menyebut nasabah tanpa NIK. */
      kodePeminjam: user?.kodePeminjam ?? null,
      email: user?.email ?? null,
      namaLengkap: row.namaLengkap ?? null,
      nik: row.nik ?? null,
      nomorWhatsApp: row.nomorWhatsApp ?? null,
      alamat: row.alamat ?? null,
      pekerjaan: row.pekerjaan ?? null,
      penghasilanBulanan: row.penghasilanBulanan ?? null,
      sumberPenghasilan: row.sumberPenghasilan ?? null,
      catatanPeminjam: row.catatanPeminjam ?? null,
      namaKontakDarurat: row.namaKontakDarurat ?? null,
      nomorKontakDarurat: row.nomorKontakDarurat ?? null,
      hubunganKontakDarurat: row.hubunganKontakDarurat ?? null,
      kekurangan: kekuranganKyc(ringkas(row)),
      /**
       * Hasil pemeriksaan nomor WhatsApp untuk petugas: nomor, waktu, cara, dan
       * apakah buktinya masih cocok dengan nomor yang tersimpan sekarang.
       * "Kode terkirim" tidak pernah masuk sini — hanya verifikasi server.
       */
      nomorWhatsAppTerverifikasi:
        row.nomorWhatsAppTerverifikasi === undefined
          ? null
          : {
              nomor: row.nomorWhatsAppTerverifikasi.nomor,
              pada: row.nomorWhatsAppTerverifikasi.pada,
              metode: row.nomorWhatsAppTerverifikasi.metode,
              cocok: nomorWaCocok(row.nomorWhatsAppTerverifikasi, row.nomorWhatsApp),
            },
      nomorWhatsAppTerbukti: nomorWaCocok(
        row.nomorWhatsAppTerverifikasi,
        row.nomorWhatsApp,
      ),
      /**
       * HASIL OCR KTP yang tersimpan (snapshot dari perangkat nasabah, sumber
       * "klien"). Ditampilkan apa adanya sebagai PEMBACAAN — bukan bukti
       * keaslian KTP. `null` berarti mesin OCR belum pernah dijalankan/di-simpan,
       * dan itu dinyatakan apa-adanya, bukan ditampilkan sebagai teks kosong.
       */
      ocrKtp:
        row.ocrKtp === undefined
          ? null
          : {
              konfidensi: row.ocrKtp.konfidensi,
              nik: row.ocrKtp.nik,
              nama: row.ocrKtp.nama,
              alamat: row.ocrKtp.alamat,
              pada: row.ocrKtp.pada,
              sumber: row.ocrKtp.sumber,
            },
      /**
       * KETIDAKSESUAIAN teks KTP ↔ isian, dipisah material (NIK/nama) dan lunak
       * (mis. alamat). Hanya field yang benar-benar terbaca mesin yang bisa
       * dilaporkan; daftar kosong berarti tidak ada perbedaan yang TERBACA —
       * BUKAN "data pasti cocok".
       */
      ketidaksesuaian:
        row.ocrKtp === undefined
          ? { material: [], lunak: [] }
          : bandingkanOcrDenganIsian(row.ocrKtp, {
              namaLengkap: row.namaLengkap ?? "",
              nik: row.nik ?? "",
              alamat: row.alamat ?? "",
            }),
      diajukanPada: row.diajukanPada ?? null,
      diputuskanPada: row.diputuskanPada ?? null,
      diputuskanOlehLabel: row.diputuskanOlehLabel ?? null,
      keputusanCatatan: row.keputusanCatatan ?? null,
      verifikasiUlangTertunda: perluVerifikasiUlang(stempel(row), ringkas(row)),
      /**
       * JEJAK AUDIT nasabah ini (baris append-only dari `auditLog`), terbaru
       * dulu. Inilah jawaban atas "apa saja yang pernah terjadi pada data ini" —
       * terpisah dari riwayat STATUS di bawah, yang hanya mencatat transisi.
       */
      audit: auditTerkait.map((a) => ({
        aksi: a.aksi,
        aktorLabel: a.aktorLabel,
        detail: a.detail ?? null,
        target: a.target ?? null,
        waktu: a.waktu,
      })),
      // ===== Dasar aturan verifikasi =====
      versiAturan: VERSI_ATURAN_KYC,
      aturanTerverifikasi:
        row.aturanTerverifikasi === undefined
          ? null
          : { versi: row.aturanTerverifikasi.versi, pada: row.aturanTerverifikasi.pada },
      aturanUsang: aturanUsang(row.aturanTerverifikasi?.versi),
      keteranganAturanUsang: keteranganAturanUsang(row.aturanTerverifikasi?.versi),
      /**
       * Hasil pemeriksaan tiap berkas: jenis (dari ISI berkas), ukuran, sidik
       * jari SHA-256, dan versi aturan yang memeriksanya. Dibaca dari tabel
       * `berkasTerverifikasi` — bukan dari klaim klien — supaya petugas bisa
       * menilai berkasnya tanpa membuka gambarnya lebih dulu.
       */
      berkas: await Promise.all(
        (
          [
            ["ktp", "Foto KTP", row.ktpId ?? null],
            ["selfie", "Selfie dengan KTP", row.selfieKtpId ?? null],
            ["bukti", "Bukti penghasilan", row.buktiPenghasilanId ?? null],
          ] as Array<[SlotBerkasAturan, string, Id<"_storage"> | null]>
        ).map(async ([slot, label, id]) => {
          if (id === null) {
            return {
              slot,
              label,
              /** false = tidak ada id berkas tersimpan di baris KYC. */
              tertaut: false,
              ada: false,
              /** Keadaan slot untuk petugas (`lib/kycAdmin.ts`). */
              statusDokumen: statusDokumenKyc({
                diunggah: false,
                diperiksaServer: false,
                aturanUsang: false,
              }),
              jenis: null,
              ukuranByte: null,
              contentType: null,
              sidikJari: null,
              lebar: null,
              tinggi: null,
              versiAturan: null,
              diperiksaPada: null,
              aturanUsang: false,
              dipakaiAkunLain: 0,
            };
          }
          const penanda = await ctx.db
            .query("berkasTerverifikasi")
            .withIndex("by_storageId", (q) => q.eq("storageId", id))
            .first();
          // Berkas identitas yang ISINYA sama dipakai akun lain: terlihat dari
          // sidik jari SHA-256 (indeks `by_sidikJari`). Yang dilaporkan hanya
          // JUMLAHNYA — petugas perlu tahu ada indikasi penggunaan ulang tanpa
          // membuka data pemilik lain dari layar ini.
          let dipakaiAkunLain = 0;
          if (penanda?.sidikJari !== undefined) {
            const sejenis = await ctx.db
              .query("berkasTerverifikasi")
              .withIndex("by_sidikJari", (q) => q.eq("sidikJari", penanda.sidikJari))
              .collect();
            dipakaiAkunLain = sejenis.filter(
              (s) => s.olehUserId !== undefined && s.olehUserId !== userId,
            ).length;
          }
          return {
            slot,
            label,
            /** true = ada berkas tersimpan, walau belum diperiksa isinya. */
            tertaut: true,
            ada: penanda !== null,
            statusDokumen: statusDokumenKyc({
              diunggah: true,
              diperiksaServer: penanda !== null,
              aturanUsang: aturanUsang(penanda?.versiAturan),
            }),
            jenis: penanda?.jenis ?? null,
            ukuranByte: penanda?.ukuranByte ?? null,
            contentType: penanda?.contentType ?? null,
            sidikJari: penanda?.sidikJari ?? null,
            lebar: penanda?.lebar ?? null,
            tinggi: penanda?.tinggi ?? null,
            versiAturan: penanda?.versiAturan ?? null,
            diperiksaPada: penanda?.waktu ?? null,
            aturanUsang: aturanUsang(penanda?.versiAturan),
            dipakaiAkunLain,
          };
        }),
      ),
      // Petugas perlu tahu dasar pemrosesan sebelum memutuskan: tanpa persetujuan
      // yang berlaku, keputusan apa pun tidak punya dasar yang bisa diaudit.
      persetujuan:
        row.persetujuan === undefined
          ? null
          : {
              versi: row.persetujuan.versi,
              pada: row.persetujuan.pada,
              olehLabel: row.persetujuan.olehLabel,
            },
      persetujuanAktif: persetujuanAktif(row.persetujuan),
      /**
       * Hasil pemeriksaan otomatis TERAKHIR — apa yang diperiksa mesin, apa yang
       * GAGAL / belum pasti, dan apakah hasilnya sampai mengubah status. Mesin
       * hanya boleh MENERAPKAN `VERIFIED`, jadi hasil lain di sini adalah bahan
       * pertimbangan petugas sebelum memutuskan (bukan keputusan yang sudah
       * berjalan di belakang mereka).
       */
      keputusanOtomatis:
        keputusanOtomatis === null ? null : proyeksiKeputusanOtomatis(keputusanOtomatis),
      url: { ktp, selfie, buktiPenghasilan: bukti },
      // Lihat catatan yang sama di `kycSaya`: pemecah seri `_creationTime`
      // menjaga urutan "terbaru dulu" tetap pasti di panel petugas.
      riwayat: riwayat
        .sort((a, b) => b.waktu - a.waktu || b._creationTime - a._creationTime)
        .slice(0, 30)
        .map((it) => ({
          dari: it.dari,
          ke: it.ke,
          aktor: it.aktor,
          aktorLabel: it.aktorLabel,
          alasan: it.alasan,
          catatan: it.catatan ?? null,
          versiAturan: it.versiAturan ?? null,
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
 * MIGRASI BERTAHAP — melengkapi metadata berkas lama
 * ========================================================================== */

/**
 * MIGRASI (bertahap, idempoten, admin ber-TOTP): lengkapi metadata
 * `berkasTerverifikasi` yang dibuat SEBELUM kolom metadata ada.
 *
 * Kenapa perlu: baris lama hanya menyimpan `storageId`/`label`/`jenis`, sehingga
 * panel petugas tidak bisa menampilkan ukuran atau sidik jari berkas lamanya —
 * padahal berkasnya masih ada. Semua nilai diisi dari tabel sistem `_storage`:
 * FAKTA yang sudah tercatat Convex, bukan hasil menebak.
 *
 * Yang sengaja TIDAK diisi: `versiAturan`. Baris lama tidak menyimpan aturan
 * mana yang memeriksanya, dan menstempel versi yang berlaku SEKARANG akan
 * memalsukan bukti audit. Kolomnya dibiarkan kosong; `aturanUsang()`
 * memperlakukan "tanpa versi" sebagai "tidak diketahui", bukan "usang".
 *
 * Idempoten: baris yang metadatanya sudah lengkap dilewati, jadi pemanggilan
 * ulang tidak menulis apa pun. Berjalan 50 baris per pemanggilan dengan cursor —
 * pola yang sama dengan `admin.backfillKodePeminjam`.
 */
export const backfillMetadataBerkas = mutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    await requireAdminSession(ctx);
    const page = await ctx.db
      .query("berkasTerverifikasi")
      .order("asc")
      .paginate({ numItems: 50, cursor });
    let dilengkapi = 0;
    let berkasHilang = 0;
    for (const baris of page.page) {
      if (baris.sidikJari !== undefined && baris.ukuranByte !== undefined) continue;
      const meta = await ctx.db.system.get("_storage", baris.storageId);
      if (meta === null) {
        // Berkasnya sudah dihapus: tidak ada yang bisa dicatat, dan baris
        // penandanya sengaja TIDAK diubah (tidak ada yang dikarang).
        berkasHilang += 1;
        continue;
      }
      await ctx.db.patch(baris._id, {
        ukuranByte: meta.size,
        contentType: (meta.contentType ?? "").slice(0, 80),
        sidikJari: meta.sha256,
      });
      dilengkapi += 1;
    }
    return {
      cursor: page.continueCursor,
      selesai: page.isDone,
      dilengkapi,
      berkasHilang,
    };
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
    lebar: v.optional(v.number()),
    tinggi: v.optional(v.number()),
    olehUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { storageId, label, jenis, lebar, tinggi, olehUserId }) => {
    // Metadata diambil dari tabel sistem `_storage` — BUKAN dari argumen yang
    // dikirim pemanggil. Ukuran, tipe, dan sidik jari SHA-256 adalah fakta yang
    // dicatat Convex saat berkas benar-benar tersimpan; menerimanya dari klien
    // berarti mencatat klaim, bukan bukti.
    const meta = await ctx.db.system.get("_storage", storageId);
    if (meta === null) {
      // Berkas yang sudah tidak ada tidak boleh ditandai "terverifikasi":
      // tanpa ini, penanda bisa hidup untuk berkas yang sudah dihapus.
      throw new Error("Berkas tidak ditemukan di penyimpanan. Unggah ulang berkasnya.");
    }
    const isi = {
      label: label.slice(0, 60),
      jenis,
      ukuranByte: meta.size,
      contentType: (meta.contentType ?? "").slice(0, 80),
      sidikJari: meta.sha256,
      // Dimensi yang dibaca action dari header berkas — dipakai panel petugas
      // untuk menilai keterbacaan tanpa membuka gambarnya lebih dulu.
      ...(lebar === undefined ? {} : { lebar }),
      ...(tinggi === undefined ? {} : { tinggi }),
      // Versi aturan yang memeriksa berkas ini ikut dicatat supaya berkas yang
      // diperiksa dengan aturan lama bisa ditandai di panel petugas.
      versiAturan: VERSI_ATURAN_KYC,
      ...(olehUserId === undefined ? {} : { olehUserId }),
    };
    const waktu = Date.now();
    const lama = await ctx.db
      .query("berkasTerverifikasi")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first();
    if (lama === null) {
      await ctx.db.insert("berkasTerverifikasi", { storageId, ...isi, waktu });
      return { ok: true as const };
    }
    // Pemeriksaan ulang atas berkas yang sama hanya memperbarui hasil terakhir
    // (storage id tidak bisa berubah isinya, jadi tidak ada riwayat yang hilang).
    await ctx.db.patch(lama._id, { ...isi, waktu });
    return { ok: true as const };
  },
});
