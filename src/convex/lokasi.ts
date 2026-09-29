import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { internal } from "./_generated/api";
import { audit, getConfig } from "./system";
import { jarakKm } from "../lib/geo";
import { plafonPeminjam } from "../lib/plafon";
import {
  bolehKirimPeringatanLokasi,
  INDONESIA_BOUNDS,
  LOKASI_KEBIJAKAN,
  periksaLokasiPalsu,
  koordinatIndonesia,
  type TandaLokasiPalsu,
} from "../lib/lokasi";

/**
 * Gerbang lokasi wajib aktif.
 *
 * Peminjam tidak bisa mematikan lokasi lalu tetap bertransaksi: setiap aksi
 * finansial memanggil `requireLokasiSegar` dan ditolak bila titik GPS terakhir
 * di server sudah kedaluwarsa. Perangkat mengirim titik lewat `catatLokasi`
 * (dipanggil LocationGate di dashboard tiap ±60 detik).
 *
 * Pelacakan saat aplikasi ditutup hanya mungkin di aplikasi native — lihat
 * `wajibAplikasiNative` di kebijakan sistem.
 */

async function penggunaMasuk(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error("Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengakses fitur ini.");
  }
  return { userId, user };
}

/** Rentang aksi finansial Peminjam — pendana/admin tidak perlu lokasi. */
const PERAN_WAJIB_LOKASI: readonly string[] = [ROLES.PEMINJAM, ROLES.MEMBER];

/**
 * Perangkat dianggap masih dipakai selama ini (ms).
 *
 * Jauh lebih ketat daripada "pernah terdaftar": perangkat yang berhenti
 * mengirim heartbeat dianggap tidak aktif lagi, sehingga nasabah yang memasang
 * aplikasi sebulan lalu tetapi kini kembali ke browser tidak lolos kebijakan
 * "wajib aplikasi".
 */
const MASA_PERANGKAT_DIPAKAI_MS = 24 * 60 * 60 * 1000;

/** Platform yang diterima untuk pendaftaran perangkat aplikasi. */
const PLATFORM_APLIKASI: readonly string[] = ["android", "ios"];

/**
 * Angka acak heksadesimal — kredensial perangkat.
 * Memakai WebCrypto bila tersedia, dengan cadangan Math.random agar tidak
 * bergantung pada ketersediaan API di runtime (mutasi tetap harus tuntas).
 */
