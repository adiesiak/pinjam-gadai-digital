/**
 * PPOB publik — etalase tunai di luar akad pinjaman.
 *
 * Alur uangnya sederhana dan sengaja manual di sisi pembayaran:
 *   pembeli memilih produk → pesanan dibuat dengan harga yang DIBEKUKAN →
 *   pembeli transfer → admin memverifikasi → action `ppobH2h.prosesPesanan`
 *   mengirim topup ke server pulsa → status mengikuti webhook/pemeriksaan.
 *
 * Kenapa harga dibekukan di pesanan, bukan dibaca ulang saat dibayar: markup
 * bisa diubah admin kapan saja, dan pembeli tidak boleh dikenai harga berbeda
 * dari yang ia lihat. Laba per pesanan juga ikut membeku.
 *
 * Rahasia H2H TIDAK disimpan di tabel ini. API key hanya dibaca dari
 * environment (`PPOB_H2H_API_KEY`) oleh action di `ppobH2h.ts`, sehingga
 * snapshot konfigurasi dan riwayat perubahan tidak pernah memuatnya.
 */
import { v } from "convex/values";

import {
  KATEGORI_PPOB,
  buatKodePesanan,
  buatRefId,
  hargaJualDariModal,
  kategoriPpobAman,
  labaPesanan,
  maskNomor,
  nomorTujuanBersih,
  persenMarkupKategori,
  statusDariProvider,
  statusFinal,
  type KategoriPpob,
  type MarkupPerKategori,
} from "../lib/ppob";
import { OFFSET_WIB_MS, awalHariWIB } from "../lib/waktu";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { STATUS_PESANAN_PPOB, type StatusPesananPpob } from "../lib/ppob";
import { SYSTEM_SLOT } from "./system";

/** Satu baris pengaturan etalase. */
const SLOT = "global";

/** Markup bawaan: cukup menutup biaya transfer, jauh di bawah margin akad. */
export const PPOB_MARKUP_BAWAAN = 5;
export const PPOB_MARKUP_MIN_BAWAAN = 500;
/** Ambang bawaan alarm saldo provider; cukup untuk beberapa transaksi kecil. */
export const PPOB_SALDO_MINIMUM_BAWAAN = 100_000;

const PROVIDER = ["digiflazz", "kustom"] as const;
type Provider = (typeof PROVIDER)[number];

type PengaturanEfektif = {
  rowId: Id<"ppobPengaturan"> | null;
  aktif: boolean;
  provider: Provider;
  baseUrl: string;
  username: string;
  markupPersen: number;
  markupMin: number;
  markupKategori: MarkupPerKategori;
  nomorAdminWa: string;
  saldoMinimum: number;
  instruksi: string;
  terakhirSinkron: number | null;
};

function providerAman(nilai: string | undefined): Provider {
  return nilai === "kustom" ? "kustom" : "digiflazz";
}

async function bacaPengaturan(ctx: QueryCtx): Promise<PengaturanEfektif> {
  const row = await ctx.db
    .query("ppobPengaturan")
    .withIndex("by_slot", (q) => q.eq("slot", SLOT))
    .first();
  return {
    rowId: row?._id ?? null,
    aktif: row?.aktif ?? true,
    provider: providerAman(row?.provider),
    baseUrl: (row?.baseUrl ?? "").trim(),
    username: (row?.username ?? "").trim(),
    markupPersen: row?.markupPersen ?? PPOB_MARKUP_BAWAAN,
    markupMin: row?.markupMin ?? PPOB_MARKUP_MIN_BAWAAN,
    markupKategori: row?.markupKategori ?? {},
    nomorAdminWa: (row?.nomorAdminWa ?? "").trim(),
    saldoMinimum: row?.saldoMinimum ?? PPOB_SALDO_MINIMUM_BAWAAN,
    instruksi: (row?.instruksi ?? "").trim(),
    terakhirSinkron: row?.terakhirSinkron ?? null,
  };
}

/**
 * Periksa markup per kategori dari panel. Nilai kosong berarti "ikut global",
 * jadi yang dikembalikan hanya kategori yang benar-benar diisi admin.
 */
function validasiMarkupKategori(
  nilai:
    | {
        pulsa?: number;
        data?: number;
        tokenListrik?: number;
        game?: number;
        ewallet?: number;
      }
    | undefined,
): MarkupPerKategori {
  if (nilai === undefined) return {};
  const hasil: MarkupPerKategori = {};
  for (const [kunci, angka] of Object.entries(nilai) as Array<
    [keyof MarkupPerKategori, number | undefined]
  >) {
    if (angka === undefined) continue;
    if (!Number.isFinite(angka) || angka < 0 || angka > 50) {
      throw new Error("Markup per kategori harus antara 0% dan 50%.");
    }
    hasil[kunci] = angka;
  }
  return hasil;
}

/**
 * Kode acak kriptografis dari alfabet 32 karakter.
 *
 * `crypto.getRandomValues` dengan alfabet 32 TIDAK bias: 256 habis dibagi 32,
 * jadi setiap huruf punya peluang yang sama. UUID dipakai sebelumnya hanya
 * memberi 16 kemungkinan per karakter, terlalu sempit untuk kunci publik.
 */
const ALFABET_KODE = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function kodeAcak(panjang: number): string {
  const byte = crypto.getRandomValues(new Uint8Array(panjang));
  let hasil = "";
  for (const nilai of byte) hasil += ALFABET_KODE[nilai % ALFABET_KODE.length];
  return hasil.slice(0, panjang);
}

/** Batas spam ringan: satu nomor tidak bisa membanjiri antrean admin. */
const MAKS_PESANAN_MENUNGGU_PER_JAM = 5;
const JEDA_PESANAN_SAMA_MS = 2 * 60 * 1000;

/**
 * Etalase publik: jumlah produk per kategori.
 *
 * Hanya produk yang aktif DAN tersedia yang dihitung, karena itu yang benar-
 * benar bisa dibeli. Kategori kosong tidak dikirim supaya layar tidak menampilkan
 * tab buntu.
 */
