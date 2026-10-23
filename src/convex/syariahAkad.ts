/**
 * Pencatatan akad syariah — Murabahah, Rahn, dan Qardh.
 *
 * Fase 1 membuka PENCATATAN, bukan pengajuan daring: akad disepakati di luar
 * sistem, lalu admin mencatatnya atas nama satu penyedia dana. Peminjam tidak
 * perlu punya akun; namanya disimpan sebagai teks, sama seperti pencatatan
 * manual pinjaman.
 *
 * Seluruh angka dihitung `lib/syariah/akad` — tidak ada rumus margin/ujrah di
 * file ini. Mutation di sini hanya memeriksa kewenangan, saldo dompet, lalu
 * menulis baris dan jurnal.
 *
 * UANG TETAP DITUTUP. Setiap mutation yang mengubah posisi dana memanggil
 * `rejectUnverifiedMoneyMovement()` lebih dulu, sama seperti alur pinjaman,
 * gadai, dan kredit. Pencatatan akad tidak boleh menjadi pintu belakang untuk
 * memindahkan saldo sebelum penyedia pembayaran dipilih dan diuji.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { batalkanTiketReferensi, beriTiketPendanaan } from "./doorprize";
import { akunDompetDana, appendJournal, danaWalletBalance } from "./ledger";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";
import { namaTampilPendana, peranPenyedia } from "./penyediaDana";
import { ROLES } from "./schema";
import { getConfig } from "./system";
import { kodeTanggalWIB } from "../lib/waktu";
import {
  jurnalPelunasanSyariah,
  jurnalPembatalanSyariah,
  jurnalPenempatanSyariah,
  rencanaAkadSyariah,
  type JenisAkadSyariah,
  type RencanaAkadSyariah,
} from "../lib/syariah/akad";
import { dataPencatatanDariPengajuan } from "../lib/syariah/pencatatan";

/** Batas jumlah baris portofolio yang dikirim ke satu pembaca. */
const BATAS_BARIS = 200;

const jenisAkadValidator = v.union(
  v.literal("murabahah"),
  v.literal("rahn"),
  v.literal("qardh"),
);

/** Nomor referensi akad: `SYR-YYYYMMDD-XXXX` menurut kalender WIB. */
function nomorAkad(now: number): string {
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `SYR-${kodeTanggalWIB(now)}-${suffix}`;
}

/** Satu baris portofolio akad yang aman dikirim ke klien. */
export type BarisAkadSyariah = {
  _id: Id<"akadSyariah">;
  jenis: JenisAkadSyariah;
  nomorReferensi: string;
  peminjamNama: string;
  pendanaNama: string;
  pokok: number;
  tenorHari: number;
  totalKewajiban: number;
  nisbahPendana: number;
  nisbahPlatform: number;
  pendanaTerima: number;
  tiketDoorprize: number;
  status: string;
  jatuhTempoPada: number;
  dibuatPada: number;
  selesaiPada: number | null;
};

export type RingkasanAkadSyariah = {
  jumlahAktif: number;
  jumlahSelesai: number;
  totalPokok: number;
  totalNisbah: number;
  proyeksiReturnTerdekat: number | null;
};

function ringkas(baris: BarisAkadSyariah[]): RingkasanAkadSyariah {
  const aktif = baris.filter((b) => b.status === "aktif");
  const selesai = baris.filter((b) => b.status === "selesai");
  return {
    jumlahAktif: aktif.length,
    jumlahSelesai: selesai.length,
    totalPokok: [...aktif, ...selesai].reduce((total, b) => total + b.pokok, 0),
    totalNisbah: [...aktif, ...selesai].reduce(
      (total, b) => total + b.nisbahPendana,
      0,
    ),
    proyeksiReturnTerdekat:
      aktif.length === 0
        ? null
        : Math.min(...aktif.map((b) => b.jatuhTempoPada)),
  };
}

/**
 * Portofolio akad syariah pembaca.
 *
 * Akun penyedia dana hanya menerima akad ATAS NAMANYA. Admin menerima seluruh
 * akad untuk keperluan dukungan, tetapi tetap lewat whitelist yang sama.
 */
