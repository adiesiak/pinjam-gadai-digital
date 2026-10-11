/**
 * Modul penagihan & pengelolaan keterlambatan PINDAI — sisi SERVER.
 *
 * Semua query/mutation di sini dijaga `requireAdminSession` (peran admin +
 * TOTP terverifikasi pada sesi berjalan). Selain itu, kewenangan dibatasi PER
 * KASUS: petugas hanya dapat menindak kasus yang ditugaskan kepadanya. Kasus
 * yang belum ditugaskan boleh ditangani petugas mana pun (dianggap mengambil
 * tugas), sedangkan kasus milik petugas lain ditolak dengan kalimat yang
 * menjelaskan sebabnya.
 *
 * Yang SENGAJA tidak ada di modul ini:
 *  - perpindahan uang, jurnal, atau perubahan saldo/status ledger. Catatan
 *    pembayaran/penyelesaian di sini adalah CATATAN PETUGAS, bukan bukti
 *    transfer; pelunasan tetap lewat jalur pinjaman/pembayaran yang ada.
 *  - pengiriman pesan otomatis ke nasabah. Pesan disusun/ditinjau petugas dan
 *    WAJIB lolos penjaga pesan di `lib/penagihan.ts` sebelum dicatat, supaya
 *    tidak ada ancaman, intimidasi, penyebaran data, kontak ke pihak lain, atau
 *    janji menyesatkan yang lolos ke riwayat komunikasi.
 *  - tampilan kontak/finansial utuh di daftar kerja. Daftar hanya memuat nomor
 *    tersamar; nomor utuh dibuka lewat mutation yang MENCATAT AUDIT.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { ROLES } from "./schema";
import { audit } from "./system";
import { pelunasanPinjaman } from "../lib/loan";
import {
  AMBANG_TUNGGAKAN_DEFAULT,
  HASIL_TINDAKAN,
  JAM_KONTAK_DEFAULT,
  JENIS_PENYELESAIAN,
  JENIS_TINDAKAN,
  BOBOT_PRIORITAS_PENGADUAN,
  KANAL_PENGADUAN_MANDIRI,
  KATEGORI_PENGADUAN,
  LABEL_HASIL_TINDAKAN,
  LABEL_JENIS_PENYELESAIAN,
  LABEL_KATEGORI_PENGADUAN,
  LABEL_JENIS_TINDAKAN,
  LABEL_STATUS_JANJI,
  LABEL_STATUS_KASUS,
  LABEL_STATUS_PEMBAYARAN,
  LABEL_PRIORITAS_PENGADUAN,
  LABEL_STATUS_PENGADUAN,
  PANJANG_MAKS_PESAN_PENGADUAN,
  PIHAK_DIHUBUNGI,
  SALURAN_KONTAK_LANGSUNG,
  SALURAN_TINDAKAN,
  STATUS_JANJI,
  STATUS_KASUS,
  STATUS_PEMBAYARAN,
  PRIORITAS_PENGADUAN,
  STATUS_PENGADUAN,
  TAHAP_TUNGGAKAN,
  URUTAN_ESKALASI,
  bolehBalasPengaduan,
  bolehHubungiPihak,
  bolehKontakSekarang,
  eskalasiBerikutnya,
  eskalasiDisarankan,
  klasifikasiTunggakan,
  maskNomorTelepon,
  maskRekening,
  periksaPesanPenagihan,
  prioritasBawaan,
  prioritasEfektif,
  pesanPengingatNetral,
  ringkasLaporanPenagihan,
  tingkatEskalasi,
  validasiAmbang,
  validasiJanjiBayar,
  validasiJamKontak,
  validasiPembayaran,
  validasiPengaduan,
  validasiPesanPengaduan,
  validasiPrioritasPengaduan,
  validasiPenyelesaian,
  validasiTransisiKasus,
  validasiTransisiPengaduan,
  type AmbangTunggakan,
  type JamKontak,
  type JenisPenyelesaian,
  type PrioritasPengaduan,
  type StatusPembayaran,
} from "../lib/penagihan";
import type { Doc, Id as IdT } from "./_generated/dataModel";

/** Slot tunggal aturan penagihan. */
const SLOT_ATURAN = "global";

/** Batas baris pinjaman yang diperiksa per pembacaan daftar kasus. */
const BATAS_KASUS = 300;

/** Panjang minimum alasan pada keputusan yang mengubah keadaan nasabah. */
const MIN_ALASAN = 10;

/** Batas pengaduan milik sendiri yang dikirim ke layar nasabah. */
const BATAS_PENGADUAN_SAYA = 20;

/** Batas pesan utas terakhir yang diperiksa per pengaduan nasabah. */
const BATAS_PESAN_SAYA = 50;

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  return requireAdminSession(ctx);
}

function labelAktor(user: { email?: string; name?: string }): string {
  return user.email ?? user.name ?? "admin";
}

type AturanPenagihan = {
  aktif: boolean;
  ambang: AmbangTunggakan;
  jamKontak: JamKontak;
};

/** Baca aturan penagihan (fallback default lib bila belum pernah disimpan). */
async function bacaAturan(ctx: QueryCtx | MutationCtx): Promise<AturanPenagihan> {
  const row = await ctx.db
    .query("penagihanAturan")
    .withIndex("by_slot", (q) => q.eq("slot", SLOT_ATURAN))
    .first();
  if (row === null) {
    return { aktif: true, ambang: { ...AMBANG_TUNGGAKAN_DEFAULT }, jamKontak: { ...JAM_KONTAK_DEFAULT } };
  }
  const ambang: AmbangTunggakan = {
    ringan: row.ambangRingan ?? AMBANG_TUNGGAKAN_DEFAULT.ringan,
    sedang: row.ambangSedang ?? AMBANG_TUNGGAKAN_DEFAULT.sedang,
    berat: row.ambangBerat ?? AMBANG_TUNGGAKAN_DEFAULT.berat,
  };
  // Ambang yang tidak sah (mis. berubah urutan karena sunting manual) tidak
  // boleh membuat server menolak tindakan: pakai default yang sudah terbukti.
  const jamKontak: JamKontak = {
    mulai: row.jamMulai ?? JAM_KONTAK_DEFAULT.mulai,
    selesai: row.jamSelesai ?? JAM_KONTAK_DEFAULT.selesai,
  };
  return {
    aktif: row.aktif ?? true,
    ambang: validasiAmbang(ambang).ok ? ambang : { ...AMBANG_TUNGGAKAN_DEFAULT },
    jamKontak: validasiJamKontak(jamKontak).ok ? jamKontak : { ...JAM_KONTAK_DEFAULT },
  };
}

function kasusUntuk(
  ctx: QueryCtx | MutationCtx,
  loanId: IdT<"loans">,
) {
  return ctx.db
    .query("penagihanKasus")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .first();
}

/**
 * Ambil pinjaman + kasusnya, sekaligus menegakkan kewenangan petugas.
 * Kasus milik petugas lain DITOLAK — inilah pembatasan akses per kewenangan.
 */
async function mintaKasus(
  ctx: QueryCtx | MutationCtx,
  admin: { userId: IdT<"users"> },
  loanId: IdT<"loans">,
): Promise<{ loan: Doc<"loans">; kasus: Doc<"penagihanKasus"> | null }> {
  const loan = await ctx.db.get(loanId);
  if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
  const kasus = await kasusUntuk(ctx, loanId);
  if (
    kasus !== null &&
    kasus.petugasUserId !== undefined &&
    kasus.petugasUserId !== admin.userId
  ) {
    throw new Error(
      `Kasus ${loan.nomorReferensi} ditugaskan kepada ${kasus.petugasLabel ?? "petugas lain"}. Hanya petugas yang ditugaskan (atau penyelia yang memindahkan penugasan) dapat menindaknya.`,
    );
  }
  return { loan, kasus };
}

/**
 * Ambil atau buat kasus penagihan untuk satu pinjaman.
 *
 * Kasus lahir dari tindakan petugas, jadi statusnya langsung "ditangani" —
 * bukan "baru": tidak ada pekerjaan yang menggantung tanpa pemilik. Status
 * yang diminta tetap diperiksa terhadap aturan transisi `lib/penagihan` oleh
 * pemanggilnya.
 */
async function kasusAtauBuat(
  ctx: MutationCtx,
  loan: Doc<"loans">,
): Promise<Doc<"penagihanKasus">> {
  const ada = await kasusUntuk(ctx, loan._id);
  if (ada !== null) return ada;
  const now = Date.now();
  const id = await ctx.db.insert("penagihanKasus", {
    loanId: loan._id,
    userId: loan.userId,
    nomorReferensi: loan.nomorReferensi,
    status: "ditangani",
    tingkatEskalasi: 0,
    statusPembayaran: "belum_bayar",
    jumlahTindakan: 0,
    dibuatPada: now,
    diperbaruiPada: now,
  });
  const dibuat = await ctx.db.get(id);
  if (dibuat === null) throw new Error("Gagal menyiapkan kasus penagihan.");
  return dibuat;
}

