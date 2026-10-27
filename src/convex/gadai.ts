import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";
import {
  GADAI_PRICING,
  bagiSewaModalGadai,
  quoteGadai,
  rencanaBayarGadai,
  sewaModalBerikutnya,
} from "../lib/gadai";
import { formatRupiah, percentOf } from "../lib/money";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";
import { namaTampilPendana, peranPenyedia } from "./penyediaDana";

function requireAdmin(ctx: MutationCtx) {
  return requireAdminSession(ctx);
}

/**
 * Pendana gadai harus akun penyedia dana yang sah. Akun tamu, peminjam, dan
 * admin tidak boleh menjadi pemilik posisi gadai; akun warisan `pendana` tetap
 * diterima karena posisinya nyata (lihat catatan di penyediaDana.ts).
 */
async function requirePendanaGadai(ctx: MutationCtx, danaId: Id<"users">) {
  const dana = await ctx.db.get(danaId);
  if (dana === null || dana.isAnonymous === true) {
    throw new Error("Akun penyedia dana tidak ditemukan.");
  }
  if (!peranPenyedia(dana.role as string | undefined)) {
    throw new Error("Akun yang dipilih bukan penyedia dana.");
  }
  return dana;
}

async function requirePeminjam(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengakses data dan transaksi.",
    );
  }
  return { userId, user };
}

/** Admin menetapkan pokok dan sewa gadai setelah penilaian; ini bukan pencairan. */
export const setDanaGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    pokokGadai: v.number(),
    persenSewaModal: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (
      pawn.status !== "disetujui" &&
      pawn.status !== "sedang_dinilai" &&
      pawn.status !== "aktif"
    ) {
      throw new Error("Penilaian hanya untuk gadai yang disetujui/dinilai.");
    }
    // Mengubah pokok berarti menimpa sisa pokok. Setelah ada pembayaran,
    // tindakan itu akan menghapus riwayat penurunan pokok secara diam-diam.
    const sudahAdaPembayaran = await ctx.db
      .query("pawnPayments")
      .withIndex("by_pawn", (q) => q.eq("pawnId", args.pawnId))
      .first();
    if (sudahAdaPembayaran !== null) {
      throw new Error(
        "Pokok gadai tidak dapat diubah setelah ada pembayaran tercatat.",
      );
    }
    if (!Number.isSafeInteger(args.pokokGadai) || args.pokokGadai <= 0) {
      throw new Error("Pokok gadai harus rupiah bulat positif.");
    }
    if (
      !Number.isFinite(args.persenSewaModal) ||
      args.persenSewaModal < GADAI_PRICING.sewaModalMinPercent ||
      args.persenSewaModal > GADAI_PRICING.sewaModalMaxPercent
    ) {
      throw new Error(
        `Sewa modal harus ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per 30 hari.`,
      );
    }
    if (pawn.hargaPasar !== undefined && pawn.hargaPasar > 0) {
      const limit = percentOf(pawn.hargaPasar, GADAI_PRICING.ltvMaxPercent);
      if (args.pokokGadai > limit) {
        throw new Error(
          `Pokok ${formatRupiah(args.pokokGadai)} melebihi LTV maks 70% (${formatRupiah(limit)}) dari harga pasar ${formatRupiah(pawn.hargaPasar)}.`,
        );
      }
    }
    if (
      pawn.nilaiTaksiran !== undefined &&
      args.pokokGadai > pawn.nilaiTaksiran
    ) {
      throw new Error(
        `Pokok ${formatRupiah(args.pokokGadai)} melebihi nilai taksiran ${formatRupiah(pawn.nilaiTaksiran)}.`,
      );
    }
    await ctx.db.patch(args.pawnId, {
      pokokGadai: args.pokokGadai,
      persenSewaModal: args.persenSewaModal,
      sisaPokok: args.pokokGadai,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "gadai_dana",
      pawn.nomorReferensi,
      `Pokok ${formatRupiah(args.pokokGadai)} (LTV ≤70%), sewa modal ${args.persenSewaModal}%/30 hari`,
    );
    return { ok: true };
  },
});

