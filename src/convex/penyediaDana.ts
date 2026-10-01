/**
 * Ruang penyedia dana — HANYA BACA.
 *
 * Menampilkan catatan pengajuan Peminjam (pinjaman tunai, gadai, kredit barang)
 * kepada akun yang diberi akses "lihat saja" oleh admin. Modul ini sengaja
 * tidak memuat satu pun mutation alokasi/transaksi: pembukanya hanya dapat
 * membaca, tidak pernah mengubah catatan.
 *
 * Privasi (whitelist, bukan spread dokumen mentah): baris yang dikirim ke
 * klien hanya berisi field operasional yang dibutuhkan ruang ini. Nama lengkap
 * pemohon ditampilkan untuk ruang pemantau (keputusan admin), NIK, nomor
 * rekening, nomor WhatsApp, alamat, dan penghasilan tetap TIDAK pernah keluar
 * sebagai teks. Dua hal dibuka atas keputusan admin: (1) berkas pengajuan
 * (KTP, selfie, slip, foto barang) lewat `berkasPengajuan` yang hanya dipanggil
 * saat dialog Detail dibuka, dan (2) titik lokasi terakhir peminjam lewat
 * `lokasi`/`titikPeminjam`. Setiap baris tetap membawa `kodePeminjam`
 * (pseudonim acak dari `peminjamCode.ts`) sebagai kunci stabil antar-ruang.
 *
 * Akses ditentukan peran akun: `dana` (penyedia dana), `pengamat` (sesi kode
 * akses bersama — tanpa berkas identitas), atau `admin` untuk pratinjau. Admin memberi/mencabut akses lewat `ubahAkses` di bawah, dan
 * setiap perubahan tercatat pada audit trail.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { SLOT_AKSES_BERSAMA } from "./aksesBersama";
import { requireAdminSession } from "./adminAuthz";
import { bagiImbalHasil } from "../lib/bagiHasil";
import { akunDompetDana, danaWalletBalance } from "./ledger";
import { ROLES } from "./schema";
import { audit, getConfig } from "./system";

/** Batas baris per kategori; daftar selalu diurutkan dari yang terbaru. */
export const BATAS_BARIS = 200;

/** Batas jumlah akun penyedia dana yang dikembalikan ke panel admin. */
const BATAS_AKUN = 200;

/**
 * Titik lokasi terakhir yang diketahui untuk satu peminjam.
 *
 * Sumbernya bertingkat, dari yang paling baru:
 *  - `lokasiStatus`  — titik terkini yang dikirim perangkat (heartbeat ±60 detik,
 *                      lihat `convex/lokasi.ts`); ini yang membuat peta "live".
 *  - jejak terakhir  — `lokasiJejak` paling baru bila status terkini belum ada.
 *  - titik pengajuan — `loans.lokasiAjukan`, titik saat pengajuan dikirim.
 *
 * Titik hanya diperbarui selama aplikasi/dashboard peminjam terbuka: pelacakan
 * saat aplikasi ditutup butuh aplikasi native (lihat catatan di lib/lokasi.ts),
 * jadi ruang ini selalu menampilkan "terakhir dikirim kapan", bukan klaim
 * posisi saat ini.
 */
export type LokasiTitik = {
  lat: number;
  lng: number;
  /** Akurasi GPS yang dilaporkan perangkat (meter). */
  akurasi: number;
  /** Waktu server saat titik diterima. */
  waktu: number;
  /** "web" | "aplikasi" | "jejak" | "pengajuan". */
  sumber: string;
  /** Tanda kecurigaan koordinat otomatis (kosong = normal). */
  tanda: string[];
};

/** Titik terkini dari status/jejak perangkat — null bila belum pernah ada. */
async function lokasiPerangkat(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<LokasiTitik | null> {
  const status = await ctx.db
    .query("lokasiStatus")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (status !== null) {
    return {
      lat: status.lat,
      lng: status.lng,
      akurasi: status.akurasi,
      waktu: status.waktu,
      sumber: status.sumber,
      tanda: status.tanda ?? [],
    };
  }
  const jejak = await ctx.db
    .query("lokasiJejak")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  if (jejak === null) return null;
  return {
    lat: jejak.lat,
    lng: jejak.lng,
    akurasi: jejak.akurasi,
    waktu: jejak.waktu,
    sumber: "jejak",
    tanda: jejak.tanda ?? [],
  };
}

export type BarisPinjaman = {
  _id: Id<"loans">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/WA tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  pokokPinjaman: number;
  tenorHari: number;
  tenorBulan: number | null;
  tujuan: string;
  status: string;
  /** Waktu pengajuan tercatat (convex `_creationTime`). */
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Nama penyedia dana yang mencatat alokasi — null bila belum didanai. */
  pendana: string | null;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
};

export type BarisGadai = {
  _id: Id<"pawns">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/dokumen tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  kategori: string;
  deskripsiBarang: string;
  nilaiTaksiran: number | null;
  status: string;
  diajukanPada: number;
  /** Pokok gadai yang disetujui admin (Skema B) — null bila belum ada. */
  pokokGadai: number | null;
  /** Sewa modal per 30 hari dalam persen (Skema B). */
  persenSewaModal: number | null;
  /** Sisa pokok berjalan gadai (Skema B). */
  sisaPokok: number | null;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
};

export type BarisKredit = {
  _id: Id<"kreditBarang">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/WA tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  namaBarang: string;
  kategori: string;
  merchant: string;
  hargaBarang: number;
  dpPersen: number;
  tenorBulan: number;
  marginPersenPerBulan: number;
  status: string;
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Nama penyedia dana yang mencatat alokasi — null bila belum didanai. */
  pendana: string | null;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
};

const MENUNGGU_PINJAMAN = new Set(["diajukan", "sedang_direview"]);
const MENUNGGU_GADAI = new Set(["diajukan", "sedang_dinilai"]);
const MENUNGGU_KREDIT = new Set(["diajukan", "sedang_ditinjau"]);

/**
 * Gerbang ruang penyedia dana. Tamu (anonim) dan akun tanpa peran `dana`/`admin`
 * selalu ditolak — pemeriksaan dilakukan di server, bukan hanya di UI.
 */
async function requirePengamat(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");

  /**
   * Pemantau akun bersama: sesi tamu yang diaktifkan kode akses bersama.
   * Aksesnya harus masih memakai versi kode yang berlaku — rotasi atau
   * nonaktif kode langsung memutusnya, walau sesinya masih hidup.
   */
  if (user.role === ROLES.PENGAMAT) {
    // Fail-closed: kalau akunnya berubah menjadi akun email, akses bersama
    // ditutup supaya tidak ikut mewarisi hak tulis sebuah akun biasa.
    if (user.isAnonymous !== true) {
      throw new Error(
        "Akses bersama berakhir karena akun ini kini memakai identitas email. Minta akses dari admin.",
      );
    }
    const baris = await ctx.db
      .query("aksesBersama")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_AKSES_BERSAMA))
      .first();
    if (baris?.aktif !== true || user.aksesBersamaVersi !== baris.versi) {
      throw new Error(
        "Akses bersama sudah diputus admin. Minta kode terbaru lalu masuk lagi lewat /akses-bersama.",
      );
    }
    return { userId, user };
  }

  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu tidak memiliki akses ruang penyedia dana. Masuk dengan akun terverifikasi.",
    );
  }
  if (user.role !== ROLES.DANA && user.role !== ROLES.ADMIN) {
    throw new Error(
      "Ruang penyedia dana hanya dapat dibuka oleh akun dengan akses lihat saja dari admin.",
    );
  }

  return { userId, user };
}

