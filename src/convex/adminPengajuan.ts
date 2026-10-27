/**
 * Pencatatan pengajuan manual oleh admin (pinjaman tunai, gadai, kredit barang).
 *
 * Dipakai saat pengajuan masuk di luar aplikasi (nasabah datang ke kantor,
 * data lama dipindahkan ke sistem, atau pengajuan dicatat atas permintaan
 * nasabah). Berkas terpisah dari `admin.ts` supaya jalur ini jelas batasnya:
 *
 *  - **Hanya bentuk yang divalidasi di sini.** Semua angka uang (bunga, biaya,
 *    DP, cicilan, kewajiban) tetap dihitung mesin server saat dibaca; yang
 *    disimpan hanya data pengajuan apa adanya.
 *  - **Plafon per nasabah TIDAK mengikat di sini.** Pencatatan manual ada untuk
 *    memindahkan pengajuan yang SUDAH terjadi di luar aplikasi (mis. pinjaman
 *    dari koperasi mitra). Memaksakan plafon dalam aplikasi membuat data nyata
 *    ditolak hanya karena batas yang belum sempat dinaikkan, sehingga
 *    pengajuannya "hilang". Yang tetap berlaku hanya tenor tiap skema dan
 *    langit-langit jalur manual `POKOK_MANUAL_MAKS` (Rp 10 juta, sama dengan
 *    plafon sistem maksimum) agar satu salah ketik tidak memasukkan nominal di
 *    luar jangkauan produk. Batas produk harian Rp 1 juta TIDAK berlaku di sini:
 *    yang dicatat bukan pengajuan baru dari aplikasi nasabah, melainkan pinjaman
 *    yang sudah terjadi di luar aplikasi.
 *  - **Identitas diambil dari data diri nasabah**, bukan diketik ulang: NIK,
 *    nomor WhatsApp, penghasilan, dan (bila ada) rekening tujuan diisi dari
 *    `nasabahProfil`. Pengajuan kredit barang menolak dicatat sebelum data
 *    diri lengkap karena kontraknya menyimpan identitas pemohon.
 *  - **Nama pemohon mengikuti CATATAN pinjaman/kredit TERBARU** (`loans.namaLengkap`
 *    / `kreditBarang.namaLengkap`) — sumber yang sama dengan baris di ruang
 *    penyedia dana — lalu data diri, nama akun, dan email sebagai cadangan.
 *    Dengan begitu orang yang sama tidak tercatat dengan nama berbeda dari yang
 *    sudah tampil di ruang dana.
 *  - **Pemohon yang BELUM punya akun juga dilayani** (`buatNasabahBaru`): admin
 *    mengisi identitas + mengunggah dokumen pengajuan (foto KTP minimal), lalu
 *    server membuat akun tanpa kredensial beserta data dirinya, sehingga
 *    pengajuan bisa dicatat tanpa memaksa pemohon mendaftar lebih dulu.
 *  - **Dokumen pengajuan ikut disimpan pada pinjaman** (KTP dari data diri,
 *    selfie dan bukti penghasilan dari unggahan admin) supaya panel KYC
 *    menampilkan berkas yang sama seperti pengajuan jalur nasabah.
 *  - **Selalu menjadi pengajuan `diajukan`.** Pencatatan manual TIDAK
 *    memutuskan kredit: keputusan tetap lewat antrean review yang sudah ada,
 *    sehingga jalur audit keputusan tidak terbelah dua.
 *  - **Semua tercatat di Audit Trail** dengan aksi `pengajuan_manual_*`, agar
 *    baris yang dibuat admin dapat dibedakan dari pengajuan nasabah.
 *
 * Kill switch sengaja TIDAK menutup jalur ini: kill switch menghentikan
 * pengajuan BARU dari aplikasi nasabah, sedangkan admin memakainya justru saat
 * alur normal bermasalah dan pengajuan harus tetap dicatat.
 */
import { v } from "convex/values";

import { KREDIT_ASUMSI_AWAL, KREDIT_BARANG_POKOK_MAKS, pokokKreditBarangDalamBatas, quoteKreditBarang } from "../lib/kredit";
import { bacaDataDiri } from "../lib/dataDiri";
import { formatRupiah } from "../lib/money";
import { namaTampil } from "../lib/nama";
import {
  bacaKueriNasabah,
  varianKueriAngka,
  type KueriNasabah,
} from "../lib/pencarianNasabah";
import { persenBungaPerBulan } from "../lib/bulanan";
import { tarifBulananDariConfig } from "../lib/system-config";
import { persenBungaHarian } from "../lib/loan";
import {
  cariNasabahKembar,
  kumpulkanNamaCatatan,
  nomorReferensiManual,
  POKOK_MANUAL_MAKS,
  validasiGadaiManual,
  validasiKreditManual,
  validasiPinjamanManual,
  type NasabahManual,
} from "../lib/pengajuanManual";
import { requireAdminSession } from "./adminAuthz";
import { simpanDataDiriProfil } from "./dataDiriProfil";
import { ROLES } from "./schema";
import { audit, getConfig } from "./system";
import { ensureKodePeminjam } from "./peminjamCode";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Gerbang admin — seluruh query/mutation di berkas ini dijaga. */
async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