/**
 * Admin menetapkan / mengoreksi penyedia dana yang menanggung pokok gadai.
 *
 * Modelnya 1 gadai = 1 pendana. Penetapan hanya mencatat kepemilikan; tidak
 * memindahkan uang dan tidak membuktikan pencairan. Bila gadai sudah punya
 * pembayaran tercatat, porsi pendana pada pembayaran LAMA tidak berubah karena
 * setiap baris menyimpan snapshot pemiliknya saat dicatat — penetapan baru
 * hanya berlaku untuk sewa modal periode berikutnya.
 */
export const tetapkanPendanaGadai = mutation({
  args: { pawnId: v.id("pawns"), danaId: v.id("users") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status !== "disetujui" && pawn.status !== "aktif") {
      throw new Error(
        "Pendana hanya dapat ditetapkan saat gadai disetujui atau berjalan.",
      );
    }
    // Setelah ada pembayaran, pemilik posisi tidak boleh diganti: snapshot
    // porsi pada pembayaran lama tidak menyimpan pemiliknya. Menolak perubahan
    // lebih aman daripada menampilkan hak lama sebagai milik pendana baru.
    if (pawn.pendanaId !== args.danaId) {
      const sudahAdaPembayaran = await ctx.db
        .query("pawnPayments")
        .withIndex("by_pawn", (q) => q.eq("pawnId", args.pawnId))
        .first();
      if (sudahAdaPembayaran !== null) {
        throw new Error(
          "Pendana tidak dapat diganti setelah ada pembayaran tercatat.",
        );
      }
    }
    const dana = await requirePendanaGadai(ctx, args.danaId);
    const nama = namaTampilPendana(dana.name, dana.email);
    await ctx.db.patch(args.pawnId, {
      pendanaId: args.danaId,
      pendanaNama: nama,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "gadai_pendana",
      pawn.nomorReferensi,
      `${pawn.namaLengkap}: pendana ${nama}. Porsi 47/60 sewa modal berlaku untuk periode berikutnya.`,
    );
    return { ok: true, pendanaNama: nama };
  },
});

/**
 * Admin mencatat pembayaran gadai yang sudah diterima di luar aplikasi.
 *
 * Angka pokok dan sewa dihitung server dari sisa pokok terbaru; admin tidak
 * boleh mengetik nominal bebas. Setiap baris menyimpan pembagian 47 : 13
 * sebagai snapshot, sehingga laporan lama tetap utuh bila pemilik berubah.
 * Gadai tanpa pendana tetap dicatat, tetapi seluruh sewa menjadi platform.
 */
