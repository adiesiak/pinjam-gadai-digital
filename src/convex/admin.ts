import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";
import { requireAdminSession } from "./adminAuthz";
import {
  pelunasanPinjaman,
  persenBungaHarian,
  quoteLoan,
  quotePinjaman,
  simulasiBulananPinjaman,
} from "../lib/loan";
import { hitungSimulasiBulanan, TENOR_BULANAN_OPTIONS } from "../lib/bulanan";
import { tarifBulananDariConfig } from "../lib/system-config";
import {
  AKUN_PLATFORM_DIRECT_REVENUE,
  AKUN_PLATFORM_SPREAD,
  ledgerTotals,
  appendJournal,
} from "./ledger";
import { JournalSpec } from "./ledger";
import { formatRupiah } from "../lib/money";
import { periksaBerkasIdentitasStorage } from "./berkasIdentitas";
import { namaHurufBesar, namaTampil } from "../lib/nama";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import { bagiHasilPinjamanDari } from "../lib/bagiHasil";
import { getConfig, audit } from "./system";
import { jarakKm } from "../lib/geo";
import { LOKASI_KEBIJAKAN } from "../lib/lokasi";
import {
  apakahPelunasanTepatWaktu,
  clampPlafon,
  perilakuDariRiwayat,
  plafonEfektifDariPerilaku,
  ringkasPlafon,
  skorPerilaku,
} from "../lib/plafon";
import { clampPersenBunga, persenBungaEfektif } from "../lib/bunga";
import {
  kanalAktif,
  kanalWhatsappAktif,
  pengingatTagihanAktif,
} from "../lib/preferensiNotifikasi";
import { profilRisiko } from "../lib/risikoNasabah";
import { simpanDataDiriProfil, bacaProfilUntukForm } from "./dataDiriProfil";
import { ensureKodePeminjam } from "./peminjamCode";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";
import { hapusTurunanAkun, totalTurunanAkun } from "./hapusAkunTurunan";
import { userIdAkunUji } from "./akunUjiInternal";
import { tautanBerkas } from "./berkas";
import { quoteKreditBarang } from "../lib/kredit";
import { STATUS_MENUNGGU } from "../lib/admin-queue";
import {
  AMBANG_PENGHASILAN_RISIKO,
  HARI_TREN,
  MS_HARI,
} from "../lib/analitikAdmin";
import { statusKanonik } from "../lib/statusPinjaman";
import {
  simpanPersetujuanGadai,
  simpanPersetujuanPinjaman,
  validasiDataTandaTangan,
} from "./kontrakPersetujuan";
import type { Doc, Id } from "./_generated/dataModel";
import {
  kelompokkanJurnalYatim,
  ringkasJurnalYatim,
  subjekAkun,
} from "../lib/ledgerYatim";

/** Gerbang admin — semua query/mutation di file ini dijaga. */
async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

/** Tautan bukti TTD manual; null bila rahasia tautan belum disetel. */
async function tautanKontrakManual(
  id: Parameters<typeof tautanBerkas>[0],
): Promise<string | null> {
  try {
    return await tautanBerkas(id);
  } catch {
    return null;
  }
}

// ===== Plafon pinjaman per nasabah (lihat lib/plafon.ts) =====

/**
 * Daftar nasabah + plafon efektifnya — untuk panel atur plafon.
 *
 * Memuat SEMUA akun nasabah, termasuk yang belum pernah mengajukan apa pun:
 * akun seperti itu sudah tampil di pemilih Mode Nasabah dan plafon awalnya
 * tetap perlu bisa dibaca serta diatur. Dulu daftar ini hanya berisi pemilik
 * catatan pinjaman/kredit, sehingga kedua layar berbeda jumlah. Akun pendana,
 * pemantau, admin, dan sesi anonim tidak ikut.
 */
export const daftarPlafonPeminjam = query({
  args: { cari: v.optional(v.string()) },
  handler: async (ctx, { cari }) => {
    await requireAdmin(ctx);
    const cfg = await getConfig(ctx);
    const kata = cari?.trim().toLowerCase() ?? "";

    const loans = await ctx.db.query("loans").collect();
    const kredits = await ctx.db.query("kreditBarang").collect();
    // Eksposur syariah ikut menahan plafon di kartu peminjam
    // (`plafonDenganEksposurSyariah`). Daftar admin harus memakai aturan yang
    // sama; tanpa itu baris admin bisa menampilkan sisa Rp1 juta padahal
    // peminjam melihat Rp0 karena akad/pengajuan syariah masih berjalan.
    const akadSyariah = await ctx.db.query("akadSyariah").collect();
    const pengajuanSyariah = await ctx.db.query("pengajuanSyariah").collect();
    const eksposurSyariahPerUser = new Map<
      string,
      Array<{ status: string; pokokPinjaman: number }>
    >();
    const tambahEksposur = (userId: string, pokok: number) => {
      if (!Number.isSafeInteger(pokok) || pokok <= 0) return;
      const rows = eksposurSyariahPerUser.get(userId) ?? [];
      rows.push({ status: "didanai", pokokPinjaman: pokok });
      eksposurSyariahPerUser.set(userId, rows);
    };
    for (const row of akadSyariah) {
      if (row.status === "aktif" && row.peminjamId !== undefined) {
        tambahEksposur(row.peminjamId, row.pokok);
      }
    }
    for (const row of pengajuanSyariah) {
      if (row.status === "disetujui" && row.akadNomor === undefined) {
        tambahEksposur(row.userId, row.pokok);
      }
    }
    // Data diri disimpan satu baris per pengguna; dipakai untuk menandai kartu
    // nasabah yang sudah/belum dilengkapi tanpa membuka dialognya dulu.
    const profil = await ctx.db.query("nasabahProfil").collect();
    const adaDataDiri = new Set<string>();
    const adaFotoKtp = new Set<string>();
    const namaDataDiriPerUser = new Map<string, string>();
    for (const p of profil) {
      adaDataDiri.add(p.userId);
      if (p.namaLengkap.trim() !== "") namaDataDiriPerUser.set(p.userId, p.namaLengkap);
      if (p.fotoKtpId !== undefined) adaFotoKtp.add(p.userId);
    }
    // Kelengkapan data diri & status KYC untuk penilaian risiko per nasabah.
    // Dibaca SEKALI di luar loop supaya daftar 100 baris tidak memicu 100 query.
    const dataDiriLengkap = new Set<string>();
    for (const p of profil) {
      if (
        p.nik.trim().length > 0 &&
        (p.alamat ?? "").trim().length > 0 &&
        (p.namaBank ?? "").trim().length > 0 &&
        (p.nomorRekening ?? "").trim().length > 0
      ) {
        dataDiriLengkap.add(p.userId);
      }
    }
    const kycTerverifikasi = new Set<string>();
    for (const k of await ctx.db.query("kycProfil").collect()) {
      if (k.status === "VERIFIED") kycTerverifikasi.add(k.userId);
    }
    /** Acuan waktu penilaian risiko — sama untuk seluruh baris dalam satu muatan. */
    const sekarang = Date.now();
    const tarifDenda = (await getConfig(ctx)).persenDendaKeterlambatan;
    const pelunasanTepatWaktuPerUser = new Map<string, number>();
    for (const loan of loans) {
      if (!apakahPelunasanTepatWaktu(loan)) continue;
      pelunasanTepatWaktuPerUser.set(
        loan.userId,
        (pelunasanTepatWaktuPerUser.get(loan.userId) ?? 0) + 1,
      );
    }
    const semuaUser = await ctx.db.query("users").collect();
    const userPer = new Map(semuaUser.map((u) => [u._id, u]));
    const idNasabah = new Set<string>();
    for (const l of loans) idNasabah.add(l.userId);
    for (const k of kredits) idNasabah.add(k.userId);
    for (const u of semuaUser) {
      if (u.isAnonymous === true) continue;
      if (u.role === undefined || u.role === ROLES.PEMINJAM) idNasabah.add(u._id);
    }

    // Nama peminjam mengikuti CATATAN PINJAMAN (`loans.namaLengkap` /
    // `kreditBarang.namaLengkap`) — sumber yang sama dengan baris di ruang
    // penyedia dana — supaya orang yang sama tidak tampil beda nama di dua layar.
    // Bila punya beberapa catatan, yang TERBARU dipakai. Data diri jadi cadangan,
    // lalu nama akun, lalu email.
    const namaPinjamanPerUser = new Map<string, { nama: string; waktu: number }>();
    const catatNama = (userId: string, nama: string | undefined, waktu: number) => {
      if (nama === undefined || nama.trim() === "") return;
      const ada = namaPinjamanPerUser.get(userId);
      if (ada === undefined || waktu > ada.waktu) namaPinjamanPerUser.set(userId, { nama, waktu });
    };
    for (const l of loans) catatNama(l.userId, l.namaLengkap, l.diajukanPada ?? l._creationTime);
    for (const k of kredits) catatNama(k.userId, k.namaLengkap, k._creationTime);

    const hasil: Array<{
      userId: string;
      nama: string;
      email: string | null;
      plafonPribadi: number | null;
      plafonEfektif: number;
      /** Pokok pinjaman aktif/terutang yang menahan plafon (server). */
      plafonTerpakai: number;
      /** Sisa plafon yang masih dapat diajukan (server). */
      plafonTersedia: number;
      persenBungaPribadi: number | null;
      persenBungaEfektif: number;
      jumlahPelunasanTepatWaktu: number;
      /** Skor perilaku bayar 0–100 (bukan skor kredit pihak ketiga). */
      skorPerilaku: number;
      perilaku: {
        tepatWaktu: number;
        terlambat: number;
        menunggak: number;
        berjalan: number;
      };
      jumlahPengajuan: number;
      pinjamanAktif: number;
      /** true bila admin sudah pernah mengisi data diri nasabah ini. */
      adaDataDiri: boolean;
      /** true bila foto KTP nasabah ini sudah tersimpan. */
      adaFotoKtp: boolean;
      /** Grade risiko A–E dari model yang sama dengan detail nasabah. */
      risikoGrade: string;
      risikoSkor: number;
      risikoKategori: string;
      /** false = belum ada riwayat, jadi belum layak diberi grade penilaian. */
      risikoDinilai: boolean;
      /** Pengingat tagihan WhatsApp tersimpan untuk nasabah ini. */
      notifWhatsapp: boolean;
      /** Pengingat tagihan email tersimpan untuk nasabah ini. */
      notifEmail: boolean;
      /** true hanya bila kedua kanal menyala — keadaan tombol cepat tagihan. */
      notifTagihanAktif: boolean;
    }> = [];
    for (const id of idNasabah) {
      // Dibaca dari peta yang sudah dimuat di atas: menambah seluruh akun
      // nasabah tidak boleh berubah menjadi satu query per baris.
      const user = userPer.get(id as Id<"users">);
      if (user === undefined) continue;
      const pinjamanUser = loans.filter((l) => l.userId === id);
      const kreditUser = kredits.filter((k) => k.userId === id);
      // Grade risiko memakai MODEL YANG SAMA dengan detail nasabah
      // (`profilRisiko` murni + turunan pelunasan), sehingga angka di tabel dan
      // di dialog profil tidak pernah berbeda untuk orang yang sama.
      const risikoNasabah = profilRisiko(
        pinjamanUser.map((l) => {
          const info = pelunasanPinjaman(
            {
              pokokPinjaman: l.pokokPinjaman,
              status: l.status,
              tenorHari: l.tenorHari,
              tenorBulan: l.tenorBulan,
              didanaiPada: l.didanaiPada,
              persenBunga: l.persenBunga,
            },
            sekarang,
            tarifDenda,
          );
          return {
            status: l.status,
            hariTerlambat: info?.hariTerlambat ?? 0,
            tepatWaktu: apakahPelunasanTepatWaktu(l),
          };
        }),
        {
          dataDiriLengkap: dataDiriLengkap.has(id),
          kycTerverifikasi: kycTerverifikasi.has(id),
        },
      );
      const nama = namaTampil(
        [
          namaPinjamanPerUser.get(id)?.nama,
          namaDataDiriPerUser.get(id),
          user.name,
          user.email,
        ],
        "Peminjam",
      );
      if (
        kata !== "" &&
        !nama.toLowerCase().includes(kata) &&
        !(user.email ?? "").toLowerCase().includes(kata)
      ) {
        continue;
      }
      const perilaku = perilakuDariRiwayat(pinjamanUser, sekarang);
      const plafonEfektifNilai = plafonEfektifDariPerilaku(
        user.plafonPinjaman,
        cfg.plafonPinjaman,
        perilaku,
      );
      // Maksimal/terpakai/tersedia dihitung di SERVER dari master + pinjaman
      // aktif, supaya panel dan validasi pengajuan tidak mungkin berbeda angka.
      const ringkas = ringkasPlafon(plafonEfektifNilai, [
        ...pinjamanUser,
        ...(eksposurSyariahPerUser.get(id) ?? []),
      ]);
      // Keadaan pengingat tagihan dibaca di server supaya tombol cepat di tiap
      // baris tahu apakah ia akan mematikan atau menyalakan sesuatu. Aturan
      // kosong-berarti-aktif sama dengan pengirim pengingat (`_kanalAktif`).
      const notifWhatsapp = kanalWhatsappAktif(
        user.whatsappNotificationEnabled,
        user.notifWhatsapp,
      );
      const notifEmail = kanalAktif(user.notifEmail);
      hasil.push({
        userId: id,
        nama,
        email: user.email ?? null,
        plafonPribadi: user.plafonPinjaman ?? null,
        plafonEfektif: plafonEfektifNilai,
        plafonTerpakai: ringkas.terpakai,
        plafonTersedia: ringkas.tersedia,
        persenBungaPribadi: user.persenBunga ?? null,
        persenBungaEfektif: persenBungaEfektif(user.persenBunga, cfg.persenBunga),
        jumlahPelunasanTepatWaktu: pelunasanTepatWaktuPerUser.get(id) ?? 0,
        skorPerilaku: skorPerilaku(perilaku),
        perilaku,
        jumlahPengajuan: pinjamanUser.length + kreditUser.length,
        pinjamanAktif: pinjamanUser.filter((l) => l.status === "didanai").length,
        adaDataDiri: adaDataDiri.has(id),
        adaFotoKtp: adaFotoKtp.has(id),
        risikoGrade: risikoNasabah.grade,
        risikoSkor: risikoNasabah.skor,
        risikoKategori: risikoNasabah.kategori,
        risikoDinilai: risikoNasabah.dinilai,
        notifWhatsapp,
        notifEmail,
        notifTagihanAktif: pengingatTagihanAktif(notifWhatsapp, notifEmail),
      });
    }
    hasil.sort((a, b) => b.jumlahPengajuan - a.jumlahPengajuan || a.nama.localeCompare(b.nama));
    return {
      default: cfg.plafonPinjaman,
      defaultBunga: cfg.persenBunga,
      rows: hasil.slice(0, 100),
    };
  },
});

