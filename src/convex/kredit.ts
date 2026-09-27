import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  bagiCicilanKePendana,
  quoteKreditBarang,
  type KreditBarangQuote,
} from "../lib/kredit";
import { ROLES, type KreditStatusValue } from "./schema";
import { appendJournal } from "./ledger";
import { audit, getConfig } from "./system";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * PINDAI — Skema C: KREDIT BARANG (elektronik & barang marketplace).
 *
 * Peminjam mengajukan pembelian barang dari merchant mitra (Shopee,
 * Tokopedia, toko elektronik, dll); sisa harga setelah uang muka dibiayai
 * Pendana dan dicicil bulanan. Rincian uang tidak pernah disimpan ganda —
 * selalu diturunkan dari (hargaBarang, dpPersen, tenorBulan,
 * marginPersenPerBulan) melalui quoteKreditBarang() di lib/kredit.ts.
 */

/** Gate: pengguna yang sudah masuk (sesi valid). */
async function penggunaMasuk(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  return { userId, user };
}

/** Gate: Peminjam (akun Pendana tidak boleh mengajukan kredit barang). */
async function peminjamMasuk(ctx: QueryCtx) {
  const { userId, user } = await penggunaMasuk(ctx);
  if (user.role === ROLES.PENDANA) {
    throw new Error("Akun Pendana tidak dapat mengajukan. Gunakan akun Peminjam.");
  }
  return { userId, user };
}

/** Gate: admin (tim PINDAI) — untuk verifikasi pengajuan kredit barang. */
async function adminMasuk(ctx: QueryCtx) {
  const { userId, user } = await penggunaMasuk(ctx);
  if (user.role !== ROLES.ADMIN) {
    throw new Error("Hanya tim PINDAI (admin) yang dapat memverifikasi pengajuan.");
  }
  return userId;
}

/** Nomor referensi kredit barang — mis. KRD-20260927-7QK2. */
function nomorReferensiKredit(now: number): string {
  const tanggal = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `KRD-${tanggal}-${suffix}`;
}

/**
 * Ringkasan satu pengajuan kredit barang + rincian harga yang diturunkan.
 * `dibayarBulan` = jumlah cicilan yang sudah tercatat (1..tenorBulan).
 */
function ringkasKredit(row: Doc<"kreditBarang">, dibayarBulan = 0) {
  let quote: KreditBarangQuote | null = null;
  try {
    quote = quoteKreditBarang({
      hargaBarang: row.hargaBarang,
      dpPersen: row.dpPersen,
      tenorBulan: row.tenorBulan,
      marginPersenPerBulan: row.marginPersenPerBulan,
    });
  } catch {
    // Baris warisan di luar rentang skema saat ini: tampilkan tanpa rincian.
    quote = null;
  }

  // ===== Progres cicilan: sisa pokok & kewajiban diturunkan dari jadwal =====
  let sisaPokokKredit = 0;
  let kewajibanSisa = 0;
  let cicilanBerikut: {
    bulan: number;
    pokok: number;
    margin: number;
    total: number;
  } | null = null;
  if (quote !== null) {
    for (const r of quote.jadwal) {
      if (r.bulan > dibayarBulan) {
        sisaPokokKredit += r.pokok;
        kewajibanSisa += r.total;
      }
    }
    const berikut = quote.jadwal[dibayarBulan];
    if (berikut !== undefined) {
      cicilanBerikut = {
        bulan: berikut.bulan,
        pokok: berikut.pokok,
        margin: berikut.margin,
        total: berikut.total,
      };
    }
  }

  return {
    _id: row._id,
    _creationTime: row._creationTime,
    nomorReferensi: row.nomorReferensi,
    namaBarang: row.namaBarang,
    kategori: row.kategori,
    merchant: row.merchant,
    tautanBarang: row.tautanBarang ?? null,
    hargaBarang: row.hargaBarang,
    dpPersen: row.dpPersen,
    tenorBulan: row.tenorBulan,
    marginPersenPerBulan: row.marginPersenPerBulan,
    status: row.status,
    catatanReview: row.catatanReview ?? null,
    catatanPeminjam: row.catatanPeminjam ?? null,
    // ===== Progres cicilan =====
    dibayarBulan,
    totalBulan: row.tenorBulan,
    sisaPokokKredit,
    kewajibanSisa,
    cicilanBerikut,
    // ===== Rincian turunan (engine yang sama dengan kalkulator Pendana) =====
    dp: quote?.dp ?? null,
    pokokDibiayai: quote?.pokokDibiayai ?? null,
    biayaLayanan: quote?.biayaLayanan ?? null,
    cicilanPerBulan: quote?.cicilanPerBulan ?? null,
    cicilanTerakhir: quote?.cicilanTerakhir ?? null,
    imbalHasilPendana: quote?.marginTotal ?? null,
    totalDibayarKonsumen: quote?.totalDibayarKonsumen ?? null,
    persenImbalHasil: quote?.persenImbalHasil ?? null,
  };
}

