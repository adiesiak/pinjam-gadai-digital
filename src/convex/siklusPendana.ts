import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdminSession } from "./adminAuthz";
import { akunDompetDana, appendJournal } from "./ledger";
import { audit } from "./system";
import { formatRupiah } from "../lib/money";
import {
  hitungSiklusPendana,
  jatuhTempoSiklus,
  labelPilihanSiklus,
  labelStatusSiklus,
  pokokPutarUlang,
  sisaHariSiklus,
  type PilihanSiklus,
  type StatusSiklus,
} from "../lib/siklusPendana";

/**
 * SIKLUS PENDANA 30 HARI.
 *
 * Satu penempatan pendana adalah satu liabilitas berjangka 30 hari. Peminjam
 * boleh melunasi lebih awal, tetapi dompet pendana tetap terkunci sampai
 * `jatuhTempoPada`; pada hari itu admin mencairkan pokok + imbal hasil.
 *
 * Uang yang belum kembali dari pinjaman ditutup dari akun
 * `platform:GUARANTEE`, lalu pemulihan berikutnya (bila pinjaman telat bayar)
 * masuk ke akun yang sama. Dengan begitu pendana tidak pernah dibayar dua kali
 * dan jurnal tetap seimbang.
 *
 * MODAL DIPUTAR DI DALAM SIKLUS: saat pinjaman tenor pendek lunas, pokoknya
 * kembali ke dompet pendana lalu dapat ditempatkan lagi ke pinjaman lain
 * (`putarModalSiklus`). Setiap putaran tetap menyimpan snapshot hak pendana
 * 30 hari, tetapi pembayaran yang melebihi hak siklus dikirim ke platform —
 * pendana hanya menerima angka siklus yang sudah dijanjikan.
 */

/**
 * Dana milik siklus berjalan yang wajib tetap di dompet pendana.
 *
 * Yang dikunci adalah uang yang SUDAH masuk dompet untuk siklus itu
 * (`totalMasuk`), bukan seluruh `totalCair`: sisa yang belum masuk masih akan
 * ditutup jaminan platform, jadi belum ada rupiah yang bisa dipakai pendana.
 * Dengan begitu setoran baru tidak ikut terkunci oleh siklus lama, sedangkan
 * pokok + Imbal Hasil yang sudah cair tetap tidak bisa ditarik sebelum jatuh
 * tempo. Batas `totalCair` mencegah kelebihan settlement ikut mengunci saldo.
 */
export async function kewajibanSiklusAktif(
  ctx: QueryCtx,
  danaId: Id<"users">,
): Promise<number> {
  const rows = await ctx.db
    .query("siklusPendana")
    .withIndex("by_pendana", (q) => q.eq("pendanaId", danaId))
    .collect();
  return rows
    .filter((row) => row.status === "berjalan")
    .reduce(
      (total, row) => total + Math.min(Math.max(0, row.totalMasuk), row.totalCair),
      0,
    );
}

/**
 * Buat siklus baru untuk satu alokasi pendana. Dipanggil di dalam mutation
 * alokasi supaya siklus dan `fundings` selalu lahir bersama.
 */
export async function buatSiklusUntukAlokasi(
  ctx: MutationCtx,
  args: { pendanaId: Id<"users">; pokok: number; sekarang: number },
): Promise<Id<"siklusPendana">> {
  const hitung = hitungSiklusPendana(args.pokok);
  return await ctx.db.insert("siklusPendana", {
    pendanaId: args.pendanaId,
    pokok: hitung.pokok,
    imbal: hitung.imbal,
    potongan: hitung.potongan,
    totalCair: hitung.totalCair,
    mulaiPada: args.sekarang,
    jatuhTempoPada: jatuhTempoSiklus(args.sekarang),
    status: "berjalan",
    totalMasuk: 0,
    modalSiapPutar: 0,
    modalDikerjakan: hitung.pokok,
    jumlahPutaran: 0,
    totalKeuntunganPutaran: 0,
  });
}

/**
 * Buka siklus berikutnya dari hak siklus yang sudah jatuh tempo.
 * Dipakai jalur "putar lagi": pokok baru = totalCair siklus lama, sehingga
 * pokok dan Imbal Hasil tetap bekerja tanpa ditransfer ke rekening.
 */