function acakHex(panjangByte: number): string {
  const bytes = new Uint8Array(panjangByte);
  const webCrypto = typeof crypto === "undefined" ? undefined : crypto;
  if (webCrypto !== undefined && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function pesanLokasiKedaluwarsa(umurMenit: number | null, batasMenit: number): string {
  const keadaan =
    umurMenit === null
      ? "belum pernah tercatat"
      : `terakhir ${umurMenit} menit lalu`;
  return (
    `Lokasi wajib aktif untuk transaksi ini (titik GPS: ${keadaan}, batas ${batasMenit} menit). ` +
    "Nyalakan GPS lalu buka kembali dashboard PINDAI — aplikasi akan mengirim titik lokasi baru, setelah itu coba lagi."
  );
}

/**
 * Simpan titik lokasi: validasi kewajaran, tulis jejak audit (lokasiJejak),
 * lalu segarkan status terkini (lokasiStatus). Dipakai gerbang dashboard dan
 * jalur pelacakan lama (tracking.pushTitik).
 */
export async function simpanTitik(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: {
    lat: number;
    lng: number;
    akurasi: number;
    sumber: string;
    platform?: string;
    versiApp?: string;
    deviceId?: string;
    loanId?: Id<"loans">;
    /** Waktu di perangkat (opsional) — server selalu memakai jam sendiri. */
    waktuPerangkat?: number;
    /**
     * Perangkat melaporkan titik berasal dari mock location (Android
     * `Location.isMock`, iOS `sourceInformation.isSimulatedBySoftware`).
     * Titik seperti ini DITOLAK, bukan sekadar dicatat.
     */
    mock?: boolean;
  },
): Promise<{ waktu: number; jarakLompatKm: number | null; tanda: TandaLokasiPalsu[] }> {
  if (!koordinatIndonesia(input.lat, input.lng)) {
    throw new Error(
      "Titik lokasi berada di luar wilayah Indonesia atau tidak valid. Periksa GPS perangkat Anda.",
    );
  }
  if (
    !Number.isFinite(input.akurasi) ||
    input.akurasi < 0 ||
    input.akurasi > LOKASI_KEBIJAKAN.maxAkurasiMeter
  ) {
    throw new Error(
      `Akurasi GPS terlalu rendah (±${Math.round(input.akurasi)} m, maksimum ${LOKASI_KEBIJAKAN.maxAkurasiMeter} m). Pindah ke area terbuka lalu coba lagi.`,
    );
  }

  const now = Date.now();
  const sebelumnya = await ctx.db
    .query("lokasiStatus")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  // Deteksi lokasi palsu: mock location dari perangkat, akurasi di bawah
  // kemampuan sensor, dan lompatan mustahil. Aturannya ada di
  // `periksaLokasiPalsu` (lib/lokasi.ts) supaya jalur dashboard, layanan
  // native, dan pengujian memakai definisi yang sama.
  const periksa = periksaLokasiPalsu(
    { lat: input.lat, lng: input.lng, akurasi: input.akurasi, mock: input.mock },
    sebelumnya,
    now,
  );
  if (periksa.palsu) {
    throw new Error(periksa.alasan ?? "Lokasi perangkat terdeteksi tidak sah.");
  }
  const { jarakLompatKm, tanda } = periksa;

  // Sumber titik: klaim "aplikasi" hanya sah bila disertai ID perangkat.
  // Tanpa penjagaan ini, invarian "aplikasi ⇒ ada perangkat" jebol dan
  // kebijakan "wajib aplikasi" bisa dipenuhi dari browser.
  const sumber = input.sumber === "aplikasi" && input.deviceId ? "aplikasi" : "web";

  await ctx.db.insert("lokasiJejak", {
    userId,
    loanId: input.loanId,
    lat: input.lat,
    lng: input.lng,
    akurasi: input.akurasi,
    waktu: now,
    tanda: tanda.length > 0 ? tanda : undefined,
    mock: input.mock === true ? true : undefined,
  });

  const patch = {
    lat: input.lat,
    lng: input.lng,
    akurasi: input.akurasi,
    waktu: now,
    sumber,
    platform: input.platform,
    versiApp: input.versiApp,
    tanda,
    identikBerturut: periksa.identikBerturut,
  };
  if (sebelumnya === null) {
    await ctx.db.insert("lokasiStatus", { userId, ...patch });
  } else {
    await ctx.db.patch(sebelumnya._id, patch);
  }

  // Persetujuan pemantauan dicatat otomatis: lokasi wajib selama pinjaman
  // berjalan (tampil jelas di gate sebelum pengguna melanjutkan).
  const consent = await ctx.db
    .query("trackingConsents")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (consent === null) {
    await ctx.db.insert("trackingConsents", {
      userId,
      aktif: true,
      disetujuiPada: now,
    });
  } else if (!consent.aktif) {
    await ctx.db.patch(consent._id, {
      aktif: true,
      disetujuiPada: now,
      dinonaktifkanPada: undefined,
    });
  }

  // Titik yang dicurigai (bukan yang ditolak): kabari nasabah & tim review.
  if (tanda.length > 0) {
    await catatPeringatanLokasi(ctx, userId, tanda, {
      lat: input.lat,
      lng: input.lng,
      waktu: now,
      loanId: input.loanId,
    });
  }

  // Perangkat aplikasi native: catat agar kebijakan "wajib aplikasi" bekerja.
  if (sumber === "aplikasi" && input.deviceId) {
    const deviceId = input.deviceId;
    const lama = await ctx.db
      .query("perangkat")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    const baris = {
      userId,
      deviceId,
      platform: input.platform ?? "tidak diketahui",
      versiApp: input.versiApp ?? "0",
      terakhirDilihat: now,
    };
    if (lama === null) {
      await ctx.db.insert("perangkat", { ...baris, terdaftarPada: now });
    } else {
      await ctx.db.patch(lama._id, baris);
    }
  }

  return { waktu: now, jarakLompatKm, tanda };
}

/**
 * Catat peringatan "lokasi dicurigai" untuk nasabah + tim review.
 *
 * Dipanggil hanya saat titik lokasi DITANDAI (mis. koordinat beku), bukan saat
 * ditolak — titik yang ditolak sudah ditangani pesan galat langsung ke nasabah.
 * Dibatasi satu peringatan per `LOKASI_PERINGATAN_JEDA_JAM` per nasabah supaya
 * tidak menyerbu kotak masuk, lalu:
 *  - baris `lokasiPeringatan` → banner di dashboard nasabah (query reaktif);
 *  - entri auditLog → terlihat tim review tanpa membuka peta;
 *  - action WhatsApp dijadwalkan (best-effort, hanya tercatat bila gateway
 *    belum aktif — lihat whatsapp.kirimPeringatanLokasi).
 */
async function catatPeringatanLokasi(
  ctx: MutationCtx,
  userId: Id<"users">,
  tanda: TandaLokasiPalsu[],
  titik: { lat: number; lng: number; waktu: number; loanId?: Id<"loans"> },
): Promise<void> {
  const terakhir = await ctx.db
    .query("lokasiPeringatan")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  if (!bolehKirimPeringatanLokasi(terakhir?.waktu ?? null, titik.waktu)) return;

  const peringatanId = await ctx.db.insert("lokasiPeringatan", {
    userId,
    tanda,
    loanId: titik.loanId,
    lat: titik.lat,
    lng: titik.lng,
    jenis: terakhir === null ? "peringatan" : "peringatan_ulang",
    waktu: titik.waktu,
  });

  await audit(
    ctx,
    userId,
    "gerbang lokasi",
    "peringatan_lokasi",
    userId,
    `Titik lokasi dicurigai: ${tanda.join(", ")}`,
  );

  // WhatsApp dikirim lewat action (butuh jaringan); dijadwalkan supaya
  // heartbeat tidak ikut menunggu, dan aman bila gateway belum dikonfigurasi.
  await ctx.scheduler.runAfter(0, internal.whatsapp.kirimPeringatanLokasi, {
    peringatanId,
  });
}

/** Titik lokasi terakhir pengguna (null bila belum pernah ada). */
export async function titikTerakhir(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("lokasiStatus")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

/**
 * WAJIB DIPANGGIL sebelum setiap aksi finansial Peminjam. Menolak bila
 * kebijakan lokasi wajib aktif dan titik terakhir sudah kedaluwarsa.
 * Bila `titikPengajuan` diisi, koordinatnya juga dicocokkan dengan titik
 * terakhir di server — menutup celah "kirim koordinat karangan".
 */
export async function requireLokasiSegar(
  ctx: QueryCtx,
  userId: Id<"users">,
  titikPengajuan?: { lat: number; lng: number },
): Promise<void> {
  const cfg = await getConfig(ctx);
  if (!cfg.lokasiWajib) return;

  const status = await titikTerakhir(ctx, userId);
  const now = Date.now();
  const batasMenit = Math.max(1, cfg.lokasiMaxUmurMenit);
  const umurMenit =
    status === null ? null : Math.floor((now - status.waktu) / 60_000);

  if (status === null || now - status.waktu > batasMenit * 60_000) {
    throw new Error(pesanLokasiKedaluwarsa(umurMenit, batasMenit));
  }

  if (titikPengajuan !== undefined) {
    if (!koordinatIndonesia(titikPengajuan.lat, titikPengajuan.lng)) {
      throw new Error(
        `Koordinat pengajuan tidak valid (harus di wilayah Indonesia: ${INDONESIA_BOUNDS.latMin}…${INDONESIA_BOUNDS.latMax} lintang).`,
      );
    }
    const jarak = jarakKm(status, titikPengajuan);
    if (jarak > LOKASI_KEBIJAKAN.toleransiJarakKm) {
      throw new Error(
        `Titik lokasi pada pengajuan berbeda ±${Math.round(jarak)} km dari lokasi perangkat yang tercatat. Ambil lokasi sekali lagi lewat tombol "Ambil lokasi", lalu kirim ulang.`,
      );
    }
  }
}

/**
 * Cek keaktifan perangkat aplikasi milik pengguna.
 * Memakai `collect()` + `some()` supaya nasabah dengan lebih dari satu
 * perangkat tidak tertolak hanya karena `first()` mengambil perangkat lama.
 */
export async function perangkatAktifUntuk(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ platform: string } | null> {
  const daftar = await ctx.db
    .query("perangkat")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const now = Date.now();
  const aktif = daftar.find((p) => now - p.terakhirDilihat < MASA_PERANGKAT_DIPAKAI_MS);
  return aktif === undefined ? null : { platform: aktif.platform };
}

/**
 * Kebijakan "wajib aplikasi": bila admin menyalakannya, transaksi hanya
 * dilayani bila titik lokasi TERAKHIR datang dari aplikasi native.
 *
 * Kenapa memeriksa sumber titik terakhir, bukan sekadar "pernah terdaftar":
 * dashboard web juga mengirim heartbeat, dan setiap heartbeat menimpa sumber
 * titik terakhir. Jadi begitu nasabah bertransaksi dari browser, titik
 * terakhirnya menjadi "web" dan transaksinya ditolak — kebijakan ini tidak
 * bisa dipenuhi hanya dengan memasang aplikasi sekali lalu kembali ke web.
 *
 * Batas jujur: `sumber` dikirim klien, jadi ini bukan batas kriptografis —
 * klien yang menulis ulang permintaannya bisa mengaku sebagai aplikasi.
 * Penutup penuh baru tercapai dengan attestation aplikasi (Play Integrity /
 * App Attest) pada Fase 2 — lihat docs/aplikasi-native.md.
 */
export async function requireAplikasiNative(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<void> {
  const cfg = await getConfig(ctx);
  if (!cfg.wajibAplikasiNative) return;

  const perangkat = await perangkatAktifUntuk(ctx, userId);
  const status = await titikTerakhir(ctx, userId);
  const dariAplikasi = status !== null && status.sumber === "aplikasi";
  if (perangkat !== null && dariAplikasi) return;

  const alasan =
    perangkat === null
      ? "Perangkat ini belum terdaftar di aplikasi PINDAI."
      : "Titik lokasi terakhir dikirim dari browser, bukan dari aplikasi PINDAI.";
  throw new Error(
    `Transaksi kini hanya bisa dari aplikasi PINDAI. ${alasan} ` +
      "Buka PINDAI dari aplikasi Android/iOS dengan akun yang sama — lokasi akan berjalan di latar belakang dan transaksi tersedia kembali setelah titik lokasi pertama terkirim.",
  );
}

/** Gerbang lengkap untuk aksi finansial Peminjam: perangkat + lokasi segar. */
export async function requireGerbangLokasi(
  ctx: QueryCtx,
  userId: Id<"users">,
  user: { role?: string },
  titikPengajuan?: { lat: number; lng: number },
): Promise<void> {
  if (!PERAN_WAJIB_LOKASI.includes(user.role ?? "")) return;
  await requireAplikasiNative(ctx, userId);
  await requireLokasiSegar(ctx, userId, titikPengajuan);
}

/**
 * Heartbeat lokasi dari perangkat (dipanggil LocationGate ±tiap 60 detik).
 * Mengembalikan umur titik yang tersimpan agar UI bisa menampilkan status.
 */
export const catatLokasi = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    akurasi: v.number(),
    sumber: v.optional(v.string()),
    platform: v.optional(v.string()),
    versiApp: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    loanId: v.optional(v.id("loans")),
    /** Perangkat melaporkan titik dari mock location (lihat `simpanTitik`). */
    mock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await penggunaMasuk(ctx);
    return await simpanTitik(ctx, userId, {
      lat: args.lat,
      lng: args.lng,
      akurasi: args.akurasi,
      sumber: args.sumber ?? "web",
      platform: args.platform,
      versiApp: args.versiApp,
      deviceId: args.deviceId,
      loanId: args.loanId,
      mock: args.mock,
    });
  },
});

/**
 * Daftarkan perangkat aplikasi native (dipanggil saat app dibuka).
 * Mengembalikan `token` perangkat: kredensial yang dipakai layanan lokasi di
 * luar WebView untuk mengirim titik lewat `POST /lokasi/heartbeat`.
 */
export const daftarkanPerangkat = mutation({
  args: {
    deviceId: v.string(),
    platform: v.string(),
    versiApp: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await penggunaMasuk(ctx);
    const deviceId = args.deviceId.trim();
    if (deviceId.length < 6) {
      throw new Error("ID perangkat tidak valid.");
    }
    const platform = args.platform.trim().toLowerCase();
    if (!PLATFORM_APLIKASI.includes(platform)) {
      throw new Error('Platform perangkat tidak dikenal (harus "android" atau "ios").');
    }
    const now = Date.now();
    const lama = await ctx.db
      .query("perangkat")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    const baris = {
      userId,
      deviceId,
      platform,
      versiApp: args.versiApp,
      terakhirDilihat: now,
    };
    if (lama === null) {
      const token = acakHex(16);
      await ctx.db.insert("perangkat", { ...baris, token, terdaftarPada: now });
      return { ok: true, token };
    }
    // Perangkat yang sama mendaftar ulang (app dibuka kembali): pertahankan
    // token lama agar layanan lokasi yang sudah menyimpannya tidak kehilangan
    // kredensial setiap kali app dijalankan.
    const token = lama.token ?? acakHex(16);
    await ctx.db.patch(lama._id, { ...baris, token });
    return { ok: true, token };
  },
});

/**
 * Heartbeat lokasi TANPA sesi Convex Auth.
 *
 * Dipakai layanan lokasi yang berjalan di luar WebView (foreground service
 * Android / Background Modes iOS) lewat `POST /lokasi/heartbeat`: lapisan itu
 * tidak memegang sesi pengguna, dan permintaan jaringan dari WebView dibatasi
 * Android setelah ±5 menit aplikasi di latar belakang.
 *
 * Perangkat dikenali dari token, sehingga sumber titik ditetapkan SERVER
 * ("aplikasi") — bukan diklaim klien. Ini juga jangkar untuk attestation
 * aplikasi (Play Integrity / App Attest) pada langkah berikutnya.
 */
export const heartbeatNative = internalMutation({
  args: {
    token: v.string(),
    lat: v.number(),
    lng: v.number(),
    akurasi: v.number(),
    platform: v.optional(v.string()),
    versiApp: v.optional(v.string()),
    /** Perangkat melaporkan titik dari mock location. */
    mock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const perangkat = await ctx.db
      .query("perangkat")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (perangkat === null) {
      // Dikembalikan, bukan dilempar, agar rute HTTP bisa membalas 401 tanpa
      // menebak dari teks galat.
      return { ok: false as const, alasan: "token" as const };
    }
    const hasil = await simpanTitik(ctx, perangkat.userId, {
      lat: args.lat,
      lng: args.lng,
      akurasi: args.akurasi,
      sumber: "aplikasi",
      platform: args.platform ?? perangkat.platform,
      versiApp: args.versiApp ?? perangkat.versiApp,
      deviceId: perangkat.deviceId,
      mock: args.mock,
    });
    return { ok: true as const, waktu: hasil.waktu };
  },
});

/**
 * Status gerbang lokasi untuk UI: kebijakan aktif, umur titik terakhir, dan
 * apakah perangkat native sudah terdaftar.
 */
export const statusSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Pengguna tidak ditemukan.");
    if (user.isAnonymous === true) {
      throw new Error("Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengakses fitur ini.");
    }
    const cfg = await getConfig(ctx);
    const status = await titikTerakhir(ctx, userId);
    const perangkat = await perangkatAktifUntuk(ctx, userId);
    const now = Date.now();
    return {
      /** Gerbang menyala — diatur tim PINDAI (Pengaturan Sistem). */
      wajib: cfg.lokasiWajib,
      /** Transaksi hanya dari aplikasi native (setelah app dirilis). */
      wajibAplikasiNative: cfg.wajibAplikasiNative,
      /** Titik terakhir yang tercatat di server. */
      lat: status?.lat ?? null,
      lng: status?.lng ?? null,
      akurasi: status?.akurasi ?? null,
      waktu: status?.waktu ?? null,
      /**
       * "aplikasi" | "web" | null.
       * UI memakai nilai ini untuk memblokir lebih awal saat kebijakan
       * "wajib aplikasi" menyala — server akan menolak transaksinya.
       */
      sumber: status?.sumber ?? null,
      umurMenit:
        status === null ? null : Math.floor((now - status.waktu) / 60_000),
      segar:
        status !== null &&
        now - status.waktu <= Math.max(1, cfg.lokasiMaxUmurMenit) * 60_000,
      batasMenit: Math.max(1, cfg.lokasiMaxUmurMenit),
      intervalDetik: LOKASI_KEBIJAKAN.intervalDetik,
      maxAkurasiMeter: LOKASI_KEBIJAKAN.maxAkurasiMeter,
      /**
       * Tanda kecurigaan lokasi palsu pada titik terakhir (biasanya kosong).
       * UI menampilkannya sebagai peringatan agar nasabah bisa membersihkan
       * aplikasi lokasi palsu sebelum transaksinya ditahan.
       */
      tanda: status?.tanda ?? [],
      identikBerturut: status?.identikBerturut ?? 0,
      perangkatTerdaftar: perangkat !== null,
      platformPerangkat: perangkat?.platform ?? null,
    };
  },
});