/** Nasabah tujuan pencatatan: akun terverifikasi non-admin yang benar-benar ada. */
async function ambilNasabah(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Nasabah tidak ditemukan.");
  if (user.role === ROLES.ADMIN) {
    throw new Error("Pengajuan atas nama akun admin tidak dicatat dari panel ini.");
  }
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu tidak dapat memiliki pengajuan. Minta nasabah masuk dengan akun terverifikasi.",
    );
  }
  const profil = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return { user, profil };
}

/**
 * Nama pada CATATAN pinjaman/kredit terbaru satu nasabah — sumber yang SAMA
 * dengan baris di ruang penyedia dana. Dipakai agar satu orang tidak tercatat
 * dengan dua nama berbeda di dua layar.
 */
async function namaCatatanNasabah(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<string | undefined> {
  const [loans, kredits] = await Promise.all([
    ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("kreditBarang").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  return kumpulkanNamaCatatan([
    ...loans.map((l) => ({
      userId: l.userId as string,
      namaLengkap: l.namaLengkap,
      waktu: l.diajukanPada ?? l._creationTime,
    })),
    ...kredits.map((k) => ({
      userId: k.userId as string,
      namaLengkap: k.namaLengkap,
      waktu: k._creationTime,
    })),
  ]).get(userId);
}

/** Baris hasil pencarian nasabah untuk pemilih di panel admin. */
function ringkasNasabah(
  user: Doc<"users">,
  profil: Doc<"nasabahProfil"> | null,
  /** Nama pada catatan pinjaman/kredit terbaru — prioritas pertama. */
  namaCatatan?: string,
): NasabahManual {
  return {
    userId: user._id,
    // Nama mengikuti CATATAN terbaru (sumber yang sama dengan ruang penyedia
    // dana), lalu nama KTP di data diri, nama akun, dan terakhir email — selalu
    // HURUF BESAR supaya tidak tampil beda dari baris di ruang dana.
    nama: namaTampil([namaCatatan, profil?.namaLengkap, user.name, user.email]),
    email: user.email ?? null,
    kodePeminjam: user.kodePeminjam ?? null,
    adaDataDiri: profil !== null,
    namaBank: profil?.namaBank ?? null,
    nomorRekening: profil?.nomorRekening ?? null,
    dibuatAdmin: user.dibuatAdminPada !== undefined,
  };
}

/**
 * Batas baris yang DIPINDAI untuk pencarian teks bebas.
 *
 * Panel ini tempat admin mencatat pengajuan baru, bukan arsip: yang dicari
 * hampir selalu nasabah yang baru berurusan. Membaca seluruh tabel membuat satu
 * ketikan admin menembus batas baca Convex begitu data produksi bertambah, dan
 * meja kerja mendadak gagal dimuat. Kueri berbentuk identitas tepat (NIK, kode
 * peminjam, email, nomor WhatsApp) tidak memakai jendela ini — jalurnya lewat
 * indeks dan hasilnya selalu lengkap.
 */
const BATAS_PINDAI_NASABAH = 500;

/** Baris yang ditampilkan pemilih nasabah setelah disaring. */
const BATAS_HASIL_NASABAH = 20;

/** Batas baris untuk satu pencarian identitas tepat. */
const BATAS_IDENTITAS = 5;

/**
 * Pengguna yang cocok lewat INDEKS untuk kueri identitas tepat.
 *
 * Mengembalikan baris milik siapa pun yang cocok, tanpa syarat jendela: NIK,
 * email, kode peminjam, dan nomor WhatsApp punya indeks sendiri, jadi nasabah
 * lama tetap bisa ditemukan walau barisnya jauh di luar jendela pemindaian.
 * Nomor asing (bukan 62…) dicari pada bentuk mentahnya karena bentuk simpannya
 * tidak bisa ditebak dari ketikan admin.
 */
async function cariLewatIndeks(
  ctx: QueryCtx,
  kueri: KueriNasabah,
): Promise<Doc<"users">[]> {
  const hasil = new Map<string, Doc<"users">>();
  const tambah = (user: Doc<"users"> | null | undefined): void => {
    if (user !== null && user !== undefined) hasil.set(user._id as string, user);
  };

  if (kueri.jenis === "email") {
    // Indeks email menyimpan nilai apa adanya, sedangkan admin biasa mengetik
    // huruf kecil — dua bentuk dicoba, bukan menebak satu.
    for (const alamat of new Set([kueri.nilai, kueri.emailKecil ?? ""])) {
      if (alamat === "") continue;
      tambah(
        await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", alamat))
          .first(),
      );
    }
  }

  if (kueri.jenis === "kodePeminjam") {
    tambah(
      await ctx.db
        .query("users")
        .withIndex("by_kodePeminjam", (q) => q.eq("kodePeminjam", kueri.nilai))
        .first(),
    );
  }

  if (kueri.jenis === "nik") {
    // NIK tersimpan di data diri nasabah dan di data KYC; keduanya bisa
    // menunjuk orang yang sama, jadi kandidatnya digabung lalu dihilangkan
    // duplikatnya oleh `Map` di atas.
    for (const baris of await ctx.db
      .query("nasabahProfil")
      .withIndex("by_nik", (q) => q.eq("nik", kueri.nilai))
      .take(BATAS_IDENTITAS)) {
      tambah(await ctx.db.get(baris.userId));
    }
    for (const baris of await ctx.db
      .query("kycProfil")
      .withIndex("by_nik", (q) => q.eq("nik", kueri.nilai))
      .take(BATAS_IDENTITAS)) {
      tambah(await ctx.db.get(baris.userId));
    }
  }

  if (kueri.jenis === "whatsapp") {
    const nomor = new Set<string>();
    if (kueri.whatsapp !== undefined) nomor.add(kueri.whatsapp);
    if (kueri.angka !== undefined && kueri.angka.length >= 9) nomor.add(kueri.angka);
    for (const n of nomor) {
      for (const user of await ctx.db
        .query("users")
        .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", n))
        .take(BATAS_IDENTITAS)) {
        tambah(user);
      }
      for (const profil of await ctx.db
        .query("nasabahProfil")
        .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", n))
        .take(BATAS_IDENTITAS)) {
        tambah(await ctx.db.get(profil.userId));
      }
    }
  }

  return [...hasil.values()];
}

/**
 * Nasabah yang dapat dipilih admin sebagai pemilik pengajuan manual.
 * `kueri` kosong mengembalikan daftar awal (diurutkan nama) supaya panel tidak
 * tampil kosong sebelum diketik. Akun admin dan akun tamu tidak ditawarkan.
 *
 * Bacaan dibatasi: identitas tepat lewat indeks, selebihnya jendela baris
 * terbaru. `dibatasi` diteruskan ke panel supaya admin diberi tahu saat daftar
 * mungkin belum lengkap, bukan dibiarkan mengira nasabahnya tidak ada.
 */
export const cariNasabah = query({
  args: { kueri: v.string() },
  handler: async (ctx, { kueri }) => {
    await requireAdmin(ctx);
    const dibaca = bacaKueriNasabah(kueri);
    const tepat = await cariLewatIndeks(ctx, dibaca);

    const [users, profilRows, loans, kredits] = await Promise.all([
      ctx.db.query("users").order("desc").take(BATAS_PINDAI_NASABAH),
      ctx.db.query("nasabahProfil").order("desc").take(BATAS_PINDAI_NASABAH),
      ctx.db.query("loans").order("desc").take(BATAS_PINDAI_NASABAH),
      ctx.db.query("kreditBarang").order("desc").take(BATAS_PINDAI_NASABAH),
    ]);
    const terpotong =
      users.length === BATAS_PINDAI_NASABAH ||
      profilRows.length === BATAS_PINDAI_NASABAH ||
      loans.length === BATAS_PINDAI_NASABAH ||
      kredits.length === BATAS_PINDAI_NASABAH;

    const profilPerUser = new Map(profilRows.map((p) => [p.userId as string, p]));
    // Nama dari catatan pinjaman/kredit terbaru — sumber yang SAMA dengan baris
    // di ruang penyedia dana, supaya nasabah yang sudah punya catatan ditawarkan
    // dengan nama yang persis sama seperti di ruang dana.
    const namaPerCatatan = kumpulkanNamaCatatan([
      ...loans.map((l) => ({
        userId: l.userId as string,
        namaLengkap: l.namaLengkap,
        waktu: l.diajukanPada ?? l._creationTime,
      })),
      ...kredits.map((k) => ({
        userId: k.userId as string,
        namaLengkap: k.namaLengkap,
        waktu: k._creationTime,
      })),
    ]);

    const layak = (user: Doc<"users">): boolean =>
      user.role !== ROLES.ADMIN && user.isAnonymous !== true;
    const needle = dibaca.nilai.trim().toLowerCase();
    // Angka dicocokkan dalam beberapa bentuk (08…, 8…, 62…): yang tersimpan hanya
    // satu bentuk, sedangkan admin mengetik sesuai kebiasaan.
    const jarum = varianKueriAngka(dibaca.nilai);
    const cocok = (user: Doc<"users">, profil: Doc<"nasabahProfil"> | null, namaCatatan: string | undefined): boolean => {
      if (needle === "") return true;
      const kandidat = [
        user.name ?? "",
        user.email ?? "",
        user.kodePeminjam ?? "",
        profil?.nik ?? "",
        // Nomor tersimpan (`62…`) ikut dicocokkan supaya ketikan sebagian
        // seperti "0812…" tetap menemukan nasabahnya.
        profil?.nomorWhatsApp ?? "",
        // Nama yang benar-benar tampil di baris ini pun harus bisa dicari —
        // admin mencari dengan nama yang ia lihat di ruang penyedia dana.
        namaCatatan ?? "",
        profil?.namaLengkap ?? "",
      ];
      return kandidat.some((teks) =>
        jarum.some((potongan) => teks.toLowerCase().includes(potongan)),
      );
    };

    const kumpulan = new Map<string, NasabahManual>();

    // 1) Hasil indeks lebih dulu: barisnya bisa di luar jendela, jadi profil dan
    //    nama catatannya dibaca per pengguna lewat indeks `by_user`.
    for (const user of tepat) {
      if (!layak(user)) continue;
      const profil =
        profilPerUser.get(user._id) ??
        (await ctx.db
          .query("nasabahProfil")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .first());
      const namaCatatan =
        namaPerCatatan.get(user._id) ?? (await namaCatatanNasabah(ctx, user._id));
      // Hasil indeks sudah tepat, jadi TIDAK disaring lagi oleh teks ketikan:
      // `08…` dan `62…` adalah nomor yang sama, dan email tersimpan bisa
      // berhuruf besar. Penyaringan di sini justru membuang hasil yang benar.
      kumpulan.set(user._id, ringkasNasabah(user, profil, namaCatatan));
    }

    // 2) Jendela baris terbaru untuk pencarian teks bebas.
    for (const user of users) {
      if (!layak(user)) continue;
      const profil = profilPerUser.get(user._id) ?? null;
      const namaCatatan = namaPerCatatan.get(user._id);
      if (!cocok(user, profil, namaCatatan)) continue;
      kumpulan.set(user._id, ringkasNasabah(user, profil, namaCatatan));
    }

    const hasil = [...kumpulan.values()].sort((a, b) => a.nama.localeCompare(b.nama));
    return {
      hasil: hasil.slice(0, BATAS_HASIL_NASABAH),
      total: hasil.length,
      // Hasil indeks tidak bergantung pada jendela, jadi pencarian yang berhasil
      // lewat indeks dianggap lengkap. Selebihnya jawabannya bergantung pada
      // jendela, dan panel harus tahu itu.
      dibatasi: terpotong && tepat.length === 0,
      jenis: dibaca.jenis,
    };
  },
});

/** Label aktor untuk audit trail — email lebih mudah ditelusuri daripada nama. */
function labelAdmin(admin: Doc<"users">): string {
  return admin.email ?? admin.name ?? "admin";
}

/**
 * Nasabah yang menerima pengajuan harus tampil di ruang peminjam, jadi peran
 * akun disamakan dengan jalur pengajuan nasabah: akun tanpa peran atau akun
 * penyedia dana yang mengajukan sendiri dicatat sebagai Peminjam.
 */
async function pastikanPeranPeminjam(
  ctx: MutationCtx,
  userId: Id<"users">,
  user: Doc<"users">,
): Promise<void> {
  if (user.role === undefined || user.role === ROLES.DANA) {
    await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
  }
}

/** Catat satu pengajuan pinjaman tunai atas nama nasabah — admin. */
export const catatPinjamanManual = mutation({
  args: {
    userIdTarget: v.id("users"),
    pokokPinjaman: v.number(),
    /** Skema harian (7/14/28 hari). Diabaikan bila `tenorBulan` diisi. */
    tenorHari: v.optional(v.number()),
    /** Skema bulanan (1/3/6 bulan). */
    tenorBulan: v.optional(v.number()),
    tujuan: v.string(),
    /** Kosong = pakai nama bank dari data diri nasabah. */
    namaBank: v.optional(v.string()),
    /** Kosong = pakai nomor rekening dari data diri nasabah. */
    nomorRekening: v.optional(v.string()),
    /** Kosong = pakai nama dari data diri/akun nasabah. */
    namaLengkap: v.optional(v.string()),
    /**
     * Dokumen pengajuan. Foto KTP diambil otomatis dari data diri nasabah; dua
     * berkas ini diunggah admin bila ada, dan disimpan pada pinjaman agar panel
     * KYC menampilkannya sama seperti pengajuan jalur nasabah.
     */
    dokSelfieKtpId: v.optional(v.id("_storage")),
    dokSlipGajiId: v.optional(v.id("_storage")),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const { user, profil } = await ambilNasabah(ctx, args.userIdTarget);
    const bersih = validasiPinjamanManual({
      pokokPinjaman: args.pokokPinjaman,
      tenorHari: args.tenorHari,
      tenorBulan: args.tenorBulan,
      tujuan: args.tujuan,
      // Nama: yang diketik admin, lalu CATATAN terbaru (sumber yang sama dengan
      // ruang penyedia dana), baru data diri/akun.
      namaLengkap:
        args.namaLengkap ??
        (await namaCatatanNasabah(ctx, args.userIdTarget)) ??
        profil?.namaLengkap ??
        user.name ??
        user.email ??
        "",
      namaBank: args.namaBank ?? profil?.namaBank ?? "",
      nomorRekening: args.nomorRekening ?? profil?.nomorRekening ?? "",
      catatanPeminjam: args.catatanPeminjam,
    });

    // Plafon per nasabah sengaja TIDAK diperiksa: baris ini mencatat pinjaman
    // yang sudah diputuskan di luar aplikasi, jadi batas kredit dalam aplikasi
    // bukan syaratnya. Yang dijaga hanya langit-langit jalur manual (skema
    // harian) dan batas sistem (skema bulanan, mesin bulanan) supaya satu salah
    // ketik tidak memasukkan nominal di luar jangkauan produk.
    if (bersih.pokokPinjaman > POKOK_MANUAL_MAKS) {
      throw new Error(
        `Pokok pinjaman manual maksimal ${formatRupiah(
          POKOK_MANUAL_MAKS,
        )} — batas sistem. Periksa kembali nominalnya.`,
      );
    }

    const cfg = await getConfig(ctx);
    // Tarif bulanan dibekukan pada pinjaman ini, sama seperti jalur pengajuan
    // nasabah — perubahan tarif admin berikutnya tidak menyentuh kontrak ini.
    const tarifBulanan = tarifBulananDariConfig(cfg);
    await pastikanPeranPeminjam(ctx, args.userIdTarget, user);
    await ensureKodePeminjam(ctx, args.userIdTarget);

    const now = Date.now();
    const nomorReferensi = nomorReferensiManual("pinjaman", now);
    const loanId = await ctx.db.insert("loans", {
      userId: args.userIdTarget,
      pokokPinjaman: bersih.pokokPinjaman,
      pokokDiajukan: bersih.pokokPinjaman,
      tujuan: bersih.tujuan,
      catatanPeminjam: bersih.catatanPeminjam,
      namaLengkap: bersih.namaLengkap,
      namaBank: bersih.namaBank,
      nomorRekening: bersih.nomorRekening,
      status: "diajukan",
      nomorReferensi,
      tenorHari: bersih.tenorHari,
      tenorBulan: bersih.tenorBulan,
      // Snapshot bunga tenor — angka pinjaman ini stabil setelahnya. Jalur
      // harian memakai tarif matriks 7/14/28 hari; nominal di luar matriks
      // (pencatatan manual) memakai tarif global sebagai cadangan. Skema
      // bulanan mengikuti tarif tenor (1 bulan 30%, 3–5 bulan 20%, 6+ 12%).
      persenBunga:
        bersih.tenorBulan === undefined
          ? persenBungaHarian(bersih.pokokPinjaman, bersih.tenorHari) ?? cfg.persenBunga
          : persenBungaPerBulan(bersih.tenorBulan, tarifBulanan),
      tarifBulanan: bersih.tenorBulan === undefined ? undefined : tarifBulanan,
      // Identitas dari data diri tersimpan, tidak diketik ulang admin.
      nik: profil?.nik,
      nomorWhatsApp: profil?.nomorWhatsApp,
      penghasilanBulanan: profil?.penghasilanBulanan,
      sumberPenghasilan: profil?.pekerjaan,
      // Dokumen pengajuan: KTP mengikuti data diri, dua berkas lain dari
      // unggahan admin pada formulir ini.
      dokKtpId: profil?.fotoKtpId,
      dokSelfieKtpId: args.dokSelfieKtpId,
      dokSlipGajiId: args.dokSlipGajiId,
    });
    const dokumen = [
      profil?.fotoKtpId !== undefined ? "KTP" : null,
      args.dokSelfieKtpId !== undefined ? "selfie KTP" : null,
      args.dokSlipGajiId !== undefined ? "bukti penghasilan" : null,
    ].filter((label): label is string => label !== null);
    await audit(
      ctx,
      adminId,
      labelAdmin(admin),
      "pengajuan_manual_pinjaman",
      nomorReferensi,
      `Pencatatan manual oleh admin untuk ${bersih.namaLengkap} — pokok ${formatRupiah(
        bersih.pokokPinjaman,
      )}${bersih.tenorBulan !== undefined ? `, tenor ${bersih.tenorBulan} bulan` : `, tenor ${bersih.tenorHari} hari`}, dokumen: ${dokumen.length > 0 ? dokumen.join(", ") : "belum ada"}. Status awal "diajukan" — keputusan tetap lewat antrean review.`,
    );
    return { appId: loanId, nomorReferensi };
  },
});

/** Catat satu pengajuan gadai atas nama nasabah — admin. */
export const catatGadaiManual = mutation({
  args: {
    userIdTarget: v.id("users"),
    deskripsiBarang: v.string(),
    kategori: v.string(),
    alamatPenilaian: v.string(),
    /** Kosong = pakai nama bank dari data diri nasabah. */
    namaBank: v.optional(v.string()),
    /** Kosong = pakai nomor rekening dari data diri nasabah. */
    nomorRekening: v.optional(v.string()),
    /** Kosong = pakai nama dari data diri/akun nasabah. */
    namaLengkap: v.optional(v.string()),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const { user, profil } = await ambilNasabah(ctx, args.userIdTarget);
    const bersih = validasiGadaiManual({
      deskripsiBarang: args.deskripsiBarang,
      kategori: args.kategori,
      alamatPenilaian: args.alamatPenilaian,
      // Nama: yang diketik admin, lalu CATATAN terbaru (sumber yang sama dengan
      // ruang penyedia dana), baru data diri/akun.
      namaLengkap:
        args.namaLengkap ??
        (await namaCatatanNasabah(ctx, args.userIdTarget)) ??
        profil?.namaLengkap ??
        user.name ??
        user.email ??
        "",
      namaBank: args.namaBank ?? profil?.namaBank ?? "",
      nomorRekening: args.nomorRekening ?? profil?.nomorRekening ?? "",
      catatanPeminjam: args.catatanPeminjam,
    });

    await pastikanPeranPeminjam(ctx, args.userIdTarget, user);
    await ensureKodePeminjam(ctx, args.userIdTarget);

    const now = Date.now();
    const nomorReferensi = nomorReferensiManual("gadai", now);
    const pawnId = await ctx.db.insert("pawns", {
      userId: args.userIdTarget,
      deskripsiBarang: bersih.deskripsiBarang,
      kategori: bersih.kategori,
      alamatPenilaian: bersih.alamatPenilaian,
      namaLengkap: bersih.namaLengkap,
      namaBank: bersih.namaBank,
      nomorRekening: bersih.nomorRekening,
      catatanPeminjam: bersih.catatanPeminjam,
      // Nilai taksiran, harga pasar, dan kondisi fisik sengaja kosong: itu
      // penilaian tim, bukan data yang bisa ditebak saat pencatatan manual.
      status: "diajukan",
      nomorReferensi,
    });
    await audit(
      ctx,
      adminId,
      labelAdmin(admin),
      "pengajuan_manual_gadai",
      nomorReferensi,
      `Pencatatan manual oleh admin untuk ${bersih.namaLengkap} — ${bersih.kategori}: ${bersih.deskripsiBarang}. Status awal "diajukan"; nilai taksiran menunggu penilaian tim.`,
    );
    return { appId: pawnId, nomorReferensi };
  },
});

/** Catat satu pengajuan kredit barang atas nama nasabah — admin. */
export const catatKreditManual = mutation({
  args: {
    userIdTarget: v.id("users"),
    namaBarang: v.string(),
    kategori: v.string(),
    merchant: v.string(),
    tautanBarang: v.optional(v.string()),
    hargaBarang: v.number(),
    /** Uang muka (% harga barang, 10–50). Kosong = DP bawaan yang wajib. */
    dpPersen: v.optional(v.number()),
    /** 1/3/6 bulan (skema bulanan: DP wajib dari kebijakan kredit, margin mengikuti tenor). */
    tenorBulan: v.number(),
    /** Kosong = pakai nomor rekening dari data diri nasabah. */
    nomorRekening: v.optional(v.string()),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);
    const { user, profil } = await ambilNasabah(ctx, args.userIdTarget);
    // Kontrak kredit menyimpan identitas pemohon (nama, NIK, WhatsApp), jadi
    // data diri wajib ada lebih dulu — lebih baik ditolak daripada diisi karangan.
    if (profil === null) {
      throw new Error(
        "Data diri nasabah belum lengkap (nama, NIK, nomor WhatsApp). Lengkapi lewat menu Plafon Nasabah → Data Diri sebelum mencatat pengajuan kredit.",
      );
    }
    // Nama pemohon pada kontrak: CATATAN terbaru lebih dulu (sumber yang sama
    // dengan ruang penyedia dana), baru data diri nasabah.
    const namaPemohon =
      (await namaCatatanNasabah(ctx, args.userIdTarget)) ?? profil.namaLengkap;
    const bersih = validasiKreditManual({
      namaBarang: args.namaBarang,
      kategori: args.kategori,
      merchant: args.merchant,
      tautanBarang: args.tautanBarang,
      hargaBarang: args.hargaBarang,
      dpPersen: args.dpPersen,
      tenorBulan: args.tenorBulan,
      // Rekening boleh diketik admin; kalau kosong diambil dari data diri
      // nasabah — satu aturan format dengan jalur pengajuan nasabah.
      nomorRekening: args.nomorRekening ?? profil.nomorRekening ?? "",
      catatanPeminjam: args.catatanPeminjam,
    });
    // Mesin kredit yang sama dengan jalur nasabah: DP dari admin (bawaan
    // wajib bila kosong), tarif bulanan dari Pengaturan Sistem, sehingga
    // rincian tidak bisa berbeda.
    const tarifBulanan = tarifBulananDariConfig(await getConfig(ctx));
    const quote = quoteKreditBarang({
      hargaBarang: bersih.hargaBarang,
      dpPersen: bersih.dpPersen,
      tenorBulan: bersih.tenorBulan,
      marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
      tarif: tarifBulanan,
    });
    if (!pokokKreditBarangDalamBatas(quote.pokokDibiayai)) {
      throw new Error(
        `Pokok dibiayai kredit barang maksimal ${formatRupiah(KREDIT_BARANG_POKOK_MAKS)}.`,
      );
    }

    await pastikanPeranPeminjam(ctx, args.userIdTarget, user);
    await ensureKodePeminjam(ctx, args.userIdTarget);

    const now = Date.now();
    const nomorReferensi = nomorReferensiManual("kredit", now);
    const kreditId = await ctx.db.insert("kreditBarang", {
      userId: args.userIdTarget,
      nomorReferensi,
      namaBarang: bersih.namaBarang,
      kategori: bersih.kategori,
      merchant: bersih.merchant,
      tautanBarang: bersih.tautanBarang,
      hargaBarang: bersih.hargaBarang,
      dpPersen: bersih.dpPersen,
      tenorBulan: bersih.tenorBulan,
      marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
      tarifBulanan: quote.tarifBulanan,
      status: "diajukan",
      // Nama mengikuti CATATAN pinjaman/kredit terbaru (sumber yang sama dengan
      // ruang penyedia dana), baru data diri — supaya satu orang tidak tampil
      // dengan dua nama berbeda di ruang dana.
      namaLengkap: namaPemohon,
      nik: profil.nik,
      nomorRekening: bersih.nomorRekening,
      nomorWhatsApp: profil.nomorWhatsApp,
      catatanPeminjam: bersih.catatanPeminjam,
    });
    await audit(
      ctx,
      adminId,
      labelAdmin(admin),
      "pengajuan_manual_kredit",
      nomorReferensi,
      `Pencatatan manual oleh admin untuk ${namaPemohon} — ${bersih.namaBarang} (${bersih.merchant}, harga ${formatRupiah(
        bersih.hargaBarang,
      )}, tenor ${bersih.tenorBulan} bulan, cicilan ${formatRupiah(
        quote.cicilanPerBulan,
      )}). Status awal "diajukan".`,
    );
    return { appId: kreditId, nomorReferensi };
  },
});

/**
 * Catat PEMOHON YANG BELUM PUNYA AKUN (nasabah walk-in / data lama) — admin.
 *
 * Admin mengisi identitas dan mengunggah dokumen pengajuan (foto KTP minimal,
 * selfie/bukti penghasilan bila ada). Server membuat dua baris sekaligus:
 *
 *  - `users` sebagai pemilik pengajuan, ditandai `dibuatAdminPada`. Akun ini
 *    SENGAJA tidak punya kredensial masuk (`authAccounts` tidak dibuat): ia ada
 *    supaya pengajuan, data diri, dan kode peminjam punya pemilik yang sah,
 *    bukan supaya orang itu bisa masuk. Bila pemohon mendaftar sendiri nanti,
 *    ia memakai akun barunya — akun pencatatan ini tinggal jadi riwayat.
 *  - `nasabahProfil` (data diri) lewat helper yang SAMA dengan jalur data diri
 *    admin, jadi normalisasi/validasi dan foto KTP-nya tidak berbeda.
 *
 * NIK kembar ditolak: satu orang satu data diri, supaya dua akun tidak
 * memecah riwayat pinjaman orang yang sama.
 */
export const buatNasabahBaru = mutation({
  args: {
    namaLengkap: v.string(),
    nik: v.string(),
    nomorWhatsApp: v.string(),
    alamat: v.string(),
    pekerjaan: v.string(),
    /** Rupiah bulat, atau null bila tidak diisi. */
    penghasilanBulanan: v.union(v.number(), v.null()),
    namaBank: v.string(),
    nomorRekening: v.string(),
    /** Foto KTP hasil unggahan admin (Convex storage). */
    fotoKtpId: v.optional(v.id("_storage")),
    /** Catatan sumber data, mis. "berkas fisik di kantor". Opsional. */
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdmin(ctx);

    // Aturan identitas satu sumber dengan form data diri (lib/dataDiri.ts):
    // NIK 16 angka, WhatsApp 62…, nama jadi HURUF BESAR.
    const { tersimpan, pesan } = bacaDataDiri({
      namaLengkap: args.namaLengkap,
      nik: args.nik,
      nomorWhatsApp: args.nomorWhatsApp,
      alamat: args.alamat,
      pekerjaan: args.pekerjaan,
      penghasilan: args.penghasilanBulanan === null ? "" : String(args.penghasilanBulanan),
      namaBank: args.namaBank,
      nomorRekening: args.nomorRekening,
    });
    if (tersimpan === null) {
      throw new Error(pesan ?? "Identitas pemohon tidak valid.");
    }

    // Satu orang satu data diri. NIK diperiksa, TAPI tidak cukup sendiri:
    // data dari luar aplikasi sering membawa NIK salah ketik untuk orang yang
    // sudah tercatat, dan itulah cara duplikat ("ALIFAN" di samping "ALFIAN
    // RIFKI JUNIAWAN") terbentuk. Nomor WhatsApp ikut dicocokkan karena lebih
    // stabil, sehingga satu orang tidak dibuatkan dua akun dengan dua riwayat.
    const profilLain = await ctx.db.query("nasabahProfil").collect();
    const kembar = cariNasabahKembar(profilLain, {
      nik: tersimpan.nik,
      nomorWhatsApp: tersimpan.nomorWhatsApp,
    });
    if (kembar !== undefined) {
      const pemilik = await ctx.db.get(kembar.baris.userId);
      const sebab = kembar.sebab === "nik" ? "NIK" : "Nomor WhatsApp";
      throw new Error(
        `${sebab} ini sudah tercatat untuk ${namaTampil([
          kembar.baris.namaLengkap,
          pemilik?.name,
        ])}. Pilih nasabah itu di daftar — jangan dicatat ulang supaya riwayat pinjamannya tidak terbelah dua — atau perbaiki datanya lewat menu Data Diri.`,
      );
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: tersimpan.namaLengkap,
      role: ROLES.PEMINJAM,
      isAnonymous: false,
      dibuatAdminPada: now,
    });
    await ensureKodePeminjam(ctx, userId);
    await simpanDataDiriProfil(ctx, {
      userId,
      isian: {
        namaLengkap: tersimpan.namaLengkap,
        nik: tersimpan.nik,
        nomorWhatsApp: tersimpan.nomorWhatsApp,
        alamat: tersimpan.alamat ?? "",
        pekerjaan: tersimpan.pekerjaan ?? "",
        penghasilanBulanan: tersimpan.penghasilanBulanan,
        namaBank: tersimpan.namaBank ?? "",
        nomorRekening: tersimpan.nomorRekening ?? "",
      },
      fotoKtpId: args.fotoKtpId,
      sumber: "admin",
      olehLabel: labelAdmin(admin),
    });

    const user = await ctx.db.get(userId);
    if (user === null) {
      throw new Error("Akun pemohon baru gagal dibuat. Silakan coba lagi.");
    }
    const profil = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const catatan = args.catatan?.trim() ?? "";
    await audit(
      ctx,
      adminId,
      labelAdmin(admin),
      "nasabah_baru_manual",
      tersimpan.namaLengkap,
      `Nasabah baru tanpa akun aplikasi dicatat admin — NIK ${tersimpan.nik}, WhatsApp ${tersimpan.nomorWhatsApp}` +
        `${args.fotoKtpId !== undefined ? ", foto KTP diunggah" : ", tanpa foto KTP"}` +
        `${catatan === "" ? "" : `. Catatan: ${catatan}`}.`,
    );

    return ringkasNasabah(user, profil);
  },
});