async function buatSiklusLanjutan(
  ctx: MutationCtx,
  args: {
    pendanaId: Id<"users">;
    siklusAsalId: Id<"siklusPendana">;
    pokok: number;
    sekarang: number;
  },
): Promise<Id<"siklusPendana">> {
  const hitung = hitungSiklusPendana(pokokPutarUlang(args.pokok));
  return await ctx.db.insert("siklusPendana", {
    pendanaId: args.pendanaId,
    pokok: hitung.pokok,
    imbal: hitung.imbal,
    potongan: hitung.potongan,
    totalCair: hitung.totalCair,
    mulaiPada: args.sekarang,
    jatuhTempoPada: jatuhTempoSiklus(args.sekarang),
    status: "berjalan",
    // Pokok sudah berada di dompet pendana saat siklus dibuka, jadi langsung
    // dihitung masuk. Sisa yang masih ditagih hanya Imbal Hasil bersih
    // (imbal − biaya), dan itu yang ditutup jaminan saat jatuh tempo berikutnya.
    totalMasuk: hitung.pokok,
    // Seluruh hak siklus lama ada di dompet dan siap ditempatkan lagi.
    modalSiapPutar: hitung.pokok,
    modalDikerjakan: 0,
    jumlahPutaran: 0,
    totalKeuntunganPutaran: 0,
    siklusAsalId: args.siklusAsalId,
  });
}

/**
 * Hitung pembayaran satu `fundings` yang terikat siklus.
 *
 * Mengembalikan `null` untuk baris lama tanpa siklus, supaya pemanggil memakai
 * jalur settlement lama. Untuk baris siklus:
 *  - potongan memakai snapshot `potonganAdmin` (5% pokok), dan HANYA dipungut
 *    sekali per siklus;
 *  - pembayaran dibatasi `totalCair` siklus. Kelebihan (mis. pelunasan
 *    perpanjangan setelah siklus lunas) masuk `platform:GUARANTEE`, bukan
 *    dompet pendana — pendana tidak pernah dibayar dua kali untuk 30 hari yang
 *    sama;
 *  - siklus yang sudah dicairkan mengarahkan seluruh pemulihan ke
 *    `platform:GUARANTEE`;
 *  - siklus berjalan menambah `totalMasuk` sebesar yang benar-benar masuk dompet.
 *
 * `kelebihan` adalah bagian bruto yang TIDAK menjadi hak pendana pada
 * pembayaran ini. Pemanggil wajib mendebitnya ke `platform:GUARANTEE` supaya
 * jurnal tetap seimbang.
 *
 * Bila `pelunasanPenuh` benar (pinjaman sudah lunas, bukan angsuran sebagian),
 * pokok alokasi ditandai kembali ke meja kerja siklus: `modalSiapPutar`
 * bertambah dan `modalDikerjakan` berkurang. Untuk alokasi `putar`, kelebihan
 * pembayaran setelah pokok kembali dicatat sebagai keuntungan putaran platform.
 */
export type PembayaranSiklus = {
  akun: string;
  potonganAdmin: number;
  imbalBersih: number;
  kelebihan: number;
};

