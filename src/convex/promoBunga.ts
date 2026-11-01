/**
 * Promo bunga pinjaman harian — pengaturan admin dan pembacaan oleh mesin harga.
 *
 * Dua permukaan:
 *  - `berjalan` dibaca formulir pengajuan, supaya angka yang tampil di layar
 *    sama dengan yang nanti dipakai server;
 *  - `daftar`/`simpan`/`setAktif`/`hapus` di balik gerbang Super Admin.
 *
 * Kampanye bisa mengganti bunga (`bunga_pengganti`), memotong poin dari bunga
 * normal (`potongan_bunga`), atau membebaskan biaya admin (`bebas_admin`).
 * Tenor kampanye mengikuti tenor harian sah 7–50 hari, termasuk hari yang
 * dipilih nasabah lewat tanggal jatuh tempo seperti 10 atau 30 hari.
 * `promoBungaUntukPengajuan` dipanggil `loans.createLoanApplication` dan
 * hasilnya dibekukan pada pinjaman, jadi mengubah promo kemudian tidak pernah
 * menggeser kontrak yang sudah terbit.
 */
import { v } from "convex/values";

import {
  pilihPromoBunga,
  statusPromoBunga,
  periksaIsiPromoBunga,
  type PromoBungaRingkas,
} from "../lib/promoBunga";
import { formatRupiah, percentOf } from "../lib/money";
import { kelompokkanMingguan } from "../lib/trenPromo";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";

/** Batas promo yang dibaca satu query; kampanye aktif jauh di bawah angka ini. */
const BATAS_PROMO = 50;

/**
 * Batas pinjaman yang dihitung per promo di laporan efektivitas.
 * Satu kampanye biasanya jauh di bawah angka ini; bila tercapai, laporan
 * menandainya terbuka (`dibatasi`) alih-alih menyajikan angka seolah lengkap.
 */
const BATAS_PINJAMAN_PROMO = 500;

/**
 * Batas pinjaman yang dibaca saat memeriksa pagu subsidi pada setiap pengajuan.
 *
 * Lebih besar dari batas laporan karena angka ini menjaga uang, tetapi tetap
 * berbatas: satu pengajuan tidak boleh membaca seluruh riwayat kampanye. Bila
 * batas ini tercapai, pemeriksaan memakai jumlah yang terbaca dan menandainya
 * di audit — pagu tetap berlaku, hanya angkanya menjadi batas bawah.
 */
const BATAS_HITUNG_SUBSIDI = 2_000;

function ringkas(row: Doc<"promoBunga">): PromoBungaRingkas {
  return {
    _id: String(row._id),
    nama: row.nama,
    jenis: row.jenis ?? "bunga_pengganti",
    persenBunga: row.persenBunga,
    potonganPersen: row.potonganPersen,
    tenor: row.tenor,
    mulai: row.mulai,
    selesai: row.selesai,
    aktif: row.aktif,
    bolehVoucher: row.bolehVoucher,
    paguSubsidi: row.paguSubsidi,
  };
}

/**
 * Promo yang berlaku sekarang, untuk formulir pengajuan.
 *
 * Tanpa gerbang admin: nasabah harus bisa melihat bunga promo sebelum
 * mengirim. Yang dikirim hanya data kampanye (nama, bunga, tenor, tanggal) —
 * bukan catatan pembuat atau riwayat perubahan.
 */
export const berjalan = query({
  args: {},
  handler: async (ctx) => {
    const sekarang = Date.now();
    const rows = await ctx.db
      .query("promoBunga")
      .withIndex("by_aktif", (q) => q.eq("aktif", true))
      .take(BATAS_PROMO);

    return rows
      .filter((row) => row.mulai <= sekarang && sekarang <= row.selesai)
      .map((row) => ({
        _id: String(row._id),
        nama: row.nama,
        jenis: row.jenis ?? "bunga_pengganti",
        persenBunga: row.persenBunga,
        potonganPersen: row.potonganPersen,
        tenor: row.tenor,
        mulai: row.mulai,
        selesai: row.selesai,
        aktif: true,
        // Formulir memakai ini untuk menyembunyikan voucher potongan bunga
        // pada kampanye yang menolak tumpukan.
        bolehVoucher: row.bolehVoucher !== false,
      }));
  },
});