/**
 * Peringatan lokasi aktif untuk nasabah — peringatan terbaru yang belum
 * diakui, atau null. Reaktif: banner dashboard hilang sendiri setelah nasabah
 * menekan "sudah saya matikan", tanpa perlu muat ulang halaman.
 */
export const peringatanSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || user.isAnonymous === true) return null;
    const terbaru = await ctx.db
      .query("lokasiPeringatan")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);
    const belumDibaca = terbaru.find((p) => p.dibacaPada === undefined);
    if (belumDibaca === undefined) return null;
    return {
      id: belumDibaca._id,
      tanda: belumDibaca.tanda,
      jenis: belumDibaca.jenis,
      /** Status pengiriman WhatsApp: null = masih diproses/dijadwalkan. */
      waStatus: belumDibaca.waStatus ?? null,
      waktu: belumDibaca.waktu,
    };
  },
});

/**
 * Plafon pinjaman nasabah ini — untuk slider & pesan di form pengajuan.
 * Server memakai fungsi yang sama (lib/plafon.plafonPeminjam), jadi UI dan
 * validasi tidak mungkin berbeda angka.
 */
export const plafonSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || user.isAnonymous === true) return null;
    return await plafonPeminjam(ctx, userId);
  },
});

/** Nasabah menandai peringatan lokasi sudah ditindaklanjuti (banner hilang). */
export const akuiPeringatan = mutation({
  args: { id: v.id("lokasiPeringatan") },
  handler: async (ctx, { id }) => {
    const { userId } = await penggunaMasuk(ctx);
    const row = await ctx.db.get(id);
    if (row === null || row.userId !== userId) {
      throw new Error("Peringatan lokasi tidak ditemukan.");
    }
    if (row.dibacaPada === undefined) {
      await ctx.db.patch(id, { dibacaPada: Date.now() });
    }
    return { ok: true };
  },
});

/** Status pengiriman WhatsApp untuk satu peringatan (dipanggil action WA). */
export const _setWaStatus = internalMutation({
  args: {
    peringatanId: v.id("lokasiPeringatan"),
    status: v.string(),
    keterangan: v.optional(v.string()),
  },
  handler: async (ctx, { peringatanId, status, keterangan }) => {
    const row = await ctx.db.get(peringatanId);
    if (row === null) return;
    await ctx.db.patch(peringatanId, { waStatus: status, waKeterangan: keterangan });
  },
});
