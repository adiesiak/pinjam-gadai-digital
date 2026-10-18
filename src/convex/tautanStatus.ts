import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { acakHex, simpanTitik } from "./lokasi";
import { audit, tarifDendaBerlaku } from "./system";
import { pelunasanPinjaman } from "../lib/loan";
import { labelStatusPinjaman } from "../lib/statusPinjaman";
import { tanggalRingkas } from "../lib/jatuhTempo";
import { koordinatIndonesia } from "../lib/lokasi";
import {
  AKURASI_MAKS_TAUTAN_METER,
  bolehPing,
  bolehUnggahSelfie,
  berkasSelfieWajar,
  hitungKedaluwarsa,
  normalkanToken,
  pesanTautanTidakBerlaku,
  SUMBER_TAUTAN,
  TAUTAN_KEBIJAKAN,
  tautanKedaluwarsa,
  tokenTautanValid,
} from "../lib/tautanStatus";

/**
 * TAUTAN STATUS & VERIFIKASI LOKASI — sisi server.
 *
 * Alur lengkapnya:
 *  1. Admin menekan "Kirim Info Tagihan & Cek Status (WA)" di panel. `buatTautan`
 *     membuat (atau memakai ulang) token milik pinjaman itu, lalu klien menyusun
 *     pesan WhatsApp + tautan `/cek-status/<token>`.
 *  2. Peminjam membuka tautan. Halaman memuat ringkasan lewat `infoTautan`,
 *     meminta izin kamera & lokasi kepada peminjam, mengambil SATU foto selfie
 *     dan titik GPS, lalu mengirimnya.
 *  3. Titik lokasi berkala (tiap ±10 detik selama halaman terbuka) masuk lewat
 *     HTTP action `/api/cek-status/titik` → `catatPing`; verifikasi selfie lewat
 *     `/api/cek-status/verifikasi` → `catatVerifikasi`. Keduanya lewat HTTP
 *     action supaya IP pemakai dibaca dari header permintaan (bukan klaim klien).
 *
 * Titik yang lolos pemeriksaan disalin ke `lokasiJejak` lewat `simpanTitik`,
 * sehingga peta live admin, deteksi lokasi palsu, dan job retensi tetap memakai
 * satu jalur. Baris `live_locations` menyimpan asal-usul (`source`), IP, dan
 * catatan bila penyalinan ditolak — jadi apa yang benar-benar dilaporkan
 * perangkat tetap terekam, tanpa mengotori jejak resmi.
 */

/** Batas panjang IP/UA yang disimpan (dipotong, bukan ditolak). */
const MAKS_IP = 64;
const MAKS_UA = 200;

function potong(nilai: string | undefined, maks: number): string | undefined {
  if (typeof nilai !== "string") return undefined;
  const bersih = nilai.trim();
  return bersih === "" ? undefined : bersih.slice(0, maks);
}