export const portofolioSaya = query({
  args: {},
  handler: async (ctx): Promise<{
    baris: BarisAkadSyariah[];
    ringkasan: RingkasanAkadSyariah;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Akun tidak ditemukan.");

    const admin = user.role === ROLES.ADMIN;
    if (!admin && !peranPenyedia(user.role as string | undefined)) {
      throw new Error("Portofolio syariah hanya untuk akun penyedia dana.");
    }

    const rows = admin
      ? await ctx.db.query("akadSyariah").order("desc").take(BATAS_BARIS)
      : await ctx.db
          .query("akadSyariah")
          .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
          .order("desc")
          .take(BATAS_BARIS);

    const namaCache = new Map<Id<"users">, string>();
    async function namaPendana(id: Id<"users">): Promise<string> {
      const cached = namaCache.get(id);
      if (cached !== undefined) return cached;
      const pendana = await ctx.db.get(id);
      const nama = namaTampilPendana(pendana?.name, pendana?.email);
      namaCache.set(id, nama);
      return nama;
    }

    const baris: BarisAkadSyariah[] = [];
    for (const row of rows) {
      baris.push({
        _id: row._id,
        jenis: row.jenis,
        nomorReferensi: row.nomorReferensi,
        peminjamNama: row.peminjamNama,
        pendanaNama: await namaPendana(row.pendanaId),
        pokok: row.pokok,
        tenorHari: row.tenorHari,
        totalKewajiban: row.totalKewajiban,
        nisbahPendana: row.nisbahPendana,
        nisbahPlatform: row.nisbahPlatform,
        pendanaTerima: row.pendanaTerima,
        tiketDoorprize: row.tiketDoorprize ?? 0,
        status: row.status,
        jatuhTempoPada: row.jatuhTempoPada,
        dibuatPada: row.dibuatPada,
        selesaiPada: row.selesaiPada ?? null,
      });
    }

    return { baris, ringkasan: ringkas(baris) };
  },
});

/**
 * Proyeksi nisbah dari akad syariah yang MASIH BERJALAN milik pembaca.
 *
 * Kartu ringkasan di ruang penyedia dana hanya perlu dua angka: pokok yang
 * sedang ditempatkan dan nisbah yang diproyeksikan. Akad yang sudah selesai
 * tidak dihitung karena haknya sudah dibukukan, dan akad batal tidak pernah
 * dihitung. Peran lain menerima `null`, bukan galat, supaya halaman bersama
 * yang dibuka pemantau atau sesi akses bersama tetap termuat.
 */
export const proyeksiPendanaSaya = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ pokokAktif: number; nisbahAktif: number } | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;

    const admin = user.role === ROLES.ADMIN;
    if (!admin && !peranPenyedia(user.role as string | undefined)) return null;

    const rows = admin
      ? await ctx.db.query("akadSyariah").collect()
      : await ctx.db
          .query("akadSyariah")
          .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
          .collect();

    let pokokAktif = 0;
    let nisbahAktif = 0;
    for (const row of rows) {
      if (row.status !== "aktif") continue;
      pokokAktif += row.pokok;
      nisbahAktif += row.nisbahPendana;
    }
    return { pokokAktif, nisbahAktif };
  },
});

/** Satu akad dalam bentuk yang ditampilkan ke peminjamnya. */
export type BarisAkadPeminjam = {
  _id: Id<"akadSyariah">;
  nomorReferensi: string;
  jenis: JenisAkadSyariah;
  status: "aktif" | "selesai" | "dibatalkan";
  pokok: number;
  totalKewajiban: number;
  jatuhTempoPada: number;
  dibuatPada: number;
  selesaiPada: number | null;
  pengajuanId: Id<"pengajuanSyariah"> | null;
};

/**
 * Akad milik peminjam yang sedang masuk.
 *
 * Persetujuan pengajuan saja tidak cukup terlihat oleh peminjam: nomor akad,
 * jatuh tempo, dan status lunas hanya ada di baris akad. Akun tamu menerima
 * daftar kosong, bukan galat, supaya kartu dashboard tetap termuat.
 */