// =====================================================================
// Sisi Peminjam
// =====================================================================

/**
 * Ajukan kredit barang. Validasi harga, DP, tenor, dan margin memakai engine
 * yang sama dengan kalkulator Pendana — angka tidak pernah diterima dari klien.
 */
export const ajukanKreditBarang = mutation({
  args: {
    namaBarang: v.string(),
    kategori: v.string(),
    merchant: v.string(),
    tautanBarang: v.optional(v.string()),
    hargaBarang: v.number(),
    dpPersen: v.number(),
    tenorBulan: v.number(),
    marginPersenPerBulan: v.number(),
    // ===== Data pemohon =====
    namaLengkap: v.string(),
    nik: v.string(),
    nomorRekening: v.string(),
    nomorWhatsApp: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await peminjamMasuk(ctx);

    // Kill switch: blokir seluruh pengajuan baru saat darurat.
    const sys = await getConfig(ctx);
    if (sys.killSwitch) {
      throw new Error(
        "Pengajuan sementara dihentikan oleh sistem (kill switch aktif). Coba lagi nanti.",
      );
    }

    // Validasi batas skema + hitung rincian (melempar pesan Indonesia yang jelas).
    const quote = quoteKreditBarang({
      hargaBarang: args.hargaBarang,
      dpPersen: args.dpPersen,
      tenorBulan: args.tenorBulan,
      marginPersenPerBulan: args.marginPersenPerBulan,
    });

    const namaBarang = args.namaBarang.trim();
    if (namaBarang.length < 3) {
      throw new Error("Nama barang wajib diisi (minimal 3 karakter).");
    }
    const merchant = args.merchant.trim();
    if (merchant.length < 3) {
      throw new Error("Isi sumber barang, mis. Shopee, Tokopedia, atau toko mitra.");
    }
    let tautan: string | undefined;
    if (args.tautanBarang !== undefined && args.tautanBarang.trim() !== "") {
      const t = args.tautanBarang.trim();
      if (!/^https?:\/\/\S+$/i.test(t)) {
        throw new Error("Tautan barang harus diawali http:// atau https://.");
      }
      tautan = t;
    }

    const nama = args.namaLengkap.trim();
    if (nama.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    const nik = args.nik.replace(/\s+/g, "");
    if (!/^\d{16}$/.test(nik)) {
      throw new Error("NIK harus 16 digit angka sesuai KTP.");
    }
    const rekening = args.nomorRekening.trim().replace(/\s+/g, "");
    if (!/^\d{6,20}$/.test(rekening)) {
      throw new Error("Nomor rekening harus 6–20 digit angka.");
    }
    const wa = args.nomorWhatsApp.replace(/[\s+-]/g, "");
    if (!/^62\d{8,13}$/.test(wa)) {
      throw new Error(
        "Nomor WhatsApp wajib format internasional 62… (mis. 6281234567890).",
      );
    }

    // Peminjam tanpa role eksplisit dipromosikan seperti pada pengajuan pinjaman.
    if (user.role === undefined) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }

    const now = Date.now();
    const referensi = nomorReferensiKredit(now);
    const kreditId = await ctx.db.insert("kreditBarang", {
      userId,
      nomorReferensi: referensi,
      namaBarang,
      kategori: args.kategori.trim() || "Lainnya",
      merchant,
      tautanBarang: tautan,
      hargaBarang: quote.hargaBarang,
      dpPersen: args.dpPersen,
      tenorBulan: args.tenorBulan,
      marginPersenPerBulan: args.marginPersenPerBulan,
      status: "diajukan",
      namaLengkap: nama,
      nik,
      nomorRekening: rekening,
      nomorWhatsApp: wa,
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
    });

    return {
      appId: kreditId,
      nomorReferensi: referensi,
      dp: quote.dp,
      pokokDibiayai: quote.pokokDibiayai,
      cicilanPerBulan: quote.cicilanPerBulan,
      totalDibayarKonsumen: quote.totalDibayarKonsumen,
    };
  },
});

