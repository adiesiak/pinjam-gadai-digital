/**
 * PRATINJAU SUPER ADMIN — "masuk sebagai" akun pendana atau peminjam.
 *
 * Kenapa ada: Super Admin perlu melihat persis apa yang dilihat seorang pendana
 * di ruang pendana dan seorang peminjam di dashboardnya — bukan ringkasan versi
 * admin. Pratinjau di sini benar-benar MEMBERI SESI akun target ke peramban
 * admin (lihat `auth/pratinjau.ts`), jadi yang tampil adalah aplikasi yang sama
 * dengan yang dialami akun itu, termasuk datanya.
 *
 * Karena itu izinnya dijaga berlapis:
 *
 *  1. `mintaTiket` wajib lolos `requireAdminSession` — peran admin DAN bukti
 *     TOTP pada sesi Auth yang sedang dipakai. Tanpa itu tidak ada tiket.
 *  2. Tiket berumur pendek (`MASA_TIKET_MS`) dan sekali pakai. Provider login
 *     hanya bisa menukar tiket yang sudah terbit, bukan meminta akun mana saja.
 *  3. Akun admin tidak dapat dipratinjau, dan akun tamu (anonim) tidak dapat
 *     dipratinjau karena sesinya terikat perangkat, bukan akun.
 *  4. Masa pratinjau dibatasi (`MASA_PRATINJAU_MS`): sesi pratinjau berhenti
 *     bisa diperbarui setelah batas itu, dan setiap pratinjau aktif terlihat di
 *     panel admin sehingga bisa diakhiri paksa dari sana. Token yang sudah
 *     terbit tetap berlaku sampai kedaluwarsa JWT-nya sendiri (masa JWT bawaan
 *     Convex Auth), jadi batas ini bukan pemutus instan.
 *  5. Awal dan akhir pratinjau masuk Audit Trail dengan nama admin sebagai
 *     aktornya — jadi tindakan yang terjadi selama pratinjau tetap dapat
 *     ditelusuri ke orang yang membuka sesi itu.
 *
 * Sesi pratinjau dibuat DI SINI, bukan oleh Convex Auth. Sebabnya penting: jalur
 * `signIn` bawaan selalu menghapus sesi yang sedang dipakai pemanggil (lihat
 * `createNewAndDeleteExistingSession` di paket Convex Auth) — artinya sesi ADMIN
 * ikut mati, dan ia harus memasukkan kata sandi + TOTP lagi setelah pratinjau.
 * Dengan menyerahkan `sessionId` milik akun target ke provider, sesi admin tidak
 * tersentuh, sedangkan masa berlaku sesi pratinjau tetap dibatasi di sini.
 *
 * Modul ini TIDAK menyentuh uang, ledger, atau status pinjaman: ia hanya
 * mengurus sesi pratinjau dan jejaknya.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";
import { ROLES } from "./schema";

/** Masa berlaku tiket sebelum dipakai provider login (5 menit). */
export const MASA_TIKET_MS = 5 * 60 * 1000;

/** Masa berlaku satu sesi pratinjau (2 jam) — cukup untuk menelusuri alur. */
export const MASA_PRATINJAU_MS = 2 * 60 * 60 * 1000;

/** Batas pratinjau aktif bersamaan per admin; mencegah sesi nyata menumpuk. */
export const BATAS_PRATINJAU_AKTIF = 3;

/** Panjang nonce yang diterima dari peramban admin. */
const NONCE_MIN = 16;
const NONCE_MAKS = 64;

/** Peran warisan penyedia dana yang masih tersimpan pada dokumen lama. */
const PERAN_PENDANA_LEGACY = "pendana";

/** Label akun untuk audit: nama, lalu email, lalu penanda netral. */
function labelAkun(user: Doc<"users">): string {
  const nama = user.name?.trim();
  if (nama) return nama;
  const email = user.email?.trim();
  if (email) return email;
  return `Akun ${user._id}`;
}

/**
 * Ruang tujuan setelah sesi berpindah: pendana ke ruang pendana, akun lain
 * (peminjam) ke dashboard. Diputuskan di server supaya klien tidak perlu tahu
 * aturan peran, dan pratinjau tidak pernah mendarat di halaman admin.
 */