export const kategoriEtalase = query({
  args: {},
  handler: async (ctx) => {
    const pengaturan = await bacaPengaturan(ctx);
    const produk = await ctx.db
      .query("ppobProduk")
      .withIndex("by_aktif", (q) => q.eq("aktif", true))
      .take(1_200);

    const jumlah = new Map<KategoriPpob, number>();
    for (const item of produk) {
      if (!item.tersedia) continue;
      jumlah.set(item.kategori, (jumlah.get(item.kategori) ?? 0) + 1);
    }
    return {
      aktif: pengaturan.aktif,
      kategori: [...jumlah.entries()]
        .map(([id, cacah]) => ({ id, jumlah: cacah }))
        .sort((a, b) => b.jumlah - a.jumlah),
      diperbaruiPada: pengaturan.terakhirSinkron,
      instruksi: pengaturan.instruksi,
    };
  },
});

/**
 * Daftar produk satu kategori.
 *
 * Dibatasi 80 baris: etalase publik adalah daftar pilihan, bukan katalog utuh.
 * Pencarian dilakukan setelah filter kategori supaya indeks tetap dipakai dan
 * pengunjung tidak menarik ribuan SKU hanya untuk mengetik satu merek.
 */
export const daftarProduk = query({
  args: { kategori: v.string(), cari: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const kategori = kategoriPpobAman(args.kategori);
    if (kategori === null) return [];
    const kueri = (args.cari ?? "").trim().toLowerCase();

    const baris = await ctx.db
      .query("ppobProduk")
      .withIndex("by_kategori", (q) =>
        q.eq("kategori", kategori).eq("aktif", true).eq("tersedia", true),
      )
      .take(300);

    return baris
      .filter((item) => kueri === "" || item.nama.toLowerCase().includes(kueri))
      .sort((a, b) => a.hargaJual - b.hargaJual)
      .slice(0, 80)
      .map((item) => ({
        kode: item.kode,
        nama: item.nama,
        operator: item.operator ?? "",
        kategori: item.kategori,
        hargaJual: item.hargaJual,
      }));
  },
});

/** Instruksi pembayaran publik — rekening usaha yang sama dengan kanal manual. */
async function pembayaranPublik(ctx: QueryCtx) {
  const cfg = await ctx.db
    .query("systemConfig")
    .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
    .first();
  const namaRekening = cfg?.rekeningUsahaNama ?? "";
  const namaBank = cfg?.rekeningUsahaBank ?? "";
  const nomorRekening = cfg?.rekeningUsahaNomor ?? "";
  return {
    namaRekening,
    namaBank,
    nomorRekening,
    qrisUrl: cfg?.qrisImageId ? await ctx.storage.getUrl(cfg.qrisImageId) : null,
    tersedia: Boolean(namaRekening && namaBank && nomorRekening),
  };
}

/**
 * Buat pesanan dari etalase publik.
 *
 * Tanpa akun: pembeli hanya perlu nomor tujuan dan WhatsApp. Harga dihitung
 * SERVER dari produk yang tersimpan — bukan dari angka yang dikirim klien.
 */
export const buatPesanan = mutation({
  args: {
    kodeProduk: v.string(),
    nomorTujuan: v.string(),
    nama: v.string(),
    whatsapp: v.string(),
  },
  handler: async (ctx, args) => {
    const pengaturan = await bacaPengaturan(ctx);
    if (!pengaturan.aktif) {
      throw new Error("Etalase PPOB sedang ditutup. Coba lagi nanti.");
    }

    const produk = await ctx.db
      .query("ppobProduk")
      .withIndex("by_kode", (q) => q.eq("kode", args.kodeProduk.trim()))
      .first();
    if (produk === null || !produk.aktif || !produk.tersedia) {
      throw new Error("Produk ini sedang tidak tersedia. Pilih produk lain.");
    }

    const nomorTujuan = nomorTujuanBersih(produk.kategori, args.nomorTujuan);
    const whatsapp = nomorTujuanBersih("pulsa", args.whatsapp);
    const nama = args.nama.trim().slice(0, 80);
    if (nama.length < 2) throw new Error("Nama pemesan minimal 2 karakter.");

    const sekarang = Date.now();
    const batasJam = sekarang - 60 * 60 * 1000;
    const milikNomor = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_whatsapp", (q) =>
        q.eq("whatsapp", whatsapp).gte("dibuatPada", batasJam),
      )
      .take(20);

    // Pesanan yang sama persis (produk + tujuan) dan belum dibayar dalam 2
    // menit dianggap klik ganda: kembalikan yang lama, jangan buat tagihan baru.
    const kembar = milikNomor.find(
      (item) =>
        item.produkKode === produk.kode &&
        item.nomorTujuan === nomorTujuan &&
        item.status === "menunggu_bayar" &&
        sekarang - item.dibuatPada < JEDA_PESANAN_SAMA_MS,
    );
    if (kembar !== undefined) {
      return { kodePesanan: kembar.kodePesanan, ulang: true };
    }

    const menunggu = milikNomor.filter(
      (item) => item.status === "menunggu_bayar",
    ).length;
    if (menunggu >= MAKS_PESANAN_MENUNGGU_PER_JAM) {
      throw new Error(
        "Terlalu banyak pesanan yang belum dibayar untuk nomor ini. Selesaikan pembayaran sebelumnya atau hubungi admin.",
      );
    }

    // Kode adalah kunci publik halaman status: cek bentrok sebelum menulis,
    // karena Convex tidak punya indeks unik. Ruang 32^12 membuat bentrok sangat
    // jarang, tetapi satu bentrokan tetap berarti dua pembeli berbagi kunci.
    let kodePesanan = "";
    let refId = "";
    for (let percobaan = 0; percobaan < 5 && kodePesanan === ""; percobaan += 1) {
      const kandidatKode = buatKodePesanan(sekarang, kodeAcak(12));
      const kandidatRef = buatRefId(sekarang, kodeAcak(12));
      const [kodeDipakai, refDipakai] = await Promise.all([
        ctx.db
          .query("ppobPesanan")
          .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", kandidatKode))
          .first(),
        ctx.db
          .query("ppobPesanan")
          .withIndex("by_ref", (q) => q.eq("refId", kandidatRef))
          .first(),
      ]);
      if (kodeDipakai === null && refDipakai === null) {
        kodePesanan = kandidatKode;
        refId = kandidatRef;
      }
    }
    if (kodePesanan === "" || refId === "") {
      throw new Error("Gagal membuat kode pesanan yang unik. Coba lagi.");
    }
    const hargaJual = produk.hargaJual;
    // Pembeli yang sedang masuk mendapat tautan pesanan di beranda akunnya;
    // pembeli tamu tetap bisa melacak lewat kode pesanan.
    const userId = await getAuthUserId(ctx);
    const pesananId = await ctx.db.insert("ppobPesanan", {
      kodePesanan,
      refId,
      produkKode: produk.kode,
      namaProduk: produk.nama,
      kategori: produk.kategori,
      nomorTujuan,
      namaPembeli: nama,
      whatsapp,
      ...(userId !== null ? { userId } : {}),
      hargaModal: produk.hargaModal,
      hargaJual,
      laba: labaPesanan(hargaJual, produk.hargaModal),
      status: "menunggu_bayar",
      dibuatPada: sekarang,
    });
    // Ping admin berangkat di action terpisah supaya pembuatan pesanan tidak
    // menunggu gateway WhatsApp dan tetap berhasil bila gateway sedang mati.
    await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.kabarkanPesanan, {
      pesananId,
      jenis: "baru",
    });
    return { kodePesanan, ulang: false };
  },
});