/** Seluruh promo bunga untuk panel admin, terbaru diperbarui dulu. */
export const daftar = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const rows = await ctx.db
      .query("promoBunga")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(BATAS_PROMO);

    return rows.map((row) => ({
      _id: row._id,
      nama: row.nama,
      jenis: row.jenis ?? "bunga_pengganti",
      persenBunga: row.persenBunga,
      potonganPersen: row.potonganPersen,
      tenor: row.tenor,
      mulai: row.mulai,
      selesai: row.selesai,
      aktif: row.aktif,
      status: statusPromoBunga(row, sekarang),
      berjalan: row.aktif && row.mulai <= sekarang && sekarang <= row.selesai,
      bolehVoucher: row.bolehVoucher !== false,
      paguSubsidi: row.paguSubsidi ?? null,
      paguPeringatan: row.paguPeringatan ?? null,
      diperbaruiPada: row.diperbaruiPada,
      diperbaruiOleh: row.diperbaruiOleh,
    }));
  },
});

export const simpan = mutation({
  args: {
    id: v.optional(v.id("promoBunga")),
    nama: v.string(),
    /** Kosong = bunga pengganti, agar pemanggil lama tetap sah. */
    jenis: v.optional(
      v.union(
        v.literal("bunga_pengganti"),
        v.literal("potongan_bunga"),
        v.literal("bebas_admin"),
      ),
    ),
    persenBunga: v.number(),
    /** Poin potongan untuk `potongan_bunga`. */
    potonganPersen: v.optional(v.number()),
    tenor: v.array(v.number()),
    mulai: v.number(),
    selesai: v.number(),
    aktif: v.boolean(),
    /** Kosong = boleh digabung voucher potongan bunga (perilaku lama). */
    bolehVoucher: v.optional(v.boolean()),
    /** Kosong/0 = tanpa pagu subsidi. */
    paguSubsidi: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const isi = {
      nama: args.nama.trim(),
      jenis: args.jenis ?? "bunga_pengganti",
      persenBunga: args.jenis === "potongan_bunga" || args.jenis === "bebas_admin"
        ? 0
        : args.persenBunga,
      potonganPersen: args.jenis === "potongan_bunga" ? args.potonganPersen : undefined,
      tenor: [...new Set(args.tenor)].sort((a, b) => a - b),
      mulai: args.mulai,
      selesai: args.selesai,
      aktif: args.aktif,
      bolehVoucher: args.bolehVoucher !== false,
      paguSubsidi: args.paguSubsidi === 0 ? undefined : args.paguSubsidi,
    };

    const kesalahan = periksaIsiPromoBunga(isi);
    if (kesalahan.length > 0) throw new Error(kesalahan[0]);

    const sekarang = Date.now();
    let id = args.id;

    if (id !== undefined) {
      const lama = await ctx.db.get(id);
      if (lama === null) throw new Error("Promo bunga tidak ditemukan.");
      await ctx.db.patch(id, {
        ...isi,
        diperbaruiPada: sekarang,
        diperbaruiOleh: olehLabel,
      });
    } else {
      id = await ctx.db.insert("promoBunga", {
        ...isi,
        dibuatPada: sekarang,
        diperbaruiPada: sekarang,
        diperbaruiOleh: olehLabel,
      });
    }

    await audit(
      ctx,
      userId,
      olehLabel,
      args.id === undefined ? "promo_bunga_dibuat" : "promo_bunga_diubah",
      id,
      `${isi.nama} · ${
        isi.jenis === "potongan_bunga"
          ? `potongan ${isi.potonganPersen} poin`
          : isi.jenis === "bebas_admin"
            ? "bebas biaya admin"
            : `${isi.persenBunga}%`
      } · tenor ${isi.tenor.join("/")} · ${
        isi.aktif ? "aktif" : "nonaktif"
      }${isi.paguSubsidi !== undefined ? ` · pagu ${formatRupiah(isi.paguSubsidi)}` : ""}${
        isi.bolehVoucher === false ? " · tanpa voucher bunga" : ""
      }`,
    );

    return { id };
  },
});

/**
 * Nyalakan/matikan satu promo tanpa membuka formulir.
 *
 * Mematikan promo TIDAK mengubah pinjaman yang sudah memakainya: angka itu
 * sudah dibekukan pada pinjaman. Yang berhenti hanyalah pemakaian baru.
 */