/**
 * Status kasus berikutnya yang sah dari status sekarang; `null` bila
 * perpindahannya tidak diizinkan (pemanggil memutuskan apa yang dilakukan).
 */
function statusKasusSah(dari: string, ke: string): string | null {
  if (dari === ke) return ke;
  return validasiTransisiKasus(dari, ke).ok ? ke : null;
}

/** Kewajiban tercatat menurut ledger internal (0 bila tidak dapat dihitung). */
async function kewajibanTercatat(ctx: QueryCtx | MutationCtx, loan: Doc<"loans">): Promise<number> {
  const pelunasan = pelunasanPinjaman(loan, Date.now());
  if (pelunasan !== null) return pelunasan.totalKewajibanDenganPenalti;
  // Pinjaman yang sudah lunas/menunggu: pakai angka terakhir yang pernah
  // dicatat pada kasus ini, supaya laporan tidak menampilkan kewajiban palsu.
  const kasus = await kasusUntuk(ctx, loan._id);
  if (kasus === null) return 0;
  const catatan = await ctx.db
    .query("penagihanPembayaran")
    .withIndex("by_kasus", (q) => q.eq("kasusId", kasus._id))
    .order("desc")
    .first();
  return catatan?.totalKewajiban ?? 0;
}

type BarisKasus = {
  loanId: IdT<"loans">;
  nomorReferensi: string;
  namaLengkap: string;
  jumlahKewajiban: number;
  jatuhTempoPada: number | null;
  hariTerlambat: number;
  dendaTerlambat: number;
  tahapKode: string;
  tahapLabel: string;
  tahapTingkat: number;
  perluTindakan: boolean;
  eskalasiDisarankan: number;
  tingkatEskalasi: number;
  eskalasiLabel: string | null;
  kasusId: IdT<"penagihanKasus"> | null;
  statusKasus: string;
  statusKasusLabel: string;
  petugasLabel: string | null;
  bolehSayaTangani: boolean;
  statusPembayaran: string;
  statusPembayaranLabel: string;
  nominalDibayar: number;
  jumlahTindakan: number;
  tindakanTerakhirPada: number | null;
  janjiAktif: { id: IdT<"penagihanJanji">; nominal: number; tanggalJanji: number } | null;
  pengaduanTerbuka: number;
  /** Kontak & informasi finansial SELALU tersamar di daftar kerja. */
  kontak: { whatsapp: string | null; rekening: string | null };
  bolehKontakSekarang: boolean;
};

/** Susun seluruh baris kasus (dipakai daftar kasus DAN laporan). */
async function hitungBarisKasus(
  ctx: QueryCtx | MutationCtx,
  admin: { userId: IdT<"users"> },
  aturan: AturanPenagihan,
): Promise<BarisKasus[]> {
  const now = Date.now();
  const loans = await ctx.db.query("loans").order("desc").take(BATAS_KASUS);
  const kasusRows = await ctx.db.query("penagihanKasus").collect();
  const kasusPerLoan = new Map<string, Doc<"penagihanKasus">>();
  for (const k of kasusRows) kasusPerLoan.set(k.loanId as string, k);

  // Pengaduan yang belum selesai dihitung sekali untuk semua baris.
  const pengaduan = await ctx.db.query("pengaduanNasabah").collect();
  const pengaduanTerbukaPerLoan = new Map<string, number>();
  for (const p of pengaduan) {
    if (p.status !== "baru" && p.status !== "ditinjau") continue;
    const kunci = (p.loanId ?? "") as string;
    if (kunci === "") continue;
    pengaduanTerbukaPerLoan.set(kunci, (pengaduanTerbukaPerLoan.get(kunci) ?? 0) + 1);
  }

  const baris: BarisKasus[] = [];
  for (const loan of loans) {
    const kasus = kasusPerLoan.get(loan._id as string);
    const pelunasan = pelunasanPinjaman(loan, now);
    const hariTerlambat = pelunasan?.hariTerlambat ?? 0;
    // Baris muncul bila pinjaman sedang terlambat ATAU sudah punya kasus
    // (kasus yang selesai tetap terlihat agar dapat ditinjau ulang).
    if (hariTerlambat <= 0 && kasus === undefined) continue;

    const tahap = klasifikasiTunggakan(hariTerlambat, aturan.ambang);
    const tingkat = kasus?.tingkatEskalasi ?? 0;
    const janji =
      kasus === undefined
        ? null
        : await ctx.db
            .query("penagihanJanji")
            .withIndex("by_kasus", (q) => q.eq("kasusId", kasus._id))
            .order("desc")
            .first();
    const janjiAktif =
      janji !== null && janji.status === "aktif"
        ? { id: janji._id, nominal: janji.nominal, tanggalJanji: janji.tanggalJanji }
        : null;

    const statusKasus = kasus?.status ?? "baru";
    const milikSaya = kasus?.petugasUserId === undefined || kasus?.petugasUserId === admin.userId;
    baris.push({
      loanId: loan._id,
      nomorReferensi: loan.nomorReferensi,
      namaLengkap: loan.namaLengkap,
      jumlahKewajiban:
        pelunasan?.totalKewajibanDenganPenalti ??
        (await kewajibanTercatat(ctx, loan)),
      jatuhTempoPada: pelunasan?.jatuhTempoPada ?? null,
      hariTerlambat,
      dendaTerlambat: pelunasan?.dendaTerlambat ?? 0,
      tahapKode: tahap.kode,
      tahapLabel: tahap.label,
      tahapTingkat: tahap.tingkat,
      perluTindakan: tahap.perluTindakan,
      eskalasiDisarankan: eskalasiDisarankan(tahap.kode),
      tingkatEskalasi: tingkat,
      eskalasiLabel: tingkatEskalasi(tingkat)?.label ?? null,
      kasusId: kasus?._id ?? null,
      statusKasus,
      statusKasusLabel: LABEL_STATUS_KASUS[statusKasus as keyof typeof LABEL_STATUS_KASUS] ?? statusKasus,
      petugasLabel: kasus?.petugasLabel ?? null,
      bolehSayaTangani: milikSaya,
      statusPembayaran: kasus?.statusPembayaran ?? "belum_bayar",
      statusPembayaranLabel:
        LABEL_STATUS_PEMBAYARAN[kasus?.statusPembayaran as keyof typeof LABEL_STATUS_PEMBAYARAN] ??
        "Belum bayar",
      nominalDibayar: kasus?.nominalDibayar ?? 0,
      jumlahTindakan: kasus?.jumlahTindakan ?? 0,
      tindakanTerakhirPada: kasus?.tindakanTerakhirPada ?? null,
      janjiAktif,
      pengaduanTerbuka: pengaduanTerbukaPerLoan.get(loan._id as string) ?? 0,
      kontak: {
        whatsapp: maskNomorTelepon(loan.nomorWhatsApp),
        rekening: maskRekening(loan.nomorRekening),
      },
      bolehKontakSekarang: bolehKontakSekarang(now, aturan.jamKontak),
    });
  }

  // Paling mendesak lebih dulu: tingkat tahap, lalu lama keterlambatan.
  baris.sort(
    (a, b) => b.tahapTingkat - a.tahapTingkat || b.hariTerlambat - a.hariTerlambat,
  );
  return baris;
}

// =====================================================================
// Query
// =====================================================================

/**
 * Aturan penagihan yang berlaku + seluruh daftar nilai yang sah.
 *
 * Nilai daftar (tahap, eskalasi, jenis tindakan, saluran, hasil, kategori
 * pengaduan) dikirim dari server supaya UI tidak pernah punya salinan
 * sendiri yang bisa berbeda dengan validasi server.
 */
