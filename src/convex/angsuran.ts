import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminRole, requireAdminSession } from "./adminAuthz";
import { pastikanAngsuran } from "./angsuranJadwal";
import { bagiMargin } from "../lib/kebijakanPinjaman";
import {
  dendaAngsuran,
  hariTerlambatAngsuran,
  ringkasAngsuran,
  sisaHariAngsuran,
  tampilanAngsuran,
  type AngsuranTampil,
  type RingkasanAngsuran,
} from "../lib/angsuran";
import { beriTiketPelunasan } from "./doorprize";
import { selesaikanReferralPelunasan } from "./referral";
import { beriVoucherApresiasi } from "./voucher";
import { akunDompetDana, appendJournal, catatMarginSpread } from "./ledger";

import { formatRupiah } from "../lib/money";
import { apakahPelunasanTepatWaktu } from "../lib/plafon";
import { audit, tarifDendaBerlaku } from "./system";
import { pembayaranSiklus } from "./siklusPendana";
import { siklusPendanaan } from "../lib/imbalPendana";

/** Sesi peminjam non-tamu — sama dengan gerbang `loans`. */
async function requirePengguna(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error("Akun tamu hanya dapat melihat informasi. Masuk untuk mengakses angsuran.");
  }
  return { userId, user };
}

async function barisTampil(
  ctx: QueryCtx,
  row: Doc<"angsuran">,
  sekarang: number,
  tarif: number,
): Promise<AngsuranTampil> {
  const dendaBerjalan =
    row.status === "lunas"
      ? 0
      : dendaAngsuran(row.pokok, row.jatuhTempoPada, sekarang, tarif);
  const buktiUrl =
    row.buktiPembayaranId === undefined
      ? null
      : await ctx.storage.getUrl(row.buktiPembayaranId);
  return {
    _id: row._id,
    nomor: row.nomor,
    jatuhTempoPada: row.jatuhTempoPada,
    pokok: row.pokok,
    bunga: row.bunga,
    biayaAdmin: row.biayaAdmin,
    total: row.total,
    status: row.status,
    dibayarPada: row.dibayarPada ?? null,
    dendaDibayar: row.dendaDibayar ?? null,
    dendaBerjalan,
    totalDibayar:
      row.status === "lunas" ? row.total + (row.dendaDibayar ?? 0) : 0,
    buktiUrl,
    tampilan: tampilanAngsuran(row, sekarang),
    hariTerlambat: hariTerlambatAngsuran(row.jatuhTempoPada, sekarang),
    sisaHari: sisaHariAngsuran(row.jatuhTempoPada, sekarang),
  };
}

/** Satu grup pinjaman pada halaman Cicilan. */
export type GrupAngsuran = {
  loanId: Id<"loans">;
  nomorReferensi: string;
  status: string;
  tenorBulan: number | null;
  tenorHari: number;
  ringkasan: RingkasanAngsuran;
  angsuran: AngsuranTampil[];
};

/**
 * Angsuran milik peminjam yang sedang masuk, dikelompokkan per pinjaman.
 *
 * Semua nominal dihitung server: total dan pokok dari tabel `angsuran`,
 * denda berjalan dari tarif Pengaturan Sistem + tanggal. Klien tidak pernah
 * menghitung ulang uang. `ringkasan` global dipakai lencana menu.
 */