/**
 * Gerbang KHUSUS berkas pemohon (KTP, selfie, slip, foto barang, tanda tangan).
 *
 * Lebih ketat daripada `requirePengamat`: berkas identitas hanya dibuka untuk
 * akun penyedia dana beremail yang ditunjuk admin (peran `dana`) dan untuk
 * admin sendiri. Sesi tamu kode akses bersama TIDAK dapat membukanya, karena
 * kode itu dibagikan ke banyak orang dan tidak dapat ditelusuri ke satu akun —
 * sedangkan KTP/selfie adalah data pribadi peminjam.
 */
async function requireBerkasPemohon(ctx: QueryCtx) {
  const hasil = await requirePengamat(ctx);
  if (hasil.user.role === ROLES.PENGAMAT) {
    throw new Error(
      "Berkas pemohon hanya dibuka untuk akun penyedia dana beremail. Sesi kode akses bersama tidak dapat membukanya.",
    );
  }
  return hasil;
}

/**
 * Satu query untuk seluruh halaman: tiga daftar pengajuan + ringkasannya.
 * Baris dibatasi `BATAS_BARIS` per kategori dan diambil dari yang terbaru agar
 * payload tetap ringan; pemanggil menerima penanda `terpotong`.
 */
export const daftarPengajuan = query({
  args: {},
  handler: async (ctx) => {
    await requirePengamat(ctx);

    // Cache kode pseudonim — satu pembacaan per peminjam, bukan per baris.
    const kodeCache = new Map<Id<"users">, string | null>();
    async function kodeUntuk(userId: Id<"users">): Promise<string | null> {
      const cached = kodeCache.get(userId);
      if (cached !== undefined) return cached;
      const peminjam = await ctx.db.get(userId);
      const kode = peminjam?.kodePeminjam ?? null;
      kodeCache.set(userId, kode);
      return kode;
    }

    // Nama penyedia dana untuk kolom "Pendana". Dibaca hanya pada baris yang
    // sudah didanai supaya tidak ada pembacaan tabel alokasi per baris kosong;
    // nama akun di-cache agar satu pembacaan per penyedia, bukan per baris.
    const namaCache = new Map<Id<"users">, string | null>();
    async function namaPenyedia(userId: Id<"users">): Promise<string | null> {
      const cached = namaCache.get(userId);
      if (cached !== undefined) return cached;
      const penyedia = await ctx.db.get(userId);
      // Akun penyedia dana umumnya tidak mengisi `name` (login OTP/anonymous),
      // jadi email dipakai sebagai identitas cadangan untuk kolom "Pendana".
      const namaAkun = penyedia?.name?.trim();
      const nama = namaAkun ? namaAkun : (penyedia?.email ?? null);
      namaCache.set(userId, nama);
      return nama;
    }
    // Baris alokasi lama menyimpan id penyedia dengan nama field `pendanaId`
    // (lihat convex/migrasiPendanaId.ts). Dibaca toleran supaya satu baris
    // bentuk lama tidak pernah merobohkan seluruh halaman.
    function idPendana(baris: { danaId?: unknown; pendanaId?: unknown }): Id<"users"> | null {
      const id = baris.danaId ?? baris.pendanaId;
      return typeof id === "string" ? (id as Id<"users">) : null;
    }
    async function rangkaiPendana(ids: (Id<"users"> | null)[]): Promise<string | null> {
      const sah = ids.filter((id): id is Id<"users"> => id !== null);
      if (sah.length === 0) return null;
      const nama: string[] = [];
      for (const id of sah) {
        nama.push((await namaPenyedia(id)) ?? "Penyedia dana");
      }
      return [...new Set(nama)].join(", ");
    }
    async function pendanaPinjaman(loanId: Id<"loans">): Promise<string | null> {
      const alokasi = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      return rangkaiPendana(alokasi.map((a) => idPendana(a)));
    }
    async function pendanaKredit(kreditId: Id<"kreditBarang">): Promise<string | null> {
      const alokasi = await ctx.db
        .query("kreditFundings")
        .withIndex("by_kredit", (q) => q.eq("kreditId", kreditId))
        .collect();
      return rangkaiPendana(alokasi.map((a) => idPendana(a)));
    }

    // Titik lokasi terakhir per peminjam — satu pembacaan per orang, bukan
    // per baris pengajuan. Kegagalan pembacaan tidak pernah menghentikan
    // daftar: titik ditampilkan sebagai "belum ada" saja.
    const lokasiCache = new Map<Id<"users">, LokasiTitik | null>();
    async function lokasiUntuk(userId: Id<"users">): Promise<LokasiTitik | null> {
      if (lokasiCache.has(userId)) return lokasiCache.get(userId) ?? null;
      const titik = await lokasiPerangkat(ctx, userId);
      lokasiCache.set(userId, titik);
      return titik;
    }

    const pinjamanMentah = await ctx.db
      .query("loans")
      .order("desc")
      .take(BATAS_BARIS + 1);
    const gadaiMentah = await ctx.db
      .query("pawns")
      .order("desc")
      .take(BATAS_BARIS + 1);
    const kreditMentah = await ctx.db
      .query("kreditBarang")
      .order("desc")
      .take(BATAS_BARIS + 1);

    const pinjaman: BarisPinjaman[] = [];
    for (const loan of pinjamanMentah.slice(0, BATAS_BARIS)) {
      pinjaman.push({
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        namaLengkap: loan.namaLengkap,
        kodePeminjam: await kodeUntuk(loan.userId),
        pokokPinjaman: loan.pokokPinjaman,
        tenorHari: loan.tenorHari,
        tenorBulan: loan.tenorBulan ?? null,
        tujuan: loan.tujuan,
        status: loan.status,
        diajukanPada: loan._creationTime,
        didanaiPada: loan.didanaiPada ?? null,
        pendana:
          loan.didanaiPada === undefined ? null : await pendanaPinjaman(loan._id),
        // Pinjaman menyimpan titik GPS saat pengajuan dikirim — dipakai sebagai
        // cadangan bila perangkat belum pernah mengirim heartbeat.
        lokasi:
          (await lokasiUntuk(loan.userId)) ??
          (loan.lokasiAjukan === undefined
            ? null
            : {
                lat: loan.lokasiAjukan.lat,
                lng: loan.lokasiAjukan.lng,
                akurasi: loan.lokasiAjukan.akurasi,
                waktu: loan.lokasiAjukan.waktu,
                sumber: "pengajuan",
                tanda: [],
              }),
      });
    }

    const gadai: BarisGadai[] = [];
    for (const pawn of gadaiMentah.slice(0, BATAS_BARIS)) {
      gadai.push({
        _id: pawn._id,
        nomorReferensi: pawn.nomorReferensi,
        namaLengkap: pawn.namaLengkap,
        kodePeminjam: await kodeUntuk(pawn.userId),
        kategori: pawn.kategori,
        deskripsiBarang: pawn.deskripsiBarang,
        nilaiTaksiran: pawn.nilaiTaksiran ?? null,
        status: pawn.status,
        diajukanPada: pawn._creationTime,
        pokokGadai: pawn.pokokGadai ?? null,
        persenSewaModal: pawn.persenSewaModal ?? null,
        sisaPokok: pawn.sisaPokok ?? null,
        lokasi: await lokasiUntuk(pawn.userId),
      });
    }

    const kredit: BarisKredit[] = [];
    for (const item of kreditMentah.slice(0, BATAS_BARIS)) {
      kredit.push({
        _id: item._id,
        nomorReferensi: item.nomorReferensi,
        namaLengkap: item.namaLengkap,
        kodePeminjam: await kodeUntuk(item.userId),
        namaBarang: item.namaBarang,
        kategori: item.kategori,
        merchant: item.merchant,
        hargaBarang: item.hargaBarang,
        dpPersen: item.dpPersen,
        tenorBulan: item.tenorBulan,
        marginPersenPerBulan: item.marginPersenPerBulan,
        status: item.status,
        diajukanPada: item._creationTime,
        didanaiPada: item.didanaiPada ?? null,
        pendana:
          item.didanaiPada === undefined ? null : await pendanaKredit(item._id),
        lokasi: await lokasiUntuk(item.userId),
      });
    }

    // Ringkasan dihitung dari baris yang benar-benar dikirim (Zero Fake Data).
    const ringkasan = {
      jumlahPinjaman: pinjaman.length,
      jumlahGadai: gadai.length,
      jumlahKredit: kredit.length,
      menungguReview:
        pinjaman.filter((b) => MENUNGGU_PINJAMAN.has(b.status)).length +
        gadai.filter((b) => MENUNGGU_GADAI.has(b.status)).length +
        kredit.filter((b) => MENUNGGU_KREDIT.has(b.status)).length,
      nilaiPinjaman: pinjaman.reduce((total, b) => total + b.pokokPinjaman, 0),
      nilaiGadai: gadai.reduce((total, b) => total + (b.nilaiTaksiran ?? 0), 0),
      nilaiKredit: kredit.reduce((total, b) => total + b.hargaBarang, 0),
    };

    return {
      batas: BATAS_BARIS,
      terpotong: {
        pinjaman: pinjamanMentah.length > BATAS_BARIS,
        gadai: gadaiMentah.length > BATAS_BARIS,
        kredit: kreditMentah.length > BATAS_BARIS,
      },
      ringkasan,
      pinjaman,
      gadai,
      kredit,
    };
  },
});