export const aturanPenagihan = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const aturan = await bacaAturan(ctx);
    const row = await ctx.db
      .query("penagihanAturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_ATURAN))
      .first();
    return {
      aktif: aturan.aktif,
      ambang: aturan.ambang,
      ambangDefault: AMBANG_TUNGGAKAN_DEFAULT,
      jamKontak: aturan.jamKontak,
      jamKontakDefault: JAM_KONTAK_DEFAULT,
      diperbaruiPada: row?.diperbaruiPada ?? null,
      diperbaruiOlehLabel: row?.diperbaruiOlehLabel ?? null,
      daftar: {
        tahap: TAHAP_TUNGGAKAN,
        eskalasi: URUTAN_ESKALASI,
        statusKasus: STATUS_KASUS.map((s) => ({ nilai: s, label: LABEL_STATUS_KASUS[s] })),
        jenisTindakan: JENIS_TINDAKAN.map((s) => ({ nilai: s, label: LABEL_JENIS_TINDAKAN[s] })),
        saluran: SALURAN_TINDAKAN,
        hasil: HASIL_TINDAKAN.map((s) => ({ nilai: s, label: LABEL_HASIL_TINDAKAN[s] })),
        statusJanji: STATUS_JANJI.map((s) => ({ nilai: s, label: LABEL_STATUS_JANJI[s] })),
        statusPembayaran: STATUS_PEMBAYARAN.map((s) => ({
          nilai: s,
          label: LABEL_STATUS_PEMBAYARAN[s],
        })),
        statusPengaduan: STATUS_PENGADUAN.map((s) => ({
          nilai: s,
          label: LABEL_STATUS_PENGADUAN[s],
        })),
        kategoriPengaduan: KATEGORI_PENGADUAN,
        prioritasPengaduan: PRIORITAS_PENGADUAN.map((p) => ({
          nilai: p,
          label: LABEL_PRIORITAS_PENGADUAN[p],
        })),
        jenisPenyelesaian: JENIS_PENYELESAIAN.map((s) => ({
          nilai: s,
          label: LABEL_JENIS_PENYELESAIAN[s],
        })),
        pihakDihubungi: PIHAK_DIHUBUNGI,
      },
    };
  },
});

/** Daftar petugas yang boleh ditugaskan (akun admin) — untuk panel penugasan. */
export const petugasPenagihan = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => u.role === ROLES.ADMIN)
      .map((u) => ({ id: u._id, label: labelAktor(u) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
});

/**
 * Daftar kasus keterlambatan + ringkasannya.
 *
 * Kontak dan informasi finansial nasabah hanya keluar dalam bentuk tersamar;
 * nomor utuh dibuka lewat `bukaKontakPeminjam` yang mencatat audit.
 */
export const daftarKasus = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const aturan = await bacaAturan(ctx);
    const baris = await hitungBarisKasus(ctx, admin, aturan);
    return {
      aktif: aturan.aktif,
      bolehKontakSekarang: bolehKontakSekarang(Date.now(), aturan.jamKontak),
      jamKontak: aturan.jamKontak,
      baris,
    };
  },
});

/** Riwayat lengkap satu kasus: komunikasi, janji, pembayaran, penyelesaian, pengaduan. */
export const riwayatPenagihan = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const kasus = await kasusUntuk(ctx, loanId);
    const kasusId = kasus?._id ?? null;

    const tindakan =
      kasusId === null
        ? []
        : (
            await ctx.db
              .query("penagihanTindakan")
              .withIndex("by_kasus", (q) => q.eq("kasusId", kasusId))
              .collect()
          )
            .sort((a, b) => b.waktu - a.waktu)
            .map((t) => ({
              _id: t._id,
              jenis: t.jenis,
              jenisLabel: LABEL_JENIS_TINDAKAN[t.jenis as keyof typeof LABEL_JENIS_TINDAKAN] ?? t.jenis,
              saluran: t.saluran,
              hasil: t.hasil,
              hasilLabel: LABEL_HASIL_TINDAKAN[t.hasil as keyof typeof LABEL_HASIL_TINDAKAN] ?? t.hasil,
              pihak: t.pihak,
              nomorTujuan: maskNomorTelepon(t.nomorTujuan),
              isiPesan: t.isiPesan ?? null,
              catatan: t.catatan ?? null,
              petugasLabel: t.petugasLabel,
              waktu: t.waktu,
            }));

    const janji =
      kasusId === null
        ? []
        : (await ctx.db
            .query("penagihanJanji")
            .withIndex("by_kasus", (q) => q.eq("kasusId", kasusId))
            .collect()
          ).sort((a, b) => b.dibuatPada - a.dibuatPada);

    const pembayaran =
      kasusId === null
        ? []
        : (await ctx.db
            .query("penagihanPembayaran")
            .withIndex("by_kasus", (q) => q.eq("kasusId", kasusId))
            .collect()
          ).sort((a, b) => b.waktu - a.waktu);

    const penyelesaian =
      kasusId === null
        ? []
        : (await ctx.db
            .query("penagihanPenyelesaian")
            .withIndex("by_kasus", (q) => q.eq("kasusId", kasusId))
            .collect()
          ).sort((a, b) => b.waktu - a.waktu);

    const pengaduan = (await ctx.db
      .query("pengaduanNasabah")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .collect()
    ).sort((a, b) => b.dibuatPada - a.dibuatPada);

    return { loan: { _id: loan._id, nomorReferensi: loan.nomorReferensi }, kasus, tindakan, janji, pembayaran, penyelesaian, pengaduan };
  },
});

/**
 * Daftar pengaduan nasabah (helpdesk) — diurutkan PRIORITAS lalu terbaru.
 *
 * Urutan sebelumnya murni waktu, sehingga pengaduan kritis bisa tenggelam di
 * bawah catatan ringan. Sekarang urutan berasal dari bobot prioritas yang
 * tersimpan di baris (lihat `PRIORITAS_PENGADUAN`), dengan waktu sebagai
 * pemecah seri. Tiap baris juga membawa ringkasan utas supaya petugas tahu
 * apakah pengaduan sudah pernah dibalas.
 */
export const daftarPengaduan = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("pengaduanNasabah").order("desc").take(BATAS_KASUS);
    const pesan = await ctx.db.query("pengaduanPesan").order("desc").take(BATAS_KASUS * 4);
    const ringkasUtas = new Map<
      string,
      { jumlah: number; terakhir: string | null; terakhirPada: number | null; terakhirArah: string | null }
    >();
    // `pesan` sudah terurut desc → kemunculan pertama satu pengaduan = terbaru.
    for (const m of pesan) {
      const kunci = m.pengaduanId as string;
      const ada = ringkasUtas.get(kunci);
      if (ada === undefined) {
        ringkasUtas.set(kunci, {
          jumlah: 1,
          terakhir: m.isi,
          terakhirPada: m.dibuatPada,
          terakhirArah: m.arah,
        });
      } else {
        ada.jumlah += 1;
      }
    }
    return rows
      .map((p) => {
        const prioritas = prioritasEfektif(p.prioritas);
        const utas = ringkasUtas.get(p._id as string);
        return {
          _id: p._id,
          nomorReferensi: p.nomorReferensi ?? null,
          kanal: p.kanal,
          kategori: p.kategori,
          isi: p.isi,
          status: p.status,
          statusLabel:
            LABEL_STATUS_PENGADUAN[p.status as keyof typeof LABEL_STATUS_PENGADUAN] ?? p.status,
          prioritas,
          prioritasLabel: LABEL_PRIORITAS_PENGADUAN[prioritas],
          prioritasBobot: BOBOT_PRIORITAS_PENGADUAN[prioritas],
          jumlahPesan: utas?.jumlah ?? 0,
          pesanTerakhir: utas?.terakhir ?? null,
          pesanTerakhirPada: utas?.terakhirPada ?? null,
          pesanTerakhirArah: utas?.terakhirArah ?? null,
          petugasLabel: p.petugasLabel ?? null,
          penyelesaian: p.penyelesaian ?? null,
          dibuatPada: p.dibuatPada,
          ditutupPada: p.ditutupPada ?? null,
        };
      })
      .sort(
        (a, b) => b.prioritasBobot - a.prioritasBobot || b.dibuatPada - a.dibuatPada,
      );
  },
});

/** Utas percakapan satu pengaduan — urut kronologis (paling lama dulu). */
export const pesanPengaduan = query({
  args: { pengaduanId: v.id("pengaduanNasabah") },
  handler: async (ctx, { pengaduanId }) => {
    await requireAdmin(ctx);
    const pengaduan = await ctx.db.get(pengaduanId);
    if (pengaduan === null) throw new Error("Pengaduan tidak ditemukan.");
    const rows = await ctx.db
      .query("pengaduanPesan")
      .withIndex("by_pengaduan_dibuatPada", (q) => q.eq("pengaduanId", pengaduanId))
      .take(BATAS_KASUS);
    return rows.map((m) => ({
      _id: m._id,
      arah: m.arah,
      isi: m.isi,
      penulisLabel: m.penulisLabel,
      lampiranNama: m.lampiranNama ?? null,
      dibuatPada: m.dibuatPada,
    }));
  },
});

/**
 * Laporan penagihan (agregat, tanpa kontak pribadi).
 * Angka berasal dari kasus yang benar-benar ada — bukan proyeksi.
 */
