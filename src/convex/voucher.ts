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
 * pakai, dan langsung hangus saat pengajuan tersimpan. `diskon_bunga` (poin
 * persen) dan `tambah_tenor` (hari) hanya untuk skema harian; keduanya dibaca
 * `loans.createLoanApplication` dan dibekukan sebagai snapshot pinjaman.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  boostTersedia as hitungBoostTersedia,
  diskonBiayaAdmin,
  JENIS_VOUCHER,
  kelayakanVoucher,
  labelNilaiVoucher,
  LABEL_STATUS_VOUCHER,
  nilaiVoucherApresiasi,
  periksaNilaiVoucher,
  periksaUbahVoucher,
  ringkasVoucherAdmin,
  statusTampilVoucher,
  VOUCHER_APRESIASI_HARI,
  type JenisVoucher,
  type VoucherRingkas,
} from "../lib/voucher";
import { LOAN_LIMITS } from "../lib/loan";
import { formatRupiah, type Rupiah } from "../lib/money";
import { plafonPeminjam, ringkasPlafon } from "../lib/plafon";
import { formatTanggalWIB } from "../lib/waktu";
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
  v.literal("diskon_bunga"),
  v.literal("tambah_tenor"),
);

/** Batas baris yang dikirim ke satu nasabah. */
const BATAS_BARIS = 50;

/**
 * Batas baris yang dibaca panel admin dalam satu muat.
 *
 * Panel ini menampilkan voucher terbaru, bukan seluruh arsip: 500 baris cukup
 * untuk beberapa tahun penerbitan dan menjaga biaya query tetap datar. Bila
 * batas ini tercapai, panel menyebutkan bahwa angkanya dihitung dari baris
 * terbaru — bukan diam-diam melaporkan angka yang tampak lengkap.
 */
const BATAS_ADMIN = 500;

/** Baris yang dikirim ke layar sekaligus; sisanya bisa dicari lewat kolom cari. */
const BATAS_TAMPIL_ADMIN = 100;

const SARINGAN_STATUS_ADMIN = ["semua", "aktif", "terpakai", "dicabut", "kedaluwarsa"] as const;
type SaringanStatusAdmin = (typeof SARINGAN_STATUS_ADMIN)[number];

/** Nilai saringan yang tidak dikenal jatuh ke "semua", bukan ke daftar kosong. */
function saringanStatusAdmin(teks: string | undefined): SaringanStatusAdmin {
  const bersih = (teks ?? "semua").trim().toLowerCase();
  return SARINGAN_STATUS_ADMIN.find((nilai) => nilai === bersih) ?? "semua";
}

/**
 * Daftar voucher untuk panel admin, lengkap dengan pemilik dan hitungan.
 *
 * Hanya Super Admin ber-TOTP. Voucher yang masa berlakunya lewat tetap
 * berstatus `aktif` di basis data; panel membaca `statusTampil` supaya yang
 * sudah tidak bisa dipakai nasabah tidak terlihat seperti voucher hidup.
 */
export const daftarVoucherAdmin = query({
  args: {
    cari: v.optional(v.string()),
    status: v.optional(v.string()),
    jenis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const saringan = saringanStatusAdmin(args.status);
    const jenisFilter =
      JENIS_VOUCHER.find((nilai) => nilai === (args.jenis ?? "").trim().toLowerCase()) ??
      null;
    const kueri = (args.cari ?? "").trim().toLowerCase();

    const semua = await ctx.db
      .query("voucher")
      .withIndex("by_dibuatPada")
      .order("desc")
      .take(BATAS_ADMIN);

    // Pemilik dibaca sekali per akun unik, bukan sekali per voucher.
    const idPemilik = [...new Set(semua.map((row) => row.pemilikId as string))];
    const akun = await Promise.all(idPemilik.map((id) => ctx.db.get(id as Id<"users">)));
    const pemilikPer = new Map(idPemilik.map((id, i) => [id, akun[i]]));

    const baris = semua.map((row) => {
      const pemilik = pemilikPer.get(row.pemilikId as string) ?? null;
      return {
        row,
        statusTampil: statusTampilVoucher(row, sekarang),
        pemilik: {
          userId: row.pemilikId,
          nama: pemilik?.name?.trim() || pemilik?.email || "Tanpa nama",
          email: pemilik?.email ?? null,
          kodePeminjam: pemilik?.kodePeminjam ?? null,
        },
      };
    });

    const cocok = baris.filter(({ row, statusTampil, pemilik }) => {
      if (saringan !== "semua" && statusTampil !== saringan) return false;
      if (jenisFilter !== null && row.jenis !== jenisFilter) return false;
      if (kueri === "") return true;
      return [
        row.kode,
        row.judul,
        row.referensi ?? "",
        pemilik.nama,
        pemilik.email ?? "",
        pemilik.kodePeminjam ?? "",
      ].some((teks) => teks.toLowerCase().includes(kueri));
    });

    return {
      sekarang,
      ringkas: ringkasVoucherAdmin(semua, sekarang),
      /** Baris yang cocok dengan saringan — bisa lebih dari yang dikirim. */
      total: cocok.length,
      /** true bila arsip di luar `BATAS_ADMIN` tidak ikut dibaca. */
      dibatasi: semua.length === BATAS_ADMIN,
      item: cocok.slice(0, BATAS_TAMPIL_ADMIN).map(({ row, statusTampil, pemilik }) => ({
        id: row._id,
        kode: row.kode,
        jenis: row.jenis as JenisVoucher,
        judul: row.judul,
        nilai: row.nilai,
        minPokok: row.minPokok,
        batasPemakaian: row.batasPemakaian,
        terpakai: row.terpakai,
        status: row.status,
        statusTampil,
        berlakuSampai: row.berlakuSampai,
        dibuatPada: row.dibuatPada,
        sumber: row.sumber,
        referensi: row.referensi ?? null,
        pemilik,
      })),
    };
  },
});

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
 * Sunting voucher yang belum hangus — hanya Super Admin.
 *
 * Yang boleh diubah hanya judul, sisa kuota, dan masa berlaku. Jenis, nilai,
 * pemilik, dan minimal pokok sengaja dikunci: angka itu sudah terbaca nasabah
 * dan bisa sudah tercatat pada pengajuan. Kuota tidak boleh diturunkan di bawah
 * pemakaian yang sudah terjadi, karena itu akan membuat voucher "minus" yang
 * tidak bisa dijelaskan ke pemakainya.
 */
