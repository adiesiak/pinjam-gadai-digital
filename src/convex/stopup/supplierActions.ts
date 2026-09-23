"use node";

/**
 * STOP-UP! — Action Node untuk pemanggilan Supplier H2H.
 *
 * File ini berjalan di runtime Node Convex (bukan V8) sehingga boleh memakai
 * `node:crypto` untuk menandatangani request. Semua API key dibaca dari
 * database di server dan TIDAK pernah dikirim ke browser.
 *
 * Pemetaan kunci (didokumentasikan juga di panel admin):
 * - Digiflazz / H2H sejenis : `apiKey` = API key, `secretKey` = username.
 * - Tripay                 : payment gateway QRIS — bukan pengiriman produk.
 *
 * Bila supplier belum dikonfigurasi (tanpa API key produksi), pengiriman
 * berjalan dalam **Mode Simulasi** dan hasilnya selalu diberi catatan
 * "SIMULASI H2H" supaya tidak pernah diklaim sebagai transaksi supplier nyata.
 */
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  bodyDigiflazz,
  parseSupplier,
  simulasiSupplier,
  type KonteksTransaksi,
} from "../../lib/stopup/h2h";
import { buatRefId, namaSimulasi, tagihanSimulasi } from "../../lib/stopup/kode";
import { maskNama } from "../../utils/masking";

type Kredensial = {
  code: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  secretKey: string;
};

/** Kirim transaksi ke supplier H2H (jalur produksi). */
async function panggilSupplier(kredensial: Kredensial, konteks: KonteksTransaksi) {
  const base = kredensial.baseUrl.replace(/\/+$/, "");
  if (kredensial.code === "tripay") {
    throw new Error(
      "Tripay adalah payment gateway QRIS, bukan supplier pengiriman produk. Pilih supplier H2H seperti Digiflazz untuk pengiriman.",
    );
  }

  // Digiflazz: sign = md5(username + apiKey + refId).
  const username = kredensial.secretKey;
  const sign = createHash("md5")
    .update(`${username}${kredensial.apiKey}${konteks.refId}`)
    .digest("hex");
  const body = JSON.stringify({
    ...bodyDigiflazz(username, kredensial.apiKey, konteks),
    sign,
  });

  const res = await fetch(`${base}/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Supplier menolak request (HTTP ${res.status}).`);
  return parseSupplier(kredensial.code, await res.json());
}

/**
 * Teruskan transaksi yang sudah dibayar ke supplier.
 * Dipanggil terjadwal (ctx.scheduler) oleh modul transaksi.
 */
export type HasilDispatch = {
  ok: boolean;
  pending?: boolean;
  sukses?: boolean;
  pesan?: string;
};

export type HasilInquiry = {
  namaMasked: string;
  sumber: "SUPPLIER" | "SIMULASI";
  label: string;
  tagihan: number | null;
};

export const dispatchTransaksi = internalAction({
  args: { transactionId: v.id("suTransactions") },
  handler: async (ctx, { transactionId }): Promise<HasilDispatch> => {
    const data = await ctx.runQuery(internal.stopup.transactions.ambilUntukSupplier, {
      transactionId,
    });
    if (!data) return { ok: false, pesan: "Transaksi tidak ditemukan." };

    // Mode Simulasi "pending": sengaja ditahan supaya alur struk sementara,
    // notifikasi WhatsApp, dan pemrosesan ulang benar-benar bisa diuji.
    if (data.simulasiPending) return { ok: true, pending: true };

    const konteks: KonteksTransaksi = {
      refId: buatRefId(data.invoiceId),
      skuCode: data.skuSupplier,
      customerNo: data.targetNo,
      testing: data.supplier?.mode !== "production",
    };

    const s = data.supplier;
    const produksi = Boolean(
      s && s.isActive && s.apiKey && s.secretKey && s.baseUrl && s.mode === "production",
    );

    let hasil;
    if (produksi && s) {
      try {
        hasil = await panggilSupplier(
          {
            code: s.code,
            name: s.name,
            baseUrl: s.baseUrl as string,
            apiKey: s.apiKey as string,
            secretKey: s.secretKey as string,
          },
          konteks,
        );
      } catch (err) {
        await ctx.runMutation(internal.stopup.transactions.selesaikanTransaksi, {
          transactionId,
          sukses: false,
          pending: false,
          pesan: `Supplier error: ${err instanceof Error ? err.message : String(err)}`,
        });
        return { ok: false };
      }
    } else {
      hasil = simulasiSupplier(konteks);
    }

    await ctx.runMutation(internal.stopup.transactions.selesaikanTransaksi, {
      transactionId,
      sukses: hasil.sukses,
      pending: hasil.pending,
      sn: hasil.sn,
      pesan: hasil.pesan,
    });

    return { ok: true, sukses: hasil.sukses, pesan: hasil.pesan };
  },
});

/**
 * Inquiry nama pemilik akun / pelanggan.
 *
 * Privacy: yang dikembalikan HANYA nama ter-masking — nama utuh tidak pernah
 * meninggalkan server, sesuai kebutuhan layar yang bisa dilihat publik.
 */
export const inquiryPelanggan = action({
  args: { brandCode: v.string(), targetNo: v.string() },
  handler: async (ctx, { brandCode, targetNo }): Promise<HasilInquiry> => {
    const brand = await ctx.runQuery(internal.stopup.catalog.brandInfo, { brandCode });
    if (!brand) throw new Error("Brand tidak dikenal.");

    const bersih = targetNo.replace(/\D/g, "");
    if (bersih.length < brand.minDigit || bersih.length > brand.maxDigit) {
      const rentang =
        brand.minDigit === brand.maxDigit
          ? `${brand.minDigit}`
          : `${brand.minDigit}–${brand.maxDigit}`;
      throw new Error(`${brand.labelTarget} harus ${rentang} digit.`);
    }

    // Jika ada supplier produksi (mis. inquiry PLN Digiflazz), pakai itu.
    const supplier = await ctx.runQuery(internal.stopup.suppliers.supplierProduksi, {});
    if (supplier && supplier.code !== "tripay") {
      try {
        const nama = await cekNamaSupplier(supplier, brand.code, bersih);
        if (nama) {
          return {
            namaMasked: maskNama(nama),
            sumber: "SUPPLIER" as const,
            label: brand.labelTarget,
            tagihan: null as number | null,
          };
        }
      } catch {
        // Jatuh ke Mode Simulasi bila inquiry supplier gagal.
      }
    }

    const nama = namaSimulasi(`${brand.code}-${bersih}`);
    return {
      namaMasked: maskNama(nama),
      sumber: "SIMULASI" as const,
      label: brand.labelTarget,
      tagihan: brand.kind === "PPOB" ? tagihanSimulasi(bersih) : null,
    };
  },
});

/** Endpoint inquiry nama Digiflazz (khusus produk PLN/inquiry). */
async function cekNamaSupplier(
  kredensial: Kredensial,
  brandCode: string,
  customerNo: string,
): Promise<string | null> {
  const base = kredensial.baseUrl.replace(/\/+$/, "");
  const username = kredensial.secretKey;
  const sign = createHash("md5")
    .update(`${username}${kredensial.apiKey}${customerNo}`)
    .digest("hex");
  const res = await fetch(`${base}/inquiry-pln`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      customer_no: customerNo,
      apiKey: kredensial.apiKey,
      sign,
      brand: brandCode,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { customer_name?: string } };
  return json.data?.customer_name ?? null;
}