export const laporanPenagihan = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const aturan = await bacaAturan(ctx);
    const baris = await hitungBarisKasus(ctx, admin, aturan);
    const pengaduan = await ctx.db.query("pengaduanNasabah").collect();
    const ringkasan = ringkasLaporanPenagihan(
      baris.map((b) => ({
        tahap: b.tahapKode as never,
        petugasLabel: b.petugasLabel,
        statusKasus: b.statusKasus,
        statusPembayaran: b.statusPembayaran,
        sisaKewajiban: b.jumlahKewajiban - b.nominalDibayar,
        jumlahTindakan: b.jumlahTindakan,
        janji: b.janjiAktif === null ? null : { status: "aktif" },
      })),
    );
    return {
      ...ringkasan,
      ambang: aturan.ambang,
      pengaduan: {
        baru: pengaduan.filter((p) => p.status === "baru").length,
        ditinjau: pengaduan.filter((p) => p.status === "ditinjau").length,
        selesai: pengaduan.filter((p) => p.status === "selesai").length,
        ditolak: pengaduan.filter((p) => p.status === "ditolak").length,
      },
    };
  },
});

/**
 * Buka kontak & informasi finansial utuh SATU peminjam.
 *
 * Sengaja mutation (bukan query): pembukaan data sensitif WAJIB meninggalkan
 * jejak audit yang menyebut siapa membuka data siapa, kapan. Petugas hanya
 * boleh membuka kasus yang ditugaskan kepadanya atau belum ditugaskan.
 */
export const bukaKontakPeminjam = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const admin = await requireAdmin(ctx);
    const { loan } = await mintaKasus(ctx, admin, loanId);
    await audit(
      ctx,
      admin.userId,
      labelAktor(admin.user),
      "buka_kontak_penagihan",
      loan.nomorReferensi,
      `Kontak & rekening peminjam dibuka untuk penanganan ${loan.nomorReferensi}.`,
    );
    return {
      namaLengkap: loan.namaLengkap,
      nomorWhatsApp: loan.nomorWhatsApp ?? null,
      nomorRekening: loan.nomorRekening,
      namaBank: loan.namaBank ?? null,
    };
  },
});

// =====================================================================
// Mutation
// =====================================================================

