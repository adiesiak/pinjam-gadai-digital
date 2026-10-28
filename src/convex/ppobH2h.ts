"use node";

/**
 * Adaptor H2H server pulsa untuk etalase PPOB publik.
 *
 * Dua bentuk provider:
 *  1. `digiflazz` — API resmi Digiflazz (MD5 signature, price-list/cek-saldo/
 *     transaction). Dipakai apa adanya supaya bisa langsung tersambung tanpa
 *     server perantara.
 *  2. `kustom` — kontrak H2H PINDAI yang sederhana, untuk server pulsa milik
 *     sendiri. Kontraknya didokumentasikan di `docs/ppob-h2h.md`; cukup tiga
 *     endpoint (produk, saldo, transaksi).
 *
 * Berkas ini `"use node"` karena signature Digiflazz memakai MD5 dari
 * `node:crypto`; runtime default Convex tidak menyediakan MD5. Seluruh operasi
 * database tetap lewat `ctx.runQuery`/`ctx.runMutation` ke `ppob.ts`.
 *
 * Kunci API HANYA dibaca dari environment:
 *  - `PPOB_H2H_API_KEY`   (wajib)
 *  - `PPOB_H2H_USERNAME`  (opsional; username di panel menang bila diisi)
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { v } from "convex/values";

import { kategoriDariProvider, kategoriPpobAman, type KategoriPpob } from "../lib/ppob";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";

type Provider = "digiflazz" | "kustom";

type PengaturanH2h = {
  provider: Provider;
  baseUrl: string;
  username: string;
  markupPersen: number;
  markupMin: number;
};

type ProdukH2h = {
  kode: string;
  nama: string;
  kategori: KategoriPpob;
  operator?: string;
  hargaModal: number;
  tersedia: boolean;
  stok?: number;
};

type HasilTransaksi = {
  status: string;
  rc?: string;
  sn?: string;
  pesan?: string;
};

const BATAS_WAKTU_MS = 20_000;

function apiKey(): string {
  const kunci = (process.env.PPOB_H2H_API_KEY ?? "").trim();
  if (kunci === "") {
    throw new Error(
      "PPOB_H2H_API_KEY belum diisi. Tambahkan kunci API server pulsa di menu Keys, lalu buka panel PPOB lagi.",
    );
  }
  return kunci;
}

function usernameEfektif(pengaturan: PengaturanH2h): string {
  const dariPanel = pengaturan.username.trim();
  const dariEnv = (process.env.PPOB_H2H_USERNAME ?? "").trim();
  return dariPanel !== "" ? dariPanel : dariEnv;
}

function alamatDasar(pengaturan: PengaturanH2h): string {
  if (pengaturan.provider === "digiflazz") {
    return (pengaturan.baseUrl.trim() || "https://api.digiflazz.com/v1").replace(/\/+$/, "");
  }
  const dasar = pengaturan.baseUrl.trim().replace(/\/+$/, "");
  if (dasar === "") {
    throw new Error("Alamat server pulsa belum diisi di panel PPOB.");
  }
  return dasar;
}

/** MD5 hex — format `sign` yang diminta Digiflazz. */
export function tandaDigiflazz(
  username: string,
  kunci: string,
  akhiran: string,
): string {
  return createHash("md5").update(`${username}${kunci}${akhiran}`).digest("hex");
}