function tujuanUntuk(peran: string | null): string {
  return peran === ROLES.DANA || peran === PERAN_PENDANA_LEGACY
    ? "/penyedia-dana"
    : "/dashboard";
}

function nonceSah(nonce: string): boolean {
  return (
    nonce.length >= NONCE_MIN &&
    nonce.length <= NONCE_MAKS &&
    /^[A-Za-z0-9_-]+$/.test(nonce)
  );
}

/**
 * Pratinjau yang masih berjalan (sesi benar-benar sudah diberikan dan belum
 * ditutup maupun kedaluwarsa) milik satu admin.
 */
async function pratinjauAktifAdmin(
  ctx: MutationCtx,
  adminId: Id<"users">,
  sekarang: number,
): Promise<Doc<"pratinjauSesi">[]> {
  const baris = await ctx.db
    .query("pratinjauSesi")
    .withIndex("by_admin", (q) => q.eq("adminId", adminId))
    .collect();
  return baris.filter(
    (r) =>
      r.dipakaiPada !== undefined &&
      r.selesai === undefined &&
      (r.berlakuHingga ?? 0) > sekarang,
  );
}

/**
 * Minta tiket pratinjau untuk satu akun. Hanya Super Admin dengan sesi TOTP
 * terverifikasi; hasilnya tiket sekali pakai yang ditukar provider login
 * menjadi sesi nyata akun target.
 */
