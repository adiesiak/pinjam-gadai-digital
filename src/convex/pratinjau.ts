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
import { getAdminGateStatus, requireAdminSession } from "./adminAuthz";
import { audit } from "./system";
import { ROLES } from "./schema";
import { namaTampil } from "../lib/nama";
import { formatWaktuWIB } from "../lib/waktu";

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

    // Simpan lokasi asli SEBELUM sesi pratinjau diberikan. Ini jaring pengaman
    // terakhir: bila ada jalur tulis lokasi yang lolos dari pagar server (mis.
    // aplikasi versi lama atau token perangkat sisa pratinjau sebelumnya),
    // lokasi nasabah tetap bisa dikembalikan saat pratinjau ditutup.
    const lokasiSaatIni = await ctx.db
      .query("lokasiStatus")
      .withIndex("by_user", (q) => q.eq("userId", tiket.targetId))
      .first();

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
      lokasiSebelum:
        lokasiSaatIni === null
          ? null
          : {
              lat: lokasiSaatIni.lat,
              lng: lokasiSaatIni.lng,
              akurasi: lokasiSaatIni.akurasi,
              waktu: lokasiSaatIni.waktu,
              sumber: lokasiSaatIni.sumber,
              ...(lokasiSaatIni.platform === undefined
                ? {}
                : { platform: lokasiSaatIni.platform }),
              ...(lokasiSaatIni.versiApp === undefined
                ? {}
                : { versiApp: lokasiSaatIni.versiApp }),
              ...(lokasiSaatIni.tanda === undefined
                ? {}
                : { tanda: lokasiSaatIni.tanda }),
              ...(lokasiSaatIni.identikBerturut === undefined
                ? {}
                : { identikBerturut: lokasiSaatIni.identikBerturut }),
            },
    });

    await audit(
      ctx,
      tiket.adminId,
      tiket.adminLabel,
      "pratinjau_mulai",
      tiket.targetLabel,
      `Masuk sebagai ${tiket.targetLabel}${
        tiket.targetPeran ? ` (peran ${tiket.targetPeran})` : ""
      } lewat sesi nyata akun itu, berlaku sampai ${formatWaktuWIB(berlakuHingga)}${
        tiket.alasan ? ` — ${tiket.alasan}` : ""
      }`,
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

/**
 * Apakah pratinjau yang dimulai peramban ini masih berjalan?
 *
 * Dipakai klien sebelum memulai pratinjau baru. Peramban yang pratinjaunya
 * berakhir sendiri (batas 2 jam) atau diakhiri dari panel tetap menyimpan
 * salinan sesi admin; tanpa pemeriksaan ini salinan itu memblokir "Masuk
 * sebagai" berikutnya dengan pesan bilah yang sudah tidak ada di layar.
 *
 * Jawabannya sengaja hanya boolean untuk nonce itu — nama akun dan nama admin
 * tidak ikut dikirim — jadi nonce milik peramban lain tidak membocorkan apa
 * pun. Pemanggil tetap harus sudah masuk, karena hanya peramban ber-sesi yang
 * bisa memulai pratinjau.
 */
export const pratinjauBerjalan = query({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null || !nonceSah(nonce)) return false;

    const baris = await ctx.db
      .query("pratinjauSesi")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .order("desc")
      .first();
    if (baris === null) return false;

    return (
      baris.dipakaiPada !== undefined &&
      baris.selesai === undefined &&
      (baris.berlakuHingga ?? 0) > Date.now()
    );
  },
});

/* Sesi pratinjau sudah tercatat server-side saat tiket ditukar, jadi tidak ada
   mutation untuk melaporkannya dari klien. */

