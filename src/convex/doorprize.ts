/**
 * Doorprize triwulanan — tiket otomatis, hadiah per kuartal, dan pengundian admin.
 *
 * Tiket tidak pernah diklaim manual: pelunasan tepat waktu dan penempatan dana
 * Rp1 juta menerbitkannya sendiri lewat `beriTiket`. Semua penulisan idempoten
 * pada `referensi`, sehingga pencatatan ulang tidak menggandakan tiket.
 *
 * Kuartal adalah unit hidup modul ini:
 * - tiket ditulis dengan kode periode `YYYY-Qn`;
 * - ringkasan hanya menghitung tiket kuartal berjalan (kuartal baru = 0 tiket);
 * - hadiah disimpan per kuartal dan dipakai saat mengundi;
 * - pengundian baru dibuka pada hari pengundian resmi (hari terakhir kuartal).
 *
 * Tiket lama berperiode `YYYY-MM` tetap dibaca untuk kuartal yang sama lewat
 * `kunciPeriodeKuartal`, jadi perubahan penamaan tidak menghapus tiket yang
 * sudah dikumpulkan nasabah pada kuartal berjalan.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminRole } from "./adminAuthz";
import { audit } from "./system";
import {
  BATAS_NILAI_HADIAH_DOORPRIZE,
  CATATAN_ANGGARAN_DOORPRIZE,
  HADIAH_DOORPRIZE_BAWAAN,
  LABEL_KATEGORI_HADIAH,
  NILAI_HADIAH_MINIMUM,
  TEKS_KETENTUAN_DOORPRIZE,
  akhirKuartal,
  awalKuartal,
  bulanKuartal,
  judulDoorprizeKuartal,
  bacaKodeKuartal,
  kodeKuartal,
  kuartalDariWaktu,
  kunciPeriodeKuartal,
  labelPeriodeKuartal,
  labelRentangKuartal,
  labelTanggalUndianKuartal,
  namaPemenangPublik,
  nilaiHadiahValid,
  pembukaanUndianKuartal,
  tiketPendana,
  tiketPeminjam,
  type KategoriHadiah,
  type Kuartal,
} from "../lib/doorprize";

/** Label akun yang aman ditampilkan di papan pemenang. */
function labelPemilik(user: { name?: string; email?: string } | null): string {
  const nama = (user?.name ?? "").trim();
  if (nama !== "") return nama;
  const email = (user?.email ?? "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "Nasabah PINDAI";
}

type HadiahKuartal = {
  kategori: KategoriHadiah;
  nama: string;
  nilaiPerkiraan: number;
  /** true bila admin sudah menyimpan pilihan untuk kuartal ini. */
  diatur: boolean;
};

/** Hadiah kuartal: baris tersimpan bila ada, selain itu preset bawaan. */
async function hadiahKuartal(ctx: QueryCtx, kuartal: Kuartal): Promise<HadiahKuartal> {
  const baris = await ctx.db
    .query("doorprizePeriode")
    .withIndex("by_kode", (q) => q.eq("kode", kodeKuartal(kuartal)))
    .first();
  if (baris === null) {
    return {
      kategori: HADIAH_DOORPRIZE_BAWAAN.kategori,
      nama: HADIAH_DOORPRIZE_BAWAAN.nama,
      nilaiPerkiraan: HADIAH_DOORPRIZE_BAWAAN.nilai,
      diatur: false,
    };
  }
  return {
    kategori: baris.prizeCategory,
    nama: baris.prizeName,
    nilaiPerkiraan: baris.prizeEstimatedValue,
    diatur: true,
  };
}

/**
 * Tiket satu kuartal, termasuk tiket lama berperiode bulanan.
 * Dikumpulkan per kunci lalu di-dedup berdasarkan id agar satu baris tidak
 * terhitung dua kali bila suatu saat kuncinya tumpang tindih.
 */
async function tiketKuartal(
  ctx: QueryCtx,
  kuartal: Kuartal,
): Promise<Doc<"doorprizeTiket">[]> {
  const peta = new Map<string, Doc<"doorprizeTiket">>();
  for (const kunci of kunciPeriodeKuartal(kuartal)) {
    const baris = await ctx.db
      .query("doorprizeTiket")
      .withIndex("by_periode", (q) => q.eq("periode", kunci))
      .collect();
    for (const row of baris) peta.set(row._id, row);
  }
  return [...peta.values()];
}

/**
 * Tiket milik satu akun pada satu kuartal dan satu peran.
 * `aktif` = masih berpeluang menang; `terkumpul` = seluruh tiket kuartal itu
 * (termasuk yang sudah menang), dipakai untuk menampilkan riwayat setelah
 * undian selesai. Tiket `batal` tidak dihitung sama sekali.
 */
async function tiketPenggunaKuartal(
  ctx: QueryCtx,
  userId: Id<"users">,
  kuartal: Kuartal,
  peran: "peminjam" | "pendana",
): Promise<{ aktif: number; terkumpul: number }> {
  const peta = new Map<string, Doc<"doorprizeTiket">>();
  for (const kunci of kunciPeriodeKuartal(kuartal)) {
    const baris = await ctx.db
      .query("doorprizeTiket")
      .withIndex("by_pemilik_periode", (q) =>
        q.eq("pemilikId", userId).eq("periode", kunci),
      )
      .collect();
    for (const row of baris) peta.set(row._id, row);
  }
  const milik = [...peta.values()].filter(
    (row) => row.peran === peran && row.status !== "batal",
  );
  return {
    aktif: milik.filter((row) => row.status === "aktif").length,
    terkumpul: milik.length,
  };
}

/**
 * Terbitkan tiket bila `referensi` belum pernah menghasilkan tiket.
 * Mengembalikan jumlah baris yang benar-benar ditulis.
 */
export async function beriTiket(
  ctx: MutationCtx,
  args: {
    pemilikId: Id<"users">;
    peran: "peminjam" | "pendana";
    referensi: string;
    sumber: string;
    jumlah?: number;
    waktu: number;
  },
): Promise<number> {
  const jumlah = Math.max(0, Math.trunc(args.jumlah ?? 1));
  if (jumlah === 0) return 0;
  const sudah = await ctx.db
    .query("doorprizeTiket")
    .withIndex("by_referensi", (q) => q.eq("referensi", args.referensi))
    .first();
  if (sudah !== null) return 0;
  const periode = kodeKuartal(kuartalDariWaktu(args.waktu));
  let dibuat = 0;
  for (let i = 1; i <= jumlah; i += 1) {
    // Referensi tiket ke-i berbeda supaya kelipatan pendanaan tercatat satu
    // per satu, tetapi referensi pertama tetap menjadi kunci idempotensi.
    const referensi = i === 1 ? args.referensi : `${args.referensi}#${i}`;
    const ada = await ctx.db
      .query("doorprizeTiket")
      .withIndex("by_referensi", (q) => q.eq("referensi", referensi))
      .first();
    if (ada !== null) continue;
    await ctx.db.insert("doorprizeTiket", {
      pemilikId: args.pemilikId,
      peran: args.peran,
      periode,
      sumber: args.sumber,
      referensi,
      status: "aktif",
      dibuatPada: args.waktu,
    });
    dibuat += 1;
  }
  return dibuat;
}

/**
 * Batalkan tiket satu penempatan dana beserta turunannya (`#2`, `#3`, …).
 *
 * Dipakai saat akad dibatalkan: tiket yang sudah terbit dari penempatan itu
 * tidak boleh ikut diundi. Turunannya berurutan, jadi pencarian berhenti pada
 * referensi pertama yang tidak ada — bukan menyapu semua tiket.
 */
export async function batalkanTiketReferensi(
  ctx: MutationCtx,
  referensi: string,
): Promise<number> {
  let dibatalkan = 0;

  async function tandai(referensiTiket: string): Promise<boolean> {
    const row = await ctx.db
      .query("doorprizeTiket")
      .withIndex("by_referensi", (q) => q.eq("referensi", referensiTiket))
      .first();
    if (row === null) return false;
    if (row.status !== "batal") {
      await ctx.db.patch(row._id, { status: "batal" });
      dibatalkan += 1;
    }
    return true;
  }

  await tandai(referensi);
  // Batas atas mengikuti penempatan terbesar (Rp500 juta = 500 tiket);
  // pertemuannya biasanya berhenti jauh sebelum itu.
  for (let i = 2; i <= 500; i += 1) {
    const ada = await tandai(`${referensi}#${i}`);
    if (!ada) break;
  }
  return dibatalkan;
}

/** Tiket peminjam untuk satu pelunasan tepat waktu. */
export async function beriTiketPelunasan(
  ctx: MutationCtx,
  args: {
    pemilikId: Id<"users">;
    nomorReferensi: string;
    tepatWaktu: boolean;
    waktu: number;
  },
): Promise<void> {
  if (tiketPeminjam(args.tepatWaktu) === 0) return;
  await beriTiket(ctx, {
    pemilikId: args.pemilikId,
    peran: "peminjam",
    referensi: `PINJAMAN:${args.nomorReferensi}`,
    sumber: "pelunasan_tepat_waktu",
    waktu: args.waktu,
  });
}

/** Tiket pendana: satu per kelipatan Rp1 juta penempatan dana. */
export async function beriTiketPendanaan(
  ctx: MutationCtx,
  args: {
    pemilikId: Id<"users">;
    nomorReferensi: string;
    jumlahAlokasi: number;
    waktu: number;
  },
): Promise<void> {
  const jumlah = tiketPendana(args.jumlahAlokasi);
  if (jumlah === 0) return;
  await beriTiket(ctx, {
    pemilikId: args.pemilikId,
    peran: "pendana",
    referensi: `PENDANAAN:${args.nomorReferensi}`,
    sumber: "pendanaan_1jt",
    jumlah,
    waktu: args.waktu,
  });
}

/** Pemenang satu kuartal, bila undiannya sudah dijalankan. */
async function pemenangKuartal(ctx: QueryCtx, kuartal: Kuartal) {
  const undian = await ctx.db
    .query("doorprizeUndian")
    .withIndex("by_periode", (q) => q.eq("periode", kodeKuartal(kuartal)))
    .first();
  if (undian === null) return null;
  return {
    id: String(undian._id),
    nama: labelPemilik(await ctx.db.get(undian.pemilikId)),
    peran: undian.peran,
    hadiah: undian.hadiah,
    diundiPada: undian.diundiPada,
    jumlahPeserta: undian.jumlahPeserta,
    jumlahTiket: undian.jumlahTiket,
    /** Kosong = hadiah belum tercatat diserahkan. */
    hadiahDiserahkanPada: undian.hadiahDiserahkanPada ?? null,
    catatanPenyerahan: undian.catatanPenyerahan ?? null,
  };
}

/**
 * Ringkasan widget untuk akun yang sedang masuk: tiket kuartal berjalan,
 * hadiah yang dipilih admin, tanggal pengundian, dan pemenang kuartal ini.
 */
export const ringkasanSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const sekarang = Date.now();
    const kuartal = kuartalDariWaktu(sekarang);
    const kode = kodeKuartal(kuartal);
    const [tiketPeminjamKuartal, tiketPendanaKuartal, hadiah, pemenang] = await Promise.all([
      tiketPenggunaKuartal(ctx, userId, kuartal, "peminjam"),
      tiketPenggunaKuartal(ctx, userId, kuartal, "pendana"),
      hadiahKuartal(ctx, kuartal),
      pemenangKuartal(ctx, kuartal),
    ]);

    // Setelah undian kuartal ini dijalankan, saldo tiket ditampilkan 0 supaya
    // jelas tidak ada tiket yang terbawa ke kuartal berikutnya. Jumlah yang
    // ikut undian tetap dikirim sebagai `tiketTerkumpul` agar riwayatnya jujur.
    const tiketPeminjamAktif = tiketPeminjamKuartal.aktif;
    const tiketPendanaAktif = tiketPendanaKuartal.aktif;
    const terkumpul = tiketPeminjamKuartal.terkumpul + tiketPendanaKuartal.terkumpul;
    const sudahDiundi = pemenang !== null;

    return {
      kode,
      quarter: kuartal.quarter,
      year: kuartal.year,
      labelPeriode: labelPeriodeKuartal(kuartal),
      labelRentang: labelRentangKuartal(kuartal),
      bulan: bulanKuartal(kuartal),
      judul: judulDoorprizeKuartal(kuartal),
      startDate: awalKuartal(kuartal),
      endDate: akhirKuartal(kuartal),
      tanggalUndian: pembukaanUndianKuartal(kuartal),
      labelTanggalUndian: labelTanggalUndianKuartal(kuartal),
      bisaDiundi: sekarang >= pembukaanUndianKuartal(kuartal),
      sudahDiundi,
      tiketPeminjam: sudahDiundi ? 0 : tiketPeminjamAktif,
      tiketPendana: sudahDiundi ? 0 : tiketPendanaAktif,
      tiketAktif: sudahDiundi ? 0 : terkumpul,
      tiketTerkumpul: terkumpul,
      hadiah: {
        ...hadiah,
        labelKategori: LABEL_KATEGORI_HADIAH[hadiah.kategori],
      },
      teksKetentuan: TEKS_KETENTUAN_DOORPRIZE,
      pemenang,
    };
  },
});