async function mintaJson(
  url: string,
  init: RequestInit,
  label: string,
): Promise<unknown> {
  const kontrol = new AbortController();
  const timer = setTimeout(() => kontrol.abort(), BATAS_WAKTU_MS);
  try {
    const respons = await fetch(url, { ...init, signal: kontrol.signal });
    const teks = await respons.text();
    let isi: unknown = null;
    try {
      isi = teks === "" ? null : JSON.parse(teks);
    } catch {
      throw new Error(`${label} mengembalikan jawaban yang bukan JSON.`);
    }
    if (!respons.ok) {
      throw new Error(`${label} gagal (HTTP ${respons.status}).`);
    }
    return isi;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label} melewati batas waktu ${BATAS_WAKTU_MS / 1000} detik.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function angka(nilai: unknown): number | null {
  const n = typeof nilai === "string" ? Number(nilai) : nilai;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Normalisasi satu produk Digiflazz; `null` bila di luar lima kategori. */
export function normalisasiProdukDigiflazz(mentah: unknown): ProdukH2h | null {
  if (typeof mentah !== "object" || mentah === null) return null;
  const item = mentah as Record<string, unknown>;
  const kode = typeof item.buyer_sku_code === "string" ? item.buyer_sku_code : "";
  const nama = typeof item.product_name === "string" ? item.product_name : "";
  const kategori = kategoriDariProvider(item.category);
  const harga = angka(item.price);
  if (kode === "" || nama === "" || kategori === null || harga === null || harga <= 0) {
    return null;
  }
  const stok = angka(item.stock);
  const aktifPembeli = item.buyer_product_status !== false;
  const aktifPenjual = item.seller_product_status !== false;
  const tersedia =
    aktifPembeli && aktifPenjual && (stok === null || stok > 0);
  return {
    kode,
    nama,
    kategori,
    ...(typeof item.brand === "string" && item.brand.trim() !== ""
      ? { operator: item.brand.trim() }
      : {}),
    hargaModal: harga,
    tersedia,
    ...(stok !== null ? { stok } : {}),
  };
}

/** Normalisasi satu produk kontrak H2H PINDAI. */
export function normalisasiProdukKustom(mentah: unknown): ProdukH2h | null {
  if (typeof mentah !== "object" || mentah === null) return null;
  const item = mentah as Record<string, unknown>;
  const kode = String(item.kode ?? item.sku ?? item.code ?? "").trim();
  const nama = String(item.nama ?? item.name ?? "").trim();
  const kategoriMentah = String(item.kategori ?? item.category ?? "");
  const kategori =
    kategoriPpobAman(kategoriMentah) ?? kategoriDariProvider(kategoriMentah);
  const harga = angka(item.harga ?? item.hargaModal ?? item.price);
  if (kode === "" || nama === "" || kategori === null || harga === null || harga <= 0) {
    return null;
  }
  const stok = angka(item.stok ?? item.stock);
  return {
    kode,
    nama,
    kategori,
    ...(typeof item.operator === "string" && item.operator.trim() !== ""
      ? { operator: item.operator.trim() }
      : {}),
    hargaModal: harga,
    tersedia: item.aktif !== false && item.active !== false && (stok === null || stok > 0),
    ...(stok !== null ? { stok } : {}),
  };
}

/** Buang duplikat SKU — provider kadang mengirim baris ganda. */
export function unikkanProduk(daftar: readonly ProdukH2h[]): ProdukH2h[] {
  const peta = new Map<string, ProdukH2h>();
  for (const item of daftar) peta.set(item.kode, item);
  return [...peta.values()];
}

async function ambilDaftarHarga(
  pengaturan: PengaturanH2h,
  kunci: string,
): Promise<ProdukH2h[]> {
  const dasar = alamatDasar(pengaturan);

  if (pengaturan.provider === "digiflazz") {
    const username = usernameEfektif(pengaturan);
    if (username === "") throw new Error("Username Digiflazz belum diisi.");
    const isi = await mintaJson(
      `${dasar}/price-list`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "prepaid",
          username,
          sign: tandaDigiflazz(username, kunci, "pricelist"),
        }),
      },
      "Daftar harga",
    );
    const data = (isi as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      const pesan = (isi as { data?: { message?: unknown } })?.data?.message;
      throw new Error(
        typeof pesan === "string"
          ? `Provider menolak permintaan: ${pesan}`
          : "Provider tidak mengembalikan daftar produk.",
      );
    }
    return unikkanProduk(
      data
        .map(normalisasiProdukDigiflazz)
        .filter((item): item is ProdukH2h => item !== null),
    );
  }

  const isi = await mintaJson(
    `${dasar}/produk`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${kunci}` },
    },
    "Daftar produk",
  );
  const data = Array.isArray(isi)
    ? isi
    : (isi as { produk?: unknown; data?: unknown })?.produk ??
      (isi as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new Error("Server pulsa tidak mengembalikan daftar produk.");
  }
  return unikkanProduk(
    data
      .map(normalisasiProdukKustom)
      .filter((item): item is ProdukH2h => item !== null),
  );
}

async function ambilSaldo(
  pengaturan: PengaturanH2h,
  kunci: string,
): Promise<number> {
  const dasar = alamatDasar(pengaturan);
  if (pengaturan.provider === "digiflazz") {
    const username = usernameEfektif(pengaturan);
    if (username === "") throw new Error("Username Digiflazz belum diisi.");
    const isi = await mintaJson(
      `${dasar}/cek-saldo`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "deposit",
          username,
          sign: tandaDigiflazz(username, kunci, "depo"),
        }),
      },
      "Cek saldo",
    );
    const saldo = angka((isi as { data?: { deposit?: unknown } })?.data?.deposit);
    if (saldo === null) throw new Error("Provider tidak melaporkan saldo.");
    return saldo;
  }

  const isi = await mintaJson(
    `${dasar}/saldo`,
    { method: "GET", headers: { Authorization: `Bearer ${kunci}` } },
    "Cek saldo",
  );
  const saldo = angka(
    (isi as { saldo?: unknown; data?: { saldo?: unknown } })?.saldo ??
      (isi as { data?: { saldo?: unknown } })?.data?.saldo,
  );
  if (saldo === null) throw new Error("Server pulsa tidak melaporkan saldo.");
  return saldo;
}

function bacaHasilTransaksi(mentah: unknown): HasilTransaksi {
  const data =
    typeof mentah === "object" && mentah !== null && "data" in mentah
      ? (mentah as { data?: unknown }).data
      : mentah;
  const isi =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const status = String(isi.status ?? isi.Status ?? "").trim();
  const rc = isi.rc === undefined || isi.rc === null ? "" : String(isi.rc);
  // Jawaban error Digiflazz kadang hanya membawa `rc`, tanpa `status`. Tanpa
  // penerjemahan ini, transaksi gagal akan tampak "Pending" selamanya.
  const statusAman =
    status !== ""
      ? status
      : rc === "00"
        ? "Sukses"
        : rc === "01" || rc === "02"
          ? "Gagal"
          : "Pending";
  const pesan = isi.message ?? isi.pesan ?? isi.msg;
  return {
    status: statusAman,
    ...(typeof isi.rc === "string" || typeof isi.rc === "number"
      ? { rc: String(isi.rc) }
      : {}),
    ...(typeof isi.sn === "string" && isi.sn.trim() !== "" ? { sn: isi.sn.trim() } : {}),
    ...(typeof pesan === "string" && pesan.trim() !== "" ? { pesan: pesan.trim() } : {}),
  };
}

async function kirimTransaksi(
  pengaturan: PengaturanH2h,
  kunci: string,
  input: { refId: string; kode: string; nomorTujuan: string },
): Promise<HasilTransaksi> {
  const dasar = alamatDasar(pengaturan);
  if (pengaturan.provider === "digiflazz") {
    const username = usernameEfektif(pengaturan);
    if (username === "") throw new Error("Username Digiflazz belum diisi.");
    const isi = await mintaJson(
      `${dasar}/transaction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          buyer_sku_code: input.kode,
          customer_no: input.nomorTujuan,
          ref_id: input.refId,
          sign: tandaDigiflazz(username, kunci, input.refId),
        }),
      },
      "Transaksi",
    );
    return bacaHasilTransaksi(isi);
  }

  const isi = await mintaJson(
    `${dasar}/transaksi`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kunci}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refId: input.refId,
        kode: input.kode,
        nomorTujuan: input.nomorTujuan,
      }),
    },
    "Transaksi",
  );
  return bacaHasilTransaksi(isi);
}