/** Simpan aturan penagihan (ambang + jam kontak + saklar modul). */
export const simpanAturan = mutation({
  args: {
    aktif: v.boolean(),
    ambangRingan: v.number(),
    ambangSedang: v.number(),
    ambangBerat: v.number(),
    jamMulai: v.number(),
    jamSelesai: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const ambang: AmbangTunggakan = {
      ringan: args.ambangRingan,
      sedang: args.ambangSedang,
      berat: args.ambangBerat,
    };
    const jamKontak: JamKontak = { mulai: args.jamMulai, selesai: args.jamSelesai };
    const sahAmbang = validasiAmbang(ambang);
    if (!sahAmbang.ok) throw new Error(sahAmbang.alasan);
    const sahJam = validasiJamKontak(jamKontak);
    if (!sahJam.ok) throw new Error(sahJam.alasan);

    const now = Date.now();
    const label = labelAktor(admin.user);
    const existing = await ctx.db
      .query("penagihanAturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_ATURAN))
      .first();
    const patch = {
      slot: SLOT_ATURAN,
      aktif: args.aktif,
      ambangRingan: ambang.ringan,
      ambangSedang: ambang.sedang,
      ambangBerat: ambang.berat,
      jamMulai: jamKontak.mulai,
      jamSelesai: jamKontak.selesai,
      diperbaruiPada: now,
      diperbaruiOlehLabel: label,
    };
    if (existing === null) await ctx.db.insert("penagihanAturan", patch);
    else await ctx.db.patch(existing._id, patch);
    await audit(
      ctx,
      admin.userId,
      label,
      "ubah_aturan_penagihan",
      "penagihanAturan",
      `Modul ${args.aktif ? "AKTIF" : "NONAKTIF"} · ambang ${ambang.ringan}/${ambang.sedang}/${ambang.berat} hari · jam kontak ${jamKontak.mulai}:00–${jamKontak.selesai}:00 WIB.`,
    );
    return { ok: true };
  },
});

/**
 * Tugaskan (atau lepas) kasus penagihan kepada satu petugas.
 *
 * Penugasan adalah tindakan penyelia: boleh memindahkan kasus yang sedang
 * dipegang petugas lain — dan perpindahan itu dicatat audit sehingga dapat
 * ditinjau. Tindakan penanganan sendiri tetap dibatasi pada petugas pemegang.
 */
export const tugaskanPetugas = mutation({
  args: {
    loanId: v.id("loans"),
    petugasUserId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, { loanId, petugasUserId }) => {
    const admin = await requireAdmin(ctx);
    // Sengaja TIDAK memakai `mintaKasus`: penugasan adalah tindakan PENYELIA,
    // sehingga kasus boleh dipindahkan dari petugas yang sedang memegangnya
    // (mis. petugas berhenti atau beban kerja perlu diseimbangkan). Yang
    // dibatasi per pemegang adalah tindakan PENANGANAN, bukan penugasannya.
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    const kasus = await kasusUntuk(ctx, loanId);

    let label: string | null = null;
    if (petugasUserId !== null) {
      const petugas = await ctx.db.get(petugasUserId);
      if (petugas === null || petugas.role !== ROLES.ADMIN) {
        throw new Error("Petugas penagihan harus akun admin yang aktif.");
      }
      label = labelAktor(petugas);
    }

    const sekarang = kasus ?? (await kasusAtauBuat(ctx, loan));
    const now = Date.now();
    await ctx.db.patch(sekarang._id, {
      petugasUserId: petugasUserId ?? undefined,
      petugasLabel: label ?? undefined,
      status:
        label === null
          ? sekarang.status
          : sekarang.status === "baru"
            ? "ditugaskan"
            : sekarang.status,
      diperbaruiPada: now,
    });
    const sebelumnya = kasus?.petugasLabel ?? null;
    await audit(
      ctx,
      admin.userId,
      labelAktor(admin.user),
      "tugaskan_penagihan",
      loan.nomorReferensi,
      label === null
        ? "Penugasan dilepas."
        : sebelumnya !== null && sebelumnya !== label
          ? `Penugasan dialihkan dari ${sebelumnya} kepada ${label}.`
          : `Ditugaskan kepada ${label}.`,
    );
    return { ok: true, petugasLabel: label };
  },
});

/**
 * Catat satu tindakan/komunikasi penagihan.
 *
 * Pemeriksaan yang dilakukan SEBELUM menyimpan:
 *  1. saklar modul aktif;
 *  2. jenis/saluran/hasil dikenal;
 *  3. pihak yang dihubungi hanya peminjam sendiri;
 *  4. saluran yang menghubungi langsung hanya di dalam jendela jam kontak;
 *  5. isi pesan wajib untuk pesan tertulis/WhatsApp dan WAJIB lolos penjaga
 *     pesan (tanpa ancaman/intimidasi/penyebaran data/janji menyesatkan).
 * Waktu diambil dari SERVER, petugas dari sesi — tidak pernah dari klien.
 */
export const catatTindakan = mutation({
  args: {
    loanId: v.id("loans"),
    jenis: v.string(),
    saluran: v.string(),
    hasil: v.string(),
    /** Default "peminjam"; pihak lain ditolak. */
    pihak: v.optional(v.string()),
    isiPesan: v.optional(v.string()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const aturan = await bacaAturan(ctx);
    if (!aturan.aktif) {
      throw new Error(
        "Modul penagihan sedang dinonaktifkan. Aktifkan lebih dulu di panel Penagihan sebelum mencatat tindakan.",
      );
    }
    if (!(JENIS_TINDAKAN as readonly string[]).includes(args.jenis)) {
      throw new Error(`Jenis tindakan "${args.jenis}" tidak dikenali.`);
    }
    if (!(SALURAN_TINDAKAN as readonly string[]).includes(args.saluran)) {
      throw new Error(`Saluran "${args.saluran}" tidak dikenali.`);
    }
    if (!(HASIL_TINDAKAN as readonly string[]).includes(args.hasil)) {
      throw new Error(`Hasil tindakan "${args.hasil}" tidak dikenali.`);
    }

    const pihak = (args.pihak ?? "peminjam").trim().toLowerCase();
    const sahPihak = bolehHubungiPihak(pihak);
    if (!sahPihak.ok) throw new Error(sahPihak.alasan);

    const { loan, kasus } = await mintaKasus(ctx, admin, args.loanId);
    const now = Date.now();

    if (
      (SALURAN_KONTAK_LANGSUNG as readonly string[]).includes(args.saluran) &&
      !bolehKontakSekarang(now, aturan.jamKontak)
    ) {
      throw new Error(
        `Di luar jam kontak ${aturan.jamKontak.mulai}:00–${aturan.jamKontak.selesai}:00 WIB. Tindakan yang menghubungi nasabah hanya boleh dicatat di dalam jendela itu.`,
      );
    }

    const isiPesan = args.isiPesan?.trim() ?? "";
    const butuhPesan = args.jenis === "pesan_tertulis" || args.saluran === "whatsapp";
    if (butuhPesan && isiPesan === "") {
      throw new Error("Isi pesan wajib diisi untuk pesan tertulis/WhatsApp.");
    }
    if (isiPesan !== "") {
      const periksa = periksaPesanPenagihan(isiPesan);
      if (!periksa.ok) throw new Error(periksa.alasan);
    }

    const kasusAktif = kasus ?? (await kasusAtauBuat(ctx, loan));
    const adaJanjiAktif = await ctx.db
      .query("penagihanJanji")
      .withIndex("by_kasus", (q) => q.eq("kasusId", kasusAktif._id))
      .collect();
    const janjiAktif = adaJanjiAktif.find((j) => j.status === "aktif") ?? null;

    await ctx.db.insert("penagihanTindakan", {
      kasusId: kasusAktif._id,
      loanId: loan._id,
      jenis: args.jenis,
      saluran: args.saluran,
      hasil: args.hasil,
      pihak,
      nomorTujuan: loan.nomorWhatsApp,
      isiPesan: isiPesan === "" ? undefined : isiPesan,
      catatan: args.catatan?.trim() === "" ? undefined : args.catatan?.trim(),
      petugasUserId: admin.userId,
      petugasLabel: labelAktor(admin.user),
      waktu: now,
    });

    // Status kasus mengikuti keadaan nyata: janji aktif tetap "janji_aktif",
    // selain itu tindakan memindahkan kasus ke "ditangani". Kasus yang sudah
    // ditutup dibuka kembali lewat aturan transisi di lib/penagihan — bila
    // transisinya tidak sah, status dibiarkan apa adanya (perubahan lain tetap
    // tercatat di riwayat tindakan).
    const tujuan =
      janjiAktif !== null
        ? (statusKasusSah(kasusAktif.status, "janji_aktif") ?? kasusAktif.status)
        : (statusKasusSah(kasusAktif.status, "ditangani") ?? kasusAktif.status);
    await ctx.db.patch(kasusAktif._id, {
      jumlahTindakan: kasusAktif.jumlahTindakan + 1,
      tindakanTerakhirPada: now,
      catatanTerakhir:
        args.catatan?.trim() === "" ? kasusAktif.catatanTerakhir : args.catatan?.trim(),
      janjiAktifId: janjiAktif?._id ?? kasusAktif.janjiAktifId,
      status: tujuan,
      selesaiPada: tujuan === "ditangani" || tujuan === "janji_aktif" ? undefined : kasusAktif.selesaiPada,
      diperbaruiPada: now,
    });

    await audit(
      ctx,
      admin.userId,
      labelAktor(admin.user),
      "tindakan_penagihan",
      loan.nomorReferensi,
      `${LABEL_JENIS_TINDAKAN[args.jenis as keyof typeof LABEL_JENIS_TINDAKAN] ?? args.jenis} via ${args.saluran} · hasil: ${LABEL_HASIL_TINDAKAN[args.hasil as keyof typeof LABEL_HASIL_TINDAKAN] ?? args.hasil} · pihak: ${pihak}.`,
    );
    return { ok: true, contohPesanNetral: pesanPengingatNetral({
      nama: loan.namaLengkap,
      nomorReferensi: loan.nomorReferensi,
      hariTerlambat: pelunasanPinjaman(loan, now)?.hariTerlambat ?? 0,
      totalKewajiban: pelunasanPinjaman(loan, now)?.totalKewajibanDenganPenalti ?? 0,
    }) };
  },
});

/** Catat janji pembayaran (promise to pay) dan sekaligus jejaknya di riwayat. */
export const catatJanjiBayar = mutation({
  args: {
    loanId: v.id("loans"),
    nominal: v.number(),
    tanggalJanji: v.number(),
    kanal: v.string(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!(SALURAN_TINDAKAN as readonly string[]).includes(args.kanal)) {
      throw new Error(`Kanal "${args.kanal}" tidak dikenali.`);
    }
    const now = Date.now();
    const sah = validasiJanjiBayar({ nominal: args.nominal, tanggalJanji: args.tanggalJanji }, now);
    if (!sah.ok) throw new Error(sah.alasan);

    const { loan, kasus } = await mintaKasus(ctx, admin, args.loanId);
    const kasusAktif = kasus ?? (await kasusAtauBuat(ctx, loan));
    const label = labelAktor(admin.user);

    const janjiId = await ctx.db.insert("penagihanJanji", {
      kasusId: kasusAktif._id,
      loanId: loan._id,
      userId: loan.userId,
      nominal: args.nominal,
      tanggalJanji: args.tanggalJanji,
      kanal: args.kanal,
      status: "aktif",
      catatan: args.catatan?.trim() === "" ? undefined : args.catatan?.trim(),
      dibuatOlehUserId: admin.userId,
      dibuatOlehLabel: label,
      dibuatPada: now,
    });

    // Janji sebelumnya yang masih aktif ditutup sebagai "dibatalkan" — satu
    // janji aktif per kasus, supaya laporan tidak menghitung janji ganda.
    const janjiLama = await ctx.db
      .query("penagihanJanji")
      .withIndex("by_kasus", (q) => q.eq("kasusId", kasusAktif._id))
      .collect();
    for (const j of janjiLama) {
      if (j._id === janjiId || j.status !== "aktif") continue;
      await ctx.db.patch(j._id, {
        status: "dibatalkan",
        ditutupPada: now,
        ditutupOlehLabel: label,
        hasilCatatan: "Digantikan janji pembayaran yang lebih baru.",
      });
    }

    await ctx.db.insert("penagihanTindakan", {
      kasusId: kasusAktif._id,
      loanId: loan._id,
      jenis: "kesepakatan",
      saluran: args.kanal,
      hasil: "janji_dibuat",
      pihak: "peminjam",
      nomorTujuan: loan.nomorWhatsApp,
      catatan: `Janji pembayaran Rp ${args.nominal.toLocaleString("id-ID")} pada ${new Date(args.tanggalJanji).toLocaleDateString("id-ID")}.`,
      petugasUserId: admin.userId,
      petugasLabel: label,
      waktu: now,
    });

    await ctx.db.patch(kasusAktif._id, {
      janjiAktifId: janjiId,
      status: statusKasusSah(kasusAktif.status, "janji_aktif") ?? "ditangani",
      jumlahTindakan: kasusAktif.jumlahTindakan + 1,
      tindakanTerakhirPada: now,
      selesaiPada: undefined,
      diperbaruiPada: now,
    });

    await audit(
      ctx,
      admin.userId,
      label,
      "janji_bayar_penagihan",
      loan.nomorReferensi,
      `Janji Rp ${args.nominal.toLocaleString("id-ID")} pada ${new Date(args.tanggalJanji).toLocaleDateString("id-ID")} via ${args.kanal}.`,
    );
    return { ok: true, janjiId };
  },
});

/** Tutup satu janji: dipenuhi / dilanggar / dibatalkan. */
export const tutupJanji = mutation({
  args: {
    janjiId: v.id("penagihanJanji"),
    status: v.string(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, { janjiId, status, catatan }) => {
    const admin = await requireAdmin(ctx);
    if (status === "aktif" || !(STATUS_JANJI as readonly string[]).includes(status)) {
      throw new Error("Penutupan janji hanya boleh dipenuhi/dilanggar/dibatalkan.");
    }
    const janji = await ctx.db.get(janjiId);
    if (janji === null) throw new Error("Janji pembayaran tidak ditemukan.");
    if (janji.status !== "aktif") {
      throw new Error(
        `Janji ini sudah berstatus ${LABEL_STATUS_JANJI[janji.status as keyof typeof LABEL_STATUS_JANJI] ?? janji.status}.`,
      );
    }
    const { loan, kasus } = await mintaKasus(ctx, admin, janji.loanId);
    if (kasus === null) throw new Error("Kasus penagihan tidak ditemukan.");
    const now = Date.now();
    const label = labelAktor(admin.user);
    await ctx.db.patch(janjiId, {
      status,
      ditutupPada: now,
      ditutupOlehLabel: label,
      hasilCatatan: catatan?.trim() === "" ? undefined : catatan?.trim(),
    });

    const tujuan = status === "dipenuhi" ? "selesai" : "ditangani";
    await ctx.db.patch(kasus._id, {
      janjiAktifId: undefined,
      status: statusKasusSah(kasus.status, tujuan) ?? kasus.status,
      sebabSelesai: status === "dipenuhi" ? "Janji pembayaran dipenuhi." : undefined,
      selesaiPada: status === "dipenuhi" ? now : undefined,
      diperbaruiPada: now,
    });

    await audit(
      ctx,
      admin.userId,
      label,
      "tutup_janji_penagihan",
      loan.nomorReferensi,
      `Janji pembayaran ${LABEL_STATUS_JANJI[status as keyof typeof LABEL_STATUS_JANJI] ?? status}${catatan?.trim() ? ` · ${catatan.trim()}` : ""}.`,
    );
    return { ok: true };
  },
});

/**
 * Naikkan tingkat eskalasi kasus satu langkah.
 *
 * Tingkat yang `butuhPersetujuan` WAJIB disertai catatan persetujuan penyelia;
 * tanpa itu permintaan ditolak. Eskalasi hanya menaikkan perhatian internal —
 * tidak ada tindakan di luar prosedur, tekanan, atau ancaman.
 */
export const eskalasiKasus = mutation({
  args: { loanId: v.id("loans"), catatan: v.optional(v.string()) },
  handler: async (ctx, { loanId, catatan }) => {
    const admin = await requireAdmin(ctx);
    const aturan = await bacaAturan(ctx);
    if (!aturan.aktif) throw new Error("Modul penagihan sedang dinonaktifkan.");
    const { loan, kasus } = await mintaKasus(ctx, admin, loanId);
    const kasusAktif = kasus ?? (await kasusAtauBuat(ctx, loan));
    const berikut = eskalasiBerikutnya(kasusAktif.tingkatEskalasi);
    if (berikut === null) {
      throw new Error("Kasus sudah berada di tingkat eskalasi tertinggi.");
    }
    const bersih = catatan?.trim() ?? "";
    if (berikut.butuhPersetujuan && bersih.length < MIN_ALASAN) {
      throw new Error(
        `Tingkat ${berikut.tingkat} (${berikut.label}) memerlukan catatan persetujuan penyelia minimal ${MIN_ALASAN} karakter.`,
      );
    }
    const now = Date.now();
    const label = labelAktor(admin.user);
    await ctx.db.patch(kasusAktif._id, {
      tingkatEskalasi: berikut.tingkat,
      diperbaruiPada: now,
      catatanTerakhir: bersih === "" ? kasusAktif.catatanTerakhir : bersih,
    });
    await ctx.db.insert("penagihanTindakan", {
      kasusId: kasusAktif._id,
      loanId: loan._id,
      jenis: "lainnya",
      saluran: "sistem",
      hasil: "tidak_relevan",
      pihak: "peminjam",
      catatan: `Eskalasi ke tingkat ${berikut.tingkat} — ${berikut.label}${bersih === "" ? "" : ` · ${bersih}`}`,
      petugasUserId: admin.userId,
      petugasLabel: label,
      waktu: now,
    });
    await audit(
      ctx,
      admin.userId,
      label,
      "eskalasi_penagihan",
      loan.nomorReferensi,
      `Tingkat ${kasusAktif.tingkatEskalasi} → ${berikut.tingkat} (${berikut.label})${bersih === "" ? "" : ` · ${bersih}`}`,
    );
    return { ok: true, tingkat: berikut.tingkat, label: berikut.label };
  },
});

/**
 * Catat penyelesaian kasus (pelunasan, restrukturisasi, keringanan denda,
 * penyelesaian sengketa).
 *
 * Murni pencatatan keputusan: tidak memindahkan uang dan tidak menyentuh
 * ledger/status pinjaman. Karena itu alasannya WAJIB dan nominalnya diperiksa
 * terhadap kewajiban yang tercatat.
 */
export const catatPenyelesaian = mutation({
  args: {
    loanId: v.id("loans"),
    jenis: v.string(),
    nominal: v.number(),
    alasan: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!(JENIS_PENYELESAIAN as readonly string[]).includes(args.jenis)) {
      throw new Error(`Jenis penyelesaian "${args.jenis}" tidak dikenali.`);
    }
    const alasan = args.alasan.trim();
    if (alasan.length < MIN_ALASAN) {
      throw new Error(`Alasan penyelesaian minimal ${MIN_ALASAN} karakter.`);
    }
    const { loan, kasus } = await mintaKasus(ctx, admin, args.loanId);
    const total = await kewajibanTercatat(ctx, loan);
    const sah = validasiPenyelesaian(
      { jenis: args.jenis as JenisPenyelesaian, nominal: args.nominal },
      total,
    );
    if (!sah.ok) throw new Error(sah.alasan);

    const kasusAktif = kasus ?? (await kasusAtauBuat(ctx, loan));
    const now = Date.now();
    const label = labelAktor(admin.user);
    await ctx.db.insert("penagihanPenyelesaian", {
      kasusId: kasusAktif._id,
      loanId: loan._id,
      jenis: args.jenis,
      nominal: args.nominal,
      totalKewajiban: total,
      alasan,
      petugasUserId: admin.userId,
      petugasLabel: label,
      waktu: now,
    });
    const tujuan = "selesai";
    await ctx.db.patch(kasusAktif._id, {
      status: statusKasusSah(kasusAktif.status, tujuan) ?? kasusAktif.status,
      sebabSelesai: `Penyelesaian: ${LABEL_JENIS_PENYELESAIAN[args.jenis as keyof typeof LABEL_JENIS_PENYELESAIAN] ?? args.jenis}.`,
      selesaiPada: now,
      diperbaruiPada: now,
    });
    await audit(
      ctx,
      admin.userId,
      label,
      "penyelesaian_penagihan",
      loan.nomorReferensi,
      `${LABEL_JENIS_PENYELESAIAN[args.jenis as keyof typeof LABEL_JENIS_PENYELESAIAN] ?? args.jenis} · nominal Rp ${args.nominal.toLocaleString("id-ID")} dari kewajiban Rp ${total.toLocaleString("id-ID")} · ${alasan}. Catatan saja, tanpa perpindahan dana.`,
    );
    return { ok: true };
  },
});

/**
 * Perbarui STATUS PEMBAYARAN pada kasus penagihan.
 *
 * Ini catatan petugas atas apa yang dilaporkan nasabah — BUKAN bukti transfer
 * dan bukan pengubahan ledger. Status pinjaman & saldo tetap diubah lewat jalur
 * pinjaman/pembayaran; kalimat galat dan audit menyebutkan batas itu supaya
 * tidak ada yang menyimpulkan uang sudah berpindah.
 */
export const perbaruiStatusPembayaran = mutation({
  args: {
    loanId: v.id("loans"),
    status: v.string(),
    nominal: v.number(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!(STATUS_PEMBAYARAN as readonly string[]).includes(args.status)) {
      throw new Error(`Status pembayaran "${args.status}" tidak dikenali.`);
    }
    const { loan, kasus } = await mintaKasus(ctx, admin, args.loanId);
    const total = await kewajibanTercatat(ctx, loan);
    const sah = validasiPembayaran(
      { status: args.status as StatusPembayaran, nominal: args.nominal },
      total,
    );
    if (!sah.ok) throw new Error(sah.alasan);

    const kasusAktif = kasus ?? (await kasusAtauBuat(ctx, loan));
    const now = Date.now();
    const label = labelAktor(admin.user);
    await ctx.db.insert("penagihanPembayaran", {
      kasusId: kasusAktif._id,
      loanId: loan._id,
      status: args.status,
      nominal: args.nominal,
      totalKewajiban: total,
      catatan: args.catatan?.trim() === "" ? undefined : args.catatan?.trim(),
      petugasUserId: admin.userId,
      petugasLabel: label,
      waktu: now,
    });

    const lunas = args.status === "lunas_dicatat";
    const tujuan = lunas ? "selesai" : "ditangani";
    await ctx.db.patch(kasusAktif._id, {
      statusPembayaran: args.status,
      nominalDibayar: args.nominal,
      status: statusKasusSah(kasusAktif.status, tujuan) ?? kasusAktif.status,
      sebabSelesai: lunas ? "Lunas dicatat petugas (menunggu pembaruan di jalur pembayaran)." : undefined,
      selesaiPada: lunas ? now : undefined,
      diperbaruiPada: now,
    });
    await audit(
      ctx,
      admin.userId,
      label,
      "pembayaran_penagihan",
      loan.nomorReferensi,
      `Status pembayaran: ${LABEL_STATUS_PEMBAYARAN[args.status as keyof typeof LABEL_STATUS_PEMBAYARAN] ?? args.status} · Rp ${args.nominal.toLocaleString("id-ID")} dari kewajiban Rp ${total.toLocaleString("id-ID")}. Catatan petugas — bukan bukti transfer dan tidak mengubah ledger.`,
    );
    return { ok: true };
  },
});

/**
 * Sesi NASABAH wajib untuk pengaduan mandiri.
 *
 * Tamu ditolak dengan sengaja: pengaduan tanpa akun tidak bisa ditindaklanjuti
 * (tidak ada cara menghubungi kembali, tidak ada utas yang bisa dibalas), dan
 * menampungnya hanya akan menciptakan antrean yang tak bisa dijawab.
 */
async function requireNasabahPengaduan(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Masuk terlebih dahulu untuk mengirim atau membaca pengaduan.");
  }
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu tidak dapat mengirim pengaduan. Masuk dengan akun terverifikasi agar pengaduan dapat ditindaklanjuti.",
    );
  }
  return { userId, user };
}