/** Data papan admin: rekap tiket kuartal berjalan, hadiah, dan pemenang. */
export const ringkasanAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRole(ctx);
    const sekarang = Date.now();
    const kuartal = kuartalDariWaktu(sekarang);
    const kode = kodeKuartal(kuartal);
    const [tiket, hadiah, pemenang] = await Promise.all([
      tiketKuartal(ctx, kuartal),
      hadiahKuartal(ctx, kuartal),
      pemenangKuartal(ctx, kuartal),
    ]);
    // Ringkasan kuartal tetap utuh setelah undian: peserta dan jumlah tiket
    // dihitung dari seluruh tiket sah (aktif + menang), sedangkan `tiketAktif`
    // khusus tiket yang masih berpeluang menang.
    const sah = tiket.filter((row) => row.status !== "batal");
    const aktif = sah.filter((row) => row.status === "aktif");
    const peserta = new Set(sah.map((row) => row.pemilikId as string));
    return {
      kode,
      quarter: kuartal.quarter,
      year: kuartal.year,
      labelPeriode: labelPeriodeKuartal(kuartal),
      labelRentang: labelRentangKuartal(kuartal),
      bulan: bulanKuartal(kuartal),
      startDate: awalKuartal(kuartal),
      endDate: akhirKuartal(kuartal),
      tanggalUndian: pembukaanUndianKuartal(kuartal),
      labelTanggalUndian: labelTanggalUndianKuartal(kuartal),
      bisaDiundi: sekarang >= pembukaanUndianKuartal(kuartal),
      jumlahTiket: sah.length,
      tiketAktif: aktif.length,
      jumlahPeserta: peserta.size,
      tiketPeminjam: aktif.filter((row) => row.peran === "peminjam").length,
      tiketPendana: aktif.filter((row) => row.peran === "pendana").length,
      hadiah: {
        ...hadiah,
        labelKategori: LABEL_KATEGORI_HADIAH[hadiah.kategori],
      },
      pemenang,
      teksKetentuan: TEKS_KETENTUAN_DOORPRIZE,
      catatanAnggaran: CATATAN_ANGGARAN_DOORPRIZE,
    };
  },
});

