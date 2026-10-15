import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAdminSession } from "./adminAuthz";
import {
  BULAN_MS,
  pelunasanPinjaman,
  quotePinjaman,
  simulasiBulananPinjaman,
} from "../lib/loan";
import { formatRupiah } from "../lib/money";
import { namaHurufBesar } from "../lib/nama";
import {
  pesanPerubahanStatus,
  statusKanonik,
  TEMPLATE_STATUS_DEFAULT,
} from "../lib/statusPinjaman";
import { validasiGatewayUrl } from "../lib/waUrl";
import { uraiResponFonnte } from "../lib/otpWa";
import {
  JENIS_TEMPLATE_WA,
  LABEL_JENIS_WA,
  dalamJamKirim,
  jamWib,
  rangkaiPesanWa,
  rencanaPengingat,
  teksMetodeBayar,
  templateBerlaku,
  validasiTemplateWa,
  type JenisTemplateWa,
  type KandidatPengingat,
} from "../lib/templatePesanWa";
import { getConfig } from "./system";

/**
 * Integrasi WhatsApp untuk pengingat penagihan.
 *
 * Desain: gateway generik berbasis token. Admin menempel endpoint penyedia
 * mana pun (Fonnte, Wablas, Meta Cloud API, dll) beserta nama field body —
 * perubahan penyedia tidak perlu deploy ulang. Pengiriman berjalan di action
 * (fetch keluar), log ditulis append-only lewat internal mutation.
 */

const SLOT = "global";

export const DEFAULT_TEMPLATE =
  "Halo {nama}, pengingat PINDAI untuk pinjaman {ref}. " +
  "Jatuh tempo {tanggal} — total kewajiban Anda saat ini {jumlah}{denda}. " +
  "Mohon lakukan pelunasan tepat waktu agar status kredit tetap baik. Terima kasih.";

/**
 * Template peringatan lokasi dicurigai — dikirim OTOMATIS (bukan oleh admin),
 * maksimum sekali per 24 jam per nasabah.
 *
 * Nadanya sengaja menolong, bukan menuduh: koordinat beku juga bisa terjadi
 * pada perangkat dengan penghemat baterai agresif. Karena itu pesannya meminta
 * nasabah membuka aplikasi PINDAI, bukan mengancam sanksi.
 */
export const DEFAULT_TEMPLATE_LOKASI =
  "Halo {nama}, PINDAI mendeteksi lokasi perangkat Anda dikirim oleh aplikasi " +
  "pihak ketiga (lokasi palsu/dibekukan), sehingga transaksi PINDAI bisa ditolak. " +
  "Mohon hapus atau matikan aplikasi pengubah lokasi, lalu buka aplikasi PINDAI " +
  "agar lokasi asli terkirim. Bila Anda memang memakai lokasi khusus atas " +
  "persetujuan petugas PINDAI, abaikan pesan ini. Terima kasih.";

export type WaSettings = {
  apiUrl?: string;
  authHeader?: string;
  authPrefix?: string;
  fieldNomor?: string;
  fieldPesan?: string;
  aktif?: boolean;
  templatePengingat?: string;
  templateLokasi?: string;
  /** Template kabar perubahan status pinjaman. */
  templateStatus?: string;
  /**
   * Template per JENIS pesan (kunci = `JenisTemplateWa`). Inilah sumber yang
   * dipakai semua pengirim; kolom lama di atas hanya dibaca sebagai cadangan
   * supaya deployment yang sudah berjalan tidak kehilangan teksnya.
   */
  templatesWa?: Record<string, string>;
};

async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

async function getSettings(ctx: QueryCtx): Promise<WaSettings> {
  const row = await ctx.db
    .query("waSettings")
    .withIndex("by_slot", (q) => q.eq("slot", SLOT))
    .first();
  return row ?? {};
}

/**
 * Token gateway WhatsApp dari environment. `WHATSAPP_API_KEY` adalah nama yang
 * dipakai panel admin; `FONNTE_TOKEN` lama tetap dibaca sebagai cadangan supaya
 * deployment yang sudah berjalan (termasuk OTP) tidak mati saat jalur gateway
 * disatukan.
 */
export function apiKeyGatewayWa(): string {
  const utama = (process.env.WHATSAPP_API_KEY ?? "").trim();
  return utama !== "" ? utama : (process.env.FONNTE_TOKEN ?? "").trim();
}

/* ==========================================================================
 * Nilai template: satu sumber untuk pratinjau, kirim manual, dan kirim otomatis
 * ========================================================================== */

/** Awal hari UTC — batas "hari ini" saat memeriksa log pengiriman. */
function awalHariUtc(ms: number): number {
  return Math.floor(ms / 86_400_000) * 86_400_000;
}

/**
 * Kalimat kontak bawaan saat nomor bantuan nasabah belum diatur di sistem.
 * Sengaja bukan nomor karangan: template yang memanggil {kontak} menyuruh
 * nasabah membalas pesan, dan itu selalu benar.
 */
const KONTAK_BAWAAN = "balas pesan ini";

/**
 * Kalimat pengganti tautan untuk pesan yang dikirim lewat gateway tanpa alamat
 * publik. Tidak pernah memuat URL yang tidak ada.
 */
const TAUTAN_TANPA_ALAMAT = "halaman Cek Status di aplikasi PINDAI";

/** Bidang pinjaman yang dibutuhkan semua template pesan. */
type PinjamanPesan = {
  namaLengkap: string;
  nomorReferensi: string;
  pokokPinjaman: number;
  tenorHari?: number;
  tenorBulan?: number;
  didanaiPada?: number;
  status: string;
  persenBunga?: number;
};

/**
 * NILAI tiap placeholder untuk satu pinjaman.
 *
 * Nominal, denda, dan tanggal jatuh tempo datang dari `lib/loan` — sumber yang
 * sama dengan dashboard dan tabel admin. Tidak ada angka yang diketik ulang,
 * dan tidak ada placeholder yang diisi karangan: yang tidak punya nilai
 * dibiarkan kosong supaya `rangkaiPesanWa` menggantinya dengan kata jujur.
 */