/**
 * Naikkan/turunkan plafon satu nasabah — admin.
 * `plafon: null` mengembalikan nasabah ke default progresif berdasarkan
 * pelunasan tunai tepat waktu. Setiap
 * perubahan masuk audit trail (append-only) karena ini keputusan kredit.
 */
export const setPlafonPeminjam = mutation({
  args: {
    userId: v.id("users"),
    /** Rupiah bulat di rentang PLAFON_BATAS, atau null = kembali ke plafon dasar. */
    plafon: v.union(v.number(), v.null()),
    /** Alasan keputusan (disarankan) — masuk audit trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { userId, plafon, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");
    if (target.role === ROLES.ADMIN) {
      throw new Error("Plafon tidak berlaku untuk akun tim (admin).");
    }

    const cfg = await getConfig(ctx);
    const nilaiBaru = plafon === null ? null : clampPlafon(plafon);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const jumlahPelunasanTepatWaktu = loans.filter(apakahPelunasanTepatWaktu).length;
    const perilaku = perilakuDariRiwayat(loans, Date.now());
    const sebelumnya = plafonEfektifDariPerilaku(
      target.plafonPinjaman,
      cfg.plafonPinjaman,
      perilaku,
    );
    const sesudah = plafonEfektifDariPerilaku(
      nilaiBaru,
      cfg.plafonPinjaman,
      perilaku,
    );

    await ctx.db.patch(userId, { plafonPinjaman: nilaiBaru ?? undefined });
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_plafon",
      target.name ?? target.email ?? userId,
      `Plafon ${formatRupiah(sebelumnya)} → ${formatRupiah(sesudah)}${
        nilaiBaru === null
          ? jumlahPelunasanTepatWaktu > 0
            ? " (kembali ke plafon progresif berdasarkan pelunasan tepat waktu)"
            : " (kembali ke default global)"
          : " (khusus nasabah ini)"
      }${alasan?.trim() ? ` — ${alasan.trim()}` : ""}`,
    );
    return { ok: true, plafonEfektif: sesudah };
  },
});

/**
 * Tetapkan bunga pinjaman khusus satu nasabah (persen, 0–100) — admin.
 * `persenBunga: null` mengembalikan nasabah ke default global Pengaturan
 * Sistem. Pengajuan yang belum cair (belum didanai/lunas) ikut diperbarui;
 * pinjaman yang sudah cair tetap memakai snapshot bunganya. Setiap perubahan
 * masuk audit trail karena ini keputusan harga kredit.
 */
export const setBungaPeminjam = mutation({
  args: {
    userId: v.id("users"),
    /** Persen bunga (0–100) di rentang BUNGA_BATAS, atau null = default global. */
    persenBunga: v.union(v.number(), v.null()),
    /** Alasan keputusan (disarankan) — masuk audit trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { userId, persenBunga, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");
    if (target.role === ROLES.ADMIN) {
      throw new Error("Bunga tidak berlaku untuk akun tim (admin).");
    }

    const cfg = await getConfig(ctx);
    const nilaiBaru = persenBunga === null ? null : clampPersenBunga(persenBunga);
    const sebelumnya = persenBungaEfektif(target.persenBunga, cfg.persenBunga);
    const sesudah = persenBungaEfektif(nilaiBaru, cfg.persenBunga);

    await ctx.db.patch(userId, { persenBunga: nilaiBaru ?? undefined });

    // Pengajuan berjalan ikut memakai bunga baru; pinjaman yang sudah cair
    // (didanai/lunas) tetap memakai snapshotnya agar angka tidak berubah.
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    let pengajuanDiperbarui = 0;
    for (const l of loans) {
      if (l.status === "didanai" || l.status === "lunas") continue;
      // Menghapus override tidak boleh menjatuhkan pengajuan harian ke tarif
      // global lama 30%: kembalikan ke tarif matriks yang berlaku untuk
      // nominal/tenornya. Skema bulanan tetap memakai tarif akun per bulan.
      // Kombinasi data lama yang tidak ada di matriks (mis. tenor 30 hari)
      // memakai tarif akun, bukan tarif tenor lain yang akan menyesatkan.
      const bungaReset =
        l.tenorBulan === undefined
          ? persenBungaHarian(l.pokokPinjaman, l.tenorHari ?? 28) ?? cfg.persenBunga
          : cfg.persenBunga;
      await ctx.db.patch(l._id, { persenBunga: nilaiBaru ?? bungaReset });
      pengajuanDiperbarui += 1;
    }

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_bunga",
      target.name ?? target.email ?? userId,
      `Bunga ${sebelumnya}% → ${sesudah}%${
        nilaiBaru === null ? " (kembali ke default global)" : " (khusus nasabah ini)"
      }; ${pengajuanDiperbarui} pengajuan berjalan diperbarui` +
        `${alasan?.trim() ? ` — ${alasan.trim()}` : ""}`,
    );
    return { ok: true, persenBunga: sesudah, pengajuanDiperbarui };
  },
});

// ===== Data diri nasabah (diisi & disunting admin; lihat lib/dataDiri.ts) =====

/**
 * Data diri satu nasabah untuk form admin — admin saja.
 *
 * Mengembalikan isian siap-pakai (kosong bila belum pernah diisi) plus URL
 * foto KTP yang sudah tersimpan, sehingga form bisa menampilkan kondisi nyata
 * alih-alih menebak. URL bertanda tangan dan berumur pendek.
 */
export const dataDiriNasabah = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Pengguna tidak ditemukan.");
    const row = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      nama: user.name ?? user.email ?? "Peminjam",
      email: user.email ?? null,
      /** true bila baris data diri sudah ada. */
      ada: row !== null,
      // Nama prefil dari akun agar admin tidak mengetik ulang dari nol; sisanya
      // lewat helper yang sama dengan jalur sunting mandiri nasabah.
      data: {
        ...bacaProfilUntukForm(row),
        namaLengkap: row?.namaLengkap ?? user.name ?? "",
      },
      fotoKtpUrl: await tautanBerkas(row?.fotoKtpId),
      diperbaruiPada: row?.diperbaruiPada ?? null,
      diperbaruiOlehLabel: row?.diperbaruiOlehLabel ?? null,
      /** Siapa yang terakhir menyunting (null untuk data lama). */
      sumber: row?.sumber ?? null,
      /**
       * PUTUSAN verifikasi identitas petugas, atau null bila belum ada putusan.
       * Terpisah dari keputusan pinjaman; `null` berarti "belum diverifikasi",
       * BUKAN "dokumen belum diunggah".
       */
      verifikasiIdentitas: row?.verifikasiIdentitas ?? null,
    };
  },
});

/**
 * Catat PUTUSAN verifikasi identitas seorang nasabah — admin saja.
 *
 * Sengaja berdiri sendiri dari keputusan pinjaman: menyetujui pengajuan TIDAK
 * mengisi putusan ini, dan mengisi putusan ini TIDAK mengubah status pinjaman
 * mana pun. Jadi "dokumen sudah diunggah" tidak pernah disamakan dengan
 * "identitas sudah terverifikasi".
 *
 * Catatan wajib saat status `ditolak` supaya penolakan punya alasan yang bisa
 * ditindaklanjuti nasabah. Setiap putusan tercatat di audit trail.
 */
export const verifikasiIdentitasNasabah = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("terverifikasi"), v.literal("ditolak")),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, { userId, status, catatan }) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");
    if (target.role === ROLES.ADMIN) {
      throw new Error("Verifikasi identitas tidak berlaku untuk akun tim (admin).");
    }
    const row = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row === null) {
      throw new Error(
        "Data diri nasabah belum ada. Isi data diri dulu, baru catat putusan verifikasi identitas.",
      );
    }
    const bersih = (catatan ?? "").trim();
    if (bersih.length > 300) {
      throw new Error("Catatan verifikasi maksimal 300 karakter.");
    }
    if (status === "ditolak" && bersih.length < 3) {
      throw new Error("Alasan penolakan verifikasi wajib diisi (minimal 3 karakter).");
    }

    const olehLabel = admin.email ?? admin.name ?? "admin";
    await ctx.db.patch(row._id, {
      verifikasiIdentitas: {
        status,
        pada: Date.now(),
        olehLabel,
        ...(bersih === "" ? {} : { catatan: bersih }),
      },
    });

    const nama = target.name ?? target.email ?? userId;
    await audit(
      ctx,
      adminId,
      olehLabel,
      status === "terverifikasi" ? "verifikasi_identitas" : "verifikasi_identitas_ditolak",
      nama,
      `${status === "terverifikasi" ? "Identitas ditandai terverifikasi" : "Verifikasi identitas ditolak"} ` +
        `(NIK ${row.nik.slice(0, 4)}••••${row.nik.slice(-4)}). Keputusan ini terpisah dari ` +
        `keputusan pinjaman.` +
        (bersih === "" ? "" : ` Catatan: ${bersih}`),
    );
    return { ok: true };
  },
});

/** URL unggah satu berkas foto KTP data diri — admin saja. */
export const generateDataDiriUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Isi/perbarui data diri satu nasabah — admin.
 *
 * Validasi memakai `bacaDataDiri()` yang sama dengan form (satu sumber aturan),
 * jadi nilai yang tersimpan sudah dinormalkan (digit NIK/WA/rekening, angka
 * penghasilan). Foto KTP lama dihapus dari storage saat diganti atau
 * dikosongkan agar tidak menumpuk berkas yatim. Setiap perubahan masuk audit
 * trail.
 */
export const simpanDataDiriNasabah = mutation({
  args: {
    userId: v.id("users"),
    namaLengkap: v.string(),
    nik: v.string(),
    nomorWhatsApp: v.string(),
    alamat: v.string(),
    pekerjaan: v.string(),
    /** Rupiah bulat, atau null bila kosong. */
    penghasilanBulanan: v.union(v.number(), v.null()),
    namaBank: v.string(),
    nomorRekening: v.string(),
    /**
     * Perubahan foto KTP: id = pasang/ganti, null = kosongkan, tidak dikirim =
     * biarkan apa adanya. Dipisah begini supaya menyimpan data diri tanpa
     * menyentuh foto tidak pernah menghapusnya tanpa sengaja.
     */
    fotoKtpId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");
    if (target.role === ROLES.ADMIN) {
      throw new Error("Data diri tidak berlaku untuk akun tim (admin).");
    }

    // Validasi, normalisasi, dan penanganan foto ada di satu tempat bersama
    // jalur sunting mandiri nasabah (convex/dataDiriProfil.ts).
    const { dibuat, tersimpan, fotoKtpId, verifikasiDireset } = await simpanDataDiriProfil(ctx, {
      userId: args.userId,
      isian: {
        namaLengkap: args.namaLengkap,
        nik: args.nik,
        nomorWhatsApp: args.nomorWhatsApp,
        alamat: args.alamat,
        pekerjaan: args.pekerjaan,
        penghasilanBulanan: args.penghasilanBulanan,
        namaBank: args.namaBank,
        nomorRekening: args.nomorRekening,
      },
      fotoKtpId: args.fotoKtpId,
      sumber: "admin",
      olehLabel: admin.email ?? admin.name ?? "admin",
    });

    const nama = target.name ?? target.email ?? args.userId;
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_data_diri",
      nama,
      `${dibuat ? "Data diri dibuat" : "Data diri diperbarui"}: ` +
        `NIK ${tersimpan.nik.slice(0, 4)}••••${tersimpan.nik.slice(-4)}, ` +
        `WA ${tersimpan.nomorWhatsApp}` +
        (tersimpan.alamat === null ? ", alamat kosong" : ", alamat terisi") +
        (tersimpan.penghasilanBulanan === null
          ? ", penghasilan kosong"
          : `, penghasilan ${formatRupiah(tersimpan.penghasilanBulanan)}`) +
        (fotoKtpId === undefined ? ", tanpa foto KTP" : ", foto KTP tersimpan") +
        (verifikasiDireset
          ? ". Putusan verifikasi identitas DIHAPUS karena nama/NIK/foto KTP berubah."
          : ""),
    );
    return { ok: true };
  },
});

/**
 * Hapus AKUN satu nasabah — admin.
 *
 * Hanya akun yang dihapus; pengajuan (pinjaman/gadai/kredit barang) dan
 * jurnalnya sengaja DIBIARKAN UTUH agar riwayat keuangan tidak hilang.
 * Baris turunan akun yang tak lagi bermakna tanpa penggunanya (sesi auth,
 * MFA, consent lokasi, status/perangkat lokasi, sesi bersama) ikut
 * dibersihkan. Akun tim (admin) tidak dapat dihapus dari jalur ini.
 */