export async function pembayaranSiklus(
  ctx: MutationCtx,
  funding: {
    siklusId?: Id<"siklusPendana">;
    jumlahAlokasi: number;
    imbalHasil: number;
    potonganAdmin?: number;
    peranSiklus?: "utama" | "putar";
    /**
     * Imbal Hasil yang benar-benar dibayar peminjam untuk alokasi ini. Tarif
     * nasabah bisa lebih rendah dari 30%, jadi angka ini yang dipakai untuk
     * menghitung keuntungan putaran platform, bukan snapshot pendana.
     */
    bungaAktual?: number;
    /** Benar hanya saat pinjaman lunas penuh, bukan angsuran sebagian. */
    pelunasanPenuh?: boolean;
  },
): Promise<PembayaranSiklus | null> {
  if (funding.siklusId === undefined) return null;
  const siklus = await ctx.db.get(funding.siklusId);
  if (siklus === null) return null;

  const bruto = funding.jumlahAlokasi + funding.imbalHasil;
  const potonganSnapshot = funding.potonganAdmin ?? 0;

  if (siklus.status !== "berjalan") {
    return {
      akun: "platform:GUARANTEE",
      potonganAdmin: 0,
      imbalBersih: 0,
      kelebihan: bruto,
    };
  }

  const sisaHak = Math.max(0, siklus.totalCair - siklus.totalMasuk);
  // Biaya hanya dipungut pada pembayaran pertama siklus. Pembayaran berikutnya
  // (mis. perpanjangan) tidak boleh menagih biaya yang sama dua kali.
  const potonganAdmin =
    sisaHak > 0 && siklus.totalMasuk === 0 ? potonganSnapshot : 0;
  const netto = bruto - potonganAdmin;
  const imbalBersih = Math.min(netto, sisaHak);
  const kelebihan = netto - imbalBersih;

  const patch: {
    totalMasuk?: number;
    modalSiapPutar?: number;
    modalDikerjakan?: number;
    totalKeuntunganPutaran?: number;
  } = {};
  if (imbalBersih > 0) {
    patch.totalMasuk = siklus.totalMasuk + imbalBersih;
  }
  if (funding.pelunasanPenuh === true) {
    // Pokok kembali dari pinjaman dan boleh ditempatkan lagi selama siklus
    // masih berjalan. Hak pendana tidak ikut bertambah.
    patch.modalSiapPutar = (siklus.modalSiapPutar ?? 0) + funding.jumlahAlokasi;
    patch.modalDikerjakan = Math.max(
      0,
      (siklus.modalDikerjakan ?? 0) - funding.jumlahAlokasi,
    );
    if (funding.peranSiklus === "putar") {
      // Keuntungan platform adalah bunga pinjaman yang tidak dipakai membayar
      // sisa hak siklus. Pokok yang kembali bukan keuntungan.
      const bungaAktual = funding.bungaAktual ?? funding.imbalHasil;
      patch.totalKeuntunganPutaran =
        (siklus.totalKeuntunganPutaran ?? 0) +
        Math.max(0, bungaAktual - imbalBersih);
    }
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(siklus._id, patch);
  }
  return {
    akun: akunDompetDana(siklus.pendanaId),
    potonganAdmin,
    imbalBersih,
    kelebihan,
  };
}

/** Siklus milik akun pendana yang sedang masuk. */
export const siklusSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const rows = await ctx.db
      .query("siklusPendana")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    const sekarang = Date.now();

    return rows
      .sort((a, b) => b.mulaiPada - a.mulaiPada)
      .slice(0, 24)
      .map((row) => ({
        _id: row._id,
        pokok: row.pokok,
        imbal: row.imbal,
        potongan: row.potongan,
        totalCair: row.totalCair,
        mulaiPada: row.mulaiPada,
        jatuhTempoPada: row.jatuhTempoPada,
        sisaHari: sisaHariSiklus(row.jatuhTempoPada, sekarang),
        jatuhTempo: row.jatuhTempoPada <= sekarang,
        status: row.status as StatusSiklus,
        statusLabel: labelStatusSiklus(row.status as StatusSiklus),
        totalMasuk: row.totalMasuk,
        /** Pokok yang masih bekerja di pinjaman (dipakai indikator status). */
        modalDikerjakan: row.modalDikerjakan ?? 0,
        dicairkanPada: row.dicairkanPada ?? null,
        pilihanPendana: (row.pilihanPendana ?? null) as PilihanSiklus | null,
        pilihanLabel: labelPilihanSiklus(
          row.pilihanPendana as PilihanSiklus | undefined,
        ),
        siklusLanjutanId: row.siklusLanjutanId ?? null,
      }));
  },
});

/**
 * Daftar siklus untuk admin. `hanyaJatuhTempo` dipakai antrean pencairan,
 * sedangkan daftar penuh dipakai pemeriksaan riwayat.
 */
