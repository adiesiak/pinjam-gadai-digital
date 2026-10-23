/**
 * Pengajuan akad syariah — Murabahah, Rahn, dan Qardh.
 *
 * Ini pintu PENGAJUAN, bukan pencairan. Peminjam memilih akad, nominal, dan
 * tenor; server menghitung rencana dengan `lib/syariah/akad` dan memeriksa
 * plafon yang sama dengan pinjaman konvensional. Admin lalu memutuskan:
 * menyetujui dengan angka final, atau menolak beserta alasannya.
 *
 * UANG TIDAK BERPINDAH DI SINI. Persetujuan hanya mencatat keputusan dan angka
 * akad. Pencatatan akad ke `akadSyariah` tetap lewat jalur yang ditutup
 * `rejectUnverifiedMoneyMovement`, sama seperti seluruh transaksi dana lain.
 * Karena itu tidak ada jurnal, tiket, atau saldo dompet yang disentuh modul ini.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { formatRupiah } from "../lib/money";
import {
  pesanPlafonTerlampaui,
  plafonPeminjam,
  ringkasPlafon,
  type RingkasanPlafon,
} from "../lib/plafon";
import {
  apakahTenorAkad,
  MARGIN_MURABAHAH_BAWAAN,
  rencanaPengajuanSyariah,
  TENOR_AKAD_OPTIONS,
  type PermintaanPengajuanSyariah,
} from "../lib/syariah/pengajuan";
import {
  nomorTujuanValid,
  rapikanNomorTujuan,
  type JenisBarangKatalog,
} from "../lib/syariah/katalog";
import { barangKatalogTersedia } from "./katalog";
import type { JenisAkadSyariah, RencanaAkadSyariah } from "../lib/syariah/akad";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { requireKycTerverifikasi } from "./kyc";
import { ROLES } from "./schema";
import { audit, getConfig } from "./system";
import { kodeTanggalWIB } from "../lib/waktu";

/** Batas baris yang dikirim ke klien. */
const BATAS_BARIS = 200;

const jenisAkadValidator = v.union(
  v.literal("murabahah"),
  v.literal("rahn"),
  v.literal("qardh"),
);

function nomorPengajuan(now: number): string {
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `PSY-${kodeTanggalWIB(now)}-${suffix}`;
}

/** Satu baris pengajuan yang aman dikirim ke pemiliknya. */
export type BarisPengajuanSyariah = {
  _id: Id<"pengajuanSyariah">;
  nomorReferensi: string;
  jenis: JenisAkadSyariah;
  status: "diajukan" | "disetujui" | "ditolak" | "dibatalkan";
  namaPeminjam: string;
  pokok: number;
  tenorHari: number;
  tujuan: string;
  catatan: string | null;
  namaBarang: string | null;
  /** Id barang katalog Murabahah; null bila barang ditulis sendiri. */
  katalogId: string | null;
  jenisBarang: JenisBarangKatalog | null;
  /** Nomor HP / ID meter tujuan untuk pulsa/PPOB. */
  nomorTujuan: string | null;
  /** "belum" hanya bermakna setelah disetujui; null sebelum keputusan. */
  statusPenyerahan: "belum" | "terkirim" | null;
  diserahkanPada: number | null;
  referensiPenyerahan: string | null;
  nilaiTaksiran: number | null;
  marginPersen: number | null;
  marginTotal: number;
  hargaJual: number | null;
  ujrahPerSiklus: number | null;
  jumlahSiklus: number | null;
  totalKewajiban: number;
  nisbahPendana: number;
  nisbahPlatform: number;
  dibuatPada: number;
  diputuskanPada: number | null;
  alasanTolak: string | null;
  /** Nomor akad yang tercatat dari pengajuan ini; null sebelum akad. */
  akadNomor: string | null;
};