export const hapusNasabah = mutation({
  args: {
    userId: v.id("users"),
    /** Catatan penghapusan opsional — penghapusan tidak boleh tertahan kolom alasan. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { userId, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");
    if (target.role === ROLES.ADMIN) {
      throw new Error("Akun tim (admin) tidak dapat dihapus dari sini.");
    }
    // Catatan tidak wajib; batas atas dijaga agar audit tetap terbaca.
    const bersih = (alasan ?? "").trim();
    if (bersih.length > 500) {
      throw new Error("Catatan penghapusan maksimal 500 karakter.");
    }
    const nama = target.name ?? target.email ?? userId;

    // Baris turunan akun (bukan riwayat keuangan): kredensial & sesi auth, MFA,
    // consent & status lokasi, perangkat terdaftar, sesi internal, jejak
    // lokasi, dan data diri. Satu helper bersama jalur penggabungan nasabah.
    const turunan = await hapusTurunanAkun(ctx, userId);

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "nasabah_delete",
      nama,
      `Akun nasabah dihapus (pengajuan & riwayat keuangan dibiarkan utuh); ` +
        `${turunan.akunAuth} akun auth, ${turunan.sesiAuth} sesi auth, ` +
        `${totalTurunanAkun(turunan)} baris turunan dibersihkan${bersih === "" ? "" : `; alasan: ${bersih}`}`,
    );

    await ctx.db.delete(userId);
    return { ok: true, nama };
  },
});

/**
 * Query gabungan untuk halaman admin: profil sendiri (untuk deteksi halaman)
 * plus antrean pengajuan. Digunakan juga oleh nasabah — untuk mereka
 * `isAdmin` false dan antrean selalu kosong, sehingga halaman admin bisa
 * mengandalkan satu query ini tanpa membocorkan apa pun.
 */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const loans = await ctx.db.query("loans").collect();
    const pawns = await ctx.db.query("pawns").collect();

    // Nama pendana dibaca dari AKUN-nya, bukan dari salinan `pendanaNama` yang
    // tersimpan saat penetapan. Dengan begitu panel admin dan /penyedia-dana
    // (yang juga membaca akun lewat `loans.pendanaId`) selalu menampilkan nama
    // yang sama, walau nama akun pendana berubah setelah penetapan. Salinan
    // tersimpan hanya dipakai untuk baris warisan tanpa `pendanaId`.
    const namaPendanaCache = new Map<string, string | null>();
    const namaPendanaAkun = async (
      userId: Id<"users">,
      cadangan: string | null,
    ): Promise<string | null> => {
      if (namaPendanaCache.has(userId)) return namaPendanaCache.get(userId) ?? null;
      const akun = await ctx.db.get(userId);
      const nama = akun?.name?.trim() || akun?.email || cadangan || null;
      namaPendanaCache.set(userId, nama);
      return nama;
    };

    const tarifDenda = (await getConfig(ctx)).persenDendaKeterlambatan;
    const loanRows = await Promise.all(
      loans
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (l) => {
          const borrower = await ctx.db.get(l.userId);
          const pelunasan = pelunasanPinjaman(l, Date.now(), tarifDenda);
          // Skema bulanan (tenorBulan 1/3/6+): angka dari engine lib/bulanan —
          // bukan 130% — agar tim menelaah kewajiban yang benar.
          const bulanan =
            l.tenorBulan !== undefined
              ? simulasiBulananPinjaman({ ...l, tenorBulan: l.tenorBulan })
              : null;
          const harian = bulanan === null ? quotePinjaman(l) : null;
          return {
            _id: l._id,
            _creationTime: l._creationTime,
            nomorReferensi: l.nomorReferensi,
            pokokPinjaman: l.pokokPinjaman,
            pokokDiajukan: l.pokokDiajukan ?? l.pokokPinjaman,
            persenBunga: l.persenBunga ?? null,
            // Tarif matriks asal pinjaman berpromo — dasar hak penyedia dana.
            promoBungaPersenNormal: l.promoBungaPersenNormal ?? null,
            promoBungaNama: l.promoBungaNama ?? null,
            promoDiskonAdmin: l.promoDiskonAdmin ?? null,
            // Null = data lama yang dulu selalu dikenai biaya ekspres.
            cairEkspres: l.cairEkspres ?? null,
            tarifBiaya: l.tarifBiaya ?? null,
            tujuan: l.tujuan,
            status: l.status,
            catatanReview: l.catatanReview,
            namaLengkap: l.namaLengkap,
            nomorRekening: l.nomorRekening,
            namaBank: l.namaBank ?? null,
            catatanPeminjam: l.catatanPeminjam,
            emailPeminjam: borrower?.email ?? null,
            userIdPeminjam: l.userId,
            // Model 1 pinjaman = 1 pendana — dipakai dialog review admin untuk
            // menampilkan/mengganti siapa penyedia dana pinjaman ini.
            pendanaId: l.pendanaId ?? null,
            pendanaNama:
              l.pendanaId !== undefined
                ? await namaPendanaAkun(l.pendanaId, l.pendanaNama ?? null)
                : l.pendanaNama ?? null,
            tenorHari: l.tenorHari ?? null,
            tenorBulan: l.tenorBulan ?? null,
            cicilanPerBulan: bulanan?.cicilanPerBulan ?? null,
            biayaLayananTotal: bulanan?.biayaLayananTotal ?? null,
            imbalHasilTotal: bulanan?.bungaTotal ?? harian?.bunga ?? null,
            totalKewajiban: bulanan?.totalPengembalian ?? harian?.totalKewajibanPelunasan ?? null,
            // KYC & lokasi (opsional untuk data warisan)
            nik: l.nik ?? null,
            nomorWhatsApp: l.nomorWhatsApp ?? null,
            penghasilanBulanan: l.penghasilanBulanan ?? null,
            sumberPenghasilan: l.sumberPenghasilan ?? null,
            dokKtpId: l.dokKtpId ?? null,
            dokSelfieKtpId: l.dokSelfieKtpId ?? null,
            dokSlipGajiId: l.dokSlipGajiId ?? null,
            lokasiAjukan: l.lokasiAjukan ?? null,
            // Status perjanjian dibaca panel review admin. Tanpa ini, panel
            // selalu menulis "Belum ada" walau peminjam sudah menandatangani.
            tandaTanganAda: l.tandaTanganPeminjam !== undefined,
            tandaTanganPada: l.tandaTanganPada ?? null,
            persetujuanSyaratPada: l.persetujuanSyaratPada ?? null,
            persetujuanSyaratVersi: l.persetujuanSyaratVersi ?? null,
            persetujuanMode: l.persetujuanMode ?? null,
            // Persetujuan saat MENGAJUKAN berbeda dari persetujuan perjanjian;
            // panel menampilkan keduanya agar tidak terkesan hilang.
            persetujuanPengajuanPada: l.persetujuanPengajuanPada ?? null,
            persetujuanPengajuanVersi: l.persetujuanPengajuanVersi ?? null,
            ttdManualPada: l.ttdManualPada ?? null,
            ttdManualOleh: l.ttdManualOleh ?? null,
            ttdManualAda: l.ttdManualBerkasId !== undefined,
            jatuhTempoPada: pelunasan?.jatuhTempoPada ?? null,
            sisaHari: pelunasan?.sisaHari ?? null,
            hariTerlambat: pelunasan?.hariTerlambat ?? null,
            dendaTerlambat: pelunasan?.dendaTerlambat ?? null,
            totalKewajibanDenganPenalti: pelunasan?.totalKewajibanDenganPenalti ?? null,
          };
        }),
    );

    const pawnRows = await Promise.all(
      pawns
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (p) => {
          const borrower = await ctx.db.get(p.userId);
          return {
            _id: p._id,
            _creationTime: p._creationTime,
            nomorReferensi: p.nomorReferensi,
            deskripsiBarang: p.deskripsiBarang,
            kategori: p.kategori,
            alamatPenilaian: p.alamatPenilaian,
            status: p.status,
            nilaiTaksiran: p.nilaiTaksiran,
            hargaPasar: p.hargaPasar ?? null,
            kondisiFisik: p.kondisiFisik ?? null,
            kodeRakVault: p.kodeRakVault ?? null,
            catatanReview: p.catatanReview,
            namaLengkap: p.namaLengkap,
            nomorRekening: p.nomorRekening,
            namaBank: p.namaBank ?? null,
            catatanPeminjam: p.catatanPeminjam,
            emailPeminjam: borrower?.email ?? null,
            // Dipakai panel review untuk membuka data diri tersimpan pemohon.
            userIdPeminjam: p.userId,
            // Skema B: pendanaan & sisa pokok berjalan (decreasing principal).
            pokokGadai: p.pokokGadai,
            persenSewaModal: p.persenSewaModal,
            sisaPokok: p.sisaPokok,
            // Model 1 gadai = 1 pendana. Nama akun dipakai agar panel admin
            // menampilkan pemilik yang sama dengan saat ditetapkan.
            pendanaId: p.pendanaId ?? null,
            pendanaNama:
              p.pendanaId !== undefined
                ? await namaPendanaAkun(p.pendanaId, p.pendanaNama ?? null)
                : p.pendanaNama ?? null,
            dicairkanPada: p.dicairkanPada,
            // Status perjanjian gadai ikut dikirim supaya antrean bisa menghitung
            // "disetujui tetapi belum TTD" tanpa membuka setiap baris.
            nomorWhatsApp: borrower?.nomorWhatsApp ?? null,
            tandaTanganAda: p.tandaTanganPeminjam !== undefined,
            tandaTanganPada: p.tandaTanganPada ?? null,
            persetujuanSyaratPada: p.persetujuanSyaratPada ?? null,
            persetujuanSyaratVersi: p.persetujuanSyaratVersi ?? null,
            persetujuanMode: p.persetujuanMode ?? null,
            ttdManualPada: p.ttdManualPada ?? null,
            ttdManualOleh: p.ttdManualOleh ?? null,
            ttdManualAda: p.ttdManualBerkasId !== undefined,
          };
        }),
    );

    // Ringkasan pengajuan kredit barang (Skema C) untuk penghitung tab admin;
    // rincian lengkap dibaca panel verifikasi lewat api.kredit.antreanKreditBarang.
    // Baris mentahnya disimpan: agregat di bawah memakainya, bukan membaca ulang.
    const kreditMentah = await ctx.db.query("kreditBarang").collect();
    const kreditRows = kreditMentah
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((k) => ({
        _id: k._id,
        _creationTime: k._creationTime,
        nomorReferensi: k.nomorReferensi,
        namaBarang: k.namaBarang,
        merchant: k.merchant,
        hargaBarang: k.hargaBarang,
        status: k.status,
      }));

    // Waktu acuan dihitung di server: panel memakainya untuk umur tunggu
    // antrean, supaya angkanya tidak bergantung pada jam perangkat admin.
    const sekarang = Date.now();

    // Kartu angka dan grafik untuk layar YANG SAMA dihitung di sini, dari data
    // yang baru saja dibaca. Sebelumnya `adminStats` dan `adminAnalitik`
    // memindai loans/pawns/kredit/nasabahProfil sekali lagi untuk layar yang
    // sama, jadi satu kunjungan admin membaca seluruh riwayat pinjaman tiga
    // kali — dan pada volume tertentu itu gagal, bukan hanya melambat.
    const stats = await bangunStatsAdmin(ctx, {
      loans,
      pawns,
      kreditBarang: kreditMentah,
    });
    const analitik = await bangunAnalitikAdmin(ctx, loans);

    return {
      isAdmin: true,
      dihitungPada: sekarang,
      loans: loanRows,
      pawns: pawnRows,
      kredit: kreditRows,
      stats,
      analitik,
    };
  },
});

/**
 * Isi kode pseudonim yang belum ada pada maksimal 50 akun per pemanggilan.
 * Cursor memungkinkan migrasi data lama berjalan bertahap di panel admin.
 */
export const backfillKodePeminjam = mutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("users").order("asc").paginate({
      numItems: 50,
      cursor,
    });
    let diterbitkan = 0;

    for (const user of page.page) {
      if (user.kodePeminjam !== undefined) continue;
      const [loan, pawn, kredit] = await Promise.all([
        ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", user._id)).first(),
        ctx.db.query("pawns").withIndex("by_user", (q) => q.eq("userId", user._id)).first(),
        ctx.db.query("kreditBarang").withIndex("by_user", (q) => q.eq("userId", user._id)).first(),
      ]);
      if (loan === null && pawn === null && kredit === null) continue;
      await ensureKodePeminjam(ctx, user._id);
      diterbitkan += 1;
    }

    return { cursor: page.continueCursor, selesai: page.isDone, diterbitkan };
  },
});

/**
 * URL dokumen KYC untuk dialog review pinjaman — admin saja.
 * Tautan bertanda tangan & berumur pendek (lihat `berkas.tautanBerkas`),
 * bukan URL penyimpanan Convex yang permanen.
 */
export const dokumenKycUrls = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const [ktp, selfie, slip, kartuKeluarga, domisili] = await Promise.all([
      tautanBerkas(loan.dokKtpId),
      tautanBerkas(loan.dokSelfieKtpId),
      tautanBerkas(loan.dokSlipGajiId),
      tautanBerkas(loan.dokKartuKeluargaId),
      tautanBerkas(loan.dokBuktiDomisiliId),
    ]);
    return {
      ktpUrl: ktp,
      selfieUrl: selfie,
      slipUrl: slip,
      kartuKeluargaUrl: kartuKeluarga,
      buktiDomisiliUrl: domisili,
      atmDititipkan: loan.atmDititipkan ?? false,
      nomorTandaTerimaAtm: loan.nomorTandaTerimaAtm ?? null,
      nik: loan.nik ?? null,
      nomorWhatsApp: loan.nomorWhatsApp ?? null,
      penghasilanBulanan: loan.penghasilanBulanan ?? null,
      sumberPenghasilan: loan.sumberPenghasilan ?? null,
      lokasiAjukan: loan.lokasiAjukan ?? null,
    };
  },
});

/** Apakah sudah ada admin di sistem — dipakai halaman /admin untuk bootstrap. */
export const adminExists = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const all = await ctx.db.query("users").collect();
    return all.some((u) => u.role === ROLES.ADMIN);
  },
});

/**
 * Bandingkan dua rahasia tanpa membocorkan panjang/isi lewat waktu eksekusi.
 * Tidak berhenti lebih awal saat beda — semua byte dibaca.
 */