/**
 * Status pesanan publik, dibuka lewat kode pesanan.
 *
 * Nomor tujuan disamarkan dan tidak ada data admin yang ikut. Kode pesanan
 * memuat dua belas karakter acak sehingga tidak bisa ditebak berurutan.
 */
export const statusPesanan = query({
  args: { kode: v.string() },
  handler: async (ctx, args) => {
    const pesanan = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", args.kode.trim()))
      .first();
    if (pesanan === null) return null;
    const pembayaran = await pembayaranPublik(ctx);
    const pengaturan = await bacaPengaturan(ctx);
    return {
      kodePesanan: pesanan.kodePesanan,
      namaProduk: pesanan.namaProduk,
      kategori: pesanan.kategori,
      // Penyamaran dilakukan di server, bukan di UI: kode pesanan bisa dibagikan
      // ke orang lain, dan nomor lengkap tidak perlu ikut terbaca. Pembeli tetap
      // melihat nomor penuh di formulir sebelum menekan pesan.
      nomorTujuan: maskNomor(pesanan.nomorTujuan),
      hargaJual: pesanan.hargaJual,
      status: pesanan.status,
      // Nomor seri TIDAK ikut di sini: halaman ini bisa dibuka siapa pun yang
      // memegang kode, dan token listrik/voucher adalah nilai yang bisa dipakai
      // orang lain. Pembeli membukanya lewat `bukaSn` dengan verifikasi nomor.
      snTersedia: pesanan.status === "sukses" && (pesanan.sn ?? "") !== "",
      pesanProvider: pesanan.status === "sukses" ? null : (pesanan.pesanProvider ?? null),
      dibuatPada: pesanan.dibuatPada,
      dibayarPada: pesanan.dibayarPada ?? null,
      selesaiPada: pesanan.selesaiPada ?? null,
      pembayaran,
      instruksi: pengaturan.instruksi,
    };
  },
});

/** Batas salah memasukkan 4 digit sebelum nomor seri dikunci sementara. */
const MAKS_BUKA_SN_GAGAL = 5;
const KUNCI_BUKA_SN_MS = 15 * 60 * 1000;

/**
 * Buka nomor seri/token dengan verifikasi 4 digit terakhir nomor tujuan.
 *
 * Kode pesanan saja tidak cukup: kode bisa tersalin ke orang lain, dan token
 * listrik dapat ditukarkan siapa pun yang membacanya. Pesan galat untuk kode
 * yang tidak ada dan nomor yang tidak cocok sengaja SAMA supaya endpoint ini
 * tidak bisa dipakai memastikan sebuah kode valid.
 */
export const bukaSn = mutation({
  args: { kode: v.string(), empatDigit: v.string() },
  handler: async (ctx, args) => {
    const galat = "Kode pesanan atau 4 digit terakhir nomor tidak cocok.";
    const pesanan = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_kode_pesanan", (q) => q.eq("kodePesanan", args.kode.trim()))
      .first();
    if (pesanan === null) throw new Error(galat);

    const sekarang = Date.now();
    if ((pesanan.snTerkunciSampai ?? 0) > sekarang) {
      const sisa = Math.ceil(((pesanan.snTerkunciSampai ?? 0) - sekarang) / 60_000);
      throw new Error(`Terlalu banyak percobaan. Coba lagi dalam ${sisa} menit.`);
    }

    const digit = args.empatDigit.replace(/\D/g, "");
    const nomor = pesanan.nomorTujuan.replace(/\D/g, "");
    if (digit.length !== 4 || !nomor.endsWith(digit)) {
      const gagal = (pesanan.snGagal ?? 0) + 1;
      await ctx.db.patch(
        pesanan._id,
        gagal >= MAKS_BUKA_SN_GAGAL
          ? { snGagal: 0, snTerkunciSampai: sekarang + KUNCI_BUKA_SN_MS }
          : { snGagal: gagal },
      );
      throw new Error(galat);
    }

    if (pesanan.status !== "sukses" || (pesanan.sn ?? "") === "") {
      throw new Error("Nomor seri belum tersedia untuk pesanan ini.");
    }
    await ctx.db.patch(pesanan._id, {
      snGagal: 0,
      snTerkunciSampai: 0,
      snDibukaPada: sekarang,
    });
    return { sn: pesanan.sn ?? "" };
  },
});