export const myAngsuran = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePengguna(ctx);
    const [rows, tarif] = await Promise.all([
      ctx.db
        .query("angsuran")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      tarifDendaBerlaku(ctx),
    ]);
    const sekarang = Date.now();

    const perPinjaman = new Map<string, Doc<"angsuran">[]>();
    for (const row of rows) {
      const daftar = perPinjaman.get(row.loanId) ?? [];
      daftar.push(row);
      perPinjaman.set(row.loanId, daftar);
    }

    const grup: GrupAngsuran[] = [];
    for (const [loanId, daftar] of perPinjaman) {
      const loan = await ctx.db.get(loanId as Id<"loans">);
      if (loan === null) continue;
      const angsuran = await Promise.all(
        daftar
          .sort((a, b) => a.nomor - b.nomor)
          .map((row) => barisTampil(ctx, row, sekarang, tarif)),
      );
      grup.push({
        loanId: loan._id,
        nomorReferensi: loan.nomorReferensi,
        status: loan.status,
        tenorBulan: loan.tenorBulan ?? null,
        tenorHari: loan.tenorHari,
        ringkasan: ringkasAngsuran(angsuran),
        angsuran,
      });
    }

    // Pinjaman berjalan lebih dulu; di dalamnya, tagihan terdekat lebih dulu.
    grup.sort((a, b) => {
      if (a.status !== b.status) return a.status === "didanai" ? -1 : 1;
      const at = a.ringkasan.berikutnya?.jatuhTempoPada ?? Infinity;
      const bt = b.ringkasan.berikutnya?.jatuhTempoPada ?? Infinity;
      return at - bt;
    });

    const global = grup.flatMap((g) => g.angsuran);
    return {
      grup,
      ringkasan: ringkasAngsuran(global),
      tarifDendaPerHari: tarif,
    };
  },
});

/**
 * Backfill idempoten untuk data lama: pinjaman yang sudah cair sebelum fitur
 * angsuran ada belum punya baris. Mutation ini membuatnya dari jadwal server —
 * tidak mengubah uang, status pinjaman, atau ledger.
 */
export const pastikanAngsuranSaya = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePengguna(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    let dibuat = 0;
    for (const loan of loans) {
      if (loan.status !== "didanai") continue;
      const sebelum = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .first();
      await pastikanAngsuran(ctx, loan);
      if (sebelum === null) dibuat += 1;
    }
    return { ok: true as const, dibuat };
  },
});

/**
 * Jurnal penerimaan SATU angsuran.
 *
 * Kas masuk dibagi ke akun yang menanggungnya: pokok + bunga ke
 * `pinjaman:<id>` (nantinya dibayarkan ke penyedia dana), biaya admin dan
 * denda langsung ke `platform:FEE`. Tidak ada baris yatim, dan total debit
 * selalu sama dengan total kredit.
 */
async function jurnalAngsuran(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  row: Doc<"angsuran">,
  denda: number,
  dibayar: number,
  aktor: string,
) {
  const lines = [
    { akun: "platform:CASH", arah: "debit" as const, jumlah: dibayar },
    {
      akun: `pinjaman:${loan._id}`,
      arah: "kredit" as const,
      jumlah: row.pokok,
    },
    ...(row.bunga > 0
      ? [
          {
            akun: `pinjaman:${loan._id}`,
            arah: "kredit" as const,
            jumlah: row.bunga,
          },
        ]
      : []),
  ];
  if (row.biayaAdmin > 0) {
    lines.push({ akun: "platform:FEE", arah: "kredit" as const, jumlah: row.biayaAdmin });
  }
  if (denda > 0) {
    lines.push({ akun: "platform:FEE", arah: "kredit" as const, jumlah: denda });
  }
  await appendJournal(ctx, {
    jenis: "repayment",
    skema: "pinjaman",
    keterangan: `Angsuran ${row.nomor} ${loan.nomorReferensi} — pokok ${row.pokok}, bunga ${row.bunga}${denda > 0 ? `, denda ${denda}` : ""}`,
    aktor,
    lines,
  });
}

/**
 * Bagikan pokok + bunga yang SUDAH diterima ke penyedia dana.
 *
 * Dipanggil hanya saat angsuran terakhir lunas. Kas sudah dijurnal per
 * angsuran, jadi di sini tidak ada debit kas lagi: akun `pinjaman:<id>`
 * dikreditkan per angsuran dan sekarang didebit sebesar bruto yang sama.
 * Potongan admin dihitung dari pokok alokasi, persis `repayLoan`.
 */