export const catatPembayaranGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    cicilPokok: v.number(),
    bayarHanyaSewa: v.optional(v.boolean()),
    referensi: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.pokokGadai === undefined) {
      throw new Error("Tetapkan pokok gadai sebelum mencatat pembayaran.");
    }
    if (pawn.status !== "aktif") {
      throw new Error(
        "Pembayaran hanya dapat dicatat untuk gadai berstatus aktif.",
      );
    }
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai;
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const rencana = rencanaBayarGadai(sisa, persen, {
      cicilPokok: args.cicilPokok,
      bayarHanyaSewa: args.bayarHanyaSewa,
    });
    const referensi = args.referensi?.trim() || undefined;
    if (referensi !== undefined && referensi.length > 200) {
      throw new Error("Referensi pembayaran maksimal 200 karakter.");
    }

    // Tanpa pendana, seluruh sewa modal adalah pendapatan platform. Porsi
    // platform dihitung sebagai selisih agar tidak ada rupiah yang hilang.
    const bagi = bagiSewaModalGadai(rencana.sewaDibayar);
    const adaPendana = pawn.pendanaId !== undefined;
    const porsiPendana = adaPendana ? bagi.pendana : 0;
    const porsiPlatform = rencana.sewaDibayar - porsiPendana;

    const paymentId = await ctx.db.insert("pawnPayments", {
      pawnId: args.pawnId,
      pokokDicicil: rencana.pokokDicicil,
      sewaDibayar: rencana.sewaDibayar,
      sisaPokokSetelah: rencana.sisaPokokSetelah,
      sewaModalBerikut: rencana.sewaModalBerikut,
      userId: pawn.userId,
      waktu: Date.now(),
      porsiPendana,
      porsiPlatform,
      referensi,
      dicatatOleh: userId,
    });
    await ctx.db.patch(args.pawnId, {
      sisaPokok: rencana.sisaPokokSetelah,
      ...(rencana.sisaPokokSetelah <= 0
        ? { status: "menunggu_pelepasan" as const }
        : {}),
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "gadai_bayar",
      pawn.nomorReferensi,
      `Pokok ${formatRupiah(rencana.pokokDicicil)} + sewa ${formatRupiah(rencana.sewaDibayar)}; pendana ${formatRupiah(porsiPendana)}, platform ${formatRupiah(porsiPlatform)}; sisa ${formatRupiah(rencana.sisaPokokSetelah)}`,
    );
    return {
      ok: true,
      paymentId,
      ...rencana,
      porsiPendana,
      porsiPlatform,
      pendanaNama: pawn.pendanaNama ?? null,
    };
  },
});

/**
 * Rincian pembayaran gadai untuk panel admin: sisa pokok, sewa berikutnya,
 * pembagian 47 : 13, dan riwayat yang sudah tercatat.
 */
export const rincianPembayaranGadai = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) return null;
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai ?? 0;
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const sewaBerikut = sisa > 0 ? sewaModalBerikutnya(sisa, persen) : 0;
    const bagi = bagiSewaModalGadai(sewaBerikut);
    const adaPendana = pawn.pendanaId !== undefined;

    const payments = await ctx.db
      .query("pawnPayments")
      .withIndex("by_pawn", (q) => q.eq("pawnId", args.pawnId))
      .collect();
    payments.sort((a, b) => b.waktu - a.waktu);
    const pendanaAkun =
      pawn.pendanaId === undefined ? null : await ctx.db.get(pawn.pendanaId);
    const pendanaNama =
      pendanaAkun === null
        ? (pawn.pendanaNama ?? null)
        : namaTampilPendana(pendanaAkun.name, pendanaAkun.email);

    return {
      pawnId: args.pawnId,
      nomorReferensi: pawn.nomorReferensi,
      namaPeminjam: pawn.namaLengkap,
      status: pawn.status,
      pokokGadai: pawn.pokokGadai ?? null,
      sisaPokok: pawn.pokokGadai === undefined ? null : sisa,
      persenSewaModal: persen,
      pendanaId: pawn.pendanaId ?? null,
      pendanaNama,
      sewaBerikut,
      porsiPendanaBerikut: adaPendana ? bagi.pendana : 0,
      porsiPlatformBerikut: adaPendana ? bagi.platform : sewaBerikut,
      totalPorsiPendana: payments.reduce(
        (total, p) => total + (p.porsiPendana ?? 0),
        0,
      ),
      totalPorsiPlatform: payments.reduce(
        (total, p) => total + (p.porsiPlatform ?? 0),
        0,
      ),
      riwayat: payments.map((p) => ({
        _id: p._id,
        waktu: p.waktu,
        pokokDicicil: p.pokokDicicil,
        sewaDibayar: p.sewaDibayar,
        sisaPokokSetelah: p.sisaPokokSetelah,
        sewaModalBerikut: p.sewaModalBerikut,
        porsiPendana: p.porsiPendana ?? null,
        porsiPlatform: p.porsiPlatform ?? null,
        referensi: p.referensi ?? null,
      })),
    };
  },
});

