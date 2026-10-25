/**
 * Pencatatan cicilan Kredit Barang oleh admin.
 *
 * Sebelum ini Kredit Barang tidak punya jalur pembayaran yang tercatat:
 * `bayarCicilanKredit` sengaja menolak, sehingga `kreditPayments` hanya bisa
 * lahir dari data contoh dan tidak pernah ada uang yang masuk ke ledger.
 *
 * Satu cicilan dicatat hanya bila:
 *  - nominal mutasi bank sama persis dengan tagihan bulan berikutnya dari
 *    `quoteKreditBarang` (bukan angka yang diketik ulang admin);
 *  - urutannya tepat — cicilan bulan 2 tidak bisa dicatat sebelum bulan 1;
 *  - referensi mutasi bank diisi, seperti jalur angsuran pinjaman tunai.
 *
 * Jurnalnya mengikuti pola `angsuran.jurnalAngsuran`: kas masuk didebit,
 * pokok + margin dikreditkan ke `kredit:<id>` (kewajiban ke pendana), dan
 * biaya admin cicilan langsung ke `platform:FEE`.
 */
import { v } from "convex/values";

import { formatRupiah } from "../lib/money";
import { quoteKreditBarang } from "../lib/kredit";
import { requireAdminSession } from "./adminAuthz";
import { appendJournal } from "./ledger";
import { audit } from "./system";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/** Batas atas nominal satu cicilan — penjaga salah ketik, bukan kebijakan. */
const MAKS_CICILAN = 1_000_000_000;

/**
 * Tagihan cicilan berikutnya dari mesin harga, bukan dari kolom tersimpan.
 * Melempar galat bila kontraknya di luar cakupan mesin (data warisan).
 */
function tagihanBerikut(kredit: Doc<"kreditBarang">, dibayarBulan: number) {
  const quote = quoteKreditBarang({
    hargaBarang: kredit.hargaBarang,
    dpPersen: kredit.dpPersen,
    tenorBulan: kredit.tenorBulan,
    marginPersenPerBulan: kredit.marginPersenPerBulan,
    tarif: kredit.tarifBulanan ?? null,
  });
  const berikut = quote.jadwal[dibayarBulan];
  return { quote, berikut };
}

/** Bukti transfer kredit yang masih menunggu pencocokan untuk satu pengajuan. */
export const buktiKreditMenunggu = query({
  args: { kreditId: v.id("kreditBarang") },
  handler: async (ctx, { kreditId }) => {
    await requireAdminSession(ctx);
    const rows = await ctx.db
      .query("manualPaymentReceipts")
      .filter((q) => q.eq(q.field("kreditId"), kreditId))
      .collect();
    return rows
      .filter((r) => r.status === "menunggu_pencocokan")
      .sort((a, b) => b.tanggalTransfer - a.tanggalTransfer)
      .map((r) => ({
        _id: r._id,
        nomorReferensi: r.nomorReferensi,
        jumlah: r.jumlah,
        tanggalTransfer: r.tanggalTransfer,
        referensiTransfer: r.referensiTransfer,
        metodePembayaran: r.metodePembayaran,
      }));
  },
});

/**
 * Catat satu cicilan kredit yang uangnya sudah diterima.
 *
 * `kreditId` + `jumlah` wajib cocok dengan tagihan bulan berikutnya. Bila
 * `receiptId` diberikan, bukti itu ikut ditandai `dicocokkan` sehingga tidak
 * menggantung di antrean.
 */