/** Ringkasan untuk kepala panel admin. */
export const ringkasanPpob = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const [menunggu, dibayar, diproses, sukses] = await Promise.all(
      (["menunggu_bayar", "dibayar", "diproses", "sukses"] as const).map(
        (status) =>
          ctx.db
            .query("ppobPesanan")
            .withIndex("by_status", (q) => q.eq("status", status))
            .take(500),
      ),
    );
    const laba = sukses.reduce((total, item) => total + item.laba, 0);
    return {
      menunggu: menunggu.length,
      dibayar: dibayar.length,
      diproses: diproses.length,
      sukses: sukses.length,
      laba,
      /** Angka di atas dihitung dari maksimal 500 baris terbaru per status. */
      terbatas: menunggu.length >= 500 || sukses.length >= 500,
    };
  },
});

/**
 * Pesanan milik akun yang sedang masuk.
 *
 * Etalase tetap bisa dipakai tanpa akun; daftar ini hanya pelengkap supaya
 * pembeli yang punya akun tidak perlu menyimpan kode pesanan satu per satu.
 * Nomor tujuan dikembalikan UTUH karena ini pesanan miliknya sendiri, bukan
 * halaman publik yang bisa dibuka siapa saja lewat kode.
 */
export const pesananSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const baris = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    return baris.map((item) => ({
      kodePesanan: item.kodePesanan,
      namaProduk: item.namaProduk,
      kategori: item.kategori,
      nomorTujuan: item.nomorTujuan,
      namaPembeli: item.namaPembeli ?? "",
      whatsapp: item.whatsapp,
      hargaJual: item.hargaJual,
      status: item.status,
      sn: item.sn ?? null,
      dibuatPada: item.dibuatPada,
    }));
  },
});

/**
 * Laporan PPOB untuk panel admin.
 *
 * Laba hanya diakui dari pesanan `sukses`: pesanan yang masih diproses belum
 * tentu menghasilkan barang, dan pesanan gagal/refund tidak menghasilkan laba.
 * Omzet mengikuti aturan yang sama supaya angka di laporan bisa dicocokkan
 * dengan uang yang benar-benar diterima.
 */
export const laporanPpob = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const awalHari = awalHariWIB(sekarang);
    const tanggal = new Date(sekarang + OFFSET_WIB_MS);
    const awalBulan =
      Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), 1) - OFFSET_WIB_MS;

    const bulan = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_dibuat", (q) => q.gte("dibuatPada", awalBulan))
      .order("desc")
      .take(3_000);
    const hari = bulan.filter((item) => item.dibuatPada >= awalHari);

    const total = (baris: typeof bulan) => {
      const hasil = { pesanan: baris.length, sukses: 0, gagal: 0, omzet: 0, laba: 0 };
      for (const item of baris) {
        if (item.status === "sukses") {
          hasil.sukses += 1;
          hasil.omzet += item.hargaJual;
          hasil.laba += item.laba;
        } else if (item.status === "gagal" || item.status === "refund") {
          hasil.gagal += 1;
        }
      }
      return hasil;
    };

    const perKategori = KATEGORI_PPOB.map((kategori) => {
      const baris = bulan.filter((item) => item.kategori === kategori);
      return { kategori, ...total(baris) };
    }).sort((a, b) => b.laba - a.laba);

    const daftarGagal = bulan
      .filter((item) => item.status === "gagal" || item.status === "refund")
      .slice(0, 20)
      .map((item) => ({
        kodePesanan: item.kodePesanan,
        namaProduk: item.namaProduk,
        nomorTujuan: maskNomor(item.nomorTujuan),
        whatsapp: item.whatsapp,
        hargaJual: item.hargaJual,
        status: item.status,
        pesanProvider: item.pesanProvider ?? "",
        dibuatPada: item.dibuatPada,
      }));

    return {
      hariIni: total(hari),
      bulanIni: total(bulan),
      perKategori,
      daftarGagal,
      /** Angka dihitung dari maksimal 3.000 pesanan terbaru bulan ini. */
      terbatas: bulan.length >= 3_000,
    };
  },
});

/** Pengaturan + kesiapan kredensial untuk panel admin. */
export const getPengaturan = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const pengaturan = await bacaPengaturan(ctx);
    const baris = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    const produk = await ctx.db
      .query("ppobProduk")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(1_200);
    const situs = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
    return {
      ...pengaturan,
      /** API key hanya dilaporkan ADA/TIDAK; nilainya tidak pernah dikirim. */
      kredensialSiap: (process.env.PPOB_H2H_API_KEY ?? "").trim() !== "",
      usernameEnv: (process.env.PPOB_H2H_USERNAME ?? "").trim(),
      webhookSiap: (process.env.PPOB_H2H_WEBHOOK_SECRET ?? "").trim() !== "",
      webhookUrl: situs === "" ? "" : `${situs}/ppob/webhook`,
      jumlahProduk: produk.length,
      jumlahProdukTersedia: produk.filter((item) => item.tersedia).length,
      saldoTerakhir: baris?.saldoTerakhir ?? null,
      saldoDiperbaruiPada: baris?.saldoDiperbaruiPada ?? null,
    };
  },
});