/** Daftar pengajuan kredit barang milik Peminjam (terbaru lebih dulu). */
export const kreditSaya = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await peminjamMasuk(ctx);
    const rows = await ctx.db
      .query("kreditBarang")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const hasil = [];
    for (const row of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const payments = await ctx.db
        .query("kreditPayments")
        .withIndex("by_kredit", (q) => q.eq("kreditId", row._id))
        .collect();
      hasil.push(ringkasKredit(row, payments.length));
    }
    return hasil;
  },
});

/**
 * Konsumen (Peminjam) membayar cicilan bulanan kredit barang.
 *
 * Jurnal (satu mutation transaksional, append-only):
 *   1. D platform:CASH (pokok+Imbal Hasil) | K kredit:<id> (jumlah sama)
 *   2. D kredit:<id> porsi tiap Pendana      | K pendana:WALLET:<id>
 * Pembagian dibulatkan ke bawah per alokasi; selisih (dust) diberikan ke
 * alokasi terbesar sehingga akun kredit tepat nol setiap bulan.
 *
 * Cicilan berurutan: bulan ke-n = jumlah pembayaran tercatat + 1. Setelah
 * bulan terakhir dibayar, pengajuan berstatus "lunas" dan seluruh posisi
 * Pendana ditutup (status "selesai") sehingga Imbal Hasil cair.
 */
