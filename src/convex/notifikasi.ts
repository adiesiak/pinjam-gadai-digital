import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { formatRupiahAman } from "../lib/money";

/**
 * Pusat notifikasi in-app PINDAI.
 *
 * RANCANGAN YANG SENGAJA DIPILIH
 *
 * Modul ini **tidak memiliki tabel notifikasi**. Daftarnya selalu DIHITUNG
 * ULANG dari data yang sudah ada di aplikasi:
 *
 * | Sumber                 | Jenis notifikasi        | Keadaan baca              |
 * | ---------------------- | ----------------------- | ------------------------- |
 * | `pengingat`            | info / peringatan / error | `notifikasiBaca`        |
 * | `lokasiPeringatan`     | peringatan              | `dibacaPada` (bawaan tabel)|
 * | `manualPaymentReceipts`| info / sukses / error   | `notifikasiBaca`          |
 * | `pengumuman` (CMS)     | info                    | `notifikasiBaca`          |
 *
 * Konsekuensinya penting dan disengaja:
 *
 * 1. **Tidak ada notifikasi palsu.** Kalau sumbernya tidak ada, notifikasinya
 *    tidak ada. Tidak ada baris "selamat datang" atau pesan contoh yang dibuat
 *    hanya supaya panelnya terlihat penuh.
 * 2. **Tidak ada klaim pengiriman.** Modul ini tidak mengirim WhatsApp, email,
 *    atau push. Status pengiriman WA yang pernah terjadi tetap dibaca dari
 *    `lokasiPeringatan.waStatus` dan dilaporkan apa adanya — bukan diasumsikan.
 * 3. **Tidak ada scheduler baru.** Notifikasi dibuat oleh proses yang sudah ada
 *    (cron pengingat, heuristik lokasi, pencocokan admin), bukan oleh modul ini.
 *
 * `notifikasiBaca` hanya menyimpan keadaan milik pengguna (kunci mana yang sudah
 * dibaca dan kapan). Untuk peringatan lokasi, keadaan baca tetap `dibacaPada`
 * pada tabelnya sendiri supaya banner dashboard dan pusat notifikasi tidak
 * pernah berbeda pendapat.
 */

export type NotifikasiJenis = "info" | "sukses" | "peringatan" | "error";

export type NotifikasiItem = {
  /** Identitas stabil sumber (mis. "pengingat:<id>") — dasar keadaan baca. */
  kunci: string;
  jenis: NotifikasiJenis;
  judul: string;
  ringkasan: string;
  /** Waktu menurut server (epoch ms) — dasar urutan. */
  waktu: number;
  /** Rute dalam aplikasi untuk membuka detail terkait. */
  tautan: string;
  dibaca: boolean;
};

/** Batas per sumber, supaya satu sumber tidak menelan seluruh daftar. */
const BATAS_PER_SUMBER = 6;
/** Batas total item yang dikirim ke klien. */
const BATAS_TOTAL = 18;
/** Batas pinjaman yang diperiksa pengingatnya (paling baru lebih dulu). */
const BATAS_PINJAMAN = 25;

/** Notifikasi beserta rujukan internalnya — dipakai untuk menandai dibaca. */
type ItemInternal = NotifikasiItem & {
  sumber: "pengingat" | "lokasi" | "bukti" | "pengumuman";
  /** Id baris sumber, bila sumbernya berbaris (pengingat/lokasi/bukti). */
  ref: string | null;
};

/** Sesi wajib: hanya pengguna masuk non-tamu yang punya notifikasi. */
async function requirePengguna(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk membuka notifikasi.",
    );
  }
  return { userId, user };
}