function samaRahasia(masukan: string, diharapkan: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(masukan);
  const b = enc.encode(diharapkan);
  let beda = a.length ^ b.length;
  const panjang = Math.max(a.length, b.length);
  for (let i = 0; i < panjang; i += 1) {
    beda |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return beda === 0;
}

/** Panjang minimum rahasia bootstrap operator — di bawah ini dianggap belum dikonfigurasi. */
const MIN_RAHASIA_BOOTSTRAP = 24;

/**
 * Bootstrap admin pertama — HANYA dengan rahasia operator (`ADMIN_BOOTSTRAP_SECRET`).
 *
 * Fail-closed: bila environment `ADMIN_BOOTSTRAP_SECRET` belum diisi (atau
 * kurang dari 24 karakter), jalur ini selalu ditolak. Rahasia dibandingkan
 * constant-time dan hanya berlaku selama belum ada admin; setelah admin
 * pertama ada, jalur ini mati dan promosi berikutnya lewat admin yang ada.
 * Akun tamu (anonim) diblokir: wajib email terverifikasi.
 */
export const bootstrapFirstAdmin = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const me = await ctx.db.get(userId);
    if (me === null) throw new Error("Pengguna tidak ditemukan.");

    const all = await ctx.db.query("users").collect();
    const existingAdmin = all.some((u) => u.role === ROLES.ADMIN);
    if (existingAdmin) {
      throw new Error(
        "Admin sudah ada. Promosi admin berikutnya dilakukan oleh admin yang ada.",
      );
    }
    if (
      me.isAnonymous === true ||
      !me.email ||
      me.emailVerificationTime === undefined
    ) {
      throw new Error(
        "Bootstrap admin wajib memakai akun email terverifikasi, bukan akun tamu.",
      );
    }

    const diharapkan = process.env.ADMIN_BOOTSTRAP_SECRET ?? "";
    if (diharapkan.length < MIN_RAHASIA_BOOTSTRAP) {
      throw new Error(
        `Bootstrap belum dikonfigurasi: isi environment ADMIN_BOOTSTRAP_SECRET dengan rahasia acak minimal ${MIN_RAHASIA_BOOTSTRAP} karakter.`,
      );
    }
    if (!samaRahasia(secret, diharapkan)) {
      await audit(
        ctx,
        userId,
        me.email,
        "admin_bootstrap_gagal",
        "users",
        "Rahasia bootstrap salah — permintaan ditolak.",
      );
      throw new Error("Rahasia bootstrap salah.");
    }

    await ctx.db.patch(userId, { role: ROLES.ADMIN });
    await audit(
      ctx,
      userId,
      me.email,
      "admin_bootstrap",
      "users",
      "Admin pertama diaktifkan dengan rahasia bootstrap operator.",
    );
    return { success: true };
  },
});

/**
 * QA/dev helper: promosikan pengguna berdasarkan ID menjadi admin. Internal —
 * tidak bisa dipanggil dari klien; hanya via CLI Convex
 * (`bunx convex run admin:qaPromoteUser '{"userId":"..."}'`).
 */
export const qaPromoteUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");
    await ctx.db.patch(args.userId, { role: ROLES.ADMIN });
    return { success: true, email: target.email ?? null };
  },
});

/**
 * Cabut peran admin dari semua akun TAMU (anonim tanpa email) — membersihkan
 * admin hantu buatan skrip QA sehingga slot bootstrap admin pertama kembali
 * tersedia untuk akun email asli. Admin beremail tidak tersentuh. Internal —
 * hanya via CLI Convex (`bunx convex run admin:qaDemoteGuestAdmins '{}').
 */
export const qaDemoteGuestAdmins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("users").collect();
    const demoted: Array<{ id: string; email: string | null }> = [];
    for (const u of all) {
      if (u.role === ROLES.ADMIN && u.isAnonymous === true && !u.email) {
        await ctx.db.patch(u._id, { role: undefined });
        demoted.push({ id: u._id, email: u.email ?? null });
      }
    }
    return { demotedCount: demoted.length, demoted };
  },
});

/**
 * Promosikan pengguna lain menjadi admin — hanya oleh admin yang ada.
 * (Dipakai dari halaman admin; tidak diekspos ke nasabah.)
 */
export const promoteToAdmin = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.targetUserId);
    if (target === null) throw new Error("Pengguna target tidak ditemukan.");
    await ctx.db.patch(args.targetUserId, { role: ROLES.ADMIN });
    return { success: true };
  },
});

// Statistik antrean (hanya admin) — agregasi nyata dari database.
//
// Isi perhitungannya tinggal di `bangunStatsAdmin` supaya `adminOverview` bisa
// memakainya dengan data yang SUDAH ia baca. Layar "Hari ini" dulu memindai
// loans/pawns/kredit sekali untuk antrean dan sekali lagi untuk kartu angka;
// sekarang satu kali, dan kedua jalur tidak mungkin menampilkan angka berbeda.
export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return bangunStatsAdmin(ctx);
  },
});

/** Data mentah untuk agregat; dioper bila pemanggil sudah membacanya. */
type BahanStatsAdmin = {
  loans: Doc<"loans">[];
  pawns: Doc<"pawns">[];
  kreditBarang: Doc<"kreditBarang">[];
};

async function bangunStatsAdmin(ctx: QueryCtx, bahan?: Partial<BahanStatsAdmin>) {
    // Data AKUN UJI PINJAMAN adalah percobaan internal, bukan portofolio: ia
    // tidak boleh menggeser omzet, antrean keputusan, atau rasio kesehatan di
    // ringkasan admin. Baris uji lama (tanpa penanda) tetap tersaring lewat
    // userId akun uji, jadi tidak perlu migrasi.
    const idUji = await userIdAkunUji(ctx);
    const loans = (bahan?.loans ?? (await ctx.db.query("loans").collect())).filter(
      (l) => idUji === null || l.userId !== idUji,
    );
    const pawns = (bahan?.pawns ?? (await ctx.db.query("pawns").collect())).filter(
      (p) => idUji === null || p.userId !== idUji,
    );

    // Status "menunggu keputusan" dibaca dari SATU sumber kebenaran yang sama
    // dengan lencana sub-tab (`lib/admin-queue.ts`). Sebelumnya di sini hanya
    // `diajukan` yang dihitung, sehingga pengajuan berstatus `sedang_direview`
    // — ejaan yang justru ditulis aplikasi — tidak pernah muncul di ringkasan.
    const pendingLoans = loans.filter((l) =>
      STATUS_MENUNGGU.pinjaman.includes(l.status),
    ).length;
    const pendingPawns = pawns.filter((p) =>
      STATUS_MENUNGGU.gadai.includes(p.status),
    ).length;
    const taksiranTotal = pawns
      .filter((p) => p.status === "disetujui" && p.nilaiTaksiran !== undefined)
      .reduce((acc, p) => acc + (p.nilaiTaksiran ?? 0), 0);
    const kreditBarang = (
      bahan?.kreditBarang ?? (await ctx.db.query("kreditBarang").collect())
    ).filter((k) => idUji === null || k.userId !== idUji);

    // Pokok gadai yang MASIH beredar (sisa menurun; fallback pokok awal) untuk
    // gadai aktif — pembanding "sedang berjalan" milik pinjaman tunai.
    const totalGadaiBerjalan = pawns
      .filter((p) => p.status === "aktif")
      .reduce((acc, p) => acc + (p.sisaPokok ?? p.pokokGadai ?? 0), 0);

    // Pokok DIBIAYAI (harga − DP) untuk kredit barang yang sedang berjalan.
    // Baris warisan yang tak bisa di-quote dilewati agar satu dokumen lama tidak
    // merobohkan ringkasan — pola yang sama dengan `keuntunganAdminSatu`.
    const totalKreditBerjalan = kreditBarang
      .filter((k) => k.status === "didanai")
      .reduce((acc, k) => {
        try {
          return (
            acc +
            quoteKreditBarang({
              hargaBarang: k.hargaBarang,
              dpPersen: k.dpPersen,
              tenorBulan: k.tenorBulan,
              marginPersenPerBulan: k.marginPersenPerBulan,
              tarif: k.tarifBulanan ?? null,
            }).pokokDibiayai
          );
        } catch {
          return acc;
        }
      }, 0);

    const cfg = await getConfig(ctx);

    // Keterlambatan pelunasan — dihitung live dari tanggal pendanaan + tenor.
    let pinjamanTerlambat = 0;
    let totalDendaBerjalan = 0;
    for (const l of loans) {
      if (l.status !== "didanai") continue;
      const info = pelunasanPinjaman(l, Date.now(), cfg.persenDendaKeterlambatan);
      if (info === null) continue;
      if (info.hariTerlambat > 0) {
        pinjamanTerlambat += 1;
        totalDendaBerjalan += info.dendaTerlambat;
      }
    }

    // Hitung pinjaman berstatus disetujui (keputusan review internal saja).
    const pinjamanDisetujui = loans.filter((l) => l.status === "disetujui").length;

    // Total nominal pinjaman berdasarkan arus kas:
    //  - sedang berjalan: sudah didanai (status didanai), pokok yang beredar;
    //  - diajukan: pengajuan baru yang menunggu keputusan, memakai pokok yang
    //    diminta (pokokDiajukan) bila ada.
    const totalPinjamanBerjalan = loans
      .filter((l) => l.status === "didanai")
      .reduce((acc, l) => acc + l.pokokPinjaman, 0);
    const totalPinjamanDiajukan = loans
      .filter((l) => STATUS_MENUNGGU.pinjaman.includes(l.status))
      .reduce((acc, l) => acc + (l.pokokDiajukan ?? l.pokokPinjaman), 0);

    // Keuntungan admin = potongan admin dari pokok pinjaman, memakai model
    // yang sama dengan panel penyedia dana
    // (lib/bagiHasil.ts) — termasuk skema bulanan yang dihitung dari tenor
    // penuhnya. Baris warisan yang pokoknya bukan rupiah bulat dilewati agar
    // satu dokumen lama tidak merobohkan ringkasan.
    const keuntunganAdminSatu = (l: {
      pokokPinjaman: number;
      tenorBulan?: number;
      persenBunga?: number;
      promoBungaPersenNormal?: number;
    }): number => {
      try {
        return bagiHasilPinjamanDari({
          pokokPinjaman: l.pokokPinjaman,
          tenorBulan: l.tenorBulan ?? null,
          persenBunga: l.persenBunga ?? cfg.persenBunga,
          promoBungaPersenNormal: l.promoBungaPersenNormal ?? null,
        }).keuntunganAdmin;
      } catch {
        return 0;
      }
    };
    // Sudah tercatat: pinjaman lunas — potongan adminnya sudah dibukukan saat
    // pelunasan. Belum tercatat: pinjaman yang masih berjalan, potongannya
    // belum direalisasi sampai pinjaman ditutup.
    const keuntunganAdminTercatat = loans
      .filter((l) => l.status === "lunas")
      .reduce((acc, l) => acc + keuntunganAdminSatu(l), 0);
    const keuntunganAdminBelumTercatat = loans
      .filter((l) => l.status === "didanai")
      .reduce((acc, l) => acc + keuntunganAdminSatu(l), 0);

    // Satu baca untuk seluruh status lokasi: satu baris per pengguna, berisi
    // titik TERAKHIR yang sah. Titik dari perangkat admin saat pratinjau
    // dipulihkan saat sesi pratinjau ditutup (`pratinjau.pulihkanLokasiNasabah`),
    // jadi baris ini tidak membawa lokasi admin.
    const statusLokasi = await ctx.db.query("lokasiStatus").collect();
    const waktuLokasiPerPeminjam = new Map<string, number>();
    const titikLokasiPerPeminjam = new Map<string, { lat: number; lng: number }>();
    for (const s of statusLokasi) {
      waktuLokasiPerPeminjam.set(s.userId as string, s.waktu);
      titikLokasiPerPeminjam.set(s.userId as string, { lat: s.lat, lng: s.lng });
    }

    // GPS mismatch: posisi terakhir peminjam aktif vs gudang brankas. Dibaca
    // dari `lokasiStatus` yang sudah diambil di atas, BUKAN satu query
    // `lokasiJejak` per pinjaman aktif: versi lama membaca sampai 20 titik
    // riwayat untuk setiap pinjaman berjalan, sehingga biaya query ini tumbuh
    // sebanding jumlah pinjaman aktif dikali 20 — puluhan ribu dokumen
    // terbaca pada satu kunjungan dashboard. Titik terakhirnya sama saja.
    const vault = { lat: cfg.vaultLat, lng: cfg.vaultLng };
    let gpsMismatch = 0;
    for (const l of loans) {
      if (l.status !== "didanai") continue;
      const titik = titikLokasiPerPeminjam.get(l.userId as string) ?? null;
      if (titik && jarakKm(titik, vault) > cfg.gpsMismatchKm) {
        gpsMismatch += 1;
      }
    }

    // Gerbang lokasi wajib: pinjaman aktif yang titik GPS-nya tidak mengalir
    // (= Peminjam mematikan lokasi). Angka ini yang perlu ditindak penagihan.
    const batasLokasiMs = Math.max(1, cfg.lokasiMaxUmurMenit) * 60_000;
    let pinjamanTanpaLokasi = 0;
    if (cfg.lokasiWajib) {
      for (const l of loans) {
        if (l.status !== "didanai") continue;
        const waktu = waktuLokasiPerPeminjam.get(l.userId as string) ?? null;
        if (waktu === null || Date.now() - waktu > batasLokasiMs) {
          pinjamanTanpaLokasi += 1;
        }
      }
    }

    // Lokasi palsu: titik terakhir yang ditandai heuristik (mis. koordinat
    // beku berulang). Titik yang JELAS palsu sudah ditolak sebelum disimpan,
    // jadi angka ini adalah yang perlu ditinjau manusia, bukan pelanggaran.
    const titikDicurigai = statusLokasi.filter((s) => (s.tanda?.length ?? 0) > 0).length;

    // Peringatan lokasi yang belum diakui nasabah di dashboard — yang benar
    // benar belum sampai ke orangnya dan mungkin perlu ditelepon.
    const peringatanLokasiAktif = (
      await ctx.db.query("lokasiPeringatan").collect()
    ).filter((p) => p.dibacaPada === undefined).length;

    return {
      pinjamanBaru: pendingLoans,
      gadaiProses: pendingPawns,
      totalPinjaman: loans.length,
      totalGadai: pawns.length,
      nilaiTaksiranDisetujui: taksiranTotal,
      totalGadaiBerjalan,
      totalKreditBerjalan,
      pinjamanTerlambat,
      totalDendaBerjalan,
      /** Tarif yang benar-benar dipakai penagihan; 0 berarti denda dimatikan. */
      persenDendaKeterlambatan: cfg.persenDendaKeterlambatan,
      pinjamanDisetujui,
      totalPinjamanBerjalan,
      totalPinjamanDiajukan,
      /** Keuntungan admin dari pinjaman lunas (sudah dibukukan). */
      keuntunganAdminTercatat,
      /** Keuntungan admin dari pinjaman berjalan (belum dibukukan). */
      keuntunganAdminBelumTercatat,
      gpsMismatch,
      /** Pinjaman aktif tanpa titik lokasi segar (gerbang lokasi wajib). */
      pinjamanTanpaLokasi,
      /** Peminjam dengan titik lokasi terakhir yang dicurigai palsu. */
      titikDicurigai,
      /** Peringatan lokasi yang belum diakui nasabah di dashboard. */
      peringatanLokasiAktif,
    };
}

