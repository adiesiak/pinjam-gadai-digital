/**
 * Alat data lama: temukan & gabungkan NASABAH KEMBAR.
 *
 * Kenapa berkas ini ada: sebelum jalur pencatatan manual menolak NIK/WhatsApp
 * yang sudah terpakai, data yang dipindahkan dari buku/berkas kantor bisa
 * membuat akun KEDUA untuk orang yang sama (mis. NIK salah satu digit). Akun
 * kembar memecah riwayat pinjaman, jadi admin perlu SATU tempat untuk melihat
 * pasangan kembarnya lalu memilih mana yang dipertahankan.
 *
 *  - `daftarNasabahKembar` mengelompokkan `nasabahProfil` yang berbagi NIK
 *    atau nomor WhatsApp (lihat lib/duplikatNasabah.ts). Hanya kelompok berisi
 *    ≥2 akun yang dikembalikan; identitas kosong tidak pernah mencocokkan.
 *  - `gabungNasabah` MEMINDAHKAN seluruh riwayat keuangan (pinjaman, gadai,
 *    kredit barang, cicilan, bukti bayar) dan riwayat lokasi akun duplikat ke
 *    akun utama, memindahkan data diri bila akun utama belum punya, lalu
 *    menghapus akun duplikat beserta kredensialnya. Riwayat keuangan tidak
 *    pernah dibuang — hanya berpindah pemilik.
 *  - Akun yang juga tercatat sebagai PENYEDIA DANA (punya setoran, penarikan,
 *    alokasi, atau menjadi pendana pinjaman) DITOLAK otomatis: menggabungkannya
 *    berarti menyatukan dua peran uang yang berbeda, dan itu bukan urusan alat
 *    ini.
 *
 * Semua aksi masuk Audit Trail dengan aksi `nasabah_gabung` supaya penyatuan
 * riwayat dapat ditelusuri (siapa, kapan, akun mana berpindah ke mana).
 */
import { v } from "convex/values";

import { kelompokkanKembar } from "../lib/duplikatNasabah";
import { namaTampil } from "../lib/nama";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { hapusTurunanAkun, totalTurunanAkun } from "./hapusAkunTurunan";
import { ROLES } from "./schema";
import { audit } from "./system";
import type { Doc, Id } from "./_generated/dataModel";

/** Gerbang admin — seluruh query/mutation di berkas ini dijaga. */
async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

/**
 * Jumlah baris yang menempatkan akun ini di sisi PENYEDIA DANA. Dipakai sebagai
 * gerbang: akun dengan nilai > 0 tidak boleh digabung dari alat nasabah.
 */
async function hitungPeranPendana(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  const [pinjamanPendana, fundings, kreditFundings, deposits, withdrawals, transfer] =
    await Promise.all([
      ctx.db.query("loans").withIndex("by_pendana", (q) => q.eq("pendanaId", userId)).collect(),
      ctx.db.query("fundings").withIndex("by_dana", (q) => q.eq("danaId", userId)).collect(),
      ctx.db.query("kreditFundings").withIndex("by_dana", (q) => q.eq("danaId", userId)).collect(),
      ctx.db.query("deposits").withIndex("by_dana", (q) => q.eq("danaId", userId)).collect(),
      ctx.db.query("withdrawals").withIndex("by_dana", (q) => q.eq("danaId", userId)).collect(),
      ctx.db
        .query("transferPendana")
        .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
        .collect(),
    ]);
  return (
    pinjamanPendana.length +
    fundings.length +
    kreditFundings.length +
    deposits.length +
    withdrawals.length +
    transfer.length
  );
}

/** Hitung baris per `userId` dari sekumpulan dokumen. */
function hitungPerUser(rows: readonly { userId: string }[]): Map<string, number> {
  const hasil = new Map<string, number>();
  for (const row of rows) {
    hasil.set(row.userId, (hasil.get(row.userId) ?? 0) + 1);
  }
  return hasil;
}

/**
 * Daftar kelompok nasabah kembar untuk panel admin. Kosong bila tidak ada
 * duplikat. Hanya memuat `nasabahProfil` (sumber identitas) agar pencocokan
 * memakai NIK/WhatsApp yang benar-benar tercatat.
 */