export const daftarSiklus = query({
  args: { hanyaJatuhTempo: v.optional(v.boolean()) },
  handler: async (ctx, { hanyaJatuhTempo }) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();

    const rows = await ctx.db
      .query("siklusPendana")
      .withIndex("by_status", (q) => q.eq("status", "berjalan"))
      .collect();
    const tersaring = rows
      .filter((row) => (hanyaJatuhTempo === true ? row.jatuhTempoPada <= sekarang : true))
      .sort((a, b) => a.jatuhTempoPada - b.jatuhTempoPada)
      .slice(0, 200);

    return await Promise.all(
      tersaring.map(async (row) => {
        const pendana = await ctx.db.get(row.pendanaId);
        return {
          _id: row._id,
          pendanaNama: pendana?.name?.trim() || pendana?.email || "Pendana",
          pendanaEmail: pendana?.email ?? null,
          pokok: row.pokok,
          imbal: row.imbal,
          potongan: row.potongan,
          totalCair: row.totalCair,
          totalMasuk: row.totalMasuk,
          modalSiapPutar: row.modalSiapPutar ?? 0,
          modalDikerjakan: row.modalDikerjakan ?? 0,
          jumlahPutaran: row.jumlahPutaran ?? 0,
          totalKeuntunganPutaran: row.totalKeuntunganPutaran ?? 0,
          bisaPutar:
            row.status === "berjalan" &&
            row.jatuhTempoPada > sekarang &&
            (row.modalSiapPutar ?? 0) > 0,
          kurang: Math.max(0, row.totalCair - row.totalMasuk),
          mulaiPada: row.mulaiPada,
          jatuhTempoPada: row.jatuhTempoPada,
          sisaHari: sisaHariSiklus(row.jatuhTempoPada, sekarang),
          jatuhTempo: row.jatuhTempoPada <= sekarang,
          pilihanPendana: (row.pilihanPendana ?? "cairkan") as PilihanSiklus,
          pilihanLabel: labelPilihanSiklus(
            row.pilihanPendana as PilihanSiklus | undefined,
          ),
          belumMemilih: row.pilihanPendana === undefined,
        };
      }),
    );
  },
});

/**
 * Pendana memilih apa yang terjadi pada saat jatuh tempo.
 *
 * Pilihan boleh ditetapkan kapan saja selama siklus masih berjalan (termasuk
 * sebelum jatuh tempo), supaya pendana tidak perlu menunggu di depan layar.
 * Tanpa pilihan, siklus mengikuti perilaku lama: dicairkan oleh admin.
 */
export const pilihSiklus = mutation({
  args: {
    siklusId: v.id("siklusPendana"),
    pilihan: v.union(v.literal("cairkan"), v.literal("putar_ulang")),
  },
  handler: async (ctx, { siklusId, pilihan }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Masuk dulu untuk memilih siklus.");
    const siklus = await ctx.db.get(siklusId);
    if (siklus === null || siklus.pendanaId !== userId) {
      throw new Error("Siklus ini bukan milik akun Anda.");
    }
    if (siklus.status !== "berjalan") {
      throw new Error("Siklus ini sudah selesai, pilihan tidak bisa diubah lagi.");
    }
    if (siklus.pilihanPendana === pilihan) {
      return { ok: true as const, pilihan };
    }
    await ctx.db.patch(siklusId, {
      pilihanPendana: pilihan,
      pilihanDipilihPada: Date.now(),
    });
    return { ok: true as const, pilihan };
  },
});

/**
 * Jalankan pilihan "putar lagi" pada saat jatuh tempo.
 *
 * Seluruh hak siklus (pokok + Imbal Hasil − biaya) menjadi pokok siklus baru
 * selama 30 hari berikutnya, sehingga tidak ada rupiah yang menganggur di
 * dompet. Kekurangan settlement tetap ditutup jaminan platform lebih dulu —
 * sama seperti pencairan — supaya pokok siklus baru benar-benar terdanai.
 */