function keBaris(row: Doc<"pengajuanSyariah">): BarisPengajuanSyariah {
  return {
    _id: row._id,
    nomorReferensi: row.nomorReferensi,
    jenis: row.jenis,
    status: row.status,
    namaPeminjam: row.namaPeminjam,
    pokok: row.pokok,
    tenorHari: row.tenorHari,
    tujuan: row.tujuan,
    catatan: row.catatan ?? null,
    namaBarang: row.namaBarang ?? null,
    katalogId: row.katalogId ?? null,
    jenisBarang: row.jenisBarang ?? null,
    nomorTujuan: row.nomorTujuan ?? null,
    statusPenyerahan:
      row.statusPenyerahan ?? (row.status === "disetujui" ? "belum" : null),
    diserahkanPada: row.diserahkanPada ?? null,
    referensiPenyerahan: row.referensiPenyerahan ?? null,
    nilaiTaksiran: row.nilaiTaksiran ?? null,
    marginPersen: row.marginPersen ?? null,
    marginTotal: row.marginTotal,
    hargaJual: row.hargaJual ?? null,
    ujrahPerSiklus: row.ujrahPerSiklus ?? null,
    jumlahSiklus: row.jumlahSiklus ?? null,
    totalKewajiban: row.totalKewajiban,
    nisbahPendana: row.nisbahPendana,
    nisbahPlatform: row.nisbahPlatform,
    dibuatPada: row.dibuatPada,
    diputuskanPada: row.diputuskanPada ?? null,
    alasanTolak: row.alasanTolak ?? null,
    akadNomor: row.akadNomor ?? null,
  };
}

/** Akad aktif dalam bentuk yang bisa dijumlahkan `ringkasPlafon`. */
export async function eksposurAkadAktif(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{ status: string; pokokPinjaman: number }[]> {
  const akad = await ctx.db
    .query("akadSyariah")
    .withIndex("by_peminjam", (q) => q.eq("peminjamId", userId))
    .collect();
  return akad
    .filter((row) => row.status === "aktif")
    .map((row) => ({ status: "didanai", pokokPinjaman: row.pokok }));
}

/**
 * Plafon tersedia dengan akad syariah AKTIF ikut menahan limit.
 *
 * Pinjaman dan akad memakai satu plafon: tanpa ini, nasabah bisa memakai seluruh
 * limit di pinjaman konvensional lalu mengajukan akad syariah dengan nominal
 * penuh lagi. Pengajuan yang belum disetujui tidak menahan limit — aturan yang
 * sama dengan pinjaman yang belum cair.
 */
export async function plafonDenganAkadSyariah(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<RingkasanPlafon> {
  const [maksimal, pinjaman, eksposurAkad] = await Promise.all([
    plafonPeminjam(ctx, userId),
    ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    eksposurAkadAktif(ctx, userId),
  ]);
  return ringkasPlafon(maksimal, [...pinjaman, ...eksposurAkad]);
}

/** Peminjam yang sudah masuk, bukan akun tamu, dan bukan admin. */
async function requirePeminjamSyariah(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengajukan akad.",
    );
  }
  if (user.role === ROLES.ADMIN) {
    throw new Error("Akun admin tidak dapat mengajukan akad syariah.");
  }
  return { userId, user };
}

async function namaPeminjam(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const [user, kyc] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
  ]);
  const nama =
    kyc?.namaLengkap?.trim() || user?.name?.trim() || user?.email?.trim() || "Peminjam";
  return nama.slice(0, 120);
}

/** Daftar pengajuan milik pembaca, terbaru lebih dulu. */
export const daftarSaya = query({
  args: {},
  handler: async (ctx): Promise<BarisPengajuanSyariah[]> => {
    const { userId } = await requirePeminjamSyariah(ctx);
    const rows = await ctx.db
      .query("pengajuanSyariah")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(BATAS_BARIS);
    return rows.map(keBaris);
  },
});

/**
 * Kirim satu pengajuan akad.
 *
 * Urutan: gerbang KYC → kill switch → satu pengajuan aktif → rencana akad →
 * plafon. Rencana dihitung SEBELUM plafon diperiksa karena nominal dan tenor
 * yang tidak sah tidak perlu menyentuh data pinjaman.
 */