/**
 * Satu baris peta: peminjam + titik terakhir yang diketahui.
 * Hanya berisi identitas tampil (nama, kode pseudonim, nomor referensi) dan
 * koordinat — tanpa NIK, rekening, WhatsApp, atau alamat.
 */
export type TitikPeminjam = {
  userId: Id<"users">;
  namaLengkap: string;
  kodePeminjam: string | null;
  nomorReferensi: string;
  kategori: "pinjaman" | "gadai" | "kredit";
  status: string;
  posisi: LokasiTitik;
};

/** Batas baris per kategori untuk peta live (satu peminjam dihitung sekali). */
const BATAS_PETA = 150;

/**
 * Titik lokasi peminjam untuk peta live ruang penyedia dana.
 *
 * Satu baris per peminjam (pengajuan terbaru dipakai sebagai keterangan),
 * berisi hanya peminjam yang sudah pernah mengirim titik GPS. Query ini reaktif:
 * setiap heartbeat perangkat peminjam (±60 detik) langsung memperbarui peta.
 */
export const titikPeminjam = query({
  args: {},
  handler: async (ctx) => {
    await requirePengamat(ctx);
    const cfg = await getConfig(ctx);

    const [loans, pawns, kredit] = await Promise.all([
      ctx.db.query("loans").order("desc").take(BATAS_PETA + 1),
      ctx.db.query("pawns").order("desc").take(BATAS_PETA + 1),
      ctx.db.query("kreditBarang").order("desc").take(BATAS_PETA + 1),
    ]);

    const rows: TitikPeminjam[] = [];
    const sudah = new Set<string>();
    let tanpaTitik = 0;

    async function tambah(
      userId: Id<"users">,
      namaLengkap: string,
      nomorReferensi: string,
      kategori: TitikPeminjam["kategori"],
      status: string,
    ): Promise<void> {
      if (sudah.has(userId) || rows.length >= BATAS_PETA) return;
      sudah.add(userId);
      const posisi = await lokasiPerangkat(ctx, userId);
      if (posisi === null) {
        tanpaTitik += 1;
        return;
      }
      const peminjam = await ctx.db.get(userId);
      rows.push({
        userId,
        namaLengkap,
        kodePeminjam: peminjam?.kodePeminjam ?? null,
        nomorReferensi,
        kategori,
        status,
        posisi,
      });
    }

    for (const l of loans.slice(0, BATAS_PETA)) {
      await tambah(l.userId, l.namaLengkap, l.nomorReferensi, "pinjaman", l.status);
    }
    for (const p of pawns.slice(0, BATAS_PETA)) {
      await tambah(p.userId, p.namaLengkap, p.nomorReferensi, "gadai", p.status);
    }
    for (const k of kredit.slice(0, BATAS_PETA)) {
      await tambah(k.userId, k.namaLengkap, k.nomorReferensi, "kredit", k.status);
    }

    // Titik acuan konfigurasi (kantor) — penanda orientasi peta, sama seperti
    // peta admin: bukan posisi gudang terverifikasi.
    return {
      vault: { lat: cfg.vaultLat, lng: cfg.vaultLng },
      batas: BATAS_PETA,
      terpotong:
        loans.length > BATAS_PETA || pawns.length > BATAS_PETA || kredit.length > BATAS_PETA,
      jumlahTitik: rows.length,
      tanpaTitik,
      rows,
    };
  },
});

