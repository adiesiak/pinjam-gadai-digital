/**
 * Doorprize Emas — tiket otomatis dan pengundian oleh admin.
 *
 * Tiket tidak pernah diklaim manual: pelunasan tepat waktu dan pendanaan
 * Rp1 juta menerbitkannya sendiri lewat `beriTiket` (dipanggil dari mutation
 * pelunasan). Semua penulisan idempoten pada `referensi`, sehingga pelunasan
 * yang dicocokkan dua kali tidak menggandakan tiket.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminRole } from "./adminAuthz";
import {
  HADIAH_HIBURAN_DOORPRIZE,
  HADIAH_UTAMA_DOORPRIZE,
  akhirPeriodeUndian,
  labelTanggalUndian,
  periodeUndian,
  tiketPendana,
  tiketPeminjam,
} from "../lib/doorprize";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Label akun yang aman ditampilkan di papan pemenang. */
function labelPemilik(user: { name?: string; email?: string } | null): string {
  const nama = (user?.name ?? "").trim();
  if (nama !== "") return nama;
  const email = (user?.email ?? "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "Nasabah PINDAI";
}

/**
 * Terbitkan satu tiket bila `referensi` belum pernah menghasilkan tiket.
 * Mengembalikan `true` hanya saat baris baru benar-benar ditulis.
 */
export async function beriTiket(
  ctx: MutationCtx,
  args: {
    pemilikId: Id<"users">;
    peran: "peminjam" | "pendana";
    referensi: string;
    sumber: string;
    jumlah?: number;
    waktu: number;
  },
): Promise<number> {
  const jumlah = Math.max(0, Math.trunc(args.jumlah ?? 1));
  if (jumlah === 0) return 0;
  const sudah = await ctx.db
    .query("doorprizeTiket")
    .withIndex("by_referensi", (q) => q.eq("referensi", args.referensi))
    .first();
  if (sudah !== null) return 0;
  const periode = periodeUndian(args.waktu);
  let dibuat = 0;
  for (let i = 1; i <= jumlah; i += 1) {
    // Referensi tiket ke-i berbeda supaya kelipatan pendanaan tercatat satu
    // per satu, tetapi referensi pertama tetap menjadi kunci idempotensi.
    const referensi = i === 1 ? args.referensi : `${args.referensi}#${i}`;
    const ada = await ctx.db
      .query("doorprizeTiket")
      .withIndex("by_referensi", (q) => q.eq("referensi", referensi))
      .first();
    if (ada !== null) continue;
    await ctx.db.insert("doorprizeTiket", {
      pemilikId: args.pemilikId,
      peran: args.peran,
      periode,
      sumber: args.sumber,
      referensi,
      status: "aktif",
      dibuatPada: args.waktu,
    });
    dibuat += 1;
  }
  return dibuat;
}

/** Tiket peminjam untuk satu pelunasan tepat waktu. */
export async function beriTiketPelunasan(
  ctx: MutationCtx,
  args: {
    pemilikId: Id<"users">;
    nomorReferensi: string;
    tepatWaktu: boolean;
    waktu: number;
  },
): Promise<void> {
  if (tiketPeminjam(args.tepatWaktu) === 0) return;
  await beriTiket(ctx, {
    pemilikId: args.pemilikId,
    peran: "peminjam",
    referensi: `PINJAMAN:${args.nomorReferensi}`,
    sumber: "pelunasan_tepat_waktu",
    waktu: args.waktu,
  });
}

/** Tiket pendana: satu per kelipatan Rp1 juta alokasi yang selesai siklus. */
export async function beriTiketPendanaan(
  ctx: MutationCtx,
  args: {
    pemilikId: Id<"users">;
    nomorReferensi: string;
    jumlahAlokasi: number;
    waktu: number;
  },
): Promise<void> {
  const jumlah = tiketPendana(args.jumlahAlokasi);
  if (jumlah === 0) return;
  await beriTiket(ctx, {
    pemilikId: args.pemilikId,
    peran: "pendana",
    referensi: `PENDANAAN:${args.nomorReferensi}`,
    sumber: "pendanaan_1jt",
    jumlah,
    waktu: args.waktu,
  });
}

async function tiketAktifPeriode(
  ctx: QueryCtx,
  userId: Id<"users">,
  periode: string,
  peran: "peminjam" | "pendana",
): Promise<number> {
  const rows = await ctx.db
    .query("doorprizeTiket")
    .withIndex("by_pemilik_periode", (q) =>
      q.eq("pemilikId", userId).eq("periode", periode),
    )
    .collect();
  return rows.filter((row) => row.status === "aktif" && row.peran === peran).length;
}

/**
 * Ringkasan widget untuk akun yang sedang masuk: jumlah tiket aktif bulan ini,
 * tanggal undian, hadiah utama, dan pemenang terakhir (bila ada).
 */
export const ringkasanSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const sekarang = Date.now();
    const periode = periodeUndian(sekarang);
    const [tiketPeminjamAktif, tiketPendanaAktif, undian] = await Promise.all([
      tiketAktifPeriode(ctx, userId, periode, "peminjam"),
      tiketAktifPeriode(ctx, userId, periode, "pendana"),
      ctx.db
        .query("doorprizeUndian")
        .withIndex("by_periode", (q) => q.eq("periode", periode))
        .first(),
    ]);
    let pemenang: { nama: string; peran: "peminjam" | "pendana"; hadiah: string } | null =
      null;
    if (undian !== null) {
      const pemilik = await ctx.db.get(undian.pemilikId);
      pemenang = {
        nama: labelPemilik(pemilik),
        peran: undian.peran,
        hadiah: undian.hadiah,
      };
    }
    return {
      periode,
      tiketPeminjam: tiketPeminjamAktif,
      tiketPendana: tiketPendanaAktif,
      tiketAktif: tiketPeminjamAktif + tiketPendanaAktif,
      tanggalUndian: akhirPeriodeUndian(periode),
      labelTanggalUndian: labelTanggalUndian(periode),
      hadiahUtama: HADIAH_UTAMA_DOORPRIZE,
      hadiahHiburan: HADIAH_HIBURAN_DOORPRIZE,
      pemenang,
    };
  },
});

