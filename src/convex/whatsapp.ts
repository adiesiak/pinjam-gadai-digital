import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { ROLES } from "./schema";
import { BULAN_MS, pelunasanPinjaman } from "../lib/loan";
import { hitungSimulasiBulanan } from "../lib/bulanan";
import { formatRupiah } from "../lib/money";

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
};

async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
  }
  return { userId, user };
}

async function getSettings(ctx: QueryCtx): Promise<WaSettings> {
  const row = await ctx.db
    .query("waSettings")
    .withIndex("by_slot", (q) => q.eq("slot", SLOT))
    .first();
  return row ?? {};
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
    templatePengingat: v.string(),
    /** Template peringatan lokasi — opsional, kosong = pakai template bawaan. */
    templateLokasi: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const apiUrl = args.apiUrl.trim();
    if (!/^https:\/\/.+/.test(apiUrl)) {
      throw new Error("Endpoint harus URL https yang valid.");
    }
    const authHeader = args.authHeader.trim();
    const fieldNomor = args.fieldNomor.trim();
    const fieldPesan = args.fieldPesan.trim();
    const template = args.templatePengingat.trim();
    if (!authHeader || !fieldNomor || !fieldPesan) {
      throw new Error("Nama header auth dan field body wajib diisi.");
    }
    if (!template.includes("{jumlah}")) {
      throw new Error("Template wajib memuat placeholder {jumlah}.");
    }
    // Template peringatan lokasi tidak menagih uang, jadi syaratnya beda:
    // cukup menyapa nama nasabah (dan boleh dikosongkan untuk pakai bawaan).
    const templateLokasi = args.templateLokasi?.trim() ?? "";
    if (templateLokasi !== "" && !templateLokasi.includes("{nama}")) {
      throw new Error("Template peringatan lokasi wajib memuat placeholder {nama}.");
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
      templatePengingat: template,
      templateLokasi: templateLokasi === "" ? undefined : templateLokasi,
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
      status: loan.status,
    };
  },
});

/** Ganti placeholder template dengan data pinjaman. */
export function renderTemplate(
  template: string,
  data: {
    nama: string;
    ref: string;
    jumlah: string;
    tanggal: string;
    sisa: string;
    denda: string;
  },
): string {
  return template
    .replace(/\{nama\}/g, data.nama)
    .replace(/\{ref\}/g, data.ref)
    .replace(/\{jumlah\}/g, data.jumlah)
    .replace(/\{tanggal\}/g, data.tanggal)
    .replace(/\{sisa\}/g, data.sisa)
    .replace(/\{denda\}/g, data.denda);
}

/** Data pesan dari pinjaman — satu sumber untuk preview & kirim. */
function pesanDariLoan(
  template: string,
  loan: {
    namaLengkap: string;
    nomorReferensi: string;
    pokokPinjaman: number;
    tenorHari?: number;
    tenorBulan?: number;
    didanaiPada?: number;
    status: string;
  },
  now: number,
): { isi: string; denda: number; total: number } {
  // Satu sumber kebenaran: skema harian (130%) dan skema bulanan sekaligus.
  const pelunasan = pelunasanPinjaman(loan, now);
  const totalKewajibanPenuh =
    loan.tenorBulan !== undefined
      ? hitungSimulasiBulanan(loan.pokokPinjaman, loan.tenorBulan).totalPengembalian
      : Math.round(loan.pokokPinjaman * 1.3);
  const total = pelunasan ? pelunasan.totalKewajibanDenganPenalti : totalKewajibanPenuh;
  const denda = pelunasan ? pelunasan.dendaTerlambat : 0;
  const jatuhTempo =
    loan.didanaiPada !== undefined
      ? pelunasan?.jatuhTempoPada ??
        loan.didanaiPada +
          (loan.tenorBulan !== undefined
            ? loan.tenorBulan * BULAN_MS
            : (loan.tenorHari ?? 30) * 86400000)
      : now;
  const tanggal = new Date(jatuhTempo).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dendaStr =
    denda > 0 ? ` (sudah termasuk denda ${formatRupiah(denda)})` : "";
  const isi = renderTemplate(template, {
    nama: loan.namaLengkap,
    ref: loan.nomorReferensi,
    jumlah: formatRupiah(total),
    tanggal,
    // Tenor skema bulanan tampil sebagai "6 bulan", skema harian "30 hari".
    sisa:
      loan.tenorBulan !== undefined
        ? `${loan.tenorBulan} bulan`
        : `${loan.tenorHari ?? 30} hari`,
    denda: dendaStr,
  });
  return { isi, denda, total };
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
      s.templatePengingat ?? DEFAULT_TEMPLATE,
      {
        namaLengkap: loan.namaLengkap,
        nomorReferensi: loan.nomorReferensi,
        pokokPinjaman: loan.pokokPinjaman,
        tenorHari: loan.tenorHari,
        tenorBulan: loan.tenorBulan,
        didanaiPada: loan.didanaiPada,
        status: loan.status,
      },
      Date.now(),
    );
    return isi;
  },
});