/**
 * Daftar kewajiban transfer hak pendana gadai untuk admin.
 *
 * Sumbernya pembayaran gadai yang punya porsi pendana lebih dari nol. Satu
 * pembayaran hanya boleh punya satu transfer aktif; baris yang dibatalkan tetap
 * tampil sebagai riwayat dan boleh dicatat ulang.
 */
export const daftarTransferGadai = query({
  args: { batas: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    /**
     * Jendela baca, bukan seluruh riwayat.
     *
     * Panel ini dipakai untuk kewajiban yang masih berjalan; memindai seluruh
     * `pawnPayments` akan menembus batas baca Convex begitu riwayat gadai
     * bertambah panjang, dan halaman admin mendadak gagal dimuat. `batas + 1`
     * dipakai hanya untuk tahu apakah masih ada pembayaran yang lebih lama.
     */
    const batas = Math.min(500, Math.max(25, Math.floor(args.batas ?? 100)));
    const payments = await ctx.db
      .query("pawnPayments")
      .withIndex("by_waktu")
      .order("desc")
      .take(batas + 1);
    const adaLebihBanyak = payments.length > batas;
    const jendela = payments.slice(0, batas);

    const cachePawn = new Map<Id<"pawns">, Doc<"pawns"> | null>();
    const rows = [];
    for (const payment of jendela) {
      if (payment.porsiPendana === undefined || payment.porsiPendana <= 0)
        continue;
      let pawn = cachePawn.get(payment.pawnId);
      if (pawn === undefined) {
        pawn = await ctx.db.get(payment.pawnId);
        cachePawn.set(payment.pawnId, pawn);
      }
      if (pawn === null) continue;

      // Catatan transfer dibaca lewat indeks per pembayaran: yang dibaca hanya
      // catatan milik baris di jendela ini, bukan seluruh tabel transfer.
      const daftarTransfer = await ctx.db
        .query("gadaiTransfers")
        .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
        .collect();
      const waktuCatatan = (t: Doc<"gadaiTransfers">) =>
        t.dibatalkanPada ?? t.dicatatPada;
      const transfer =
        daftarTransfer.length === 0
          ? null
          : [...daftarTransfer].sort(
              (a, b) => waktuCatatan(b) - waktuCatatan(a),
            )[0]!;

      const akun =
        pawn.pendanaId === undefined ? null : await ctx.db.get(pawn.pendanaId);
      const pendanaNama =
        akun !== null
          ? namaTampilPendana(akun.name, akun.email)
          : (pawn.pendanaNama ?? "Penyedia dana");
      rows.push({
        paymentId: payment._id,
        pawnId: payment.pawnId,
        nomorReferensi: pawn.nomorReferensi,
        namaPeminjam: pawn.namaLengkap,
        pendanaNama,
        jumlah: payment.porsiPendana,
        pokokDicicil: payment.pokokDicicil,
        sewaDibayar: payment.sewaDibayar,
        waktuPembayaran: payment.waktu,
        referensiPembayaran: payment.referensi ?? null,
        transfer:
          transfer === null
            ? {
                id: null,
                status: "belum_dicatat" as const,
                jumlah: payment.porsiPendana,
                metode: null,
                referensi: null,
                catatan: null,
                dicatatOlehLabel: null,
                dicatatPada: null,
                alasanBatal: null,
                dibatalkanPada: null,
              }
            : {
                id: transfer._id,
                status: transfer.status,
                jumlah: transfer.jumlah,
                metode: transfer.metode,
                referensi: transfer.referensi ?? null,
                catatan: transfer.catatan ?? null,
                dicatatOlehLabel: transfer.dicatatOlehLabel,
                dicatatPada: transfer.dicatatPada,
                alasanBatal: transfer.alasanBatal ?? null,
                dibatalkanPada: transfer.dibatalkanPada ?? null,
              },
      });
    }

    const belum = rows.filter((r) => r.transfer.status !== "dicatat");
    const tercatat = rows.filter((r) => r.transfer.status === "dicatat");
    return {
      rows,
      /** Baris di jendela ini. Angka rekap mengikuti jendela yang sama. */
      total: rows.length,
      batas,
      adaLebihBanyak,
      /** Berapa pembayaran gadai yang dibaca untuk menyusun jendela ini. */
      pembayaranDibaca: jendela.length,
      ringkasan: {
        jumlahBelumDicatat: belum.length,
        nilaiBelumDicatat: belum.reduce((total, r) => total + r.jumlah, 0),
        jumlahTercatat: tercatat.length,
        nilaiTercatat: tercatat.reduce((total, r) => total + r.jumlah, 0),
      },
    };
  },
});

