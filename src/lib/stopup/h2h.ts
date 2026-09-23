/**
 * STOP-UP! — Bentuk request/response Supplier H2H (murni, tanpa I/O)
 *
 * File ini TIDAK memanggil jaringan apa pun. Ia hanya menyusun body request,
 * menandai endpoint, dan membaca respons supplier. Pemanggilan HTTP +
 * penandatanganan (md5/HMAC-SHA256) dilakukan di Convex action ber-`"use node"`
 * (src/convex/stopup/supplierActions.ts) supaya API key tidak pernah masuk
 * bundel browser.
 */

export type KodeSupplier = "digiflazz" | "tripay" | "custom";

export type HasilSupplier = {
  sukses: boolean;
  /** Proses masih berjalan di sisi supplier (perlu ditanyakan ulang). */
  pending: boolean;
  sn: string | null;
  pesan: string;
  /** Harga riil dari supplier bila dilaporkan (rupiah bulat). */
  harga: number | null;
};

export type KonteksTransaksi = {
  refId: string;
  skuCode: string;
  /** Nomor HP / ID pelanggan / email tujuan. */
  customerNo: string;
  /** Nomor tujuan pihak ketiga untuk produk PPOB (opsional). */
  customerNoExtra?: string;
  /** true = mode uji supplier (tidak memotong saldo). */
  testing: boolean;
};

/* ============================ DIGIFLAZZ ============================ */

export const DIGIFLAZZ_BASE_URL = "https://api.digiflazz.com/v1";

export type DigiflazzBody = {
  username: string;
  apiKey: string;
  refId: string;
  customerNo: string;
  buyerSkuCode: string;
  testing: boolean;
};

/** Body transaksi Digiflazz (v1/transaction). `sign` ditambahkan saat kirim. */
export function bodyDigiflazz(username: string, apiKey: string, ctx: KonteksTransaksi): DigiflazzBody {
  return {
    username,
    apiKey,
    refId: ctx.refId,
    customerNo: ctx.customerNo,
    buyerSkuCode: ctx.skuCode,
    testing: ctx.testing,
  };
}

/** Status Digiflazz: "Sukses" | "Pending" | "Gagal". */
export function parseDigiflazz(json: unknown): HasilSupplier {
  const data = (json as { data?: Record<string, unknown> } | null)?.data ?? {};
  const status = String(data.status ?? "").toLowerCase();
  const sukses = status === "sukses" || status === "success";
  const pending = status === "pending";
  const sn = typeof data.sn === "string" && data.sn.length > 0 ? data.sn : null;
  return {
    sukses,
    pending,
    sn,
    pesan: String(data.message ?? data.rc ?? status ?? "Respons kosong"),
    harga: typeof data.price === "number" ? Math.round(data.price) : null,
  };
}

/* ============================= TRIPAY ============================= */

export const TRIPAY_BASE_URL = "https://tripay.co.id/api-sandbox";

export type TripayBody = {
  method: string;
  merchant_ref: string;
  amount: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  order_items: Array<{
    sku: string;
    name: string;
    price: number;
    quantity: number;
  }>;
};

export function bodyTripay(
  refId: string,
  namaProduk: string,
  sku: string,
  harga: number,
  nomorHp: string,
): TripayBody {
  return {
    method: "QRIS",
    merchant_ref: refId,
    amount: harga,
    customer_name: "Pelanggan STOP-UP!",
    customer_email: "noreply@stopup.id",
    customer_phone: nomorHp,
    order_items: [{ sku, name: namaProduk, price: harga, quantity: 1 }],
  };
}

export function parseTripay(json: unknown): HasilSupplier {
  const root = json as { success?: boolean; data?: Record<string, unknown>; message?: string } | null;
  const data = root?.data ?? {};
  const status = String(data.status ?? "").toUpperCase();
  const sukses = status === "PAID" || root?.success === true;
  return {
    sukses,
    pending: status === "UNPAID" || status === "PENDING",
    sn: typeof data.reference === "string" ? data.reference : null,
    pesan: String(root?.message ?? status ?? "Respons kosong"),
    harga: typeof data.amount === "number" ? Math.round(data.amount) : null,
  };
}

/** Pilih parser sesuai kode supplier; `custom` memakai bentuk Digiflazz. */
export function parseSupplier(kode: string, json: unknown): HasilSupplier {
  return kode === "tripay" ? parseTripay(json) : parseDigiflazz(json);
}

/* ========================== SIMULASI LOKAL ========================== */

/**
 * Respons supplier MURNI SIMULASI — dipakai saat supplier belum dikonfigurasi
 * (tanpa API key). Selalu ditandai `pesan` agar operator tahu ini bukan
 * transaksi ke supplier sungguhan.
 */
export function simulasiSupplier(ctx: KonteksTransaksi, voucherCode?: string): HasilSupplier {
  if (voucherCode) {
    return {
      sukses: true,
      pending: false,
      sn: voucherCode,
      pesan: "SIMULASI H2H — kode voucher dibangkitkan lokal",
      harga: null,
    };
  }
  return {
    sukses: true,
    pending: false,
    sn: `SIM-${ctx.refId}`,
    pesan: "SIMULASI H2H — tidak ada API key supplier terkonfigurasi",
    harga: null,
  };
}

/* ======================= PEMILIHAN SUPPLIER ======================= */

export type KandidatSupplier = {
  isActive: boolean;
  priority: number;
  balance: number;
};

/**
 * Urutkan supplier aktif menurut prioritas (kecil = didahulukan) lalu saldo.
 * Dipakai agar transaksi selalu dicoba ke supplier termurah/terprioritas
 * terlebih dahulu — pola "Easy Pluggable H2H".
 */
export function pilihSupplier<T extends KandidatSupplier>(daftar: T[]): T[] {
  return daftar
    .filter((s) => s.isActive)
    .slice()
    .sort((a, b) => a.priority - b.priority || b.balance - a.balance);
}