export const putarUlangSiklus = mutation({
  args: { siklusId: v.id("siklusPendana") },
  handler: async (ctx, { siklusId }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const siklus = await ctx.db.get(siklusId);
    if (siklus === null) throw new Error("Siklus pendana tidak ditemukan.");
    if (siklus.status !== "berjalan") {
      throw new Error("Siklus ini sudah dicairkan atau dibatalkan.");
    }
    if (siklus.pilihanPendana !== "putar_ulang") {
      throw new Error("Pendana belum memilih untuk memutar ulang siklus ini.");
    }

    const sekarang = Date.now();
    if (sekarang < siklus.jatuhTempoPada) {
      throw new Error("Siklus belum jatuh tempo, jadi belum bisa diputar ulang.");
    }

    const kurang = Math.max(0, siklus.totalCair - siklus.totalMasuk);
    if (kurang > 0) {
      await appendJournal(ctx, {
        jenis: "payout",
        skema: "pinjaman",
        keterangan: `Jaminan platform untuk putar ulang siklus ${siklus._id}`,
        aktor: admin.email ?? admin.name ?? "admin",
        lines: [
          {
            akun: akunDompetDana(siklus.pendanaId),
            arah: "debit",
            jumlah: kurang,
          },
          { akun: "platform:GUARANTEE", arah: "kredit", jumlah: kurang },
        ],
      });
    }

    const siklusBaruId = await buatSiklusLanjutan(ctx, {
      pendanaId: siklus.pendanaId,
      siklusAsalId: siklusId,
      pokok: siklus.totalCair,
      sekarang,
    });

    await ctx.db.patch(siklusId, {
      status: "diputar_ulang",
      dicairkanPada: sekarang,
      dicairkanOleh: adminId,
      siklusLanjutanId: siklusBaruId,
      totalMasuk: Math.max(siklus.totalMasuk, siklus.totalCair),
    });

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "putar_ulang_siklus_pendana",
      siklusId,
      `Pokok siklus baru ${formatRupiah(siklus.totalCair)} selama 30 hari${
        kurang > 0 ? `, ditutup jaminan platform ${formatRupiah(kurang)}` : ""
      }`,
    );

    return { ok: true as const, siklusBaruId, pokokBaru: siklus.totalCair };
  },
});

/**
 * Catat pencairan satu siklus pada/setelah jatuh tempo.
 *
 * Kekurangan antara `totalCair` dan yang sudah masuk dompet ditutup dari akun
 * jaminan platform. Ini yang membuat janji "tetap cair pada hari ke-30"
 * berlaku walau peminjam belum melunasi.
 */
export const cairkanSiklus = mutation({
  args: {
    siklusId: v.id("siklusPendana"),
    referensi: v.optional(v.string()),
  },
  handler: async (ctx, { siklusId, referensi }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const siklus = await ctx.db.get(siklusId);
    if (siklus === null) throw new Error("Siklus pendana tidak ditemukan.");
    if (siklus.status !== "berjalan") {
      throw new Error("Siklus ini sudah dicairkan atau dibatalkan.");
    }

    const sekarang = Date.now();
    if (sekarang < siklus.jatuhTempoPada) {
      throw new Error("Siklus belum jatuh tempo, jadi belum bisa dicairkan.");
    }

    const kurang = Math.max(0, siklus.totalCair - siklus.totalMasuk);
    if (kurang > 0) {
      await appendJournal(ctx, {
        jenis: "payout",
        skema: "pinjaman",
        keterangan: `Jaminan platform untuk siklus pendana ${siklus._id}`,
        aktor: admin.email ?? admin.name ?? "admin",
        lines: [
          {
            akun: akunDompetDana(siklus.pendanaId),
            arah: "debit",
            jumlah: kurang,
          },
          { akun: "platform:GUARANTEE", arah: "kredit", jumlah: kurang },
        ],
      });
    }

    await ctx.db.patch(siklusId, {
      status: "dicairkan",
      dicairkanPada: sekarang,
      dicairkanOleh: adminId,
      totalMasuk: Math.max(siklus.totalMasuk, siklus.totalCair),
      ...(referensi?.trim() ? { referensiTransfer: referensi.trim() } : {}),
    });

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "cairkan_siklus_pendana",
      siklusId,
      `Pokok ${formatRupiah(siklus.pokok)}, total cair ${formatRupiah(siklus.totalCair)}${
        kurang > 0 ? `, ditutup jaminan platform ${formatRupiah(kurang)}` : ""
      }`,
    );

    return { ok: true, totalCair: siklus.totalCair, kurang };
  },
});