/** Label penulis untuk pesan nasabah — nama/email, bukan id mentah. */
function labelNasabahPengaduan(user: { email?: string; name?: string }): string {
  return user.name ?? user.email ?? "Nasabah";
}

/** Buka pengaduan nasabah (kanal apa pun yang dicatat petugas). */
export const bukaPengaduan = mutation({
  args: {
    loanId: v.optional(v.id("loans")),
    kanal: v.string(),
    kategori: v.string(),
    isi: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!(SALURAN_TINDAKAN as readonly string[]).includes(args.kanal)) {
      throw new Error(`Kanal "${args.kanal}" tidak dikenali.`);
    }
    if (!(KATEGORI_PENGADUAN as readonly string[]).includes(args.kategori)) {
      throw new Error(`Kategori pengaduan "${args.kategori}" tidak dikenali.`);
    }
    const sah = validasiPengaduan(args.isi);
    if (!sah.ok) throw new Error(sah.alasan);

    const loanId = args.loanId;
    let userId: IdT<"users"> | undefined;
    let nomorReferensi: string | undefined;
    if (loanId !== undefined) {
      const loan = await ctx.db.get(loanId);
      if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
      userId = loan.userId;
      nomorReferensi = loan.nomorReferensi;
    }
    const now = Date.now();
    const prioritas = prioritasBawaan(args.kategori);
    const id = await ctx.db.insert("pengaduanNasabah", {
      loanId,
      userId,
      nomorReferensi,
      kanal: args.kanal,
      kategori: args.kategori,
      isi: args.isi.trim(),
      status: "baru",
      // Prioritas bawaan dari kategori — titik awal yang bisa diubah petugas.
      prioritas,
      dibuatPada: now,
      diperbaruiPada: now,
    });
    // Uraian awal menjadi pesan PERTAMA utas, sehingga percakapan lengkap
    // terbaca di satu tempat (bukan terpisah antara kolom `isi` dan balasan).
    await ctx.db.insert("pengaduanPesan", {
      pengaduanId: id,
      arah: "nasabah",
      isi: args.isi.trim(),
      penulisUserId: userId,
      penulisLabel: `Nasabah via ${args.kanal}`,
      dibuatPada: now,
    });
    await audit(
      ctx,
      admin.userId,
      labelAktor(admin.user),
      "buka_pengaduan",
      nomorReferensi ?? "pengaduan umum",
      `Kategori ${args.kategori} via ${args.kanal} · prioritas ${LABEL_PRIORITAS_PENGADUAN[prioritas]}.`,
    );
    return { ok: true, pengaduanId: id };
  },
});