export const mintaTiket = mutation({
  args: {
    targetId: v.id("users"),
    /** Nonce acak dari peramban admin (kunci bilah pratinjau). */
    nonce: v.string(),
    /** Alasan pratinjau (disarankan) — masuk Audit Trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { targetId, nonce, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    if (!nonceSah(nonce)) {
      throw new Error("Penanda pratinjau tidak valid. Muat ulang panel lalu coba lagi.");
    }

    const target = await ctx.db.get(targetId);
    if (target === null) {
      throw new Error("Akun yang ingin dipratinjau tidak ditemukan.");
    }
    if (target.role === ROLES.ADMIN) {
      throw new Error("Akun tim (admin) tidak dapat dipratinjau dari sini.");
    }
    if (target.isAnonymous === true) {
      throw new Error(
        "Akun tamu tidak dapat dipratinjau karena sesinya terikat perangkat, bukan akun.",
      );
    }

    const sekarang = Date.now();
    const aktif = await pratinjauAktifAdmin(ctx, adminId, sekarang);
    if (aktif.length >= BATAS_PRATINJAU_AKTIF) {
      throw new Error(
        `Sudah ada ${aktif.length} pratinjau aktif. Tutup dulu salah satunya di kartu "Pratinjau aktif".`,
      );
    }

    const peran = (target.role as string | undefined) ?? null;
    const tiketId = await ctx.db.insert("pratinjauSesi", {
      adminId,
      adminLabel: admin.email?.trim() || labelAkun(admin),
      targetId,
      targetLabel: labelAkun(target),
      targetPeran: peran ?? undefined,
      alasan: alasan?.trim() ? alasan.trim().slice(0, 300) : undefined,
      nonce,
      dibuatPada: sekarang,
      kedaluwarsa: sekarang + MASA_TIKET_MS,
    });

    return {
      tiketId,
      targetNama: labelAkun(target),
      tujuan: tujuanUntuk(peran),
      tiketKedaluwarsa: sekarang + MASA_TIKET_MS,
    };
  },
});

/**
 * Tukar tiket menjadi sesi nyata akun target. HANYA dipanggil provider login
 * `pratinjau-admin` (`auth/pratinjau.ts`), tidak pernah dari klien: pemanggilnya
 * tidak memeriksa identitas, karena buktinya adalah tiket itu sendiri —
 * kepemilikan tiket hanya bisa didapat dari `mintaTiket` yang bergerbang TOTP.
 */
export const _pakaiTiket = internalMutation({
  args: { tiketId: v.id("pratinjauSesi") },
  handler: async (ctx, { tiketId }): Promise<{
    userId: Id<"users">;
    sessionId: Id<"authSessions">;
    targetLabel: string;
  }> => {
    const tiket = await ctx.db.get(tiketId);
    if (tiket === null) {
      throw new Error("Tiket pratinjau tidak ditemukan. Minta tiket baru dari panel admin.");
    }
    if (tiket.dipakaiPada !== undefined) {
      throw new Error("Tiket pratinjau ini sudah dipakai. Minta tiket baru dari panel admin.");
    }

    const sekarang = Date.now();
    if (tiket.kedaluwarsa <= sekarang) {
      throw new Error("Tiket pratinjau kedaluwarsa. Minta tiket baru dari panel admin.");
    }

    const target = await ctx.db.get(tiket.targetId);
    if (target === null) {
      throw new Error("Akun yang ingin dipratinjau tidak ditemukan.");
    }

    const berlakuHingga = sekarang + MASA_PRATINJAU_MS;
    // Sesi nyata untuk akun target, sekaligus masa berlakunya. Umurnya sama
    // dengan batas pratinjau, jadi token yang tertinggal di peramban berhenti
    // berlaku sendiri walau tidak ada yang menutupnya.
    const sessionId = await ctx.db.insert("authSessions", {
      userId: tiket.targetId,
      expirationTime: berlakuHingga,
    });
    await ctx.db.patch(tiketId, {
      dipakaiPada: sekarang,
      berlakuHingga,
      sesiPratinjauId: sessionId,
    });

    await audit(
      ctx,
      tiket.adminId,
      tiket.adminLabel,
      "pratinjau_mulai",
      tiket.targetLabel,
      `Masuk sebagai ${tiket.targetLabel}${
        tiket.targetPeran ? ` (peran ${tiket.targetPeran})` : ""
      } lewat sesi nyata akun itu, berlaku sampai ${new Date(berlakuHingga).toLocaleString(
        "id-ID",
      )}${tiket.alasan ? ` — ${tiket.alasan}` : ""}`,
    );

    return { userId: tiket.targetId, sessionId, targetLabel: tiket.targetLabel };
  },
});

/**
 * Pratinjau yang sedang dipakai peramban ini — dibaca bilah pratinjau.
 *
 * Dicocokkan lewat nonce DAN akun yang sedang masuk, jadi nonce milik peramban
 * lain tidak pernah membocorkan nama admin yang mempratinjau. `null` berarti
 * tidak ada pratinjau berjalan (belum dipakai, sudah ditutup, atau kedaluwarsa).
 */
export const pratinjauAktif = query({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null || !nonceSah(nonce)) return null;

    const baris = await ctx.db
      .query("pratinjauSesi")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .order("desc")
      .first();
    if (baris === null || baris.targetId !== userId) return null;
    if (baris.dipakaiPada === undefined || baris.selesai !== undefined) return null;
    if ((baris.berlakuHingga ?? 0) <= Date.now()) return null;

    return {
      adminLabel: baris.adminLabel,
      targetLabel: baris.targetLabel,
      mulai: baris.dipakaiPada,
      berlakuHingga: baris.berlakuHingga ?? 0,
      tujuan: tujuanUntuk((baris.targetPeran as string | undefined) ?? null),
    };
  },
});

/* Sesi pratinjau sudah tercatat server-side saat tiket ditukar, jadi tidak ada
   mutation untuk melaporkannya dari klien. */

/**
 * Tutup pratinjau dari peramban yang sedang memakainya (tombol "Kembali ke Mode
 * Admin"). Hanya akun target baris itu yang boleh menutupnya; pemanggil lain
 * tidak mendapat apa-apa dan tidak bisa menutup pratinjau orang lain.
 *
 * Menutup di sini mencatat akhir pratinjau pada jejaknya; pemulihan sesi admin
 * dikerjakan peramban (lihat `lib/pratinjau.ts`).
 */
export const akhiriPratinjau = mutation({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null || !nonceSah(nonce)) return { ok: false, sudahSelesai: false };

    const baris = await ctx.db
      .query("pratinjauSesi")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .order("desc")
      .first();
    if (baris === null || baris.targetId !== userId) {
      return { ok: false, sudahSelesai: false };
    }
    if (baris.selesai !== undefined) return { ok: true, sudahSelesai: true };

    const sekarang = Date.now();
    await ctx.db.patch(baris._id, { selesai: sekarang, ditutupOleh: "klien" });
    await audit(
      ctx,
      baris.adminId,
      baris.adminLabel,
      "pratinjau_selesai",
      baris.targetLabel,
      "Pratinjau ditutup dari bilah pratinjau; sesi admin pada peramban itu dipulihkan.",
    );
    return { ok: true, sudahSelesai: false };
  },
});