function nilaiPesanPinjaman(
  loan: PinjamanPesan,
  opts: {
    metodeBayar: string;
    sekarang: number;
    /** Nominal yang ditampilkan bila berbeda dari total kewajiban (mis. cicilan). */
    jumlahTampil?: number | null;
  },
): Record<string, string | null> {
  const pelunasan = pelunasanPinjaman(
    {
      pokokPinjaman: loan.pokokPinjaman,
      status: loan.status,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan,
      didanaiPada: loan.didanaiPada,
      persenBunga: loan.persenBunga,
    },
    opts.sekarang,
  );
  const totalKewajibanPenuh =
    loan.tenorBulan !== undefined
      ? simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan }).totalPengembalian
      : quotePinjaman(loan).totalKewajibanPelunasan;
  const total = pelunasan ? pelunasan.totalKewajibanDenganPenalti : totalKewajibanPenuh;
  const denda = pelunasan ? pelunasan.dendaTerlambat : 0;
  const jatuhTempoPada =
    loan.didanaiPada !== undefined
      ? (pelunasan?.jatuhTempoPada ??
        loan.didanaiPada +
          (loan.tenorBulan !== undefined
            ? loan.tenorBulan * BULAN_MS
            : (loan.tenorHari ?? 30) * 86_400_000))
      : opts.sekarang;
  const tanggal = new Date(jatuhTempoPada).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    // Nama di pesan selalu HURUF BESAR (lib/nama.ts) — pesan, pratinjau, dan
    // tabel admin menampilkan orang yang sama dengan tulisan yang sama.
    nama: namaHurufBesar(loan.namaLengkap),
    ref: loan.nomorReferensi,
    jumlah: formatRupiah(opts.jumlahTampil ?? total),
    tanggal,
    jatuh_tempo: tanggal,
    sisa:
      loan.tenorBulan !== undefined ? `${loan.tenorBulan} bulan` : `${loan.tenorHari ?? 30} hari`,
    // {hari} hanya dipakai pengingat, dan tidak pernah negatif: pesan H-0
    // berbunyi "0 hari", bukan "-1 hari".
    hari: String(Math.max(0, pelunasan?.sisaHari ?? 0)),
    denda: denda > 0 ? ` (sudah termasuk denda ${formatRupiah(denda)})` : "",
    metode_bayar: opts.metodeBayar,
    kontak: KONTAK_BAWAAN,
    tautan: TAUTAN_TANPA_ALAMAT,
  };
}

/**
 * Teks template yang BERLAKU untuk satu jenis, berurutan:
 * peta `templatesWa` (diisi panel admin) → kolom lama → teks bawaan katalog.
 *
 * Template tersimpan yang tidak lolos validasinya tidak dipakai sama sekali:
 * pesan cacat tidak boleh sampai ke nasabah hanya karena admin salah ketik.
 */
function templateUntukJenis(
  settings: WaSettings,
  jenis: JenisTemplateWa,
  lawas: string | undefined,
): string {
  const tersimpan = (settings.templatesWa?.[jenis] ?? "").trim();
  if (tersimpan !== "") {
    const sah = validasiTemplateWa(jenis, tersimpan);
    if (sah.ok) return tersimpan;
  }
  const lama = (lawas ?? "").trim();
  if (lama !== "") return lama;
  return templateBerlaku(jenis, null).teks;
}

/** Template pesan manual dari daftar pinjaman (info tagihan & cek status). */
function templateInfoTagihan(settings: WaSettings): string {
  const tersimpan = (settings.templatesWa?.info_tagihan ?? "").trim();
  if (tersimpan !== "") {
    const sah = validasiTemplateWa("info_tagihan", tersimpan);
    if (sah.ok) return tersimpan;
  }
  return (settings.templatePengingat ?? "").trim() || DEFAULT_TEMPLATE;
}

/** Metode pembayaran dari pengaturan sistem untuk QUERY (pratinjau). */
async function metodeBayarQuery(ctx: QueryCtx): Promise<string> {
  return teksMetodeBayar(await getConfig(ctx));
}

/** Metode pembayaran dari pengaturan sistem untuk ACTION (pengirim). */
async function metodeBayarAction(ctx: ActionCtx): Promise<string> {
  return teksMetodeBayar(
    await ctx.runQuery(internal.system._penerimaanInternal, {}),
  );
}

/**
 * Pesan OTP dari template yang diatur admin, atau `null` bila belum diatur
 * (pemanggil memakai pesan bawaan `lib/otpWa` yang menyebut keperluannya).
 * Isi kode tidak pernah masuk log: yang dicatat pengirim hanya status kirim.
 */
export function pesanOtpDariTemplate(
  settings: WaSettings,
  kode: string,
  menit: number,
): string | null {
  const tersimpan = (settings.templatesWa?.otp ?? "").trim();
  if (tersimpan === "" || !validasiTemplateWa("otp", tersimpan).ok) return null;
  return rangkaiPesanWa(tersimpan, { kode_otp: kode, menit: String(menit) }).isi;
}

/** Konfigurasi + log + statistik untuk tab WhatsApp di panel admin. */
export const getAdminConfig = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const config = await getSettings(ctx);
    const logs = await ctx.db.query("waLogs").order("desc").take(50);
    const total = await ctx.db.query("waLogs").collect();
    return {
      config,
      logs,
      statistik: {
        total: total.length,
        terkirim: total.filter((l) => l.status === "terkirim").length,
        gagal: total.filter((l) => l.status === "gagal").length,
      },
    };
  },
});