/** Admin mencatat transfer hak pendana untuk satu pembayaran gadai. */
export const catatTransferGadai = mutation({
  args: {
    paymentId: v.id("pawnPayments"),
    metode: v.union(
      v.literal("transfer_bank"),
      v.literal("e_wallet"),
      v.literal("tunai"),
    ),
    referensi: v.optional(v.string()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (payment === null) throw new Error("Pembayaran gadai tidak ditemukan.");
    if (payment.porsiPendana === undefined || payment.porsiPendana <= 0) {
      throw new Error(
        "Pembayaran ini tidak punya porsi pendana untuk ditransfer.",
      );
    }
    const pawn = await ctx.db.get(payment.pawnId);
    if (pawn === null || pawn.pendanaId === undefined) {
      throw new Error("Gadai ini tidak punya penyedia dana penerima.");
    }
    const sudahAda = await ctx.db
      .query("gadaiTransfers")
      .withIndex("by_payment", (q) => q.eq("paymentId", args.paymentId))
      .collect();
    if (sudahAda.some((t) => t.status === "dicatat")) {
      throw new Error("Pembayaran ini sudah punya transfer tercatat.");
    }
    const referensi = args.referensi?.trim() || undefined;
    const catatan = args.catatan?.trim() || undefined;
    if (referensi !== undefined && referensi.length > 200) {
      throw new Error("Referensi transfer maksimal 200 karakter.");
    }
    if (catatan !== undefined && catatan.length > 500) {
      throw new Error("Catatan transfer maksimal 500 karakter.");
    }
    const akun = await ctx.db.get(pawn.pendanaId);
    const pendanaNama =
      akun !== null
        ? namaTampilPendana(akun.name, akun.email)
        : (pawn.pendanaNama ?? "Penyedia dana");
    const transferId = await ctx.db.insert("gadaiTransfers", {
      pawnId: payment.pawnId,
      paymentId: args.paymentId,
      pendanaId: pawn.pendanaId,
      pendanaNama,
      nomorReferensiGadai: pawn.nomorReferensi,
      jumlah: payment.porsiPendana,
      metode: args.metode,
      referensi,
      catatan,
      status: "dicatat",
      dicatatOleh: userId,
      dicatatOlehLabel: user.email ?? user.name ?? "admin",
      dicatatPada: Date.now(),
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "gadai_transfer",
      pawn.nomorReferensi,
      `Transfer hak pendana ${pendanaNama} ${formatRupiah(payment.porsiPendana)} untuk pembayaran ${formatRupiah(payment.sewaDibayar)} sewa modal`,
    );
    return { ok: true, transferId, jumlah: payment.porsiPendana };
  },
});

/** Admin membatalkan catatan transfer gadai; uang tidak berpindah. */
export const batalkanTransferGadai = mutation({
  args: { transferId: v.id("gadaiTransfers"), alasan: v.string() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const transfer = await ctx.db.get(args.transferId);
    if (transfer === null)
      throw new Error("Catatan transfer gadai tidak ditemukan.");
    if (transfer.status !== "dicatat") {
      throw new Error("Catatan transfer ini sudah dibatalkan.");
    }
    const alasan = args.alasan.trim();
    if (alasan.length < 3) {
      throw new Error("Alasan pembatalan minimal 3 karakter.");
    }
    await ctx.db.patch(args.transferId, {
      status: "dibatalkan",
      dibatalkanPada: Date.now(),
      dibatalkanOlehLabel: user.email ?? user.name ?? "admin",
      alasanBatal: alasan,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "gadai_transfer_batal",
      transfer.nomorReferensiGadai,
      `Catatan transfer ${transfer.pendanaNama} ${formatRupiah(transfer.jumlah)} dibatalkan: ${alasan}`,
    );
    return { ok: true };
  },
});

/** Pencairan gadai ditutup sampai ada izin dan settlement terverifikasi. */
export const cairkanGadai = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Ringkasan historis ledger gadai; angka/status turunan tidak membuktikan transaksi atau custody fisik. */
export const myGadaiBilling = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (
      pawn === null ||
      pawn.userId !== userId ||
      pawn.pokokGadai === undefined
    )
      return null;
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai;
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const payments = await ctx.db
      .query("pawnPayments")
      .withIndex("by_pawn", (q) => q.eq("pawnId", args.pawnId))
      .collect();
    payments.sort((a, b) => b.waktu - a.waktu);
    const quote = quoteGadai(pawn.pokokGadai, persen);
    return {
      pokokGadai: pawn.pokokGadai,
      persenSewaModal: persen,
      sisaPokok: sisa,
      sewaModalBerikut: sewaModalBerikutnya(sisa, persen),
      custody: "TIDAK_DIVERIFIKASI" as const,
      statusTurunanLedger:
        sisa <= 0 ? ("SIAP_DIAMBIL" as const) : ("DALAM_VAULT" as const),
      statusPawn: pawn.status,
      dicairkanPada: pawn.dicairkanPada ?? null,
      danaBersihDiterima: quote.danaBersihDitransfer,
      potonganDiMuka: quote.potonganDiMuka,
      totalPokokDicicil: pawn.pokokGadai - sisa,
      riwayat: payments.map((p) => ({
        _id: p._id,
        waktu: p.waktu,
        pokokDicicil: p.pokokDicicil,
        sewaDibayar: p.sewaDibayar,
        sisaPokokSetelah: p.sisaPokokSetelah,
        sewaModalBerikut: p.sewaModalBerikut,
      })),
    };
  },
});