/**
 * Berkas pengajuan (KTP, selfie KTP, slip penghasilan, foto barang, tanda
 * tangan) untuk dialog Detail.
 *
 * Sengaja dipisah dari `daftarPengajuan` supaya payload daftar tetap ringan dan
 * berkas hanya diambil saat benar-benar dibuka. `ctx.storage.getUrl` memakai
 * URL penyimpanan Convex yang tidak dapat ditebak; hanya akun penyedia dana
 * beremail (atau admin) yang bisa memintanya — sesi kode akses bersama ditolak,
 * lihat `requireBerkasPemohon`.
 */
export type BerkasPengajuan = {
  jenis: "pinjaman" | "gadai" | "kredit";
  berkas: { label: string; url: string }[];
  /** Tanda tangan elektronik peminjam (data URL PNG) bila ada. */
  tandaTangan: string | null;
  tandaTanganPada: number | null;
  catatan: string | null;
};

export const berkasPengajuan = query({
  args: {
    jenis: v.union(v.literal("pinjaman"), v.literal("gadai"), v.literal("kredit")),
    id: v.string(),
  },
  handler: async (ctx, { jenis, id }): Promise<BerkasPengajuan | null> => {
    await requireBerkasPemohon(ctx);

    if (jenis === "kredit") {
      // Pengajuan kredit barang tidak menyimpan berkas gambar di sistem.
      const kreditId = ctx.db.normalizeId("kreditBarang", id);
      if (kreditId === null || (await ctx.db.get(kreditId)) === null) return null;
      return {
        jenis,
        berkas: [],
        tandaTangan: null,
        tandaTanganPada: null,
        catatan:
          "Pengajuan kredit barang tidak menyimpan berkas gambar di PINDAI — hanya data pemohon dan rincian barang.",
      };
    }

    if (jenis === "gadai") {
      const pawnId = ctx.db.normalizeId("pawns", id);
      if (pawnId === null) return null;
      const pawn = await ctx.db.get(pawnId);
      if (pawn === null) return null;
      const foto = pawn.fotoBarangId ? await ctx.storage.getUrl(pawn.fotoBarangId) : null;
      const berkas = foto === null ? [] : [{ label: "Foto barang", url: foto }];
      return {
        jenis,
        berkas,
        tandaTangan: pawn.tandaTanganPeminjam ?? null,
        tandaTanganPada: pawn.tandaTanganPada ?? null,
        catatan:
          berkas.length === 0
            ? "Belum ada foto barang yang tersimpan untuk pengajuan gadai ini."
            : null,
      };
    }

    const loanId = ctx.db.normalizeId("loans", id);
    if (loanId === null) return null;
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const [ktp, selfie, slip] = await Promise.all([
      loan.dokKtpId ? ctx.storage.getUrl(loan.dokKtpId) : null,
      loan.dokSelfieKtpId ? ctx.storage.getUrl(loan.dokSelfieKtpId) : null,
      loan.dokSlipGajiId ? ctx.storage.getUrl(loan.dokSlipGajiId) : null,
    ]);
    const berkas = [
      { label: "KTP", url: ktp },
      { label: "Selfie dengan KTP", url: selfie },
      { label: "Slip penghasilan", url: slip },
    ].filter((b): b is { label: string; url: string } => b.url !== null);
    return {
      jenis,
      berkas,
      tandaTangan: loan.tandaTanganPeminjam ?? null,
      tandaTanganPada: loan.tandaTanganPada ?? null,
      catatan:
        berkas.length === 0
          ? "Belum ada berkas yang tersimpan untuk pengajuan pinjaman ini."
          : null,
    };
  },
});