/** Simpan konfigurasi gateway WhatsApp (admin). */
export const saveConfig = mutation({
  args: {
    apiUrl: v.string(),
    authHeader: v.string(),
    authPrefix: v.optional(v.string()),
    fieldNomor: v.string(),
    fieldPesan: v.string(),
    aktif: v.boolean(),
    /**
     * Template pesan per jenis: kunci `JenisTemplateWa` → teks. Kunci kosong
     * tidak dikirim (berarti "pakai teks bawaan"), dan setiap kunci yang dikenal
     * diperiksa placeholderWAJIB + izinnya sebelum disimpan.
     */
    templatesWa: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const apiUrl = args.apiUrl.trim();
    // Anti-SSRF: endpoint harus HTTPS, hostname domain publik, tanpa IP
    // literal/internal, port 443, dan tanpa kredensial di URL.
    const cekApiUrl = validasiGatewayUrl(apiUrl);
    if (!cekApiUrl.ok) {
      throw new Error(`Endpoint gateway tidak valid: ${cekApiUrl.alasan}`);
    }
    const authHeader = args.authHeader.trim();
    const fieldNomor = args.fieldNomor.trim();
    const fieldPesan = args.fieldPesan.trim();
    if (!authHeader || !fieldNomor || !fieldPesan) {
      throw new Error("Nama header auth dan field body wajib diisi.");
    }
    // Validasi SERVER atas setiap template: editor sudah menahannya, tetapi
    // serverlah yang memutuskan apa yang boleh tersimpan — permintaan yang
    // dibuat di luar panel tidak boleh menulis template cacat.
    const templatesWa: Record<string, string> = {};
    for (const [jenis, teks] of Object.entries(args.templatesWa)) {
      if (!(JENIS_TEMPLATE_WA as readonly string[]).includes(jenis)) {
        throw new Error(`Jenis template "${jenis}" tidak dikenal.`);
      }
      const isi = teks.trim();
      if (isi === "") continue; // kosong = pakai teks bawaan
      const sah = validasiTemplateWa(jenis as JenisTemplateWa, isi);
      if (!sah.ok) {
        throw new Error(`${LABEL_JENIS_WA[jenis as JenisTemplateWa]} tidak bisa disimpan: ${sah.alasan}`);
      }
      templatesWa[jenis] = isi;
    }
    const existing = await ctx.db
      .query("waSettings")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    const patch = {
      apiUrl,
      authHeader,
      authPrefix: args.authPrefix ?? "",
      fieldNomor,
      fieldPesan,
      aktif: args.aktif,
      templatesWa,
      // Kolom template lama dikosongkan: isinya sudah pindah ke `templatesWa`,
      // dan dua sumber untuk hal yang sama cepat atau lambat akan berbeda.
      templatePengingat: undefined,
      templateLokasi: undefined,
      templateStatus: undefined,
      diperbaruiPada: Date.now(),
    };
    if (existing === null) {
      await ctx.db.insert("waSettings", { slot: SLOT, ...patch });
    } else {
      await ctx.db.patch(existing._id, patch);
    }
    void userId;
    return { ok: true };
  },
});

/** Log append-only — dipanggil dari action. */
export const _appendLog = internalMutation({
  args: {
    loanId: v.optional(v.id("loans")),
    nomorTujuan: v.string(),
    jenis: v.string(),
    isiPesan: v.string(),
    status: v.string(),
    respon: v.optional(v.string()),
    olehUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("waLogs", { ...args, waktu: Date.now() });
  },
});

/** Settings tanpa gerbang — hanya bisa dipanggil internal (action ini). */
export const _getSettings = internalQuery({
  args: {},
  handler: async (ctx) => getSettings(ctx),
});

/** Data pinjaman untuk merangkai pesan (internal). */
export const _loanForMessage = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    return {
      namaLengkap: loan.namaLengkap,
      nomorReferensi: loan.nomorReferensi,
      nomorWhatsApp: loan.nomorWhatsApp,
      pokokPinjaman: loan.pokokPinjaman,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan,
      didanaiPada: loan.didanaiPada,
      persenBunga: loan.persenBunga,
      status: loan.status,
    };
  },
});

/**
 * Data pinjaman untuk merangkai pesan perubahan status (internal).
 *
 * Nominal kewajiban dihitung dari `pokokPinjaman` yang BERLAKU (nominal yang
 * disetujui admin), bukan angka pengajuan — pesan harus mencerminkan keputusan,
 * bukan permintaan awal.
 */
export const _dataStatusPinjaman = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const pokokDiajukan = loan.pokokDiajukan ?? loan.pokokPinjaman;
    const totalKewajiban =
      loan.tenorBulan !== undefined
        ? simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan }).totalPengembalian
        : quotePinjaman(loan).totalKewajibanPelunasan;
    return {
      namaLengkap: loan.namaLengkap,
      nomorReferensi: loan.nomorReferensi,
      nomorWhatsApp: loan.nomorWhatsApp ?? null,
      status: loan.status,
      pokokDiajukan,
      pokokPinjaman: loan.pokokPinjaman,
      totalKewajiban,
      // Dipakai template pelunasan/pencairan: tanggal jatuh tempo, tenor, dan
      // snapshot bunga nasabah pada pinjaman ini.
      tenorHari: loan.tenorHari ?? undefined,
      tenorBulan: loan.tenorBulan ?? undefined,
      didanaiPada: loan.didanaiPada ?? undefined,
      persenBunga: loan.persenBunga ?? undefined,
    };
  },
});

/**
 * Rangkai isi pesan dari template + data pinjaman.
 *
 * Penggantian placeholder memakai `rangkaiPesanWa` (lib/templatePesanWa) — satu
 * renderer saja untuk seluruh berkas ini: placeholder yang tidak punya nilai
 * menjadi kata jujur, bukan `{jumlah}` yang sampai ke tangan nasabah.
 */
function pesanDariLoan(
  template: string,
  loan: PinjamanPesan,
  sekarang: number,
  metodeBayar: string,
): { isi: string } {
  return {
    isi: rangkaiPesanWa(template, nilaiPesanPinjaman(loan, { metodeBayar, sekarang })).isi,
  };
}

