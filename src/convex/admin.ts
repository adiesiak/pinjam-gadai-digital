import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalAction, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";
import { requireAdminSession } from "./adminAuthz";
import { pelunasanPinjaman, quoteLoan } from "../lib/loan";
import { hitungSimulasiBulanan, TENOR_BULANAN_OPTIONS } from "../lib/bulanan";
import { ledgerTotals, appendJournal } from "./ledger";
import { JournalSpec } from "./ledger";
import { formatRupiah } from "../lib/money";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import { bagiHasilPinjaman } from "../lib/bagiHasil";
import { getConfig, audit } from "./system";
import { jarakKm } from "../lib/geo";
import {
  apakahPelunasanTepatWaktu,
  clampPlafon,
  plafonEfektif,
} from "../lib/plafon";
import { ensureKodePeminjam } from "./peminjamCode";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";

/** Gerbang admin — semua query/mutation di file ini dijaga. */
async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

// ===== Plafon pinjaman per nasabah (lihat lib/plafon.ts) =====

/**
 * Daftar Peminjam + plafon efektifnya — untuk panel atur plafon.
 * Menampilkan peminjam yang pernah bertransaksi (pernah mengajukan apa pun)
 * ditambah pengguna dengan override; bukan seluruh tabel users.
 */
export const daftarPlafonPeminjam = query({
  args: { cari: v.optional(v.string()) },
  handler: async (ctx, { cari }) => {
    await requireAdmin(ctx);
    const cfg = await getConfig(ctx);
    const kata = cari?.trim().toLowerCase() ?? "";

    const loans = await ctx.db.query("loans").collect();
    const kredits = await ctx.db.query("kreditBarang").collect();
    const pelunasanTepatWaktuPerUser = new Map<string, number>();
    for (const loan of loans) {
      if (!apakahPelunasanTepatWaktu(loan)) continue;
      pelunasanTepatWaktuPerUser.set(
        loan.userId,
        (pelunasanTepatWaktuPerUser.get(loan.userId) ?? 0) + 1,
      );
    }
    const idPeminjam = new Set<string>();
    for (const l of loans) idPeminjam.add(l.userId);
    for (const k of kredits) idPeminjam.add(k.userId);

    const hasil: Array<{
      userId: string;
      nama: string;
      email: string | null;
      plafonPribadi: number | null;
      plafonEfektif: number;
      jumlahPelunasanTepatWaktu: number;
      jumlahPengajuan: number;
      pinjamanAktif: number;
    }> = [];
    for (const id of idPeminjam) {
      const user = (await ctx.db.get(id as never)) as
        | {
            name?: string;
            email?: string;
            role?: string;
            plafonPinjaman?: number;
          }
        | null;
      if (user === null) continue;
      const pinjamanUser = loans.filter((l) => l.userId === id);
      const kreditUser = kredits.filter((k) => k.userId === id);
      const nama = (user.name ?? user.email ?? "Peminjam").toLowerCase();
      if (kata !== "" && !nama.includes(kata) && !(user.email ?? "").toLowerCase().includes(kata)) {
        continue;
      }
      hasil.push({
        userId: id,
        nama: user.name ?? user.email ?? "Peminjam",
        email: user.email ?? null,
        plafonPribadi: user.plafonPinjaman ?? null,
        plafonEfektif: plafonEfektif(
          user.plafonPinjaman,
          cfg.plafonPinjaman,
          pelunasanTepatWaktuPerUser.get(id) ?? 0,
        ),
        jumlahPelunasanTepatWaktu: pelunasanTepatWaktuPerUser.get(id) ?? 0,
        jumlahPengajuan: pinjamanUser.length + kreditUser.length,
        pinjamanAktif: pinjamanUser.filter((l) => l.status === "didanai").length,
      });
    }
    hasil.sort((a, b) => b.jumlahPengajuan - a.jumlahPengajuan || a.nama.localeCompare(b.nama));
    return { default: cfg.plafonPinjaman, rows: hasil.slice(0, 100) };
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
    const sebelumnya = plafonEfektif(
      target.plafonPinjaman,
      cfg.plafonPinjaman,
      jumlahPelunasanTepatWaktu,
    );
    const sesudah = plafonEfektif(
      nilaiBaru,
      cfg.plafonPinjaman,
      jumlahPelunasanTepatWaktu,
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

    const loanRows = await Promise.all(
      loans
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (l) => {
          const borrower = await ctx.db.get(l.userId);
          const pelunasan = pelunasanPinjaman(l, Date.now());
          // Skema bulanan (tenorBulan 1/3/6+): angka dari engine lib/bulanan —
          // bukan 130% — agar tim menelaah kewajiban yang benar.
          const bulanan =
            l.tenorBulan !== undefined
              ? hitungSimulasiBulanan(l.pokokPinjaman, l.tenorBulan)
              : null;
          const harian = bulanan === null ? quoteLoan(l.pokokPinjaman) : null;
          return {
            _id: l._id,
            _creationTime: l._creationTime,
            nomorReferensi: l.nomorReferensi,
            pokokPinjaman: l.pokokPinjaman,
            pokokDiajukan: l.pokokDiajukan ?? l.pokokPinjaman,
            tujuan: l.tujuan,
            status: l.status,
            catatanReview: l.catatanReview,
            namaLengkap: l.namaLengkap,
            nomorRekening: l.nomorRekening,
            namaBank: l.namaBank ?? null,
            catatanPeminjam: l.catatanPeminjam,
            emailPeminjam: borrower?.email ?? null,
            userIdPeminjam: l.userId,
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
            // Skema B: pendanaan & sisa pokok berjalan (decreasing principal).
            pokokGadai: p.pokokGadai,
            persenSewaModal: p.persenSewaModal,
            sisaPokok: p.sisaPokok,
            dicairkanPada: p.dicairkanPada,
          };
        }),
    );

    // Ringkasan pengajuan kredit barang (Skema C) untuk penghitung tab admin;
    // rincian lengkap dibaca panel verifikasi lewat api.kredit.antreanKreditBarang.
    const kreditRows = (await ctx.db.query("kreditBarang").collect())
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

    return { isAdmin: true, loans: loanRows, pawns: pawnRows, kredit: kreditRows };
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
 * URL Convex storage bertanda tangan & berkedaluwarsa.
 */
export const dokumenKycUrls = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const [ktp, selfie, slip] = await Promise.all([
      loan.dokKtpId ? ctx.storage.getUrl(loan.dokKtpId) : null,
      loan.dokSelfieKtpId ? ctx.storage.getUrl(loan.dokSelfieKtpId) : null,
      loan.dokSlipGajiId ? ctx.storage.getUrl(loan.dokSlipGajiId) : null,
    ]);
    return {
      ktpUrl: ktp,
      selfieUrl: selfie,
      slipUrl: slip,
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
export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").collect();
    const pawns = await ctx.db.query("pawns").collect();

    const pendingLoans = loans.filter((l) => l.status === "diajukan").length;
    const pendingPawns = pawns.filter(
      (p) => p.status === "diajukan" || p.status === "sedang_dinilai",
    ).length;
    const taksiranTotal = pawns
      .filter((p) => p.status === "disetujui" && p.nilaiTaksiran !== undefined)
      .reduce((acc, p) => acc + (p.nilaiTaksiran ?? 0), 0);

    // Keterlambatan pelunasan — dihitung live dari tanggal pendanaan + tenor.
    let pinjamanTerlambat = 0;
    let totalDendaBerjalan = 0;
    for (const l of loans) {
      if (l.status !== "didanai") continue;
      const info = pelunasanPinjaman(l, Date.now());
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
      .filter((l) => l.status === "diajukan")
      .reduce((acc, l) => acc + (l.pokokDiajukan ?? l.pokokPinjaman), 0);

    const cfg = await getConfig(ctx);

    // Keuntungan admin = potongan admin atas kewajiban pinjaman, memakai model
    // yang sama dengan panel penyedia dana (lib/bagiHasil.ts). Baris warisan
    // yang pokoknya bukan rupiah bulat dilewati agar satu dokumen lama tidak
    // merobohkan ringkasan.
    const keuntunganAdminSatu = (pokok: number): number => {
      try {
        return bagiHasilPinjaman(pokok, cfg.persenBunga, cfg.persenAdmin)
          .keuntunganAdmin;
      } catch {
        return 0;
      }
    };
    // Sudah tercatat: pinjaman lunas — potongan adminnya sudah dibukukan saat
    // pelunasan. Belum tercatat: pinjaman yang masih berjalan, potongannya
    // belum direalisasi sampai pinjaman ditutup.
    const keuntunganAdminTercatat = loans
      .filter((l) => l.status === "lunas")
      .reduce((acc, l) => acc + keuntunganAdminSatu(l.pokokPinjaman), 0);
    const keuntunganAdminBelumTercatat = loans
      .filter((l) => l.status === "didanai")
      .reduce((acc, l) => acc + keuntunganAdminSatu(l.pokokPinjaman), 0);

    // GPS mismatch: posisi terakhir peminjam aktif vs gudang brankas.
    const vault = { lat: cfg.vaultLat, lng: cfg.vaultLng };
    let gpsMismatch = 0;
    for (const l of loans) {
      if (l.status !== "didanai") continue;
      const titik = await ctx.db
        .query("lokasiJejak")
        .withIndex("by_user", (q) => q.eq("userId", l.userId))
        .order("desc")
        .first();
      if (
        titik &&
        jarakKm({ lat: titik.lat, lng: titik.lng }, vault) > cfg.gpsMismatchKm
      ) {
        gpsMismatch += 1;
      }
    }

    // Satu baca untuk seluruh status lokasi: dipakai menghitung pinjaman yang
    // lokasinya tidak mengalir sekaligus titik yang ditandai mencurigakan
    // (indikasi lokasi palsu). Tabel ini satu baris per pengguna.
    const statusLokasi = await ctx.db.query("lokasiStatus").collect();
    const waktuLokasiPerPeminjam = new Map<string, number>();
    for (const s of statusLokasi) {
      waktuLokasiPerPeminjam.set(s.userId as string, s.waktu);
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
      pinjamanTerlambat,
      totalDendaBerjalan,
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
  },
});

// Re-quote helper dipakai ulang untuk tampilan admin (rincian biaya pinjaman).
// tenorBulan diisi → rincian skema bulanan (DP 0%, biaya 5% tenor 3/6 atau
// 3% tenor 1 dipotong di muka, bunga flat per tenor); kosong → skema
// harian 130%.
export const adminLoanQuote = query({
  args: { pokokPinjaman: v.number(), tenorBulan: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.tenorBulan !== undefined) {
      const sim = hitungSimulasiBulanan(args.pokokPinjaman, args.tenorBulan);
      return {
        skema: "bulanan" as const,
        tenorBulan: args.tenorBulan,
        tenorBulanTersedia: TENOR_BULANAN_OPTIONS,
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
        quote: quoteLoan(args.pokokPinjaman),
      };
    }
    return { skema: "harian" as const, quote: quoteLoan(args.pokokPinjaman) };
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
 * Ringkasan ledger untuk kartu kesehatan sistem di panel admin.
 * `pendapatanPlatform` = total entri `platform_fee` pada akun platform:FEE
 * (debit maupun kredit — sewa modal gadai dibayar dari arah kredit);
 * `rincianSkema` memecahnya per lini usaha.
 */
export const ledgerSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const totals = await ledgerTotals(ctx);
    // Pendapatan platform = setiap entri `platform_fee` pada akun
    // platform:FEE (debit maupun kredit). Terdiri dari:
    //  - pinjaman: biaya admin & platform 2% + 3% dipotong di muka saat pendanaan penuh
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
      // Setiap jurnal platform_fee menyentuh platform:FEE tepat satu kali;
      // jumlah entri itulah pendapatan yang diakui — arahnya bisa debit
      // (biaya dipotong ke platform) atau kredit (sewa modal dibayar dari
      // akun gadai: D gadai:<id> / K platform:FEE). Keduanya dihitung.
      if (e.jenis !== "platform_fee" || e.akun !== "platform:FEE") {
        continue;
      }
      pendapatanPlatform += e.jumlah;
      // Klasifikasi dari keterangan jurnal yang ditulis saat penerimaan:
      //  - "Biaya admin & platform <REF>" (pinjaman tunai)
      //  - "Potongan muka 1% gadai <REF>" / "Sewa modal <REF>" (gadai)
      //  - "Biaya layanan platform <REF> (Kredit Barang)"
      //  - "Biaya layanan cicilan <REF> bulan n/tenor"
      const ket = e.keterangan.toLowerCase();
      if (
        ket.includes("kredit barang") ||
        ket.includes("biaya layanan cicilan")
      ) {
        rincianSkema.kredit += e.jumlah;
      } else if (ket.includes("gadai") || ket.includes("sewa modal")) {
        rincianSkema.gadai += e.jumlah;
      } else if (ket.includes("biaya admin") || ket.includes("pinjaman")) {
        rincianSkema.pinjaman += e.jumlah;
      } else {
        rincianSkema.lainnya += e.jumlah;
      }
    }
    return { ...totals, pendapatanPlatform, rincianSkema };
  },
});

/**
 * Tren pendapatan platform per bulan kalender (WIB) — 12 bulan terakhir,
 * tertua → terbaru. Bulan tanpa transaksi tetap muncul dengan nilai 0.
 * Sumber: entri `platform_fee` pada akun platform:FEE (sumber sama dengan
 * ledgerSummary), sehingga Σ semua bulan = pendapatanPlatform.
 */
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
      if (e.jenis !== "platform_fee" || e.akun !== "platform:FEE") continue;
      const kunci = kunciBulan(e.waktu);
      perBulan.set(kunci, (perBulan.get(kunci) ?? 0) + e.jumlah);
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

/** Baris ledger untuk export CSV & tab Ledger (admin). */
export const ledgerRows = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("ledger_entries").collect();
  },
});