/**
 * Kembalikan lokasi nasabah ke titik SEBELUM pratinjau bila titik terkini
 * ditulis setelah pratinjau dimulai.
 *
 * Pagar di `lokasi.simpanTitik` sudah menolak titik dari sesi pratinjau, jadi
 * normalnya fungsi ini tidak menemukan apa pun untuk diperbaiki. Ia tetap
 * dijalankan karena lokasi yang tertimpa koordinat admin bersifat permanen dan
 * fatal: peta pemantauan menunjuk orang yang salah, dan gerbang lokasi memakai
 * titik yang bukan milik nasabah. Titik asli yang lebih lama tetap tersimpan di
 * `lokasiJejak`; yang dipulihkan di sini adalah status terkini (dasar gerbang
 * dan peta), bukan seluruh riwayat.
 *
 * Bila nasabah memang sempat mengirim titik sendiri selama pratinjau, titik itu
 * ikut diganti dengan titik sebelum pratinjau. Kegagalannya aman (titik jadi
 * lebih lama sehingga gerbang meminta titik baru), sedangkan membiarkan titik
 * admin adalah kesalahan yang tidak bisa dikenali lagi setelahnya.
 */
async function pulihkanLokasiNasabah(
  ctx: MutationCtx,
  baris: Doc<"pratinjauSesi">,
): Promise<void> {
  if (baris.lokasiSebelum === undefined || baris.dipakaiPada === undefined) return;

  const status = await ctx.db
    .query("lokasiStatus")
    .withIndex("by_user", (q) => q.eq("userId", baris.targetId))
    .first();
  // `<` bukan `<=`: titik yang ditulis pada milidetik yang sama dengan mulai
  // pratinjau bisa berasal dari perangkat admin, sedangkan memulihkan snapshot
  // pada titik yang memang sudah asli tidak mengubah apa pun.
  if (status === null || status.waktu < baris.dipakaiPada) return;

  if (baris.lokasiSebelum === null) {
    await ctx.db.delete(status._id);
  } else {
    const { lat, lng, akurasi, waktu, sumber, platform, versiApp, tanda, identikBerturut } =
      baris.lokasiSebelum;
    await ctx.db.patch(status._id, {
      lat,
      lng,
      akurasi,
      waktu,
      sumber,
      // `undefined` menghapus kolom: status lama tidak boleh membawa tanda
      // atau metadata perangkat dari titik admin yang sempat tersimpan.
      platform,
      versiApp,
      tanda,
      identikBerturut,
    });
  }

  await ctx.db.patch(baris._id, { lokasiDipulihkanPada: Date.now() });
}

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
    await pulihkanLokasiNasabah(ctx, baris);
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

/** Jumlah akun yang dikirim pemilih Mode Nasabah sekali tampil. */
const BATAS_HASIL_UJI = 20;

/**
 * AKUN NASABAH UNTUK MODE NASABAH — pencarian target pratinjau di /dashboard.
 *
 * Bedanya dengan `admin.daftarNasabah`: daftar itu memuat seluruh data nasabah
 * untuk dikelola, sedangkan di sini admin hanya butuh MEMILIH satu akun uji.
 * Karena itu yang dikirim hanya nama, email, kode nasabah, status KYC, serta
 * dua penanda yang menentukan akun mana yang layak dicoba (sudah punya data
 * diri, sudah pernah mengajukan). NIK dan nomor WhatsApp hanya dipakai untuk
 * mencocokkan pencarian dan tidak pernah keluar dari server.
 *
 * Pagar: peran admin wajib. Sesi admin yang belum lolos TOTP tidak diberi galat
 * (layarnya hanya menampilkan "verifikasi dulu"), sebab galat di query akan
 * mematikan seluruh halaman alih-alih menjelaskan langkah berikutnya. Sesi yang
 * sudah lolos tetap tidak mendapat izin menukar tiket tanpa `mintaTiket`, jadi
 * daftar ini tidak menambah jalan masuk baru.
 */