/** Simpan pengaturan etalase. Hanya admin bertotp yang boleh. */
export const simpanPengaturan = mutation({
  args: {
    aktif: v.boolean(),
    provider: v.string(),
    baseUrl: v.string(),
    username: v.string(),
    markupPersen: v.number(),
    markupMin: v.number(),
    markupKategori: v.optional(
      v.object({
        pulsa: v.optional(v.number()),
        data: v.optional(v.number()),
        tokenListrik: v.optional(v.number()),
        game: v.optional(v.number()),
        ewallet: v.optional(v.number()),
      }),
    ),
    nomorAdminWa: v.optional(v.string()),
    saldoMinimum: v.optional(v.number()),
    instruksi: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminSession(ctx);
    const provider = providerAman(args.provider);
    if (!Number.isFinite(args.markupPersen) || args.markupPersen < 0 || args.markupPersen > 50) {
      throw new Error("Markup harus antara 0% dan 50%.");
    }
    if (!Number.isInteger(args.markupMin) || args.markupMin < 0 || args.markupMin > 100_000) {
      throw new Error("Markup minimum harus rupiah bulat antara 0 dan 100.000.");
    }
    const markupKategori = validasiMarkupKategori(args.markupKategori);
    const nomorAdminWa = (args.nomorAdminWa ?? "").trim();
    if (nomorAdminWa !== "" && !/^62\d{8,15}$/.test(nomorAdminWa)) {
      throw new Error("Nomor WhatsApp admin harus format internasional tanpa +, mis. 6281234567890.");
    }
    const saldoMinimum = args.saldoMinimum ?? PPOB_SALDO_MINIMUM_BAWAAN;
    if (!Number.isInteger(saldoMinimum) || saldoMinimum < 0 || saldoMinimum > 100_000_000) {
      throw new Error("Ambang saldo harus rupiah bulat antara 0 dan 100.000.000.");
    }
    const baseUrl = args.baseUrl.trim().replace(/\/+$/, "");
    if (baseUrl !== "" && !/^https:\/\//i.test(baseUrl)) {
      throw new Error("Alamat server H2H harus diawali https://.");
    }
    if (args.instruksi.trim().length > 500) {
      throw new Error("Instruksi maksimal 500 karakter.");
    }

    const patch = {
      slot: SLOT,
      aktif: args.aktif,
      provider,
      baseUrl,
      username: args.username.trim().slice(0, 80),
      markupPersen: args.markupPersen,
      markupMin: args.markupMin,
      markupKategori,
      nomorAdminWa,
      saldoMinimum,
      instruksi: args.instruksi.trim(),
      diperbaruiPada: Date.now(),
      diperbaruiOleh: admin.userId,
    };
    const lama = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (lama === null) await ctx.db.insert("ppobPengaturan", patch);
    else await ctx.db.patch(lama._id, patch);
    // Ambang saldo atau nomor admin bisa berubah di sini; periksa sekali lagi
    // supaya alarm tidak menunggu sampai cek saldo berikutnya.
    await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.periksaSaldo, {});
    return { ok: true };
  },
});

/** Daftar pesanan untuk panel admin, terbaru lebih dulu. */
export const daftarPesananAdmin = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const status = args.status ?? "semua";
    if (status === "semua") {
      return await ctx.db.query("ppobPesanan").withIndex("by_dibuat").order("desc").take(120);
    }
    if (!(STATUS_PESANAN_PPOB as readonly string[]).includes(status)) {
      return [];
    }
    return await ctx.db
      .query("ppobPesanan")
      .withIndex("by_status", (q) =>
        q.eq("status", status as StatusPesananPpob),
      )
      .order("desc")
      .take(120);
  },
});

/** Daftar produk untuk panel admin, termasuk yang nonaktif. */
export const daftarProdukAdmin = query({
  args: { cari: v.optional(v.string()), kategori: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const kueri = (args.cari ?? "").trim().toLowerCase();
    const kategori = kategoriPpobAman(args.kategori ?? "");
    const baris = await ctx.db
      .query("ppobProduk")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(500);
    return baris.filter(
      (item) =>
        (kategori === null || item.kategori === kategori) &&
        (kueri === "" || item.nama.toLowerCase().includes(kueri)),
    );
  },
});

/** Sakelar tampil per produk. */
export const setProdukAktif = mutation({
  args: { id: v.id("ppobProduk"), aktif: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const produk = await ctx.db.get(args.id);
    if (produk === null) throw new Error("Produk tidak ditemukan.");
    await ctx.db.patch(args.id, { aktif: args.aktif });
    return { ok: true };
  },
});

/** Harga jual manual untuk satu produk; tidak boleh di bawah harga modal. */
export const setHargaJual = mutation({
  args: { id: v.id("ppobProduk"), hargaJual: v.number() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    if (!Number.isInteger(args.hargaJual) || args.hargaJual <= 0) {
      throw new Error("Harga jual harus rupiah bulat.");
    }
    const produk = await ctx.db.get(args.id);
    if (produk === null) throw new Error("Produk tidak ditemukan.");
    if (args.hargaJual < produk.hargaModal) {
      throw new Error("Harga jual tidak boleh di bawah harga modal.");
    }
    await ctx.db.patch(args.id, { hargaJual: args.hargaJual, hargaManual: true });
    return { ok: true };
  },
});

/**
 * Terapkan markup sekarang ke SEMUA produk.
 *
 * Tindakan sengaja eksplisit: sinkron harian tidak boleh menimpa harga yang
 * sudah disetel admin. Tombol ini yang menyeragamkan kembali.
 */
export const hitungUlangHarga = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const pengaturan = await bacaPengaturan(ctx);
    const produk = await ctx.db
      .query("ppobProduk")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(1_000);
    let diubah = 0;
    for (const item of produk) {
      const hargaJual = hargaJualDariModal(
        item.hargaModal,
        persenMarkupKategori(
          pengaturan.markupPersen,
          pengaturan.markupKategori,
          item.kategori,
        ),
        pengaturan.markupMin,
      );
      if (hargaJual !== item.hargaJual || item.hargaManual === true) {
        await ctx.db.patch(item._id, { hargaJual, hargaManual: false });
        diubah += 1;
      }
    }
    return { diubah };
  },
});

/**
 * Admin memverifikasi transfer masuk.
 *
 * Nominal dan referensi WAJIB, bukan sekadar centang: tanpa dua angka itu admin
 * hanya melihat klaim pembeli, sedangkan saldo provider tetap berkurang saat
 * topup dikirim. Referensi bank juga dicek unik supaya satu mutasi tidak bisa
 * dipakai untuk dua pesanan.
 */