export const bayarCicilanKredit = mutation({
  args: { kreditId: v.id("kreditBarang") },
  handler: async (ctx, args) => {
    const { userId } = await peminjamMasuk(ctx);
    const kredit = await ctx.db.get(args.kreditId);
    if (kredit === null) throw new Error("Pengajuan kredit barang tidak ditemukan.");
    if (kredit.userId !== userId) throw new Error("Bukan pengajuan kredit barang Anda.");
    if (kredit.status === "lunas") {
      throw new Error("Seluruh cicilan pengajuan ini sudah lunas.");
    }
    if (kredit.status !== "didanai") {
      throw new Error(
        "Cicilan dapat dibayar setelah pendanaan penuh (status Didanai).",
      );
    }

    // Pengajuan lama bisa berada di luar rentang skema saat ini — beri pesan
    // yang jelas, bukan error engine mentah.
    let quote: KreditBarangQuote;
    try {
      quote = quoteKreditBarang({
        hargaBarang: kredit.hargaBarang,
        dpPersen: kredit.dpPersen,
        tenorBulan: kredit.tenorBulan,
        marginPersenPerBulan: kredit.marginPersenPerBulan,
      });
    } catch {
      throw new Error(
        "Rincian pengajuan ini di luar rentang skema kredit saat ini — hubungi tim PINDAI.",
      );
    }

    const payments = await ctx.db
      .query("kreditPayments")
      .withIndex("by_kredit", (q) => q.eq("kreditId", args.kreditId))
      .collect();
    const bulanKe = payments.length + 1;
    if (bulanKe > quote.jadwal.length) {
      throw new Error("Seluruh cicilan pengajuan ini sudah lunas.");
    }
    const jadwal = quote.jadwal[bulanKe - 1];
    const pokokDibayar = jadwal.pokok;
    const marginDibayar = jadwal.margin;
    const totalDibayar = jadwal.total;

    const fundings = await ctx.db
      .query("kreditFundings")
      .withIndex("by_kredit", (q) => q.eq("kreditId", args.kreditId))
      .collect();
    // Urutan baku (alokasi terbesar dulu, seri diputus nomor referensi) harus
    // sama dengan saat hak diselaraskan ketika pendanaan penuh — hanya itu
    // yang menjamin porsi penyerap pembulatan selalu orang yang sama.
    const aktif = fundings
      .filter((f) => f.status === "dialokasikan")
      .sort(
        (a, b) =>
          b.jumlahAlokasi - a.jumlahAlokasi ||
          a.nomorReferensi.localeCompare(b.nomorReferensi),
      );
    if (aktif.length === 0) {
      throw new Error("Belum ada posisi Pendana aktif pada pengajuan ini.");
    }

    // 1. Kas masuk dari Konsumen.
    await appendJournal(ctx, {
      jenis: "repayment",
      keterangan: `Cicilan kredit barang ${kredit.nomorReferensi} bulan ${bulanKe}/${quote.jadwal.length}`,
      aktor: userId,
      lines: [
        { akun: "platform:CASH", arah: "debit", jumlah: totalDibayar },
        { akun: `kredit:${args.kreditId}`, arah: "kredit", jumlah: totalDibayar },
      ],
    });

    // 2. Bagi ke Pendana proporsional porsi pokok; dust ke alokasi terbesar.
    //    Pembagian dihitung engine lib/kredit.ts (identitas Σ = pokok + margin).
    //    Konteks kumulatif menghapus drift: saat tenor selesai setiap Pendana
    //    menerima pokok tepat sebesar Alokasi Dananya & Imbal Hasil tepat
    //    sebesar hak yang tersimpan pada posisinya.
    let pokokSebelumnya = 0;
    for (const row of quote.jadwal) {
      if (row.bulan < bulanKe) pokokSebelumnya += row.pokok;
    }
    const porsi = bagiCicilanKePendana(
      pokokDibayar,
      marginDibayar,
      quote.pokokDibiayai,
      aktif.map((f) => f.jumlahAlokasi),
      {
        pokokSebelumnya,
        marginSebelumnya: (bulanKe - 1) * quote.marginPerBulan,
      },
    );

    let terdistribusi = 0;
    for (let i = 0; i < aktif.length; i += 1) {
      const p = porsi[i];
      const payout = p.total;
      if (payout <= 0) {
        throw new Error("Porsi alokasi terlalu kecil untuk cicilan bulan ini.");
      }
      await appendJournal(ctx, {
        jenis: "payout",
        keterangan: `Cicilan kredit barang ${kredit.nomorReferensi} bulan ${bulanKe} — pembayaran ke ${aktif[i].nomorReferensi}`,
        aktor: "platform",
        lines: [
          { akun: `pendana:WALLET:${aktif[i].pendanaId}`, arah: "debit", jumlah: payout },
          { akun: `kredit:${args.kreditId}`, arah: "kredit", jumlah: payout },
        ],
      });
      terdistribusi += payout;
    }
    if (terdistribusi !== totalDibayar) {
      throw new Error(
        `Cicilan tidak seimbang: selisih ${totalDibayar - terdistribusi}. Transaksi dibatalkan.`,
      );
    }

    // 3. Catat pembayaran (append-only) — sisa pokok diambil dari jadwal engine.
    const now = Date.now();
    await ctx.db.insert("kreditPayments", {
      kreditId: args.kreditId,
      userId,
      bulanKe,
      pokokDibayar,
      marginDibayar,
      totalDibayar,
      sisaPokokSetelah: jadwal.sisaPokok,
      waktu: now,
    });

    // 4. Bulan terakhir → lunas; seluruh posisi Pendana ditutup.
    const lunas = bulanKe === quote.jadwal.length;
    if (lunas) {
      for (const f of aktif) {
        await ctx.db.patch(f._id, { status: "selesai" });
      }
      await ctx.db.patch(args.kreditId, { status: "lunas", lunasPada: now });
    }

    return {
      bulanKe,
      pokokDibayar,
      marginDibayar,
      totalDibayar,
      sisaPokokSetelah: jadwal.sisaPokok,
      jumlahPendana: aktif.length,
      lunas,
    };
  },
});

// =====================================================================
// Sisi Admin — verifikasi pengajuan
// =====================================================================