// Re-quote helper dipakai ulang untuk tampilan admin (rincian biaya pinjaman).
// tenorBulan diisi → rincian skema bulanan (DP 0%, potongan di muka 2% untuk
// semua tenor — biaya admin; platform dihapus — bunga flat per tenor); kosong → skema
// harian dengan tarif matriks nominal–tenor.
export const adminLoanQuote = query({
  args: {
    pokokPinjaman: v.number(),
    /** Tenor harian — dipakai agar pratinjau memakai matriks yang sama dengan penyimpanan. */
    tenorHari: v.optional(v.number()),
    tenorBulan: v.optional(v.number()),
    /** Bunga khusus nasabah (persen) bila baris pinjaman punya snapshot. */
    persenBunga: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.tenorBulan !== undefined) {
      // Pratinjau admin memakai tarif yang SAMA dengan mesin pengajuan baru.
      const tarifBulanan = tarifBulananDariConfig(await getConfig(ctx));
      const sim = hitungSimulasiBulanan(args.pokokPinjaman, args.tenorBulan, {
        ...(args.persenBunga === undefined
          ? {}
          : { persenBungaPerBulan: args.persenBunga }),
        tarif: tarifBulanan,
      });
      return {
        skema: "bulanan" as const,
        tenorBulan: args.tenorBulan,
        tenorBulanTersedia: TENOR_BULANAN_OPTIONS,
        tarifBulanan,
        pokokDibiayai: sim.pokokDibiayai,
        dp: sim.dp,
        biayaLayanan: sim.biayaLayananTotal,
        potonganDiMuka: sim.potonganDiMuka,
        danaDiterima: sim.danaDiterima,
        biayaAdminCicilanTotal: sim.biayaAdminCicilanTotal,
        biayaLayananPerBulan: sim.biayaLayananPerBulan,
        persenBungaPerBulan: sim.persenBungaPerBulan,
        bungaPerBulan: sim.bungaPerBulan,
        imbalHasilTotal: sim.bungaTotal,
        cicilanPerBulan: sim.cicilanPerBulan,
        cicilanTerakhir: sim.cicilanTerakhir,
        totalPengembalian: sim.totalPengembalian,
        totalKeuntunganBersih: sim.totalKeuntunganBersih,
        persentaseProfitTotal: sim.persentaseProfitTotal,
        jadwal: sim.jadwal,
        quote:
          args.persenBunga === undefined
            ? quoteLoan(args.pokokPinjaman)
            : quotePinjaman({ pokokPinjaman: args.pokokPinjaman, persenBunga: args.persenBunga }),
      };
    }
    // Tanpa override, tarif harian berasal dari matriks nominal–tenor. Bila
    // tenor tidak dikirim (pemanggil lama), perilaku lama dipertahankan.
    const persenHarian =
      args.persenBunga ??
      (args.tenorHari === undefined
        ? undefined
        : persenBungaHarian(args.pokokPinjaman, args.tenorHari) ?? undefined);
    return {
      skema: "harian" as const,
      tenorHari: args.tenorHari ?? null,
      quote:
        persenHarian === undefined
          ? quoteLoan(args.pokokPinjaman)
          : quotePinjaman({ pokokPinjaman: args.pokokPinjaman, persenBunga: persenHarian }),
    };
  },
});

/** Antrean bukti setoran penyedia dana untuk pencocokan metadata saja. */
export const pendingDepositEvidence = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_status", (q) => q.eq("status", "menunggu_verifikasi"))
      .collect();
    const result = [];
    for (const deposit of rows.filter((row) => row.buktiPembayaranId && row.statusPencocokan === undefined).sort((a, b) => b._creationTime - a._creationTime)) {
      const akunDana = await ctx.db.get(deposit.danaId);
      const metadata = await ctx.storage.getMetadata(deposit.buktiPembayaranId!);
      result.push({
        _id: deposit._id,
        nomorReferensi: deposit.nomorReferensi,
        jumlah: deposit.jumlah,
        referensiTransfer: deposit.referensiTransfer,
        metodePembayaran: deposit.metodePembayaran ?? null,
        tanggalTransfer: deposit.tanggalTransfer ?? null,
        buktiUrl: await ctx.storage.getUrl(deposit.buktiPembayaranId!),
        fileContentType: metadata?.contentType ?? null,
        emailDana: akunDana?.email ?? null,
      });
    }
    return result;
  },
});

/** Antrean setoran penyedia dana lama tanpa bukti unggahan. */
export const pendingDeposits = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_status", (q) => q.eq("status", "menunggu_verifikasi"))
      .collect();
    const result = [];
    for (const d of rows.filter((row) => !row.buktiPembayaranId && row.statusPencocokan === undefined).sort((a, b) => b._creationTime - a._creationTime)) {
      const akunDana = await ctx.db.get(d.danaId);
      result.push({
        _id: d._id,
        _creationTime: d._creationTime,
        nomorReferensi: d.nomorReferensi,
        jumlah: d.jumlah,
        referensiTransfer: d.referensiTransfer,
        metodePembayaran: d.metodePembayaran ?? null,
        tanggalTransfer: d.tanggalTransfer ?? null,
        statusPencocokan: d.statusPencocokan ?? null,
        referensiMutasi: d.referensiMutasi ?? null,
        jumlahMutasi: d.jumlahMutasi ?? null,
        buktiUrl: d.buktiPembayaranId ? await ctx.storage.getUrl(d.buktiPembayaranId) : null,
        emailDana: akunDana?.email ?? null,
      });
    }
    return result;
  },
});

/** Antrean penarikan penyedia dana menunggu diproses (untuk panel admin). */
export const pendingWithdrawals = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("withdrawals")
      .withIndex("by_status", (q) => q.eq("status", "menunggu_proses"))
      .collect();
    const result = [];
    for (const w of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const akunDana = await ctx.db.get(w.danaId);
      result.push({
        _id: w._id,
        _creationTime: w._creationTime,
        nomorReferensi: w.nomorReferensi,
        jumlah: w.jumlah,
        namaBank: w.namaBank,
        nomorRekening: w.nomorRekening,
        emailDana: akunDana?.email ?? null,
      });
    }
    return result;
  },
});

/**
 * Proses penarikan — jurnal seimbang: kredit dompet penyedia dana (saldo turun),
 * debit kas platform (uang keluar). Saldo divalidasi ulang saat eksekusi.
 */
export const processWithdrawal = mutation({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Tolak penarikan — wajib alasan; tidak menyentuh ledger. */
export const rejectWithdrawal = mutation({
  args: { withdrawalId: v.id("withdrawals"), reason: v.string() },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx);
    const w = await ctx.db.get(args.withdrawalId);
    if (w === null) throw new Error("Permintaan penarikan tidak ditemukan.");
    if (w.status !== "menunggu_proses") {
      throw new Error("Permintaan penarikan ini sudah diputuskan.");
    }
    if (!args.reason.trim()) {
      throw new Error("Penolakan wajib menyertakan alasan.");
    }
    await ctx.db.patch(args.withdrawalId, {
      status: "ditolak",
      catatanAdmin: args.reason.trim(),
    });
    await audit(
      ctx,
      adminId,
      "penarikan_ditolak",
      w.nomorReferensi,
      args.reason.trim(),
    );
  },
});

/**
 * Kompatibilitas API lama: sekarang hanya mencocokkan bukti, saldo tetap tidak berubah.
 */
export const matchDepositEvidence = mutation({
  args: {
    depositId: v.id("deposits"),
    referensiMutasi: v.string(),
    jumlahMutasi: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user: admin } = await requireAdmin(ctx);
    const deposit = await ctx.db.get(args.depositId);
    if (!deposit || deposit.status !== "menunggu_verifikasi" || deposit.statusPencocokan !== undefined) {
      throw new Error("Setoran tidak ada di antrean pencocokan.");
    }
    if (!deposit.buktiPembayaranId) throw new Error("Setoran ini tidak memiliki bukti unggahan untuk dicocokkan.");
    if (!(await ctx.storage.getUrl(deposit.buktiPembayaranId))) {
      throw new Error("File bukti setoran tidak lagi tersedia untuk ditinjau.");
    }
    const reference = args.referensiMutasi.trim();
    if (reference.length < 4 || reference.length > 120) throw new Error("Referensi mutasi wajib 4–120 karakter.");
    if (!Number.isSafeInteger(args.jumlahMutasi) || args.jumlahMutasi !== deposit.jumlah) {
      throw new Error("Nominal mutasi wajib sama persis dengan nominal setoran.");
    }
    await ctx.db.patch(deposit._id, {
      statusPencocokan: "dicocokkan",
      referensiMutasi: reference,
      jumlahMutasi: args.jumlahMutasi,
      dicocokkanPada: Date.now(),
      dicocokkanOleh: userId,
    });
    await audit(ctx, userId, admin.email ?? admin.name ?? "admin", "setoran_dana_dicocokkan", deposit.nomorReferensi, `${reference} · ${args.jumlahMutasi}; pencocokan metadata saja, saldo tidak berubah.`);
  },
});

/** Alias lama tetap tertutup: konfirmasi tidak boleh mengkreditkan saldo. */
export const confirmDeposit = mutation({
  args: { depositId: v.id("deposits") },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Tolak setoran — wajib alasan; tidak menyentuh ledger. */
export const rejectDeposit = mutation({
  args: { depositId: v.id("deposits"), reason: v.string() },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const deposit = await ctx.db.get(args.depositId);
    if (deposit === null) throw new Error("Setoran tidak ditemukan.");
    if (deposit.status !== "menunggu_verifikasi" || deposit.statusPencocokan !== undefined) {
      throw new Error("Setoran ini sudah diputuskan.");
    }
    if (!args.reason.trim()) {
      throw new Error("Penolakan wajib menyertakan alasan.");
    }
    await ctx.db.patch(args.depositId, {
      statusPencocokan: "ditolak",
      catatanAdmin: args.reason.trim(),
      dicocokkanPada: Date.now(),
      dicocokkanOleh: adminId,
    });
    await audit(ctx, adminId, admin.email ?? admin.name ?? "admin", "setoran_dana_ditolak", deposit.nomorReferensi, `${args.reason.trim()}; metadata saja, saldo dan status setoran tidak berubah.`);
  },
});

/**
 * Nilai pendapatan platform dari satu baris ledger.
 *
 * `platform:FEE` adalah biaya layanan: potongan di muka, biaya cicilan, dan
 * potongan admin saat payout. `PLATFORM_SPREAD_MARGIN` adalah margin tenor:
 * bunga nasabah dikurangi hak pendana 30%. Margin negatif (bunga nasabah di
 * bawah 30%) mengurangi pendapatan, jadi arah debit dihitung negatif — beda
 * dari FEE yang selama ini mencatat nominal apa adanya.
 *
 * Denda keterlambatan (jenis `repayment`) tidak dihitung: kartu ini melaporkan
 * pendapatan jasa platform, sedangkan denda adalah sanksi terpisah.
 */
function nilaiPendapatanPlatform(e: {
  jenis: string;
  akun: string;
  arah: "debit" | "kredit";
  jumlah: number;
}): number {
  if (e.akun === "platform:FEE") {
    return e.jenis === "platform_fee" || e.jenis === "payout" ? e.jumlah : 0;
  }
  // Biaya admin & pencairan ekspres dipotong di muka: pendapatan langsung.
  if (e.akun === AKUN_PLATFORM_DIRECT_REVENUE) {
    return e.jenis === "platform_fee" ? e.jumlah : 0;
  }
  if (e.akun === AKUN_PLATFORM_SPREAD) {
    return e.arah === "kredit" ? e.jumlah : -e.jumlah;
  }
  return 0;
}

/**
 * Ringkasan ledger untuk kartu kesehatan sistem di panel admin.
 * `pendapatanPlatform` = total pendapatan platform dari `platform:FEE` dan
 * `PLATFORM_SPREAD_MARGIN` (lihat `nilaiPendapatanPlatform`); `rincianSkema`
 * memecahnya per lini usaha.
 */
export const ledgerSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const totals = await ledgerTotals(ctx);
    // Pendapatan platform = setiap entri pendapatan pada akun platform:FEE
    // (debit maupun kredit). Terdiri dari:
    //  - pinjaman: biaya admin & platform 2% dipotong di muka saat pendanaan penuh,
    //    ditambah potongan admin atas Imbal Hasil yang dibukukan saat pelunasan
    //    (jurnal `payout`)
    //  - gadai: potongan muka 1% (pencairan) + sewa modal periodik (bayar gadai)
    //  - kredit: biaya layanan dari pokok dibiayai, diakui saat pendanaan penuh (dipotong di muka).
    const entries = await ctx.db.query("ledger_entries").collect();
    const rincianSkema = {
      pinjaman: 0,
      gadai: 0,
      kredit: 0,
      lainnya: 0,
    };
    let pendapatanPlatform = 0;
    for (const e of entries) {
      // Satu jurnal pendapatan menyentuh akun platform satu kali. Untuk FEE,
      // arah debit maupun kredit sama-sama pendapatan (biaya dipotong / sewa
      // modal dibayar). Untuk margin spread, debit berarti platform menutup
      // kekurangan, jadi nilainya negatif.
      const nilaiPendapatan = nilaiPendapatanPlatform(e);
      if (nilaiPendapatan === 0) {
        continue;
      }
      pendapatanPlatform += nilaiPendapatan;
      // Klasifikasi dari keterangan jurnal yang ditulis saat penerimaan:
      //  - "Biaya admin & platform <REF>" (pinjaman tunai)
      //  - "Potongan muka 1% gadai <REF>" / "Sewa modal <REF>" (gadai)
      //  - "Biaya layanan platform <REF> (Kredit Barang)"
      //  - "Biaya layanan cicilan <REF> bulan n/tenor"
      // Sumber utama: tag `skema` yang ditulis jurnalnya sendiri — angka per
      // skema jadi pasti cocok dengan produk yang menerbitkan biayanya, bukan
      // hasil menebak teks. Entri lama yang belum bertag tetap diklasifikasi
      // lewat pola keterangan di bawah (kembali-kompatibel).
      const ket = e.keterangan.toLowerCase();
      const kredit =
        e.skema === "kredit" ||
        (e.skema === undefined &&
          (ket.includes("kredit barang") || ket.includes("biaya layanan cicilan")));
      const gadai =
        !kredit &&
        (e.skema === "gadai" ||
          (e.skema === undefined && (ket.includes("gadai") || ket.includes("sewa modal"))));
      const pinjaman =
        !kredit &&
        !gadai &&
        (e.skema === "pinjaman" ||
          e.akun === AKUN_PLATFORM_DIRECT_REVENUE ||
          (e.skema === undefined && (ket.includes("biaya admin") || ket.includes("pinjaman"))));
      if (kredit) {
        rincianSkema.kredit += nilaiPendapatan;
      } else if (gadai) {
        rincianSkema.gadai += nilaiPendapatan;
      } else if (pinjaman) {
        rincianSkema.pinjaman += nilaiPendapatan;
      } else {
        rincianSkema.lainnya += nilaiPendapatan;
      }
    }
    return { ...totals, pendapatanPlatform, rincianSkema };
  },
});

