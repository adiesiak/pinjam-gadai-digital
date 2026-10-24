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
  labelStatusSiklus,
  sisaHariSiklus,
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
 */

/** Total kewajiban siklus yang masih berjalan milik satu pendana. */
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
    .reduce((total, row) => total + row.totalCair, 0);
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

  if (imbalBersih > 0) {
    await ctx.db.patch(siklus._id, {
      totalMasuk: siklus.totalMasuk + imbalBersih,
    });
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
        status: row.status as StatusSiklus,
        statusLabel: labelStatusSiklus(row.status as StatusSiklus),
        totalMasuk: row.totalMasuk,
        dicairkanPada: row.dicairkanPada ?? null,
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
          kurang: Math.max(0, row.totalCair - row.totalMasuk),
          mulaiPada: row.mulaiPada,
          jatuhTempoPada: row.jatuhTempoPada,
          sisaHari: sisaHariSiklus(row.jatuhTempoPada, sekarang),
          jatuhTempo: row.jatuhTempoPada <= sekarang,
        };
      }),
    );
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