/** Seluruh pengajuan kredit barang + identitas pemohon (khusus admin). */
export const antreanKreditBarang = query({
  args: {},
  handler: async (ctx) => {
    await adminMasuk(ctx);
    const rows = await ctx.db.query("kreditBarang").collect();
    const hasil = [];
    for (const row of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const pemohon = await ctx.db.get(row.userId);
      const payments = await ctx.db
        .query("kreditPayments")
        .withIndex("by_kredit", (q) => q.eq("kreditId", row._id))
        .collect();
      hasil.push({
        ...ringkasKredit(row, payments.length),
        namaLengkap: row.namaLengkap,
        nik: row.nik,
        nomorRekening: row.nomorRekening,
        nomorWhatsApp: row.nomorWhatsApp,
        emailPemohon: pemohon?.email ?? null,
      });
    }
    return hasil;
  },
});

/** Pindahkan status pengajuan kredit barang — hanya admin, tercatat di audit. */
async function setKreditStatus(
  ctx: MutationCtx,
  kreditId: Id<"kreditBarang">,
  status: KreditStatusValue,
  catatan?: string,
) {
  const adminId = await adminMasuk(ctx);
  const row = await ctx.db.get(kreditId);
  if (row === null) throw new Error("Pengajuan kredit barang tidak ditemukan.");
  if (status === "diajukan") {
    throw new Error("Status tidak boleh dikembalikan ke diajukan.");
  }
  if (status === "didanai") {
    throw new Error(
      "Status Didanai ditetapkan otomatis oleh sistem saat pendanaan Pendana terpenuhi penuh.",
    );
  }
  if (status === "lunas") {
    throw new Error(
      "Status Lunas ditetapkan otomatis oleh sistem saat cicilan terakhir dibayar.",
    );
  }
  // Catatan: "dibatalkan" bukan status pengajuan (hanya status alokasi di
  // kreditFundings) dan tidak ada mutation yang menulisnya — pembatalan
  // alokasi yang sudah dibayarkan akan membuat Σ alokasi aktif < pokok
  // dibiayai sehingga seluruh cicilan berikutnya gagal. Pengembalian dana
  // (bila suatu saat diperlukan) wajib lewat alur jurnal terpisah, bukan
  // dengan mengubah status alokasi/pengajuan.
  if (status === "ditolak" && (!catatan || catatan.trim().length === 0)) {
    throw new Error("Penolakan wajib menyertakan alasan.");
  }
  if (row.status === status) {
    throw new Error("Status pengajuan sudah sama dengan pilihan tersebut.");
  }
  if (status === "ditolak") {
    // Jangan menolak pengajuan yang sudah menerima Alokasi Dana Pendana —
    // dana terkunci di akun kredit barang sampai dikembalikan.
    const fundings = await ctx.db
      .query("kreditFundings")
      .withIndex("by_kredit", (q) => q.eq("kreditId", kreditId))
      .collect();
    const danaAktif = fundings.filter((f) => f.status === "dialokasikan");
    if (danaAktif.length > 0) {
      throw new Error(
        "Pengajuan sudah menerima Alokasi Dana Pendana — kembalikan dana tersebut sebelum menolak.",
      );
    }
  }

  await ctx.db.patch(kreditId, {
    status,
    catatanReview: catatan?.trim() || undefined,
  });

  const admin = await ctx.db.get(adminId);
  await audit(
    ctx,
    adminId,
    admin?.email ?? admin?.name ?? "admin",
    `kredit_${status}`,
    row.nomorReferensi,
    `${row.namaLengkap} — ${row.namaBarang} (${row.merchant}) — ${status}${catatan ? `: ${catatan}` : ""}`,
  );
}

export const tandaiKreditDitinjau = mutation({
  args: { kreditId: v.id("kreditBarang") },
  handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "sedang_ditinjau"),
});

export const setujuiKreditBarang = mutation({
  args: { kreditId: v.id("kreditBarang") },
  handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "disetujui"),
});

export const tolakKreditBarang = mutation({
  args: { kreditId: v.id("kreditBarang"), reason: v.string() },
  handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "ditolak", args.reason),
});