/**
 * Tren pendapatan platform per bulan kalender (WIB) — 12 bulan terakhir,
 * tertua → terbaru. Bulan tanpa transaksi tetap muncul dengan nilai 0.
 * Sumber: entri pendapatan platform (`nilaiPendapatanPlatform`, sumber sama
 * dengan ledgerSummary), sehingga Σ semua bulan = pendapatanPlatform.
 */

/**
 * Jurnal yang SUBJEKNYA sudah tidak ada — admin saja.
 *
 * Penghapusan data yang sudah berpindah dana sengaja tidak menghapus jurnal
 * ledger (append-only, Rule 5.1). Akibatnya akun `pinjaman:<id>` / `gadai:<id>` /
 * `kredit:<id>` bisa tetap ada padahal baris subjeknya sudah hilang. Panel ini
 * menampilkannya supaya penghapusan menyeluruh TERLIHAT (beserta sisa saldo
 * akunnya), bukan senyap — sejalan dengan temuan yang dilaporkan panel QC.
 *
 * Keberadaan subjek dicek SEKALI per id unik, bukan sekali per entri jurnal.
 * Akun non-subjek dan id tidak berbentuk id dokumen dilewati oleh
 * `subjekAkun()` sehingga laporan ini tidak pernah berisi tebakan.
 */
export const ledgerYatim = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const entri = await ctx.db.query("ledger_entries").collect();

    const subjekUnik = new Map<string, { jenis: "pinjaman" | "gadai" | "kredit"; id: string }>();
    for (const e of entri) {
      const subjek = subjekAkun(e.akun);
      if (subjek !== null) subjekUnik.set(`${subjek.jenis}:${subjek.id}`, subjek);
    }
    const masihAda = new Set<string>();
    for (const [kunci, subjek] of subjekUnik) {
      const baris =
        subjek.jenis === "pinjaman"
          ? await ctx.db.get(subjek.id as Id<"loans">)
          : subjek.jenis === "gadai"
            ? await ctx.db.get(subjek.id as Id<"pawns">)
            : await ctx.db.get(subjek.id as Id<"kreditBarang">);
      if (baris !== null) masihAda.add(kunci);
    }

    const kelompok = kelompokkanJurnalYatim(entri, (jenis, id) =>
      masihAda.has(`${jenis}:${id}`),
    );
    return { ...ringkasJurnalYatim(kelompok), kelompok };
  },
});

export const trenPendapatanBulanan = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const entries = await ctx.db.query("ledger_entries").collect();

    // Bucket per bulan kalender WIB (UTC+7): kunci "YYYY-MM".
    const WIB = 7 * 60 * 60 * 1000;
    const kunciBulan = (waktu: number): string =>
      new Date(waktu + WIB).toISOString().slice(0, 7);
    const labelBulan = (kunci: string): string => {
      const [tahun, bulan] = kunci.split("-").map(Number);
      return new Date(Date.UTC(tahun, bulan - 1, 1)).toLocaleDateString("id-ID", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    };

    // Kumpulkan pendapatan per kunci bulan.
    const perBulan = new Map<string, number>();
    for (const e of entries) {
      const nilaiPendapatan = nilaiPendapatanPlatform(e);
      if (nilaiPendapatan === 0) continue;
      const kunci = kunciBulan(e.waktu);
      perBulan.set(kunci, (perBulan.get(kunci) ?? 0) + nilaiPendapatan);
    }

    // 12 bulan kalender terakhir (bulan ini termasuk), tertua lebih dulu.
    const hasil: Array<{ kunci: string; label: string; jumlah: number }> = [];
    const sekarang = new Date(Date.now() + WIB);
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(sekarang.getUTCFullYear(), sekarang.getUTCMonth() - i, 1));
      const kunci = d.toISOString().slice(0, 7);
      hasil.push({
        kunci,
        label: labelBulan(kunci),
        jumlah: perBulan.get(kunci) ?? 0,
      });
    }
    return hasil;
  },
});

/**
 * ANALITIK 30 HARI untuk "Ringkasan Hari Ini": peristiwa pencairan/pelunasan,
 * komposisi status pinjaman, dan jumlah pengajuan yang penghasilannya di bawah
 * ambang kewajaran.
 *
 * Pembagian tanggung jawabnya sengaja tegas: server hanya mengumpulkan PERISTIWA
 * MENTAH (waktu + nominal) di dalam rentang 30 hari, lalu `lib/analitikAdmin.ts`
 * yang mengelompokkannya per hari, mengisi hari kosong dengan nol, dan menghitung
 * persentase donut. Kalau pembulatan hari dilakukan di dua tempat, cepat atau
 * lambat grafik dan daftar akan berbeda angka.
 *
 * Pinjaman TANPA `didanaiPada` dikelompokkan sebagai berjalan (bukan jatuh
 * tempo): tanpa tanggal pencairan, jatuh temponya tidak bisa dibuktikan, dan
 * menuduh sesuatu yang tidak bisa dihitung bukan dasar yang layak untuk
 * peringatan risiko.
 */
export const adminAnalitik = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return bangunAnalitikAdmin(ctx);
  },
});

/**
 * Agregat tren & komposisi untuk Ringkasan. Sama seperti `bangunStatsAdmin`:
 * `adminOverview` mengopernya daftar pinjaman yang sudah dibaca, jadi layar
 * "Hari ini" tidak memindai tabel pinjaman dua kali untuk dua kartu.
 */
async function bangunAnalitikAdmin(ctx: QueryCtx, bahanLoans?: Doc<"loans">[]) {
    const sekarang = Date.now();
    const batas = sekarang - (HARI_TREN - 1) * MS_HARI;

    // Pemantauan produksi tidak menghitung percobaan AKUN UJI PINJAMAN.
    const idUji = await userIdAkunUji(ctx);
    const loans = (bahanLoans ?? (await ctx.db.query("loans").collect())).filter(
      (l) => idUji === null || l.userId !== idUji,
    );
    const profil = await ctx.db.query("nasabahProfil").collect();
    const penghasilanPerUser = new Map<string, number | undefined>();
    for (const p of profil) penghasilanPerUser.set(p.userId, p.penghasilanBulanan);

    const peristiwa: Array<{
      tipe: "pencairan" | "pelunasan";
      waktu: number;
      jumlah: number;
    }> = [];
    let lancar = 0;
    let jatuhTempo = 0;
    let ditinjau = 0;
    let pendapatanDiBawahAmbang = 0;

    for (const l of loans) {
      const kanonik = statusKanonik(l.status);
      if (kanonik === "ditinjau") {
        ditinjau += 1;
        const diajukan = l.diajukanPada ?? l._creationTime;
        if (diajukan >= batas) {
          const penghasilan = penghasilanPerUser.get(l.userId);
          if (penghasilan !== undefined && penghasilan < AMBANG_PENGHASILAN_RISIKO) {
            pendapatanDiBawahAmbang += 1;
          }
        }
      }

      if (kanonik === "didanai") {
        const jatuhTempoPada =
          l.nextDueDate ??
          (l.didanaiPada === undefined ? null : l.didanaiPada + l.tenorHari * MS_HARI);
        if (jatuhTempoPada !== null && jatuhTempoPada < sekarang) jatuhTempo += 1;
        else lancar += 1;
      }

      // Nominal yang dibandingkan adalah POKOK pinjaman: itulah angka yang
      // benar-benar berpindah saat pencairan, dan angka yang sama dipakai untuk
      // kedua seri sehingga trennya bisa dibandingkan apel-ke-apel.
      if (l.didanaiPada !== undefined && l.didanaiPada >= batas) {
        peristiwa.push({ tipe: "pencairan", waktu: l.didanaiPada, jumlah: l.pokokPinjaman });
      }
      if (l.lunasPada !== undefined && l.lunasPada >= batas) {
        peristiwa.push({ tipe: "pelunasan", waktu: l.lunasPada, jumlah: l.pokokPinjaman });
      }
    }

    return {
      peristiwa,
      komposisi: { lancar, ditinjau, jatuhTempo },
      pendapatanDiBawahAmbang,
      dihitungPada: sekarang,
    };
}

/** Ukuran satu halaman arsip ledger — cukup besar untuk ekspor, cukup kecil
 * supaya satu permintaan tidak menembus batas baca Convex. */
const HALAMAN_LEDGER = 500;

/**
 * Satu halaman arsip ledger untuk tab Ledger & ekspor CSV (admin).
 *
 * Ledger adalah arsip akuntansi: isi ekspornya TIDAK boleh dipotong. Karena itu
 * jalurnya halaman berkursor, bukan satu pembacaan tabel penuh — pemanggil
 * mengambil halaman berikutnya sampai `selesai`, lalu merangkainya menjadi satu
 * berkas. Urutannya dari jurnal terlama ke terbaru supaya hasil ekspor runut.
 */
export const ledgerRows = query({
  args: { kursor: v.optional(v.string()), batas: v.optional(v.number()) },
  handler: async (ctx, { kursor, batas }) => {
    await requireAdmin(ctx);
    const ukuran = Math.min(
      1_000,
      Math.max(50, Math.floor(batas ?? HALAMAN_LEDGER)),
    );
    const halaman = await ctx.db
      .query("ledger_entries")
      .withIndex("by_waktu")
      .order("asc")
      .paginate({ cursor: kursor ?? null, numItems: ukuran });
    return {
      rows: halaman.page,
      kursor: halaman.isDone ? null : halaman.continueCursor,
      selesai: halaman.isDone,
    };
  },
});

/**
 * Titik lokasi peminjam untuk peta lokasi langsung (OpenStreetMap): satu baris
 * per peminjam dengan pinjaman.
 *
 * Penting untuk dibaca sebelum mengubah tampilan: peta ini HANYA bisa
 * langsung sejauh perangkatnya memang mengirim heartbeat. Peramban mengirim
 * tiap ±60 detik selama dashboard terbuka; aplikasi native bisa lebih lama
 * lewat layanan latar belakang. Karena itu setiap baris membawa umurnya
 * sendiri (`umurDetik`, `langsung`), dan titik pengajuan lama TIDAK pernah
 * disebut langsung — dulu peta menyebut semuanya "live" padahal sebagian
 * titiknya berumur berhari-hari.
 */