/**
 * Pratinjau yang masih berjalan, untuk ditinjau panel admin. Dipakai sebagai
 * jaring pengaman: bila peramban admin ditutup tanpa menekan "Kembali", sesi
 * pratinjau tetap terlihat di sini dan bisa diakhiri paksa.
 */
export const daftarPratinjauAktif = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const baris = await ctx.db.query("pratinjauSesi").order("desc").take(100);

    return {
      rows: baris
        .filter(
          (r) =>
            r.dipakaiPada !== undefined &&
            r.selesai === undefined &&
            (r.berlakuHingga ?? 0) > sekarang,
        )
        .map((r) => ({
          id: r._id,
          adminLabel: r.adminLabel,
          targetId: r.targetId,
          targetLabel: r.targetLabel,
          targetPeran: (r.targetPeran as string | undefined) ?? null,
          tujuan: tujuanUntuk((r.targetPeran as string | undefined) ?? null),
          mulai: r.dipakaiPada ?? r.dibuatPada,
          berlakuHingga: r.berlakuHingga ?? 0,
          alasan: r.alasan ?? null,
        })),
      batas: BATAS_PRATINJAU_AKTIF,
      masaBerlakuMs: MASA_PRATINJAU_MS,
    };
  },
});

/**
 * Akhiri paksa sebuah pratinjau dari panel admin.
 *
 * Selain menutup catatannya, sesi Auth HASIL PRATINJAU dicabut. Urutannya:
 *  1. Sesi yang tercatat di barisnya (`sesiPratinjauId`, dibuat `_pakaiTiket`) —
 *     pencabutan paling tepat: hanya sesi itu yang gugur.
 *  2. Bila belum tercatat (baris dari bentuk sebelumnya), barulah sesi akun
 *     target yang dibuat SETELAH pratinjau dimulai dicabut.
 *
 * Sesi sungguhan milik pemilik akun — dibuat sebelum pratinjau — tidak pernah
 * ikut tercabut.
 */
export const akhiriPratinjauOlehAdmin = mutation({
  args: {
    id: v.id("pratinjauSesi"),
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { id, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const baris = await ctx.db.get(id);
    if (baris === null) throw new Error("Baris pratinjau tidak ditemukan.");
    if (baris.selesai !== undefined) return { ok: true, sudahSelesai: true, dicabut: 0 };

    const sekarang = Date.now();
    const mulai = baris.dipakaiPada ?? baris.dibuatPada;

    let dicabut = 0;
    if (baris.sesiPratinjauId !== undefined) {
      const sesi = await ctx.db.get(baris.sesiPratinjauId);
      if (sesi !== null) {
        await ctx.db.delete(sesi._id);
        dicabut += 1;
      }
    } else {
      const sesiAuth = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", baris.targetId))
        .collect();
      for (const sesi of sesiAuth) {
        if (sesi._creationTime >= mulai) {
          await ctx.db.delete(sesi._id);
          dicabut += 1;
        }
      }
    }

    await ctx.db.patch(id, { selesai: sekarang, ditutupOleh: "admin" });
    await audit(
      ctx,
      adminId,
      admin.email?.trim() || labelAkun(admin),
      "pratinjau_diakhiri_admin",
      baris.targetLabel,
      `Pratinjau oleh ${baris.adminLabel} diakhiri dari panel admin${
        dicabut > 0 ? `; ${dicabut} sesi hasil pratinjau dicabut` : ""
      }${alasan?.trim() ? ` — ${alasan.trim()}` : ""}`,
    );

    return { ok: true, sudahSelesai: false, dicabut };
  },
});