/**
 * Satu baris kelola investor: identitas akun, status akses, dan posisi
 * dananya. Semua angka diturunkan dari catatan asli (fundings, kreditFundings,
 * deposits, withdrawals, ledger) — tidak ada nilai cache.
 */
/**
 * Peran penyedia dana WARISAN.
 *
 * Sejumlah dokumen lama menyimpan `role: "pendana"`, sedangkan peran yang
 * berlaku sekarang adalah `dana` (lihat ROLES). Baris seperti itu tidak dikenali
 * gerbang ruang mana pun, jadi akunnya tidak punya akses — tetapi alokasi,
 * setoran, dan saldo ledger mereka tetap nyata. Karena itu akun warisan ikut
 * DITAMPILKAN di panel kelola (dan ditandai "peran lama") supaya admin dapat
 * melihat posisinya lalu memberi akses secara sadar lewat tombol Beri akses.
 * Akses tidak pernah diberikan otomatis.
 */
const PERAN_PENDANA_LEGACY = "pendana";

function peranPenyedia(role: string | undefined): boolean {
  return role === ROLES.DANA || role === PERAN_PENDANA_LEGACY;
}

export type BarisInvestor = {
  userId: Id<"users">;
  nama: string;
  email: string | null;
  emailTerverifikasi: boolean;
  /** Peran tersimpan apa adanya: `dana`, `pendana` (warisan), atau `pengamat`. */
  peran: string | null;
  /** Peran warisan `pendana` — menyimpan dana tetapi belum berakses ruang. */
  peranLegacy: boolean;
  /** Akun bersama dari kode akses — dikelola lewat terbit/nonaktif kode. */
  akunBersama: boolean;
  /**
   * Punya akses nyata ke ruang penyedia dana saat ini: peran `dana`, atau sesi
   * bersama yang masih memakai versi kode berlaku. Akun berperan warisan
   * bernilai false sampai admin memberinya akses.
   */
  aksesAktif: boolean;
  terdaftarPada: number;
  /** Jumlah alokasi tercatat (pinjaman + kredit barang), semua status. */
  jumlahAlokasi: number;
  /** Seluruh pokok yang pernah disalurkan akun ini — rupiah bulat. */
  totalDisalurkan: number;
  /** Pokok yang belum kembali (status dialokasikan = "Saldo Berjalan"). */
  saldoBerjalan: number;
  /** Jumlah peminjam berbeda yang pernah didanai akun ini. */
  jumlahPeminjam: number;
  jumlahAktif: number;
  jumlahLunas: number;
  /** Keuntungan yang SUDAH dibayarkan (alokasi berstatus selesai), bruto. */
  imbalBrutoTerealisasi: number;
  /** Potongan admin yang benar-benar diambil dari keuntungan itu. */
  potonganAdminTerealisasi: number;
  /** Yang benar-benar masuk dompet penyedia dana (bruto − potongan). */
  imbalBersihTerealisasi: number;
  /** Keuntungan yang masih berjalan (alokasi aktif), bruto. */
  imbalBrutoDiharapkan: number;
  /** Potongan admin yang akan diambil bila alokasi aktif lunas. */
  potonganAdminDiharapkan: number;
  /** Perkiraan keuntungan bersih penyedia dana dari alokasi aktif. */
  imbalBersihDiharapkan: number;
  /** Setoran yang sudah diverifikasi admin — rupiah bulat. */
  totalSetoran: number;
  setoranMenunggu: number;
  /** Penarikan yang sudah diproses admin — rupiah bulat. */
  totalPenarikan: number;
  penarikanMenunggu: number;
  /** Saldo dompet dari ledger internal (debit − kredit akun dompet dana). */
  saldoDompet: number;
  /** Waktu catatan terakhir milik akun ini — null bila belum ada aktivitas. */
  aktivitasTerakhir: number | null;
};

/** Batas baris riwayat pada dialog rincian investor. */
const BATAS_RIWAYAT = 50;

/**
 * Kelola investor — panel admin.
 *
 * Menggabungkan daftar akun berakses ruang penyedia dana (email dengan peran
 * `dana`, plus pemantau kode akses bersama) dengan posisi dana masing-masing:
 * pokok yang bekerja, hak Imbal Hasil, setoran, penarikan, saldo dompet, dan
 * waktu aktivitas terakhir. Hanya admin (sesi TOTP) yang dapat membukanya, dan
 * modul ini tidak memuat satu pun mutation alokasi/transaksi.
 */