export const tandaiDibayar = mutation({
  args: {
    id: v.id("ppobPesanan"),
    nominalDiterima: v.number(),
    referensiBank: v.string(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminSession(ctx);
    const pesanan = await ctx.db.get(args.id);
    if (pesanan === null) throw new Error("Pesanan tidak ditemukan.");
    if (pesanan.status !== "menunggu_bayar") {
      throw new Error("Pesanan ini tidak sedang menunggu pembayaran.");
    }
    if (!Number.isInteger(args.nominalDiterima) || args.nominalDiterima <= 0) {
      throw new Error("Nominal diterima harus rupiah bulat lebih dari nol.");
    }
    if (args.nominalDiterima !== pesanan.hargaJual) {
      throw new Error(
        `Nominal diterima Rp ${args.nominalDiterima} tidak sama dengan tagihan Rp ${pesanan.hargaJual}. Periksa mutasi bank sebelum memverifikasi.`,
      );
    }
    const referensi = args.referensiBank.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 80);
    if (referensi.length < 4) {
      throw new Error("Referensi bank wajib diisi (minimal 4 karakter, dari mutasi bank).");
    }
    const bentrok = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_referensi", (q) => q.eq("referensiBank", referensi))
      .first();
    if (bentrok !== null) {
      throw new Error(
        `Referensi bank ini sudah dipakai pesanan ${bentrok.kodePesanan}. Satu transfer tidak boleh diverifikasi dua kali.`,
      );
    }
    await ctx.db.patch(args.id, {
      status: "dibayar",
      dibayarPada: Date.now(),
      diverifikasiOleh: admin.userId,
      nominalDiterima: args.nominalDiterima,
      referensiBank: referensi,
      catatanVerifikasi: (args.catatan ?? "").trim().slice(0, 200),
    });
    await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.kabarkanPesanan, {
      pesananId: args.id,
      jenis: "dibayar",
    });
    return { ok: true };
  },
});

/**
 * Batalkan pesanan yang BELUM dikirim ke provider.
 *
 * `diproses` sengaja ditolak: topup sudah keluar, jadi membatalkannya hanya akan
 * membuat pembeli menerima produk gratis atau refund ganda. Untuk keadaan itu
 * admin menunggu status final lalu menandai refund.
 *
 * Pembatalan selalu berstatus `gagal`; refund dicatat TERPISAH setelah transfer
 * balik benar-benar dilakukan. Menandai `refund` di sini akan mengklaim uang
 * sudah kembali padahal belum.
 */
export const batalkanPesanan = mutation({
  args: { id: v.id("ppobPesanan"), alasan: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const pesanan = await ctx.db.get(args.id);
    if (pesanan === null) throw new Error("Pesanan tidak ditemukan.");
    if (statusFinal(pesanan.status)) {
      throw new Error("Pesanan yang sudah selesai tidak bisa dibatalkan.");
    }
    if (pesanan.status === "diproses") {
      throw new Error(
        "Pesanan sudah dikirim ke provider. Tunggu status final, lalu tandai refund bila gagal.",
      );
    }
    const alasan = args.alasan.trim().slice(0, 200);
    if (alasan.length < 4) throw new Error("Alasan pembatalan wajib diisi.");
    const sudahDibayar = pesanan.status !== "menunggu_bayar";
    await ctx.db.patch(args.id, {
      status: "gagal",
      catatanAdmin: alasan,
      pesanProvider: `Dibatalkan admin: ${alasan}`,
      selesaiPada: Date.now(),
    });
    // Pembeli yang belum membayar tidak perlu dikabari "dana dikembalikan".
    if (sudahDibayar) {
      await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.kabarkanPesanan, {
        pesananId: args.id,
        jenis: "gagal",
      });
    }
    return { ok: true };
  },
});

/**
 * Tandai dana sudah dikembalikan ke pembeli.
 *
 * Hanya pesanan yang PERNAH dibayar dan tidak sukses yang boleh direfund:
 *  - `sukses` dilarang karena produk sudah diterima; refund di sini akan
 *    mengeluarkan uang dua kali untuk barang yang sama.
 *  - `dibayar` harus dibatalkan lebih dulu (status `gagal`) supaya alasannya
 *    tercatat.
 * Referensi transfer balik wajib supaya klaim "sudah dikembalikan" bisa
 * dicocokkan dengan mutasi bank, bukan sekadar catatan bebas.
 */
export const tandaiRefund = mutation({
  args: {
    id: v.id("ppobPesanan"),
    catatan: v.string(),
    referensiRefund: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const pesanan = await ctx.db.get(args.id);
    if (pesanan === null) throw new Error("Pesanan tidak ditemukan.");
    if (pesanan.status === "refund") return { ok: true, sudah: true };
    if (pesanan.status === "menunggu_bayar") {
      throw new Error("Pesanan belum dibayar; batalkan saja, tidak perlu refund.");
    }
    if (pesanan.status === "sukses") {
      throw new Error(
        "Pesanan sudah selesai dan produknya terkirim. Refund hanya untuk pesanan gagal atau yang masih diproses.",
      );
    }
    if (pesanan.status !== "gagal" && pesanan.status !== "diproses") {
      throw new Error("Batalkan pesanan yang sudah dibayar terlebih dahulu, lalu catat refund.");
    }
    if (pesanan.dibayarPada === undefined) {
      throw new Error("Pesanan belum pernah dibayar; tidak ada dana yang perlu dikembalikan.");
    }
    const catatan = args.catatan.trim().slice(0, 200);
    if (catatan.length < 4) throw new Error("Alasan refund wajib diisi.");
    const referensi = args.referensiRefund.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 80);
    if (referensi.length < 4) {
      throw new Error("Referensi transfer balik wajib diisi (dari mutasi bank).");
    }
    await ctx.db.patch(args.id, {
      status: "refund",
      catatanAdmin: catatan,
      referensiRefund: referensi,
      selesaiPada: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.kabarkanPesanan, {
      pesananId: args.id,
      jenis: "refund",
    });
    return { ok: true };
  },
});