/** Indeks hari untuk kuota ping harian (UTC, konsisten antar permintaan). */
function indeksHari(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

/** Token baru: 32 karakter heksadesimal (128 bit) dari sumber acak kriptografis. */
function buatToken(): string {
  return acakHex(TAUTAN_KEBIJAKAN.panjangToken / 2);
}

/** Tautan aktif (belum kedaluwarsa) dari sebuah token; null bila tidak sah. */
async function tautanDariToken(
  ctx: QueryCtx | MutationCtx,
  tokenMentah: string,
  now: number,
): Promise<{ ok: true; tautan: Doc<"tautanVerifikasi"> } | { ok: false; pesan: string }> {
  const token = normalkanToken(tokenMentah);
  if (!tokenTautanValid(token)) return { ok: false, pesan: pesanTautanTidakBerlaku("format") };
  const tautan = await ctx.db
    .query("tautanVerifikasi")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (tautan === null) return { ok: false, pesan: pesanTautanTidakBerlaku("tidak_dikenal") };
  if (tautanKedaluwarsa(tautan.kedaluwarsaPada, now)) {
    return { ok: false, pesan: pesanTautanTidakBerlaku("kedaluwarsa") };
  }
  return { ok: true, tautan };
}

/**
 * Simpan satu titik dari tautan: validasi bentuknya, tulis `live_locations`,
 * lalu coba salin ke jejak resmi (`lokasiJejak`) lewat pemeriksa yang sama
 * dengan heartbeat dashboard.
 */
async function simpanTitikTautan(
  ctx: MutationCtx,
  tautan: Doc<"tautanVerifikasi">,
  input: {
    lat: number;
    lng: number;
    akurasi: number;
    sumber: string;
    ipAddress?: string;
    userAgent?: string;
  },
  now: number,
): Promise<{ ok: true; waktu: number; catatan: string | null } | { ok: false; pesan: string }> {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { ok: false, pesan: "Koordinat lokasi tidak valid." };
  }
  if (!koordinatIndonesia(input.lat, input.lng)) {
    return {
      ok: false,
      pesan: "Titik lokasi berada di luar wilayah Indonesia (atau tidak valid). Periksa GPS perangkat lalu coba lagi.",
    };
  }
  if (!Number.isFinite(input.akurasi) || input.akurasi < 0 || input.akurasi > AKURASI_MAKS_TAUTAN_METER) {
    return {
      ok: false,
      pesan: `Akurasi GPS terlalu rendah (±${Number.isFinite(input.akurasi) ? Math.round(input.akurasi) : "?"} m, maksimum ${AKURASI_MAKS_TAUTAN_METER} m). Pindah ke area terbuka lalu coba lagi.`,
    };
  }

  const loan = await ctx.db.get(tautan.loanId);
  if (loan === null) return { ok: false, pesan: "Pinjaman pada tautan ini tidak ditemukan." };

  // Penyalinan ke jejak resmi memakai pemeriksa lokasi yang sama dengan
  // dashboard (wilayah, akurasi, lompatan mustahil, mock location). Bila
  // ditolak, titik tetap disimpan di `live_locations` dengan catatan — bukti
  // apa yang dilaporkan perangkat tidak hilang.
  let catatan: string | null = null;
  try {
    await simpanTitik(ctx, loan.userId, {
      lat: input.lat,
      lng: input.lng,
      akurasi: input.akurasi,
      sumber: "web",
      loanId: loan._id,
    });
  } catch (err) {
    catatan = err instanceof Error ? err.message : "Titik ditolak pemeriksa lokasi.";
  }

  await ctx.db.insert("live_locations", {
    borrowerId: loan.userId,
    loanId: loan._id,
    latitude: input.lat,
    longitude: input.lng,
    accuracy: input.akurasi,
    source: input.sumber,
    updatedAt: now,
    ...(potong(input.ipAddress, MAKS_IP) !== undefined
      ? { ipAddress: potong(input.ipAddress, MAKS_IP) }
      : {}),
    ...(potong(input.userAgent, MAKS_UA) !== undefined
      ? { userAgent: potong(input.userAgent, MAKS_UA) }
      : {}),
    ...(catatan !== null ? { catatan } : {}),
  });

  return { ok: true, waktu: now, catatan };
}

/**
 * Buat (atau pakai ulang) tautan status untuk satu pinjaman. Admin saja.
 *
 * Idempoten selama masa berlaku: menekan tombol dua kali tidak membuat token
 * baru, sehingga tautan yang sudah dikirim ke peminjam tetap sah.
 */
export const buatTautan = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const admin = await requireAdminSession(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");

    const now = Date.now();
    const adaSebelumnya = await ctx.db
      .query("tautanVerifikasi")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .collect();
    const aktif = adaSebelumnya.find((t) => !tautanKedaluwarsa(t.kedaluwarsaPada, now));
    if (aktif !== undefined) {
      return { token: aktif.token, kedaluwarsaPada: aktif.kedaluwarsaPada, dibuatBaru: false };
    }

    const token = buatToken();
    const kedaluwarsaPada = hitungKedaluwarsa(now);
    await ctx.db.insert("tautanVerifikasi", {
      loanId,
      token,
      dibuatPada: now,
      kedaluwarsaPada,
      dibuatOlehUserId: admin.userId,
    });
    await audit(
      ctx,
      admin.userId,
      admin.user.name ?? "Super Admin",
      "buat_tautan_status",
      loanId,
      `Tautan status dibuat untuk ${loan.nomorReferensi}`,
    );
    return { token, kedaluwarsaPada, dibuatBaru: true };
  },
});

/**
 * Ringkasan yang ditampilkan halaman publik `/cek-status/<token>`.
 *
 * Hanya berisi data milik pinjaman pada token itu; tidak ada nomor telepon,
 * NIK, atau daftar pinjaman lain. Nominalnya berasal dari `pelunasanPinjaman`
 * (sumber yang sama dengan dashboard & tabel admin), jadi tidak ada angka
 * yang dihitung ulang di sisi klien.
 */
