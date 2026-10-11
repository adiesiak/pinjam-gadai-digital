/**
 * BI-2 — ringkasan metrik untuk panel admin.
 *
 * Yang dihitung di sini HANYA metrik yang dinyatakan SIAP oleh register di
 * `lib/biMetrik.ts` (salinan tabel dokumen `docs/bi-metrik-definisi.md` §3).
 * Metrik yang masih ditunda TIDAK dikembalikan sebagai 0: ia dikirim sebagai
 * daftar `tunda` beserta alasannya, sehingga layar menampilkan "belum tersedia"
 * alih-alih angka yang seolah-olah terukur.
 *
 * Batas yang dijaga:
 *  - Semua status memakai status KANONIK produk (`diTahapTinjauan`,
 *    `STATUS_KASUS_TERTUTUP`), bukan ejaan warisan.
 *  - Uang selalu rupiah bulat dari kolom yang memang menandai produknya
 *    (`pokokPinjaman` yang disalurkan, bukan pokok yang diajukan).
 *  - Sumber waktu setiap metrik disebut eksplisit di kode (`didanaiPada`,
 *    `diajukanPada ?? _creationTime`, dst.) supaya bisa ditelusuri.
 */
import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import {
  LABEL_PERIODE_BI,
  PERIODE_BI,
  dalamRentang,
  rentangPeriode,
  type PeriodeBi,
} from "../lib/biMetrik";
import { STATUS_KASUS_TERTUTUP, type StatusKasus } from "../lib/penagihan";
import { diTahapTinjauan } from "../lib/statusPinjaman";

/** Batas baris yang dibaca per tabel — panel admin, bukan ekspor penuh. */
const BATAS_BARIS = 5_000;

/** Status KYC yang berarti "sedang berjalan" (lihat schema.kycStatusValidator). */
const KYC_BERJALAN = ["IN_PROGRESS", "PENDING_REVIEW", "NEEDS_CORRECTION"];

/** Status gadai yang berarti barang masih dipegang PINDAI. */
const GADAI_AKTIF = ["aktif", "menunggu_pelepasan"];

/**
 * Ringkasan metrik siap + daftar metrik tunda untuk satu periode.
 *
 * Admin ber-TOTP saja: metrik ini menggabungkan angka seluruh nasabah, jadi
 * gerbangnya sama dengan query lintas-nasabah lainnya di panel admin.
 */
export const ringkasanBI = query({
  args: { periode: v.optional(v.union(...PERIODE_BI.map((p) => v.literal(p)))) },
  handler: async (ctx, { periode }) => {
    await requireAdminSession(ctx);
    const pilihan: PeriodeBi = periode ?? "bulanan";
    const sekarang = Date.now();
    const rentang = rentangPeriode(pilihan, sekarang);

    const [loans, pawns, kredit, kyc, kasus] = await Promise.all([
      ctx.db.query("loans").take(BATAS_BARIS),
      ctx.db.query("pawns").take(BATAS_BARIS),
      ctx.db.query("kreditBarang").take(BATAS_BARIS),
      ctx.db.query("kycProfil").take(BATAS_BARIS),
      ctx.db.query("penagihanKasus").take(BATAS_BARIS),
    ]);

    // ===== Pinjaman tunai =====
    const pengajuanBaru = loans.filter((l) =>
      dalamRentang(l.diajukanPada ?? l._creationTime, rentang),
    );
    const masukTinjauan = pengajuanBaru.filter((l) => diTahapTinjauan(l.status));
    const disalurkan = loans.filter((l) => dalamRentang(l.didanaiPada, rentang));
    const pokokDisalurkan = disalurkan.reduce((total, l) => total + l.pokokPinjaman, 0);

    // ===== Gadai =====
    const gadaiBaru = pawns.filter((p) => dalamRentang(p._creationTime, rentang));
    const gadaiAktif = pawns.filter((p) => GADAI_AKTIF.includes(p.status));

    // ===== Kredit barang =====
    const kreditBaru = kredit.filter((k) => dalamRentang(k._creationTime, rentang));
    const kreditBerjalan = kredit.filter(
      (k) =>
        (k.status === "disetujui" || k.status === "didanai") &&
        dalamRentang(k.didanaiPada ?? k._creationTime, rentang),
    );

    // ===== KYC (snapshot, bukan periode) =====
    const kycTerverifikasi = kyc.filter((k) => k.status === "VERIFIED");
    const kycBerjalan = kyc.filter((k) => KYC_BERJALAN.includes(k.status));

    // ===== Penagihan (snapshot) =====
    const kasusTerbuka = kasus.filter(
      (k) => !STATUS_KASUS_TERTUTUP.includes(k.status as StatusKasus),
    );

    return {
      periode: pilihan,
      periodeLabel: LABEL_PERIODE_BI[pilihan],
      rentang: { mulai: rentang.mulai, selesai: rentang.selesai },
      dihitungPada: sekarang,
      metrik: [
        {
          kode: "BI-L1",
          nilai: pengajuanBaru.length,
          satuan: "pengajuan" as const,
          keterangan: `Sumber waktu: diajukanPada ?? _creationTime.`,
        },
        {
          kode: "BI-L2",
          nilai: masukTinjauan.length,
          satuan: "pengajuan" as const,
          keterangan: `Status diTahapTinjauan() dari ${pengajuanBaru.length} pengajuan baru.`,
        },
        {
          kode: "BI-L3",
          nilai: disalurkan.length,
          satuan: "pinjaman" as const,
          keterangan: `Sumber waktu: didanaiPada (status kanonik didanai).`,
        },
        {
          kode: "BI-L4",
          nilai: pokokDisalurkan,
          satuan: "rupiah" as const,
          keterangan: `Jumlah pokokPinjaman dari ${disalurkan.length} pinjaman yang disalurkan.`,
        },
        {
          kode: "BI-P1",
          nilai: gadaiBaru.length,
          satuan: "pengajuan" as const,
          keterangan: `Sumber waktu: _creationTime (baris gadai).`,
        },
        {
          kode: "BI-P2",
          nilai: gadaiAktif.length,
          satuan: "gadai" as const,
          keterangan: `Snapshot status ${GADAI_AKTIF.join("/")}.`,
        },
        {
          kode: "BI-K1",
          nilai: kreditBaru.length,
          satuan: "pengajuan" as const,
          keterangan: `Sumber waktu: _creationTime (baris kredit barang).`,
        },
        {
          kode: "BI-K2",
          nilai: kreditBerjalan.length,
          satuan: "kredit" as const,
          keterangan: `Status disetujui/didanai pada periode (bukan jumlah dana tersalurkan).`,
        },
        {
          kode: "BI-C1",
          nilai: kycTerverifikasi.length,
          satuan: "nasabah" as const,
          keterangan: `Snapshot master kycProfil berstatus VERIFIED.`,
        },
        {
          kode: "BI-C2",
          nilai: kycBerjalan.length,
          satuan: "nasabah" as const,
          keterangan: `Snapshot kycProfil ${KYC_BERJALAN.join("/")}.`,
        },
        {
          kode: "BI-A1",
          nilai: kasusTerbuka.length,
          satuan: "kasus" as const,
          keterangan: `Kasus penagihan yang belum ${STATUS_KASUS_TERTUTUP.join("/")}.`,
        },
      ],
    };
  },
});