/** Simpan saldo terakhir yang dilaporkan provider (dipanggil action). */
export const catatSaldoProvider = internalMutation({
  args: { saldo: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.saldo) || args.saldo < 0) {
      throw new Error("Saldo provider harus rupiah bulat.");
    }
    const sekarang = Date.now();
    const lama = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (lama === null) {
      await ctx.db.insert("ppobPengaturan", {
        slot: SLOT,
        aktif: true,
        provider: "digiflazz",
        markupPersen: PPOB_MARKUP_BAWAAN,
        markupMin: PPOB_MARKUP_MIN_BAWAAN,
        saldoTerakhir: args.saldo,
        saldoDiperbaruiPada: sekarang,
        diperbaruiPada: sekarang,
      });
      await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.periksaSaldo, {});
      return { ok: true };
    }
    await ctx.db.patch(lama._id, {
      saldoTerakhir: args.saldo,
      saldoDiperbaruiPada: sekarang,
    });
    await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.periksaSaldo, {});
    return { ok: true };
  },
});

/** Catat saldo deposit yang dilaporkan provider (atau setoran manual). */
export const catatSaldo = mutation({
  args: {
    arah: v.union(v.literal("masuk"), v.literal("keluar")),
    nominal: v.number(),
    saldoSetelah: v.optional(v.number()),
    keterangan: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminSession(ctx);
    if (!Number.isInteger(args.nominal) || args.nominal <= 0) {
      throw new Error("Nominal saldo harus rupiah bulat.");
    }
    if (
      args.saldoSetelah !== undefined &&
      (!Number.isInteger(args.saldoSetelah) || args.saldoSetelah < 0)
    ) {
      throw new Error("Saldo setelah mutasi harus rupiah bulat.");
    }
    await ctx.db.insert("ppobMutasiSaldo", {
      arah: args.arah,
      nominal: args.nominal,
      saldoSetelah: args.saldoSetelah,
      keterangan: args.keterangan.trim().slice(0, 200) || "Penyesuaian manual",
      sumber: "manual",
      dibuatPada: Date.now(),
      dibuatOleh: admin.userId,
    });
    if (args.saldoSetelah !== undefined) {
      await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.periksaSaldo, {});
    }
    return { ok: true };
  },
});

/**
 * Gerbang untuk action yang tidak punya `ctx.db` sendiri.
 *
 * Action admin memanggil query ini lebih dulu; bila TOTP/sesi tidak sah, action
 * berhenti sebelum menyentuh API provider.
 */
export const gerbangAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminSession(ctx);
    return { userId: admin.userId };
  },
});

/** Data yang dibutuhkan action topup: pesanan + pengaturan. */
export const pesananUntukDiproses = internalQuery({
  args: { id: v.id("ppobPesanan") },
  handler: async (ctx, args) => {
    const pesanan = await ctx.db.get(args.id);
    if (pesanan === null) throw new Error("Pesanan tidak ditemukan.");
    return { pesanan, pengaturan: await bacaPengaturan(ctx) };
  },
});

/** Tandai sedang dikirim ke provider SEBELUM permintaan keluar. */
export const tandaiDiproses = internalMutation({
  args: { id: v.id("ppobPesanan") },
  handler: async (ctx, args) => {
    const pesanan = await ctx.db.get(args.id);
    if (pesanan === null) throw new Error("Pesanan tidak ditemukan.");
    if (pesanan.status !== "dibayar" && pesanan.status !== "diproses") {
      throw new Error("Status pesanan tidak bisa diproses.");
    }
    const pertama = pesanan.status === "dibayar";
    const sekarang = Date.now();
    await ctx.db.patch(args.id, {
      status: "diproses",
      diprosesPada: pesanan.diprosesPada ?? sekarang,
      percobaan: (pesanan.percobaan ?? 0) + 1,
    });
    if (pertama) {
      await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.kabarkanPesanan, {
        pesananId: args.id,
        jenis: "diproses",
      });
    }
    return { ok: true };
  },
});

/**
 * Simpan hasil sinkron harga dari provider.
 *
 * Dipanggil per 100 produk oleh action, supaya satu tulisan tidak melewati
 * batas transaksi Convex ketika provider mengirim ribuan SKU.
 */