/**
 * Simpan/ubah hadiah kuartal berjalan. Hanya Super Admin.
 *
 * Nilai dijaga di `NILAI_HADIAH_MINIMUM`–`BATAS_NILAI_HADIAH_DOORPRIZE - 1`,
 * sehingga permintaan "hadiah di bawah Rp1 juta" tidak bergantung pada UI.
 * Tanggal kuartal dihitung server; klien tidak boleh mengirimnya.
 */
export const simpanHadiahKuartal = mutation({
  args: {
    kategori: v.union(
      v.literal("GOLD"),
      v.literal("ELECTRONICS"),
      v.literal("VOUCHER"),
      v.literal("OTHER"),
    ),
    nama: v.string(),
    nilai: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminRole(ctx);
    const nama = args.nama.trim();
    if (nama.length < 3 || nama.length > 80) {
      throw new Error("Nama hadiah harus 3–80 karakter.");
    }
    if (!nilaiHadiahValid(args.nilai)) {
      throw new Error(
        `Nilai hadiah harus Rp${NILAI_HADIAH_MINIMUM.toLocaleString("id-ID")} sampai di bawah Rp${BATAS_NILAI_HADIAH_DOORPRIZE.toLocaleString("id-ID")}.`,
      );
    }

    const sekarang = Date.now();
    const kuartal = kuartalDariWaktu(sekarang);
    const kode = kodeKuartal(kuartal);
    const patch = {
      quarter: kuartal.quarter,
      year: kuartal.year,
      startDate: awalKuartal(kuartal),
      endDate: akhirKuartal(kuartal),
      prizeCategory: args.kategori,
      prizeName: nama,
      prizeEstimatedValue: args.nilai,
      updatedAt: sekarang,
      updatedBy: user.email ?? user.name ?? "admin",
    } as const;

    const baris = await ctx.db
      .query("doorprizePeriode")
      .withIndex("by_kode", (q) => q.eq("kode", kode))
      .first();
    if (baris === null) {
      await ctx.db.insert("doorprizePeriode", { kode, ...patch });
    } else {
      await ctx.db.patch(baris._id, patch);
    }

    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "ubah_hadiah_doorprize",
      kode,
      `Hadiah ${kode}: ${nama} (${LABEL_KATEGORI_HADIAH[args.kategori]}) senilai Rp${args.nilai.toLocaleString("id-ID")}, di bawah Rp${BATAS_NILAI_HADIAH_DOORPRIZE.toLocaleString("id-ID")}.`,
    );

    return {
      kode,
      kategori: args.kategori,
      labelKategori: LABEL_KATEGORI_HADIAH[args.kategori],
      nama,
      nilaiPerkiraan: args.nilai,
      diatur: true,
    };
  },
});