export const petaPeminjam = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const cfg = await getConfig(ctx);
    const sekarang = Date.now();
    const vault = { lat: cfg.vaultLat, lng: cfg.vaultLng };
    // Ambang "masih mengirim" memakai kebijakan yang sama dengan gerbang
    // transaksi (`requireLokasiSegar`), bukan angka terpisah di antarmuka.
    const batasUmurMenit = Math.max(1, cfg.lokasiMaxUmurMenit);
    const batasUmurMs = batasUmurMenit * 60_000;
    /** Titik terbaru yang dibaca per nasabah (titik terkini + jalur). */
    const JEJAK_DIBACA = 50;
    /** Titik yang digambar sebagai jalur pergerakan — cukup untuk arah, murah dibaca. */
    const JALUR_MAKS_TITIK = 20;
    /** Jalur hanya digambar dari pergerakan dua jam terakhir. */
    const JALUR_MAKS_UMUR_MS = 2 * 60 * 60 * 1000;
    const loans = await ctx.db.query("loans").collect();
    // Jendela pratinjau per nasabah: titik dan lokasi pengajuan yang jatuh di
    // dalamnya tidak boleh menjadi pin peta (ditulis perangkat admin).
    const sesi = await ctx.db.query("pratinjauSesi").collect();
    const jendelaPer = new Map<string, Array<[number, number]>>();
    // Jejak lokasi hanya disimpan 90 hari; jendela pratinjau yang lebih tua
    // tidak bisa lagi memengaruhi peta dan tidak perlu dibaca.
    const batasSesi = Date.now() - 90 * 24 * 60 * 60 * 1000;
    for (const s of sesi) {
      if (s.dipakaiPada === undefined || s.dipakaiPada < batasSesi) continue;
      const daftar = jendelaPer.get(s.targetId) ?? [];
      daftar.push([
        s.dipakaiPada,
        Math.max(s.dipakaiPada, s.selesai ?? s.berlakuHingga ?? Date.now()),
      ]);
      jendelaPer.set(s.targetId, daftar);
    }
    const dalamPratinjau = (userId: string, waktu: number): boolean =>
      (jendelaPer.get(userId) ?? []).some(
        ([mulai, akhir]) => waktu >= mulai && waktu <= akhir,
      );
    const rows: Array<{
      userId: string;
      namaLengkap: string;
      nomorReferensi: string;
      statusPinjaman: string;
      posisi: {
        lat: number;
        lng: number;
        waktu: number;
        sumber: "perangkat" | "pengajuan";
      } | null;
      /** Umur titik terkini (detik) — dihitung di server, bukan di peramban. */
      umurDetik: number | null;
      /** Titik perangkat yang masih dalam ambang kebijakan. */
      langsung: boolean;
      akurasi: number | null;
      /** Jalur pergerakan (urut lama → baru) dari dua jam terakhir. */
      jalur: Array<{ lat: number; lng: number; waktu: number }>;
      /** Perangkat terakhir yang mengirim heartbeat, null bila hanya peramban. */
      perangkat: {
        platform: string;
        versiApp: string;
        terakhirDilihat: number;
        aktif: boolean;
      } | null;
      jarakVaultKm: number | null;
      mismatch: boolean;
      /** Tanda kecurigaan lokasi palsu pada titik terakhir (kosong = normal). */
      tanda: string[];
    }> = [];
    const seen = new Set<string>();
    for (const l of loans) {
      if (seen.has(l.userId)) continue;
      seen.add(l.userId);
      const titikJejak = await ctx.db
        .query("lokasiJejak")
        .withIndex("by_user", (q) => q.eq("userId", l.userId))
        .order("desc")
        .take(JEJAK_DIBACA);
      const titik =
        titikJejak.find((r) => r.dikecualikan === undefined) ?? null;
      const lok = l.lokasiAjukan;
      const posisi = titik
        ? {
            lat: titik.lat,
            lng: titik.lng,
            waktu: titik.waktu,
            sumber: "perangkat" as const,
          }
        : lok !== undefined && !dalamPratinjau(l.userId, lok.waktu)
          ? {
              lat: lok.lat,
              lng: lok.lng,
              waktu: lok.waktu,
              sumber: "pengajuan" as const,
            }
          : null;
      const umurDetik =
        posisi === null
          ? null
          : Math.max(0, Math.floor((sekarang - posisi.waktu) / 1000));
      // HANYA titik perangkat yang masih segar boleh disebut langsung. Titik
      // pengajuan bisa berumur berhari-hari: menyebutnya live akan menyesatkan
      // tim review yang sedang mencari posisi nasabah sekarang.
      const langsung =
        posisi !== null &&
        posisi.sumber === "perangkat" &&
        sekarang - posisi.waktu <= batasUmurMs;

      const jalur = titikJejak
        .filter(
          (r) =>
            r.dikecualikan === undefined &&
            sekarang - r.waktu <= JALUR_MAKS_UMUR_MS,
        )
        .slice(0, JALUR_MAKS_TITIK)
        .reverse()
        .map((r) => ({ lat: r.lat, lng: r.lng, waktu: r.waktu }));

      // Heartbeat perangkat native: satu-satunya bukti bahwa GPS benar-benar
      // masih hidup saat aplikasi di latar belakang. Peramban tidak mendaftar
      // perangkat, jadi `null` berarti titik datang dari web.
      const daftarPerangkat = await ctx.db
        .query("perangkat")
        .withIndex("by_user", (q) => q.eq("userId", l.userId))
        .collect();
      const perangkatTerakhir =
        daftarPerangkat.sort((a, b) => b.terakhirDilihat - a.terakhirDilihat)[0] ??
        null;
      const perangkat =
        perangkatTerakhir === null
          ? null
          : {
              platform: perangkatTerakhir.platform,
              versiApp: perangkatTerakhir.versiApp,
              terakhirDilihat: perangkatTerakhir.terakhirDilihat,
              aktif: sekarang - perangkatTerakhir.terakhirDilihat <= batasUmurMs,
            };

      const jarak = posisi ? jarakKm(posisi, vault) : null;
      rows.push({
        userId: l.userId,
        namaLengkap: l.namaLengkap,
        nomorReferensi: l.nomorReferensi,
        statusPinjaman: l.status,
        posisi,
        umurDetik,
        langsung,
        akurasi: titik?.akurasi ?? null,
        jalur,
        perangkat,
        jarakVaultKm: jarak,
        mismatch: jarak !== null && jarak > cfg.gpsMismatchKm,
        tanda: titik?.tanda ?? [],
      });
    }
    // Urutan yang berguna saat memantau: yang masih mengirim lebih dulu, lalu
    // yang titiknya paling baru.
    rows.sort(
      (a, b) =>
        Number(b.langsung) - Number(a.langsung) ||
        (a.umurDetik ?? Number.MAX_SAFE_INTEGER) -
          (b.umurDetik ?? Number.MAX_SAFE_INTEGER),
    );
    return {
      vault,
      gpsMismatchKm: cfg.gpsMismatchKm,
      batasUmurMenit,
      intervalDetik: LOKASI_KEBIJAKAN.intervalDetik,
      diperbaruiPada: sekarang,
      rows,
    };
  },
});

/**
 * Nomor WhatsApp satu peminjam — untuk tombol "Kirim rekening" per baris
 * pinjaman di ruang pendana.
 *
 * SENGAJA dibaca lewat query terpisah, bukan sebagai kolom di
 * `penyediaDana.daftarPengajuan`. Daftar itu juga dibaca akun pendana dan
 * pemantau, dan ada tes yang menjaga agar tidak satu pun nomor identitas ikut
 * di dalamnya; menambah kolom nomor di sana akan membocorkan nomor ke pembaca
 * yang tidak berhak, walau tombolnya disembunyikan di antarmuka. Nomor hanya
 * diambil saat admin benar-benar menekan tombol, untuk satu pinjaman, dengan
 * gerbang admin yang sama seperti query admin lain.
 */
export const kontakPeminjam = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    // Pinjaman adalah sumber utama; baris lama atau hasil migrasi kadang hanya
    // menyimpan nomor di profil nasabahnya.
    const profil = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", loan.userId))
      .first();
    return {
      nama: loan.namaLengkap,
      nomorWhatsApp: loan.nomorWhatsApp ?? profil?.nomorWhatsApp ?? null,
    };
  },
});

/**
 * Peringatan "lokasi dicurigai" terbaru untuk tim review.
 *
 * Berbeda dari kartu peta (yang hanya melihat titik TERAKHIR), daftar ini
 * menyimpan riwayat: siapa, kapan, tanda apa, dan apakah pesan WhatsApp-nya
 * benar-benar sampai — termasuk bila gateway WA belum diaktifkan.
 */
export const peringatanLokasiTerbaru = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("lokasiPeringatan")
      .withIndex("by_waktu")
      .order("desc")
      .take(Math.min(limit ?? 40, 100));
    const hasil = [];
    for (const r of rows) {
      const user = await ctx.db.get(r.userId);
      const loan = r.loanId === undefined ? null : await ctx.db.get(r.loanId);
      hasil.push({
        _id: r._id,
        nama: namaHurufBesar(user?.name ?? user?.email ?? "Nasabah"),
        nomorReferensi: loan?.nomorReferensi ?? null,
        tanda: r.tanda,
        jenis: r.jenis,
        waStatus: r.waStatus ?? null,
        waKeterangan: r.waKeterangan ?? null,
        dibacaPada: r.dibacaPada ?? null,
        waktu: r.waktu,
      });
    }
    return hasil;
  },
});

/** Data lengkap pinjaman untuk pembuatan e-contract (admin). */
export const contractDetail = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    return {
      _creationTime: loan._creationTime,
      nomorReferensi: loan.nomorReferensi,
      namaLengkap: loan.namaLengkap,
      status: loan.status,
      nomorRekening: loan.nomorRekening,
      namaBank: loan.namaBank ?? null,
      nik: loan.nik ?? null,
      pokokPinjaman: loan.pokokPinjaman,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan ?? null,
      lokasiAjukan: loan.lokasiAjukan ?? null,
      // Skema bulanan memakai jadwal bunga dari lib/bulanan (flat dari
      // pokok penuh sehingga cicilannya rata);
      // perubahan versi syarat di lib/contract harus ikut dipush bersama fungsi ini.
      persenBunga: loan.persenBunga ?? null,
      bulanan:
        loan.tenorBulan !== undefined
          ? simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan })
          : null,
      quote: quotePinjaman(loan),
      persetujuanMode: loan.persetujuanMode ?? null,
      ttdManualPada: loan.ttdManualPada ?? null,
      ttdManualOleh: loan.ttdManualOleh ?? null,
      ttdManualUrl: await tautanKontrakManual(loan.ttdManualBerkasId),
    };
  },
});

/** Data lengkap gadai untuk akad digital (admin). */
export const contractDetailPawn = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, { pawnId }) => {
    await requireAdmin(ctx);
    const pawn = await ctx.db.get(pawnId);
    if (pawn === null) return null;
    return {
      _creationTime: pawn._creationTime,
      nomorReferensi: pawn.nomorReferensi,
      namaLengkap: pawn.namaLengkap,
      nomorRekening: pawn.nomorRekening,
      namaBank: pawn.namaBank ?? null,
      deskripsiBarang: pawn.deskripsiBarang,
      kategori: pawn.kategori,
      nilaiTaksiran: pawn.nilaiTaksiran,
      hargaPasar: pawn.hargaPasar ?? null,
      kondisiFisik: pawn.kondisiFisik ?? null,
      kodeRakVault: pawn.kodeRakVault ?? null,
      pokokGadai: pawn.pokokGadai ?? null,
      persenSewaModal: pawn.persenSewaModal ?? null,
      status: pawn.status,
      ttdPeminjam: pawn.tandaTanganPeminjam ?? null,
      ttdPada: pawn.tandaTanganPada ?? null,
      persetujuanPada: pawn.persetujuanSyaratPada ?? null,
      persetujuanVersi: pawn.persetujuanSyaratVersi ?? null,
      persetujuanMode: pawn.persetujuanMode ?? null,
      ttdManualPada: pawn.ttdManualPada ?? null,
      ttdManualOleh: pawn.ttdManualOleh ?? null,
      ttdManualUrl: await tautanKontrakManual(pawn.ttdManualBerkasId),
    };
  },
});

/** Data tanda tangan elektronik peminjam untuk e-contract. */
export const contractData = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    return {
      ttdPeminjam: loan.tandaTanganPeminjam ?? null,
      ttdPada: loan.tandaTanganPada ?? null,
      persetujuanPada: loan.persetujuanSyaratPada ?? null,
      persetujuanVersi: loan.persetujuanSyaratVersi ?? null,
      persetujuanMode: loan.persetujuanMode ?? null,
      ttdManualPada: loan.ttdManualPada ?? null,
      ttdManualOleh: loan.ttdManualOleh ?? null,
      ttdManualUrl: await tautanKontrakManual(loan.ttdManualBerkasId),
    };
  },
});

/**
 * Simpan persetujuan syarat Peminjam — admin memfasilitasi pengisian di hadapan
 * Peminjam; sistem tidak memverifikasi identitas fisik orang yang menggunakan
 * kanvas.
 *
 * `dataUrl` opsional: persetujuan boleh dicatat tanpa gambar tanda tangan
 * elektronik karena dokumen disiapkan untuk ditandatangani manual setelah
 * diunduh. Bila `dataUrl` dikirim, sidik jari kontrak diterbitkan dalam
 * transaksi yang sama supaya tidak ada kontrak tertanda tangan tanpa kode
 * verifikasi.
 */
export const simpanTandaTangan = mutation({
  args: {
    loanId: v.id("loans"),
    dataUrl: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("elektronik"), v.literal("manual"))),
    persetujuanPeminjam: v.literal(true),
  },
  handler: async (ctx, { loanId, dataUrl, mode }) => {
    const { userId, user } = await requireAdmin(ctx);
    if (dataUrl !== undefined) validasiDataTandaTangan(dataUrl);
    if (mode === "manual" && dataUrl !== undefined) {
      throw new Error("Jalur TTD manual tidak mengirim gambar tanda tangan.");
    }
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pengajuan pinjaman tidak ditemukan.");
    if (loan.status === "ditolak") {
      throw new Error("Kontrak pinjaman yang ditolak tidak dapat ditandatangani.");
    }
    // Aturan persetujuan dipakai juga oleh jalur mandiri peminjam. Sidik jari
    // terbit bila kontrak punya gambar tanda tangan — baik yang baru dibubuhkan
    // sekarang maupun yang sudah tersimpan dari pengajuan. Persetujuan tanpa
    // gambar tetap tercatat dan disiapkan untuk TTD manual.
    const hasil = await simpanPersetujuanPinjaman(ctx, loan, dataUrl, {
      ...(mode !== undefined ? { mode } : {}),
      ...(mode === "manual" ? { pakaiTandaTanganTersimpan: false } : {}),
    });
    const digital = hasil.digital;
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kontrak_pinjaman_disetujui",
      loan.nomorReferensi,
      digital !== null
        ? `Peminjam menyetujui syarat ${CONTRACT_TERMS_VERSION} dan menandatangani melalui alur yang difasilitasi admin. Kode verifikasi ${digital.kode}, SHA-256 ${digital.hash}.`
        : `Peminjam menyetujui syarat ${CONTRACT_TERMS_VERSION} tanpa gambar tanda tangan elektronik; dokumen disiapkan untuk tanda tangan manual.`,
    );
    return {
      ok: true,
      waktu: hasil.waktu,
      versi: CONTRACT_TERMS_VERSION,
      kode: digital?.kode ?? null,
    };
  },
});