export const infoTautan = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const now = Date.now();
    const hasil = await tautanDariToken(ctx, token, now);
    if (!hasil.ok) return { valid: false as const, pesan: hasil.pesan };

    const loan = await ctx.db.get(hasil.tautan.loanId);
    if (loan === null) {
      return { valid: false as const, pesan: pesanTautanTidakBerlaku("tidak_dikenal") };
    }

    const pelunasan = pelunasanPinjaman(
      {
        pokokPinjaman: loan.pokokPinjaman,
        status: loan.status,
        tenorHari: loan.tenorHari ?? undefined,
        tenorBulan: loan.tenorBulan ?? undefined,
        didanaiPada: loan.didanaiPada ?? undefined,
        persenBunga: loan.persenBunga ?? undefined,
      },
      now,
      await tarifDendaBerlaku(ctx),
    );

    return {
      valid: true as const,
      sudahVerifikasi: hasil.tautan.diverifikasiPada !== undefined,
      sudahLunas: loan.status === "lunas",
      ringkasan: {
        namaLengkap: loan.namaLengkap,
        nomorReferensi: loan.nomorReferensi,
        statusLabel: labelStatusPinjaman(loan.status),
        pokokPinjaman: loan.pokokPinjaman,
        tenorTeks:
          loan.tenorBulan !== null && loan.tenorBulan !== undefined
            ? `${loan.tenorBulan} bulan`
            : loan.tenorHari !== null && loan.tenorHari !== undefined
              ? `${loan.tenorHari} hari`
              : null,
        diajukanPada: loan._creationTime,
        totalKewajiban: pelunasan?.totalKewajibanDenganPenalti ?? null,
        totalTanpaDenda: pelunasan?.totalKewajibanPelunasan ?? null,
        dendaTerlambat: pelunasan?.dendaTerlambat ?? null,
        jatuhTempoPada: pelunasan?.jatuhTempoPada ?? null,
        tanggalJatuhTempo: pelunasan === null ? null : tanggalRingkas(pelunasan.jatuhTempoPada),
        sisaHari: pelunasan?.sisaHari ?? null,
        hariTerlambat: pelunasan?.hariTerlambat ?? 0,
      },
    };
  },
});

/** Catat bahwa halaman dibuka (respons peminjam terlihat di panel admin). */
export const bukaTautan = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const now = Date.now();
    const hasil = await tautanDariToken(ctx, token, now);
    if (!hasil.ok) return { ok: false as const, pesan: hasil.pesan };
    await ctx.db.patch(hasil.tautan._id, {
      jumlahBuka: (hasil.tautan.jumlahBuka ?? 0) + 1,
      terakhirDibuka: now,
    });
    return { ok: true as const, sudahVerifikasi: hasil.tautan.diverifikasiPada !== undefined };
  },
});

/**
 * URL unggah selfie — hanya diberikan bila tautannya sah dan batas unggahan
 * belum terlampaui. Dipanggil dari HTTP action supaya IP peminta bisa dicatat.
 */
export const urlUnggahSelfie = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const hasil = await tautanDariToken(ctx, token, Date.now());
    if (!hasil.ok) return { ok: false as const, pesan: hasil.pesan };
    if (!bolehUnggahSelfie(hasil.tautan.jumlahUnggah)) {
      return {
        ok: false as const,
        pesan:
          "Batas jumlah pengambilan foto untuk tautan ini sudah tercapai. Tutup halaman ini lalu minta tautan baru kepada petugas PINDAI.",
      };
    }
    await ctx.db.patch(hasil.tautan._id, {
      jumlahUnggah: (hasil.tautan.jumlahUnggah ?? 0) + 1,
    });
    const url = await ctx.storage.generateUploadUrl();
    return { ok: true as const, url, maksByte: TAUTAN_KEBIJAKAN.maksByteSelfie };
  },
});

/**
 * Simpan satu titik lokasi dari halaman status (dipanggil tiap ±10 detik).
 * Pembatas jeda + kuota harian dijaga di sini, bukan di klien.
 */