export const ajukan = mutation({
  args: {
    jenis: jenisAkadValidator,
    pokok: v.number(),
    tenorHari: v.number(),
    tujuan: v.string(),
    catatan: v.optional(v.string()),
    namaBarang: v.optional(v.string()),
    /** Barang katalog Murabahah; harga & nama diambil server dari katalog. */
    katalogId: v.optional(v.string()),
    /** Wajib untuk barang katalog digital (pulsa/PPOB). */
    nomorTujuan: v.optional(v.string()),
    nilaiTaksiran: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ id: Id<"pengajuanSyariah">; nomorReferensi: string }> => {
    const { userId, user } = await requirePeminjamSyariah(ctx);
    await requireKycTerverifikasi(ctx, userId);

    const sys = await getConfig(ctx);
    if (sys.killSwitch) {
      throw new Error(
        "Pengajuan sementara dihentikan oleh sistem (kill switch aktif). Coba lagi nanti.",
      );
    }

    const menunggu = await ctx.db
      .query("pengajuanSyariah")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (menunggu.some((row) => row.status === "diajukan")) {
      throw new Error(
        "Masih ada pengajuan syariah yang menunggu keputusan. Tunggu hasilnya sebelum mengajukan akad baru.",
      );
    }

    const tujuan = args.tujuan.trim();
    if (tujuan.length < 5 || tujuan.length > 300) {
      throw new Error("Tujuan pembiayaan harus 5-300 karakter.");
    }
    const catatan = args.catatan?.trim() ?? "";
    if (catatan.length > 500) {
      throw new Error("Catatan pengajuan maksimal 500 karakter.");
    }
    // Barang katalog: harga pokok dan nama diambil dari katalog, bukan dari
    // kiriman klien. Bila katalog berubah antara halaman dimuat dan pengajuan
    // dikirim, yang dicatat adalah harga katalog yang berlaku saat ini.
    const barang =
      args.katalogId === undefined
        ? null
        : await barangKatalogTersedia(ctx, args.katalogId);
    if (barang !== null && args.jenis !== "murabahah") {
      throw new Error("Katalog barang hanya berlaku untuk akad Murabahah.");
    }
    const pokok = barang?.harga ?? args.pokok;

    const namaBarang = barang?.nama ?? args.namaBarang?.trim() ?? "";
    if (args.jenis !== "qardh" && (namaBarang.length < 3 || namaBarang.length > 160)) {
      throw new Error(
        args.jenis === "rahn"
          ? "Barang jaminan harus 3-160 karakter."
          : "Barang yang dibiayai harus 3-160 karakter.",
      );
    }

    let nomorTujuan = "";
    if (barang?.jenisBarang === "digital") {
      const angka = rapikanNomorTujuan(args.nomorTujuan ?? "");
      if (!nomorTujuanValid(angka)) {
        throw new Error(
          "Nomor tujuan pulsa/PPOB wajib diisi 6-20 angka. Periksa kembali nomor HP atau ID meter Anda.",
        );
      }
      nomorTujuan = angka;
    }

    const permintaan: PermintaanPengajuanSyariah = {
      jenis: args.jenis,
      pokok,
      tenorHari: args.tenorHari,
      ...(args.nilaiTaksiran === undefined
        ? {}
        : { nilaiTaksiran: args.nilaiTaksiran }),
    };
    const rencana: RencanaAkadSyariah = rencanaPengajuanSyariah(permintaan);

    const ringkas = await plafonDenganAkadSyariah(ctx, userId);
    if (rencana.pokok > ringkas.tersedia) {
      throw new Error(
        ringkas.terpakai > 0
          ? `Plafon Anda ${formatRupiah(ringkas.maksimal)}, dan ${formatRupiah(ringkas.terpakai)} sedang dipakai pinjaman atau akad berjalan — sisa yang dapat diajukan ${formatRupiah(ringkas.tersedia)}.`
          : pesanPlafonTerlampaui(ringkas.maksimal),
      );
    }

    const now = Date.now();
    const nomorReferensi = nomorPengajuan(now);
    const id = await ctx.db.insert("pengajuanSyariah", {
      userId,
      nomorReferensi,
      jenis: rencana.jenis,
      status: "diajukan",
      namaPeminjam: await namaPeminjam(ctx, userId),
      pokok: rencana.pokok,
      tenorHari: rencana.tenorHari,
      tujuan,
      ...(catatan === "" ? {} : { catatan }),
      ...(namaBarang === "" ? {} : { namaBarang }),
      ...(barang === null
        ? {}
        : { katalogId: barang.kode, jenisBarang: barang.jenisBarang }),
      ...(nomorTujuan === "" ? {} : { nomorTujuan }),
      ...(rencana.nilaiTaksiran === null
        ? {}
        : { nilaiTaksiran: rencana.nilaiTaksiran }),
      ...(rencana.jenis === "murabahah"
        ? { marginPersen: MARGIN_MURABAHAH_BAWAAN }
        : {}),
      marginTotal: rencana.marginTotal,
      ...(rencana.hargaJual === null ? {} : { hargaJual: rencana.hargaJual }),
      ...(rencana.ujrahPerSiklus === null
        ? {}
        : { ujrahPerSiklus: rencana.ujrahPerSiklus }),
      ...(rencana.jumlahSiklus === null
        ? {}
        : { jumlahSiklus: rencana.jumlahSiklus }),
      totalKewajiban: rencana.totalKewajiban,
      nisbahPendana: rencana.nisbahPendana,
      nisbahPlatform: rencana.nisbahPlatform,
      dibuatPada: now,
    });

    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "peminjam",
      "pengajuan_syariah",
      nomorReferensi,
      `Pengajuan ${rencana.jenis} ${formatRupiah(rencana.pokok)}${namaBarang === "" ? "" : ` · ${namaBarang}`} · tenor ${rencana.tenorHari} hari.`,
    );

    return { id, nomorReferensi };
  },
});