/** Tangani pengaduan: pindahkan status dan catat penyelesaiannya. */
export const tanganiPengaduan = mutation({
  args: {
    pengaduanId: v.id("pengaduanNasabah"),
    status: v.string(),
    penyelesaian: v.optional(v.string()),
  },
  handler: async (ctx, { pengaduanId, status, penyelesaian }) => {
    const admin = await requireAdmin(ctx);
    const pengaduan = await ctx.db.get(pengaduanId);
    if (pengaduan === null) throw new Error("Pengaduan tidak ditemukan.");
    const sah = validasiTransisiPengaduan(pengaduan.status, status);
    if (!sah.ok) throw new Error(sah.alasan);

    const catatan = penyelesaian?.trim() ?? "";
    const butuhCatatan = status === "selesai" || status === "ditolak";
    if (butuhCatatan && catatan.length < MIN_ALASAN) {
      throw new Error(
        `Penyelesaian pengaduan minimal ${MIN_ALASAN} karakter agar alasan keputusannya dapat ditinjau.`,
      );
    }
    const now = Date.now();
    const label = labelAktor(admin.user);
    await ctx.db.patch(pengaduanId, {
      status,
      penyelesaian: catatan === "" ? pengaduan.penyelesaian : catatan,
      petugasUserId: admin.userId,
      petugasLabel: label,
      diperbaruiPada: now,
      ditutupPada: status === "selesai" || status === "ditolak" ? now : undefined,
    });
    await audit(
      ctx,
      admin.userId,
      label,
      "tangani_pengaduan",
      pengaduan.nomorReferensi ?? "pengaduan umum",
      `Status → ${LABEL_STATUS_PENGADUAN[status as keyof typeof LABEL_STATUS_PENGADUAN] ?? status}${catatan === "" ? "" : ` · ${catatan}`}`,
    );
    return { ok: true };
  },
});

/**
 * Bentuk satu baris kasus yang dikirim ke panel admin (diekspor sebagai TIPE
 * saja — impor tipe ini tidak menarik kode server ke bundel klien).
 */
export type { BarisKasus };

/**
 * Ubah PRIORITAS satu pengaduan (helpdesk). Wajib beralasan jika menaikkan ke
 * "kritis" supaya keputusan mendahulukan satu nasabah di atas yang lain dapat
 * ditinjau. Selalu menulis satu entri audit.
 */