async function distribusikanKePendana(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  rows: readonly Doc<"angsuran">[],
  selesaiPada: number,
) {
  const aktif = (
    await ctx.db
      .query("fundings")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect()
  )
    .filter((f) => f.status === "dialokasikan")
    .sort(
      (a, b) =>
        b.jumlahAlokasi - a.jumlahAlokasi ||
        a.nomorReferensi.localeCompare(b.nomorReferensi),
    );
  if (aktif.length === 0) {
    throw new Error(
      "Alokasi dana aktif tidak ditemukan. Pelunasan tidak dicatat agar jurnal penyedia dana tidak hilang.",
    );
  }

  const totalPokok = rows.reduce((acc, r) => acc + r.pokok, 0);
  const totalImbal = rows.reduce((acc, r) => acc + r.bunga, 0);
  if (totalPokok !== loan.pokokPinjaman) {
    throw new Error(
      `Jadwal angsuran tidak cocok dengan pokok pinjaman (${formatRupiah(totalPokok)} vs ${formatRupiah(loan.pokokPinjaman)}).`,
    );
  }

  // Hak pendana dibayar dari SNAPSHOT alokasinya (porsi 47 : 13 atas marjin
  // bagian, dibekukan saat alokasi), bukan dihitung ulang dari bunga angsuran.
  // Kelebihan atau kekurangan bunga menjadi margin platform dan dicatat ke
  // akun spread tersendiri setelah pembayaran pendana.
  const imbalBagian = aktif.map((f) => ({
    funding: f,
    imbal: f.imbalHasil,
  }));
  const totalImbalPendana = imbalBagian.reduce((acc, x) => acc + x.imbal, 0);
  const marginSpread = totalImbal - totalImbalPendana;

  let terdistribusi = 0;
  let totalPotongan = 0;
  let totalKelebihan = 0;
  for (const { funding: f, imbal } of imbalBagian) {
    const bruto = f.jumlahAlokasi + imbal;
    let potonganAdmin: number;
    let imbalBersih: number;
    let akunPayout: string;
    let kelebihan = 0;
    // Fungsi ini hanya dipanggil pada angsuran terakhir, jadi pokok alokasi
    // sudah benar-benar kembali dan boleh diputar lagi dalam siklus.
    // Bagian bunga aktual dipakai untuk keuntungan putaran platform.
    const bungaAktualBagian =
      loan.pokokPinjaman > 0
        ? Math.floor((totalImbal * f.jumlahAlokasi) / loan.pokokPinjaman)
        : 0;
    const jalurSiklus = await pembayaranSiklus(ctx, {
      ...f,
      bungaAktual: bungaAktualBagian,
      pelunasanPenuh: true,
    });
    if (jalurSiklus !== null) {
      potonganAdmin = jalurSiklus.potonganAdmin;
      imbalBersih = jalurSiklus.imbalBersih;
      akunPayout = jalurSiklus.akun;
      kelebihan = jalurSiklus.kelebihan;
    } else {
      // Baris lama tanpa siklus: porsi platform 13/60 dari marjin, sisa ke pendana.
      potonganAdmin = bagiMargin(imbal).platform;
      imbalBersih = bruto - potonganAdmin;
      akunPayout = akunDompetDana(f.danaId);
    }
    await appendJournal(ctx, {
      jenis: "payout",
      skema: "pinjaman",
      keterangan:
        potonganAdmin > 0
          ? `Angsuran terakhir: pembayaran ke ${f.nomorReferensi} (${loan.nomorReferensi}) — bruto ${bruto}, porsi platform 13/60 marjin sebesar ${potonganAdmin}, dibayarkan ${imbalBersih}`
          : `Angsuran terakhir: pembayaran ke ${f.nomorReferensi} (${loan.nomorReferensi})`,
      aktor: "platform",
      lines: [
        // Putaran modal dengan hak siklus yang sudah dibayar tidak menulis
        // baris dompet nol; sisa pembayarannya masuk ke jaminan platform.
        ...(imbalBersih > 0
          ? [{ akun: akunPayout, arah: "debit" as const, jumlah: imbalBersih }]
          : []),
        ...(potonganAdmin > 0
          ? [
              {
                akun: "platform:FEE",
                arah: "debit" as const,
                jumlah: potonganAdmin,
              },
            ]
          : []),
        ...(kelebihan > 0
          ? [
              {
                akun: "platform:GUARANTEE",
                arah: "debit" as const,
                jumlah: kelebihan,
              },
            ]
          : []),
        { akun: `pinjaman:${loan._id}`, arah: "kredit", jumlah: bruto },
      ],
    });
    const siklus = siklusPendanaan(f.jumlahAlokasi, loan);
    await ctx.db.patch(f._id, {
      imbalHasil: imbal,
      periodDuration: siklus.periodDuration,
      expectedReturnRate: siklus.expectedReturnRate,
      lenderProfit: imbal - potonganAdmin,
      potonganAdmin,
      imbalHasilNet: imbalBersih,
      diselesaikanPada: selesaiPada,
      status: "selesai",
    });
    terdistribusi += imbalBersih;
    totalPotongan += potonganAdmin;
    totalKelebihan += kelebihan;
  }

  // Kas yang sudah diterima = pokok + bunga seluruh angsuran. Yang dibayarkan
  // ke pendana = totalBruto; selisihnya tepat margin spread platform.
  if (
    terdistribusi + totalPotongan + totalKelebihan + marginSpread !==
    totalPokok + totalImbal
  ) {
    throw new Error("Pembagian angsuran ke penyedia dana tidak seimbang. Transaksi dibatalkan.");
  }
  await catatMarginSpread(ctx, {
    loanId: loan._id,
    referensi: loan.nomorReferensi,
    margin: marginSpread,
    bungaNasabah: totalImbal,
    hakPendana: totalImbalPendana,
  });
}