/** Preview isi pesan untuk satu pinjaman (tanpa mengirim) — admin. */
export const previewMessage = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const s = await getSettings(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    const { isi } = pesanDariLoan(
      templateInfoTagihan(s),
      {
        namaLengkap: loan.namaLengkap,
        nomorReferensi: loan.nomorReferensi,
        pokokPinjaman: loan.pokokPinjaman,
        tenorHari: loan.tenorHari ?? undefined,
        tenorBulan: loan.tenorBulan ?? undefined,
        didanaiPada: loan.didanaiPada ?? undefined,
        persenBunga: loan.persenBunga ?? undefined,
        status: loan.status,
      },
      Date.now(),
      await metodeBayarQuery(ctx),
    );
    return isi;
  },
});

/** Batas tunggu gateway; di atas ini pengiriman dianggap timeout. */
const GATEWAY_TIMEOUT_MS = 10_000;

/**
 * Endpoint Fonnte resmi (`api.fonnte.com`) diperlakukan khusus karena formatnya
 * berbeda dari gateway JSON generik: datanya form-urlencoded (`target`/`message`)
 * dan balasan HTTP 200 bisa berarti GAGAL (`{"status": false}`). Tanpa cabang ini,
 * OTP yang memakai gateway panel akan lolos begitu saja pada HTTP 200 walaupun
 * Fonnte menolak mengirim.
 */
function endpointFonnte(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "api.fonnte.com";
  } catch {
    return false;
  }
}

/**
 * Balasan JSON gateway generik: bila 2xx-nya memuat penanda gagal eksplisit
 * (`status: false` / `success: false`), kiriman TIDAK dianggap berhasil. Nama
 * field berbeda antar penyedia, jadi penandanya dicari, bukan diandaikan.
 */
function penolakanEksplisit(teks: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(teks);
  } catch {
    return null;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;
  if (rec.status !== false && rec.success !== false) return null;
  const alasan =
    typeof rec.reason === "string"
      ? rec.reason
      : typeof rec.message === "string"
        ? rec.message
        : typeof rec.detail === "string"
          ? rec.detail
          : "tanpa alasan";
  return `Gateway menolak: ${alasan.slice(0, 160)}`;
}

/**
 * Kirim satu pesan lewat gateway token-based yang DIATUR ADMIN. Tidak melempar —
 * hasil dinilai pemanggil.
 *
 * Dipakai SELURUH jalur pengiriman (pengingat, kabar status, peringatan lokasi,
 * dan OTP) supaya satu konfigurasi gateway + satu token environment melayani
 * semua pesan. Perubahan penyedia tetap tidak perlu deploy ulang: endpoint dan
 * nama field diatur admin, sedangkan endpoint Fonnte ditangani sesuai formatnya.
 */
