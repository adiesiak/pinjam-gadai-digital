/**
 * Kabar WhatsApp untuk pesanan PPOB.
 *
 * Dipisah dari `ppob.ts` karena pengiriman butuh action (jaringan), sedangkan
 * perubahan status terjadi di mutation. Mutation hanya MENJADWALKAN action ini;
 * pembuatan pesanan dan verifikasi pembayaran tetap berhasil walau gateway
 * WhatsApp sedang mati.
 *
 * Penerima:
 *  - pembeli: setiap status berubah (dibayar → diproses → sukses/gagal/refund);
 *  - admin: satu ping saat pesanan baru dibuat, agar transfer masuk cepat dicek.
 *
 * Kegagalan kirim dicatat di `waLogs` apa adanya — tidak dilempar, karena pesan
 * yang gagal tidak boleh membatalkan transaksi yang sudah tersimpan.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { LABEL_KATEGORI_PPOB, kategoriPpobAman } from "../lib/ppob";

const SLOT = "global";

/** Jangan mengulang alarm saldo lebih sering dari ini. */
const JEDA_ALARM_SALDO_MS = 12 * 60 * 60 * 1000;

function rupiah(angka: number): string {
  // Tanpa `Intl`: action Convex berjalan di isolate yang tidak menjamin
  // dukungan locale, dan satu pesan gagal format tidak boleh menggagalkan kabar.
  return `Rp ${String(angka).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function labelKategori(nilai: string): string {
  const kategori = kategoriPpobAman(nilai);
  return kategori === null ? "Produk digital" : LABEL_KATEGORI_PPOB[kategori];
}

type DataKabar = {
  kodePesanan: string;
  namaProduk: string;
  kategori: string;
  nomorTujuan: string;
  namaPembeli: string;
  whatsapp: string;
  hargaJual: number;
  sn: string | null;
  pesanProvider: string | null;
};

/** Data satu pesanan + nomor admin, dibaca action sebelum menyusun pesan. */
export const _dataKabar = internalQuery({
  args: { pesananId: v.id("ppobPesanan") },
  handler: async (ctx, args) => {
    const pesanan = await ctx.db.get(args.pesananId);
    if (pesanan === null) return null;
    const pengaturan = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    const data: DataKabar = {
      kodePesanan: pesanan.kodePesanan,
      namaProduk: pesanan.namaProduk,
      kategori: pesanan.kategori,
      nomorTujuan: pesanan.nomorTujuan,
      namaPembeli: pesanan.namaPembeli ?? "",
      whatsapp: pesanan.whatsapp,
      hargaJual: pesanan.hargaJual,
      sn: pesanan.sn ?? null,
      pesanProvider: pesanan.pesanProvider ?? null,
    };
    return {
      data,
      nomorAdminWa: (pengaturan?.nomorAdminWa ?? "").trim(),
    };
  },
});

/** Kalimat untuk pembeli menurut status barunya. */
function pesanPembeli(jenis: string, data: DataKabar): string | null {
  const pembuka = `Pesanan ${data.kodePesanan} — ${data.namaProduk} (${labelKategori(data.kategori)}).`;
  if (jenis === "dibayar") {
    return `${pembuka}\n\nPembayaran sudah kami terima. Pesanan sedang disiapkan untuk nomor tujuan ${data.nomorTujuan}.`;
  }
  if (jenis === "diproses") {
    return `${pembuka}\n\nPesanan sedang diproses di server pulsa. Kami kabari lagi setelah selesai.`;
  }
  if (jenis === "sukses") {
    const seri = data.sn !== null && data.sn !== "" ? `\n\nNomor seri/token: ${data.sn}` : "";
    return `${pembuka}\n\nPesanan selesai.${seri}\n\nSimpan pesan ini sebagai bukti pembelian.`;
  }
  if (jenis === "gagal") {
    return `${pembuka}\n\nPesanan gagal diproses di server pulsa. Tim PINDAI akan menghubungi Anda untuk pengembalian dana.`;
  }
  if (jenis === "refund") {
    return `${pembuka}\n\nDana pesanan sudah dikembalikan. Terima kasih sudah menunggu.`;
  }
  return null;
}

function pesanAdminBaru(data: DataKabar): string {
  return [
    `Pesanan PPOB baru: ${data.kodePesanan}`,
    `${data.namaProduk} (${labelKategori(data.kategori)})`,
    `Nominal ${rupiah(data.hargaJual)} · tujuan ${data.nomorTujuan}`,
    `Pembeli ${data.namaPembeli || "tanpa nama"} · WA ${data.whatsapp}`,
    "Buka panel admin PPOB untuk memverifikasi transfer.",
  ].join("\n");
}

/**
 * Kirim satu kabar. Jenis `baru` hanya untuk admin; jenis status lainnya hanya
 * untuk pembeli. Nomor kosong berarti fitur belum diatur, bukan error.
 */
export const kabarkanPesanan = internalAction({
  args: { pesananId: v.id("ppobPesanan"), jenis: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; alasan?: string }> => {
    const hasil = await ctx.runQuery(internal.ppobNotifikasi._dataKabar, {
      pesananId: args.pesananId,
    });
    if (hasil === null) return { ok: false, alasan: "Pesanan tidak ditemukan." };

    const untukAdmin = args.jenis === "baru";
    const nomor = untukAdmin ? hasil.nomorAdminWa : hasil.data.whatsapp;
    if (nomor === "") {
      return {
        ok: false,
        alasan: untukAdmin
          ? "Nomor WhatsApp admin belum diisi di pengaturan PPOB."
          : "Pesanan tidak punya nomor WhatsApp.",
      };
    }
    const isi = untukAdmin
      ? pesanAdminBaru(hasil.data)
      : pesanPembeli(args.jenis, hasil.data);
    if (isi === null) return { ok: false, alasan: "Jenis kabar tidak dikenal." };

    const kirim = await ctx.runAction(internal.whatsapp._kirimPesanUmum, {
      nomor,
      isi,
    });
    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: nomor,
      jenis: `ppob_${untukAdmin ? "admin_baru" : args.jenis}`,
      isiPesan: isi,
      status: kirim.ok ? "terkirim" : "gagal",
      respon: kirim.respon.slice(0, 500),
    });
    return { ok: kirim.ok };
  },
});

/**
 * Klaim alarm saldo secara atomik.
 *
 * Saldo bisa diperiksa beberapa kali dalam satu menit (cek manual, setelah
 * topup, dan setelah webhook). Klaim di satu mutation mencegah admin menerima
 * pesan alarm yang sama berkali-kali.
 */
export const _klaimAlarmSaldo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (row === null) return { klaim: false as const };
    const nomor = (row.nomorAdminWa ?? "").trim();
    const saldo = row.saldoTerakhir;
    const ambang = row.saldoMinimum ?? 100_000;
    if (nomor === "" || saldo === undefined || saldo > ambang) {
      return { klaim: false as const };
    }
    const sekarang = Date.now();
    if (
      row.saldoPeringatanPada !== undefined &&
      sekarang - row.saldoPeringatanPada < JEDA_ALARM_SALDO_MS
    ) {
      return { klaim: false as const };
    }
    await ctx.db.patch(row._id, { saldoPeringatanPada: sekarang });
    return { klaim: true as const, nomor, saldo, ambang };
  },
});

/** Alarm yang gagal terkirim boleh dicoba lagi pada pemeriksaan berikutnya. */
export const _lepasAlarmSaldo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (row !== null) {
      await ctx.db.patch(row._id, { saldoPeringatanPada: 0 });
    }
  },
});

/** Nomor admin PPOB; kosong berarti alarm tidak dikirim. */
export const _nomorAdminPpob = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("ppobPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    return (row?.nomorAdminWa ?? "").trim();
  },
});

/**
 * Kabar instan untuk aksi admin yang mengubah uang atau harga.
 *
 * Verifikasi transfer, refund, dan penerapan markup massal tidak boleh lewat
 * diam-diam: satu salah klik bisa mengirim produk atau mengubah harga seluruh
 * etalase. Pesan ini sengaja ringkas dan menyebut nominalnya supaya admin lain
 * bisa menegur saat itu juga, bukan saat tutup buku.
 */
export const kabarkanAksiSensitif = internalAction({
  args: { aksi: v.string(), ringkas: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const nomor = await ctx.runQuery(internal.ppobNotifikasi._nomorAdminPpob, {});
    if (nomor === "") return { ok: false };

    const isi = [
      `PPOB — ${args.aksi}`,
      args.ringkas,
      "Bila ini bukan Anda, segera periksa panel PPOB dan ganti kredensial admin.",
    ].join("\n");
    const kirim = await ctx.runAction(internal.whatsapp._kirimPesanUmum, {
      nomor,
      isi,
    });
    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: nomor,
      jenis: "ppob_admin_sensitif",
      isiPesan: isi,
      status: kirim.ok ? "terkirim" : "gagal",
      respon: kirim.respon.slice(0, 500),
    });
    return { ok: kirim.ok };
  },
});

/** Alarm saat saldo buku dan saldo provider berbeda di luar ambang. */
export const kabarkanSelisihRekonsiliasi = internalAction({
  args: {
    selisih: v.number(),
    saldoBuku: v.number(),
    saldoProvider: v.number(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const nomor = await ctx.runQuery(internal.ppobNotifikasi._nomorAdminPpob, {});
    if (nomor === "") return { ok: false };

    const isi = [
      "Rekonsiliasi saldo PPOB menemukan selisih.",
      `Saldo buku: ${rupiah(args.saldoBuku)}`,
      `Saldo provider: ${rupiah(args.saldoProvider)}`,
      `Selisih: ${rupiah(args.selisih)}`,
      "Periksa deposit, pesanan yang dikirim, dan mutasi saldo provider hari ini.",
    ].join("\n");
    const kirim = await ctx.runAction(internal.whatsapp._kirimPesanUmum, {
      nomor,
      isi,
    });
    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: nomor,
      jenis: "ppob_selisih_saldo",
      isiPesan: isi,
      status: kirim.ok ? "terkirim" : "gagal",
      respon: kirim.respon.slice(0, 500),
    });
    return { ok: kirim.ok };
  },
});

/** Periksa saldo provider dan kirim alarm bila di bawah ambang. */
export const periksaSaldo = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean }> => {
    const klaim = await ctx.runMutation(internal.ppobNotifikasi._klaimAlarmSaldo, {});
    if (!klaim.klaim) return { ok: true };

    const isi = [
      `Saldo PPOB menipis: ${rupiah(klaim.saldo)}.`,
      `Ambang yang diatur ${rupiah(klaim.ambang)}.`,
      "Segera lakukan deposit di server pulsa agar pesanan berikutnya tidak gagal.",
    ].join("\n");
    const kirim = await ctx.runAction(internal.whatsapp._kirimPesanUmum, {
      nomor: klaim.nomor,
      isi,
    });
    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: klaim.nomor,
      jenis: "ppob_alarm_saldo",
      isiPesan: isi,
      status: kirim.ok ? "terkirim" : "gagal",
      respon: kirim.respon.slice(0, 500),
    });
    if (!kirim.ok) {
      await ctx.runMutation(internal.ppobNotifikasi._lepasAlarmSaldo, {});
    }
    return { ok: kirim.ok };
  },
});