async function cekTransaksi(
  pengaturan: PengaturanH2h,
  kunci: string,
  input: { refId: string; kode: string; nomorTujuan: string },
): Promise<HasilTransaksi> {
  // Digiflazz memeriksa status dengan MENGIRIM ULANG ref_id yang sama.
  if (pengaturan.provider === "digiflazz") {
    return kirimTransaksi(pengaturan, kunci, input);
  }
  const dasar = alamatDasar(pengaturan);
  const isi = await mintaJson(
    `${dasar}/transaksi/${encodeURIComponent(input.refId)}`,
    { method: "GET", headers: { Authorization: `Bearer ${kunci}` } },
    "Cek status",
  );
  return bacaHasilTransaksi(isi);
}

/** Ambil pengaturan lewat internal query; dipakai semua action. */
async function bacaPengaturanDariDb(ctx: ActionCtx): Promise<PengaturanH2h> {
  const pengaturan = await ctx.runQuery(internal.ppob._pengaturanUntukUji, {});
  return {
    provider: pengaturan.provider === "kustom" ? "kustom" : "digiflazz",
    baseUrl: pengaturan.baseUrl,
    username: pengaturan.username,
    markupPersen: pengaturan.markupPersen,
    markupMin: pengaturan.markupMin,
  };
}

/**
 * Verifikasi tanda tangan webhook di runtime Node.
 *
 * Digiflazz memakai HMAC-SHA1, sedangkan Web Crypto di runtime HTTP Convex
 * tidak menjamin SHA-1 tersedia. Perhitungannya karena itu dilakukan di action
 * `"use node"` ini, dan HTTP action hanya meneruskan body mentah + header.
 * Perbandingan memakai `timingSafeEqual` agar tanda tangan tidak bisa ditebak
 * lewat selisih waktu.
 */