/**
 * Simpan persetujuan dan (bila ada) tanda tangan Peminjam pada akad gadai.
 * Tanda tangan elektronik opsional agar akad dapat disetujui lebih dulu, lalu
 * diunduh dan ditandatangani manual.
 */
export const simpanTandaTanganGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    dataUrl: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("elektronik"), v.literal("manual"))),
    persetujuanPeminjam: v.literal(true),
  },
  handler: async (ctx, { pawnId, dataUrl, mode }) => {
    const { userId, user } = await requireAdmin(ctx);
    if (dataUrl !== undefined) validasiDataTandaTangan(dataUrl);
    if (mode === "manual" && dataUrl !== undefined) {
      throw new Error("Jalur TTD manual tidak mengirim gambar tanda tangan.");
    }
    const pawn = await ctx.db.get(pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status === "ditolak") {
      throw new Error("Akad gadai yang ditolak tidak dapat ditandatangani.");
    }
    if (pawn.nilaiTaksiran === undefined) {
      throw new Error("Akad gadai belum memiliki nilai taksiran.");
    }
    if (pawn.pokokGadai === undefined || pawn.persenSewaModal === undefined) {
      throw new Error("Tetapkan pokok gadai dan sewa modal sebelum meminta persetujuan.");
    }
    const hasil = await simpanPersetujuanGadai(ctx, pawn, dataUrl, {
      ...(mode !== undefined ? { mode } : {}),
      ...(mode === "manual" ? { pakaiTandaTanganTersimpan: false } : {}),
    });
    const digital = hasil.digital;
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kontrak_gadai_disetujui",
      pawn.nomorReferensi,
      digital !== null
        ? `Peminjam menyetujui syarat ${CONTRACT_TERMS_VERSION} dan menandatangani melalui alur yang difasilitasi admin. Kode verifikasi ${digital.kode}, SHA-256 ${digital.hash}.`
        : `Peminjam menyetujui syarat ${CONTRACT_TERMS_VERSION} tanpa gambar tanda tangan elektronik; dokumen disiapkan untuk tanda tangan manual.`,
    );
    return {
      ok: true,
      waktu: hasil.waktu,
      versi: CONTRACT_TERMS_VERSION,
      kode: digital?.kode ?? null,
    };
  },
});

/** URL unggah bukti kontrak bertanda tangan manual — admin saja. */
export const generateKontrakManualUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Terima berkas kontrak yang sudah ditandatangani manual.
 *
 * Berkasnya TIDAK diubah menjadi gambar tanda tangan elektronik: kolom
 * `tandaTanganPeminjam` tetap kosong. Yang dicatat hanya bukti berkas, waktu,
 * dan nama petugas penerima, sehingga status "TTD manual diterima" jujur dan
 * dapat diaudit.
 */
export const lampirkanKontrakManualPinjaman = mutation({
  args: { loanId: v.id("loans"), berkasId: v.id("_storage") },
  handler: async (ctx, { loanId, berkasId }) => {
    const { userId, user } = await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pengajuan pinjaman tidak ditemukan.");
    if (loan.status === "ditolak" || loan.status === "dibatalkan") {
      throw new Error("Kontrak pengajuan ini tidak dapat dilampiri bukti TTD manual.");
    }
    if (loan.persetujuanSyaratPada === undefined) {
      throw new Error("Setujui perjanjian terlebih dahulu sebelum mengunggah bukti TTD manual.");
    }
    await periksaBerkasIdentitasStorage(ctx, "Kontrak bertanda tangan", berkasId, {
      bolehPdf: true,
    });

    const lama = loan.ttdManualBerkasId;
    const now = Date.now();
    await ctx.db.patch(loanId, {
      ttdManualBerkasId: berkasId,
      ttdManualPada: now,
      ttdManualOleh: user.email ?? user.name ?? "admin",
    });
    if (lama !== undefined && lama !== berkasId) {
      await ctx.storage.delete(lama);
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kontrak_manual_pinjaman_diterima",
      loan.nomorReferensi,
      `Admin menerima berkas kontrak pinjaman yang ditandatangani manual (storage ${berkasId}).`,
    );
    return { ok: true, waktu: now, oleh: user.email ?? user.name ?? "admin" };
  },
});

/** Bukti TTD manual untuk akad gadai; aturannya sama dengan pinjaman. */
export const lampirkanKontrakManualGadai = mutation({
  args: { pawnId: v.id("pawns"), berkasId: v.id("_storage") },
  handler: async (ctx, { pawnId, berkasId }) => {
    const { userId, user } = await requireAdmin(ctx);
    const pawn = await ctx.db.get(pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status === "ditolak") {
      throw new Error("Akad gadai yang ditolak tidak dapat dilampiri bukti TTD manual.");
    }
    if (pawn.persetujuanSyaratPada === undefined) {
      throw new Error("Setujui akad terlebih dahulu sebelum mengunggah bukti TTD manual.");
    }
    await periksaBerkasIdentitasStorage(ctx, "Akad bertanda tangan", berkasId, {
      bolehPdf: true,
    });

    const lama = pawn.ttdManualBerkasId;
    const now = Date.now();
    await ctx.db.patch(pawnId, {
      ttdManualBerkasId: berkasId,
      ttdManualPada: now,
      ttdManualOleh: user.email ?? user.name ?? "admin",
    });
    if (lama !== undefined && lama !== berkasId) {
      await ctx.storage.delete(lama);
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kontrak_manual_gadai_diterima",
      pawn.nomorReferensi,
      `Admin menerima berkas akad gadai yang ditandatangani manual (storage ${berkasId}).`,
    );
    return { ok: true, waktu: now, oleh: user.email ?? user.name ?? "admin" };
  },
});

/**
 * Seed aplikasi pinjaman tunai dari akun penyedia dana + peminjam yang
 * sudah ada. Digunakan oleh skrip migrasi/dev, bukan dari klien. Append-only:
 * mencatat aplikasi sebagai jurnal internal, jadi semua transaksi yang
 * terkait tetap dapat dilihat dari ledger internal.
 */
export const seedLoanApplication = internalMutation({      args: {
    danaId: v.id("users"),
    peminjamId: v.id("users"),
    kodePeminjam: v.string(),
    pokokPinjaman: v.optional(v.number()),
    nik: v.string(),
    nomorRekening: v.string(),
    nomorWhatsApp: v.string(),
    penghasilanBulanan: v.number(),
    sumberPenghasilan: v.string(),
    tujuan: v.string(),
    catatanPeminjam: v.optional(v.string()),
    namaLengkap: v.string(),
    namaBank: v.string(),
    status: v.union(
      v.literal("diajukan"),
      v.literal("sedang_direview"),
      v.literal("disetujui"),
      v.literal("ditolak"),
      v.literal("didanai"),
      v.literal("lunas"),
    ),
    tenorBulan: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existingAdmin = (await ctx.db.query("users")
      .filter((q) => q.eq(q.field("email"), "admin@pindai.test"))
      .first()) as {
      _id: string;
      email: string;
      role: "admin";
      emailVerificationTime?: number;
    } | null;
    // Fail-closed: seed hanya berlaku bila admin terverifikasi yang sudah
    // ada. Jangan otomatis membuat admin — akun admin itu wajib disiapkan
    // terlebih dahulu (bootstrap / terima email), agar penambahan data
    // selalu di bawah kendali operator.
    if (
      existingAdmin === null ||
      existingAdmin.role !== ROLES.ADMIN ||
      existingAdmin.emailVerificationTime === undefined
    ) {
      throw new Error(
        "Seed aplikasi pinjaman wajib dijalankan oleh admin terverifikasi admin@pindai.test yang sudah ada.",
      );
    }
    const dana = await ctx.db.get(args.danaId);
    if (dana === null || dana.role !== ROLES.DANA) {
      throw new Error("Penyalur dana seed harus ada dengan peran penyedia dana.");
    }
    const peminjam = await ctx.db.get(args.peminjamId);
    if (peminjam === null || peminjam.role !== ROLES.PEMINJAM) {
      throw new Error("Peminjam seed harus ada dengan peran peminjam.");
    }

    const now = Date.now();
    const nomorReferensi = `PGD-SEED-${now}`;
    // Pokok ditentukan argumen opsional (default 1.500.000). Dipakai untuk
    // DOKUMEN pinjaman sekaligus JURNAL, sehingga keduanya tidak pernah bisa
    // berbeda ketika pemanggil mengisi pokokPinjaman.
    const pokokPinjaman: number = args.pokokPinjaman ?? 1_500_000;

    const loanId = await ctx.db.insert("loans", {
      userId: args.peminjamId,
      pokokPinjaman,
      pokokDiajukan: pokokPinjaman,
      tujuan: args.tujuan,
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
      namaLengkap: args.namaLengkap,
      namaBank: args.namaBank,
      nomorRekening: args.nomorRekening,
      status: args.status,
      nomorReferensi,
      tenorHari: args.tenorBulan !== undefined ? args.tenorBulan * 30 : 30,
      tenorBulan: args.tenorBulan ?? undefined,
      nik: args.nik,
      nomorWhatsApp: args.nomorWhatsApp,
      penghasilanBulanan: args.penghasilanBulanan,
      sumberPenghasilan: args.sumberPenghasilan,
      pendanaId: args.danaId,
      pendanaNama: dana.name ?? "Pendana",
      lokasiAjukan: {
        lat: -6.2147,
        lng: 106.8456,
        akurasi: 25,
        waktu: now,
      },
    });
    // Aplikasi pinjaman yang disetujui tercatat otomatis sebagai jurnal
    // internal berpasangan (Rule 5.1): biaya platform 2% dibebankan ke dompet
    // penyedia dana dan diakui sebagai pendapatan platform:FEE.
    if (args.status === "disetujui" || args.status === "didanai") {
      const biayaPlatform: number = Math.round(pokokPinjaman * 0.02);
      const pinjamanAkun = `pinjaman:${loanId}`;
      const danaAkun = `dana:WALLET:${args.danaId}`;
      const platformAkun = "platform:FEE";
      const spec: JournalSpec = {
        jenis: "platform_fee",
        keterangan: `Biaya admin & platform ${nomorReferensi}`,
        aktor: "admin@pindai.test",
        lines: [
          // Pokok pinjaman: satu baris debit (pihak peminjam) + satu baris
          // kredit (pihak dana) ke akun pinjaman:<loanId>. Dua baris ini
          // saling meniadakan, sehingga akun pinjaman:<loanId> hanya punya
          // debit == kredit == pokokPinjaman dan seimbang.
          { akun: pinjamanAkun, arah: "debit", jumlah: pokokPinjaman },
          { akun: pinjamanAkun, arah: "kredit", jumlah: pokokPinjaman },
          // Biaya platform 2% diakui sebagai pendapatan: debit platform:FEE
          // (konvensi sama dengan alokasiDana.ts) yang membuat entri ini
          // terhitung di ledgerSummary.pendapatanPlatform.
          { akun: platformAkun, arah: "debit", jumlah: biayaPlatform },
          // Dompet penyedia dana dibebani biaya tersebut — kredit menurunkan
          // saldo danaWalletBalance (debit == naik, kredit == turun).
          { akun: danaAkun, arah: "kredit", jumlah: biayaPlatform },
        ],
      };
      try {
        await appendJournal(ctx, spec);
      } catch (cause) {
        // Jurnal gagal = masalah konfigurasi internal, bukan kegagalan
        // aplikasi itu sendiri. Tangkap, catat, dan lanjutkan: data pinjaman
        // tetap terseimpan.
        await audit(
          ctx,
          existingAdmin._id,
          existingAdmin.email ?? "admin",
          "seed_jurnal_gagal",
          nomorReferensi,
          `${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }

    return { loanId, nomorReferensi };
  },
});

/** Reset eksplisit untuk development: hapus semua pinjaman dan seluruh ledger. */
export const resetDevelopmentLoansAndLedger = internalMutation({
  args: {
    confirmation: v.literal("RESET_DEVELOPMENT_LOANS_AND_LEDGER"),
    resetFunds: v.optional(v.boolean()),
    resetPawns: v.optional(v.boolean()),
  },
  handler: async (ctx) => {
    const [loans, entries, pawns, fundings] = await Promise.all([
      ctx.db.query("loans").collect(),
      ctx.db.query("ledger_entries").collect(),
      ctx.db.query("pawns").collect(),
      ctx.db.query("fundings").collect(),
    ]);
    const total = loans.length + entries.length + pawns.length + fundings.length;
    if (total > 400) {
      throw new Error(
        `Reset dihentikan: ${total} dokumen melebihi batas aman 400. Gunakan prosedur batch khusus.`,
      );
    }

    for (const loan of loans) await ctx.db.delete(loan._id);
    for (const entry of entries) await ctx.db.delete(entry._id);
    for (const pawn of pawns) await ctx.db.delete(pawn._id);
    for (const funding of fundings) await ctx.db.delete(funding._id);

    return { deletedLoans: loans.length, deletedLedgerEntries: entries.length, deletedPawns: pawns.length, deletedFundings: fundings.length };
  },
});

/** Reset eksplisit untuk development: hapus semua gadai dan seluruh ledger. */
export const resetDevelopmentPawns = internalMutation({
  args: { confirmation: v.literal("RESET_DEVELOPMENT_PAWNS") },
  handler: async (ctx) => {
    const [pawns, payments, entries] = await Promise.all([
      ctx.db.query("pawns").collect(),
      ctx.db.query("pawnPayments").collect(),
      ctx.db.query("ledger_entries").collect(),
    ]);
    const total = pawns.length + payments.length + entries.length;
    if (total > 400) {
      throw new Error(
        `Reset dihentikan: ${total} dokumen melebihi batas aman 400. Gunakan prosedur batch khusus.`,
      );
    }

    for (const payment of payments) await ctx.db.delete(payment._id);
    for (const pawn of pawns) await ctx.db.delete(pawn._id);
    for (const entry of entries) await ctx.db.delete(entry._id);

    return {
      deletedPawns: pawns.length,
      deletedPawnPayments: payments.length,
      deletedLedgerEntries: entries.length,
    };
  },
});