export const cariNasabahUji = query({
  args: { kueri: v.string() },
  handler: async (ctx, { kueri }) => {
    const gate = await getAdminGateStatus(ctx);
    if (!gate.isAdmin) throw new Error("Akses khusus Super Admin.");
    if (!gate.verified) return { siap: false, hasil: [], total: 0 };

    const kunci = kueri.trim().toLowerCase().slice(0, 64);
    const [users, profil, kyc] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("nasabahProfil").collect(),
      ctx.db.query("kycProfil").collect(),
    ]);
    const profilPer = new Map(profil.map((p) => [p.userId, p]));
    const kycPer = new Map(kyc.map((k) => [k.userId, k]));

    const cocok = users
      .filter((u) => {
        if (u.isAnonymous === true) return false;
        // Akun tanpa peran adalah pendaftar yang belum mengajukan apa pun;
        // justru akun seperti ini yang perlu dicoba untuk alur onboarding dan
        // KYC. Peran pendana/pemantau punya ruangnya sendiri, dan akun admin
        // memang tidak boleh dipratinjau.
        return u.role === undefined || u.role === ROLES.PEMINJAM;
      })
      .map((u) => {
        const p = profilPer.get(u._id);
        return {
          userId: u._id,
          nama: namaTampil([p?.namaLengkap, u.name, u.email], "TANPA NAMA"),
          email: u.email?.trim() || null,
          kodePeminjam: u.kodePeminjam ?? null,
          kycStatus: kycPer.get(u._id)?.status ?? null,
          punyaDataDiri: p !== undefined,
          punyaPinjaman: false,
          cari: [p?.namaLengkap, u.name, u.email, u.kodePeminjam, p?.nik, p?.nomorWhatsApp]
            .filter((nilai): nilai is string => typeof nilai === "string")
            .join(" ")
            .toLowerCase(),
        };
      })
      .filter((baris) => kunci === "" || baris.cari.includes(kunci))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

    const halaman = cocok.slice(0, BATAS_HASIL_UJI);
    // Satu pembacaan berindeks per akun yang benar-benar tampil, bukan
    // `collect()` seluruh tabel pinjaman: daftar ini hanya butuh penanda.
    await Promise.all(
      halaman.map(async (baris) => {
        const pinjaman = await ctx.db
          .query("loans")
          .withIndex("by_user", (q) => q.eq("userId", baris.userId))
          .first();
        baris.punyaPinjaman = pinjaman !== null;
      }),
    );

    return {
      siap: true,
      hasil: halaman.map((baris) => ({
        userId: baris.userId,
        nama: baris.nama,
        email: baris.email,
        kodePeminjam: baris.kodePeminjam,
        kycStatus: baris.kycStatus,
        punyaDataDiri: baris.punyaDataDiri,
        punyaPinjaman: baris.punyaPinjaman,
      })),
      total: cocok.length,
    };
  },
});

/**
 * Tutup satu baris pratinjau dan cabut sesi hasil pratinjau-nya.
 *
 * Urutan pencabutannya:
 *  1. Sesi yang tercatat di barisnya (`sesiPratinjauId`, dibuat `_pakaiTiket`) —
 *     pencabutan paling tepat: hanya sesi itu yang gugur.
 *  2. Bila belum tercatat (baris dari bentuk sebelumnya), barulah sesi akun
 *     target yang dibuat SETELAH pratinjau dimulai dicabut.
 *
 * Sesi sungguhan milik pemilik akun — dibuat sebelum pratinjau — tidak pernah
 * ikut tercabut.
 */
async function cabutPratinjau(
  ctx: MutationCtx,
  baris: Doc<"pratinjauSesi">,
  sekarang: number,
): Promise<number> {
  // Tiket yang belum pernah dipakai tidak punya sesi hasil pratinjau; menutup
  // barisnya saja, karena sesi akun target yang ada bukan milik pratinjau ini.
  if (baris.dipakaiPada === undefined) {
    await ctx.db.patch(baris._id, { selesai: sekarang, ditutupOleh: "admin" });
    return 0;
  }

  const mulai = baris.dipakaiPada;
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

  await pulihkanLokasiNasabah(ctx, baris);
  await ctx.db.patch(baris._id, { selesai: sekarang, ditutupOleh: "admin" });
  return dicabut;
}