export const akadSaya = query({
  args: {},
  handler: async (ctx): Promise<BarisAkadPeminjam[]> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("akadSyariah")
      .withIndex("by_peminjam", (q) => q.eq("peminjamId", userId))
      .order("desc")
      .take(BATAS_BARIS);
    return rows.map((row) => ({
      _id: row._id,
      nomorReferensi: row.nomorReferensi,
      jenis: row.jenis,
      status: row.status,
      pokok: row.pokok,
      totalKewajiban: row.totalKewajiban,
      jatuhTempoPada: row.jatuhTempoPada,
      dibuatPada: row.dibuatPada,
      selesaiPada: row.selesaiPada ?? null,
      pengajuanId: row.pengajuanId ?? null,
    }));
  },
});

/**
 * Catat satu akad syariah atas nama penyedia dana.
 *
 * Urutan pemeriksaannya: kewenangan admin (TOTP) → gerbang pembayaran →
 * isi akad → saldo dompet → tulis baris + jurnal + tiket. Gerbang pembayaran
 * sengaja SEBELUM validasi nominal: selama transaksi ditutup, tidak ada satu
 * pun baris akad yang boleh terbentuk.
 */
export const catatAkadSyariah = mutation({
  args: {
    jenis: jenisAkadValidator,
    pendanaId: v.id("users"),
    peminjamNama: v.string(),
    pokok: v.number(),
    /** Pengajuan yang disetujui; bila diisi, semua angka mengikuti pengajuan. */
    pengajuanId: v.optional(v.id("pengajuanSyariah")),
    /** Wajib untuk Murabahah; margin total dalam persen dari harga pokok. */
    marginPersen: v.optional(v.number()),
    /** Wajib untuk Rahn; nilai barang jaminan. */
    nilaiTaksiran: v.optional(v.number()),
    tenorHari: v.optional(v.number()),
    /** Jatuh tempo pilihan admin; bawaan dibuatPada + tenor. */
    jatuhTempoPada: v.optional(v.number()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ akadId: Id<"akadSyariah">; nomorReferensi: string }> => {
    const { userId: adminId } = await requireAdminSession(ctx);
    rejectUnverifiedMoneyMovement();

    const pengajuan =
      args.pengajuanId === undefined
        ? null
        : await ctx.db.get(args.pengajuanId);
    if (args.pengajuanId !== undefined && pengajuan === null) {
      throw new Error("Pengajuan syariah tidak ditemukan.");
    }

    let sudahAdaAkad = false;
    if (pengajuan !== null) {
      const akadPeminjam = await ctx.db
        .query("akadSyariah")
        .withIndex("by_peminjam", (q) => q.eq("peminjamId", pengajuan.userId))
        .collect();
      sudahAdaAkad = akadPeminjam.some(
        (row) => row.pengajuanId === pengajuan._id && row.status !== "dibatalkan",
      );
    }
    const data =
      pengajuan === null
        ? null
        : dataPencatatanDariPengajuan({
            pengajuan: { ...pengajuan, peminjamNama: pengajuan.namaPeminjam },
            jenis: args.jenis,
            sudahAdaAkad,
          });

    const peminjamNama = (data?.peminjamNama ?? args.peminjamNama).trim();
    if (peminjamNama.length < 2 || peminjamNama.length > 120) {
      throw new Error("Nama peminjam harus 2-120 karakter.");
    }

    const pendana = await ctx.db.get(args.pendanaId);
    if (pendana === null) throw new Error("Akun penyedia dana tidak ditemukan.");
    if (!peranPenyedia(pendana.role as string | undefined)) {
      throw new Error("Akad hanya dapat dicatat atas nama akun penyedia dana.");
    }

    // Rencana akad divalidasi modul murni: nominal, tenor, margin, dan taksiran
    // memakai aturan yang sama dengan simulator dan halaman produk.
    // Akad tanpa pengajuan (dicatat manual) memakai margin yang berlaku di
    // konfigurasi; akad dari pengajuan memakai angka yang sudah dibekukan di
    // baris pengajuannya.
    const cfg = await getConfig(ctx);
    const pokokAkad = data?.pokok ?? args.pokok;
    const tenorHari = data?.tenorHari ?? args.tenorHari;
    const tenor = tenorHari === undefined ? {} : { tenorHari };
    const rencana: RencanaAkadSyariah =
      args.jenis === "murabahah"
        ? rencanaAkadSyariah({
            jenis: "murabahah",
            pokok: pokokAkad,
            marginPersen:
              data?.marginPersen ?? args.marginPersen ?? cfg.persenMarginSyariah,
            ...tenor,
          })
        : args.jenis === "rahn"
          ? rencanaAkadSyariah({
              jenis: "rahn",
              pokok: pokokAkad,
              nilaiTaksiran: data?.nilaiTaksiran ?? args.nilaiTaksiran ?? 0,
              ...tenor,
            })
          : rencanaAkadSyariah({
              jenis: "qardh",
              pokok: pokokAkad,
              ...tenor,
            });

    const saldo = await danaWalletBalance(ctx, args.pendanaId);
    if (saldo < rencana.pokok) {
      throw new Error(
        `Saldo dompet penyedia dana tidak cukup: ${saldo}, akad ${rencana.pokok}.`,
      );
    }

    const now = Date.now();
    const jatuhTempoPada =
      args.jatuhTempoPada ?? now + rencana.tenorHari * 86_400_000;
    if (!Number.isSafeInteger(jatuhTempoPada) || jatuhTempoPada <= now) {
      throw new Error("Jatuh tempo akad harus waktu yang akan datang.");
    }

    const nomorReferensi = nomorAkad(now);
    const akadId = await ctx.db.insert("akadSyariah", {
      jenis: rencana.jenis,
      nomorReferensi,
      pendanaId: args.pendanaId,
      peminjamNama,
      ...(pengajuan === null
        ? {}
        : { peminjamId: pengajuan.userId, pengajuanId: pengajuan._id }),
      pokok: rencana.pokok,
      tenorHari: rencana.tenorHari,
      totalKewajiban: rencana.totalKewajiban,
      pendanaTerima: rencana.pendanaTerima,
      nisbahPendana: rencana.nisbahPendana,
      nisbahPlatform: rencana.nisbahPlatform,
      ...(rencana.hargaJual === null ? {} : { hargaJual: rencana.hargaJual }),
      marginTotal: rencana.marginTotal,
      ...(rencana.nilaiTaksiran === null
        ? {}
        : { nilaiTaksiran: rencana.nilaiTaksiran }),
      ...(rencana.ujrahPerSiklus === null
        ? {}
        : { ujrahPerSiklus: rencana.ujrahPerSiklus }),
      ...(rencana.jumlahSiklus === null
        ? {}
        : { jumlahSiklus: rencana.jumlahSiklus }),
      tiketDoorprize: rencana.tiketDoorprize,
      status: "aktif",
      jatuhTempoPada,
      ...(args.catatan === undefined ? {} : { catatan: args.catatan }),
      dibuatPada: now,
      dibuatOleh: adminId,
    });

    // Pengajuan menunjuk balik ke akadnya supaya panel admin dan dashboard
    // peminjam tidak perlu menebak nomor akad dari daftar portofolio.
    if (pengajuan !== null) {
      await ctx.db.patch(pengajuan._id, { akadNomor: nomorReferensi });
    }

    const jurnal = jurnalPenempatanSyariah({
      akadId,
      akunDompet: akunDompetDana(args.pendanaId),
      pokok: rencana.pokok,
      referensi: nomorReferensi,
    });
    await appendJournal(ctx, {
      jenis: jurnal.jenis,
      skema: "syariah",
      keterangan: jurnal.keterangan,
      aktor: adminId,
      lines: jurnal.lines,
    });

    // Tiket doorprize mengikuti aturan penempatan dana yang sama dengan produk
    // konvensional: satu tiket per kelipatan Rp1 juta.
    await beriTiketPendanaan(ctx, {
      pemilikId: args.pendanaId,
      nomorReferensi,
      jumlahAlokasi: rencana.pokok,
      waktu: now,
    });

    return { akadId, nomorReferensi };
  },
});

/** Akad harus ada dan masih aktif sebelum diselesaikan atau dibatalkan. */
async function ambilAkadAktif(
  ctx: QueryCtx,
  akadId: Id<"akadSyariah">,
): Promise<{
  akad: Doc<"akadSyariah">;
  pendanaId: Id<"users">;
  rencana: RencanaAkadSyariah;
}> {
  const akad = await ctx.db.get(akadId);
  if (akad === null) throw new Error("Akad syariah tidak ditemukan.");
  if (akad.status !== "aktif") {
    throw new Error("Hanya akad yang masih aktif yang dapat diubah.");
  }
  return {
    akad,
    pendanaId: akad.pendanaId,
    rencana: {
      jenis: akad.jenis,
      pokok: akad.pokok,
      tenorHari: akad.tenorHari,
      totalKewajiban: akad.totalKewajiban,
      pendanaTerima: akad.pendanaTerima,
      nisbahPendana: akad.nisbahPendana,
      nisbahPlatform: akad.nisbahPlatform,
      tiketDoorprize: akad.tiketDoorprize ?? 0,
      hargaJual: akad.hargaJual ?? null,
      marginTotal: akad.marginTotal ?? 0,
      nilaiTaksiran: akad.nilaiTaksiran ?? null,
      ujrahPerSiklus: akad.ujrahPerSiklus ?? null,
      jumlahSiklus: akad.jumlahSiklus ?? null,
    },
  };
}

/**
 * Tandai akad lunas: peminjam sudah membayar, piutang ditutup, pendana menerima
 * pokok + bagiannya, dan platform menerima ujrahnya. Jurnalnya dibangun
 * `lib/syariah/akad` supaya arah debit/kredit tidak ditulis ulang di sini.
 */
export const selesaikanAkadSyariah = mutation({
  args: { akadId: v.id("akadSyariah") },
  handler: async (ctx, { akadId }): Promise<{ nomorReferensi: string }> => {
    const { userId: adminId } = await requireAdminSession(ctx);
    rejectUnverifiedMoneyMovement();
    const { akad, pendanaId, rencana } = await ambilAkadAktif(ctx, akadId);

    const now = Date.now();
    await ctx.db.patch(akadId, { status: "selesai", selesaiPada: now });

    for (const jurnal of jurnalPelunasanSyariah({
      akadId,
      akunDompet: akunDompetDana(pendanaId),
      rencana,
      referensi: akad.nomorReferensi,
    })) {
      await appendJournal(ctx, {
        jenis: jurnal.jenis,
        skema: "syariah",
        keterangan: jurnal.keterangan,
        aktor: adminId,
        lines: jurnal.lines,
      });
    }

    return { nomorReferensi: akad.nomorReferensi };
  },
});

/**
 * Batalkan akad dan kembalikan pokoknya ke dompet pendana. Alasan wajib diisi
 * supaya audit tidak hanya melihat status yang berubah tanpa sebab.
 */
export const batalkanAkadSyariah = mutation({
  args: { akadId: v.id("akadSyariah"), alasan: v.string() },
  handler: async (ctx, { akadId, alasan }): Promise<{ nomorReferensi: string }> => {
    const { userId: adminId } = await requireAdminSession(ctx);
    rejectUnverifiedMoneyMovement();
    const bersih = alasan.trim();
    if (bersih.length < 5) {
      throw new Error("Alasan pembatalan minimal 5 karakter.");
    }

    const { akad, pendanaId, rencana } = await ambilAkadAktif(ctx, akadId);
    const now = Date.now();
    await ctx.db.patch(akadId, {
      status: "dibatalkan",
      dibatalkanPada: now,
      catatan: akad.catatan === undefined ? bersih : `${akad.catatan} | ${bersih}`,
    });

    const jurnal = jurnalPembatalanSyariah({
      akadId,
      akunDompet: akunDompetDana(pendanaId),
      pokok: rencana.pokok,
      referensi: akad.nomorReferensi,
    });
    await appendJournal(ctx, {
      jenis: jurnal.jenis,
      skema: "syariah",
      keterangan: jurnal.keterangan,
      aktor: adminId,
      lines: jurnal.lines,
    });

    // Penempatan batal tidak berhak atas tiket undian. Nomor akad dilepas dari
    // pengajuan supaya penggantinya bisa dicatat tanpa tertahan cek akad ganda.
    await batalkanTiketReferensi(ctx, `PENDANAAN:${akad.nomorReferensi}`);
    if (akad.pengajuanId !== undefined) {
      await ctx.db.patch(akad.pengajuanId, { akadNomor: undefined });
    }

    return { nomorReferensi: akad.nomorReferensi };
  },
});