export const daftarInvestor = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    // Kebijakan potongan admin dibaca dari Pengaturan Sistem, bukan ditulis di kode.
    const cfg = await getConfig(ctx);

    const pengguna = await ctx.db.query("users").take(BATAS_AKUN + 1);
    const barisKode = await ctx.db
      .query("aksesBersama")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_AKSES_BERSAMA))
      .first();
    const versiAktif = barisKode?.versi ?? 0;
    const akun = pengguna
      .filter(
        (u) =>
          peranPenyedia(u.role as string | undefined) || u.role === ROLES.PENGAMAT,
      )
      .slice(0, BATAS_AKUN);

    // Saldo dompet seluruh investor dihitung dari SATU pembacaan ledger, bukan
    // satu pemindaian per orang.
    const akunDompet = new Set(akun.map((u) => akunDompetDana(u._id)));
    const saldoPerAkun = new Map<string, number>();
    if (akunDompet.size > 0) {
      const entries = await ctx.db.query("ledger_entries").collect();
      for (const e of entries) {
        if (!akunDompet.has(e.akun)) continue;
        saldoPerAkun.set(
          e.akun,
          (saldoPerAkun.get(e.akun) ?? 0) + (e.arah === "debit" ? e.jumlah : -e.jumlah),
        );
      }
    }

    const rows: BarisInvestor[] = [];
    for (const u of akun) {
      const fundings = await ctx.db
        .query("fundings")
        .withIndex("by_dana", (q) => q.eq("danaId", u._id))
        .collect();
      const kreditFundings = await ctx.db
        .query("kreditFundings")
        .withIndex("by_dana", (q) => q.eq("danaId", u._id))
        .collect();
      const setoran = await ctx.db
        .query("deposits")
        .withIndex("by_dana", (q) => q.eq("danaId", u._id))
        .collect();
      const penarikan = await ctx.db
        .query("withdrawals")
        .withIndex("by_dana", (q) => q.eq("danaId", u._id))
        .collect();

      const alokasi = [...fundings, ...kreditFundings];
      const bekerja = alokasi.filter((a) => a.status === "dialokasikan");
      const selesai = alokasi.filter((a) => a.status === "selesai");
      const waktu = [
        ...alokasi.map((a) => a._creationTime),
        ...setoran.map((s) => s._creationTime),
        ...penarikan.map((w) => w._creationTime),
      ];

      // Peminjam berbeda yang didanai: nomor referensi cukup dibaca pada baris
      // alokasi (bukan seluruh tabel) dan di-cache agar tidak dibaca berulang.
      const peminjam = new Set<string>();
      for (const a of alokasi) {
        const pengajuan =
          "loanId" in a
            ? await ctx.db.get(a.loanId)
            : await ctx.db.get(a.kreditId);
        if (pengajuan !== null) peminjam.add(pengajuan.userId);
      }

      // Keuntungan NYATA dibaca dari cap settlement pada baris alokasi
      // (`potonganAdmin`/`imbalHasilNet`). Alokasi lama yang lunas sebelum
      // kebijakan potongan ada tidak punya cap: dihitung utuh (potongan 0),
      // bukan dikarang mundur dengan persentase hari ini.
      const brutoTerealisasi = selesai.reduce((total, a) => total + a.imbalHasil, 0);
      const potonganTerealisasi = selesai.reduce(
        (total, a) => total + ((a as { potonganAdmin?: number }).potonganAdmin ?? 0),
        0,
      );
      const bersihTerealisasi = selesai.reduce(
        (total, a) =>
          total + ((a as { imbalHasilNet?: number }).imbalHasilNet ?? a.imbalHasil),
        0,
      );

      // Keuntungan berjalan: potongan dihitung dengan kebijakan yang berlaku
      // sekarang dan ditandai sebagai perkiraan di UI.
      let brutoDiharapkan = 0;
      let potonganDiharapkan = 0;
      for (const a of bekerja) {
        brutoDiharapkan += a.imbalHasil;
        potonganDiharapkan += bagiImbalHasil(a.imbalHasil, cfg.persenAdmin).potonganAdmin;
      }

      const peran = (u.role as string | undefined) ?? null;
      const akunBersama = u.role === ROLES.PENGAMAT;
      rows.push({
        userId: u._id,
        nama: u.name ?? (akunBersama ? "Pemantau bersama" : "Penyedia dana"),
        email: u.email ?? null,
        emailTerverifikasi: u.emailVerificationTime !== undefined,
        peran,
        peranLegacy: peran === PERAN_PENDANA_LEGACY,
        akunBersama,
        aksesAktif:
          u.role === ROLES.DANA
            ? true
            : akunBersama && barisKode?.aktif === true && u.aksesBersamaVersi === versiAktif,
        terdaftarPada: u._creationTime,
        jumlahAlokasi: alokasi.length,
        totalDisalurkan: alokasi.reduce((total, a) => total + a.jumlahAlokasi, 0),
        saldoBerjalan: bekerja.reduce((total, a) => total + a.jumlahAlokasi, 0),
        jumlahPeminjam: peminjam.size,
        jumlahAktif: bekerja.length,
        jumlahLunas: selesai.length,
        imbalBrutoTerealisasi: brutoTerealisasi,
        potonganAdminTerealisasi: potonganTerealisasi,
        imbalBersihTerealisasi: bersihTerealisasi,
        imbalBrutoDiharapkan: brutoDiharapkan,
        potonganAdminDiharapkan: potonganDiharapkan,
        imbalBersihDiharapkan: brutoDiharapkan - potonganDiharapkan,
        totalSetoran: setoran
          .filter((s) => s.status === "terverifikasi")
          .reduce((total, s) => total + s.jumlah, 0),
        setoranMenunggu: setoran.filter((s) => s.status === "menunggu_verifikasi").length,
        totalPenarikan: penarikan
          .filter((w) => w.status === "diproses")
          .reduce((total, w) => total + w.jumlah, 0),
        penarikanMenunggu: penarikan.filter((w) => w.status === "menunggu_proses").length,
        saldoDompet: saldoPerAkun.get(akunDompetDana(u._id)) ?? 0,
        aktivitasTerakhir: waktu.length === 0 ? null : Math.max(...waktu),
      });
    }

    // Akun berperan warisan tanpa jejak dana apa pun (dan tanpa email sehingga
    // tidak bisa diberi akses) hanya akan memenuhi tabel tanpa guna. Akun seperti
    // itu disembunyikan dan jumlahnya dilaporkan terpisah.
    const terlihat = rows.filter(
      (r) =>
        !r.peranLegacy ||
        r.email !== null ||
        r.jumlahAlokasi > 0 ||
        r.totalSetoran > 0 ||
        r.totalPenarikan > 0 ||
        r.setoranMenunggu > 0 ||
        r.penarikanMenunggu > 0 ||
        r.saldoDompet !== 0,
    );
    const warisanTanpaJejak = rows.length - terlihat.length;
    rows.length = 0;
    rows.push(...terlihat);

    // Akun berakses lebih dulu, lalu yang dananya paling banyak bekerja;
    // akun berperan warisan diletakkan paling bawah.
    rows.sort(
      (a, b) =>
        Number(a.peranLegacy) - Number(b.peranLegacy) ||
        Number(a.akunBersama) - Number(b.akunBersama) ||
        b.saldoBerjalan - a.saldoBerjalan ||
        b.totalDisalurkan - a.totalDisalurkan,
    );

    return {
      batas: BATAS_AKUN,
      terpotong: pengguna.length > BATAS_AKUN,
      ringkasan: {
        jumlahAkun: rows.length,
        /** Akun yang benar-benar bisa membuka ruang penyedia dana saat ini. */
        jumlahAkses: rows.filter((r) => r.aksesAktif).length,
        jumlahPeranLegacy: rows.filter((r) => r.peranLegacy).length,
        /** Akun peran lama tanpa jejak dana & tanpa email — tidak ditampilkan. */
        jumlahWarisanTanpaJejak: warisanTanpaJejak,
        jumlahPemantau: rows.filter((r) => r.akunBersama).length,
        pemantauAktif: rows.filter((r) => r.akunBersama && r.aksesAktif).length,
        /** Kebijakan potongan admin yang berlaku (dari Pengaturan Sistem). */
        persenPotonganAdmin: cfg.persenAdmin,
        totalDisalurkan: rows.reduce((total, r) => total + r.totalDisalurkan, 0),
        saldoBerjalan: rows.reduce((total, r) => total + r.saldoBerjalan, 0),
        imbalBrutoTerealisasi: rows.reduce((total, r) => total + r.imbalBrutoTerealisasi, 0),
        potonganAdminTerealisasi: rows.reduce(
          (total, r) => total + r.potonganAdminTerealisasi,
          0,
        ),
        imbalBersihTerealisasi: rows.reduce((total, r) => total + r.imbalBersihTerealisasi, 0),
        imbalBrutoDiharapkan: rows.reduce((total, r) => total + r.imbalBrutoDiharapkan, 0),
        potonganAdminDiharapkan: rows.reduce(
          (total, r) => total + r.potonganAdminDiharapkan,
          0,
        ),
        imbalBersihDiharapkan: rows.reduce((total, r) => total + r.imbalBersihDiharapkan, 0),
        saldoDompet: rows.reduce((total, r) => total + r.saldoDompet, 0),
        totalSetoran: rows.reduce((total, r) => total + r.totalSetoran, 0),
        setoranMenunggu: rows.reduce((total, r) => total + r.setoranMenunggu, 0),
        penarikanMenunggu: rows.reduce((total, r) => total + r.penarikanMenunggu, 0),
      },
      rows,
    };
  },
});