/** Pembayaran gadai tidak dicatat sebelum ada konfirmasi settlement yang sah. */
export const bayarGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    cicilPokok: v.number(),
    bayarHanyaSewa: v.optional(v.boolean()),
  },
  handler: async (ctx) => {
    await requirePeminjam(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Kalkulator murni; hasilnya ilustrasi ledger, bukan pembayaran atau bukti custody fisik. */
export const simulasiCicilGadai = query({
  args: {
    pawnId: v.id("pawns"),
    cicilPokok: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (
      pawn === null ||
      pawn.userId !== userId ||
      pawn.pokokGadai === undefined
    )
      return null;
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai;
    const cicil = Math.min(Math.max(0, args.cicilPokok), sisa);
    const sewa = sewaModalBerikutnya(sisa, persen);
    const sisaSetelah = sisa - cicil;
    return {
      sisaPokok: sisa,
      persenSewaModal: persen,
      sewaModalBerikut: sewa,
      cicilPokok: cicil,
      totalBayar: cicil + sewa,
      sisaPokokSetelah: sisaSetelah,
      sewaSetelah: sewaModalBerikutnya(sisaSetelah, persen),
      custody: "TIDAK_DIVERIFIKASI" as const,
      statusTurunanLedger:
        sisaSetelah <= 0 ? ("SIAP_DIAMBIL" as const) : ("DALAM_VAULT" as const),
    };
  },
});