export const catatCicilanKredit = mutation({
  args: {
    kreditId: v.id("kreditBarang"),
    jumlah: v.number(),
    tanggal: v.number(),
    referensiMutasi: v.string(),
    receiptId: v.optional(v.id("manualPaymentReceipts")),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const adminLabel = admin.email ?? admin.name ?? "admin";

    const kredit = await ctx.db.get(args.kreditId);
    if (kredit === null) throw new Error("Data kredit barang tidak ditemukan.");
    if (kredit.status !== "didanai") {
      throw new Error(
        kredit.status === "lunas"
          ? "Kredit ini sudah lunas; tidak ada cicilan yang perlu dicatat."
          : "Cicilan hanya dicatat untuk kredit yang dananya sudah tersalurkan.",
      );
    }

    const pembayaran = await ctx.db
      .query("kreditPayments")
      .withIndex("by_kredit", (q) => q.eq("kreditId", args.kreditId))
      .collect();
    const urut = [...pembayaran].sort((a, b) => a.bulanKe - b.bulanKe);
    for (let i = 0; i < urut.length; i += 1) {
      if (urut[i].bulanKe !== i + 1) {
        throw new Error(
          "Riwayat cicilan tidak berurutan; periksa catatan bulan yang hilang sebelum menambah pembayaran baru.",
        );
      }
    }

    const { quote, berikut } = tagihanBerikut(kredit, urut.length);
    if (berikut === undefined) {
      throw new Error("Seluruh cicilan sudah tercatat; tandai kredit lunas.");
    }

    if (!Number.isSafeInteger(args.jumlah) || args.jumlah <= 0 || args.jumlah > MAKS_CICILAN) {
      throw new Error("Nominal cicilan harus rupiah bulat positif.");
    }
    if (args.jumlah !== berikut.total) {
      throw new Error(
        `Nominal cicilan harus ${formatRupiah(berikut.total)} — tagihan bulan ${berikut.bulan} dari ${quote.jadwal.length}.`,
      );
    }

    if (!Number.isSafeInteger(args.tanggal) || args.tanggal > Date.now() + 5 * 60_000) {
      throw new Error("Tanggal pembayaran tidak valid.");
    }
    if (kredit.didanaiPada !== undefined && args.tanggal < kredit.didanaiPada) {
      throw new Error("Tanggal pembayaran tidak boleh sebelum dana kredit disalurkan.");
    }

    const referensi = args.referensiMutasi.trim();
    if (referensi.length < 4 || referensi.length > 120) {
      throw new Error("Referensi mutasi bank wajib 4–120 karakter.");
    }

    const catatan = (args.catatan ?? "").trim();
    if (catatan.length > 500) throw new Error("Catatan maksimal 500 karakter.");

    let receipt: Doc<"manualPaymentReceipts"> | null = null;
    if (args.receiptId !== undefined) {
      receipt = await ctx.db.get(args.receiptId);
      if (
        receipt === null ||
        receipt.jenis !== "kredit_barang" ||
        receipt.kreditId !== args.kreditId
      ) {
        throw new Error("Bukti transfer bukan milik kredit ini.");
      }
      if (receipt.status !== "menunggu_pencocokan") {
        throw new Error("Bukti transfer ini sudah diproses sebelumnya.");
      }
      if (receipt.jumlah !== berikut.total) {
        throw new Error(
          `Nominal bukti ${formatRupiah(receipt.jumlah)} tidak sama dengan tagihan ${formatRupiah(berikut.total)}.`,
        );
      }
    }

    const lunas = urut.length + 1 >= quote.jadwal.length;

    await ctx.db.insert("kreditPayments", {
      kreditId: args.kreditId,
      userId: kredit.userId,
      bulanKe: berikut.bulan,
      pokokDibayar: berikut.pokok,
      marginDibayar: berikut.margin,
      totalDibayar: berikut.total,
      sisaPokokSetelah: berikut.sisaPokok,
      waktu: args.tanggal,
      referensiMutasi: referensi,
      receiptId: args.receiptId,
      dicatatOleh: adminId,
    });

    await appendJournal(ctx, {
      jenis: "repayment",
      skema: "kredit",
      keterangan: `Cicilan ${berikut.bulan}/${quote.jadwal.length} kredit ${kredit.nomorReferensi} — ${formatRupiah(berikut.total)}; mutasi ${referensi}`,
      aktor: adminLabel,
      lines: [
        { akun: "platform:CASH", arah: "debit", jumlah: berikut.total },
        {
          akun: `kredit:${kredit._id}`,
          arah: "kredit",
          jumlah: berikut.pokok + berikut.margin,
        },
        ...(berikut.biayaAdmin > 0
          ? [
              {
                akun: "platform:FEE",
                arah: "kredit" as const,
                jumlah: berikut.biayaAdmin,
              },
            ]
          : []),
      ],
    });

    if (receipt !== null) {
      await ctx.db.patch(receipt._id, {
        status: "dicocokkan",
        referensiMutasi: referensi,
        jumlahMutasi: args.jumlah,
        catatanAdmin: catatan === "" ? undefined : catatan,
        dicocokkanPada: Date.now(),
        dicocokkanOleh: adminId,
      });
    }

    if (lunas) {
      await ctx.db.patch(kredit._id, {
        status: "lunas",
        lunasPada: args.tanggal,
      });
      // Alokasi pendana ikut ditutup: pokok + seluruh Imbal Hasil kontraknya
      // sudah masuk lewat cicilan, jadi portofolio tidak menyisakan posisi
      // "berjalan" yang sebenarnya sudah selesai.
      const alokasi = await ctx.db
        .query("kreditFundings")
        .withIndex("by_kredit", (q) => q.eq("kreditId", args.kreditId))
        .collect();
      for (const f of alokasi) {
        if (f.status === "dialokasikan") {
          await ctx.db.patch(f._id, { status: "selesai" });
        }
      }
    }

    await audit(
      ctx,
      adminId,
      adminLabel,
      lunas ? "kredit_cicilan_lunas" : "kredit_cicilan_dicatat",
      kredit.nomorReferensi,
      `Cicilan ${berikut.bulan}/${quote.jadwal.length} ${formatRupiah(berikut.total)} ` +
        `(pokok ${formatRupiah(berikut.pokok)}, margin ${formatRupiah(berikut.margin)}` +
        (berikut.biayaAdmin > 0 ? `, biaya admin ${formatRupiah(berikut.biayaAdmin)}` : "") +
        `); mutasi ${referensi}` +
        (receipt !== null ? `; bukti ${receipt.nomorReferensi} dicocokkan` : "") +
        (lunas ? "; KREDIT LUNAS" : "") +
        (catatan === "" ? "" : `; catatan: ${catatan}`),
    );

    return {
      ok: true as const,
      bulanKe: berikut.bulan,
      lunas,
      sisaPokok: berikut.sisaPokok,
    };
  },
});