export const daftarNasabahKembar = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [profils, users, loans, pawns, kredits] = await Promise.all([
      ctx.db.query("nasabahProfil").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("loans").collect(),
      ctx.db.query("pawns").collect(),
      ctx.db.query("kreditBarang").collect(),
    ]);

    const akun = new Map<string, Doc<"users">>(users.map((u) => [u._id as string, u]));
    const perPinjaman = hitungPerUser(loans);
    const perGadai = hitungPerUser(pawns);
    const perKredit = hitungPerUser(kredits);

    const baris = profils.map((p) => {
      const id = p.userId as string;
      const user = akun.get(id);
      const jumlahPinjaman = perPinjaman.get(id) ?? 0;
      const jumlahGadai = perGadai.get(id) ?? 0;
      const jumlahKredit = perKredit.get(id) ?? 0;
      return {
        userId: p.userId,
        nama: namaTampil([p.namaLengkap, user?.name, user?.email]),
        email: user?.email ?? null,
        nik: p.nik,
        nomorWhatsApp: p.nomorWhatsApp,
        jumlahPinjaman,
        jumlahGadai,
        jumlahKredit,
        jumlahBerkas: jumlahPinjaman + jumlahGadai + jumlahKredit,
        // Akun pencatatan tanpa kredensial dibuat jalur `buatNasabahBaru`;
        // itulah kandidat duplikat yang biasanya dibuang, bukan dipertahankan.
        dibuatAdmin: user?.dibuatAdminPada !== undefined,
        punyaKodePeminjam: user?.kodePeminjam !== undefined,
      };
    });

    return {
      totalProfil: profils.length,
      kelompok: kelompokkanKembar(baris),
    };
  },
});

/** Ringkasan jumlah baris yang dipindahkan saat penggabungan (untuk audit). */
export type RingkasanGabung = {
  pinjaman: number;
  gadai: number;
  kredit: number;
  cicilanGadai: number;
  cicilanKredit: number;
  buktiBayar: number;
  jejakLokasi: number;
  peringatanLokasi: number;
};

/**
 * Gabungkan satu atau beberapa akun nasabah kembar ke satu akun utama — admin.
 *
 * Yang DIPINDAHKAN: pinjaman, gadai, kredit barang, cicilan gadai/kredit,
 * bukti pembayaran manual, jejak & peringatan lokasi, dan data diri (bila akun
 * utama belum punya). Yang DIHAPUS dari akun duplikat: kredensial/sesi auth,
 * MFA, consent & status lokasi, perangkat, sesi internal, dan (bila tidak
 * dipindahkan) data diri beserta foto KTP-nya.
 */