/** Akhiri paksa sebuah pratinjau dari panel admin (kartu "Pratinjau Aktif"). */
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
    const dicabut = await cabutPratinjau(ctx, baris, sekarang);
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

/**
 * Akhiri pratinjau yang menahan peramban ini, dicari lewat nonce.
 *
 * Dipakai dialog "Masuk sebagai" ketika peramban masih menyimpan penanda
 * pratinjau yang server anggap hidup, sementara bilah "Kembali ke Mode Admin"
 * tidak ada di layar — mis. sesi pratinjau ditinggalkan lewat Keluar lalu admin
 * masuk lagi sebelum batas 2 jamnya habis. Hanya admin yang memulai baris itu
 * yang boleh memakainya, dan aksinya masuk Audit Trail seperti penutupan dari
 * panel.
 */
export const akhiriPratinjauTersangkut = mutation({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    if (!nonceSah(nonce)) throw new Error("Penanda pratinjau tidak valid.");

    const baris = await ctx.db
      .query("pratinjauSesi")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .order("desc")
      .first();
    if (baris === null) return { ok: false, sudahSelesai: false, dicabut: 0 };
    if (baris.adminId !== adminId) {
      throw new Error(
        "Pratinjau ini dimulai admin lain. Akhiri dari kartu Pratinjau Aktif di tab Nasabah & Pendana.",
      );
    }
    if (baris.selesai !== undefined) return { ok: true, sudahSelesai: true, dicabut: 0 };

    const sekarang = Date.now();
    const dicabut = await cabutPratinjau(ctx, baris, sekarang);
    await audit(
      ctx,
      adminId,
      admin.email?.trim() || labelAkun(admin),
      "pratinjau_diakhiri_admin",
      baris.targetLabel,
      `Pratinjau oleh ${baris.adminLabel} diakhiri dari dialog "Masuk sebagai" karena penanda di peramban menahannya${
        dicabut > 0 ? `; ${dicabut} sesi hasil pratinjau dicabut` : ""
      }`,
    );

    return { ok: true, sudahSelesai: false, dicabut };
  },
});

/** Satu jendela waktu saat sesi pratinjau berjalan. */
type JendelaPratinjau = {
  sesiId: Id<"pratinjauSesi">;
  mulai: number;
  akhir: number;
};

/** Jendela pratinjau untuk satu baris; null bila tiketnya belum dipakai. */
function jendelaDari(baris: Doc<"pratinjauSesi">): JendelaPratinjau | null {
  if (baris.dipakaiPada === undefined) return null;
  const akhir = baris.selesai ?? baris.berlakuHingga ?? Date.now();
  return {
    sesiId: baris._id,
    mulai: baris.dipakaiPada,
    akhir: Math.max(baris.dipakaiPada, akhir),
  };
}

function dalamJendela(waktu: number, jendela: readonly JendelaPratinjau[]): boolean {
  return jendela.some((w) => waktu >= w.mulai && waktu <= w.akhir);
}

/**
 * PULIHKAN JEJAK LOKASI YANG TERTIMPA PRATINJAU.
 *
 * Sebelum pagar lokasi dipasang, peramban admin yang "masuk sebagai" nasabah
 * mengirim titik GPS perangkat admin ke akun nasabah. Titik itu tercampur di
 * `lokasiJejak`, dan yang terakhir juga menjadi `lokasiStatus` — peta pemantauan
 * lalu menunjuk admin, bukan nasabahnya.
 *
 * Fungsi ini menandai titik yang waktunya jatuh di dalam jendela pratinjau
 * (`dikecualikan: "pratinjau_admin"`) dan memulihkan `lokasiStatus` ke titik
 * sah terakhir: jejak sebelum/sesudah jendela, atau lokasi pengajuan yang dikirim
 * SEBELUM pratinjau dimulai. Baris jejak tidak dihapus supaya audit tetap utuh;
 * pembaca peta dan riwayat melewati baris yang ditandai.
 *
 * Titik nasabah yang kebetulan dikirim saat pratinjau juga ikut ditandai. Itu
 * disengaja: membiarkan satu titik admin lolos lebih berbahaya daripada meminta
 * nasabah mengirim titik baru (gerbang lokasi akan memintanya sendiri).
 *
 * Internal: dijalankan operator lewat `convex run`, bukan dari peramban.
 * `terapkan: false` (bawaan) hanya menghitung, tidak menulis apa pun.
 */
