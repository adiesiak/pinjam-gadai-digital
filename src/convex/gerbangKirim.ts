/**
 * Penegakan gerbang anti-pengiriman palsu di sisi server.
 *
 * `lib/gerbangKirim.ts` memutuskan apakah satu kiriman wajar; berkas ini yang
 * menegakkannya terhadap keadaan nyata: berapa kali akun ini mengirim, berapa
 * kali ketahuan mencurigakan, dan kapan hukuman sementaranya berakhir.
 *
 * Kenapa pembatas laju di sini tidak memakai tabel percobaan login: `loginAttempts`
 * dan `adminLoginAttempts` menjawab "siapa yang mencoba masuk", sedangkan tabel
 * `gerbangKirim` menjawab "siapa yang mencoba mengirim pengajuan". Mencampur
 * keduanya membuat satu percobaan masuk yang gagal ikut memakan jatah pengajuan,
 * dan sebaliknya.
 *
 * Batas yang berlaku (semuanya ditegakkan server, bukan dipercaya dari klien):
 * - 5 kiriman per menit per akun. Melebihi itu adalah penyalahgunaan tombol
 *   atau script, bukan pengguna yang salah pencet.
 * - 3 percobaan mencurigakan (jebakan terisi, jeda waktu mustahil, atau
 *   pembatas laju ditembus) dalam 15 menit mengunci pengajuan akun itu selama
 *   15 menit. Kunci ini BERAKHIR sendiri: percobaan yang ditolak saat sudah
 *   terkunci tidak menambah pelanggaran baru, jadi penyerang tidak bisa
 *   memperpanjang hukuman tanpa batas dan pemilik akun tidak terkunci selamanya.
 *
 * Setiap pelanggaran dan setiap pengiriman yang diterima ditulis ke `auditLog`
 * dengan akun pelakunya: tanpa jejak, "kenapa pengajuan saya ditolak" tidak bisa
 * dijawab dan penyalahgunaan tidak bisa ditelusuri.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { periksaGerbangKirim } from "../lib/gerbangKirim";

/** Batas kiriman per akun dalam satu jendela laju. */
export const MAKS_KIRIM = 5;
/** Jendela pembatas laju: satu menit, seperti batas endpoint sensitif lain. */
export const JENDELA_KIRIM_MS = 60_000;
/** Pelanggaran yang membuat pengajuan akun dikunci sementara. */
export const MAKS_PELANGGARAN = 3;
/** Jendela penghitungan pelanggaran sekaligus masa kunci sementara. */
export const JENDELA_PELANGGARAN_MS = 15 * 60_000;
/** Masa simpan baris jejak gerbang; cukup untuk menelusuri insiden terdekat. */
export const MASA_SIMPAN_JEJAK_MS = 7 * 86_400_000;

const JENIS_KIRIM = "kirim";
const JENIS_PELANGGARAN = "pelanggaran";

/** Hasil pemeriksaan batas: boleh lanjut, atau ditolak dengan alasan siap tampil. */
export type HasilBatas =
  | { lolos: true; alasan: null; terkunci: false }
  | { lolos: false; alasan: string; terkunci: boolean };

/** Kunci jejak untuk satu akun. Akun adalah satuan yang tidak bisa dipalsukan. */
export function kunciAkun(userId: Id<"users">): string {
  return `akun:${userId}`;
}

function sisaDetik(tertua: number, jendelaMs: number): number {
  return Math.max(1, Math.ceil((tertua + jendelaMs - Date.now()) / 1000));
}

/**
 * Baris dalam jendela terakhir untuk satu kunci dan satu jenis.
 *
 * Diambil berurutan naik (urutan indeks) dan dibatasi sejumlah ambang batas,
 * bukan seluruh isi tabel: yang perlu diketahui hanya "sudah melewati batas
 * atau belum", dan baris paling tua itu sendiri sudah cukup untuk menghitung
 * sisa waktu hukuman.
 */
async function barisDalamJendela(
  ctx: MutationCtx,
  kunci: string,
  jenis: string,
  jendelaMs: number,
  batas: number,
) {
  const sejak = Date.now() - jendelaMs;
  return ctx.db
    .query("gerbangKirim")
    .withIndex("by_kunci_jenis_waktu", (q) =>
      q.eq("kunci", kunci).eq("jenis", jenis).gte("waktu", sejak),
    )
    .take(batas);
}

