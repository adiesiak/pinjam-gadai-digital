import { query, mutation, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import { requireAdminSession } from "./adminAuthz";
import { appendJournal, ledgerTotals } from "./ledger";
import { audit, getConfig } from "./system";

/**
 * Integrasi pinjaman lama ke ledger internal + pembersihan pinjaman lama.
 *
 * Pinjaman yang dibuat sebelum mesin ledger dipakai (data warisan/seed) tidak
 * punya entri `platform_fee`, sehingga kartu "Pinjaman tunai" pada panel Ledger
 * tetap Rp 0. Panel admin di sini menuliskan jurnal
 * "Biaya admin & platform (2%)" untuk tiap pinjaman yang belum terbukukan —
 * bentuk jurnalnya SAMA PERSIS dengan yang ditulis alokasiDana.ts saat
 * pendanaan penuh, jadi ringkasan ledger otomatis masuk ke skema pinjaman.
 *
 * Penghapusan bersifat per-baris (dipilih admin), tidak pernah menyentuh
 * ledger (jurnal append-only tetap utuh), dan menolak pinjaman yang masih
 * berjalan / punya alokasi dana aktif.
 */

/** Status pinjaman yang sudah cukup matang untuk dibukukan biayanya. */
const STATUS_LAYAK = new Set(["disetujui", "didanai", "lunas"]);

/** Batas jumlah pinjaman yang diproses per pemanggilan (batas ukuran transaksi). */
const BATAS_INTEGRASI = 80;

/** Nama akun ledger untuk satu pinjaman. */
function akunPinjaman(id: string): string {
  return `pinjaman:${id}`;
}

/**
 * Kumpulkan id pinjaman yang SUDAH punya entri `platform_fee` di ledger.
 * Jurnal apapun yang mengkredit akun `pinjaman:<id>` dengan jenis platform_fee
 * menandakan biaya pinjaman itu sudah terbukukan (dicairkan alokasiDana atau
 * sudah pernah diintegrasikan), sehingga tidak boleh ditulis dua kali.
 */
async function pinjamanTerintegrasi(ctx: QueryCtx): Promise<Set<string>> {
  const entries = await ctx.db.query("ledger_entries").collect();
  const sudah = new Set<string>();
  for (const e of entries) {
    if (e.jenis !== "platform_fee") continue;
    if (!e.akun.startsWith("pinjaman:")) continue;
    sudah.add(e.akun.slice("pinjaman:".length));
  }
  return sudah;
}

/** Label admin untuk kolom `aktor`/audit. */
function labelAdmin(email: string | undefined, name: string | undefined): string {
  return email ?? name ?? "admin";
}

/**
 * Daftar pinjaman + status integrasi ledger-nya — untuk panel admin.
 * `bolehDihapus` false bila pinjaman masih berjalan atau punya alokasi dana
 * aktif (uang sudah keluar dan belum diselesaikan).
 */
export const statusIntegrasiLedger = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);

    const cfg = await getConfig(ctx);
    const persenBiaya = cfg.persenBiayaIntegrasi;
    const loans = await ctx.db.query("loans").collect();
    const sudah = await pinjamanTerintegrasi(ctx);

    const rows = await Promise.all(
      loans
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (l) => {
          const fundings = await ctx.db
            .query("fundings")
            .withIndex("by_loan", (q) => q.eq("loanId", l._id))
            .collect();
          const alokasiAktif = fundings.filter(
            (f) => f.status === "dialokasikan",
          ).length;
          return {
            _id: l._id,
            _creationTime: l._creationTime,
            nomorReferensi: l.nomorReferensi,
            namaLengkap: l.namaLengkap,
            status: l.status,
            pokokPinjaman: l.pokokPinjaman,
            biayaIntegrasi: Math.round((l.pokokPinjaman * persenBiaya) / 100),
            layak: STATUS_LAYAK.has(l.status) && l.pokokPinjaman > 0,
            terintegrasi: sudah.has(l._id),
            alokasiAktif,
            bolehDihapus: l.status !== "didanai" && alokasiAktif === 0,
          };
        }),
    );

    return {
      persenBiaya,
      /** Pinjaman siap dibukukan (layak, belum terintegrasi). */
      perluIntegrasi: rows.filter((r) => r.layak && !r.terintegrasi).length,
      /** Pinjaman yang sudah punya entri biaya di ledger. */
      terintegrasiCount: rows.filter((r) => r.terintegrasi).length,
      /** Pinjaman yang belum layak dibukukan (mis. masih diajukan). */
      belumLayak: rows.filter((r) => !r.layak).length,
      rows,
    };
  },
});

/**
 * Tulis jurnal "Biaya admin & platform (2%)" untuk tiap pinjaman yang layak
 * tetapi belum terbukukan. Idempoten: dijalankan ulang tidak menggandakan
 * jurnal, dan sisanya diproses pada pemanggilan berikutnya (batas batch).
 */
