/**
 * Voucher nasabah — penerbitan, kelayakan, pemakaian, dan apresiasi.
 *
 * Server adalah satu-satunya yang menghitung kelayakan: plafon tersedia,
 * tambahan limit, sisa kuota, dan masa berlaku dibaca di sini, lalu dikirim ke
 * layar sebagai daftar yang sudah bertanda layak/tidak. Pengajuan pinjaman
 * memanggil jalur yang sama, sehingga voucher yang tampil "bisa dipakai" tidak
 * mungkin ditolak saat dikirim — dan sebaliknya.
 *
 * Voucher TIDAK mengubah plafon pokok: potongan biaya admin hanya membuat dana
 * yang diterima lebih besar. Hanya `boost_plafon` yang menambah batas, sekali
 * pakai, dan langsung hangus saat pengajuan tersimpan.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  boostTersedia as hitungBoostTersedia,
  diskonBiayaAdmin,
  kelayakanVoucher,
  nilaiVoucherApresiasi,
  VOUCHER_APRESIASI_HARI,
  type VoucherRingkas,
} from "../lib/voucher";
import { LOAN_LIMITS } from "../lib/loan";
import { formatRupiah, type Rupiah } from "../lib/money";
import { plafonPeminjam, ringkasPlafon } from "../lib/plafon";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { eksposurSyariah } from "./syariahPengajuan";
import { ROLES } from "./schema";
import { audit } from "./system";

const JENIS = v.union(
  v.literal("diskon_admin"),
  v.literal("diskon_ujrah"),
  v.literal("diskon_margin"),
  v.literal("boost_plafon"),
);

/** Batas baris yang dikirim ke satu nasabah. */
const BATAS_BARIS = 50;

/**
 * Voucher milik pembaca untuk satu pinjaman yang SEDANG diajukan.
 *
 * Dipisah dari query daftar karena pemakaian butuh pemeriksaan tambahan:
 * kepemilikan, jenis yang cocok dengan skema, dan minimal pengajuan terhadap
 * batas yang sudah ditambah boost voucher itu sendiri.
 */
export type VoucherTerpilih = {
  voucher: Doc<"voucher"> | null;
  /** Tambahan limit dari voucher boost (0 untuk voucher potongan). */
  boost: Rupiah;
};

function butuhMasuk(userId: Id<"users"> | null): Id<"users"> {
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  return userId;
}

/** Voucher hanya boleh dipakai pemiliknya sendiri. */
function milikPemilik(voucher: Doc<"voucher">, userId: Id<"users">): boolean {
  return voucher.pemilikId === userId;
}

/**
 * Voucher aktif milik pembaca beserta kelayakannya, dihitung dari plafon
 * tersedia dan tambahan limit yang masih bisa dipakai.
 */
export const daftarVoucherSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = butuhMasuk(await getAuthUserId(ctx));
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Akun tidak ditemukan.");
    if (user.role === ROLES.ADMIN) return null;

    const sekarang = Date.now();
    const plafon = await plafonPeminjam(ctx, userId);
    const pinjaman = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Eksposur syariah (akad aktif + pengajuan yang sudah disetujui) ikut
    // menentukan sisa plafon yang bisa dipakai voucher boost.
    const eksposur = await eksposurSyariah(ctx, userId);
    const ringkas = ringkasPlafon(plafon, [...pinjaman, ...eksposur]);

    const rows = await ctx.db
      .query("voucher")
      .withIndex("by_pemilik", (q) => q.eq("pemilikId", userId))
      .collect();

    const ringkasVoucher: VoucherRingkas[] = rows
      .filter((row) => row.status === "aktif")
      .sort((a, b) => a.berlakuSampai - b.berlakuSampai)
      .slice(0, BATAS_BARIS)
      .map((row) => ({
        _id: String(row._id),
        kode: row.kode,
        jenis: row.jenis,
        judul: row.judul,
        nilai: row.nilai,
        minPokok: row.minPokok,
        batasPemakaian: row.batasPemakaian,
        terpakai: row.terpakai,
        status: row.status,
        berlakuSampai: row.berlakuSampai,
      }));

    const boost = hitungBoostTersedia(ringkasVoucher, {
      tersedia: ringkas.tersedia,
      sekarang,
    });

    const daftar = ringkasVoucher.map((row) => {
      const batas =
        row.jenis === "boost_plafon" ? ringkas.tersedia + row.nilai : ringkas.tersedia;
      const layak = kelayakanVoucher(row, { batasPengajuan: batas, sekarang });
      return {
        ...row,
        layak: layak.layak,
        alasan: layak.alasan,
      };
    });

    return {
      sekarang,
      limit: {
        ...ringkas,
        boostTersedia: boost,
        batasPengajuan: ringkas.tersedia + boost,
      },
      jumlahAktif: daftar.filter((row) => row.layak).length,
      daftar,
    };
  },
});