/** Label waktu relatif sebagai kalimat pengantar — bukan status, bukan janji. */
function kalimatWaktu(waktu: number, sekarang: number): string {
  const menit = Math.floor((sekarang - waktu) / 60_000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

/**
 * Bangun daftar notifikasi dari sumber aslinya.
 *
 * Dipakai baik oleh `daftar` (query) maupun oleh penanda dibaca (mutation),
 * sehingga kunci yang boleh ditandai SELALU sama dengan yang sedang terlihat
 * pengguna — tidak ada cara menandai notifikasi yang tidak pernah ada.
 */
async function susunNotifikasi(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ item: ItemInternal[]; belumDibaca: number }> {
  const sekarang = Date.now();
  const item: ItemInternal[] = [];

  // ===== Sumber 1: pengingat jatuh tempo (ditulis cron, bukan oleh modul ini)
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const pinjamanTerbaru = loans
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, BATAS_PINJAMAN);
  const referensiPinjaman = new Map<string, string>(
    pinjamanTerbaru.map((loan) => [loan._id, loan.nomorReferensi]),
  );

  const pengingatPerPinjaman = await Promise.all(
    pinjamanTerbaru.map((loan) =>
      ctx.db
        .query("pengingat")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect(),
    ),
  );
  const pengingat = pengingatPerPinjaman
    .flat()
    .sort((a, b) => b.waktu - a.waktu)
    .slice(0, BATAS_PER_SUMBER);

  for (const p of pengingat) {
    const referensi = referensiPinjaman.get(p.loanId) ?? "catatan pinjaman";
    const nominal = formatRupiahAman(p.jumlahKewajiban);
    const jenis: NotifikasiJenis =
      p.jenis === "terlambat" ? "error" : p.jenis === "jatuh_tempo" ? "peringatan" : "info";
    const judul =
      p.jenis === "terlambat"
        ? `Catatan pinjaman terlambat ${Math.abs(p.sisaHari)} hari`
        : p.jenis === "jatuh_tempo"
          ? "Jatuh tempo hari ini"
          : `Jatuh tempo ${p.sisaHari} hari lagi`;
    item.push({
      kunci: `pengingat:${p._id}`,
      sumber: "pengingat",
      ref: p._id,
      jenis,
      judul,
      ringkasan: `Pengingat internal untuk ${referensi} · kewajiban tercatat ${nominal} · ${kalimatWaktu(p.waktu, sekarang)}.`,
      waktu: p.waktu,
      tautan: "/dashboard?tab=jadwal",
      dibaca: false, // ditentukan di bawah dari tabel baca
    });
  }

  // ===== Sumber 2: peringatan pola koordinat (keadaan baca: `dibacaPada`)
  const peringatanLokasi = await ctx.db
    .query("lokasiPeringatan")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const w of peringatanLokasi.sort((a, b) => b.waktu - a.waktu).slice(0, BATAS_PER_SUMBER)) {
    const wa =
      w.waStatus === "terkirim"
        ? "Peringatan WhatsApp tercatat terkirim."
        : w.waStatus === "gagal"
          ? "Percobaan kirim WhatsApp tercatat gagal."
          : w.waStatus === "tanpa_nomor"
            ? "Belum ada nomor WhatsApp lengkap untuk diberi tahu."
            : "Belum ada catatan pengiriman WhatsApp.";
    item.push({
      kunci: `lokasi:${w._id}`,
      sumber: "lokasi",
      ref: w._id,
      jenis: "peringatan",
      judul: "Koordinat perangkat tercatat berulang",
      ringkasan: `Penanda otomatis pada ${w.tanda.join(", ") || "pola koordinat"} · ${wa} · ${kalimatWaktu(w.waktu, sekarang)}.`,
      waktu: w.waktu,
      tautan: "/dashboard",
      dibaca: w.dibacaPada !== undefined,
    });
  }

  // ===== Sumber 3: bukti pembayaran manual yang sudah dikirim nasabah
  const bukti = await ctx.db
    .query("manualPaymentReceipts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const r of bukti.sort((a, b) => b._creationTime - a._creationTime).slice(0, BATAS_PER_SUMBER)) {
    const jenis: NotifikasiJenis =
      r.status === "dicocokkan" ? "sukses" : r.status === "ditolak" ? "error" : "info";
    const judul =
      r.status === "dicocokkan"
        ? "Bukti pembayaran dicocokkan"
        : r.status === "ditolak"
          ? "Bukti pembayaran ditolak admin"
          : "Bukti pembayaran menunggu pencocokan";
    const catatan = r.catatanAdmin ? ` Catatan admin: ${r.catatanAdmin}` : "";
    item.push({
      kunci: `bukti:${r._id}`,
      sumber: "bukti",
      ref: r._id,
      jenis,
      judul,
      ringkasan: `Bukti ${formatRupiahAman(r.jumlah)} untuk ${r.nomorReferensi} · status ${r.status.replace(/_/g, " ")} · ${kalimatWaktu(r._creationTime, sekarang)}.${catatan}`,
      waktu: r.dicocokkanPada ?? r._creationTime,
      tautan: "/dashboard?tab=riwayat",
      dibaca: false,
    });
  }

  // ===== Sumber 4: pengumuman CMS (satu baris global)
  const pengumuman = await ctx.db
    .query("pengumuman")
    .withIndex("by_slot", (q) => q.eq("slot", "global"))
    .first();
  if (pengumuman !== null && pengumuman.aktif !== false && (pengumuman.teks ?? "").trim() !== "") {
    item.push({
      kunci: `pengumuman:${pengumuman.diperbaruiPada}`,
      sumber: "pengumuman",
      ref: null,
      jenis: "info",
      judul: "Pengumuman PINDAI",
      ringkasan: pengumuman.teks?.trim() ?? "",
      waktu: pengumuman.diperbaruiPada,
      // Tautan CMS dipakai hanya bila menunjuk rute internal aplikasi.
      tautan:
        pengumuman.tautan && pengumuman.tautan.startsWith("/")
          ? pengumuman.tautan
          : "/dashboard",
      dibaca: false,
    });
  }

  // ===== Keadaan baca untuk sumber yang memakai tabel `notifikasiBaca`
  const baca = await ctx.db
    .query("notifikasiBaca")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const sudahDibaca = new Set(baca.map((b) => b.kunci));

  const lengkap = item.map((it) =>
    it.sumber === "lokasi" ? it : { ...it, dibaca: sudahDibaca.has(it.kunci) },
  );

  // Urutan SELALU menurut waktu server, terbaru lebih dulu.
  const terurut = lengkap
    .sort((a, b) => b.waktu - a.waktu)
    .slice(0, BATAS_TOTAL);

  return {
    item: terurut,
    belumDibaca: terurut.filter((it) => !it.dibaca).length,
  };
}