/**
 * Catat bahwa hadiah satu undian sudah diserahkan ke pemenang.
 *
 * Hanya Super Admin, dan hanya SEKALI: tanggal penyerahan adalah bukti, bukan
 * pengaturan yang boleh diubah-ubah. Catatan (kurir, resi, lokasi) boleh
 * diisi saat pencatatan; memperbaikinya nanti akan mengaburkan kapan hadiah
 * benar-benar sampai, jadi perbaikannya lewat catatan audit, bukan timpa.
 *
 * Pajak hadiah undian bukan kewajiban platform untuk dipotong di sini, tetapi
 * panel menampilkan pengingatnya: hadiah di atas Rp1 juta (batas nilai modul
 * ini jauh di bawahnya) tetap perlu dicatat penerimanya untuk pelaporan.
 */
export const catatPenyerahanHadiah = mutation({
  args: {
    undianId: v.id("doorprizeUndian"),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminRole(ctx);
    const undian = await ctx.db.get(args.undianId);
    if (undian === null) throw new Error("Undian tidak ditemukan.");
    if (undian.hadiahDiserahkanPada !== undefined) {
      throw new Error(
        `Hadiah ${undian.periode} sudah tercatat diserahkan. Perbaikan data lewat catatan audit, bukan menimpa tanggalnya.`,
      );
    }

    const catatan = (args.catatan ?? "").trim();
    if (catatan.length > 200) {
      throw new Error("Catatan penyerahan maksimal 200 karakter.");
    }

    const sekarang = Date.now();
    await ctx.db.patch(undian._id, {
      hadiahDiserahkanPada: sekarang,
      ...(catatan === "" ? {} : { catatanPenyerahan: catatan }),
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "doorprize_hadiah_diserahkan",
      undian.periode,
      `Hadiah ${undian.hadiah} untuk ${labelPemilik(await ctx.db.get(undian.pemilikId))} dicatat diserahkan${catatan === "" ? "" : ` — ${catatan}`}.`,
    );

    return { diserahkanPada: sekarang };
  },
});

/**
 * Papan pemenang publik — bukti sosial yang tidak membocorkan identitas.
 *
 * Tanpa sesi: siapa pun boleh melihat bahwa undian benar-benar dijalankan.
 * Nama disamarkan (`namaPemenangPublik`), dan yang dikirim hanya periode,
 * hadiah, peran, serta status penyerahan — bukan id akun, email, atau nomor.
 * Hanya undian yang sudah tercatat yang tampil; tidak ada pemenang karangan.
 */
export const pemenangPublik = query({
  args: { batas: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batas = Math.min(20, Math.max(1, Math.round(args.batas ?? 8)));
    const rows = await ctx.db
      .query("doorprizeUndian")
      .withIndex("by_diundiPada")
      .order("desc")
      .take(batas);

    return await Promise.all(
      rows.map(async (row) => {
        const kuartal = bacaKodeKuartal(row.periode);
        const pemilik = await ctx.db.get(row.pemilikId);
        return {
          periode: row.periode,
          labelPeriode: labelPeriodeKuartal(kuartal),
          // Nama asli dibaca lalu disamarkan DI SINI; nama lengkap tidak pernah
          // meninggalkan server, bahkan untuk papan publik.
          nama: namaPemenangPublik(labelPemilik(pemilik)),
          peran: row.peran,
          hadiah: row.hadiah,
          diundiPada: row.diundiPada,
          jumlahPeserta: row.jumlahPeserta,
          jumlahTiket: row.jumlahTiket,
          hadiahDiserahkan: row.hadiahDiserahkanPada !== undefined,
          diserahkanPada: row.hadiahDiserahkanPada ?? null,
        };
      }),
    );
  },
});

/**
 * Admin mengundi satu pemenang dari tiket aktif kuartal berjalan.
 *
 * Satu kuartal hanya punya satu undian; tombol kedua tidak mengundi ulang
 * diam-diam. Pengundian baru dibuka pada hari pengundian resmi, sehingga
 * tiket tidak bisa diputuskan sebelum kuartal selesai. Tiket pemenang ditandai
 * `menang`, tiket lain tetap `aktif` sebagai jejak; kuartal berikutnya mulai
 * dari nol karena periodenya berbeda.
 */
export const acakPemenang = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireAdminRole(ctx);
    const sekarang = Date.now();
    const kuartal = kuartalDariWaktu(sekarang);
    const kode = kodeKuartal(kuartal);
    const pembukaan = pembukaanUndianKuartal(kuartal);
    if (sekarang < pembukaan) {
      throw new Error(
        `Pengundian ${labelPeriodeKuartal(kuartal)} baru dibuka pada ${labelTanggalUndianKuartal(kuartal)}.`,
      );
    }

    const sudah = await ctx.db
      .query("doorprizeUndian")
      .withIndex("by_periode", (q) => q.eq("periode", kode))
      .first();
    if (sudah !== null) {
      const nama = labelPemilik(await ctx.db.get(sudah.pemilikId));
      throw new Error(
        `Undian ${kode} sudah diundi: ${nama} (${sudah.hadiah}). Satu kuartal hanya punya satu pemenang.`,
      );
    }

    const aktif = (await tiketKuartal(ctx, kuartal)).filter(
      (row) => row.status === "aktif",
    );
    if (aktif.length === 0) {
      throw new Error(`Belum ada tiket aktif untuk ${kode}.`);
    }

    const hadiah = await hadiahKuartal(ctx, kuartal);
    const pemenang = aktif[Math.floor(Math.random() * aktif.length)];
    await ctx.db.patch(pemenang._id, {
      status: "menang",
      menangPada: sekarang,
    });
    const jumlahPeserta = new Set(aktif.map((row) => row.pemilikId as string)).size;
    await ctx.db.insert("doorprizeUndian", {
      periode: kode,
      pemilikId: pemenang.pemilikId,
      tiketId: pemenang._id,
      peran: pemenang.peran,
      hadiah: hadiah.nama,
      jumlahPeserta,
      jumlahTiket: aktif.length,
      diundiPada: sekarang,
      diundiOleh: user.email ?? user.name ?? "admin",
      diundiOlehId: user._id,
    });

    return {
      kode,
      nama: labelPemilik(await ctx.db.get(pemenang.pemilikId)),
      peran: pemenang.peran,
      hadiah: hadiah.nama,
      jumlahPeserta,
      jumlahTiket: aktif.length,
    };
  },
});
