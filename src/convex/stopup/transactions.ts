/**
 * STOP-UP! — Modul Transaksi & Pembayaran QRIS
 *
 * Alur: buat invoice → QRIS tampil di layar → pelanggan scan & bayar →
 * callback gateway (HMAC, idempoten) → transaksi diteruskan ke supplier H2H.
 *
 * Aturan uang: seluruh nominal rupiah BULAT (integer).
 * Idempotensi: setiap event gateway dicatat di suWebhookEvents; event yang
 * sama tidak pernah berefek dua kali.
 */
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireAdmin } from "./guard";
import { buatInvoiceId, buatKodeVoucher } from "../../lib/stopup/kode";
import { buildQrisPayload } from "../../lib/stopup/qris";
import { hargaJualAktif } from "../../lib/stopup/pricing";
import { awalHariWib } from "../../lib/stopup/waktu";
import { normalisasiNomorHp } from "../../utils/masking";
import { validasiNomorHp } from "../../lib/stopup/operator";

/** Masa berlaku QRIS di layar (menit). */
const MASA_BERLAKU_MENIT = 5;
/** Jendela penggabungan invoice: klik dobel tidak membuat dua tagihan. */
const JENDELA_REUSE_MS = 3 * 60 * 1000;

const QRIS_DEFAULT = {
  merchantId: "936009990000000001",
  merchantName: "STOP-UP! DIGITAL",
  merchantCity: "JAKARTA",
};

const statusValidator = v.union(
  v.literal("PENDING"),
  v.literal("PROCESSING"),
  v.literal("SUCCESS"),
  v.literal("FAILED"),
  v.literal("EXPIRED"),
);

/* ============================== TERMINAL ============================== */

/**
 * Buat invoice + tagihan QRIS.
 * Dipanggil layar terminal setelah pelanggan menekan "BAYAR".
 */