/**
 * Selesaikan pinjaman setelah angsuran terakhir lunas.
 *
 * `lunasPada` memakai tanggal transfer yang dicocokkan admin, bukan waktu klik
 * verifikasi — supaya penilaian tepat waktu mencerminkan kapan uang benar-benar
 * masuk. Penanda `terlambatAngsuran` membuat plafon tidak naik bila ada satu
 * angsuran pun yang telat, walau pelunasan terakhir jatuh sebelum akhir tenor.
 */
async function selesaikanBilaLunas(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  adminId: Id<"users">,
  adminLabel: string,
  dibayarPada: number,
) {
  const rows = await ctx.db
    .query("angsuran")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .collect();
  if (rows.length === 0 || rows.some((r) => r.status !== "lunas")) {
    return { semuaLunas: false as const };
  }

  await distribusikanKePendana(ctx, loan, rows, dibayarPada);
  const denda = rows.reduce((acc, r) => acc + (r.dendaDibayar ?? 0), 0);
  // Denda yang tercatat > 0 adalah bukti telat yang paling jujur: pembayaran
  // pada hari jatuh tempo masih 0 hari terlambat walau jamnya lewat tengah malam.
  const adaTelat =
    loan.terlambatAngsuran === true ||
    rows.some((r) => (r.dendaDibayar ?? 0) > 0);

  await ctx.db.patch(loan._id, {
    status: "lunas",
    lunasPada: dibayarPada,
    ...(denda > 0 ? { dendaTerlambat: denda } : {}),
    ...(adaTelat ? { terlambatAngsuran: true } : {}),
  });

  await audit(
    ctx,
    adminId,
    adminLabel,
    "loan_lunas",
    loan.nomorReferensi,
    `${loan.namaLengkap} — seluruh ${rows.length} angsuran dicocokkan; lunas pada ${formatRupiah(loan.pokokPinjaman)}${denda > 0 ? `, denda ${formatRupiah(denda)}` : ""}${adaTelat ? " (ada angsuran terlambat)" : ""}.`,
  );

  const lunasUntukPlafon = {
    ...loan,
    status: "lunas",
    lunasPada: dibayarPada,
    terlambatAngsuran: adaTelat,
  };
  if (!adaTelat && apakahPelunasanTepatWaktu(lunasUntukPlafon)) {
    await audit(
      ctx,
      adminId,
      adminLabel,
      "plafon_naik_otomatis",
      loan.nomorReferensi,
      `Seluruh angsuran lunas tepat waktu; plafon dasar bertambah Rp1.000.000. Override admin tetap berlaku.`,
    );
  }

  // Tiket doorprize diterbitkan di sini, bukan saat admin menekan tombol lain:
  // pelunasan lewat jadwal angsuran juga menutup pinjaman, jadi jalur ini harus
  // memberi tiket yang sama dengan pelunasan satu kali. Idempotensinya dijaga
  // `beriTiket` lewat referensi `PINJAMAN:<nomor>`, sehingga verifikasi ulang
  // atau pelunasan manual tidak menggandakan tiket.
  await beriTiketPelunasan(ctx, {
    pemilikId: loan.userId,
    nomorReferensi: loan.nomorReferensi,
    tepatWaktu: !adaTelat,
    waktu: dibayarPada,
  });
  // Voucher apresiasi mengikuti aturan yang sama dengan pelunasan satu kali:
  // terbit untuk setiap pinjaman yang lunas, sekali per nomor referensi.
  await beriVoucherApresiasi(ctx, { loan: lunasUntukPlafon, sekarang: dibayarPada });
  // Hadiah referral menunggu momen yang sama: pinjaman pemakai kode lunas.
  await selesaikanReferralPelunasan(ctx, {
    loan: lunasUntukPlafon,
    sekarang: dibayarPada,
  });

  if (loan.pendanaId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.laporanPendana.kirimLaporanPelunasan, {
      loanId: loan._id,
      olehUserId: adminId,
    });
  }
  await ctx.scheduler.runAfter(0, internal.whatsapp._kirimStatusPinjaman, {
    loanId: loan._id,
    alasan: "Seluruh angsuran telah dicocokkan.",
    statusLama: "didanai",
  });

  return { semuaLunas: true as const };
}