export const ubahVoucher = mutation({
  args: {
    voucherId: v.id("voucher"),
    judul: v.optional(v.string()),
    batasPemakaian: v.optional(v.number()),
    berlakuSampai: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const voucher = await ctx.db.get(args.voucherId);
    if (voucher === null) throw new Error("Voucher tidak ditemukan.");
    if (voucher.status !== "aktif") {
      throw new Error(
        `Voucher ini berstatus ${LABEL_STATUS_VOUCHER[voucher.status].toLowerCase()} dan tidak bisa disunting.`,
      );
    }

    const galat = periksaUbahVoucher({
      judul: args.judul,
      batasPemakaian: args.batasPemakaian,
      berlakuSampai: args.berlakuSampai,
      terpakai: voucher.terpakai,
      sekarang: Date.now(),
    });
    if (galat !== null) throw new Error(galat);

    const patch: {
      judul?: string;
      batasPemakaian?: number;
      berlakuSampai?: number;
    } = {};
    const perubahan: string[] = [];
    if (args.judul !== undefined) {
      const judul = args.judul.trim();
      if (judul !== voucher.judul) {
        patch.judul = judul;
        perubahan.push(`judul "${voucher.judul}" → "${judul}"`);
      }
    }
    if (args.batasPemakaian !== undefined && args.batasPemakaian !== voucher.batasPemakaian) {
      patch.batasPemakaian = args.batasPemakaian;
      perubahan.push(`kuota ${voucher.batasPemakaian} → ${args.batasPemakaian} kali`);
    }
    if (args.berlakuSampai !== undefined && args.berlakuSampai !== voucher.berlakuSampai) {
      patch.berlakuSampai = args.berlakuSampai;
      perubahan.push(
        `berlaku sampai ${formatTanggalWIB(voucher.berlakuSampai)} → ${formatTanggalWIB(args.berlakuSampai)}`,
      );
    }
    if (perubahan.length === 0) return { ok: true, perubahan: 0 };

    await ctx.db.patch(voucher._id, patch);
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "voucher_diubah",
      voucher.kode,
      `${voucher.judul} · ${labelNilaiVoucher(voucher.jenis, voucher.nilai)} · ${perubahan.join("; ")}`,
    );
    return { ok: true, perubahan: perubahan.length };
  },
});

/**
 * Cabut voucher aktif — hanya Super Admin, wajib beralasan.
 *
 * Pencabutan tidak menghapus baris: kode voucher yang sudah beredar harus tetap
 * bisa ditelusuri di riwayat pemakaian dan audit. Voucher yang sudah habis atau
 * sudah dicabut tidak bisa dicabut lagi, supaya tidak ada dua catatan alasan
 * untuk satu voucher.
 */
export const cabutVoucher = mutation({
  args: { voucherId: v.id("voucher"), alasan: v.string() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const voucher = await ctx.db.get(args.voucherId);
    if (voucher === null) throw new Error("Voucher tidak ditemukan.");
    if (voucher.status !== "aktif") {
      throw new Error(
        `Voucher ini sudah ${LABEL_STATUS_VOUCHER[voucher.status].toLowerCase()} sehingga tidak perlu dicabut.`,
      );
    }
    const alasan = args.alasan.trim();
    if (alasan.length < 3 || alasan.length > 200) {
      throw new Error("Alasan pencabutan harus 3–200 karakter.");
    }

    await ctx.db.patch(voucher._id, { status: "dicabut" });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "voucher_dicabut",
      voucher.kode,
      `${voucher.judul} · ${labelNilaiVoucher(voucher.jenis, voucher.nilai)} · ${alasan}`,
    );
    return { ok: true, kode: voucher.kode };
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
    // Satuan `nilai` bergantung pada jenis: rupiah untuk potongan biaya/limit,
    // poin persen untuk potongan bunga, dan hari untuk tambah tenor.
    const nilaiGalat = periksaNilaiVoucher(args.jenis, args.nilai);
    if (nilaiGalat !== null) throw new Error(nilaiGalat);
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
      `${judul} · ${args.jenis} · ${labelNilaiVoucher(args.jenis, args.nilai)} · untuk ${pemilik.email ?? pemilik.name ?? pemilik._id}`,
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
  if (
    args.skema === "bulanan" &&
    (voucher.jenis === "diskon_admin" ||
      voucher.jenis === "diskon_bunga" ||
      voucher.jenis === "tambah_tenor")
  ) {
    throw new Error(
      "Voucher bebas biaya admin, potongan bunga, dan tambah tenor hanya berlaku untuk pinjaman harian. Gunakan voucher tambah limit.",
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