export const verifikasiWebhook = internalAction({
  args: { body: v.string(), tanda: v.string() },
  handler: async (_ctx, args) => {
    const rahasia = (process.env.PPOB_H2H_WEBHOOK_SECRET ?? "").trim();
    if (rahasia === "") return { siap: false, cocok: false };
    const diharapkan = createHmac("sha1", rahasia).update(args.body).digest();
    const diterima = /^[0-9a-f]+$/i.test(args.tanda)
      ? Buffer.from(args.tanda, "hex")
      : Buffer.alloc(0);
    const cocok =
      diterima.length === diharapkan.length && timingSafeEqual(diterima, diharapkan);
    return { siap: true, cocok };
  },
});

/** Tarik seluruh daftar harga lalu simpan per 100 produk. */
export const tarikHarga = action({
  args: {},
  handler: async (ctx) => {
    const admin = await ctx.runQuery(internal.ppob.gerbangAdmin, {});
    const pengaturan = await bacaPengaturanDariDb(ctx);
    const daftar = await ambilDaftarHarga(pengaturan, apiKey());
    if (daftar.length === 0) {
      throw new Error("Provider tidak mengembalikan produk yang bisa dijual.");
    }

    const mulai = Date.now();
    let baru = 0;
    let diperbarui = 0;
    for (let i = 0; i < daftar.length; i += 100) {
      const hasil = await ctx.runMutation(internal.ppob.simpanHasilSinkron, {
        produk: daftar.slice(i, i + 100),
      });
      baru += hasil.baru;
      diperbarui += hasil.diperbarui;
    }

    // Produk yang tidak muncul lagi di daftar harga dianggap ditarik provider.
    for (let putaran = 0; putaran < 10; putaran += 1) {
      const { dimatikan } = await ctx.runMutation(internal.ppob.matikanProdukLama, {
        sebelum: mulai,
      });
      if (dimatikan < 300) break;
    }

    await ctx.runMutation(internal.ppob.catatSinkron, {
      jumlah: daftar.length,
      oleh: admin.userId,
    });
    return { total: daftar.length, baru, diperbarui };
  },
});

/** Cek saldo deposit di server pulsa dan catat sebagai snapshot. */
export const cekSaldo = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.ppob.gerbangAdmin, {});
    const pengaturan = await bacaPengaturanDariDb(ctx);
    const saldo = await ambilSaldo(pengaturan, apiKey());
    await ctx.runMutation(internal.ppob.catatSaldoProvider, { saldo });
    return { saldo };
  },
});

/**
 * Kirim satu pesanan ke provider.
 *
 * `tandaiDiproses` dijalankan SEBELUM permintaan keluar: bila jaringan putus
 * setelah provider menerima topup, pesanan tetap terlihat "diproses" dan cron
 * memeriksanya dengan ref_id yang sama — bukan dikirim sebagai transaksi baru.
 */
export const prosesPesanan = action({
  args: { id: v.id("ppobPesanan") },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.ppob.gerbangAdmin, {});
    return await prosesSatuPesanan(ctx, args.id);
  },
});

async function prosesSatuPesanan(
  ctx: ActionCtx,
  id: Id<"ppobPesanan">,
): Promise<{ ok: boolean; status?: string; pesan?: string }> {
  const { pesanan, pengaturan } = await ctx.runQuery(
    internal.ppob.pesananUntukDiproses,
    { id },
  );
  if (pesanan.status !== "dibayar" && pesanan.status !== "diproses") {
    return { ok: false, pesan: "Pesanan tidak dalam status yang bisa diproses." };
  }
  if ((pesanan.percobaan ?? 0) >= 5) {
    return { ok: false, pesan: "Sudah 5 percobaan; periksa manual di server pulsa." };
  }

  await ctx.runMutation(internal.ppob.tandaiDiproses, { id });
  try {
    const hasil = await kirimTransaksi(
      {
        provider: pengaturan.provider === "kustom" ? "kustom" : "digiflazz",
        baseUrl: pengaturan.baseUrl,
        username: pengaturan.username,
        markupPersen: pengaturan.markupPersen,
        markupMin: pengaturan.markupMin,
      },
      apiKey(),
      {
        refId: pesanan.refId,
        kode: pesanan.produkKode,
        nomorTujuan: pesanan.nomorTujuan,
      },
    );
    await ctx.runMutation(internal.ppob.terapkanStatus, {
      refId: pesanan.refId,
      status: hasil.status,
      ...(hasil.rc !== undefined ? { rc: hasil.rc } : {}),
      ...(hasil.sn !== undefined ? { sn: hasil.sn } : {}),
      ...(hasil.pesan !== undefined ? { pesan: hasil.pesan } : {}),
    });
    return { ok: true, status: hasil.status, ...(hasil.pesan ? { pesan: hasil.pesan } : {}) };
  } catch (err) {
    const pesan = err instanceof Error ? err.message : "Gagal menghubungi provider.";
    // Pesanan tetap "diproses" agar cron/cek manual mengulang dengan ref yang sama.
    await ctx.runMutation(internal.ppob.terapkanStatus, {
      refId: pesanan.refId,
      status: "Pending",
      pesan,
    });
    return { ok: false, pesan };
  }
}