/** Peminjam menarik pengajuannya selama belum diputuskan. */
export const batalkan = mutation({
  args: { id: v.id("pengajuanSyariah") },
  handler: async (ctx, { id }): Promise<{ nomorReferensi: string }> => {
    const { userId, user } = await requirePeminjamSyariah(ctx);
    const row = await ctx.db.get(id);
    if (row === null || row.userId !== userId) {
      throw new Error("Pengajuan syariah tidak ditemukan pada akun Anda.");
    }
    if (row.status !== "diajukan") {
      throw new Error("Hanya pengajuan yang belum diputuskan yang dapat dibatalkan.");
    }
    await ctx.db.patch(id, { status: "dibatalkan", diputuskanPada: Date.now() });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "peminjam",
      "pengajuan_syariah_dibatalkan",
      row.nomorReferensi,
      "Peminjam menarik pengajuan sebelum keputusan admin.",
    );
    return { nomorReferensi: row.nomorReferensi };
  },
});

/**
 * Catat penyerahan barang atas pengajuan yang sudah disetujui.
 *
 * Tidak ada dana yang berpindah: ini hanya jejak bahwa mitra sudah mengirim
 * barang/jasa, dengan referensi yang bisa dicocokkan peminjam. Sekali dicatat,
 * tanda tidak bisa ditimpa — koreksi dilakukan lewat catatan baru di audit,
 * supaya riwayat penyerahan tidak bisa dihapus diam-diam.
 */
export const tandaiPenyerahan = mutation({
  args: {
    id: v.id("pengajuanSyariah"),
    referensi: v.string(),
  },
  handler: async (ctx, args): Promise<{ nomorReferensi: string }> => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Pengajuan syariah tidak ditemukan.");
    if (row.status !== "disetujui") {
      throw new Error(
        "Penyerahan hanya dicatat untuk pengajuan yang sudah disetujui.",
      );
    }
    if (row.statusPenyerahan === "terkirim") {
      throw new Error("Barang pada pengajuan ini sudah ditandai terkirim.");
    }
    if (row.namaBarang === undefined || row.namaBarang.trim() === "") {
      throw new Error("Pengajuan ini tidak menyebut barang yang diserahkan.");
    }
    const referensi = args.referensi.trim();
    if (referensi.length < 3 || referensi.length > 120) {
      throw new Error(
        "Referensi penyerahan harus 3-120 karakter (nomor resi, ID transaksi, atau nomor token).",
      );
    }

    await ctx.db.patch(args.id, {
      statusPenyerahan: "terkirim",
      diserahkanPada: Date.now(),
      referensiPenyerahan: referensi,
      diserahkanOlehLabel: admin.email ?? admin.name ?? "admin",
    });
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "pengajuan_syariah_diserahkan",
      row.nomorReferensi,
      `${row.namaBarang} · referensi ${referensi}`,
    );
    return { nomorReferensi: row.nomorReferensi };
  },
});

/** Satu baris pengajuan untuk panel admin, termasuk identitas pemohon. */
export type BarisPengajuanSyariahAdmin = BarisPengajuanSyariah & {
  emailPeminjam: string | null;
};

/** Antrean pengajuan syariah untuk admin. */
export const daftarAdmin = query({
  args: {},
  handler: async (ctx): Promise<BarisPengajuanSyariahAdmin[]> => {
    await requireAdminSession(ctx);
    const rows = await ctx.db
      .query("pengajuanSyariah")
      .order("desc")
      .take(BATAS_BARIS);

    const emailCache = new Map<Id<"users">, string | null>();
    async function email(id: Id<"users">): Promise<string | null> {
      const cached = emailCache.get(id);
      if (cached !== undefined) return cached;
      const user = await ctx.db.get(id);
      const nilai = user?.email ?? null;
      emailCache.set(id, nilai);
      return nilai;
    }

    return Promise.all(
      rows.map(async (row) => ({
        ...keBaris(row),
        emailPeminjam: await email(row.userId),
      })),
    );
  },
});

/**
 * Keputusan admin atas satu pengajuan.
 *
 * Setujui: angka final (pokok, tenor, margin Murabahah, taksiran Rahn)
 * dihitung ulang dengan mesin akad, lalu disimpan pada baris pengajuan. Tidak
 * ada akad, jurnal, atau perpindahan dana yang dibuat di sini.
 * Tolak: alasan wajib, karena keputusan tanpa sebab tidak bisa diaudit.
 */