export const createInvoice = mutation({
  args: {
    terminalCode: v.string(),
    productId: v.id("suProducts"),
    targetNo: v.string(),
    notifWhatsapp: v.string(),
    buyerPhone: v.optional(v.string()),
    accountNameMasked: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const terminal = await ctx.db
      .query("suTerminals")
      .withIndex("by_code", (q) => q.eq("code", args.terminalCode))
      .unique();
    if (!terminal) throw new Error("Terminal belum terdaftar. Hubungi admin.");
    if (!terminal.aktif) throw new Error("Terminal dinonaktifkan admin.");

    const produk = await ctx.db.get(args.productId);
    if (!produk || produk.status !== "AKTIF") {
      throw new Error("Produk tidak tersedia.");
    }
    const brand = await ctx.db.get(produk.brandId);
    if (!brand) throw new Error("Brand produk tidak ditemukan.");

    // --- Validasi target sesuai tipe pengiriman ---
    const butuhEmail = produk.deliveryType === "INJECT_EMAIL";
    let targetNo: string;
    if (butuhEmail) {
      targetNo = args.targetNo.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetNo)) {
        throw new Error("Format email tidak valid (contoh: nama@domain.com).");
      }
    } else {
      targetNo = args.targetNo.replace(/\D/g, "");
      const min = brand.minDigit ?? 10;
      const max = brand.maxDigit ?? 13;
      if (targetNo.length < min || targetNo.length > max) {
        const label = brand.labelTarget ?? "Nomor tujuan";
        const rentang = min === max ? `${min}` : `${min}–${max}`;
        throw new Error(`${label} harus ${rentang} digit.`);
      }
    }

    // --- Nomor WhatsApp penerima invoice ---
    const notif = normalisasiNomorHp(args.notifWhatsapp);
    const cekNotif = validasiNomorHp(notif);
    if (!cekNotif.valid) throw new Error(cekNotif.pesan ?? "Nomor WhatsApp tidak valid.");

    // --- Gabungkan invoice pending yang identik (anti tagihan dobel) ---
    const batasReuse = Date.now() - JENDELA_REUSE_MS;
    const transaksiTerminal = await ctx.db
      .query("suTransactions")
      .withIndex("by_terminal", (q) => q.eq("terminalId", terminal._id))
      .collect();
    const kandidat = transaksiTerminal
      .filter(
        (t) =>
          t.status === "PENDING" &&
          t.productId === args.productId &&
          t.targetNo === targetNo &&
          t.createdAt >= batasReuse,
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (kandidat) {
      const bayar = await ctx.db
        .query("suPayments")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", kandidat.invoiceId))
        .unique();
      if (bayar && bayar.status === "UNPAID" && bayar.expiresAt > Date.now()) {
        return {
          invoiceId: kandidat.invoiceId,
          transactionId: kandidat._id,
          amount: bayar.amount,
          qrString: bayar.qrString,
          expiresAt: bayar.expiresAt,
          digabung: true,
        };
      }
    }

    // --- Snapshot harga (tidak pernah berubah walau harga katalog diubah) ---
    const harga = hargaJualAktif(produk);
    const waktu = Date.now();
    const invoiceId = buatInvoiceId(waktu);
    const pengaturan = await ctx.db
      .query("suSettings")
      .withIndex("by_slot", (q) => q.eq("slot", "global"))
      .unique();

    const transactionId = await ctx.db.insert("suTransactions", {
      invoiceId,
      terminalId: terminal._id,
      productId: produk._id,
      targetNo,
      accountNameMasked: args.accountNameMasked,
      notifWhatsapp: notif,
      buyerPhone: args.buyerPhone ? normalisasiNomorHp(args.buyerPhone) : undefined,
      sellPrice: harga,
      hppPrice: produk.hppPrice,
      profit: Math.round(harga - produk.hppPrice),
      status: "PENDING",
      createdAt: waktu,
    });

    const qrString = buildQrisPayload({
      merchantId: pengaturan?.qrisMerchantId ?? QRIS_DEFAULT.merchantId,
      merchantName: pengaturan?.qrisMerchantName ?? QRIS_DEFAULT.merchantName,
      merchantCity: QRIS_DEFAULT.merchantCity,
      amount: harga,
      invoiceId,
      terminalLabel: terminal.code,
    });

    const expiresAt = waktu + MASA_BERLAKU_MENIT * 60 * 1000;
    await ctx.db.insert("suPayments", {
      invoiceId,
      transactionId,
      paymentMethod: "QRIS",
      qrString,
      amount: harga,
      status: "UNPAID",
      createdAt: waktu,
      expiresAt,
    });

    return { invoiceId, transactionId, amount: harga, qrString, expiresAt, digabung: false };
  },
});