export async function kirimViaGateway(
  apiKey: string,
  settings: WaSettings,
  nomor: string,
  isi: string,
): Promise<{ ok: boolean; respon: string }> {
  // Fail-closed: validasi ULANG saat kirim — konfigurasi lama yang tersimpan
  // sebelum aturan ini ada tetap tidak boleh di-fetch bila tidak lolos.
  const cekUrl = validasiGatewayUrl(settings.apiUrl ?? "");
  if (!cekUrl.ok) {
    return { ok: false, respon: `Endpoint gateway ditolak: ${cekUrl.alasan}` };
  }
  const url = settings.apiUrl ?? "";
  const header = settings.authHeader ?? "Authorization";
  const prefix = settings.authPrefix ?? "";
  const fonnte = endpointFonnte(url);
  const body = fonnte
    ? new URLSearchParams({
        [settings.fieldNomor?.trim() || "target"]: nomor,
        [settings.fieldPesan?.trim() || "message"]: isi,
        countryCode: "62",
      }).toString()
    : JSON.stringify({
        [settings.fieldNomor ?? "target"]: nomor,
        [settings.fieldPesan ?? "message"]: isi,
      });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      // Tanpa mengikuti redirect: URL publik yang mengalihkan ke alamat
      // internal tidak boleh ikut dikejar (redirect-based SSRF).
      redirect: "error",
      signal: controller.signal,
      headers: {
        "Content-Type": fonnte
          ? "application/x-www-form-urlencoded"
          : "application/json",
        [header]: `${prefix}${apiKey}`,
      },
      body,
    });
    const text = (await res.text()).slice(0, 500);
    if (fonnte) {
      const hasil = uraiResponFonnte(res.status, text);
      return { ok: hasil.terkirim, respon: hasil.pesan };
    }
    if (!res.ok) {
      return { ok: false, respon: `HTTP ${res.status}: ${text}` };
    }
    const ditolak = penolakanEksplisit(text);
    if (ditolak !== null) return { ok: false, respon: ditolak };
    return { ok: true, respon: `HTTP ${res.status}: ${text}` };
  } catch (err) {
    const nama = err instanceof Error ? err.name : "";
    if (nama === "AbortError" || nama === "TimeoutError") {
      return {
        ok: false,
        respon: `Pengiriman ke gateway timeout (${Math.round(GATEWAY_TIMEOUT_MS / 1000)} detik). Coba lagi.`,
      };
    }
    return {
      ok: false,
      respon: err instanceof Error ? err.message : "Koneksi gagal",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kirim pengingat penagihan untuk satu pinjaman (admin).
 * Pesan dirangkai dari template CMS + data pinjaman live; nomor tujuan
 * diambil dari KYC peminjam (nomorWhatsApp). API key dibaca dari env.
 */
export const sendReminder = action({
  args: {
    loanId: v.id("loans"),
    /** Override isi pesan — bila kosong, dirangkai dari template. */
    isiPesan: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, isiPesan }): Promise<{ ok: boolean; isi: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    await ctx.runQuery(api.security.assertAdminSession, {});

    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const loan = await ctx.runQuery(internal.whatsapp._loanForMessage, { loanId });
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (!loan.nomorWhatsApp) {
      throw new Error("Peminjam belum punya nomor WhatsApp (lengkapi KYC).");
    }

    const isi =
      isiPesan?.trim() ||
      pesanDariLoan(
        templateInfoTagihan(settings),
        {
          namaLengkap: loan.namaLengkap,
          nomorReferensi: loan.nomorReferensi,
          pokokPinjaman: loan.pokokPinjaman,
          tenorHari: loan.tenorHari ?? undefined,
          tenorBulan: loan.tenorBulan ?? undefined,
          didanaiPada: loan.didanaiPada ?? undefined,
          persenBunga: loan.persenBunga ?? undefined,
          status: loan.status,
        },
        Date.now(),
        await metodeBayarAction(ctx),
      ).isi;

    const apiKey = apiKeyGatewayWa();
    let status = "gagal";
    let respon = "";
    if (settings.aktif !== true || !settings.apiUrl) {
      respon = "Integrasi WhatsApp belum aktif — pesan hanya dicatat.";
    } else if (!apiKey) {
      respon = "WHATSAPP_API_KEY belum diisi di environment.";
    } else {
      const hasil = await kirimViaGateway(apiKey, settings, loan.nomorWhatsApp, isi);
      status = hasil.ok ? "terkirim" : "gagal";
      respon = hasil.respon;
    }

    await ctx.runMutation(internal.whatsapp._appendLog, {
      loanId,
      nomorTujuan: loan.nomorWhatsApp,
      jenis: "info_tagihan",
      isiPesan: isi,
      status,
      respon,
      olehUserId: userId,
    });
    if (status !== "terkirim") {
      throw new Error(respon);
    }
    return { ok: true, isi };
  },
});

/**
 * Rangkai isi pesan perubahan status dari data pinjaman + template.
 * Satu sumber untuk kirim otomatis maupun kirim ulang manual.
 */
function pesanStatusDari(
  settings: WaSettings,
  data: {
    namaLengkap: string;
    nomorReferensi: string;
    /** Ejaan status tersimpan apa pun — diterjemahkan ke label 4 status. */
    status: string;
    pokokDiajukan: number;
    pokokPinjaman: number;
    totalKewajiban: number;
  },
  alasan: string,
  statusLama: string,
): string {
  return pesanPerubahanStatus(
    // Template `status` dari panel dipakai bila ada; selain itu teks lama
    // `TEMPLATE_STATUS_DEFAULT` tetap berlaku persis seperti sebelumnya.
    templateUntukJenis(settings, "status", settings.templateStatus || TEMPLATE_STATUS_DEFAULT),
    {
      nama: data.namaLengkap,
      nomorReferensi: data.nomorReferensi,
      statusLama,
      statusBaru: data.status,
      alasan,
      pokokDiajukan: data.pokokDiajukan,
      pokokDisetujui: data.pokokPinjaman,
      totalKewajiban: statusKanonik(data.status) === "ditolak" ? null : data.totalKewajiban,
    },
  );
}

/**
 * Pilih template + rangkai isi kabar status pinjaman.
 *
 * Perpindahan yang punya template SENDIRI memakai template itu: Lunas memakai
 * `pelunasan`, dana tersalurkan memakai `pencairan`. Selain itu kabar status
 * umum (`status`) yang menyebut status baru, catatan, dan nominalnya. Ini juga
 * yang membuat satu perpindahan hanya menghasilkan SATU pesan, bukan dua.
 */
function pesanKabarStatus(
  settings: WaSettings,
  data: PinjamanPesan & {
    pokokDiajukan: number;
    totalKewajiban: number;
  },
  catatan: string,
  statusLama: string,
  metodeBayar: string,
  sekarang: number,
): { isi: string; jenis: JenisTemplateWa } {
  const kanonikBaru = statusKanonik(data.status);
  const kanonikLama = statusKanonik(statusLama);
  const jenisKhusus: JenisTemplateWa | null =
    kanonikBaru === "lunas" && kanonikLama !== "lunas"
      ? "pelunasan"
      : kanonikBaru === "didanai" && kanonikLama !== "didanai"
        ? "pencairan"
        : null;
  if (jenisKhusus !== null) {
    return {
      jenis: jenisKhusus,
      isi: rangkaiPesanWa(
        templateUntukJenis(settings, jenisKhusus, undefined),
        nilaiPesanPinjaman(data, { metodeBayar, sekarang }),
      ).isi,
    };
  }
  return {
    jenis: "status",
    isi: pesanStatusDari(settings, data, catatan, statusLama),
  };
}

/**
 * Pratinjau isi pesan perubahan status (admin) — supaya admin melihat persis
 * apa yang akan dikirim sebelum menekan tombol, termasuk kalimat persetujuan
 * sebagian. Tidak mengirim apa pun.
 */
export const previewStatusPinjaman = query({
  args: { loanId: v.id("loans"), alasan: v.string() },
  handler: async (ctx, { loanId, alasan }) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const loan = await ctx.db.get(loanId);
    const admin = await getAuthUserId(ctx);
    void admin;
    if (loan === null) return null;
    const pokokDiajukan = loan.pokokDiajukan ?? loan.pokokPinjaman;
    const totalKewajiban =
      loan.tenorBulan !== undefined
        ? simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan }).totalPengembalian
        : quotePinjaman(loan).totalKewajibanPelunasan;
    return {
      nomorWhatsApp: loan.nomorWhatsApp ?? null,
      isi: pesanKabarStatus(
        settings,
        {
          namaLengkap: loan.namaLengkap,
          nomorReferensi: loan.nomorReferensi,
          status: loan.status,
          pokokDiajukan,
          pokokPinjaman: loan.pokokPinjaman,
          tenorHari: loan.tenorHari ?? undefined,
          tenorBulan: loan.tenorBulan ?? undefined,
          didanaiPada: loan.didanaiPada ?? undefined,
          persenBunga: loan.persenBunga ?? undefined,
          totalKewajiban,
        },
        alasan.trim() === "" ? "—" : alasan.trim(),
        loan.status,
        await metodeBayarQuery(ctx),
        Date.now(),
      ).isi,
    };
  },
});