export const putuskan = mutation({
  args: {
    id: v.id("pengajuanSyariah"),
    keputusan: v.union(v.literal("setujui"), v.literal("tolak")),
    pokok: v.optional(v.number()),
    tenorHari: v.optional(v.number()),
    marginPersen: v.optional(v.number()),
    nilaiTaksiran: v.optional(v.number()),
    alasanTolak: v.optional(v.string()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Pengajuan syariah tidak ditemukan.");
    if (row.status !== "diajukan") {
      throw new Error("Pengajuan ini sudah diputuskan.");
    }

    const now = Date.now();
    const catatan = args.catatan?.trim() ?? "";
    if (catatan.length > 500) {
      throw new Error("Catatan keputusan maksimal 500 karakter.");
    }

    if (args.keputusan === "tolak") {
      const alasan = args.alasanTolak?.trim() ?? "";
      if (alasan.length < 5) {
        throw new Error("Alasan penolakan minimal 5 karakter.");
      }
      await ctx.db.patch(args.id, {
        status: "ditolak",
        alasanTolak: alasan,
        ...(catatan === "" ? {} : { catatan }),
        diputuskanPada: now,
        diputuskanOleh: adminId,
      });
      await audit(
        ctx,
        adminId,
        admin.email ?? admin.name ?? "admin",
        "pengajuan_syariah_ditolak",
        row.nomorReferensi,
        alasan,
      );
      return { nomorReferensi: row.nomorReferensi };
    }

    const tenorHari = args.tenorHari ?? row.tenorHari;
    if (!apakahTenorAkad(tenorHari)) {
      throw new Error(`Tenor akad harus ${TENOR_AKAD_OPTIONS.join(" / ")} hari.`);
    }
    // Murabahah atas barang katalog memakai harga SNAPSHOT saat pengajuan
    // dikirim: harga katalog bisa berubah sesudahnya, tetapi harga pokok barang
    // yang sudah disepakati tidak boleh ikut bergerak.
    const rencana = rencanaPengajuanSyariah({
      jenis: row.jenis,
      pokok:
        row.katalogId !== undefined ? row.pokok : args.pokok ?? row.pokok,
      tenorHari,
      ...(row.jenis === "murabahah"
        ? { marginPersen: args.marginPersen ?? row.marginPersen ?? undefined }
        : {}),
      ...(row.jenis === "rahn"
        ? { nilaiTaksiran: args.nilaiTaksiran ?? row.nilaiTaksiran ?? undefined }
        : {}),
    });

    const ringkas = await plafonDenganAkadSyariah(ctx, row.userId);
    if (rencana.pokok > ringkas.tersedia) {
      throw new Error(
        `Nominal yang disetujui melebihi plafon tersedia ${formatRupiah(ringkas.tersedia)}. Turunkan nominal, atau tolak pengajuan ini.`,
      );
    }

    await ctx.db.patch(args.id, {
      status: "disetujui",
      pokok: rencana.pokok,
      tenorHari: rencana.tenorHari,
      marginTotal: rencana.marginTotal,
      ...(rencana.jenis === "murabahah"
        ? { marginPersen: args.marginPersen ?? row.marginPersen ?? MARGIN_MURABAHAH_BAWAAN }
        : {}),
      ...(rencana.hargaJual === null ? {} : { hargaJual: rencana.hargaJual }),
      ...(rencana.nilaiTaksiran === null
        ? {}
        : { nilaiTaksiran: rencana.nilaiTaksiran }),
      ...(rencana.ujrahPerSiklus === null
        ? {}
        : { ujrahPerSiklus: rencana.ujrahPerSiklus }),
      ...(rencana.jumlahSiklus === null
        ? {}
        : { jumlahSiklus: rencana.jumlahSiklus }),
      totalKewajiban: rencana.totalKewajiban,
      nisbahPendana: rencana.nisbahPendana,
      nisbahPlatform: rencana.nisbahPlatform,
      ...(catatan === "" ? {} : { catatan }),
      diputuskanPada: now,
      diputuskanOleh: adminId,
    });
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "pengajuan_syariah_disetujui",
      row.nomorReferensi,
      `${rencana.jenis} ${formatRupiah(rencana.pokok)} · tenor ${rencana.tenorHari} hari · total kewajiban ${formatRupiah(rencana.totalKewajiban)}.`,
    );
    return { nomorReferensi: row.nomorReferensi };
  },
});