/** Periksa satu pesanan yang sudah dikirim, tanpa mengirim topup baru. */
export const cekStatusPesanan = action({
  args: { id: v.id("ppobPesanan") },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.ppob.gerbangAdmin, {});
    const { pesanan, pengaturan } = await ctx.runQuery(
      internal.ppob.pesananUntukDiproses,
      { id: args.id },
    );
    if (pesanan.status !== "diproses" && pesanan.status !== "dibayar") {
      return { ok: false, pesan: "Hanya pesanan yang sedang diproses bisa dicek." };
    }
    const hasil = await cekTransaksi(
      {
        provider: pengaturan.provider === "kustom" ? "kustom" : "digiflazz",
        baseUrl: pengaturan.baseUrl,
        username: pengaturan.username,
        markupPersen: pengaturan.markupPersen,
        markupMin: pengaturan.markupMin,
      },
      apiKey(),
      {
        refId: pesanan.refId,
        kode: pesanan.produkKode,
        nomorTujuan: pesanan.nomorTujuan,
      },
    );
    await ctx.runMutation(internal.ppob.terapkanStatus, {
      refId: pesanan.refId,
      status: hasil.status,
      ...(hasil.rc !== undefined ? { rc: hasil.rc } : {}),
      ...(hasil.sn !== undefined ? { sn: hasil.sn } : {}),
      ...(hasil.pesan !== undefined ? { pesan: hasil.pesan } : {}),
    });
    return { ok: true, status: hasil.status };
  },
});

/**
 * Cron: periksa pesanan yang tertahan "diproses".
 *
 * Maksimal 10 per putaran supaya satu provider yang lambat tidak menahan seluruh
 * penjadwal. Tidak ada admin yang masuk di jalur ini, jadi tidak memakai
 * `gerbangAdmin`; datanya dibaca lewat query internal.
 */
export const cekPesananTertahan = internalAction({
  args: {},
  handler: async (ctx) => {
    if ((process.env.PPOB_H2H_API_KEY ?? "").trim() === "") {
      return { diperiksa: 0, alasan: "PPOB_H2H_API_KEY belum diisi." };
    }
    const pengaturan = await bacaPengaturanDariDb(ctx);
    const daftar = await ctx.runQuery(internal.ppob.pesananPending, {});
    let diperiksa = 0;

    for (const pending of daftar.slice(0, 10)) {
      try {
        const { pesanan } = await ctx.runQuery(
          internal.ppob.pesananUntukDiproses,
          { id: pending.id },
        );
        if (pesanan.status !== "diproses") continue;
        const hasil = await cekTransaksi(
          {
            provider: pengaturan.provider === "kustom" ? "kustom" : "digiflazz",
            baseUrl: pengaturan.baseUrl,
            username: pengaturan.username,
            markupPersen: pengaturan.markupPersen,
            markupMin: pengaturan.markupMin,
          },
          apiKey(),
          {
            refId: pesanan.refId,
            kode: pesanan.produkKode,
            nomorTujuan: pesanan.nomorTujuan,
          },
        );
        await ctx.runMutation(internal.ppob.terapkanStatus, {
          refId: pesanan.refId,
          status: hasil.status,
          ...(hasil.rc !== undefined ? { rc: hasil.rc } : {}),
          ...(hasil.sn !== undefined ? { sn: hasil.sn } : {}),
          ...(hasil.pesan !== undefined ? { pesan: hasil.pesan } : {}),
        });
        diperiksa += 1;
      } catch {
        // Satu pesanan yang gagal tidak boleh menghentikan sisanya. Cron
        // berikutnya akan mencoba lagi dengan ref_id yang sama.
      }
    }
    return { diperiksa };
  },
});