/**
 * Antrean bukti pembayaran angsuran untuk admin.
 *
 * Saran pencocokan dihitung server dari nominal + tanggal transfer: angsuran
 * belum lunas dengan selisih nominal terkecil, lalu jatuh tempo terdekat.
 * Saran BUKAN keputusan — admin tetap harus mengisi referensi mutasi bank.
 */
export const daftarBuktiAngsuran = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRole(ctx);
    const tarif = await tarifDendaBerlaku(ctx);
    const receipts = await ctx.db
      .query("manualPaymentReceipts")
      .withIndex("by_status", (q) => q.eq("status", "menunggu_pencocokan"))
      .collect();

    const rows = [];
    for (const receipt of receipts) {
      if (receipt.jenis !== "pinjaman" || receipt.loanId === undefined) continue;
      // Bukti tingkat pinjaman (bunga saja / cicil pokok / pelunasan) punya
      // antrean dan verifikasi sendiri; jangan ditawarkan sebagai angsuran.
      if (receipt.paymentType !== undefined) continue;
      const loan = await ctx.db.get(receipt.loanId);
      if (loan === null) continue;
      const angsuran = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect();
      const kandidat = angsuran
        .filter((a) => a.status !== "lunas")
        .map((a) => {
          const denda = dendaAngsuran(
            a.pokok,
            a.jatuhTempoPada,
            receipt.tanggalTransfer,
            tarif,
          );
          const seharusnya = a.total + denda;
          return {
            angsuranId: a._id,
            nomor: a.nomor,
            jatuhTempoPada: a.jatuhTempoPada,
            seharusnya,
            denda,
            selisih: Math.abs(seharusnya - receipt.jumlah),
          };
        })
        .sort(
          (a, b) =>
            a.selisih - b.selisih || a.jatuhTempoPada - b.jatuhTempoPada,
        );
      // Bukti yang sudah ditautkan ke satu angsuran harus tetap muncul di
      // pilihan, walau angsuran itu tidak masuk tiga saran teratas. Tanpa ini
      // select menampilkan opsi lain sementara state masih menunjuk angsuran
      // lama, dan admin bisa memverifikasi ke baris yang tidak dilihatnya.
      const tertaut = receipt.angsuranId
        ? kandidat.filter((k) => k.angsuranId === receipt.angsuranId)
        : [];
      const pilihan = [
        ...tertaut,
        ...kandidat.filter((k) => k.angsuranId !== receipt.angsuranId),
      ].slice(0, 3);
      rows.push({
        _id: receipt._id,
        nomorReferensi: receipt.nomorReferensi,
        jumlah: receipt.jumlah,
        tanggalTransfer: receipt.tanggalTransfer,
        referensiTransfer: receipt.referensiTransfer,
        metodePembayaran: receipt.metodePembayaran,
        buktiUrl: receipt.buktiPembayaranId
          ? await ctx.storage.getUrl(receipt.buktiPembayaranId)
          : null,
        loanId: loan._id,
        nomorPinjaman: loan.nomorReferensi,
        namaPeminjam: loan.namaLengkap,
        tenorBulan: loan.tenorBulan ?? null,
        tenorHari: loan.tenorHari,
        angsuranId: receipt.angsuranId ?? null,
        saran: kandidat[0] ?? null,
        kandidat: pilihan,
      });
    }

    rows.sort((a, b) => a.tanggalTransfer - b.tanggalTransfer);
    return { rows, jumlah: rows.length, tarifDendaPerHari: tarif };
  },
});