export const simpanHasilSinkron = internalMutation({
  args: {
    produk: v.array(
      v.object({
        kode: v.string(),
        nama: v.string(),
        kategori: v.union(
          v.literal("pulsa"),
          v.literal("data"),
          v.literal("token-listrik"),
          v.literal("game"),
          v.literal("ewallet"),
        ),
        operator: v.optional(v.string()),
        hargaModal: v.number(),
        tersedia: v.boolean(),
        stok: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const pengaturan = await bacaPengaturan(ctx);
    const sekarang = Date.now();
    let baru = 0;
    let diperbarui = 0;

    for (const item of args.produk) {
      const tarif = persenMarkupKategori(
        pengaturan.markupPersen,
        pengaturan.markupKategori,
        item.kategori,
      );
      const hargaJualHitung = hargaJualDariModal(
        item.hargaModal,
        tarif,
        pengaturan.markupMin,
      );
      const lama = await ctx.db
        .query("ppobProduk")
        .withIndex("by_kode", (q) => q.eq("kode", item.kode))
        .first();

      if (lama === null) {
        await ctx.db.insert("ppobProduk", {
          kode: item.kode,
          nama: item.nama,
          kategori: item.kategori,
          operator: item.operator,
          hargaModal: item.hargaModal,
          hargaJual: hargaJualHitung,
          aktif: true,
          tersedia: item.tersedia,
          stok: item.stok,
          diperbaruiPada: sekarang,
          dibuatPada: sekarang,
        });
        baru += 1;
        continue;
      }

      // Harga manual dipertahankan selama masih di atas modal + markup minimum;
      // bila modal naik melewatinya, harga dihitung ulang supaya tidak menjual rugi.
      const lantai = hargaJualDariModal(
        item.hargaModal,
        tarif,
        pengaturan.markupMin,
      );
      const pertahankanManual =
        lama.hargaManual === true && lama.hargaJual >= lantai;
      const hargaJual = pertahankanManual ? lama.hargaJual : lantai;

      await ctx.db.patch(lama._id, {
        nama: item.nama,
        kategori: item.kategori,
        operator: item.operator,
        hargaModal: item.hargaModal,
        hargaJual,
        hargaManual: pertahankanManual,
        tersedia: item.tersedia,
        stok: item.stok,
        diperbaruiPada: sekarang,
      });
      diperbarui += 1;
    }
    return { baru, diperbarui };
  },
});

/**
 * Produk yang TIDAK ikut sinkron terakhir berarti sudah ditarik provider.
 * Ditandai tidak tersedia, bukan dihapus: riwayat pesanan tetap menunjuk kode.
 */
export const matikanProdukLama = internalMutation({
  args: { sebelum: v.number() },
  handler: async (ctx, args) => {
    const lama = await ctx.db
      .query("ppobProduk")
      .withIndex("by_diperbarui", (q) => q.lt("diperbaruiPada", args.sebelum))
      .filter((q) => q.eq(q.field("tersedia"), true))
      .take(300);
    for (const item of lama) {
      await ctx.db.patch(item._id, { tersedia: false });
    }
    return { dimatikan: lama.length };
  },
});

/** Cap waktu sinkron terakhir + admin pelakunya. */
export const catatSinkron = internalMutation({
  args: { jumlah: v.number(), oleh: v.id("users") },
  handler: async (ctx, args) => {
    const sekarang = Date.now();
    const lama = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (lama === null) {
      await ctx.db.insert("ppobPengaturan", {
        slot: SLOT,
        aktif: true,
        provider: "digiflazz",
        markupPersen: PPOB_MARKUP_BAWAAN,
        markupMin: PPOB_MARKUP_MIN_BAWAAN,
        terakhirSinkron: sekarang,
        terakhirSinkronOleh: args.oleh,
        diperbaruiPada: sekarang,
        diperbaruiOleh: args.oleh,
      });
      return { ok: true };
    }
    await ctx.db.patch(lama._id, {
      terakhirSinkron: sekarang,
      terakhirSinkronOleh: args.oleh,
      diperbaruiPada: sekarang,
    });
    return { ok: true };
  },
});

/**
 * Terapkan status dari provider — satu pintu untuk webhook, cek manual, dan
 * cron. Status final tidak pernah dibalik oleh pesan susulan yang lebih tua.
 */
export const terapkanStatus = internalMutation({
  args: {
    refId: v.string(),
    status: v.string(),
    rc: v.optional(v.string()),
    sn: v.optional(v.string()),
    pesan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pesanan = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_ref", (q) => q.eq("refId", args.refId))
      .first();
    if (pesanan === null) return { ok: false, alasan: "Pesanan tidak dikenal." };

    const baru = statusDariProvider(args.status, args.rc);
    if (statusFinal(pesanan.status) && pesanan.status !== baru) {
      return { ok: true, diabaikan: true };
    }
    // Webhook yang diulang dengan status yang sama tidak boleh mengirim kabar
    // kedua ke pembeli.
    if (pesanan.status === baru) {
      return { ok: true, diabaikan: true };
    }
    if (pesanan.status === "menunggu_bayar") {
      // Provider tidak boleh menyentuh pesanan yang belum diverifikasi admin.
      // Pesan tetap dicatat agar keanehan ini terlihat, tetapi status tidak
      // berubah: barang digital tidak boleh terkirim sebelum uang masuk.
      await ctx.db.patch(pesanan._id, {
        pesanProvider: args.pesan ?? pesanan.pesanProvider,
      });
      return { ok: true, diabaikan: true };
    }

    const sekarang = Date.now();
    await ctx.db.patch(pesanan._id, {
      status: baru,
      ...(args.sn !== undefined ? { sn: args.sn } : {}),
      ...(args.pesan !== undefined ? { pesanProvider: args.pesan } : {}),
      ...(statusFinal(baru) && pesanan.selesaiPada === undefined
        ? { selesaiPada: sekarang }
        : {}),
      ...(pesanan.diprosesPada === undefined && baru === "diproses"
        ? { diprosesPada: sekarang }
        : {}),
    });
    await ctx.scheduler.runAfter(0, internal.ppobNotifikasi.kabarkanPesanan, {
      pesananId: pesanan._id,
      jenis: baru,
    });
    return { ok: true, status: baru };
  },
});

/** Pesanan yang masih menunggu jawaban provider, untuk cron pemeriksa. */
export const pesananPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const batas = Date.now() - 2 * 60 * 1000;
    const baris = await ctx.db
      .query("ppobPesanan")
      .withIndex("by_status", (q) => q.eq("status", "diproses"))
      .take(25);
    return baris
      .filter((item) => (item.diprosesPada ?? item.dibuatPada) <= batas)
      .map((item) => ({
        id: item._id,
        refId: item.refId,
        dibuatPada: item.dibuatPada,
      }));
  },
});

/** Apakah ada pengaturan etalase — dipakai halaman publik untuk pesan kosong. */
export const ringkasEtalase = query({
  args: {},
  handler: async (ctx) => {
    const pengaturan = await bacaPengaturan(ctx);
    const tersedia = await ctx.db
      .query("ppobProduk")
      .withIndex("by_aktif", (q) => q.eq("aktif", true))
      .filter((q) => q.eq(q.field("tersedia"), true))
      .first();
    return {
      aktif: pengaturan.aktif,
      adaProduk: tersedia !== null,
      terakhirSinkron: pengaturan.terakhirSinkron,
      instruksi: pengaturan.instruksi,
    };
  },
});

/** Dipakai uji: memastikan pengaturan bisa dibaca tanpa admin. */
export const _pengaturanUntukUji = internalQuery({
  args: {},
  handler: async (ctx) => bacaPengaturan(ctx),
});