export const setAktif = mutation({
  args: { id: v.id("promoBunga"), aktif: v.boolean() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Promo bunga tidak ditemukan.");

    await ctx.db.patch(args.id, {
      aktif: args.aktif,
      diperbaruiPada: Date.now(),
      diperbaruiOleh: olehLabel,
    });
    await audit(
      ctx,
      userId,
      olehLabel,
      args.aktif ? "promo_bunga_diaktifkan" : "promo_bunga_dinonaktifkan",
      args.id,
      `${row.nama} · ${row.persenBunga}%`,
    );
    return { ok: true, aktif: args.aktif };
  },
});

export const hapus = mutation({
  args: { id: v.id("promoBunga") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Promo bunga tidak ditemukan.");

    await ctx.db.delete(args.id);
    await audit(
      ctx,
      userId,
      olehLabel,
      "promo_bunga_dihapus",
      args.id,
      `${row.nama} · ${row.persenBunga}% · tenor ${row.tenor.join("/")}`,
    );
    return { ok: true };
  },
});

/**
 * Promo terbaik yang berlaku untuk satu tenor pada saat pengajuan disimpan.
 *
 * Mengembalikan baris penuh (bukan ringkas) karena pemanggil perlu `_id` untuk
 * snapshot pada pinjaman. Bila beberapa promo berlaku, yang bunganya paling
 * rendah menang — aturan yang sama dengan yang ditampilkan formulir.
 */
export async function promoBungaUntukPengajuan(
  ctx: QueryCtx,
  args: { tenor: number; sekarang: number; persenNormal?: number },
): Promise<Doc<"promoBunga"> | null> {
  const rows = await ctx.db
    .query("promoBunga")
    .withIndex("by_aktif", (q) => q.eq("aktif", true))
    .take(BATAS_PROMO);

  const terpilih = pilihPromoBunga(
    rows.map((row) => ringkas(row)),
    {
      tenor: args.tenor,
      sekarang: args.sekarang,
      ...(args.persenNormal === undefined ? {} : { persenNormal: args.persenNormal }),
    },
  );
  if (terpilih === null) return null;
  return rows.find((row) => String(row._id) === terpilih._id) ?? null;
}

/**
 * Subsidi promo yang sudah terpakai oleh satu kampanye, dalam rupiah.
 *
 * Sumbernya `loans.promoBungaId` — catatan yang sama dengan laporan efektivitas,
 * sehingga pagu dan laporan tidak bisa berbeda pendapat. Selisih dihitung dari
 * tarif normal yang dibekukan pada pinjaman, bukan dari tarif hari ini: kontrak
 * lama tetap dinilai dengan angka yang berlaku saat ia terbit.
 */
export async function subsidiTerpakaiPromo(
  ctx: QueryCtx,
  promo: Doc<"promoBunga">,
): Promise<{ subsidi: number; dibatasi: boolean }> {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_promoBunga", (q) => q.eq("promoBungaId", promo._id))
    .take(BATAS_HITUNG_SUBSIDI);
  let subsidi = 0;
  for (const loan of loans) {
    // Pembebasan biaya admin adalah subsidi kampanye yang nyata, walau bunga
    // pinjaman tidak berubah. Disimpan terpisah dari voucher agar laporan bisa
    // memisahkan keduanya.
    subsidi += Math.max(0, loan.promoDiskonAdmin ?? 0);
    const normal = loan.promoBungaPersenNormal;
    if (normal === undefined || normal <= 0) continue;
    const persen = loan.promoBungaPersen ?? promo.persenBunga;
    if (persen >= normal) continue;
    subsidi += percentOf(loan.pokokPinjaman, normal) - percentOf(loan.pokokPinjaman, persen);
  }
  return { subsidi, dibatasi: loans.length >= BATAS_HITUNG_SUBSIDI };
}

/**
 * Tolak pengajuan yang akan melewati pagu subsidi kampanye.
 *
 * Sengaja HANYA memeriksa dan melempar — tidak mematikan kampanye di sini.
 * Mutation Convex bersifat transaksional: patch yang diikuti `throw` akan ikut
 * dibatalkan, sehingga auto-stop yang ditulis di dalam fungsi ini tidak pernah
 * benar-benar tersimpan. Penghentian kampanye dikerjakan
 * `hentikanPromoJikaPaguHabis` setelah transaksi pengajuan berhasil.
 *
 * Yang ditolak adalah pengajuan yang MEMBUAT total melewati pagu (subsidi
 * pinjaman ini ikut dihitung), bukan baru setelah pagu terlampaui — jadi pagu
 * benar-benar menjadi batas, bukan catatan setelah kejadian.
 */