/**
 * Kirim kabar perubahan status ke Peminjam lewat WhatsApp (admin).
 *
 * Dipakai tombol "kirim ulang" di dialog review: percobaan otomatis bisa gagal
 * karena integrasi belum aktif atau gateway sedang bermasalah, dan admin perlu
 * cara mengulangnya tanpa mengubah status lagi.
 */
export const kirimStatusPinjaman = action({
  args: {
    loanId: v.id("loans"),
    alasan: v.string(),
    statusLama: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, alasan, statusLama }): Promise<{ ok: boolean; isi: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    await ctx.runQuery(api.security.assertAdminSession, {});

    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const data = await ctx.runQuery(internal.whatsapp._dataStatusPinjaman, { loanId });
    if (data === null) throw new Error("Pinjaman tidak ditemukan.");
    if (!data.nomorWhatsApp) {
      throw new Error("Peminjam belum punya nomor WhatsApp (lengkapi KYC).");
    }

    const kabar = pesanKabarStatus(
      settings,
      data,
      alasan.trim() === "" ? "—" : alasan.trim(),
      statusLama ?? "ditinjau",
      await metodeBayarAction(ctx),
      Date.now(),
    );

    const hasil = await kirimPesanStatus(
      ctx,
      settings,
      data.nomorWhatsApp,
      kabar.isi,
      loanId,
      userId,
      kabar.jenis,
    );
    if (!hasil.ok) throw new Error(hasil.respon);
    return { ok: true, isi: kabar.isi };
  },
});

/**
 * Kirim kabar perubahan status TANPA gerbang sesi — dipanggil otomatis oleh
 * `ubahStatusPinjaman` setelah status tersimpan.
 *
 * TIDAK PERNAH melempar: perubahan status yang sudah tercatat tidak boleh
 * dibatalkan hanya karena gateway WhatsApp bermasalah. Setiap percobaan tetap
 * masuk `waLogs` supaya admin bisa melihat kenapa pesan tidak sampai, lalu
 * mengirim ulang lewat tombol manual.
 */
export const _kirimStatusPinjaman = internalAction({
  args: {
    loanId: v.id("loans"),
    alasan: v.string(),
    statusLama: v.string(),
  },
  handler: async (ctx, { loanId, alasan, statusLama }): Promise<{ status: string }> => {
    const data = await ctx.runQuery(internal.whatsapp._dataStatusPinjaman, { loanId });
    if (data === null) return { status: "tidak_ada" };
    if (!data.nomorWhatsApp) {
      await ctx.runMutation(internal.whatsapp._appendLog, {
        loanId,
        nomorTujuan: "-",
        jenis: "status_pinjaman",
        isiPesan: "(tidak dikirim)",
        status: "tanpa_nomor",
        respon: "Peminjam belum punya nomor WhatsApp di data KYC.",
      });
      return { status: "tanpa_nomor" };
    }

    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    // Catatan opsional: tanpa catatan, template tidak boleh menyisakan kalimat
    // kosong ("Catatan dari tim: .") — sama dengan pratinjau dan kirim ulang.
    const catatan = alasan.trim() === "" ? "—" : alasan.trim();
    const kabar = pesanKabarStatus(
      settings,
      data,
      catatan,
      statusLama ?? "ditinjau",
      await metodeBayarAction(ctx),
      Date.now(),
    );
    const hasil = await kirimPesanStatus(
      ctx,
      settings,
      data.nomorWhatsApp,
      kabar.isi,
      loanId,
      undefined,
      kabar.jenis,
    );
    return { status: hasil.status };
  },
});

/**
 * Kirim + catat satu pesan status. Tidak melempar: hasilnya dinilai pemanggil.
 * Mengembalikan `status` agar action otomatis bisa melaporkannya apa adanya.
 */
async function kirimPesanStatus(
  ctx: ActionCtx,
  settings: WaSettings,
  nomor: string,
  isi: string,
  loanId: Id<"loans">,
  olehUserId: Id<"users"> | undefined,
  /** Jenis ramah yang dicatat di log pengiriman (kunci katalog). */
  jenis: string,
): Promise<{ ok: boolean; status: string; respon: string }> {
  const apiKey = apiKeyGatewayWa();
  let status: string;
  let respon: string;
  if (settings.aktif !== true || !settings.apiUrl) {
    status = "dinonaktifkan";
    respon = "Integrasi WhatsApp belum aktif — pesan hanya dicatat.";
  } else if (!apiKey) {
    status = "gagal";
    respon = "WHATSAPP_API_KEY belum diisi di environment.";
  } else {
    const hasil = await kirimViaGateway(apiKey, settings, nomor, isi);
    status = hasil.ok ? "terkirim" : "gagal";
    respon = hasil.respon;
  }

  await ctx.runMutation(internal.whatsapp._appendLog, {
    loanId,
    nomorTujuan: nomor,
    jenis,
    isiPesan: isi,
    status,
    respon,
    olehUserId,
  });

  return { ok: status === "terkirim", status, respon };
}

/** Kirim pesan uji ke nomor bebas (admin) — memastikan gateway benar. */
export const sendTest = action({
  args: { nomorTujuan: v.string(), isiPesan: v.string() },
  handler: async (ctx, { nomorTujuan, isiPesan }): Promise<{ ok: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    await ctx.runQuery(api.security.assertAdminSession, {});
    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const apiKey = apiKeyGatewayWa();
    let status = "gagal";
    let respon = "";
    if (settings.aktif !== true || !settings.apiUrl) {
      respon = "Integrasi WhatsApp belum aktif.";
    } else if (!apiKey) {
      respon = "WHATSAPP_API_KEY belum diisi di environment.";
    } else {
      const hasil = await kirimViaGateway(apiKey, settings, nomorTujuan.trim(), isiPesan);
      status = hasil.ok ? "terkirim" : "gagal";
      respon = hasil.respon;
    }
    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: nomorTujuan.trim(),
      jenis: "tes",
      isiPesan,
      status,
      respon,
      olehUserId: userId,
    });
    if (status !== "terkirim") {
      throw new Error(respon);
    }
    return { ok: true };
  },
});