/**
 * Rincian satu penyedia dana untuk dialog panel admin: identitas, portofolio
 * alokasi (pinjaman & kredit barang beserta nomor referensinya), pembagian
 * keuntungan per alokasi (bruto, potongan admin, bersih), setoran, penarikan,
 * dan saldo dompet dari ledger. Hanya admin; tanpa mutation apa pun.
 *
 * Angka "diharapkan" memakai kebijakan potongan yang berlaku SEKARANG dan
 * ditandai `perkiraan: true`; angka alokasi yang sudah lunas dibaca dari cap
 * settlement, jadi tidak pernah dihitung ulang mundur.
 */
export const rincianInvestor = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdminSession(ctx);
    const cfg = await getConfig(ctx);
    const user = await ctx.db.get(userId);
    if (user === null) return null;

    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const kreditFundings = await ctx.db
      .query("kreditFundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const setoran = await ctx.db
      .query("deposits")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const penarikan = await ctx.db
      .query("withdrawals")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();

    /**
     * Angka keuntungan per alokasi.
     *
     * Alokasi yang sudah lunas memakai cap settlement (`potonganAdmin`,
     * `imbalHasilNet`) — angka yang benar-benar dibayarkan. Alokasi lama yang
     * lunas sebelum kebijakan potongan ada tidak punya cap: dibayar penuh
     * (potongan 0). Alokasi yang masih berjalan memakai perkiraan dengan
     * kebijakan yang berlaku sekarang, ditandai `perkiraan: true`.
     */
    function bagi(a: {
      imbalHasil: number;
      status: string;
      potonganAdmin?: number;
      imbalHasilNet?: number;
    }) {
      if (a.status === "selesai") {
        const potonganAdmin = a.potonganAdmin ?? 0;
        return {
          potonganAdmin,
          imbalBersih: a.imbalHasilNet ?? a.imbalHasil - potonganAdmin,
          perkiraan: false,
        };
      }
      if (a.status === "dialokasikan") {
        const { potonganAdmin, imbalBersih } = bagiImbalHasil(a.imbalHasil, cfg.persenAdmin);
        return { potonganAdmin, imbalBersih, perkiraan: true };
      }
      return { potonganAdmin: 0, imbalBersih: 0, perkiraan: false };
    }

    const alokasiPinjaman = [];
    for (const f of fundings) {
      const loan = await ctx.db.get(f.loanId);
      alokasiPinjaman.push({
        referensi: loan?.nomorReferensi ?? "tanpa referensi",
        statusPengajuan: loan?.status ?? null,
        pokokPorsi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        ...bagi(f),
        status: f.status as string,
        waktu: f._creationTime,
        diselesaikanPada: f.diselesaikanPada ?? null,
      });
    }
    const alokasiKredit = [];
    for (const f of kreditFundings) {
      const kredit = await ctx.db.get(f.kreditId);
      alokasiKredit.push({
        referensi: kredit?.nomorReferensi ?? "tanpa referensi",
        statusPengajuan: kredit?.status ?? null,
        pokokPorsi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        ...bagi(f as { imbalHasil: number; status: string }),
        status: f.status as string,
        waktu: f._creationTime,
        diselesaikanPada: null,
      });
    }
    const urutTerbaru = <T extends { waktu: number }>(baris: T[]) =>
      baris.sort((a, b) => b.waktu - a.waktu).slice(0, BATAS_RIWAYAT);

    const semuaAlokasi = [...alokasiPinjaman, ...alokasiKredit];
    const ringkasKeuntungan = {
      persenPotonganAdmin: cfg.persenAdmin,
      pokok: semuaAlokasi.reduce((total, a) => total + a.pokokPorsi, 0),
      saldoBerjalan: alokasiPinjaman
        .filter((a) => a.status === "dialokasikan")
        .reduce((total, a) => total + a.pokokPorsi, 0) +
        alokasiKredit
          .filter((a) => a.status === "dialokasikan")
          .reduce((total, a) => total + a.pokokPorsi, 0),
      brutoTerealisasi: semuaAlokasi
        .filter((a) => a.status === "selesai")
        .reduce((total, a) => total + a.imbalHasil, 0),
      potonganTerealisasi: semuaAlokasi
        .filter((a) => a.status === "selesai")
        .reduce((total, a) => total + a.potonganAdmin, 0),
      bersihTerealisasi: semuaAlokasi
        .filter((a) => a.status === "selesai")
        .reduce((total, a) => total + a.imbalBersih, 0),
      brutoDiharapkan: semuaAlokasi
        .filter((a) => a.status === "dialokasikan")
        .reduce((total, a) => total + a.imbalHasil, 0),
      potonganDiharapkan: semuaAlokasi
        .filter((a) => a.status === "dialokasikan")
        .reduce((total, a) => total + a.potonganAdmin, 0),
      bersihDiharapkan: semuaAlokasi
        .filter((a) => a.status === "dialokasikan")
        .reduce((total, a) => total + a.imbalBersih, 0),
    };

    return {
      userId,
      ringkasKeuntungan,
      nama: user.name ?? (user.role === ROLES.PENGAMAT ? "Pemantau bersama" : "Penyedia dana"),
      email: user.email ?? null,
      peran: (user.role as string | undefined) ?? null,
      peranLegacy: (user.role as string | undefined) === PERAN_PENDANA_LEGACY,
      akunBersama: user.role === ROLES.PENGAMAT,
      emailTerverifikasi: user.emailVerificationTime !== undefined,
      terdaftarPada: user._creationTime,
      saldoDompet: await danaWalletBalance(ctx, userId),
      alokasiPinjaman: urutTerbaru(alokasiPinjaman),
      alokasiKredit: urutTerbaru(alokasiKredit),
      setoran: urutTerbaru(
        setoran.map((s) => ({
          referensi: s.nomorReferensi,
          jumlah: s.jumlah,
          status: s.status as string,
          waktu: s._creationTime,
        })),
      ),
      penarikan: urutTerbaru(
        penarikan.map((w) => ({
          referensi: w.nomorReferensi,
          jumlah: w.jumlah,
          status: w.status as string,
          waktu: w._creationTime,
        })),
      ),
      batasRiwayat: BATAS_RIWAYAT,
    };
  },
});