export async function pastikanPaguPromo(
  ctx: QueryCtx,
  args: { promo: Doc<"promoBunga">; subsidiBaru: number },
): Promise<void> {
  const pagu = args.promo.paguSubsidi ?? 0;
  if (pagu <= 0) return;

  const { subsidi } = await subsidiTerpakaiPromo(ctx, args.promo);
  const total = subsidi + Math.max(0, args.subsidiBaru);
  if (total > pagu) {
    throw new Error(
      `Pagu subsidi promo ${args.promo.nama} sudah tercapai (${formatRupiah(subsidi)} dari ${formatRupiah(pagu)}). Ajukan ulang tanpa promo, atau minta admin menaikkan pagunya.`,
    );
  }
}

/**
 * Hentikan kampanye yang pagunya sudah habis, setelah pengajuan terakhirnya
 * tersimpan. Dijadwalkan `loans.createLoanApplication` hanya bila promo dipakai.
 *
 * Idempoten: dipanggil berulang hanya menulis audit satu kali, karena syaratnya
 * `promo.aktif` dan penanda `paguPeringatan` yang tersimpan di baris kampanye.
 * Pinjaman yang sudah terbit tidak pernah diubah — hanya kampanye yang berhenti
 * menerima pengajuan baru.
 */
export const hentikanPromoJikaPaguHabis = internalMutation({
  args: { promoBungaId: v.id("promoBunga") },
  handler: async (ctx, args): Promise<{ dihentikan: boolean; subsidi: number }> => {
    const promo = await ctx.db.get(args.promoBungaId);
    if (promo === null) return { dihentikan: false, subsidi: 0 };
    const pagu = promo.paguSubsidi ?? 0;
    if (pagu <= 0) return { dihentikan: false, subsidi: 0 };

    const { subsidi, dibatasi } = await subsidiTerpakaiPromo(ctx, promo);
    const oleh = "sistem-promo";
    const sekarang = Date.now();

    if (subsidi >= pagu) {
      if (promo.aktif) {
        await ctx.db.patch(promo._id, {
          aktif: false,
          paguPeringatan: "100",
          diperbaruiPada: sekarang,
          diperbaruiOleh: oleh,
        });
        await audit(
          ctx,
          undefined,
          oleh,
          "promo_bunga_dihentikan_pagu",
          promo.nama,
          `Pagu subsidi ${formatRupiah(pagu)} tercapai (terpakai ${formatRupiah(subsidi)}). Promo dimatikan otomatis; pinjaman yang sudah terbit tidak berubah.${dibatasi ? " Angka pemakaian dihitung dari 2.000 pinjaman terakhir kampanye ini." : ""}`,
        );
      }
      return { dihentikan: true, subsidi };
    }

    if (subsidi >= pagu * 0.8 && promo.paguPeringatan !== "80") {
      await ctx.db.patch(promo._id, {
        paguPeringatan: "80",
        diperbaruiPada: sekarang,
        diperbaruiOleh: oleh,
      });
      await audit(
        ctx,
        undefined,
        oleh,
        "promo_bunga_pagu_80",
        promo.nama,
        `Pagu subsidi terpakai ${Math.round((subsidi / pagu) * 100)}% (${formatRupiah(subsidi)} dari ${formatRupiah(pagu)}). Kampanye tetap berjalan; siapkan pagu tambahan atau hentikan lebih awal.`,
      );
    }
    return { dihentikan: false, subsidi };
  },
});

/**
 * Laporan efektivitas tiap kampanye bunga promo.
 *
 * Yang dihitung: berapa pinjaman memakai promo itu, total pokoknya, dan
 * subsidi platform — selisih bunga normal dengan bunga promo dalam rupiah.
 * Voucher potongan bunga tidak ikut dihitung sebagai subsidi promo:
 * `promoBungaPersen` menyimpan tarif promo saat pengajuan, terpisah dari
 * `persenBunga` yang mungkin sudah dipotong voucher.
 *
 * Pinjaman lama yang disimpan sebelum `promoBungaPersen` ada memakai tarif
 * promo saat ini sebagai perkiraan; angkanya ditandai `perkiraan` pada baris.
 */