/**
 * Sisir voucher apresiasi yang belum sempat terbit untuk pinjaman yang sudah
 * lunas milik pembaca sendiri.
 *
 * Penerbitan normal terjadi saat pinjaman ditutup, tetapi pinjaman lama bisa
 * tertinggal bila ditutup lewat jalur yang belum memanggil
 * `beriVoucherApresiasi` (mis. pelunasan yang dicocokkan admin) atau saat
 * aturan penerbitan masih terlalu ketat. Mutation ini menutup selisih itu
 * tanpa menyentuh akun lain; aman dipanggil berkali-kali karena penerbitan
 * dijaga idempoten oleh nomor referensi pinjaman.
 */
export const pastikanVoucherApresiasiSaya = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = butuhMasuk(await getAuthUserId(ctx));
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Akun tidak ditemukan.");
    if (user.role === ROLES.ADMIN) return { diterbitkan: 0 };

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let diterbitkan = 0;
    for (const loan of loans) {
      if (loan.status !== "lunas") continue;
      const id = await beriVoucherApresiasi(ctx, { loan, sekarang: Date.now() });
      if (id !== null) diterbitkan += 1;
    }
    return { diterbitkan };
  },
});

/**
 * Terbitkan voucher untuk satu akun — hanya Super Admin.
 *
 * Sengaja menerima `pemilikId`, bukan email: panel admin sudah memilih akun
 * dari daftar nasabah, dan id tidak bisa salah ketik menjadi akun lain.
 */