/**
 * Titik lokasi peminjam untuk peta live (OpenStreetMap): satu baris per
 * peminjam dengan pinjaman — posisi realtime (jejak) atau lokasi pengajuan.
 */
export const petaPeminjam = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const cfg = await getConfig(ctx);
    const vault = { lat: cfg.vaultLat, lng: cfg.vaultLng };
    const loans = await ctx.db.query("loans").collect();
    const rows: Array<{
      userId: string;
      namaLengkap: string;
      nomorReferensi: string;
      statusPinjaman: string;
      posisi: { lat: number; lng: number; waktu: number; sumber: string } | null;
      jarakVaultKm: number | null;
      mismatch: boolean;
      /** Tanda kecurigaan lokasi palsu pada titik terakhir (kosong = normal). */
      tanda: string[];
    }> = [];
    const seen = new Set<string>();
    for (const l of loans) {
      if (seen.has(l.userId)) continue;
      seen.add(l.userId);
      const titik = await ctx.db
        .query("lokasiJejak")
        .withIndex("by_user", (q) => q.eq("userId", l.userId))
        .order("desc")
        .first();
      const lok = l.lokasiAjukan;
      const posisi = titik
        ? { lat: titik.lat, lng: titik.lng, waktu: titik.waktu, sumber: "realtime" }
        : lok
          ? { lat: lok.lat, lng: lok.lng, waktu: lok.waktu, sumber: "pengajuan" }
          : null;
      const jarak = posisi ? jarakKm(posisi, vault) : null;
      rows.push({
        userId: l.userId,
        namaLengkap: l.namaLengkap,
        nomorReferensi: l.nomorReferensi,
        statusPinjaman: l.status,
        posisi,
        jarakVaultKm: jarak,
        mismatch: jarak !== null && jarak > cfg.gpsMismatchKm,
        tanda: titik?.tanda ?? [],
      });
    }
    return { vault, gpsMismatchKm: cfg.gpsMismatchKm, rows };
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
        nama: user?.name ?? user?.email ?? "Nasabah",
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
      bulanan:
        loan.tenorBulan !== undefined
          ? hitungSimulasiBulanan(loan.pokokPinjaman, loan.tenorBulan)
          : null,
      quote: quoteLoan(loan.pokokPinjaman),
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
    };
  },
});