export const efektivitas = query({
  args: {
    /** Batas waktu pengajuan (ms), inklusif. Kosong = tanpa batas. */
    dari: v.optional(v.number()),
    sampai: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const promos = await ctx.db
      .query("promoBunga")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(BATAS_PROMO);

    let totalPinjaman = 0;
    let totalPokok = 0;
    let totalSubsidi = 0;
    let totalSubsidiVoucher = 0;
    let dibatasi = false;
    const baris = [];
    // Satu pinjaman hanya punya satu promo, jadi kontribusi mingguan bisa
    // dikumpulkan lintas kampanye tanpa risiko terhitung dua kali.
    const kontribusiMinggu: { waktu: number; subsidi: number }[] = [];

    for (const promo of promos) {
      const diambil = await ctx.db
        .query("loans")
        .withIndex("by_promoBunga", (q) => q.eq("promoBungaId", promo._id))
        .take(BATAS_PINJAMAN_PROMO);
      if (diambil.length >= BATAS_PINJAMAN_PROMO) dibatasi = true;
      const loans = diambil.filter((loan) => {
        // Tanggal pengajuan yang dicatat admin (data lama) menang atas waktu
        // baris dibuat, supaya saringan tanggal membaca tanggal yang sama
        // dengan yang dilihat admin di antrean.
        const waktu = loan.diajukanPada ?? loan._creationTime;
        if (args.dari !== undefined && waktu < args.dari) return false;
        if (args.sampai !== undefined && waktu > args.sampai) return false;
        return true;
      });

      let pokok = 0;
      let subsidi = 0;
      let subsidiVoucher = 0;
      let perkiraan = false;
      for (const loan of loans) {
        pokok += loan.pokokPinjaman;
        // Kampanye bebas admin menyumbang biaya admin yang tidak ditagih.
        // Ini bukan voucher, jadi tidak masuk `subsidiVoucher`.
        const subsidiAdmin = Math.max(0, loan.promoDiskonAdmin ?? 0);
        subsidi += subsidiAdmin;
        // Subsidi voucher dihitung terpisah dari subsidi promo: keduanya
        // mengurangi pendapatan platform, tetapi hanya promo yang menjadi
        // tanggung jawab kampanye. Menjumlahkannya di satu kolom menyembunyikan
        // biaya tumpukan yang justru ingin dilihat admin.
        const poinVoucher = loan.voucherDiskonBunga ?? 0;
        if (poinVoucher > 0) {
          subsidiVoucher += percentOf(loan.pokokPinjaman, poinVoucher);
        }
        let subsidiPinjaman = 0;
        const normal = loan.promoBungaPersenNormal;
        if (normal !== undefined && normal > 0) {
          const persenPromo = loan.promoBungaPersen ?? promo.persenBunga;
          if (loan.promoBungaPersen === undefined) perkiraan = true;
          if (persenPromo < normal) {
            subsidiPinjaman =
              percentOf(loan.pokokPinjaman, normal) -
              percentOf(loan.pokokPinjaman, persenPromo);
          }
        }
        subsidi += subsidiPinjaman;
        kontribusiMinggu.push({
          waktu: loan.diajukanPada ?? loan._creationTime,
          subsidi: subsidiPinjaman + subsidiAdmin,
        });
      }

      totalPinjaman += loans.length;
      totalPokok += pokok;
      totalSubsidi += subsidi;
      totalSubsidiVoucher += subsidiVoucher;
      baris.push({
        id: promo._id,
        nama: promo.nama,
        jenis: promo.jenis ?? "bunga_pengganti",
        persenBunga: promo.persenBunga,
        potonganPersen: promo.potonganPersen ?? null,
        tenor: promo.tenor,
        mulai: promo.mulai,
        selesai: promo.selesai,
        status: statusPromoBunga(promo, sekarang),
        pinjaman: loans.length,
        pokok,
        subsidi,
        subsidiVoucher,
        paguSubsidi: promo.paguSubsidi ?? null,
        perkiraan,
      });
    }

    // Subsidi terbesar dulu: itu kampanye yang paling perlu dievaluasi.
    baris.sort((a, b) => b.subsidi - a.subsidi || b.pinjaman - a.pinjaman);

    return {
      baris,
      tren: kelompokkanMingguan(kontribusiMinggu),
      total: {
        promo: promos.length,
        pinjaman: totalPinjaman,
        pokok: totalPokok,
        subsidi: totalSubsidi,
        subsidiVoucher: totalSubsidiVoucher,
        subsidiGabungan: totalSubsidi + totalSubsidiVoucher,
      },
      dibatasi,
    };
  },
});