/** Detail invoice untuk layar QRIS (polling status pembayaran). */
export const getInvoice = query({
  args: { invoiceId: v.string() },
  handler: async (ctx, { invoiceId }) => {
    const tx = await ctx.db
      .query("suTransactions")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .unique();
    if (!tx) return null;
    const produk = await ctx.db.get(tx.productId);
    const brand = produk ? await ctx.db.get(produk.brandId) : null;
    const bayar = await ctx.db
      .query("suPayments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .unique();
    const terminal = await ctx.db.get(tx.terminalId);
    const kategori = produk ? await ctx.db.get(produk.categoryId) : null;
    return {
      invoiceId: tx.invoiceId,
      status: tx.status,
      targetNo: tx.targetNo,
      accountNameMasked: tx.accountNameMasked ?? null,
      notifWhatsapp: tx.notifWhatsapp,
      sellPrice: tx.sellPrice,
      voucherCode: tx.voucherCode ?? null,
      snRef: tx.snRef ?? null,
      catatanGagal: tx.catatanGagal ?? null,
      createdAt: tx.createdAt,
      paidAt: tx.paidAt ?? null,
      selesaiPada: tx.selesaiPada ?? null,
      produkNama: produk?.name ?? "-",
      produkIcon: produk?.icon ?? "🛒",
      deliveryType: produk?.deliveryType ?? "INJECT_PHONE",
      brandNama: brand?.name ?? "-",
      brandIcon: brand?.icon ?? "🛒",
      kategoriNama: kategori?.name ?? "-",
      terminalCode: terminal?.code ?? "-",
      terminalNama: terminal?.name ?? "-",
      pembayaran: bayar
        ? {
            status: bayar.status,
            qrString: bayar.qrString,
            amount: bayar.amount,
            expiresAt: bayar.expiresAt,
            paidAt: bayar.paidAt ?? null,
          }
        : null,
    };
  },
});

/**
 * Tandai invoice lunas.
 *
 * Di produksi ini dipanggil dari callback gateway (HTTP action, HMAC).
 * Di kiosk tanpa gateway, tombol "Simulasi Pembayaran" memanggil jalur yang
 * SAMA supaya idempotensi & efek finansialnya identik.
 */
export const markPaid = mutation({
  args: {
    invoiceId: v.string(),
    /** Referensi gateway (RRN). Kosong = jalur simulasi kiosk. */
    gatewayRef: v.optional(v.string()),
    simulasi: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Proteksi: begitu gateway QRIS sungguhan dikonfigurasi (webhook secret
    // ada), status PAID HANYA boleh datang dari callback bertanda tangan HMAC.
    // Tanpa gateway, tombol simulasi di layar terminal memakai jalur yang sama
    // supaya idempotensi & efek finansialnya identik.
    const pengaturan = await ctx.db
      .query("suSettings")
      .withIndex("by_slot", (q) => q.eq("slot", "global"))
      .unique();
    if (pengaturan?.qrisWebhookSecret && !args.gatewayRef) {
      throw new Error(
        "Gateway QRIS sudah aktif — pembayaran hanya bisa dikonfirmasi lewat callback bertanda tangan.",
      );
    }

    const eventId = args.gatewayRef ?? `SIM-${args.invoiceId}-${Date.now()}`;
    return await terapkanPembayaran(ctx, {
      invoiceId: args.invoiceId,
      eventId,
      payload: JSON.stringify({ simulasi: args.simulasi ?? true, gatewayRef: args.gatewayRef ?? null }),
    });
  },
});

/** Batalkan invoice dari layar terminal (pelanggan berubah pikiran). */
export const batalkanInvoice = mutation({
  args: { invoiceId: v.string() },
  handler: async (ctx, { invoiceId }) => {
    const tx = await ctx.db
      .query("suTransactions")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .unique();
    if (!tx || tx.status !== "PENDING") return { ok: false };
    await ctx.db.patch(tx._id, { status: "EXPIRED" });
    const bayar = await ctx.db
      .query("suPayments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .unique();
    if (bayar && bayar.status === "UNPAID") await ctx.db.patch(bayar._id, { status: "EXPIRED" });
    return { ok: true };
  },
});

/** Tandai bahwa struk tidak tercetak (kertas habis) → bukti via WhatsApp. */
export const tandaiStrukViaWhatsapp = mutation({
  args: { invoiceId: v.string(), catatan: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tx = await ctx.db
      .query("suTransactions")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .unique();
    if (!tx) return { ok: false };
    await ctx.db.patch(tx._id, { strukViaWhatsapp: true });
    return { ok: true };
  },
});

/* ============================== ADMIN ============================== */

/** Daftar transaksi untuk panel admin. */
export const listTransactions = query({
  args: {
    status: v.optional(statusValidator),
    /** Cari invoice / nomor tujuan. */
    cari: v.optional(v.string()),
    hanyaHariIni: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);

    let rows = args.hanyaHariIni
      ? await ctx.db
          .query("suTransactions")
          .withIndex("by_created", (q) => q.gte("createdAt", awalHariWib()))
          .collect()
      : await ctx.db.query("suTransactions").withIndex("by_created").order("desc").take(600);

    if (args.status) rows = rows.filter((r) => r.status === args.status);
    const cari = args.cari?.trim().toLowerCase();
    if (cari) {
      rows = rows.filter(
        (r) =>
          r.invoiceId.toLowerCase().includes(cari) ||
          r.targetNo.toLowerCase().includes(cari) ||
          (r.voucherCode ?? "").toLowerCase().includes(cari),
      );
    }

    const hasil = rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    const [produk, terminal, brand] = await Promise.all([
      ctx.db.query("suProducts").collect(),
      ctx.db.query("suTerminals").collect(),
      ctx.db.query("suBrands").collect(),
    ]);
    const petaProduk = new Map(produk.map((p) => [String(p._id), p]));
    const petaTerminal = new Map(terminal.map((t) => [String(t._id), t]));
    const petaBrand = new Map(brand.map((b) => [String(b._id), b]));

    return hasil.map((t) => {
      const p = petaProduk.get(String(t.productId));
      return {
        id: t._id,
        invoiceId: t.invoiceId,
        produk: p?.name ?? "-",
        brand: p ? (petaBrand.get(String(p.brandId))?.name ?? "-") : "-",
        icon: p?.icon ?? "🛒",
        targetNo: t.targetNo,
        notifWhatsapp: t.notifWhatsapp,
        accountNameMasked: t.accountNameMasked ?? null,
        terminal: petaTerminal.get(String(t.terminalId))?.code ?? "-",
        sellPrice: t.sellPrice,
        hppPrice: t.hppPrice,
        profit: t.profit,
        status: t.status,
        snRef: t.snRef ?? null,
        voucherCode: t.voucherCode ?? null,
        createdAt: t.createdAt,
        paidAt: t.paidAt ?? null,
      };
    });
  },
});

/* ============================ INTERNAL ============================ */

/** Data lengkap satu transaksi untuk action pengiriman ke supplier. */
export const ambilUntukSupplier = internalQuery({
  args: { transactionId: v.id("suTransactions") },
  handler: async (ctx, { transactionId }) => {
    const tx = await ctx.db.get(transactionId);
    if (!tx) return null;
    const produk = await ctx.db.get(tx.productId);
    if (!produk) return null;
    const supplier = produk.supplierId ? await ctx.db.get(produk.supplierId) : null;
    const setting = await ctx.db
      .query("suSettings")
      .withIndex("by_slot", (q) => q.eq("slot", "global"))
      .unique();
    const terminal = await ctx.db.get(tx.terminalId);
    return {
      transactionId: tx._id,
      invoiceId: tx.invoiceId,
      targetNo: tx.targetNo,
      deliveryType: produk.deliveryType,
      productName: produk.name,
      hppPrice: tx.hppPrice,
      sellPrice: tx.sellPrice,
      skuSupplier: produk.productCodeSupplier,
      terminalCode: terminal?.code ?? "-",
      supplier: supplier
        ? {
            code: supplier.code,
            name: supplier.name,
            baseUrl: supplier.baseUrl ?? null,
            mode: supplier.mode,
            balance: supplier.balance,
            apiKey: supplier.apiKey ?? null,
            secretKey: supplier.secretKey ?? null,
            isActive: supplier.isActive,
          }
        : null,
      simulasiPending: setting?.simulasiPending ?? false,
    };
  },
});

/**
 * Selesaikan transaksi setelah supplier menjawab.
 * Idempoten: hanya transaksi berstatus PROCESSING yang boleh berubah.
 */
export const selesaikanTransaksi = internalMutation({
  args: {
    transactionId: v.id("suTransactions"),
    sukses: v.boolean(),
    pending: v.boolean(),
    sn: v.optional(v.union(v.string(), v.null())),
    pesan: v.string(),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) return { ok: false };
    if (tx.status === "SUCCESS" || tx.status === "FAILED") return { ok: false };
    if (args.pending) return { ok: true, status: tx.status };

    const waktu = Date.now();
    if (args.sukses) {
      const kodeVoucher =
        tx.voucherCode ??
        (await perluVoucher(ctx, tx.productId) ? buatKodeVoucher() : undefined);
      await ctx.db.patch(args.transactionId, {
        status: "SUCCESS",
        snRef: args.sn ?? `SN-${tx.invoiceId}`,
        voucherCode: kodeVoucher,
        selesaiPada: waktu,
      });
    } else {
      await ctx.db.patch(args.transactionId, {
        status: "FAILED",
        catatanGagal: args.pesan,
        selesaiPada: waktu,
      });
    }
    return { ok: true };
  },
});

/** Transaksi gagal diproses ulang oleh admin setelah supplier pulih. */
export const ulangiTransaksi = mutation({
  args: { transactionId: v.id("suTransactions") },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error("Transaksi tidak ditemukan.");
    if (tx.status !== "FAILED") throw new Error("Hanya transaksi gagal yang bisa diulang.");
    await ctx.db.patch(args.transactionId, {
      status: "PROCESSING",
      catatanGagal: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.stopup.supplierActions.dispatchTransaksi, {
      transactionId: args.transactionId,
    });
    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "transaksi.ulang",
      target: tx.invoiceId,
      detail: "Kirim ulang ke supplier",
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/** Tutup tagihan QRIS yang kedaluwarsa (dipanggil cron tiap 5 menit). */
export const expireStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sekarang = Date.now();
    const belumBayar = await ctx.db
      .query("suPayments")
      .withIndex("by_status", (q) => q.eq("status", "UNPAID"))
      .collect();
    let jumlah = 0;
    for (const bayar of belumBayar) {
      if (bayar.expiresAt > sekarang) continue;
      await ctx.db.patch(bayar._id, { status: "EXPIRED" });
      const tx = await ctx.db.get(bayar.transactionId);
      if (tx && tx.status === "PENDING") {
        await ctx.db.patch(tx._id, { status: "EXPIRED" });
        jumlah += 1;
      }
    }
    return { kedaluwarsa: jumlah };
  },
});

/* ============================== HELPER ============================== */

async function perluVoucher(ctx: MutationCtx, productId: Id<"suProducts">): Promise<boolean> {
  const produk = await ctx.db.get(productId);
  return produk?.deliveryType === "VOUCHER_CODE";
}

/**
 * Inti penerapan pembayaran — satu-satunya tempat status PAID ditulis.
 * Idempoten via tabel suWebhookEvents (kunci: eventId).
 */
async function terapkanPembayaran(
  ctx: MutationCtx,
  args: { invoiceId: string; eventId: string; payload: string },
) {
  const sudahAda = await ctx.db
    .query("suWebhookEvents")
    .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
    .unique();
  if (sudahAda) {
    return { applied: false as const, status: "DUPLIKAT" as const };
  }

  const tx = await ctx.db
    .query("suTransactions")
    .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
    .unique();
  if (!tx) throw new Error("Invoice tidak ditemukan.");
  const bayar = await ctx.db
    .query("suPayments")
    .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
    .unique();
  if (!bayar) throw new Error("Tagihan tidak ditemukan.");

  const waktu = Date.now();
  const kedaluwarsa = bayar.status === "UNPAID" && bayar.expiresAt < waktu;
  const bisaDiterapkan = bayar.status === "UNPAID" && !kedaluwarsa;

  await ctx.db.insert("suWebhookEvents", {
    invoiceId: args.invoiceId,
    eventId: args.eventId,
    applied: bisaDiterapkan,
    payload: args.payload,
    waktu,
  });

  if (!bisaDiterapkan) {
    if (kedaluwarsa) await ctx.db.patch(bayar._id, { status: "EXPIRED" });
    return { applied: false as const, status: kedaluwarsa ? ("KEDALUWARSA" as const) : (bayar.status as "PAID") };
  }

  await ctx.db.patch(bayar._id, {
    status: "PAID",
    paidAt: waktu,
    gatewayRef: args.eventId,
    callbackPayload: args.payload,
  });
  await ctx.db.patch(tx._id, { status: "PROCESSING", paidAt: waktu });

  // Teruskan ke supplier H2H di luar transaksi DB (action "use node").
  await ctx.scheduler.runAfter(0, internal.stopup.supplierActions.dispatchTransaksi, {
    transactionId: tx._id,
  });

  return { applied: true as const, status: "PAID" as const };
}

/** Dipakai action callback HTTP (HMAC) — jalur resmi dari payment gateway. */
export const prosesCallback = internalMutation({
  args: {
    invoiceId: v.string(),
    eventId: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => terapkanPembayaran(ctx, args),
});