/** Data papan admin: rekap tiket periode berjalan + pemenang terakhir. */
export const ringkasanAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRole(ctx);
    const sekarang = Date.now();
    const periode = periodeUndian(sekarang);
    const tiket = await ctx.db
      .query("doorprizeTiket")
      .withIndex("by_periode", (q) => q.eq("periode", periode))
      .collect();
    const aktif = tiket.filter((row) => row.status === "aktif");
    const peserta = new Set(aktif.map((row) => row.pemilikId as string));
    const pemenang = await ctx.db
      .query("doorprizeUndian")
      .withIndex("by_periode", (q) => q.eq("periode", periode))
      .first();
    let pemenangNama: string | null = null;
    if (pemenang !== null) {
      pemenangNama = labelPemilik(await ctx.db.get(pemenang.pemilikId));
    }
    return {
      periode,
      labelTanggalUndian: labelTanggalUndian(periode),
      jumlahTiket: tiket.length,
      tiketAktif: aktif.length,
      jumlahPeserta: peserta.size,
      tiketPeminjam: aktif.filter((row) => row.peran === "peminjam").length,
      tiketPendana: aktif.filter((row) => row.peran === "pendana").length,
      hadiahUtama: HADIAH_UTAMA_DOORPRIZE,
      pemenang:
        pemenang === null
          ? null
          : {
              nama: pemenangNama,
              peran: pemenang.peran,
              hadiah: pemenang.hadiah,
              diundiPada: pemenang.diundiPada,
              jumlahPeserta: pemenang.jumlahPeserta,
              jumlahTiket: pemenang.jumlahTiket,
            },
    };
  },
});

/**
 * Admin mengundi satu pemenang dari tiket aktif periode berjalan.
 *
 * Satu periode hanya punya satu undian: tombol kedua tidak mengundi ulang
 * diam-diam, melainkan memberi tahu pemenang yang sudah tercatat. Tiket
 * pemenang ditandai `menang`, tiket lain tetap `aktif` sebagai jejak.
 */
export const acakPemenang = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireAdminRole(ctx);
    const sekarang = Date.now();
    const periode = periodeUndian(sekarang);
    const sudah = await ctx.db
      .query("doorprizeUndian")
      .withIndex("by_periode", (q) => q.eq("periode", periode))
      .first();
    if (sudah !== null) {
      const nama = labelPemilik(await ctx.db.get(sudah.pemilikId));
      throw new Error(
        `Undian periode ${periode} sudah diundi: ${nama} (${sudah.hadiah}). Satu periode hanya punya satu pemenang.`,
      );
    }
    const tiket = await ctx.db
      .query("doorprizeTiket")
      .withIndex("by_periode", (q) => q.eq("periode", periode))
      .collect();
    const aktif = tiket.filter((row) => row.status === "aktif");
    if (aktif.length === 0) {
      throw new Error(`Belum ada tiket aktif untuk periode ${periode}.`);
    }
    const pemenang = aktif[Math.floor(Math.random() * aktif.length)];
    await ctx.db.patch(pemenang._id, {
      status: "menang",
      menangPada: sekarang,
    });
    const jumlahPeserta = new Set(aktif.map((row) => row.pemilikId as string)).size;
    await ctx.db.insert("doorprizeUndian", {
      periode,
      pemilikId: pemenang.pemilikId,
      tiketId: pemenang._id,
      peran: pemenang.peran,
      hadiah: HADIAH_UTAMA_DOORPRIZE,
      jumlahPeserta,
      jumlahTiket: aktif.length,
      diundiPada: sekarang,
      diundiOleh: user.email ?? user.name ?? "admin",
      diundiOlehId: user._id,
    });
    const pemilik = await ctx.db.get(pemenang.pemilikId);
    return {
      periode,
      nama: labelPemilik(pemilik),
      peran: pemenang.peran,
      hadiah: HADIAH_UTAMA_DOORPRIZE,
      jumlahPeserta,
      jumlahTiket: aktif.length,
    };
  },
});