export const gabungNasabah = mutation({
  args: {
    utamaId: v.id("users"),
    sumberIds: v.array(v.id("users")),
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { utamaId, sumberIds, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const sumberUnik = [...new Set(sumberIds)].filter((id) => id !== utamaId);
    if (sumberUnik.length === 0) {
      throw new Error("Pilih minimal satu akun duplikat untuk digabungkan.");
    }

    const utama = await ctx.db.get(utamaId);
    if (utama === null) throw new Error("Akun utama tidak ditemukan.");
    if (utama.role === ROLES.ADMIN) {
      throw new Error("Akun tim (admin) tidak dapat menjadi tujuan penggabungan.");
    }

    const alasanBersih = (alasan ?? "").trim();
    if (alasanBersih.length > 500) {
      throw new Error("Catatan penggabungan maksimal 500 karakter.");
    }

    // Validasi SELURUH sumber sebelum ada perubahan supaya penggabungan bersifat
    // "semua atau tidak sama sekali" pada jalur debug (Convex sudah atomik).
    const sumberRows: Array<{ id: Id<"users">; user: Doc<"users"> }> = [];
    for (const id of sumberUnik) {
      const user = await ctx.db.get(id);
      if (user === null) throw new Error("Salah satu akun duplikat tidak ditemukan lagi.");
      if (user.role === ROLES.ADMIN) {
        throw new Error("Akun tim (admin) tidak dapat digabungkan dari alat ini.");
      }
      const sebagaiPendana = await hitungPeranPendana(ctx, id);
      if (sebagaiPendana > 0) {
        throw new Error(
          `${namaTampil([user.name, user.email])} juga tercatat sebagai penyedia dana ` +
            `(${sebagaiPendana} baris setoran/alokasi/penarikan). Akun berperan ganda tidak ` +
            "digabung dari sini — selesaikan dulu sisi penyedia dananya, atau hapus akunnya terpisah.",
        );
      }
      sumberRows.push({ id, user });
    }

    const ringkas: RingkasanGabung = {
      pinjaman: 0,
      gadai: 0,
      kredit: 0,
      cicilanGadai: 0,
      cicilanKredit: 0,
      buktiBayar: 0,
      jejakLokasi: 0,
      peringatanLokasi: 0,
    };
    let profilDipindah = 0;
    let turunanDibersihkan = 0;
    let akunAuthDibersihkan = 0;
    let kodePeminjamUtama = utama.kodePeminjam;

    for (const { id: sumberId, user: sumber } of sumberRows) {
      // 1. Data diri: pindahkan bila akun utama belum punya; kalau sudah,
      //    data diri duplikat dibuang bersama turunannya (data utama menang).
      const profilSumber = await ctx.db
        .query("nasabahProfil")
        .withIndex("by_user", (q) => q.eq("userId", sumberId))
        .first();
      if (profilSumber !== null) {
        const profilUtama = await ctx.db
          .query("nasabahProfil")
          .withIndex("by_user", (q) => q.eq("userId", utamaId))
          .first();
        if (profilUtama === null) {
          await ctx.db.patch(profilSumber._id, { userId: utamaId });
          profilDipindah += 1;
        }
      }

      // 2. Riwayat keuangan & lokasi berpindah pemilik.
      const [loans, pawns, kredits, cicilanGadai, cicilanKredit, buktiBayar, jejak, peringatan] =
        await Promise.all([
          ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", sumberId)).collect(),
          ctx.db.query("pawns").withIndex("by_user", (q) => q.eq("userId", sumberId)).collect(),
          ctx.db
            .query("kreditBarang")
            .withIndex("by_user", (q) => q.eq("userId", sumberId))
            .collect(),
          ctx.db
            .query("pawnPayments")
            .withIndex("by_user", (q) => q.eq("userId", sumberId))
            .collect(),
          ctx.db
            .query("kreditPayments")
            .withIndex("by_user", (q) => q.eq("userId", sumberId))
            .collect(),
          ctx.db
            .query("manualPaymentReceipts")
            .withIndex("by_user", (q) => q.eq("userId", sumberId))
            .collect(),
          ctx.db.query("lokasiJejak").withIndex("by_user", (q) => q.eq("userId", sumberId)).collect(),
          ctx.db
            .query("lokasiPeringatan")
            .withIndex("by_user", (q) => q.eq("userId", sumberId))
            .collect(),
        ]);
      for (const row of loans) await ctx.db.patch(row._id, { userId: utamaId });
      for (const row of pawns) await ctx.db.patch(row._id, { userId: utamaId });
      for (const row of kredits) await ctx.db.patch(row._id, { userId: utamaId });
      for (const row of cicilanGadai) await ctx.db.patch(row._id, { userId: utamaId });
      for (const row of cicilanKredit) await ctx.db.patch(row._id, { userId: utamaId });
      for (const row of buktiBayar) await ctx.db.patch(row._id, { userId: utamaId });
      for (const row of jejak) await ctx.db.patch(row._id, { userId: utamaId });
      for (const row of peringatan) await ctx.db.patch(row._id, { userId: utamaId });
      ringkas.pinjaman += loans.length;
      ringkas.gadai += pawns.length;
      ringkas.kredit += kredits.length;
      ringkas.cicilanGadai += cicilanGadai.length;
      ringkas.cicilanKredit += cicilanKredit.length;
      ringkas.buktiBayar += buktiBayar.length;
      ringkas.jejakLokasi += jejak.length;
      ringkas.peringatanLokasi += peringatan.length;

      // 3. Kode peminjam dipakai untuk pencarian kontrak/WA; jangan hilang bila
      //    akun utama belum punya.
      if (kodePeminjamUtama === undefined && sumber.kodePeminjam !== undefined) {
        kodePeminjamUtama = sumber.kodePeminjam;
        await ctx.db.patch(utamaId, { kodePeminjam: sumber.kodePeminjam });
      }

      // 4. Bersihkan sisa turunan akun duplikat, lalu hapus akunnya.
      const turunan = await hapusTurunanAkun(ctx, sumberId);
      turunanDibersihkan += totalTurunanAkun(turunan);
      akunAuthDibersihkan += turunan.akunAuth;
      await ctx.db.delete(sumberId);
    }

    const namaUtama = namaTampil([utama.name, utama.email]);
    const daftarSumber = sumberRows
      .map(({ user }) => namaTampil([user.name, user.email]))
      .join(", ");
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "nasabah_gabung",
      namaUtama,
      `Nasabah kembar digabungkan: ${daftarSumber} → ${namaUtama}; ` +
        `${ringkas.pinjaman} pinjaman, ${ringkas.gadai} gadai, ${ringkas.kredit} kredit barang, ` +
        `${ringkas.cicilanGadai + ringkas.cicilanKredit} cicilan, ${ringkas.buktiBayar} bukti bayar dipindahkan; ` +
        `${ringkas.jejakLokasi + ringkas.peringatanLokasi} baris lokasi ikut pindah; ` +
        `${akunAuthDibersihkan} akun auth & ${turunanDibersihkan} baris turunan duplikat dibersihkan` +
        (profilDipindah > 0 ? ", data diri duplikat dipindahkan" : "") +
        (alasanBersih === "" ? "" : `; alasan: ${alasanBersih}`),
    );

    return {
      ok: true,
      utamaId,
      namaUtama,
      digabung: sumberRows.length,
      ringkas,
      profilDipindah,
      turunanDibersihkan,
    };
  },
});