/** Periksa kunci sementara dan pembatas laju untuk satu akun. */
export async function periksaBatasGerbang(
  ctx: MutationCtx,
  kunci: string,
): Promise<HasilBatas> {
  const pelanggaran = await barisDalamJendela(
    ctx,
    kunci,
    JENIS_PELANGGARAN,
    JENDELA_PELANGGARAN_MS,
    MAKS_PELANGGARAN,
  );
  if (pelanggaran.length >= MAKS_PELANGGARAN) {
    const menit = Math.ceil(sisaDetik(pelanggaran[0].waktu, JENDELA_PELANGGARAN_MS) / 60);
    return {
      lolos: false,
      terkunci: true,
      alasan: `Pengajuan dikunci sementara setelah ${MAKS_PELANGGARAN} percobaan mencurigakan. Coba lagi dalam ${menit} menit.`,
    };
  }

  const kirim = await barisDalamJendela(ctx, kunci, JENIS_KIRIM, JENDELA_KIRIM_MS, MAKS_KIRIM);
  if (kirim.length >= MAKS_KIRIM) {
    const detik = sisaDetik(kirim[0].waktu, JENDELA_KIRIM_MS);
    return {
      lolos: false,
      terkunci: false,
      alasan: `Batas ${MAKS_KIRIM} pengajuan per menit tercapai. Tunggu ${detik} detik lagi.`,
    };
  }

  return { lolos: true, alasan: null, terkunci: false };
}

/** Catat satu pengajuan yang diterima: dasar pembatas laju, bukan pelanggaran. */
export async function catatKirimGerbang(ctx: MutationCtx, kunci: string): Promise<void> {
  await ctx.db.insert("gerbangKirim", {
    kunci,
    jenis: JENIS_KIRIM,
    waktu: Date.now(),
  });
}

/**
 * Catat satu pelanggaran, beserta baris `auditLog` yang menyebut pelakunya.
 *
 * `userId` diisi bila pelakunya akun yang dikenal; tanpa itu (mis. percobaan
 * sebelum sesi terbentuk) jejaknya tetap ditulis, hanya tanpa nama akun.
 */
export async function catatPelanggaranGerbang(
  ctx: MutationCtx,
  args: { kunci: string; sebab: string; userId?: Id<"users"> },
): Promise<void> {
  const waktu = Date.now();
  await ctx.db.insert("gerbangKirim", {
    kunci: args.kunci,
    jenis: JENIS_PELANGGARAN,
    sebab: args.sebab,
    waktu,
  });
  await ctx.db.insert("auditLog", {
    aktorLabel: args.userId === undefined ? "Gerbang pengajuan" : `Pemohon ${args.userId}`,
    aksi: "pengajuan_ditolak_gerbang",
    target: args.kunci,
    detail: args.sebab,
    waktu,
  });
}

/**
 * GERBANG PENGIRIMAN PENGAJUAN - dipanggil di awal `loans.createLoanApplication`
 * dan `loans.createPawnApplication`, SETELAH pemeriksaan kunci idempotensi.
 *
 * Urutannya penting: pengiriman ulang yang sah (retry jaringan dengan kunci
 * idempotensi yang sama) sudah dijawab lebih dulu sebagai hasil yang sama, jadi
 * ia tidak ikut memakan jatah laju maupun terekam sebagai pelanggaran. Yang
 * sampai ke sini benar-benar niat pengiriman baru.
 *
 * Melempar `Error` dengan kalimat siap tampil bila kiriman ditolak.
 */