function validasiDataTandaTangan(dataUrl: string) {
  const prefix = "data:image/png;base64,";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
    throw new Error("Format tanda tangan tidak valid.");
  }
  if (dataUrl.length > 200_000) {
    throw new Error("Data tanda tangan terlalu besar.");
  }
  if (dataUrl.length <= prefix.length + 16) {
    throw new Error("Tanda tangan masih kosong.");
  }
}

/**
 * Simpan persetujuan syarat dan tanda tangan Peminjam sekaligus — admin
 * memfasilitasi pengisian di hadapan Peminjam; sistem tidak memverifikasi
 * identitas fisik orang yang menggunakan kanvas.
 */
export const simpanTandaTangan = mutation({
  args: {
    loanId: v.id("loans"),
    dataUrl: v.string(),
    persetujuanPeminjam: v.literal(true),
  },
  handler: async (ctx, { loanId, dataUrl }) => {
    const { userId, user } = await requireAdmin(ctx);
    validasiDataTandaTangan(dataUrl);
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pengajuan pinjaman tidak ditemukan.");
    if (loan.status === "ditolak") {
      throw new Error("Kontrak pinjaman yang ditolak tidak dapat ditandatangani.");
    }
    if (
      loan.tandaTanganPeminjam !== undefined &&
      loan.persetujuanSyaratPada !== undefined &&
      loan.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION
    ) {
      throw new Error("Kontrak ini sudah disetujui dan ditandatangani.");
    }

    const now = Date.now();
    await ctx.db.patch(loanId, {
      tandaTanganPeminjam: dataUrl,
      tandaTanganPada: now,
      persetujuanSyaratPada: now,
      persetujuanSyaratVersi: CONTRACT_TERMS_VERSION,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kontrak_pinjaman_disetujui",
      loan.nomorReferensi,
      `Peminjam menyetujui syarat ${CONTRACT_TERMS_VERSION} dan menandatangani melalui alur yang difasilitasi admin.`,
    );
    return { ok: true, waktu: now, versi: CONTRACT_TERMS_VERSION };
  },
});

/** Simpan persetujuan dan tanda tangan Peminjam pada akad gadai secara atomik. */
export const simpanTandaTanganGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    dataUrl: v.string(),
    persetujuanPeminjam: v.literal(true),
  },
  handler: async (ctx, { pawnId, dataUrl }) => {
    const { userId, user } = await requireAdmin(ctx);
    validasiDataTandaTangan(dataUrl);
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
    if (
      pawn.tandaTanganPeminjam !== undefined &&
      pawn.persetujuanSyaratPada !== undefined &&
      pawn.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION
    ) {
      throw new Error("Akad gadai ini sudah disetujui dan ditandatangani.");
    }

    const now = Date.now();
    await ctx.db.patch(pawnId, {
      tandaTanganPeminjam: dataUrl,
      tandaTanganPada: now,
      persetujuanSyaratPada: now,
      persetujuanSyaratVersi: CONTRACT_TERMS_VERSION,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kontrak_gadai_disetujui",
      pawn.nomorReferensi,
      `Peminjam menyetujui syarat ${CONTRACT_TERMS_VERSION} dan menandatangani melalui alur yang difasilitasi admin.`,
    );
    return { ok: true, waktu: now, versi: CONTRACT_TERMS_VERSION };
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
      pendanaNama: dana.name ?? "Penyedia Dana",
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