/** Kirim via gateway token-based. Tidak melempar — hasil dinilai pemanggil. */
async function kirimViaGateway(
  apiKey: string,
  settings: WaSettings,
  nomor: string,
  isi: string,
): Promise<{ ok: boolean; respon: string }> {
  const header = settings.authHeader ?? "Authorization";
  const prefix = settings.authPrefix ?? "";
  const body = JSON.stringify({
    [settings.fieldNomor ?? "target"]: nomor,
    [settings.fieldPesan ?? "message"]: isi,
  });
  try {
    const res = await fetch(settings.apiUrl ?? "", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [header]: `${prefix}${apiKey}`,
      },
      body,
    });
    const text = (await res.text()).slice(0, 500);
    return { ok: res.ok, respon: `HTTP ${res.status}: ${text}` };
  } catch (err) {
    return {
      ok: false,
      respon: err instanceof Error ? err.message : "Koneksi gagal",
    };
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
    const me = await ctx.runQuery(api.users.currentRole, {});
    if (me === null || me.role !== ROLES.ADMIN) {
      throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
    }

    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const loan = await ctx.runQuery(internal.whatsapp._loanForMessage, { loanId });
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (!loan.nomorWhatsApp) {
      throw new Error("Peminjam belum punya nomor WhatsApp (lengkapi KYC).");
    }

    const isi =
      isiPesan?.trim() ||
      pesanDariLoan(
        settings.templatePengingat ?? DEFAULT_TEMPLATE,
        {
          namaLengkap: loan.namaLengkap,
          nomorReferensi: loan.nomorReferensi,
          pokokPinjaman: loan.pokokPinjaman,
          tenorHari: loan.tenorHari,
          tenorBulan: loan.tenorBulan,
          didanaiPada: loan.didanaiPada,
          status: loan.status,
        },
        Date.now(),
      ).isi;

    const apiKey = process.env.WHATSAPP_API_KEY ?? "";
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
      jenis: "pengingat",
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

/** Kirim pesan uji ke nomor bebas (admin) — memastikan gateway benar. */
export const sendTest = action({
  args: { nomorTujuan: v.string(), isiPesan: v.string() },
  handler: async (ctx, { nomorTujuan, isiPesan }): Promise<{ ok: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const me = await ctx.runQuery(api.users.currentRole, {});
    if (me === null || me.role !== ROLES.ADMIN) {
      throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
    }
    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const apiKey = process.env.WHATSAPP_API_KEY ?? "";
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
      nama: sumber?.namaLengkap ?? user?.name ?? "Nasabah PINDAI",
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
    const template = settings.templateLokasi?.trim() || DEFAULT_TEMPLATE_LOKASI;
    const isi = renderTemplate(template, {
      nama: data.nama,
      ref: data.nomorReferensi ?? "—",
      jumlah: "—",
      tanggal: "—",
      sisa: "—",
      denda: "",
    });

    const apiKey = process.env.WHATSAPP_API_KEY ?? "";
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