export const terbitkanVoucher = mutation({
  args: {
    pemilikId: v.id("users"),
    jenis: JENIS,
    judul: v.string(),
    nilai: v.number(),
    minPokok: v.number(),
    batasPemakaian: v.optional(v.number()),
    berlakuSampai: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const pemilik = await ctx.db.get(args.pemilikId);
    if (pemilik === null) throw new Error("Akun penerima voucher tidak ditemukan.");
    if (pemilik.role === ROLES.ADMIN) {
      throw new Error("Voucher tidak diterbitkan untuk akun admin.");
    }
    if (!Number.isSafeInteger(args.nilai) || args.nilai <= 0) {
      throw new Error("Nilai voucher harus rupiah bulat positif.");
    }
    if (!Number.isSafeInteger(args.minPokok) || args.minPokok < LOAN_LIMITS.minPokok) {
      throw new Error(
        `Minimal pengajuan voucher tidak boleh di bawah ${formatRupiah(LOAN_LIMITS.minPokok)}.`,
      );
    }
    const sekarang = Date.now();
    if (!Number.isSafeInteger(args.berlakuSampai) || args.berlakuSampai <= sekarang) {
      throw new Error("Masa berlaku voucher harus di masa depan.");
    }
    const batas = args.batasPemakaian ?? 1;
    if (!Number.isSafeInteger(batas) || batas <= 0 || batas > 10) {
      throw new Error("Batas pemakaian harus 1 sampai 10 kali.");
    }
    const judul = args.judul.trim();
    if (judul.length < 3 || judul.length > 80) {
      throw new Error("Judul voucher harus 3–80 karakter.");
    }

    const kode = `VCR-${String(sekarang).slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    const id = await ctx.db.insert("voucher", {
      kode,
      jenis: args.jenis,
      judul,
      nilai: args.nilai,
      minPokok: args.minPokok,
      batasPemakaian: batas,
      terpakai: 0,
      pemilikId: args.pemilikId,
      sumber: "admin",
      status: "aktif",
      berlakuSampai: args.berlakuSampai,
      dibuatPada: sekarang,
      dibuatOleh: userId,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "voucher_diterbitkan",
      kode,
      `${judul} · ${args.jenis} · ${formatRupiah(args.nilai)} · untuk ${pemilik.email ?? pemilik.name ?? pemilik._id}`,
    );
    return { id, kode };
  },
});

/**
 * Ambil dan periksa voucher yang dipilih untuk satu pengajuan.
 *
 * `tersedia` adalah plafon tersedia dari `ringkasPlafon` — angka server yang
 * sama dengan validasi pokok. Boost voucher ikut menaikkan batas pemeriksaan
 * minimal pengajuannya sendiri.
 */
export async function voucherUntukPengajuan(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    voucherId: Id<"voucher">;
    tersedia: Rupiah;
    skema: "harian" | "bulanan";
  },
): Promise<VoucherTerpilih> {
  const voucher = await ctx.db.get(args.voucherId);
  if (voucher === null || !milikPemilik(voucher, args.userId)) {
    throw new Error("Voucher tidak ditemukan pada akun Anda.");
  }
  if (voucher.jenis === "diskon_ujrah" || voucher.jenis === "diskon_margin") {
    throw new Error("Voucher akad syariah belum bisa dipakai untuk pinjaman konvensional.");
  }
  if (args.skema === "bulanan" && voucher.jenis === "diskon_admin") {
    throw new Error(
      "Voucher bebas biaya admin hanya berlaku untuk pinjaman harian. Gunakan voucher tambah limit.",
    );
  }

  const boost =
    voucher.jenis === "boost_plafon" ? (voucher.nilai as Rupiah) : (0 as Rupiah);
  const batas = (args.tersedia + boost) as Rupiah;
  const layak = kelayakanVoucher(voucher, {
    batasPengajuan: batas,
    sekarang: Date.now(),
  });
  if (!layak.layak) throw new Error(layak.alasan ?? "Voucher tidak bisa dipakai.");

  return { voucher, boost };
}

/** Tandai voucher terpakai — dipanggil setelah baris pinjaman tersimpan. */
export async function tandaiVoucherTerpakai(
  ctx: MutationCtx,
  args: { voucher: Doc<"voucher">; loanId: Id<"loans">; sekarang: number },
): Promise<void> {
  const terpakai = args.voucher.terpakai + 1;
  const habis = terpakai >= args.voucher.batasPemakaian;
  await ctx.db.patch(args.voucher._id, {
    terpakai,
    status: habis ? "terpakai" : "aktif",
    dipakaiPada: args.sekarang,
    dipakaiLoanId: args.loanId,
  });
}

/**
 * Potongan biaya admin yang benar-benar dipakai voucher ini.
 *
 * Dipisah supaya pemanggil menghitung `biayaAdmin` dari tarif yang berlaku,
 * bukan dari angka yang dikirim klien.
 */
export function hitungDiskonVoucher(
  voucher: Doc<"voucher"> | null,
  biayaAdmin: Rupiah,
): Rupiah {
  if (voucher === null) return 0 as Rupiah;
  return diskonBiayaAdmin(voucher, biayaAdmin);
}

/**
 * Voucher apresiasi untuk pinjaman yang sudah lunas.
 *
 * Terbit SEKALI per nomor referensi, untuk pinjaman yang benar-benar sampai
 * lunas, apa pun tanggal pelunasannya. Dua syarat lama dihapus karena membuat
 * voucher tidak pernah sampai ke nasabah:
 *  - dulu voucher hanya untuk pelunasan "tepat waktu", sehingga peminjam yang
 *    telat sehari tidak menerima apa pun walau utangnya sudah selesai;
 *  - dulu voucher menunggu promo banner aktif di Pengurus Promo. Banner itu
 *    materi kampanye, bukan syarat hadiah, jadi saat tidak ada kampanye seluruh
 *    penerbitan diam-diam berhenti.
 *
 * Nilainya tetap kecil (1% pokok, maksimum Rp25.000) dan hanya bisa dipakai
 * sebagai potongan biaya admin pinjaman berikutnya. Idempoten lewat
 * `referensi`: pelunasan yang dicatat ulang, verifikasi ganda, atau penyisiran
 * voucher tertunda tidak pernah menerbitkan dua voucher untuk pinjaman yang
 * sama.
 *
 * `PinjamanLunas` sengaja tipe sempit, bukan `Doc<"loans">`: jalur pelunasan
 * mengirim salinan baris yang statusnya baru diubah menjadi `lunas`.
 */
type PinjamanLunas = {
  userId: Id<"users">;
  status: string;
  nomorReferensi: string;
  pokokPinjaman: number;
  lunasPada?: number;
};

export async function beriVoucherApresiasi(
  ctx: MutationCtx,
  args: { loan: PinjamanLunas; sekarang: number },
): Promise<Id<"voucher"> | null> {
  const { loan } = args;
  if (loan.status !== "lunas") return null;
  if (!Number.isSafeInteger(loan.lunasPada) || (loan.lunasPada ?? 0) <= 0) return null;

  const sudah = await ctx.db
    .query("voucher")
    .withIndex("by_referensi", (q) => q.eq("referensi", loan.nomorReferensi))
    .first();
  if (sudah !== null) return null;

  const nilai = nilaiVoucherApresiasi(loan.pokokPinjaman);
  if (nilai <= 0) return null;

  const id = await ctx.db.insert("voucher", {
    kode: `APR-${loan.nomorReferensi}`,
    jenis: "diskon_admin",
    judul: "Voucher apresiasi pelunasan",
    nilai,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    terpakai: 0,
    pemilikId: loan.userId,
    sumber: "apresiasi",
    status: "aktif",
    berlakuSampai: args.sekarang + VOUCHER_APRESIASI_HARI * 86_400_000,
    dibuatPada: args.sekarang,
    referensi: loan.nomorReferensi,
  });
  await audit(
    ctx,
    loan.userId,
    "sistem",
    "voucher_apresiasi",
    loan.nomorReferensi,
    `Voucher bebas biaya admin ${formatRupiah(nilai)} terbit karena pinjaman sudah lunas.`,
  );
  return id;
}