/**
 * Beri/cabut akses ruang penyedia dana untuk satu akun (berdasarkan email).
 * Akses bersifat lihat saja: hanya mengubah peran akun, tanpa menyentuh
 * catatan pengajuan. Perubahan dicatat pada audit trail.
 */
export const ubahAkses = mutation({
  args: {
    email: v.string(),
    aktif: v.boolean(),
    /** Alasan keputusan (disarankan) — masuk audit trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { email, aktif, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const dicari = email.trim().toLowerCase();
    if (dicari === "" || !dicari.includes("@")) {
      throw new Error("Masukkan alamat email akun yang valid.");
    }

    // Utamakan indeks email; jatuh ke pencarian terbatas untuk alamat yang
    // tersimpan dengan huruf besar/kecil berbeda.
    let target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", dicari))
      .first();
    if (target === null) {
      const semua = await ctx.db.query("users").take(500);
      target = semua.find((u) => (u.email ?? "").toLowerCase() === dicari) ?? null;
    }
    if (target === null) {
      throw new Error(`Tidak ada akun dengan email ${dicari}.`);
    }
    if (target.role === ROLES.ADMIN) {
      throw new Error("Akun tim (admin) sudah memiliki akses panel penuh.");
    }
    if (target.isAnonymous === true) {
      throw new Error(
        "Akun tamu tidak dapat diberi akses. Minta pengguna masuk dengan email terverifikasi.",
      );
    }

    if (aktif) {
      if (target.role === ROLES.DANA) return { ok: true, sudahSesuai: true };
      await ctx.db.patch(target._id, { role: ROLES.DANA });
    } else {
      if (target.role !== ROLES.DANA) return { ok: true, sudahSesuai: true };
      await ctx.db.patch(target._id, { role: undefined });
    }

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_akses_penyedia_dana",
      target.email ?? target.name ?? target._id,
      `${aktif ? "Memberi" : "Mencabut"} akses lihat saja ruang penyedia dana${
        alasan?.trim() ? ` — ${alasan.trim()}` : ""
      }`,
    );

    return { ok: true, sudahSesuai: false };
  },
});