export const _pulihkanJejakPratinjau = internalMutation({
  args: {
    terapkan: v.optional(v.boolean()),
    aktor: v.optional(v.string()),
  },
  handler: async (ctx, { terapkan, aktor }) => {
    const kering = terapkan !== true;
    const semuaSesi = await ctx.db.query("pratinjauSesi").collect();
    const perTarget = new Map<
      Id<"users">,
      { label: string; jendela: JendelaPratinjau[] }
    >();

    for (const sesi of semuaSesi) {
      const jendela = jendelaDari(sesi);
      if (jendela === null) continue;
      const data = perTarget.get(sesi.targetId) ?? {
        label: sesi.targetLabel,
        jendela: [],
      };
      data.jendela.push(jendela);
      perTarget.set(sesi.targetId, data);
    }

    const labelAktor = aktor?.trim() || "pemulihan lokasi pratinjau";
    const target: Array<{
      userId: Id<"users">;
      label: string;
      titikDikecualikan: number;
      status: "tetap" | "dipulihkan" | "dihapus";
      sumberStatus: "jejak" | "pengajuan" | null;
      statusLama: { lat: number; lng: number; waktu: number } | null;
      statusBaru: { lat: number; lng: number; waktu: number } | null;
    }> = [];
    let totalTitik = 0;
    let totalDipulihkan = 0;
    let totalDihapus = 0;

    for (const [targetId, info] of perTarget) {
      const jejak = await ctx.db
        .query("lokasiJejak")
        .withIndex("by_user", (q) => q.eq("userId", targetId))
        .order("desc")
        .collect();

      // Titik yang ditulis selama jendela pratinjau — kandidat untuk ditandai.
      const kena = jejak.flatMap((baris) => {
        if (baris.dikecualikan !== undefined) return [];
        const jendela = info.jendela.find(
          (w) => baris.waktu >= w.mulai && baris.waktu <= w.akhir,
        );
        return jendela === undefined ? [] : [{ baris, jendela }];
      });

      // Titik yang boleh dipakai sebagai lokasi nasabah: tidak ditandai dan
      // tidak berada di jendela pratinjau mana pun.
      const sah = jejak.filter(
        (baris) =>
          baris.dikecualikan === undefined &&
          !info.jendela.some(
            (w) => baris.waktu >= w.mulai && baris.waktu <= w.akhir,
          ),
      );

      const status = await ctx.db
        .query("lokasiStatus")
        .withIndex("by_user", (q) => q.eq("userId", targetId))
        .first();

      let statusAksi: "tetap" | "dipulihkan" | "dihapus" = "tetap";
      let sumberStatus: "jejak" | "pengajuan" | null = null;
      let statusBaru: { lat: number; lng: number; waktu: number } | null = null;
      let pengajuanSumber: Doc<"loans"> | null = null;

      if (status !== null && dalamJendela(status.waktu, info.jendela)) {
        const terbaru = sah[0];
        if (terbaru !== undefined) {
          statusAksi = "dipulihkan";
          sumberStatus = "jejak";
          statusBaru = { lat: terbaru.lat, lng: terbaru.lng, waktu: terbaru.waktu };
        } else {
          // Belum ada jejak sama sekali: pakai lokasi pengajuan yang dikirim
          // SEBELUM pratinjau mulai. Lokasi pengajuan yang dibuat saat pratinjau
          // juga berasal dari perangkat admin, jadi tidak boleh dipakai.
          const mulai = Math.min(...info.jendela.map((w) => w.mulai));
          const pinjaman = await ctx.db
            .query("loans")
            .withIndex("by_user", (q) => q.eq("userId", targetId))
            .collect();
          const pengajuan = pinjaman
            .filter(
              (loan) =>
                loan.lokasiAjukan !== undefined &&
                loan.lokasiAjukan.waktu < mulai &&
                loan._creationTime < mulai,
            )
            .sort((a, b) => b._creationTime - a._creationTime)[0];

          if (pengajuan?.lokasiAjukan !== undefined) {
            pengajuanSumber = pengajuan;
            statusAksi = "dipulihkan";
            sumberStatus = "pengajuan";
            statusBaru = {
              lat: pengajuan.lokasiAjukan.lat,
              lng: pengajuan.lokasiAjukan.lng,
              waktu: pengajuan.lokasiAjukan.waktu,
            };
          } else {
            statusAksi = "dihapus";
          }
        }
      }

      if (kena.length === 0 && statusAksi === "tetap") continue;

      if (!kering) {
        for (const { baris, jendela } of kena) {
          await ctx.db.patch(baris._id, {
            dikecualikan: "pratinjau_admin",
            pratinjauSesiId: jendela.sesiId,
          });
        }

        if (status !== null && statusAksi === "dipulihkan") {
          const terbaru = sah[0];
          if (sumberStatus === "jejak" && terbaru !== undefined) {
            await ctx.db.patch(status._id, {
              lat: terbaru.lat,
              lng: terbaru.lng,
              akurasi: terbaru.akurasi,
              waktu: terbaru.waktu,
              // Jejak tidak menyimpan metadata perangkat; tandai sumbernya
              // supaya terbaca jelas bahwa titik ini berasal dari riwayat.
              sumber: "jejak",
              platform: undefined,
              versiApp: undefined,
              tanda: terbaru.tanda,
              identikBerturut: undefined,
            });
          } else if (pengajuanSumber?.lokasiAjukan !== undefined) {
            await ctx.db.patch(status._id, {
              lat: pengajuanSumber.lokasiAjukan.lat,
              lng: pengajuanSumber.lokasiAjukan.lng,
              akurasi: pengajuanSumber.lokasiAjukan.akurasi,
              waktu: pengajuanSumber.lokasiAjukan.waktu,
              sumber: "pengajuan",
              platform: undefined,
              versiApp: undefined,
              tanda: undefined,
              identikBerturut: undefined,
            });
          }
        } else if (status !== null && statusAksi === "dihapus") {
          await ctx.db.delete(status._id);
        }

        await audit(
          ctx,
          undefined,
          labelAktor,
          "lokasi_pratinjau_dipulihkan",
          info.label,
          `${kena.length} titik pratinjau dikecualikan; status lokasi ${statusAksi}${
            statusBaru === null
              ? ""
              : ` ke ${statusBaru.lat.toFixed(5)},${statusBaru.lng.toFixed(5)} (${formatWaktuWIB(statusBaru.waktu)})`
          }.`,
        );
      }

      totalTitik += kena.length;
      if (statusAksi === "dipulihkan") totalDipulihkan += 1;
      if (statusAksi === "dihapus") totalDihapus += 1;
      target.push({
        userId: targetId,
        label: info.label,
        titikDikecualikan: kena.length,
        status: statusAksi,
        sumberStatus,
        statusLama:
          status === null
            ? null
            : { lat: status.lat, lng: status.lng, waktu: status.waktu },
        statusBaru,
      });
    }

    return {
      kering,
      jumlahTarget: target.length,
      titikDikecualikan: totalTitik,
      statusDipulihkan: totalDipulihkan,
      statusDihapus: totalDihapus,
      target,
    };
  },
});