// ===== Peringatan lokasi dicurigai (otomatis dari gerbang lokasi) =====

/**
 * Data untuk merangkai pesan peringatan lokasi (internal — dipanggil action).
 *
 * Nomor WhatsApp diambil dari KYC: pinjaman yang memicu peringatan lebih
 * dulu, lalu pinjaman terbaru nasabah yang punya nomor — peringatan lokasi
 * bisa terjadi bahkan saat nasabah belum/tidak punya pinjaman aktif.
 */
export const _dataPeringatanLokasi = internalQuery({
  args: { peringatanId: v.id("lokasiPeringatan") },
  handler: async (ctx, { peringatanId }) => {
    const peringatan = await ctx.db.get(peringatanId);
    if (peringatan === null) return null;
    const user = await ctx.db.get(peringatan.userId);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", peringatan.userId))
      .order("desc")
      .collect();
    const sumber =
      loans.find((l) => l._id === peringatan.loanId && l.nomorWhatsApp) ??
      loans.find((l) => l.nomorWhatsApp) ??
      null;
    return {
      nama: namaHurufBesar(sumber?.namaLengkap ?? user?.name ?? "Nasabah PINDAI"),
      nomorWhatsApp: sumber?.nomorWhatsApp ?? null,
      nomorReferensi: sumber?.nomorReferensi ?? null,
      tanda: peringatan.tanda,
      waktu: peringatan.waktu,
    };
  },
});

/**
 * Kirim peringatan "lokasi dicurigai" ke nasabah — dijadwalkan oleh
 * `simpanTitik`, jadi bukan aksi admin dan tanpa gerbang sesi.
 *
 * TIDAK PERNAH melempar: heartbeat nasabah tidak boleh gagal hanya karena
 * gateway WhatsApp bermasalah. Setiap percobaan tetap tercatat (waLogs + kolom
 * `waStatus` pada peringatannya) supaya tim bisa melihat kenapa pesan tidak
 * sampai — termasuk kasus paling umum: integrasi WA belum diaktifkan.
 */
export const kirimPeringatanLokasi = internalAction({
  args: { peringatanId: v.id("lokasiPeringatan") },
  handler: async (ctx, { peringatanId }): Promise<{ status: string }> => {
    const data = await ctx.runQuery(internal.whatsapp._dataPeringatanLokasi, {
      peringatanId,
    });
    if (data === null) return { status: "tidak_ada" };

    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const isi = rangkaiPesanWa(templateUntukJenis(settings, "lokasi", settings.templateLokasi), {
      nama: data.nama,
      ref: data.nomorReferensi,
      kontak: KONTAK_BAWAAN,
    }).isi;

    const apiKey = apiKeyGatewayWa();
    let status: string;
    let respon: string;
    if (data.nomorWhatsApp === null) {
      status = "tanpa_nomor";
      respon = "Nasabah belum punya nomor WhatsApp di data KYC.";
    } else if (settings.aktif !== true || !settings.apiUrl) {
      status = "dinonaktifkan";
      respon = "Integrasi WhatsApp belum aktif — pesan hanya dicatat.";
    } else if (!apiKey) {
      status = "gagal";
      respon = "WHATSAPP_API_KEY belum diisi di environment.";
    } else {
      const hasil = await kirimViaGateway(apiKey, settings, data.nomorWhatsApp, isi);
      status = hasil.ok ? "terkirim" : "gagal";
      respon = hasil.respon;
    }

    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: data.nomorWhatsApp ?? "-",
      // Kunci log lama tetap dipakai supaya riwayat yang sudah ada tidak
      // terbelah dua; label ramahnya menunjuk jenis katalog yang sama.
      jenis: "lokasi_dicurigai",
      isiPesan: isi,
      status,
      respon,
    });
    await ctx.runMutation(internal.lokasi._setWaStatus, {
      peringatanId,
      status,
      keterangan: respon,
    });
    return { status };
  },
});

/* ==========================================================================
 * Pengingat otomatis: H-3, H-1, hari H, dan keterlambatan
 * ========================================================================== */

/** Batas pinjaman per satu kali jalan penjadwal — supaya action tidak menahan. */
const BATAS_PENGINGAT_SEKALI_JALAN = 200;

/**
 * Pinjaman yang MASIH BERJALAN beserta bidang yang dibutuhkan template.
 *
 * Hanya status `didanai` yang dibaca: begitu pembayaran tercatat dan status
 * berpindah (lunas/ditolak/ditinjau), pinjaman itu hilang dari daftar ini, dan
 * pengingatnya berhenti dengan sendirinya tanpa perlu dimatikan siapa pun.
 */
export const _pinjamanPengingat = internalQuery({
  args: {},
  handler: async (ctx) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "didanai"))
      .take(BATAS_PENGINGAT_SEKALI_JALAN);
    return loans.map((loan) => ({
      loanId: loan._id,
      namaLengkap: loan.namaLengkap,
      nomorReferensi: loan.nomorReferensi,
      nomorWhatsApp: loan.nomorWhatsApp ?? null,
      pokokPinjaman: loan.pokokPinjaman,
      tenorHari: loan.tenorHari ?? undefined,
      tenorBulan: loan.tenorBulan ?? undefined,
      didanaiPada: loan.didanaiPada ?? undefined,
      persenBunga: loan.persenBunga ?? undefined,
      status: loan.status,
    }));
  },
});