export const catatPing = internalMutation({
  args: {
    token: v.string(),
    lat: v.number(),
    lng: v.number(),
    akurasi: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const hasil = await tautanDariToken(ctx, args.token, now);
    if (!hasil.ok) return { ok: false as const, pesan: hasil.pesan };

    const hariIni = indeksHari(now);
    const jumlahHariIni = hasil.tautan.hariPing === hariIni ? hasil.tautan.jumlahPing ?? 0 : 0;
    const boleh = bolehPing(hasil.tautan.terakhirPing, jumlahHariIni, now);
    if (!boleh.boleh) {
      // Bukan galat pengguna: ping yang terlalu rapat cukup diabaikan diam-diam
      // oleh klien (tidak ada yang perlu ditampilkan), sedangkan kuota harian
      // diberitahukan supaya peminjam tahu mengapa pembaruan berhenti.
      return { ok: false as const, diabaikan: true, pesan: boleh.alasan ?? "" };
    }

    const titik = await simpanTitikTautan(
      ctx,
      hasil.tautan,
      {
        lat: args.lat,
        lng: args.lng,
        akurasi: args.akurasi,
        sumber: SUMBER_TAUTAN.klikTautan,
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      },
      now,
    );
    if (!titik.ok) return { ok: false as const, pesan: titik.pesan };

    await ctx.db.patch(hasil.tautan._id, {
      terakhirPing: now,
      jumlahPing: jumlahHariIni + 1,
      hariPing: hariIni,
    });
    return { ok: true as const, waktu: titik.waktu, catatan: titik.catatan };
  },
});

/**
 * Nama pintu masuk yang diminta produk untuk pembaruan lokasi dari tautan:
 * `updateBorrowerLiveLocation`. Di sini ia adalah handler yang sama dengan
 * `catatPing` — TIDAK ada dua jalur dengan aturan berbeda — dan HTTP action
 * `/api/cek-status/titik` memanggil lewat nama ini.
 */
export const updateBorrowerLiveLocation = catatPing;

/**
 * Simpan hasil verifikasi: foto selfie + waktu + koordinat + IP/UA.
 * Berkasnya sudah ada di penyimpanan Convex; di sini diperiksa kewajarannya
 * lalu dicatat sebagai audit append-only.
 */