export const integrasikanPinjamanKeLedger = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireAdminSession(ctx);
    const label = labelAdmin(user.email, user.name);
    const cfg = await getConfig(ctx);
    const persenBiaya = cfg.persenBiayaIntegrasi;

    const loans = await ctx.db.query("loans").collect();
    const sudah = await pinjamanTerintegrasi(ctx);

    const kandidat = loans
      .filter(
        (l) =>
          STATUS_LAYAK.has(l.status) &&
          l.pokokPinjaman > 0 &&
          !sudah.has(l._id),
      )
      .sort((a, b) => a._creationTime - b._creationTime);

    const batch = kandidat.slice(0, BATAS_INTEGRASI);
    let jumlah = 0;
    let totalBiaya = 0;
    const gagal: Array<{ nomorReferensi: string; pesan: string }> = [];

    for (const loan of batch) {
      const biaya = Math.round((loan.pokokPinjaman * persenBiaya) / 100);
      if (biaya <= 0) continue;
      try {
        await appendJournal(ctx, {
          jenis: "platform_fee",
          skema: "pinjaman",
          keterangan: `Biaya admin & platform ${loan.nomorReferensi}`,
          aktor: label,
          lines: [
            { akun: "platform:FEE", arah: "debit", jumlah: biaya },
            { akun: akunPinjaman(loan._id), arah: "kredit", jumlah: biaya },
          ],
        });
        jumlah += 1;
        totalBiaya += biaya;
      } catch (cause) {
        gagal.push({
          nomorReferensi: loan.nomorReferensi,
          pesan: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    const sisa = kandidat.length - batch.length;
    await audit(
      ctx,
      userId,
      label,
      "pinjaman_integrasi_ledger",
      `${jumlah} pinjaman`,
      `Total biaya ${totalBiaya}; gagal ${gagal.length}; sisa ${sisa}.`,
    );

    return { jumlah, totalBiaya, gagal, sisa };
  },
});

/**
 * Hapus pinjaman lama yang dipilih admin satu per satu.
 * Ledger TIDAK disentuh (jurnal append-only tetap menjadi catatan keuangan).
 * Baris turunan yang menempel pada pinjaman ikut dibersihkan agar tidak ada
 * referensi yatim. Ditolak bila pinjaman masih berjalan atau punya alokasi
 * dana aktif.
 */
export const hapusPinjamanLama = mutation({
  args: {
    loanIds: v.array(v.id("loans")),
    /** Catatan penghapusan opsional — penghapusan tidak boleh tertahan kolom alasan. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const label = labelAdmin(user.email, user.name);

    // Catatan tidak wajib; batas atas dijaga agar audit tetap terbaca.
    const alasan = (args.alasan ?? "").trim();
    if (alasan.length > 500) {
      throw new Error("Catatan penghapusan maksimal 500 karakter.");
    }
    if (args.loanIds.length === 0) {
      throw new Error("Pilih minimal satu pinjaman untuk dihapus.");
    }

    let dihapus = 0;
    const terlewat: Array<{ nomorReferensi: string; pesan: string }> = [];

    for (const id of args.loanIds as Id<"loans">[]) {
      const loan = await ctx.db.get(id);
      if (loan === null) {
        terlewat.push({ nomorReferensi: String(id), pesan: "Pinjaman tidak ditemukan." });
        continue;
      }
      if (loan.status === "didanai") {
        terlewat.push({
          nomorReferensi: loan.nomorReferensi,
          pesan: "Pinjaman masih berjalan (didanai) — tidak boleh dihapus.",
        });
        continue;
      }

      const fundings = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", id))
        .collect();
      if (fundings.some((f) => f.status === "dialokasikan")) {
        terlewat.push({
          nomorReferensi: loan.nomorReferensi,
          pesan: "Masih ada alokasi dana aktif pada pinjaman ini.",
        });
        continue;
      }

      // Bersihkan baris turunan yang menempel pada pinjaman.
      for (const f of fundings) await ctx.db.delete(f._id);

      const receipts = await ctx.db
        .query("manualPaymentReceipts")
        .withIndex("by_loan", (q) => q.eq("loanId", id))
        .collect();
      for (const r of receipts) {
        if (await ctx.storage.getMetadata(r.buktiPembayaranId)) {
          await ctx.storage.delete(r.buktiPembayaranId);
        }
        await ctx.db.delete(r._id);
      }

      const waLogs = await ctx.db
        .query("waLogs")
        .withIndex("by_loan", (q) => q.eq("loanId", id))
        .collect();
      for (const row of waLogs) await ctx.db.delete(row._id);

      const transfer = await ctx.db
        .query("transferPendana")
        .withIndex("by_loan", (q) => q.eq("loanId", id))
        .collect();
      for (const row of transfer) await ctx.db.delete(row._id);

      const pengingat = await ctx.db
        .query("pengingat")
        .withIndex("by_loan", (q) => q.eq("loanId", id))
        .collect();
      for (const row of pengingat) await ctx.db.delete(row._id);

      const peringatan = await ctx.db
        .query("lokasiPeringatan")
        .withIndex("by_loan", (q) => q.eq("loanId", id))
        .collect();
      for (const row of peringatan) await ctx.db.delete(row._id);

      const jejak = await ctx.db
        .query("lokasiJejak")
        .withIndex("by_loan", (q) => q.eq("loanId", id))
        .collect();
      for (const titik of jejak) await ctx.db.delete(titik._id);

      // Jurnal yang menunjuk pinjaman ini sengaja TIDAK dihapus (append-only);
      // jumlahnya dicatat sebagai rincian supaya panel Audit Trail bisa
      // menunjukkannya, bukan hanya menyebutnya di kalimat.
      const jurnal = await ctx.db
        .query("ledger_entries")
        .withIndex("by_akun", (q) => q.eq("akun", `pinjaman:${id}`))
        .collect();

      await ctx.db.delete(id);
      await audit(
        ctx,
        userId,
        label,
        "pinjaman_hapus_lama",
        loan.nomorReferensi,
        `${alasan === "" ? "tanpa catatan" : alasan}; status ${loan.status}; pokok ${loan.pokokPinjaman}; ` +
          `PENGHAPUSAN MENYELURUH: ${fundings.length} alokasi dana, ${transfer.length} catatan transfer, ` +
          `${receipts.length} bukti bayar dihapus; ${jurnal.length} entri jurnal ledger dipertahankan.`,
        {
          menyeluruh: true,
          alokasiDana: fundings.length,
          catatanTransfer: transfer.length,
          buktiBayar: receipts.length,
          pengingat: pengingat.length,
          logWhatsapp: waLogs.length,
          jejakLokasi: jejak.length + peringatan.length,
          jurnalDipertahankan: jurnal.length,
        },
      );
      dihapus += 1;
    }

    return { dihapus, terlewat };
  },
});

/**
 * PEMELIHARAAN LEDGER — HANYA VIA CLI CONVEX (internalMutation).
 *
 * Menghapus entri `ledger_entries` per `groupId` untuk membersihkan data uji /
 * seed. Ledger normalnya append-only (Rule 5.1) dan tidak satu pun jalur
 * aplikasi boleh menghapusnya; karena itu fungsi ini sengaja `internalMutation`
 * — tidak bisa dipanggil klien mana pun, hanya dari deployment CLI:
 *
 *   bunx convex run integrasiLedger:qaPurgeJurnalGroups \
 *     '{"groupIds":["J-..."],"alasan":"..."}'
 *
 * Aturan yang ditegakkan:
 *  - satu grup hanya dihapus bila SEIMBANG (Σ debit = Σ kredit) — menghapus
 *    satu sisi jurnal akan memecah ringkasan ledger (status tidak seimbang);
 *  - grup yang tidak ditemukan / tidak seimbang dilaporkan di `dilewati`,
 *    tidak pernah diabaikan diam-diam;
 *  - alasan opsional (boleh dikosongkan, maksimal 500 karakter), hasilnya
 *    selalu ditulis ke `auditLog`.
 */
export const qaPurgeJurnalGroups = internalMutation({
  args: { groupIds: v.array(v.string()), alasan: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const alasan = (args.alasan ?? "").trim();
    if (alasan.length > 500) {
      throw new Error("Catatan penghapusan maksimal 500 karakter.");
    }
    if (args.groupIds.length === 0) {
      throw new Error("Kirim minimal satu groupId.");
    }

    const sebelum = await ledgerTotals(ctx);
    const dihapus: Array<{ groupId: string; entri: number; keterangan: string }> = [];
    const dilewati: Array<{ groupId: string; pesan: string }> = [];

    for (const groupId of args.groupIds) {
      const entries = await ctx.db
        .query("ledger_entries")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .collect();
      if (entries.length === 0) {
        dilewati.push({ groupId, pesan: "Grup tidak ditemukan." });
        continue;
      }
      let debit = 0;
      let kredit = 0;
      for (const e of entries) {
        if (e.arah === "debit") debit += e.jumlah;
        else kredit += e.jumlah;
      }
      if (debit !== kredit) {
        dilewati.push({
          groupId,
          pesan: `Grup tidak seimbang (debit ${debit} != kredit ${kredit}) — tidak dihapus.`,
        });
        continue;
      }
      for (const e of entries) await ctx.db.delete(e._id);
      dihapus.push({ groupId, entri: entries.length, keterangan: entries[0]?.keterangan ?? "" });
    }

    const sesudah = await ledgerTotals(ctx);
    await audit(
      ctx,
      undefined,
      "cli:qaPurgeJurnalGroups",
      "ledger_purge_grup",
      `${dihapus.length} grup`,
      `${alasan === "" ? "tanpa catatan" : alasan}; entri ${sebelum.entryCount} -> ${sesudah.entryCount}; ` +
        `grup dilewati ${dilewati.length}; seimbang ${sebelum.seimbang} -> ${sesudah.seimbang}.`,
    );

    return {
      dihapus,
      dilewati,
      entriDihapus: sebelum.entryCount - sesudah.entryCount,
      sebelum,
      sesudah,
    };
  },
});