/**
 * Jenis pesan yang SUDAH tercatat terkirim hari ini untuk satu pinjaman.
 *
 * Dibaca dari log pengiriman, bukan dari ingatan proses: penjadwal boleh
 * berjalan berkali-kali dalam satu hari tanpa mengirim pesan yang sama dua kali.
 */
export const _logPengingatHariIni = internalQuery({
  args: { loanId: v.id("loans"), sejak: v.number() },
  handler: async (ctx, { loanId, sejak }) => {
    const rows = await ctx.db
      .query("waLogs")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .collect();
    return rows.filter((row) => row.waktu >= sejak).map((row) => row.jenis);
  },
});

/**
 * Kirim pengingat jatuh tempo & keterlambatan yang memang berhak berangkat
 * SEKARANG. Dipanggil cron tiap jam; keputusan kirimnya murni di
 * `lib/templatePesanWa.rencanaPengingat`.
 *
 * TIDAK PERNAH melempar, dan tidak melakukan apa pun saat gateway belum aktif
 * atau di luar jam kirim: cron tiap jam yang berisik di log bukan kegunaan.
 * Nomor tujuan HANYA nomor peminjam dari data KYC — tidak ada penerima lain.
 */
export const jalankanPengingatJatuhTempo = internalAction({
  args: {},
  handler: async (ctx) => {
    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    if (settings.aktif !== true || !settings.apiUrl) {
      return { terkirim: 0, gagal: 0, tanpaNomor: 0, jumlahRencana: 0, alasan: "nonaktif" };
    }
    const now = Date.now();
    if (!dalamJamKirim(jamWib(now))) {
      return { terkirim: 0, gagal: 0, tanpaNomor: 0, jumlahRencana: 0, alasan: "luar_jam_kirim" };
    }
    const apiKey = apiKeyGatewayWa();
    if (apiKey === "") {
      return { terkirim: 0, gagal: 0, tanpaNomor: 0, jumlahRencana: 0, alasan: "tanpa_token" };
    }

    const sejak = awalHariUtc(now);
    const pinjaman = await ctx.runQuery(internal.whatsapp._pinjamanPengingat, {});
    const peta = new Map<string, (typeof pinjaman)[number]>();
    const kandidat: KandidatPengingat[] = [];
    for (const p of pinjaman) {
      const info = pelunasanPinjaman(p, now);
      if (info === null) continue;
      peta.set(p.loanId, p);
      kandidat.push({
        loanId: p.loanId,
        status: p.status,
        sisaHari: info.sisaHari,
        hariTerlambat: info.hariTerlambat,
        jenisHariIni: await ctx.runQuery(internal.whatsapp._logPengingatHariIni, {
          loanId: p.loanId,
          sejak,
        }),
      });
    }
    const rencana = rencanaPengingat(now, kandidat);
    const metodeBayar = await metodeBayarAction(ctx);

    let terkirim = 0;
    let gagal = 0;
    let tanpaNomor = 0;
    for (const r of rencana) {
      const p = peta.get(r.loanId);
      if (p === undefined) continue;
      const isi = rangkaiPesanWa(
        templateUntukJenis(settings, r.jenis, undefined),
        nilaiPesanPinjaman(p, { metodeBayar, sekarang: now }),
      ).isi;
      if (p.nomorWhatsApp === null) {
        await ctx.runMutation(internal.whatsapp._appendLog, {
          loanId: p.loanId,
          nomorTujuan: "-",
          jenis: r.jenis,
          isiPesan: "(tidak dikirim)",
          status: "tanpa_nomor",
          respon: "Peminjam belum punya nomor WhatsApp di data KYC.",
        });
        tanpaNomor += 1;
        continue;
      }
      const hasil = await kirimViaGateway(apiKey, settings, p.nomorWhatsApp, isi);
      await ctx.runMutation(internal.whatsapp._appendLog, {
        loanId: p.loanId,
        nomorTujuan: p.nomorWhatsApp,
        jenis: r.jenis,
        isiPesan: isi,
        status: hasil.ok ? "terkirim" : "gagal",
        respon: hasil.respon,
      });
      if (hasil.ok) terkirim += 1;
      else gagal += 1;
    }
    return { terkirim, gagal, tanpaNomor, jumlahRencana: rencana.length, alasan: "jalan" };
  },
});

/**
 * Kabar "pembayaran dicatat" untuk satu pinjaman — dijadwalkan `penagihan`
 * setelah petugas mencatat pembayaran nasabah diterima.
 *
 * Yang disebut pesan hanya apa yang benar-benar tercatat: nominal yang dicatat
 * petugas, bukan klaim bahwa transfer sudah diverifikasi bank.
 */
export const _kirimKonfirmasiPembayaran = internalAction({
  args: { loanId: v.id("loans"), jumlah: v.number() },
  handler: async (ctx, { loanId, jumlah }): Promise<{ status: string }> => {
    const data = await ctx.runQuery(internal.whatsapp._dataStatusPinjaman, { loanId });
    if (data === null) return { status: "tidak_ada" };
    if (!data.nomorWhatsApp) {
      await ctx.runMutation(internal.whatsapp._appendLog, {
        loanId,
        nomorTujuan: "-",
        jenis: "konfirmasi_pembayaran",
        isiPesan: "(tidak dikirim)",
        status: "tanpa_nomor",
        respon: "Peminjam belum punya nomor WhatsApp di data KYC.",
      });
      return { status: "tanpa_nomor" };
    }

    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const isi = rangkaiPesanWa(
      templateUntukJenis(settings, "konfirmasi_pembayaran", undefined),
      nilaiPesanPinjaman(data, {
        metodeBayar: await metodeBayarAction(ctx),
        sekarang: Date.now(),
        jumlahTampil: jumlah,
      }),
    ).isi;
    const hasil = await kirimPesanStatus(
      ctx,
      settings,
      data.nomorWhatsApp,
      isi,
      loanId,
      undefined,
      "konfirmasi_pembayaran",
    );
    return { status: hasil.status };
  },
});