export const catatVerifikasi = internalMutation({
  args: {
    token: v.string(),
    /**
     * ID berkas DIKIRIM SEBAGAI STRING, bukan `v.id("_storage")`.
     *
     * Kenapa: endpoint ini publik, dan ID yang cacat tembus ke validator
     * Convex hanya akan menghasilkan pesan internal mentah ("Value does not
     * match validator") yang tidak bisa ditindaklanjuti peminjam. Dengan string,
     * kewajaran ID diperiksa lewat keberadaan barisnya di `_storage` — ID palsu
     * berujung pesan jujur "berkas tidak ditemukan", bukan galat Convex.
     */
    selfieFileId: v.string(),
    diambilPada: v.number(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    akurasi: v.optional(v.number()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const hasil = await tautanDariToken(ctx, args.token, now);
    if (!hasil.ok) return { ok: false as const, pesan: hasil.pesan };

    const loan = await ctx.db.get(hasil.tautan.loanId);
    if (loan === null) return { ok: false as const, pesan: "Pinjaman pada tautan ini tidak ditemukan." };

    let ukuran = 0;
    try {
      const meta = await ctx.db.system.get("_storage", args.selfieFileId as Id<"_storage">);
      ukuran = meta?.size ?? 0;
    } catch {
      // ID tidak sah menurut format Convex (atau barisnya sudah dibersihkan)
      // diperlakukan sama dengan berkas kosong: ditolak dengan pesan yang bisa
      // dibaca peminjam, bukan galat internal.
      ukuran = 0;
    }
    const wajar = berkasSelfieWajar(ukuran);
    if (!wajar.ok) return { ok: false as const, pesan: wajar.alasan ?? "Berkas foto tidak sah." };

    // Waktu pengambilan dari perangkat dipakai apa adanya, tetapi dibatasi:
    // jam perangkat yang jauh di depan/belakang tidak boleh membuat audit
    // terlihat seolah foto diambil di masa depan.
    const diambilPada = Math.min(
      Math.max(args.diambilPada, now - 86_400_000),
      now + 5 * 60_000,
    );

    const punyaKoordinat =
      typeof args.lat === "number" &&
      typeof args.lng === "number" &&
      koordinatIndonesia(args.lat, args.lng);

    await ctx.db.insert("verifikasiLokasi", {
      loanId: loan._id,
      borrowerId: loan.userId,
      tautanId: hasil.tautan._id,
      // Cast aman: baris ini hanya tercapai setelah berkasnya benar-benar ada
      // dan ukurannya wajar (lihat pemeriksaan `berkasSelfieWajar` di atas).
      selfieFileId: args.selfieFileId as Id<"_storage">,
      selfieByte: ukuran,
      diambilPada,
      diterimaPada: now,
      ...(punyaKoordinat ? { latitude: args.lat, longitude: args.lng } : {}),
      ...(punyaKoordinat && typeof args.akurasi === "number" ? { accuracy: args.akurasi } : {}),
      ...(potong(args.ipAddress, MAKS_IP) !== undefined
        ? { ipAddress: potong(args.ipAddress, MAKS_IP) }
        : {}),
      ...(potong(args.userAgent, MAKS_UA) !== undefined
        ? { userAgent: potong(args.userAgent, MAKS_UA) }
        : {}),
      sumber: SUMBER_TAUTAN.verifikasi,
    });

    // Koordinat verifikasi ikut dicatat sebagai titik lokasi (sumber berbeda),
    // supaya peta live menampilkan titik saat verifikasi terjadi.
    if (punyaKoordinat) {
      await simpanTitikTautan(
        ctx,
        hasil.tautan,
        {
          lat: args.lat as number,
          lng: args.lng as number,
          akurasi: typeof args.akurasi === "number" ? args.akurasi : 0,
          sumber: SUMBER_TAUTAN.verifikasi,
          ipAddress: args.ipAddress,
          userAgent: args.userAgent,
        },
        now,
      );
    }

    await ctx.db.patch(hasil.tautan._id, { diverifikasiPada: now });
    await audit(
      ctx,
      loan.userId,
      "verifikasi lokasi",
      "verifikasi_tautan",
      loan._id,
      `Verifikasi selfie dari tautan WhatsApp untuk ${loan.nomorReferensi} (${Math.round(ukuran / 1024)} KB)`,
    );
    return { ok: true as const, waktu: now };
  },
});

/**
 * Riwayat tautan & verifikasi untuk panel admin: hasil verifikasi terakhir
 * beserta tautan fotonya, plus titik lokasi terakhir yang datang dari tautan.
 */
export const verifikasiTerbaru = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdminSession(ctx);
    const maks = Math.min(Math.max(limit ?? 20, 1), 60);

    const verifikasi = await ctx.db
      .query("verifikasiLokasi")
      .withIndex("by_diterima")
      .order("desc")
      .take(maks);

    const hasil = [];
    for (const row of verifikasi) {
      const loan = await ctx.db.get(row.loanId);
      const foto = await ctx.storage.getUrl(row.selfieFileId);
      hasil.push({
        _id: row._id,
        namaLengkap: loan?.namaLengkap ?? "—",
        nomorReferensi: loan?.nomorReferensi ?? "—",
        foto,
        selfieByte: row.selfieByte,
        diambilPada: row.diambilPada,
        diterimaPada: row.diterimaPada,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        accuracy: row.accuracy ?? null,
        ipAddress: row.ipAddress ?? null,
        userAgent: row.userAgent ?? null,
      });
    }

    const ping = await ctx.db
      .query("live_locations")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(maks * 2);
    const titik = [];
    for (const row of ping) {
      const pinjaman = row.loanId === undefined ? null : await ctx.db.get(row.loanId);
      const nama = namaPinjamanAman(pinjaman);
      titik.push({
        _id: row._id,
        namaLengkap: nama.namaLengkap,
        nomorReferensi: nama.nomorReferensi,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy,
        source: row.source,
        updatedAt: row.updatedAt,
        ipAddress: row.ipAddress ?? null,
        catatan: row.catatan ?? null,
      });
    }

    return { verifikasi: hasil, titik };
  },
});

/** Bentuk aman pinjaman untuk panel admin (tanpa melempar bila hilang). */
function namaPinjamanAman(
  loan: Doc<"loans"> | null,
): { namaLengkap: string; nomorReferensi: string } {
  return {
    namaLengkap: loan?.namaLengkap ?? "—",
    nomorReferensi: loan?.nomorReferensi ?? "—",
  };
}

/**
 * Status tautan sebuah pinjaman untuk baris admin: apakah tautan aktif sudah
 * ada, kapan terakhir dibuka, dan apakah verifikasi sudah masuk.
 */
export const statusTautanPinjaman = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdminSession(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("tautanVerifikasi")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .collect();
    const aktif = rows.find((t) => !tautanKedaluwarsa(t.kedaluwarsaPada, now)) ?? null;
    const verifikasi = await ctx.db
      .query("verifikasiLokasi")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(5);
    return {
      adaTautanAktif: aktif !== null,
      kedaluwarsaPada: aktif?.kedaluwarsaPada ?? null,
      terakhirDibuka: aktif?.terakhirDibuka ?? null,
      jumlahBuka: aktif?.jumlahBuka ?? 0,
      terakhirPing: aktif?.terakhirPing ?? null,
      sudahVerifikasi: aktif?.diverifikasiPada !== undefined || verifikasi.length > 0,
      jumlahVerifikasi: verifikasi.length,
    };
  },
});