/**
 * Verifikasi/rekonsiliasi bukti transfer manual ke rekening usaha.
 *
 * Gerbang uang sengaja TIDAK sekadar "admin menyetujui": referensi mutasi bank
 * dan nominal yang cocok wajib diisi. Itulah bukti perpindahan dana yang
 * dicatat, sementara `repayLoan` tetap tertutup oleh `paymentGuard` sampai ada
 * penyedia pembayaran terintegrasi.
 */
export const verifikasiBuktiAngsuran = mutation({
  args: {
    receiptId: v.id("manualPaymentReceipts"),
    angsuranId: v.id("angsuran"),
    keputusan: v.union(v.literal("terima"), v.literal("tolak")),
    referensiMutasi: v.optional(v.string()),
    jumlahMutasi: v.optional(v.number()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user } = await requireAdminSession(ctx);
    const adminLabel = user.email ?? user.name ?? "admin";
    const receipt = await ctx.db.get(args.receiptId);
    if (receipt === null) throw new Error("Bukti pembayaran tidak ditemukan.");
    if (receipt.status !== "menunggu_pencocokan") {
      throw new Error("Bukti ini sudah diproses.");
    }
    if (receipt.jenis !== "pinjaman" || receipt.loanId === undefined) {
      throw new Error("Bukti ini bukan untuk pinjaman tunai.");
    }
    const loan = await ctx.db.get(receipt.loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.status !== "didanai") {
      throw new Error("Pinjaman ini tidak sedang berjalan.");
    }
    const row = await ctx.db.get(args.angsuranId);
    if (row === null || row.loanId !== loan._id) {
      throw new Error("Angsuran tidak cocok dengan pinjaman pada bukti.");
    }
    if (row.status === "lunas") {
      throw new Error("Angsuran ini sudah lunas.");
    }
    if (row.status === "menunggu_verifikasi" && row.receiptId !== receipt._id) {
      throw new Error("Angsuran ini sedang menunggu bukti lain.");
    }
    const catatan = (args.catatan ?? "").trim();
    if (catatan.length > 500) throw new Error("Catatan maksimal 500 karakter.");

    if (args.keputusan === "tolak") {
      await ctx.db.patch(receipt._id, {
        status: "ditolak",
        catatanAdmin: catatan === "" ? undefined : catatan,
        dicocokkanPada: Date.now(),
        dicocokkanOleh: adminId,
      });
      await ctx.db.patch(row._id, {
        status: "belum_dibayar",
        receiptId: undefined,
        buktiPembayaranId: undefined,
      });
      await audit(
        ctx,
        adminId,
        adminLabel,
        "angsuran_bukti_ditolak",
        loan.nomorReferensi,
        `Bukti ${receipt.nomorReferensi} ditolak untuk angsuran ${row.nomor}.${catatan === "" ? "" : ` Catatan: ${catatan}`}`,
      );
      return { ok: true as const, lunas: false as const, semuaLunas: false as const };
    }

    const referensi = (args.referensiMutasi ?? "").trim();
    if (referensi.length < 4 || referensi.length > 120) {
      throw new Error("Referensi mutasi bank wajib 4–120 karakter.");
    }
    if (
      args.jumlahMutasi === undefined ||
      !Number.isSafeInteger(args.jumlahMutasi) ||
      args.jumlahMutasi <= 0
    ) {
      throw new Error("Nominal mutasi bank wajib rupiah bulat positif.");
    }

    const tarif = await tarifDendaBerlaku(ctx);
    const denda = dendaAngsuran(
      row.pokok,
      row.jatuhTempoPada,
      receipt.tanggalTransfer,
      tarif,
    );
    const seharusnya = row.total + denda;
    if (receipt.jumlah !== seharusnya) {
      throw new Error(
        `Nominal bukti ${formatRupiah(receipt.jumlah)} tidak sama dengan tagihan ${formatRupiah(seharusnya)} (termasuk denda ${formatRupiah(denda)}).`,
      );
    }
    if (args.jumlahMutasi !== seharusnya) {
      throw new Error(
        `Nominal mutasi bank ${formatRupiah(args.jumlahMutasi)} tidak sama dengan tagihan ${formatRupiah(seharusnya)}.`,
      );
    }

    await jurnalAngsuran(ctx, loan, row, denda, seharusnya, adminId);
    await ctx.db.patch(row._id, {
      status: "lunas",
      dibayarPada: receipt.tanggalTransfer,
      dendaDibayar: denda,
      buktiPembayaranId: receipt.buktiPembayaranId,
      receiptId: receipt._id,
    });
    await ctx.db.patch(receipt._id, {
      status: "dicocokkan",
      referensiMutasi: referensi,
      jumlahMutasi: args.jumlahMutasi,
      catatanAdmin: catatan === "" ? undefined : catatan,
      dicocokkanPada: Date.now(),
      dicocokkanOleh: adminId,
    });

    await audit(
      ctx,
      adminId,
      adminLabel,
      "angsuran_bukti_dicocokkan",
      loan.nomorReferensi,
      `Bukti ${receipt.nomorReferensi} dicocokkan ke angsuran ${row.nomor} — ${formatRupiah(seharusnya)} termasuk denda ${formatRupiah(denda)}; mutasi ${referensi}.`,
    );

    const hasil = await selesaikanBilaLunas(
      ctx,
      loan,
      adminId,
      adminLabel,
      receipt.tanggalTransfer,
    );
    return {
      ok: true as const,
      lunas: true as const,
      semuaLunas: hasil.semuaLunas,
    };
  },
});