export async function gerbangPengajuan(
  ctx: MutationCtx,
  opsi: {
    userId: Id<"users">;
    /** Isi kolom jebakan (honeypot); pengguna sungguhan tidak pernah mengisinya. */
    jebakan?: string;
    /** Cap waktu saat formulir dibuka di klien, dalam milidetik epoch. */
    formDibukaPada?: number;
  },
): Promise<void> {
  const kunci = kunciAkun(opsi.userId);

  const batas = await periksaBatasGerbang(ctx, kunci);
  if (!batas.lolos) {
    // Sudah terkunci: tolakan ini tidak dicatat sebagai pelanggaran baru supaya
    // hukuman tetap berbatas 15 menit dan tidak diperpanjang tanpa henti.
    if (!batas.terkunci) {
      await catatPelanggaranGerbang(ctx, {
        kunci,
        sebab: batas.alasan,
        userId: opsi.userId,
      });
    }
    throw new Error(batas.alasan);
  }

  const hasil = periksaGerbangKirim({
    jebakan: opsi.jebakan,
    formDibukaPada: opsi.formDibukaPada,
    dikirimPada: Date.now(),
  });
  if (!hasil.lolos) {
    await catatPelanggaranGerbang(ctx, {
      kunci,
      sebab: hasil.alasan,
      userId: opsi.userId,
    });
    throw new Error(hasil.alasan);
  }

  await catatKirimGerbang(ctx, kunci);
}

/**
 * MINTA IZIN KIRIM - dipanggil formulir pengajuan SEBELUM mutasi pengajuan.
 *
 * Kenapa ada padahal mutasi pengajuan sudah memeriksa hal yang sama: di Convex
 * seluruh tulisan satu mutasi dibatalkan bila mutasi itu melempar galat, jadi
 * penolakan di dalam mutasi pengajuan TIDAK BISA meninggalkan jejak. Kalau
 * pelanggaran dan kunci sementara hanya dicatat di sana, catatannya selalu ikut
 * terhapus dan kuncinya tidak pernah aktif. Di sini penolakan dijawab sebagai
 * NILAI (mutasinya sukses), jadi baris pelanggaran, jejak audit, dan hitungan
 * kunci sementara benar-benar tersimpan.
 *
 * Yang TIDAK dicatat di sini: pengajuan yang diterima. Jatah pembatas laju baru
 * diambil saat pengajuan benar-benar dibuat (`createLoanApplication`), supaya
 * pengguna yang gagal di aturan bisnis lain tidak kehilangan jatahnya tanpa
 * pernah mengirim apa pun.
 *
 * Mutasi pengajuan tetap memeriksa ulang semuanya sebagai penjaga terakhir bila
 * ada pemanggil yang melewati gerbang ini.
 */
export const mintaIzinKirim = mutation({
  args: {
    jebakan: v.optional(v.string()),
    formDibukaPada: v.optional(v.number()),
  },
  returns: v.object({
    ok: v.boolean(),
    alasan: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const kunci = kunciAkun(userId);

    const batas = await periksaBatasGerbang(ctx, kunci);
    if (!batas.lolos) {
      if (!batas.terkunci) {
        await catatPelanggaranGerbang(ctx, { kunci, sebab: batas.alasan, userId });
      }
      return { ok: false, alasan: batas.alasan };
    }

    const hasil = periksaGerbangKirim({
      jebakan: args.jebakan,
      formDibukaPada: args.formDibukaPada,
      dikirimPada: Date.now(),
    });
    if (!hasil.lolos) {
      await catatPelanggaranGerbang(ctx, { kunci, sebab: hasil.alasan, userId });
      return { ok: false, alasan: hasil.alasan };
    }

    return { ok: true, alasan: null };
  },
});

/**
 * Retensi jejak gerbang - dijalankan cron harian.
 *
 * Barisnya hanya dipakai untuk membatasi laju dan mengunci sementara; setelah
 * beberapa hari ia tidak menjawab pertanyaan apa pun dan hanya menambah data
 * yang harus dilindungi. Yang tetap tinggal adalah `auditLog` pelanggarannya,
 * karena itulah jejak akuntabilitasnya.
 */
export const bersihkanJejakGerbang = internalMutation({
  args: {},
  handler: async (ctx) => {
    const batas = Date.now() - MASA_SIMPAN_JEJAK_MS;
    const lama = await ctx.db
      .query("gerbangKirim")
      .withIndex("by_waktu", (q) => q.lt("waktu", batas))
      .take(500);
    for (const baris of lama) {
      await ctx.db.delete(baris._id);
    }
    return { dihapus: lama.length };
  },
});
