import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";
import { pelunasanPinjaman, quoteLoan } from "../lib/loan";
import { hitungSimulasiBulanan, TENOR_BULANAN_OPTIONS } from "../lib/bulanan";
import { appendJournal, ledgerTotals, pendanaWalletBalance } from "./ledger";
import { formatRupiah } from "../lib/money";
import { getConfig, audit } from "./system";
import { jarakKm } from "../lib/geo";

/** Gerbang admin — semua query/mutation di file ini dijaga. */
async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
  }
  return { userId, user };
}

/**
 * Query gabungan untuk halaman admin: profil sendiri (untuk deteksi halaman)
 * plus antrean pengajuan. Digunakan juga oleh nasabah — untuk mereka
 * `isAdmin` false dan antrean selalu kosong, sehingga halaman admin bisa
 * mengandalkan satu query ini tanpa membocorkan apa pun.
 */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const me = await ctx.db.get(userId);
    if (me === null) throw new Error("Pengguna tidak ditemukan.");

    const isAdmin = me.role === ROLES.ADMIN;
    if (!isAdmin) {
      return { isAdmin: false, loans: [], pawns: [], kredit: [] };
    }

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
            tujuan: l.tujuan,
            status: l.status,
            catatanReview: l.catatanReview,
            namaLengkap: l.namaLengkap,
            nomorRekening: l.nomorRekening,
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
    const all = await ctx.db.query("users").collect();
    return all.some((u) => u.role === ROLES.ADMIN);
  },
});

/**
 * Bootstrap admin pertama — hanya boleh dipakai saat belum ada admin.
 * Akun tamu (anonim) diblokir: wajib email terverifikasi.
 */
export const bootstrapFirstAdmin = mutation({
  args: {},
  handler: async (ctx) => {
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
    if (me.isAnonymous === true || !me.email) {
      throw new Error(
        "Bootstrap admin wajib memakai akun email terverifikasi, bukan akun tamu.",
      );
    }

    await ctx.db.patch(userId, { role: ROLES.ADMIN });
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

    // Antrean pencairan: pinjaman disetujui menunggu pendanaan penuh.
    const antreanPencairan = loans.filter((l) => l.status === "disetujui").length;

    // GPS mismatch: posisi terakhir peminjam aktif vs gudang brankas.
    const cfg = await getConfig(ctx);
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

    return {
      pinjamanBaru: pendingLoans,
      gadaiProses: pendingPawns,
      totalPinjaman: loans.length,
      totalGadai: pawns.length,
      nilaiTaksiranDisetujui: taksiranTotal,
      pinjamanTerlambat,
      totalDendaBerjalan,
      antreanPencairan,
      gpsMismatch,
      /** Pinjaman aktif tanpa titik lokasi segar (gerbang lokasi wajib). */
      pinjamanTanpaLokasi,
      /** Peminjam dengan titik lokasi terakhir yang dicurigai palsu. */
      titikDicurigai,
    };
  },
});

// Re-quote helper dipakai ulang untuk tampilan admin (rincian biaya pinjaman).
// tenorBulan diisi → rincian skema bulanan (DP 0%, biaya layanan 3%
// diamortisasi, bunga menurun per tenor); kosong → skema harian 130%.
export const adminLoanQuote = query({
  args: { pokokPinjaman: v.number(), tenorBulan: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    if (args.tenorBulan !== undefined) {
      const sim = hitungSimulasiBulanan(args.pokokPinjaman, args.tenorBulan);
      return {
        skema: "bulanan" as const,
        tenorBulan: args.tenorBulan,
        tenorBulanTersedia: TENOR_BULANAN_OPTIONS,
        pokokDibiayai: sim.pokokDibiayai,
        dp: sim.dp,
        biayaLayanan: sim.biayaLayananTotal,
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

// =====================================================================
// Verifikasi setoran Pendana
// =====================================================================

/** Antrean setoran Pendana yang menunggu verifikasi. */
export const pendingDeposits = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_status", (q) => q.eq("status", "menunggu_verifikasi"))
      .collect();
    const result = [];
    for (const d of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const pendana = await ctx.db.get(d.pendanaId);
      result.push({
        _id: d._id,
        _creationTime: d._creationTime,
        nomorReferensi: d.nomorReferensi,
        jumlah: d.jumlah,
        referensiTransfer: d.referensiTransfer,
        emailPendana: pendana?.email ?? null,
      });
    }
    return result;
  },
});

/** Antrean penarikan Pendana menunggu diproses (untuk panel admin). */
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
      const pendana = await ctx.db.get(w.pendanaId);
      result.push({
        _id: w._id,
        _creationTime: w._creationTime,
        nomorReferensi: w.nomorReferensi,
        jumlah: w.jumlah,
        namaBank: w.namaBank,
        nomorRekening: w.nomorRekening,
        emailPendana: pendana?.email ?? null,
      });
    }
    return result;
  },
});

/**
 * Proses penarikan — jurnal seimbang: kredit dompet Pendana (saldo turun),
 * debit kas platform (uang keluar). Saldo divalidasi ulang saat eksekusi.
 */