/**
 * Catat pelunasan penuh pinjaman BULANAN dari mutasi bank yang sudah diterima.
 *
 * Setiap angsuran yang belum lunas ditulis jurnalnya sendiri, lalu penutup
 * jadwal memanggil mesin yang sama dengan pencocokan bukti angsuran: hak
 * penyedia dana dibayar, posisi alokasi ditutup, voucher dan tiket terbit sekali.
 * Nominal wajib sama dengan sisa tagihan pada tanggal terima, termasuk denda.
 */
export const catatPelunasanManualBulanan = mutation({
  args: {
    loanId: v.id("loans"),
    referensiMutasi: v.string(),
    jumlahMutasi: v.number(),
    tanggal: v.number(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user } = await requireAdminSession(ctx);
    const adminLabel = user.email ?? user.name ?? "admin";
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.status !== "didanai") {
      throw new Error("Hanya pinjaman berstatus Didanai yang bisa dilunasi.");
    }
    if (loan.tenorBulan === undefined) {
      throw new Error(
        "Pinjaman harian dilunasi lewat catat pelunasan pinjaman, bukan lewat angsuran.",
      );
    }

    const referensi = args.referensiMutasi.trim();
    if (referensi.length < 4 || referensi.length > 120) {
      throw new Error("Referensi mutasi bank wajib 4 sampai 120 karakter.");
    }
    if (!Number.isSafeInteger(args.jumlahMutasi) || args.jumlahMutasi <= 0) {
      throw new Error("Nominal mutasi bank wajib rupiah bulat positif.");
    }
    if (
      !Number.isSafeInteger(args.tanggal) ||
      args.tanggal <= 0 ||
      args.tanggal > Date.now() + 5 * 60_000
    ) {
      throw new Error("Tanggal terima pembayaran tidak valid.");
    }
    if (loan.didanaiPada !== undefined && args.tanggal < loan.didanaiPada) {
      throw new Error("Tanggal terima tidak boleh sebelum dana disalurkan.");
    }
    const catatan = (args.catatan ?? "").trim();
    if (catatan.length > 500) throw new Error("Catatan maksimal 500 karakter.");

    const menunggu = await ctx.db
      .query("manualPaymentReceipts")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect();
    if (menunggu.some((row) => row.status === "menunggu_pencocokan")) {
      throw new Error(
        "Ada bukti pembayaran yang menunggu pencocokan. Selesaikan atau tolak bukti itu lebih dulu.",
      );
    }

    await pastikanAngsuran(ctx, loan);
    const rows = await ctx.db
      .query("angsuran")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect();
    const belum = rows
      .filter((row) => row.status !== "lunas")
      .sort((a, b) => a.nomor - b.nomor);
    if (belum.length === 0) {
      throw new Error("Tidak ada angsuran yang tersisa; pinjaman ini sudah selesai.");
    }
    if (belum.some((row) => row.status === "menunggu_verifikasi")) {
      throw new Error(
        "Ada angsuran yang menunggu verifikasi bukti. Selesaikan atau tolak bukti itu lebih dulu.",
      );
    }

    const tarif = await tarifDendaBerlaku(ctx);
    const rencana = belum.map((row) => ({
      row,
      denda: dendaAngsuran(row.pokok, row.jatuhTempoPada, args.tanggal, tarif),
    }));
    const totalDue = rencana.reduce(
      (acc, item) => acc + item.row.total + item.denda,
      0,
    );
    if (args.jumlahMutasi !== totalDue) {
      throw new Error(
        `Nominal mutasi ${formatRupiah(args.jumlahMutasi)} tidak sama dengan sisa tagihan ${formatRupiah(totalDue)} untuk ${belum.length} angsuran pada tanggal terima.`,
      );
    }

    for (const { row, denda } of rencana) {
      const dibayar = row.total + denda;
      await jurnalAngsuran(ctx, loan, row, denda, dibayar, adminId);
      await ctx.db.patch(row._id, {
        status: "lunas",
        dibayarPada: args.tanggal,
        dendaDibayar: denda,
      });
    }

    const hasil = await selesaikanBilaLunas(
      ctx,
      loan,
      adminId,
      adminLabel,
      args.tanggal,
    );
    await audit(
      ctx,
      adminId,
      adminLabel,
      "pelunasan_angsuran_manual",
      loan.nomorReferensi,
      `Mutasi ${referensi} sebesar ${formatRupiah(totalDue)} menutup ${belum.length} angsuran${catatan === "" ? "" : `; catatan: ${catatan}`}.`,
    );
    return { ok: true as const, totalDue, semuaLunas: hasil.semuaLunas };
  },
});

/** Admin: siapkan jadwal untuk pinjaman lama yang sudah cair. */
export const pastikanSemuaAngsuran = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireAdminSession(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "didanai"))
      .collect();
    let dibuat = 0;
    for (const loan of loans) {
      const sebelum = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .first();
      await pastikanAngsuran(ctx, loan);
      if (sebelum === null) dibuat += 1;
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "angsuran_backfill",
      "semua pinjaman berjalan",
      `${dibuat} pinjaman mendapat jadwal angsuran dari mesin harga server.`,
    );
    return { ok: true as const, dibuat };
  },
});