/**
 * Daftar notifikasi pengguna yang sedang masuk, terurut menurut waktu server
 * (terbaru lebih dulu) dan dibatasi jumlahnya.
 */
export const daftar = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePengguna(ctx);
    const { item, belumDibaca } = await susunNotifikasi(ctx, userId);
    // `sumber`/`ref` adalah urusan internal — klien hanya perlu kuncinya.
    return {
      item: item.map(({ kunci, jenis, judul, ringkasan, waktu, tautan, dibaca }) => ({
        kunci,
        jenis,
        judul,
        ringkasan,
        waktu,
        tautan,
        dibaca,
      })),
      belumDibaca,
    };
  },
});

/** Satu notifikasi yang cocok dengan kunci pada daftar yang sedang berlaku. */
async function cariItem(
  ctx: QueryCtx,
  userId: Id<"users">,
  kunci: string,
): Promise<ItemInternal | null> {
  const { item } = await susunNotifikasi(ctx, userId);
  return item.find((it) => it.kunci === kunci) ?? null;
}

/**
 * Catat bahwa satu notifikasi sudah dibaca.
 *
 * Peringatan lokasi memakai kolom `dibacaPada` pada barisnya sendiri (sumber
 * yang sama dengan banner dashboard); sumber lain menulis satu baris
 * `notifikasiBaca`. Tidak ada pembaruan optimistis di klien: keadaan baca
 * berasal dari server, dan Convex menyiarkan hasilnya kembali.
 */
async function catatDibaca(
  ctx: MutationCtx,
  userId: Id<"users">,
  item: ItemInternal,
  sekarang: number,
): Promise<void> {
  if (item.sumber === "lokasi" && item.ref !== null) {
    const baris = await ctx.db.get(item.ref as Id<"lokasiPeringatan">);
    if (baris !== null && baris.dibacaPada === undefined) {
      await ctx.db.patch(baris._id, { dibacaPada: sekarang });
    }
    return;
  }
  const ada = await ctx.db
    .query("notifikasiBaca")
    .withIndex("by_user_kunci", (q) => q.eq("userId", userId).eq("kunci", item.kunci))
    .first();
  if (ada === null) {
    await ctx.db.insert("notifikasiBaca", {
      userId,
      kunci: item.kunci,
      sumber: item.sumber,
      dibacaPada: sekarang,
    });
  }
}

/** Tandai SATU notifikasi sebagai sudah dibaca. */
export const tandaiDibaca = mutation({
  args: { kunci: v.string() },
  handler: async (ctx, { kunci }) => {
    const { userId } = await requirePengguna(ctx);
    const item = await cariItem(ctx, userId, kunci);
    if (item === null) {
      // Kunci yang tidak (lagi) ada di daftar ditolak: klien yang basi tidak
      // boleh menumpuk baris baca untuk notifikasi yang sudah tidak berlaku.
      throw new Error("Notifikasi tidak ditemukan atau sudah tidak berlaku.");
    }
    if (item.dibaca) return { ok: true as const, sudahDibaca: true };
    await catatDibaca(ctx, userId, item, Date.now());
    return { ok: true as const, sudahDibaca: false };
  },
});

/**
 * Tandai SEMUA notifikasi yang sedang belum dibaca.
 *
 * Daftarnya dihitung server, bukan dikirim klien: klien tidak bisa menandai
 * notifikasi yang bukan miliknya, dan tidak ada notifikasi yang terlewat karena
 * daftar di layar sudah basi.
 */
export const tandaiSemuaDibaca = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePengguna(ctx);
    const { item } = await susunNotifikasi(ctx, userId);
    const sekarang = Date.now();
    let ditandai = 0;
    for (const it of item) {
      if (it.dibaca) continue;
      await catatDibaca(ctx, userId, it, sekarang);
      ditandai += 1;
    }
    return { ok: true as const, ditandai };
  },
});