export const processWithdrawal = mutation({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx);
    const w = await ctx.db.get(args.withdrawalId);
    if (w === null) throw new Error("Permintaan penarikan tidak ditemukan.");
    if (w.status !== "menunggu_proses") {
      throw new Error("Permintaan penarikan ini sudah diputuskan.");
    }
    const saldo = await pendanaWalletBalance(ctx, w.pendanaId);
    if (saldo < w.jumlah) {
      throw new Error(
        `Saldo Pendana tidak cukup (saldo: ${formatRupiah(saldo)}). Tolak permintaan ini atau minta Pendana membatalkan.`,
      );
    }
    await appendJournal(ctx, {
      jenis: "withdrawal",
      keterangan: `Penarikan ${w.nomorReferensi} ke ${w.namaBank} ${w.nomorRekening}`,
      aktor: adminId,
      lines: [
        { akun: "platform:CASH", arah: "debit", jumlah: w.jumlah },
        { akun: `pendana:WALLET:${w.pendanaId}`, arah: "kredit", jumlah: w.jumlah },
      ],
    });
    await ctx.db.patch(args.withdrawalId, { status: "diproses" });
    return { success: true };
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
 * Konfirmasi setoran — menulis jurnal deposit seimbang ke ledger:
 * debit kas platform, kredit dompet Pendana.
 */
export const confirmDeposit = mutation({
  args: { depositId: v.id("deposits") },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx);
    const deposit = await ctx.db.get(args.depositId);
    if (deposit === null) throw new Error("Setoran tidak ditemukan.");
    if (deposit.status !== "menunggu_verifikasi") {
      throw new Error("Setoran ini sudah diputuskan.");
    }

    await appendJournal(ctx, {
      jenis: "deposit",
      keterangan: `Setoran ${deposit.nomorReferensi} terverifikasi (ref transfer: ${deposit.referensiTransfer})`,
      aktor: adminId,
      lines: [
        // Debit menaikkan saldo dompet Pendana; kredit mencatat kas platform.
        { akun: `pendana:WALLET:${deposit.pendanaId}`, arah: "debit", jumlah: deposit.jumlah },
        { akun: "platform:CASH", arah: "kredit", jumlah: deposit.jumlah },
      ],
    });

    await ctx.db.patch(args.depositId, { status: "terverifikasi" });
    return { success: true };
  },
});

/** Tolak setoran — wajib alasan; tidak menyentuh ledger. */
export const rejectDeposit = mutation({
  args: { depositId: v.id("deposits"), reason: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const deposit = await ctx.db.get(args.depositId);
    if (deposit === null) throw new Error("Setoran tidak ditemukan.");
    if (deposit.status !== "menunggu_verifikasi") {
      throw new Error("Setoran ini sudah diputuskan.");
    }
    if (!args.reason.trim()) {
      throw new Error("Penolakan wajib menyertakan alasan.");
    }
    await ctx.db.patch(args.depositId, {
      status: "ditolak",
      catatanAdmin: args.reason.trim(),
    });
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
    //  - pinjaman: biaya admin & platform 3% + 2% saat pendanaan penuh
    //  - gadai: potongan muka 1% (pencairan) + sewa modal periodik (bayar gadai)
    //  - kredit: biaya layanan 3% dari pokok dibiayai saat pendanaan penuh
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
      const ket = e.keterangan.toLowerCase();
      if (ket.includes("kredit barang")) {
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
      nomorRekening: loan.nomorRekening,
      nik: loan.nik ?? null,
      pokokPinjaman: loan.pokokPinjaman,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan ?? null,
      lokasiAjukan: loan.lokasiAjukan ?? null,
      // Skema bulanan memakai engine lib/bulanan; skema harian 130%.
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
      deskripsiBarang: pawn.deskripsiBarang,
      kategori: pawn.kategori,
      nilaiTaksiran: pawn.nilaiTaksiran,
      hargaPasar: pawn.hargaPasar ?? null,
      kondisiFisik: pawn.kondisiFisik ?? null,
      kodeRakVault: pawn.kodeRakVault ?? null,
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
    };
  },
});

/** Simpan tanda tangan canvas peminjam (data URL PNG) — admin. */
export const simpanTandaTangan = mutation({
  args: { loanId: v.id("loans"), dataUrl: v.string() },
  handler: async (ctx, { loanId, dataUrl }) => {
    const { userId, user } = await requireAdmin(ctx);
    if (!dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("Format tanda tangan tidak valid.");
    }
    if (dataUrl.length > 200_000) {
      throw new Error("Data tanda tangan terlalu besar.");
    }
    await ctx.db.patch(loanId, {
      tandaTanganPeminjam: dataUrl,
      tandaTanganPada: Date.now(),
    });
    const loan = await ctx.db.get(loanId);
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "tanda_tangan",
      loan?.nomorReferensi ?? loanId,
      "Tanda tangan elektronik peminjam tersimpan",
    );
    return { ok: true };
  },
});