export const ubahPrioritasPengaduan = mutation({
  args: {
    pengaduanId: v.id("pengaduanNasabah"),
    prioritas: v.string(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, { pengaduanId, prioritas, catatan }) => {
    const admin = await requireAdmin(ctx);
    const sah = validasiPrioritasPengaduan(prioritas);
    if (!sah.ok) throw new Error(sah.alasan);

    const pengaduan = await ctx.db.get(pengaduanId);
    if (pengaduan === null) throw new Error("Pengaduan tidak ditemukan.");

    const sekarang = prioritasEfektif(pengaduan.prioritas);
    if (sekarang === prioritas) {
      throw new Error(
        `Pengaduan sudah berprioritas ${LABEL_PRIORITAS_PENGADUAN[sekarang]}.`,
      );
    }
    const catatanBersih = (catatan ?? "").trim();
    if (prioritas === "kritis" && catatanBersih.length < MIN_ALASAN) {
      throw new Error(
        `Menaikkan prioritas ke Kritis butuh alasan minimal ${MIN_ALASAN} karakter.`,
      );
    }

    const now = Date.now();
    const actor = labelAktor(admin.user);
    await ctx.db.patch(pengaduanId, {
      prioritas,
      prioritasDiubahPada: now,
      diperbaruiPada: now,
    });
    await audit(
      ctx,
      admin.userId,
      actor,
      "ubah_prioritas_pengaduan",
      pengaduan.nomorReferensi ?? "pengaduan umum",
      `${LABEL_PRIORITAS_PENGADUAN[sekarang]} → ${LABEL_PRIORITAS_PENGADUAN[prioritas as PrioritasPengaduan]}${
        catatanBersih === "" ? "" : ` · ${catatanBersih}`
      }`,
    );
    return { ok: true };
  },
});

/**
 * Tambah pesan pada utas pengaduan — APPEND-ONLY, tidak ada sunting/hapus.
 *
 * Pesan dari petugas otomatis menandai penanggung jawab, sehingga antrean tahu
 * siapa yang sedang menangani. Pesan TIDAK mengubah status pengaduan: status
 * tetap dipindahkan lewat `tanganiPengaduan` supaya tiap perubahan keadaan
 * punya alasannya sendiri.
 */
export const tambahPesanPengaduan = mutation({
  args: {
    pengaduanId: v.id("pengaduanNasabah"),
    isi: v.string(),
    /** "petugas" (bawaan) atau "nasabah" bila pesan nasabah dicatat petugas. */
    arah: v.optional(v.string()),
  },
  handler: async (ctx, { pengaduanId, isi, arah }) => {
    const admin = await requireAdmin(ctx);
    const sah = validasiPesanPengaduan(isi);
    if (!sah.ok) throw new Error(sah.alasan);

    const pengaduan = await ctx.db.get(pengaduanId);
    if (pengaduan === null) throw new Error("Pengaduan tidak ditemukan.");

    const arahPesan = arah === "nasabah" ? "nasabah" : "petugas";
    if (
      pengaduan.status === "selesai" ||
      pengaduan.status === "ditolak"
    ) {
      throw new Error(
        "Pengaduan sudah ditutup. Pindahkan kembali ke Ditinjau untuk membalas.",
      );
    }

    const now = Date.now();
    const actor = labelAktor(admin.user);
    const pesanId = await ctx.db.insert("pengaduanPesan", {
      pengaduanId,
      arah: arahPesan,
      isi: isi.trim(),
      penulisUserId: arahPesan === "petugas" ? admin.userId : pengaduan.userId,
      penulisLabel: arahPesan === "petugas" ? actor : "Nasabah (dicatat petugas)",
      dibuatPada: now,
    });

    await ctx.db.patch(pengaduanId, {
      diperbaruiPada: now,
      // Pesan petugas menandai siapa yang menangani — tanpa mengubah status.
      ...(arahPesan === "petugas"
        ? { petugasUserId: admin.userId, petugasLabel: actor }
        : {}),
    });

    await audit(
      ctx,
      admin.userId,
      actor,
      "pesan_pengaduan",
      pengaduan.nomorReferensi ?? "pengaduan umum",
      `Pesan ${arahPesan} (${isi.trim().length} karakter, maks ${PANJANG_MAKS_PESAN_PENGADUAN}).`,
    );

    return { ok: true, pesanId };
  },
});

/* ==================================================================== */
/* Pengaduan sisi NASABAH (helpdesk mandiri)                            */
/* ==================================================================== */

/**
 * Daftar pengaduan MILIK nasabah yang sedang masuk.
 *
 * Hanya baris dengan `userId` milik pemanggil yang dikembalikan — tidak ada
 * parameter id di sini, jadi tidak ada cara meminta pengaduan orang lain.
 * Ringkasan utas ikut dikirim supaya nasabah tahu apakah sudah ada balasan
 * tanpa harus membuka satu per satu.
 */
export const pengaduanSaya = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireNasabahPengaduan(ctx);
    const rows = await ctx.db
      .query("pengaduanNasabah")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(BATAS_KASUS);
    const dipakai = rows.slice(0, BATAS_PENGADUAN_SAYA);

    const hasil = [];
    for (const p of dipakai) {
      const pesan = await ctx.db
        .query("pengaduanPesan")
        .withIndex("by_pengaduan_dibuatPada", (q) => q.eq("pengaduanId", p._id))
        .order("desc")
        .take(BATAS_PESAN_SAYA);
      const terakhir = pesan[0] ?? null;
      const prioritas = prioritasEfektif(p.prioritas);
      hasil.push({
        _id: p._id,
        nomorReferensi: p.nomorReferensi ?? null,
        kanal: p.kanal,
        kategori: p.kategori,
        kategoriLabel:
          LABEL_KATEGORI_PENGADUAN[p.kategori as keyof typeof LABEL_KATEGORI_PENGADUAN] ??
          p.kategori,
        isi: p.isi,
        status: p.status,
        statusLabel:
          LABEL_STATUS_PENGADUAN[p.status as keyof typeof LABEL_STATUS_PENGADUAN] ?? p.status,
        prioritas,
        prioritasLabel: LABEL_PRIORITAS_PENGADUAN[prioritas],
        penyelesaian: p.penyelesaian ?? null,
        dibuatPada: p.dibuatPada,
        diperbaruiPada: p.diperbaruiPada,
        ditutupPada: p.ditutupPada ?? null,
        jumlahPesan: pesan.length,
        pesanTerakhir: terakhir === null ? null : terakhir.isi,
        pesanTerakhirArah: terakhir === null ? null : terakhir.arah,
        pesanTerakhirPada: terakhir === null ? null : terakhir.dibuatPada,
        // Boleh dibalas? Dihitung server supaya UI dan aturan tidak berbeda.
        bolehBalas: bolehBalasPengaduan(p.status).ok,
      });
    }
    return hasil;
  },
});

/** Utas percakapan SATU pengaduan milik nasabah (urut kronologis). */
export const pesanPengaduanSaya = query({
  args: { pengaduanId: v.id("pengaduanNasabah") },
  handler: async (ctx, { pengaduanId }) => {
    const { userId } = await requireNasabahPengaduan(ctx);
    const pengaduan = await ctx.db.get(pengaduanId);
    // Pesan "tidak ditemukan" yang sama untuk pengaduan orang lain: tidak ada
    // informasi apa pun yang bocor tentang keberadaan pengaduan tersebut.
    if (pengaduan === null || pengaduan.userId !== userId) {
      throw new Error("Pengaduan tidak ditemukan.");
    }
    const rows = await ctx.db
      .query("pengaduanPesan")
      .withIndex("by_pengaduan_dibuatPada", (q) => q.eq("pengaduanId", pengaduanId))
      .take(BATAS_KASUS);
    return rows.map((m) => ({
      _id: m._id,
      arah: m.arah,
      isi: m.isi,
      penulisLabel: m.penulisLabel,
      dibuatPada: m.dibuatPada,
    }));
  },
});

/**
 * Buka pengaduan DARI APLIKASI (nasabah sendiri).
 *
 * Berbeda dari `bukaPengaduan` (petugas mencatat keluhan yang masuk lewat
 * WhatsApp/telepon), di sini nasabah adalah penulisnya. Karena itu `kanal`
 * ditetapkan server (`aplikasi`), bukan diterima dari klien — nasabah tidak
 * bisa mengaku-aku dihubungi lewat kanal tertentu, dan laporan kanal tetap
 * bersih.
 */
export const bukaPengaduanSaya = mutation({
  args: {
    kategori: v.string(),
    isi: v.string(),
    loanId: v.optional(v.id("loans")),
  },
  handler: async (ctx, { kategori, isi, loanId }) => {
    const { userId, user } = await requireNasabahPengaduan(ctx);
    if (!(KATEGORI_PENGADUAN as readonly string[]).includes(kategori)) {
      throw new Error(`Kategori pengaduan "${kategori}" tidak dikenali.`);
    }
    const sah = validasiPengaduan(isi);
    if (!sah.ok) throw new Error(sah.alasan);

    let nomorReferensi: string | undefined;
    if (loanId !== undefined) {
      const loan = await ctx.db.get(loanId);
      // Kepemilikan diperiksa di SERVER: pengaduan tidak boleh menempel pada
      // catatan pinjaman orang lain hanya karena id-nya ditebak.
      if (loan === null || loan.userId !== userId) {
        throw new Error("Catatan pinjaman itu bukan milik akun Anda.");
      }
      nomorReferensi = loan.nomorReferensi;
    }

    const now = Date.now();
    const prioritas = prioritasBawaan(kategori);
    const id = await ctx.db.insert("pengaduanNasabah", {
      loanId,
      userId,
      nomorReferensi,
      kanal: KANAL_PENGADUAN_MANDIRI,
      kategori,
      isi: isi.trim(),
      status: "baru",
      prioritas,
      dibuatPada: now,
      diperbaruiPada: now,
    });
    await ctx.db.insert("pengaduanPesan", {
      pengaduanId: id,
      arah: "nasabah",
      isi: isi.trim(),
      penulisUserId: userId,
      penulisLabel: labelNasabahPengaduan(user),
      dibuatPada: now,
    });
    return { ok: true as const, pengaduanId: id };
  },
});

/**
 * Nasabah menambah pesan pada pengaduannya sendiri (append-only).
 *
 * Nasabah TIDAK bisa memindahkan status, menutup, atau menandai selesai —
 * keputusan tetap milik petugas. Yang bisa ia lakukan hanyalah menambah
 * keterangan; itu batas yang disengaja supaya "selesai" selalu berarti ada
 * pihak yang bertanggung jawab menutupnya.
 */
export const balasPengaduanSaya = mutation({
  args: { pengaduanId: v.id("pengaduanNasabah"), isi: v.string() },
  handler: async (ctx, { pengaduanId, isi }) => {
    const { userId, user } = await requireNasabahPengaduan(ctx);
    const pengaduan = await ctx.db.get(pengaduanId);
    if (pengaduan === null || pengaduan.userId !== userId) {
      throw new Error("Pengaduan tidak ditemukan.");
    }
    const sah = validasiPesanPengaduan(isi);
    if (!sah.ok) throw new Error(sah.alasan);
    const boleh = bolehBalasPengaduan(pengaduan.status);
    if (!boleh.ok) throw new Error(boleh.alasan);

    const now = Date.now();
    const pesanId = await ctx.db.insert("pengaduanPesan", {
      pengaduanId,
      arah: "nasabah",
      isi: isi.trim(),
      penulisUserId: userId,
      penulisLabel: labelNasabahPengaduan(user),
      dibuatPada: now,
    });
    await ctx.db.patch(pengaduanId, { diperbaruiPada: now });
    return { ok: true as const, pesanId };
  },
});
